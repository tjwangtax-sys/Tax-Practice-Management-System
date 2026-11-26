import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { showToast } from './toast';

export interface ExportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export interface PdfExportOptions {
  orientation?: 'landscape' | 'portrait';
  filename?: string;
}

const SANDBOX_PRINT_BLOCKED_MSG =
  'Preview sandbox blocked printing — click Open in New Tab (↗) or use Export to PDF.';

function escapeHtml(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilenameBase(raw: string): string {
  const cleaned = (raw || 'TPMS_Export')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return cleaned || 'TPMS_Export';
}

/**
 * Triggers a sandbox-iframe-safe file download using URL.createObjectURL(blob)
 * on a temporary <a download="..."> element.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Exports rows to an Excel .xlsx workbook using SheetJS (xlsx) via Blob download.
 */
export function exportToExcel(
  filename: string,
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[]
): void {
  try {
    const header = columns.map((c) => c.label);
    const data = rows.map((row) =>
      columns.map((c) => {
        const val = row[c.key];
        return val === null || val === undefined ? '' : val;
      })
    );

    const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);

    worksheet['!cols'] = columns.map((c, idx) => {
      let maxLen = c.label.length + 2;
      for (const r of data) {
        const cellStr = String(r[idx] ?? '');
        if (cellStr.length + 2 > maxLen) {
          maxLen = Math.min(cellStr.length + 2, 42);
        }
      }
      return { wch: Math.max(10, maxLen) };
    });

    const workbook = XLSX.utils.book_new();
    const safeSheet = sheetName.replace(/[\\/?*[\]]/g, '').slice(0, 31) || 'Register';
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheet);

    const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerBlobDownload(blob, safeFilename);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Excel export failed: ${msg}`, 'error');
  }
}

/**
 * Generates a real A4 PDF file (landscape or portrait) directly using jsPDF with:
 * - Report title, filter summary, and timestamp
 * - Proportional column widths & wrapped cell text
 * - Repeating header row on every page
 * - Page numbers (Page X of Y)
 * Downloads via URL.createObjectURL(doc.output('blob')) so it works inside sandboxed iframes.
 */
export function exportTableToPdf(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  options: PdfExportOptions = {}
): void {
  try {
    const safeColumns: ExportColumn[] =
      columns.length > 0 ? columns : [{ key: 'value', label: 'Details' }];
    const orientation: 'landscape' | 'portrait' =
      options.orientation ?? (safeColumns.length >= 6 ? 'landscape' : 'portrait');

    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = orientation === 'landscape' ? 297 : 210;
    const pageHeight = orientation === 'landscape' ? 210 : 297;
    const marginX = 12;
    const marginTop = 12;
    const footerReserve = 12;
    const contentWidth = pageWidth - marginX * 2;
    const maxY = pageHeight - footerReserve;

    const generatedAt = new Date().toLocaleString('en-MY', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Compute proportional column widths based on header + sampled content lengths
    const sampleRows = rows.slice(0, 60);
    const weights = safeColumns.map((col) => {
      let maxChars = Math.max(col.label.length, 6);
      for (const r of sampleRows) {
        const s = r[col.key] === null || r[col.key] === undefined ? '' : String(r[col.key]);
        if (s.length > maxChars) maxChars = s.length;
      }
      return Math.min(Math.max(maxChars, 7), 34);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    const minColW = Math.min(14, contentWidth / safeColumns.length);
    const rawWidths = weights.map((w) => Math.max(minColW, (w / totalWeight) * contentWidth));
    const rawSum = rawWidths.reduce((a, b) => a + b, 0) || 1;
    const colWidths = rawWidths.map((w) => (w / rawSum) * contentWidth);

    const fontSize = safeColumns.length >= 12 ? 6.8 : safeColumns.length >= 8 ? 7.5 : 8.2;
    const lineHeight = fontSize * 0.44 + 0.9;
    const cellPadX = 1.6;
    const cellPadY = 1.5;

    let y = marginTop;

    const drawReportHeader = (isContinuation: boolean) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isContinuation ? 10 : 12.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Tax Practice Management System — ${title}`,
        marginX,
        y + (isContinuation ? 3.5 : 4.5)
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Generated: ${generatedAt}  |  Records: ${rows.length}`, pageWidth - marginX, y + 4, {
        align: 'right',
      });

      y += isContinuation ? 5.5 : 6.8;

      if (!isContinuation && subtitle) {
        const subLines = doc.splitTextToSize(subtitle, contentWidth);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(71, 85, 105);
        doc.text(subLines, marginX, y + 1.5);
        y += subLines.length * 3.8 + 1.5;
      }

      doc.setDrawColor(15, 118, 110);
      doc.setLineWidth(0.45);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 2.5;
    };

    const drawTableHeader = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);

      const headerWrapped = safeColumns.map((col, idx) =>
        doc.splitTextToSize(col.label, Math.max(4, colWidths[idx] - cellPadX * 2))
      );
      const maxLines = Math.max(1, ...headerWrapped.map((l) => l.length));
      const headerHeight = maxLines * lineHeight + cellPadY * 2;

      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.rect(marginX, y, contentWidth, headerHeight, 'FD');

      doc.setTextColor(15, 23, 42);
      let x = marginX;
      safeColumns.forEach((col, idx) => {
        if (idx > 0) {
          doc.line(x, y, x, y + headerHeight);
        }
        const lines = headerWrapped[idx];
        const align = col.align === 'right' ? 'right' : 'left';
        const textX = align === 'right' ? x + colWidths[idx] - cellPadX : x + cellPadX;
        lines.forEach((line: string, lineIdx: number) => {
          doc.text(line, textX, y + cellPadY + (lineIdx + 0.78) * lineHeight, { align });
        });
        x += colWidths[idx];
      });

      y += headerHeight;
    };

    drawReportHeader(false);
    drawTableHeader();

    if (rows.length === 0) {
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, y, contentWidth, 10, 'S');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('No records match current filters.', pageWidth / 2, y + 6.2, { align: 'center' });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);

      rows.forEach((row, rowIndex) => {
        const cellLines = safeColumns.map((col, idx) => {
          const rawVal = row[col.key];
          const text = rawVal === null || rawVal === undefined || rawVal === '' ? '—' : String(rawVal);
          return doc.splitTextToSize(text, Math.max(4, colWidths[idx] - cellPadX * 2));
        });

        const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
        const rowHeight = Math.min(maxLines * lineHeight + cellPadY * 2, maxY - marginTop - 25);

        if (y + rowHeight > maxY) {
          doc.addPage();
          y = marginTop;
          drawReportHeader(true);
          drawTableHeader();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fontSize);
        }

        if (rowIndex % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(marginX, y, contentWidth, rowHeight, 'F');
        }

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.18);
        doc.rect(marginX, y, contentWidth, rowHeight, 'S');

        doc.setTextColor(15, 23, 42);
        let x = marginX;
        safeColumns.forEach((col, idx) => {
          if (idx > 0) {
            doc.line(x, y, x, y + rowHeight);
          }
          const lines = cellLines[idx];
          const align = col.align === 'right' ? 'right' : 'left';
          const textX = align === 'right' ? x + colWidths[idx] - cellPadX : x + cellPadX;
          const maxFitLines = Math.max(1, Math.floor((rowHeight - cellPadY * 2) / lineHeight));
          lines.slice(0, maxFitLines).forEach((line: string, lineIdx: number) => {
            doc.text(line, textX, y + cellPadY + (lineIdx + 0.78) * lineHeight, { align });
          });
          x += colWidths[idx];
        });

        y += rowHeight;
      });
    }

    // Render page numbers (Page X of Y) across all pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(marginX, pageHeight - 9.5, pageWidth - marginX, pageHeight - 9.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Tax Practice Management System (Malaysia)', marginX, pageHeight - 5.5);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 5.5, {
        align: 'right',
      });
    }

    const filename =
      options.filename && options.filename.endsWith('.pdf')
        ? options.filename
        : `TPMS_${sanitizeFilenameBase(title)}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const blob = doc.output('blob');
    triggerBlobDownload(blob, filename);
    showToast(`Downloaded ${filename}`, 'success', 3200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`PDF export failed: ${msg}`, 'error');
  }
}

