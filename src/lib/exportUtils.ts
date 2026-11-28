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
  fontSize?: number;
  columnWidthHints?: Record<string, number>;
  styledPills?: boolean;
}

interface PdfPillStyle {
  fill: [number, number, number];
  border: [number, number, number];
  text: [number, number, number];
}

function resolvePdfPillStyle(rawLine: string): PdfPillStyle | null {
  const s = rawLine.trim();
  if (!s) return null;
  if (/^overdue\s+\d+d$/i.test(s) || /^overdue$/i.test(s)) {
    return { fill: [254, 226, 226], border: [252, 165, 165], text: [185, 28, 28] };
  }
  const lower = s.toLowerCase();
  if (lower === 'normal') {
    return { fill: [240, 253, 250], border: [153, 246, 228], text: [17, 94, 89] };
  }
  if (lower === '1st eot') {
    return { fill: [224, 242, 254], border: [125, 211, 252], text: [3, 105, 161] };
  }
  if (lower === '2nd eot') {
    return { fill: [254, 243, 199], border: [252, 211, 77], text: [180, 83, 9] };
  }
  if (lower === '3rd eot') {
    return { fill: [243, 232, 255], border: [216, 180, 254], text: [126, 34, 206] };
  }
  if (lower === 'submitted' || lower === 'self-submit' || lower === 'self submit') {
    return { fill: [209, 250, 229], border: [110, 231, 183], text: [4, 120, 87] };
  }
  if (lower === 'completed') {
    return { fill: [254, 240, 138], border: [202, 138, 4], text: [161, 98, 7] };
  }
  if (lower === 'pending mitrs') {
    return { fill: [224, 242, 254], border: [186, 230, 253], text: [3, 105, 161] };
  }
  if (lower === 'in progress') {
    return { fill: [224, 242, 254], border: [186, 230, 253], text: [3, 105, 161] };
  }
  if (lower === 'manager review') {
    return { fill: [254, 243, 199], border: [253, 230, 138], text: [180, 83, 9] };
  }
  if (lower === 'client approval') {
    return { fill: [237, 233, 254], border: [221, 214, 254], text: [109, 40, 217] };
  }
  if (lower === 'prepared') {
    return { fill: [224, 231, 255], border: [199, 210, 254], text: [67, 56, 202] };
  }
  if (lower === 'pending' || lower === 'not started' || lower === 'pending docs' || lower === 'on hold') {
    return { fill: [241, 245, 249], border: [203, 213, 225], text: [71, 85, 105] };
  }
  if (lower === '1st' || lower === '1st ya') {
    return { fill: [224, 242, 254], border: [186, 230, 253], text: [3, 105, 161] };
  }
  if (lower === '2nd' || lower === '2nd ya') {
    return { fill: [224, 231, 255], border: [199, 210, 254], text: [67, 56, 202] };
  }
  if (lower === '3rd' || lower === '3rd ya') {
    return { fill: [237, 233, 254], border: [221, 214, 254], text: [109, 40, 217] };
  }
  if (lower === 'audited') {
    return { fill: [224, 242, 254], border: [186, 230, 253], text: [3, 105, 161] };
  }
  if (lower === 'unaudited') {
    return { fill: [254, 243, 199], border: [253, 230, 138], text: [180, 83, 9] };
  }
  if (lower === 'epc') {
    return { fill: [243, 232, 255], border: [216, 180, 254], text: [126, 34, 206] };
  }
  return null;
}

