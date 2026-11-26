import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  FileDown,
  Eye,
  Edit3,
  Trash2,
  FolderArchive,
  Check,
  X,
  FileText,
  Receipt,
  Printer,
} from 'lucide-react';
import {
  ColumnDef,
  FINANCE_INVOICE_STATUSES,
  formatCurrencyRM,
  WORK_DONE_PRICING_MODES,
  WORK_DONE_STATUSES,
  WorkDoneRecord,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';
import { showToast } from '../../lib/toast';
import { WorkDoneModal } from './WorkDoneModal';
import {
  createWorkDonePdfPreviewUrl,
  downloadWorkDonePdf,
  exportBatchWorkDoneZip,
} from './workDonePdfUtils';

const WORK_DONE_COLUMNS: ColumnDef[] = [
  { key: 'workDoneId', label: 'WD ID', defaultVisible: true },
  { key: 'clientName', label: 'Client Name', defaultVisible: true },
  { key: 'ya', label: 'YA', defaultVisible: true },
  { key: 'jobType', label: 'Job Type', defaultVisible: true },
  { key: 'jobId', label: 'Job Ref', defaultVisible: true },
  { key: 'pic', label: 'PIC', defaultVisible: true },
  { key: 'reviewer', label: 'Reviewer', defaultVisible: false, optional: true },
  { key: 'pricingMode', label: 'Pricing Mode', defaultVisible: true },
  { key: 'quotationPrice', label: 'Quotation', defaultVisible: false, optional: true, align: 'right' },
  { key: 'hodPrice', label: 'HOD Price', defaultVisible: true, align: 'right' },
  { key: 'additionalCharges', label: 'Add. Charges', defaultVisible: false, optional: true, align: 'right' },
  { key: 'finalPrice', label: 'Final Price', defaultVisible: true, align: 'right' },
  { key: 'sstAmount', label: 'SST', defaultVisible: true, align: 'right' },
  { key: 'totalInvoiceAmount', label: 'Total Invoice', defaultVisible: true, align: 'right' },
  { key: 'workDoneStatus', label: 'Work Done Status', defaultVisible: true },
  { key: 'financeInvoiceStatus', label: 'Finance Status', defaultVisible: true },
  { key: 'invoiceNo', label: 'Invoice No.', defaultVisible: true },
  { key: 'issueDate', label: 'Issue Date', defaultVisible: false, optional: true },
  { key: 'remarks', label: 'Remarks', defaultVisible: false, optional: true },
];

function getWorkDoneBadgeStyle(status: string): string {
  switch (status) {
    case 'Invoiced':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Ready for Invoicing':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'Completed — Pending Finance':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Returned by Finance':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Quotation Pending Approval':
    case 'Quotation Issued':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'In Progress':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'Cancelled':
      return 'bg-slate-100 text-slate-600 border-slate-200 line-through';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function getFinanceBadgeStyle(status: string): string {
  switch (status) {
    case 'Invoiced':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'Ready for Invoicing':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'Pending Review':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'Returned':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Cancelled':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function formatOptionalMoney(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return formatCurrencyRM(val);
}

export const WorkDoneFinanceView: React.FC = () => {
  const { isAdmin, isReadOnly } = useAuth();
  const { workDoneRecords, deleteWorkDone } = useData();
  const { visibleColumns, toggleColumn, resetColumns } = useColumnVisibility(
    'work_done_finance_v2',
    WORK_DONE_COLUMNS
  );

  // Filters
  const [search, setSearch] = useState('');
  const [wdStatusFilter, setWdStatusFilter] = useState('');
  const [financeStatusFilter, setFinanceStatusFilter] = useState('');
  const [pricingModeFilter, setPricingModeFilter] = useState('');
  const [yaFilter, setYaFilter] = useState('');
  const [picFilter, setPicFilter] = useState('');

  // Selection for Batch ZIP export
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [exportingZip, setExportingZip] = useState(false);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<WorkDoneRecord | null>(null);

  // In-app PDF Preview modal
  const [previewRecord, setPreviewRecord] = useState<WorkDoneRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Inline Delete Confirmation (Admin only)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!previewRecord) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = createWorkDonePdfPreviewUrl(previewRecord);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [previewRecord]);

  const handlePrintPreviewIframe = () => {
    const win = previewIframeRef.current?.contentWindow;
    if (!win) {
      showToast(
        'Preview sandbox blocked printing — click Open in New Tab (↗) or use Export to PDF.',
        'warning',
        7000
      );
      return;
    }
    let beforePrintFired = false;
    const onBeforePrint = () => {
      beforePrintFired = true;
    };
    try {
      win.addEventListener('beforeprint', onBeforePrint, { once: true });
      win.focus();
      win.print();
    } catch {
      showToast(
        'Preview sandbox blocked printing — click Open in New Tab (↗) or use Export to PDF.',
        'warning',
        7000
      );
      return;
    }
    window.setTimeout(() => {
      if (!beforePrintFired) {
        showToast(
          'Preview sandbox blocked printing — click Open in New Tab (↗) or use Export to PDF.',
          'warning',
          7000
        );
      }
    }, 250);
  };

  const distinctYas = useMemo(
    () =>
      Array.from(new Set(workDoneRecords.map((r) => r.ya).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [workDoneRecords]
  );

  const distinctPics = useMemo(
    () =>
      Array.from(new Set(workDoneRecords.map((r) => r.pic).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [workDoneRecords]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workDoneRecords.filter((r) => {
      if (wdStatusFilter && r.workDoneStatus !== wdStatusFilter) return false;
      if (financeStatusFilter && r.financeInvoiceStatus !== financeStatusFilter) return false;
      if (pricingModeFilter && r.pricingMode !== pricingModeFilter) return false;
      if (yaFilter && r.ya !== yaFilter) return false;
      if (picFilter && r.pic !== picFilter) return false;
      if (q) {
        const hay = [
          r.workDoneId,
          r.clientName,
          r.clientId,
          r.jobId,
          r.jobType,
          r.invoiceNo,
          r.pic,
          r.reviewer,
          r.workDoneDescription,
          r.remarks,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    workDoneRecords,
    search,
    wdStatusFilter,
    financeStatusFilter,
    pricingModeFilter,
    yaFilter,
    picFilter,
  ]);

  const hasActiveFilters = Boolean(
    search || wdStatusFilter || financeStatusFilter || pricingModeFilter || yaFilter || picFilter
  );

  const resetFilters = () => {
    setSearch('');
    setWdStatusFilter('');
    setFinanceStatusFilter('');
    setPricingModeFilter('');
    setYaFilter('');
    setPicFilter('');
  };

  // KPI metrics
  const kpis = useMemo(() => {
    let pendingFinance = 0;
    let readyForInvoicing = 0;
    let invoicedTotal = 0;
    let totalPipeline = 0;

    for (const r of filtered) {
      if (r.workDoneStatus === 'Completed — Pending Finance') pendingFinance += 1;
      if (r.workDoneStatus === 'Ready for Invoicing') readyForInvoicing += 1;
      if (r.workDoneStatus === 'Invoiced') {
        invoicedTotal += r.totalInvoiceAmount || 0;
      }
      if (r.workDoneStatus !== 'Cancelled') {
        totalPipeline += r.totalInvoiceAmount || 0;
      }
    }
    return { pendingFinance, readyForInvoicing, invoicedTotal, totalPipeline };
  }, [filtered]);

  // Selection helpers
  const selectedFilteredRecords = useMemo(
    () => filtered.filter((r) => selectedIds[r.id]),
    [filtered, selectedIds]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => Boolean(selectedIds[r.id]));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = { ...prev };
        for (const r of filtered) delete next[r.id];
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = { ...prev };
        for (const r of filtered) next[r.id] = true;
        return next;
      });
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleBatchZipExport = async () => {
    if (selectedFilteredRecords.length === 0 || exportingZip) return;
    setExportingZip(true);
    try {
      await exportBatchWorkDoneZip(selectedFilteredRecords);
    } finally {
      setExportingZip(false);
    }
  };

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteWorkDone(id);
      setConfirmDeleteId(null);
      setSelectedIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } finally {
      setDeletingId(null);
    }
  };

  const exportRows = useMemo(
    () =>
      filtered.map((r) => ({
        workDoneId: r.workDoneId,
        clientName: r.clientName,
        ya: r.ya || '—',
        jobType: r.jobType || '—',
        jobId: r.jobId || '—',
        pic: r.pic || '—',
        reviewer: r.reviewer || '—',
        pricingMode: r.pricingMode,
        quotationPrice: formatOptionalMoney(r.quotationPrice),
        hodPrice: formatOptionalMoney(r.hodPrice),
        additionalCharges: formatCurrencyRM(r.additionalCharges),
        finalPrice: formatCurrencyRM(r.finalPrice),
        sstAmount: formatOptionalMoney(r.sstAmount),
        totalInvoiceAmount: formatCurrencyRM(r.totalInvoiceAmount),
        workDoneStatus: r.workDoneStatus,
        financeInvoiceStatus: r.financeInvoiceStatus,
        invoiceNo: r.invoiceNo || '—',
        issueDate: r.issueDate ? formatDateDDMMYYYY(r.issueDate) : '—',
        remarks: r.remarks || '',
      })),
    [filtered]
  );

  const visibleExportColumns = useMemo(
    () => WORK_DONE_COLUMNS.filter((c) => visibleColumns[c.key]),
    [visibleColumns]
  );

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Work Done & Finance</h1>
          <p className="text-xs text-slate-500">
            Track engagement work done, HOD fee approvals, SST billing, invoice status, and A4 PDF reports.
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Pending Finance Review
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-sky-700">
            {kpis.pendingFinance}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Awaiting finance verification</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Ready for Invoicing
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-teal-700">
            {kpis.readyForInvoicing}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Cleared to issue invoice</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Total Invoiced (Filtered)
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-700">
            {formatCurrencyRM(kpis.invoicedTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Incl. SST & additional charges</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Active Value (Excl. Cancelled)
          </div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrencyRM(kpis.totalPipeline)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {filtered.length} record{filtered.length === 1 ? '' : 's'} shown
          </div>
        </div>
      </div>

      {/* Register Toolbar */}
      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search WD ID, client, job ref, invoice no., description..."
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        columns={WORK_DONE_COLUMNS}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_Work_Done_Finance_${new Date().toISOString().slice(0, 10)}.xlsx`,
            'Work Done & Finance',
            visibleExportColumns,
            exportRows
          )
        }
        onPrint={() =>
          printRegisterHtml(
            'Work Done & Finance Register',
            `Filtered records: ${filtered.length}`,
            visibleExportColumns,
            exportRows,
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            'Work Done & Finance Register',
            `Filtered records: ${filtered.length}`,
            visibleExportColumns,
            exportRows,
            true
          )
        }
        recordCount={filtered.length}
        totalCount={workDoneRecords.length}
        primaryAction={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBatchZipExport}
              disabled={selectedFilteredRecords.length === 0 || exportingZip}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
              title="Download selected Work Done PDFs as a ZIP archive"
            >
              <FolderArchive className="w-3.5 h-3.5 text-teal-700" />
              {exportingZip
                ? 'Bundling ZIP...'
                : `Batch Export PDFs (ZIP)${
                    selectedFilteredRecords.length > 0 ? ` (${selectedFilteredRecords.length})` : ''
                  }`}
            </button>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  setEditingRecord(null);
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                New Work Done
              </button>
            )}
          </div>
        }
        filters={
          <>
            <select
              value={wdStatusFilter}
              onChange={(e) => setWdStatusFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Work Done Status</option>
              {WORK_DONE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={financeStatusFilter}
              onChange={(e) => setFinanceStatusFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Finance Status</option>
              {FINANCE_INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={pricingModeFilter}
              onChange={(e) => setPricingModeFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Pricing Modes</option>
              {WORK_DONE_PRICING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={yaFilter}
              onChange={(e) => setYaFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All YA</option>
              {distinctYas.map((y) => (
                <option key={y} value={y}>
                  YA {y}
                </option>
              ))}
            </select>
            <select
              value={picFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All PIC</option>
              {distinctPics.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </>
        }
      />

      {/* High-Density Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-9">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all visible Work Done records"
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                </th>
                {visibleColumns.workDoneId && <th className="py-2.5 px-2.5 whitespace-nowrap">WD ID</th>}
                {visibleColumns.clientName && <th className="py-2.5 px-2.5 whitespace-nowrap">Client Name</th>}
                {visibleColumns.ya && <th className="py-2.5 px-2.5 whitespace-nowrap">YA</th>}
                {visibleColumns.jobType && <th className="py-2.5 px-2.5 whitespace-nowrap">Job Type</th>}
                {visibleColumns.jobId && <th className="py-2.5 px-2.5 whitespace-nowrap">Job Ref</th>}
                {visibleColumns.pic && <th className="py-2.5 px-2.5 whitespace-nowrap">PIC</th>}
                {visibleColumns.reviewer && <th className="py-2.5 px-2.5 whitespace-nowrap">Reviewer</th>}
                {visibleColumns.pricingMode && <th className="py-2.5 px-2.5 whitespace-nowrap">Pricing Mode</th>}
                {visibleColumns.quotationPrice && (
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-right">Quotation</th>
                )}
                {visibleColumns.hodPrice && (
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-right">HOD Price</th>
                )}
                {visibleColumns.additionalCharges && (
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-right">Add. Charges</th>
                )}
                {visibleColumns.finalPrice && (
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-right">Final Price</th>
                )}
                {visibleColumns.sstAmount && (
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-right">SST</th>
                )}
                {visibleColumns.totalInvoiceAmount && (
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-right">Total Invoice</th>
                )}
                {visibleColumns.workDoneStatus && (
                  <th className="py-2.5 px-2.5 whitespace-nowrap">Work Done Status</th>
                )}
                {visibleColumns.financeInvoiceStatus && (
                  <th className="py-2.5 px-2.5 whitespace-nowrap">Finance Status</th>
                )}
                {visibleColumns.invoiceNo && <th className="py-2.5 px-2.5 whitespace-nowrap">Invoice No.</th>}
                {visibleColumns.issueDate && <th className="py-2.5 px-2.5 whitespace-nowrap">Issue Date</th>}
                {visibleColumns.remarks && <th className="py-2.5 px-2.5 whitespace-nowrap">Remarks</th>}
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={22} className="py-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <div className="font-medium text-slate-600">No Work Done records found</div>
                    <div className="text-[11px] mt-0.5">
                      {hasActiveFilters
                        ? 'Try clearing filters or search terms.'
                        : 'Click "New Work Done" to create your first billing record.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => {
                  const isChecked = Boolean(selectedIds[rec.id]);
                  const isDeletingConfirm = confirmDeleteId === rec.id;
                  return (
                    <tr
                      key={rec.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isChecked ? 'bg-teal-50/40' : ''
                      }`}
                    >
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(rec.id)}
                          aria-label={`Select ${rec.workDoneId}`}
                          className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                        />
                      </td>
                      {visibleColumns.workDoneId && (
                        <td className="py-2 px-2.5 font-mono text-[11px] font-semibold text-slate-800 whitespace-nowrap">
                          {rec.workDoneId}
                        </td>
                      )}
                      {visibleColumns.clientName && (
                        <td className="py-2 px-2.5 min-w-[180px]">
                          <div className="font-medium text-slate-900 leading-tight">
                            {rec.clientName}
                          </div>
                          {rec.clientId && (
                            <div className="text-[10px] font-mono text-slate-400">
                              {rec.clientId}
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.ya && (
                        <td className="py-2 px-2.5 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {rec.ya || '—'}
                        </td>
                      )}
                      {visibleColumns.jobType && (
                        <td className="py-2 px-2.5 text-slate-700 whitespace-nowrap">
                          {rec.jobType || '—'}
                        </td>
                      )}
                      {visibleColumns.jobId && (
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {rec.jobId || '—'}
                        </td>
                      )}
                      {visibleColumns.pic && (
                        <td className="py-2 px-2.5 text-slate-700 whitespace-nowrap">
                          {rec.pic || '—'}
                        </td>
                      )}
                      {visibleColumns.reviewer && (
                        <td className="py-2 px-2.5 text-slate-600 whitespace-nowrap">
                          {rec.reviewer || '—'}
                        </td>
                      )}
                      {visibleColumns.pricingMode && (
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                            {rec.pricingMode === 'Individual Allocation'
                              ? `Individual (${rec.feeAllocations?.length ?? 0})`
                              : 'Overall Fee'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.quotationPrice && (
                        <td className="py-2 px-2.5 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap">
                          {formatOptionalMoney(rec.quotationPrice)}
                        </td>
                      )}
                      {visibleColumns.hodPrice && (
                        <td className="py-2 px-2.5 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap">
                          {formatOptionalMoney(rec.hodPrice)}
                        </td>
                      )}
                      {visibleColumns.additionalCharges && (
                        <td className="py-2 px-2.5 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap">
                          {formatCurrencyRM(rec.additionalCharges)}
                        </td>
                      )}
                      {visibleColumns.finalPrice && (
                        <td className="py-2 px-2.5 font-mono tabular-nums text-right font-medium text-slate-800 whitespace-nowrap">
                          {formatCurrencyRM(rec.finalPrice)}
                        </td>
                      )}
                      {visibleColumns.sstAmount && (
                        <td className="py-2 px-2.5 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap">
                          {formatOptionalMoney(rec.sstAmount)}
                        </td>
                      )}
                      {visibleColumns.totalInvoiceAmount && (
                        <td className="py-2 px-2.5 font-mono tabular-nums text-right font-semibold text-teal-800 whitespace-nowrap">
                          {formatCurrencyRM(rec.totalInvoiceAmount)}
                        </td>
                      )}
                      {visibleColumns.workDoneStatus && (
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getWorkDoneBadgeStyle(
                              rec.workDoneStatus
                            )}`}
                          >
                            {rec.workDoneStatus}
                          </span>
                        </td>
                      )}
                      {visibleColumns.financeInvoiceStatus && (
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getFinanceBadgeStyle(
                              rec.financeInvoiceStatus
                            )}`}
                          >
                            {rec.financeInvoiceStatus}
                          </span>
                        </td>
                      )}
                      {visibleColumns.invoiceNo && (
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          {rec.invoiceNo || '—'}
                        </td>
                      )}
                      {visibleColumns.issueDate && (
                        <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {rec.issueDate ? formatDateDDMMYYYY(rec.issueDate) : '—'}
                        </td>
                      )}
                      {visibleColumns.remarks && (
                        <td className="py-2 px-2.5 text-slate-600 max-w-[200px] truncate" title={rec.remarks}>
                          {rec.remarks || '—'}
                        </td>
                      )}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewRecord(rec)}
                            className="p-1 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                            title="Preview A4 PDF"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadWorkDonePdf(rec)}
                            className="p-1 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                            title="Download A4 PDF"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRecord(rec);
                              setModalOpen(true);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            title={isReadOnly ? 'View Details' : 'Edit Record'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin &&
                            (isDeletingConfirm ? (
                              <span className="inline-flex items-center gap-0.5 ml-1 bg-rose-50 border border-rose-200 rounded px-1 py-0.5">
                                <button
                                  type="button"
                                  disabled={deletingId === rec.id}
                                  onClick={() => handleConfirmDelete(rec.id)}
                                  className="p-0.5 text-rose-700 hover:bg-rose-100 rounded"
                                  title="Confirm Delete"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="p-0.5 text-slate-500 hover:bg-slate-200 rounded"
                                  title="Cancel"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(rec.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                                title="Delete Record (Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Work Done Modal */}
      <WorkDoneModal
        open={modalOpen}
        record={editingRecord}
        onClose={() => setModalOpen(false)}
      />

      {/* In-App A4 PDF Preview Modal */}
      {previewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-teal-700 shrink-0" />
                <span className="text-sm font-semibold text-slate-900 truncate">
                  A4 PDF Preview — {previewRecord.workDoneId} ({previewRecord.clientName})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintPreviewIframe}
                  disabled={!previewUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print PDF
                </button>
                <button
                  type="button"
                  onClick={() => downloadWorkDonePdf(previewRecord)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 whitespace-nowrap"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewRecord(null)}
                  className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                  aria-label="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100">
              {previewUrl ? (
                <iframe
                  ref={previewIframeRef}
                  src={previewUrl}
                  title={`PDF Preview ${previewRecord.workDoneId}`}
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Rendering A4 PDF...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