/**
 * Popup-free printing using a hidden iframe. Never calls window.open().
 * Detects sandbox-blocked print() calls and displays an actionable warning toast.
 */
export function printHtml(html: string): void {
  let iframe: HTMLIFrameElement | null = null;
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
    iframe = null;
  };

  try {
    iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const contentDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    const contentWin = iframe.contentWindow;
    if (!contentDoc || !contentWin) {
      cleanup();
      showToast(SANDBOX_PRINT_BLOCKED_MSG, 'warning', 7000);
      return;
    }

    let triggered = false;
    const runPrint = () => {
      if (triggered || !contentWin) return;
      triggered = true;

      let beforePrintFired = false;
      const onBeforePrint = () => {
        beforePrintFired = true;
      };
      const onAfterPrint = () => {
        window.setTimeout(cleanup, 300);
      };

      try {
        contentWin.addEventListener('beforeprint', onBeforePrint);
        contentWin.addEventListener('afterprint', onAfterPrint);
      } catch {
        // Ignore if cross-context listener fails
      }

      try {
        contentWin.focus();
        contentWin.print();
      } catch {
        cleanup();
        showToast(SANDBOX_PRINT_BLOCKED_MSG, 'warning', 7000);
        return;
      }

      // If running inside a sandboxed preview frame without allow-modals,
      // Chrome silently ignores print() and never fires beforeprint.
      window.setTimeout(() => {
        if (!beforePrintFired) {
          showToast(SANDBOX_PRINT_BLOCKED_MSG, 'warning', 7000);
          cleanup();
        }
      }, 250);

      // Safety fallback cleanup
      window.setTimeout(cleanup, 60000);
    };

    iframe.onload = runPrint;
    contentDoc.open();
    contentDoc.write(html);
    contentDoc.close();

    // Fallback in case onload does not fire after document.write() in some browsers
    window.setTimeout(runPrint, 250);
  } catch (err) {
    cleanup();
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`${SANDBOX_PRINT_BLOCKED_MSG} (${msg})`, 'warning', 7000);
  }
}