function getHtmlPrintPillCss(rawLine: string): string | null {
  const pill = resolvePdfPillStyle(rawLine);
  if (!pill) return null;
  const bg = `rgb(${pill.fill.join(',')})`;
  const border = `rgb(${pill.border.join(',')})`;
  const color = `rgb(${pill.text.join(',')})`;
  return `display:inline-block;padding:1px 4px;border-radius:3px;font-size:7.5px;font-weight:700;line-height:1.2;background:${bg};border:0.75px solid ${border};color:${color};margin-top:2px;white-space:nowrap;`;
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
        let val = row[c.key];
        if (
          c.key === 'fye' &&
          (val === null || val === undefined || String(val).trim() === '')
        ) {
          val = row.companyFye || '-';
        }
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

export interface MultiSheetExportTab {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

/**
 * Exports multiple named worksheet tabs into a single Excel (.xlsx) workbook
 * using SheetJS (xlsx) via Blob download. Preserves exact tab names and column
 * headers so backups can be re-imported directly.
 */
export function exportMultiSheetExcel(
  filename: string,
  tabs: MultiSheetExportTab[]
): { sheetCount: number; totalRows: number } {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  let totalRows = 0;

  for (const tab of tabs) {
    const matrix = tab.rows.map((row) =>
      tab.headers.map((header) => {
        const val = row[header];
        return val === null || val === undefined ? '' : val;
      })
    );
    totalRows += tab.rows.length;

    const worksheet = XLSX.utils.aoa_to_sheet([tab.headers, ...matrix]);

    // Sample up to 300 rows per sheet for crisp column sizing without slowing down huge backups
    const sampleRows = matrix.length > 300 ? matrix.slice(0, 300) : matrix;
    worksheet['!cols'] = tab.headers.map((header, idx) => {
      let maxLen = header.length + 3;
      for (const r of sampleRows) {
        const cellStr = String(r[idx] ?? '');
        if (cellStr.length + 2 > maxLen) {
          maxLen = Math.min(cellStr.length + 2, 46);
        }
      }
      return { wch: Math.max(12, maxLen) };
    });

    const baseName = tab.sheetName.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31) || 'Sheet';
    let safeSheet = baseName;
    let suffix = 2;
    while (usedNames.has(safeSheet.toLowerCase())) {
      const tag = `_${suffix}`;
      safeSheet = `${baseName.slice(0, 31 - tag.length)}${tag}`;
      suffix += 1;
    }
    usedNames.add(safeSheet.toLowerCase());

    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheet);
  }

  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, safeFilename);

  return { sheetCount: tabs.length, totalRows };
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
    const marginX = orientation === 'landscape' ? 8 : 11;
    const marginTop = orientation === 'landscape' ? 8 : 11;
    const footerReserve = orientation === 'landscape' ? 9 : 11;
    const contentWidth = pageWidth - marginX * 2;
    const maxY = pageHeight - footerReserve;

    const generatedAt = new Date().toLocaleString('en-MY', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Compute proportional column widths using explicit hints or per-line sampled lengths
    const sampleRows = rows.slice(0, 80);
    const widthHints = options.columnWidthHints || {};
    const weights = safeColumns.map((col) => {
      if (typeof widthHints[col.key] === 'number' && widthHints[col.key] > 0) {
        return widthHints[col.key];
      }
      let maxChars = Math.max(col.label.length, 6);
      for (const r of sampleRows) {
        const raw = r[col.key] === null || r[col.key] === undefined ? '' : String(r[col.key]);
        const segments = raw.split('\n');
        for (const seg of segments) {
          if (seg.length > maxChars) maxChars = seg.length;
        }
      }
      return Math.min(Math.max(maxChars, 7), 30);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    const minColW = Math.min(11, contentWidth / safeColumns.length);
    const rawWidths = weights.map((w) => Math.max(minColW, (w / totalWeight) * contentWidth));
    const rawSum = rawWidths.reduce((a, b) => a + b, 0) || 1;
    const colWidths = rawWidths.map((w) => (w / rawSum) * contentWidth);

    const fontSize =
      options.fontSize ??
      (orientation === 'landscape' ? 7.5 : safeColumns.length >= 8 ? 7.5 : 8.2);
    const lineHeight = fontSize * 0.41 + 0.08; // ~3.15mm at 7.5pt -> ~25 rows/page on Landscape A4
    const cellPadX = 1.3;
    const cellPadY = 0.85;
    const useStyledPills = options.styledPills !== false;

    let y = marginTop;

    const drawReportHeader = (isContinuation: boolean) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isContinuation ? 9.5 : 11.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Tax Practice Management System — ${title}`,
        marginX,
        y + (isContinuation ? 3.2 : 4.0)
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(71, 85, 105);
      doc.text(`Generated: ${generatedAt}  |  Records: ${rows.length}`, pageWidth - marginX, y + 3.6, {
        align: 'right',
      });

      y += isContinuation ? 4.8 : 5.8;

      if (!isContinuation && subtitle) {
        const subLines = doc.splitTextToSize(subtitle, contentWidth) as string[];
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        doc.setTextColor(71, 85, 105);
        doc.text(subLines, marginX, y + 1.2);
        y += subLines.length * 3.3 + 1.1;
      }

      doc.setDrawColor(15, 118, 110);
      doc.setLineWidth(0.45);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 2.0;
    };

    const drawTableHeader = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);

      const headerWrapped = safeColumns.map((col, idx) =>
        doc.splitTextToSize(col.label, Math.max(4, colWidths[idx] - cellPadX * 2)) as string[]
      );
      const maxLines = Math.max(1, ...headerWrapped.map((l) => l.length));
      const headerHeight = maxLines * lineHeight + cellPadY * 2 + 0.4;

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
          doc.text(line, textX, y + cellPadY + 0.2 + (lineIdx + 0.78) * lineHeight, { align });
        });
        x += colWidths[idx];
      });

      y += headerHeight;
    };

    drawReportHeader(false);
    drawTableHeader();

    if (rows.length === 0) {
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, y, contentWidth, 9, 'S');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('No records match current filters.', pageWidth / 2, y + 5.6, { align: 'center' });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);

      const maxRowHeight = maxY - marginTop - 16;

      rows.forEach((row, rowIndex) => {
        const cellLines = safeColumns.map((col, idx) => {
          let rawVal = row[col.key];
          if (
            col.key === 'fye' &&
            (rawVal === null || rawVal === undefined || String(rawVal).trim() === '')
          ) {
            rawVal = row.companyFye || '-';
          }
          const text =
            rawVal === null || rawVal === undefined || rawVal === '' ? '-' : String(rawVal);
          const usableW = Math.max(4, colWidths[idx] - cellPadX * 2);
          const paragraphs = text.split('\n');
          const wrapped: string[] = [];
          for (const para of paragraphs) {
            const trimmed = para.trim();
            if (!trimmed) continue;
            if (useStyledPills && resolvePdfPillStyle(trimmed)) {
              // Keep short pill badges intact on their own line so stage / Overdue Nd never split mid-word
              wrapped.push(trimmed);
            } else {
              const split = doc.splitTextToSize(trimmed, usableW) as string[];
              wrapped.push(...split);
            }
          }
          return wrapped.length > 0 ? wrapped : ['-'];
        });

        const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
        const rowHeight = Math.min(maxLines * lineHeight + cellPadY * 2, maxRowHeight);

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
        doc.setLineWidth(0.16);
        doc.rect(marginX, y, contentWidth, rowHeight, 'S');

        let x = marginX;
        safeColumns.forEach((col, idx) => {
          if (idx > 0) {
            doc.setDrawColor(226, 232, 240);
            doc.line(x, y, x, y + rowHeight);
          }
          const lines = cellLines[idx];
          const align = col.align === 'right' ? 'right' : 'left';
          const maxFitLines = Math.max(1, Math.round((rowHeight - cellPadY * 2) / lineHeight));

          lines.slice(0, maxFitLines).forEach((line: string, lineIdx: number) => {
            const pillStyle = useStyledPills ? resolvePdfPillStyle(line) : null;
            const lineTopY = y + cellPadY + lineIdx * lineHeight;

            if (pillStyle) {
              const maxPillW = Math.max(4, colWidths[idx] - cellPadX * 2);
              let pillFontSize = Math.max(6.0, fontSize - 1.1);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(pillFontSize);
              let textW = doc.getTextWidth(line);
              // Gently scale down font only if a long pill (e.g. Overdue 1063d) exceeds narrow column width
              if (textW + 1.8 > maxPillW && textW > 0) {
                pillFontSize = Math.max(5.2, pillFontSize * ((maxPillW - 1.8) / textW));
                doc.setFontSize(pillFontSize);
                textW = doc.getTextWidth(line);
              }
              const pillW = Math.min(maxPillW, textW + 2.0);
              const pillH = Math.max(2.6, lineHeight - 0.35);
              const pillX =
                align === 'right'
                  ? x + colWidths[idx] - cellPadX - pillW
                  : x + cellPadX;
              const pillY = lineTopY + 0.25;

              doc.setFillColor(pillStyle.fill[0], pillStyle.fill[1], pillStyle.fill[2]);
              doc.setDrawColor(pillStyle.border[0], pillStyle.border[1], pillStyle.border[2]);
              doc.setLineWidth(0.14);
              doc.roundedRect(pillX, pillY, pillW, pillH, 0.7, 0.7, 'FD');

              doc.setTextColor(pillStyle.text[0], pillStyle.text[1], pillStyle.text[2]);
              doc.text(line, pillX + pillW / 2, pillY + pillH - 0.65, {
                align: 'center',
              });
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(fontSize);
            } else {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(fontSize);
              doc.setTextColor(15, 23, 42);
              const textX = align === 'right' ? x + colWidths[idx] - cellPadX : x + cellPadX;
              doc.text(line, textX, lineTopY + 0.78 * lineHeight, { align });
            }
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

  const formatPrintCellHtml = (val: unknown): string => {
    const raw = val === null || val === undefined || val === '' ? '—' : String(val);
    if (!raw.includes('\n')) {
      const pillCss = getHtmlPrintPillCss(raw);
      return pillCss ? `<span style="${pillCss}">${escapeHtml(raw)}</span>` : escapeHtml(raw);
    }
    const parts = raw
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return '—';
    return parts
      .map((part) => {
        const pillCss = getHtmlPrintPillCss(part);
        if (pillCss) {
          return `<div><span style="${pillCss}">${escapeHtml(part)}</span></div>`;
        }
        return `<div>${escapeHtml(part)}</div>`;
      })
      .join('');
  };

  const tbodyRows =
    rows.length === 0
      ? `<tr><td colspan="${Math.max(1, columns.length)}" style="text-align:center;padding:16px;color:#64748b;">No records match current filters.</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>${columns
                .map(
                  (c) =>
                    `<td style="${c.align === 'right' ? 'text-align:right;font-variant-numeric:tabular-nums;' : ''}">${formatPrintCellHtml(
                      r[c.key]
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

export interface PrintTableSectionSpec {
  heading: string;
  subtitle: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  emptyMessage?: string;
  pageBreakBefore?: boolean;
  badgeColumnKey?: string;
  badgeColorKey?: string;
}

export function buildPrintTableSectionCss(): string {
  return `
    .break-before-page {
      break-before: page;
      page-break-before: always;
    }
    .register-section {
      padding-top: 2px;
    }
    .register-header {
      border-bottom: 1.5px solid #0f766e;
      padding-bottom: 5px;
      margin-bottom: 8px;
    }
    .register-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .register-subtitle {
      font-size: 8.8px;
      color: #475569;
      margin: 2px 0 0 0;
    }
    table.register-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 8.2px;
    }
    table.register-table thead { display: table-header-group; }
    table.register-table tr { page-break-inside: avoid; }
    table.register-table th {
      background: #f1f5f9 !important;
      color: #0f172a !important;
      font-weight: 700;
      text-align: left;
      padding: 4.5px 6px;
      border: 0.75px solid #cbd5e1 !important;
      font-size: 8px;
      line-height: 1.25;
    }
    table.register-table td {
      padding: 4px 6px;
      border: 0.75px solid #e2e8f0 !important;
      vertical-align: top;
      color: #0f172a;
      line-height: 1.3;
      word-break: break-word;
      background: #ffffff;
    }
    table.register-table tbody tr:nth-child(even) td {
      background: #f8fafc;
    }
    .register-badge-wrap {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
    }
    .register-swatch {
      width: 7px;
      height: 7px;
      border-radius: 2px;
      border: 0.5px solid rgba(15,23,42,0.25);
      display: inline-block;
      flex-shrink: 0;
    }
  `;
}

export function buildPrintTableSectionHtml(
  spec: PrintTableSectionSpec,
  colWidthsPct?: string[]
): string {
  const colgroup =
    colWidthsPct && colWidthsPct.length === spec.columns.length
      ? `<colgroup>${colWidthsPct.map((w) => `<col style="width:${w};" />`).join('')}</colgroup>`
      : '';

  const theadCells = spec.columns
    .map(
      (c) =>
        `<th style="${c.align === 'right' ? 'text-align:right;' : ''}">${escapeHtml(c.label)}</th>`
    )
    .join('');

  const tbodyRows =
    spec.rows.length === 0
      ? `<tr><td colspan="${Math.max(1, spec.columns.length)}" style="text-align:center;padding:16px;color:#64748b;font-style:italic;">${escapeHtml(
          spec.emptyMessage || 'No matching events for the selected period.'
        )}</td></tr>`
      : spec.rows
          .map((row) => {
            const cells = spec.columns
              .map((c) => {
                const rawVal = row[c.key];
                const text =
                  rawVal === null || rawVal === undefined || rawVal === '' ? '-' : String(rawVal);
                const alignStyle =
                  c.align === 'right'
                    ? 'text-align:right;font-variant-numeric:tabular-nums;'
                    : '';
                if (spec.badgeColumnKey && c.key === spec.badgeColumnKey) {
                  const swatchColor =
                    spec.badgeColorKey && row[spec.badgeColorKey]
                      ? String(row[spec.badgeColorKey])
                      : '#94a3b8';
                  return `<td style="${alignStyle}"><span class="register-badge-wrap"><span class="register-swatch" style="background:${escapeHtml(
                    swatchColor
                  )};"></span><span>${escapeHtml(text)}</span></span></td>`;
                }
                return `<td style="${alignStyle}">${escapeHtml(text)}</td>`;
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');

  const breakCls = spec.pageBreakBefore !== false ? ' break-before-page' : '';
  return `<section class="register-section${breakCls}">
    <div class="register-header">
      <p class="register-title">${escapeHtml(spec.heading)}</p>
      <p class="register-subtitle">${escapeHtml(spec.subtitle)}</p>
    </div>
    <table class="register-table">
      ${colgroup}
      <thead><tr>${theadCells}</tr></thead>
      <tbody>${tbodyRows}</tbody>
    </table>
  </section>`;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length !== 6) return [148, 163, 184];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [148, 163, 184];
  return [r, g, b];
}

