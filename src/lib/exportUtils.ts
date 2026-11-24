import * as XLSX from 'xlsx';

export interface ExportColumn {
  key: string;
  label: string;
}

function escapeHtml(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Exports rows to an Excel .xlsx workbook using SheetJS (xlsx).
 */
export function exportToExcel(
  filename: string,
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[]
): void {
  const header = columns.map((c) => c.label);
  const data = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.key];
      return val === null || val === undefined ? '' : val;
    })
  );

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Auto-calculate column widths
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
  XLSX.writeFile(workbook, safeFilename);
}

/**
 * Prints or triggers "Save as PDF" via a hidden sandboxed iframe so it never relies on window.open().
 */
export function printRegisterHtml(
  title: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  pdfHint = false
): void {
  const generatedAt = new Date().toLocaleString('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const theadCells = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const tbodyRows =
    rows.length === 0
      ? `<tr><td colspan="${columns.length}" style="text-align:center;padding:16px;color:#64748b;">No records match current filters.</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>${columns
                .map((c) => `<td>${escapeHtml(r[c.key])}</td>`)
                .join('')}</tr>`
          )
          .join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}${pdfHint ? ' - PDF Export' : ''}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 10px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .title { font-size: 16px; font-weight: 700; margin: 0; }
    .subtitle { font-size: 11px; color: #475569; margin: 2px 0 0 0; }
    .meta { text-align: right; font-size: 9px; color: #475569; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
      text-align: left;
      padding: 6px 7px;
      border: 1px solid #cbd5e1;
      white-space: nowrap;
      font-size: 9.5px;
    }
    td {
      padding: 5px 7px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      word-break: break-word;
    }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer {
      margin-top: 10px;
      font-size: 9px;
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
    <span>${pdfHint ? 'Select "Save as PDF" as destination in the print dialog.' : 'Confidential Practice Register'}</span>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    }
  }, 250);
}