/**
 * Builds clean print HTML with @page CSS and prints via hidden iframe.
 */
export function printTable(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  orientation: 'landscape' | 'portrait' = columns.length >= 6 ? 'landscape' : 'portrait'
): void {
  const generatedAt = new Date().toLocaleString('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const theadCells = columns
    .map(
      (c) =>
        `<th style="${c.align === 'right' ? 'text-align:right;' : ''}">${escapeHtml(c.label)}</th>`
    )
    .join('');

  const tbodyRows =
    rows.length === 0
      ? `<tr><td colspan="${Math.max(1, columns.length)}" style="text-align:center;padding:16px;color:#64748b;">No records match current filters.</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>${columns
                .map(
                  (c) =>
                    `<td style="${c.align === 'right' ? 'text-align:right;font-variant-numeric:tabular-nums;' : ''}">${escapeHtml(
                      r[c.key] ?? '—'
                    )}</td>`
                )
                .join('')}</tr>`
          )
          .join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 9.5px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1.5px solid #0f766e;
      padding-bottom: 7px;
      margin-bottom: 10px;
    }
    .title { font-size: 14px; font-weight: 700; margin: 0; }
    .subtitle { font-size: 10px; color: #475569; margin: 2px 0 0 0; }
    .meta { text-align: right; font-size: 9px; color: #475569; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
      text-align: left;
      padding: 5px 6px;
      border: 1px solid #cbd5e1;
      font-size: 9px;
    }
    td {
      padding: 4.5px 6px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      word-break: break-word;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer {
      margin-top: 10px;
      font-size: 8.5px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p class="title">Tax Practice Management System — ${escapeHtml(title)}</p>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
    </div>
    <div class="meta">
      <div>Generated: ${escapeHtml(generatedAt)}</div>
      <div>Total Records: ${rows.length}</div>
    </div>
  </div>
  <table>
    <thead><tr>${theadCells}</tr></thead>
    <tbody>${tbodyRows}</tbody>
  </table>
  <div class="footer">
    <span>Tax Practice Management System (Malaysia)</span>
    <span>Confidential Practice Register</span>
  </div>
</body>
</html>`;

  printHtml(html);
}

/**
 * Unified helper used across all registers:
 * - When mode === 'pdf' (or boolean true): directly generates & downloads a real A4 PDF file via jsPDF.
 * - When mode === 'print' (or boolean false): prints cleanly via hidden iframe with sandbox-block detection.
 */
export function printRegisterHtml(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  pdfMode: boolean | 'pdf' | 'print' = false
): void {
  const isPdf = pdfMode === true || pdfMode === 'pdf';
  if (isPdf) {
    exportTableToPdf(title, subtitle, columns, rows);
  } else {
    printTable(title, subtitle, columns, rows);
  }
}

export const printCurrentTable = printRegisterHtml;