/**
 * Appends a structured multi-page table section (e.g. Complete Event Register)
 * onto an existing jsPDF document, starting on a new page by default.
 */
export function appendPdfTableSection(
  doc: jsPDF,
  spec: PrintTableSectionSpec,
  options: {
    marginX?: number;
    marginTop?: number;
    footerReserve?: number;
    columnWeights?: number[];
  } = {}
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = options.marginX ?? 8;
  const marginTop = options.marginTop ?? 9;
  const footerReserve = options.footerReserve ?? 11;
  const contentWidth = pageWidth - marginX * 2;
  const maxY = pageHeight - footerReserve;

  if (spec.pageBreakBefore !== false) {
    doc.addPage();
  }

  const safeColumns: ExportColumn[] =
    spec.columns.length > 0 ? spec.columns : [{ key: 'value', label: 'Details' }];

  const weights =
    options.columnWeights && options.columnWeights.length === safeColumns.length
      ? options.columnWeights
      : safeColumns.map(() => 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const colWidths = weights.map((w) => (w / totalWeight) * contentWidth);

  const fontSize = 7.4;
  const lineHeight = 3.6;
  const cellPadX = 1.6;
  const cellPadY = 1.4;

  let y = marginTop;

  const drawSectionHeader = (isContinuation: boolean) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isContinuation ? 9.5 : 11);
    doc.setTextColor(15, 23, 42);
    doc.text(
      isContinuation ? `${spec.heading} (Continued)` : spec.heading,
      marginX,
      y + 3.8
    );
    y += isContinuation ? 5.2 : 5.8;

    if (!isContinuation && spec.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(71, 85, 105);
      const subLines = doc.splitTextToSize(spec.subtitle, contentWidth) as string[];
      doc.text(subLines, marginX, y + 1.2);
      y += subLines.length * 3.4 + 1.4;
    }

    doc.setDrawColor(15, 118, 110);
    doc.setLineWidth(0.45);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 2.2;
  };

  const drawTableHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    const headerWrapped = safeColumns.map((col, idx) =>
      doc.splitTextToSize(col.label, Math.max(4, colWidths[idx] - cellPadX * 2)) as string[]
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
      if (idx > 0) doc.line(x, y, x, y + headerHeight);
      const lines = headerWrapped[idx];
      const align = col.align === 'right' ? 'right' : 'left';
      const textX = align === 'right' ? x + colWidths[idx] - cellPadX : x + cellPadX;
      lines.forEach((line, lIdx) => {
        doc.text(line, textX, y + cellPadY + (lIdx + 0.78) * lineHeight, { align });
      });
      x += colWidths[idx];
    });
    y += headerHeight;
  };

  drawSectionHeader(false);
  drawTableHeader();

  if (spec.rows.length === 0) {
    doc.setDrawColor(226, 232, 240);
    doc.rect(marginX, y, contentWidth, 9.5, 'S');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      spec.emptyMessage || 'No matching events for the selected period.',
      pageWidth / 2,
      y + 5.8,
      { align: 'center' }
    );
    return;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  spec.rows.forEach((row, rowIndex) => {
    const cellLines = safeColumns.map((col, idx) => {
      const rawVal = row[col.key];
      const text =
        rawVal === null || rawVal === undefined || rawVal === '' ? '-' : String(rawVal);
      const swatchReserve = spec.badgeColumnKey === col.key ? 3.4 : 0;
      return doc.splitTextToSize(
        text,
        Math.max(4, colWidths[idx] - cellPadX * 2 - swatchReserve)
      ) as string[];
    });

    const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
    const rowHeight = Math.min(maxLines * lineHeight + cellPadY * 2, maxY - marginTop - 22);

    if (y + rowHeight > maxY) {
      doc.addPage();
      y = marginTop;
      drawSectionHeader(true);
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

    let x = marginX;
    safeColumns.forEach((col, idx) => {
      if (idx > 0) {
        doc.setDrawColor(226, 232, 240);
        doc.line(x, y, x, y + rowHeight);
      }

      const isBadgeCol = spec.badgeColumnKey === col.key;
      let textOffsetX = 0;
      if (isBadgeCol) {
        const swatchHex =
          spec.badgeColorKey && row[spec.badgeColorKey]
            ? String(row[spec.badgeColorKey])
            : '#94a3b8';
        const [r, g, b] = parseHexRgb(swatchHex);
        doc.setFillColor(r, g, b);
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.12);
        doc.rect(x + cellPadX, y + cellPadY + 0.6, 2.2, 2.2, 'FD');
        textOffsetX = 3.2;
      }

      doc.setFont('helvetica', isBadgeCol ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(15, 23, 42);

      const lines = cellLines[idx];
      const align = col.align === 'right' ? 'right' : 'left';
      const textX =
        align === 'right' ? x + colWidths[idx] - cellPadX : x + cellPadX + textOffsetX;
      const maxFitLines = Math.max(1, Math.floor((rowHeight - cellPadY * 2) / lineHeight));
      lines.slice(0, maxFitLines).forEach((line, lIdx) => {
        doc.text(line, textX, y + cellPadY + (lIdx + 0.78) * lineHeight, { align });
      });

      x += colWidths[idx];
    });

    y += rowHeight;
  });
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
