import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { formatCurrencyRM, WorkDoneRecord } from '../../types/tpms';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';
import { triggerBlobDownload } from '../../lib/exportUtils';
import { showToast } from '../../lib/toast';

function formatOptionalRM(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return formatCurrencyRM(val);
}

/**
 * Generates an A4 portrait jsPDF document for a Work Done & Finance record
 * (formatted as a clean Tax Practice Work Done & Fee Summary / Billing Advice).
 */
export function generateWorkDonePdfDoc(record: WorkDoneRecord): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 20) {
      doc.addPage();
      y = 18;
    }
  };

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, contentWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TAX PRACTICE MANAGEMENT SYSTEM', margin + 5, y + 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    record.workDoneStatus === 'Invoiced'
      ? 'WORK DONE REPORT & INVOICE SUMMARY'
      : 'WORK DONE & FEE BILLING SUMMARY',
    margin + 5,
    y + 15
  );

  // Right-aligned Document Reference in Header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(record.workDoneId || record.id, pageWidth - margin - 5, y + 9, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated: ${formatDateDDMMYYYY(new Date())}`,
    pageWidth - margin - 5,
    y + 15,
    { align: 'right' }
  );

  y += 28;

  // Status & Billing Metadata Strip
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 16, 1.5, 1.5, 'FD');

  const metaCols = [
    { label: 'WORK DONE STATUS', value: record.workDoneStatus || '—' },
    { label: 'FINANCE STATUS', value: record.financeInvoiceStatus || '—' },
    { label: 'INVOICE NO.', value: record.invoiceNo || '—' },
    { label: 'ISSUE DATE', value: record.issueDate ? formatDateDDMMYYYY(record.issueDate) : '—' },
  ];
  const metaColW = contentWidth / 4;
  metaCols.forEach((col, idx) => {
    const cx = margin + idx * metaColW + 3.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(col.label, cx, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const valLines = doc.splitTextToSize(col.value, metaColW - 6);
    doc.text(valLines[0] || '—', cx, y + 11.5);
  });

  y += 22;

  // Section 1: Client & Job Engagement Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 118, 110); // teal-700
  doc.text('1. ENGAGEMENT & CLIENT DETAILS', margin, y);
  y += 2;
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  const detailPairs: Array<[string, string, string, string]> = [
    ['Client Name', record.clientName || '—', 'Client ID', record.clientId || '—'],
    ['Job Reference', record.jobId || '—', 'Job Type', record.jobType || '—'],
    ['Year of Assessment', record.ya || '—', 'Job Status', record.jobStatus || '—'],
    ['Person In Charge (PIC)', record.pic || '—', 'Reviewer', record.reviewer || '—'],
    ['Pricing Mode', record.pricingMode || 'Overall Fee', 'Audit Fee (Ref)', formatOptionalRM(record.auditFee)],
  ];

  doc.setLineWidth(0.2);
  detailPairs.forEach(([l1, v1, l2, v2]) => {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(l1, margin, y);
    doc.text(l2, margin + contentWidth / 2 + 2, y);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const v1Text = doc.splitTextToSize(v1, contentWidth / 2 - 38);
    const v2Text = doc.splitTextToSize(v2, contentWidth / 2 - 34);
    doc.text(v1Text[0] || '—', margin + 36, y);
    doc.text(v2Text[0] || '—', margin + contentWidth / 2 + 34, y);
    y += 6;
  });

  y += 4;

  // Section 2: Scope of Work Done & Fee Allocation
  ensureSpace(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 118, 110);
  doc.text('2. SCOPE OF WORK DONE', margin, y);
  y += 2;
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  const nonEmptyLines = (record.workDoneDescription || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (record.pricingMode === 'Individual Allocation' && record.feeAllocations.length > 0) {
    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y - 3.5, contentWidth, 7, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('#', margin + 2.5, y + 1);
    doc.text('Work Done Description', margin + 11, y + 1);
    doc.text('Allocated Fee (RM)', pageWidth - margin - 3, y + 1, { align: 'right' });
    y += 7;

    record.feeAllocations.forEach((alloc, idx) => {
      const descLines = doc.splitTextToSize(alloc.description || '—', contentWidth - 48);
      const rowHeight = Math.max(7, descLines.length * 4.5 + 2.5);
      ensureSpace(rowHeight + 2);

      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + rowHeight - 3.5, pageWidth - margin, y + rowHeight - 3.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      doc.text(String(alloc.lineNo || idx + 1), margin + 2.5, y + 0.8);

      doc.setTextColor(15, 23, 42);
      doc.text(descLines, margin + 11, y + 0.8);

      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrencyRM(alloc.fee), pageWidth - margin - 3, y + 0.8, { align: 'right' });
      y += rowHeight;
    });
  } else {
    // Overall Fee multi-line description box
    if (nonEmptyLines.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text('No work done description recorded.', margin, y + 1);
      y += 7;
    } else {
      nonEmptyLines.forEach((line, idx) => {
        const wrapped = doc.splitTextToSize(`${idx + 1}. ${line}`, contentWidth - 4);
        const h = wrapped.length * 4.6 + 1.5;
        ensureSpace(h + 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(wrapped, margin + 2, y + 0.5);
        y += h;
      });
    }
  }

  y += 6;

  // Section 3: Pricing & Financial Summary
  ensureSpace(62);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 118, 110);
  doc.text('3. FEE & INVOICE SUMMARY', margin, y);
  y += 2;
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Left half: Internal Reference Prices; Right half: Final Billing Computation
  const halfW = (contentWidth - 6) / 2;
  const leftX = margin;
  const rightX = margin + halfW + 6;
  const boxTop = y;

  // Left Reference Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftX, boxTop, halfW, 38, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('INTERNAL PRICING REFERENCE', leftX + 4, boxTop + 6);

  const refRows: Array<[string, string]> = [
    ['Prior Year Price', formatOptionalRM(record.priorYearPrice)],
    ['Quotation Price', formatOptionalRM(record.quotationPrice)],
    ['Audit Fee (Ref)', formatOptionalRM(record.auditFee)],
    ['Pricing Mode', record.pricingMode || 'Overall Fee'],
  ];
  let ly = boxTop + 13;
  refRows.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(lbl, leftX + 4, ly);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(val, leftX + halfW - 4, ly, { align: 'right' });
    ly += 6.2;
  });

  // Right Billing Box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(15, 118, 110);
  doc.roundedRect(rightX, boxTop, halfW, 44, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 118, 110);
  doc.text('BILLING COMPUTATION', rightX + 4, boxTop + 6);

  const billRows: Array<[string, string, boolean?]> = [
    ['HOD Approved Price', formatOptionalRM(record.hodPrice)],
    ['Additional Charges', formatCurrencyRM(record.additionalCharges)],
    ['Final Price (Excl. SST)', formatCurrencyRM(record.finalPrice), true],
    [
      'SST Amount',
      record.sstAmount === null || record.sstAmount === undefined
        ? 'Not Set'
        : formatCurrencyRM(record.sstAmount),
    ],
  ];
  let ry = boxTop + 13;
  billRows.forEach(([lbl, val, bold]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(bold ? 15 : 71, bold ? 23 : 85, bold ? 42 : 105);
    doc.text(lbl, rightX + 4, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(val, rightX + halfW - 4, ry, { align: 'right' });
    ry += 5.8;
  });

  // Total Invoice Highlight Bar
  doc.setFillColor(15, 118, 110);
  doc.rect(rightX, boxTop + 35, halfW, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL INVOICE', rightX + 4, boxTop + 40.8);
  doc.setFontSize(9.5);
  doc.text(formatCurrencyRM(record.totalInvoiceAmount), rightX + halfW - 4, boxTop + 40.8, {
    align: 'right',
  });

  y = boxTop + 52;

  // Cancellation Info (if cancelled)
  if (record.workDoneStatus === 'Cancelled' || record.cancellationReason) {
    ensureSpace(20);
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(252, 165, 165);
    const cancelLines = doc.splitTextToSize(
      `Cancellation Date: ${record.cancellationDate ? formatDateDDMMYYYY(record.cancellationDate) : '—'}   |   Reason: ${record.cancellationReason || '—'}`,
      contentWidth - 8
    );
    const ch = Math.max(12, cancelLines.length * 4.5 + 8);
    doc.roundedRect(margin, y, contentWidth, ch, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(185, 28, 28);
    doc.text('CANCELLATION RECORD', margin + 4, y + 5.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(127, 29, 29);
    doc.text(cancelLines, margin + 4, y + 10.2);
    y += ch + 6;
  }

  // Remarks
  if (record.remarks) {
    ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('REMARKS / AUDIT NOTES', margin, y);
    y += 4.5;
    const remLines = doc.splitTextToSize(record.remarks, contentWidth - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(51, 65, 85);
    doc.text(remLines, margin + 2, y);
    y += remLines.length * 4.5 + 6;
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `TPMS Work Done & Finance • ${record.workDoneId} • ${record.clientName}`,
      margin,
      pageHeight - 9
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 9, {
      align: 'right',
    });
  }

  return doc;
}

export function buildWorkDoneFilename(record: WorkDoneRecord): string {
  const safeClient = (record.clientName || 'Client')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const safeId = (record.workDoneId || record.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const yaPart = record.ya ? `_YA${record.ya.replace(/[^0-9]/g, '')}` : '';
  return `${safeId}_${safeClient}${yaPart}.pdf`;
}

/**
 * Creates a Blob URL for in-app A4 PDF preview modal (caller must revoke on unmount).
 */
export function createWorkDonePdfPreviewUrl(record: WorkDoneRecord): string | null {
  try {
    const doc = generateWorkDonePdfDoc(record);
    const blob = doc.output('blob');
    return URL.createObjectURL(blob);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Failed to render Work Done PDF preview: ${msg}`, 'error');
    return null;
  }
}

/**
 * Triggers a sandbox-safe direct download of a single Work Done A4 PDF via URL.createObjectURL + <a download>.
 */
export function downloadWorkDonePdf(record: WorkDoneRecord): void {
  try {
    const doc = generateWorkDonePdfDoc(record);
    const blob = doc.output('blob');
    const filename = buildWorkDoneFilename(record);
    triggerBlobDownload(blob, filename);
    showToast(`Downloaded ${filename}`, 'success', 3200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Failed to download Work Done PDF: ${msg}`, 'error');
  }
}

/**
 * Generates PDFs for all selected Work Done records, bundles them into a ZIP using JSZip,
 * and triggers an automatic blob download via URL.createObjectURL + <a download>.
 */
export async function exportBatchWorkDoneZip(records: WorkDoneRecord[]): Promise<void> {
  if (records.length === 0) {
    showToast('Select at least one Work Done record to export.', 'warning', 4000);
    return;
  }
  try {
    const zip = new JSZip();
    const usedNames = new Set<string>();

    for (const record of records) {
      const doc = generateWorkDonePdfDoc(record);
      const arrayBuffer = doc.output('arraybuffer');
      let filename = buildWorkDoneFilename(record);
      let suffix = 2;
      while (usedNames.has(filename)) {
        filename = filename.replace(/\.pdf$/i, `_${suffix}.pdf`);
        suffix += 1;
      }
      usedNames.add(filename);
      zip.file(filename, arrayBuffer);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipName = `TPMS_WorkDone_PDFs_${new Date().toISOString().slice(0, 10)}.zip`;
    triggerBlobDownload(zipBlob, zipName);
    showToast(
      `Downloaded ${zipName} (${records.length} PDF${records.length === 1 ? '' : 's'})`,
      'success',
      3500
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Batch ZIP PDF export failed: ${msg}`, 'error');
  }
}
