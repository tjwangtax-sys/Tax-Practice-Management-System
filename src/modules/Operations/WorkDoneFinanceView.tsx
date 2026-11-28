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
import { useColumnVisibility, usePinnedColumnOffsets } from '../../hooks/useColumnVisibility';
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
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { RemarksPreviewCell } from '../../components/RemarksPreviewCell';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';

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
  {
    key: 'workDoneDescription',
    label: 'Work Done Description',
    defaultVisible: true,
    optional: true,
  },
  { key: 'remarks', label: 'Remarks', defaultVisible: true, optional: true },
];

const WORK_DONE_COL_WIDTHS: Record<string, string> = {
  workDoneId: 'w-[115px] min-w-[115px]',
  clientName: 'min-w-[205px]',
  ya: 'min-w-[75px]',
  jobType: 'min-w-[125px]',
  jobId: 'min-w-[120px]',
  pic: 'min-w-[120px]',
  reviewer: 'min-w-[120px]',
  pricingMode: 'min-w-[130px]',
  quotationPrice: 'min-w-[115px]',
  hodPrice: 'min-w-[115px]',
  additionalCharges: 'min-w-[120px]',
  finalPrice: 'min-w-[115px]',
  sstAmount: 'min-w-[105px]',
  totalInvoiceAmount: 'min-w-[130px]',
  workDoneStatus: 'min-w-[170px]',
  financeInvoiceStatus: 'min-w-[145px]',
  invoiceNo: 'min-w-[125px]',
  issueDate: 'min-w-[115px]',
  workDoneDescription: 'min-w-[200px]',
  remarks: 'min-w-[190px]',
};

const WORK_DONE_COL_FALLBACK_WIDTHS: Record<string, number> = {
  workDoneId: 115,
  clientName: 205,
  ya: 75,
  jobType: 125,
  jobId: 120,
  pic: 120,
  reviewer: 120,
  pricingMode: 130,
  quotationPrice: 115,
  hodPrice: 115,
  additionalCharges: 120,
  finalPrice: 115,
  sstAmount: 105,
  totalInvoiceAmount: 130,
  workDoneStatus: 170,
  financeInvoiceStatus: 145,
  invoiceNo: 125,
  issueDate: 115,
  workDoneDescription: 200,
  remarks: 190,
};

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
  const {
    visibleColumns,
    pinnedColumns,
    orderedColumns,
    activeColumns,
    pinnedActiveKeys,
    toggleColumn,
    togglePin,
    moveColumn,
    reorderColumn,
    resetColumns,
  } = useColumnVisibility('work_done_finance_v2', WORK_DONE_COLUMNS, ['workDoneId', 'clientName']);
  const { headerRowRef, getHeaderStickyProps, getCellStickyProps } = usePinnedColumnOffsets(
    pinnedActiveKeys,
    WORK_DONE_COL_FALLBACK_WIDTHS,
    38
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

  const workDoneColumnGetters = useMemo(
    () => ({
      workDoneId: (r: WorkDoneRecord) => r.workDoneId,
      clientName: (r: WorkDoneRecord) => r.clientName,
      ya: (r: WorkDoneRecord) => r.ya,
      jobType: (r: WorkDoneRecord) => r.jobType,
      jobId: (r: WorkDoneRecord) => r.jobId,
      pic: (r: WorkDoneRecord) => r.pic,
      reviewer: (r: WorkDoneRecord) => r.reviewer,
      pricingMode: (r: WorkDoneRecord) => r.pricingMode,
      quotationPrice: (r: WorkDoneRecord) => formatOptionalMoney(r.quotationPrice),
      hodPrice: (r: WorkDoneRecord) => formatOptionalMoney(r.hodPrice),
      additionalCharges: (r: WorkDoneRecord) => formatCurrencyRM(r.additionalCharges),
      finalPrice: (r: WorkDoneRecord) => formatCurrencyRM(r.finalPrice),
      sstAmount: (r: WorkDoneRecord) => formatOptionalMoney(r.sstAmount),
      totalInvoiceAmount: (r: WorkDoneRecord) => formatCurrencyRM(r.totalInvoiceAmount),
      workDoneStatus: (r: WorkDoneRecord) => r.workDoneStatus,
      financeInvoiceStatus: (r: WorkDoneRecord) => r.financeInvoiceStatus,
      invoiceNo: (r: WorkDoneRecord) => r.invoiceNo,
      issueDate: (r: WorkDoneRecord) => (r.issueDate ? formatDateDDMMYYYY(r.issueDate) : ''),
      workDoneDescription: (r: WorkDoneRecord) => r.workDoneDescription || '',
      remarks: (r: WorkDoneRecord) => r.remarks,
    }),
    []
  );

  const excel = useExcelTableFilters(filtered, workDoneColumnGetters);

  const hasActiveFilters = Boolean(
    search ||
      wdStatusFilter ||
      financeStatusFilter ||
      pricingModeFilter ||
      yaFilter ||
      picFilter ||
      excel.hasActiveColumnFilters
  );

  const resetFilters = () => {
    setSearch('');
    setWdStatusFilter('');
    setFinanceStatusFilter('');
    setPricingModeFilter('');
    setYaFilter('');
    setPicFilter('');
    excel.resetColumnFilters();
  };

  // KPI metrics
  const kpis = useMemo(() => {
    let pendingFinance = 0;
    let readyForInvoicing = 0;
    let invoicedTotal = 0;
    let totalPipeline = 0;

    for (const r of excel.rows) {
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
  }, [excel.rows]);

  // Selection helpers
  const selectedFilteredRecords = useMemo(
    () => excel.rows.filter((r) => selectedIds[r.id]),
    [excel.rows, selectedIds]
  );

  const allFilteredSelected =
    excel.rows.length > 0 && excel.rows.every((r) => Boolean(selectedIds[r.id]));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = { ...prev };
        for (const r of excel.rows) delete next[r.id];
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = { ...prev };
        for (const r of excel.rows) next[r.id] = true;
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
      excel.rows.map((r) => ({
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
        workDoneDescription: r.workDoneDescription || '',
        remarks: r.remarks || '',
      })),
    [excel.rows]
  );

  const visibleExportColumns = activeColumns;

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
            {excel.rows.length} record{excel.rows.length === 1 ? '' : 's'} shown
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
        columns={orderedColumns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        pinnedColumns={pinnedColumns}
        onTogglePin={togglePin}
        onMoveColumn={moveColumn}
        onReorderColumn={reorderColumn}
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
            `Filtered records: ${excel.rows.length}`,
            visibleExportColumns,
            exportRows,
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            'Work Done & Finance Register',
            `Filtered records: ${excel.rows.length}`,
            visibleExportColumns,
            exportRows,
            true
          )
        }
        recordCount={excel.rows.length}
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
      <div className="max-h-[calc(100vh-64px)] overflow-auto relative bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm border-b border-slate-200 text-slate-700">
            <tr ref={headerRowRef}>
              <th
                className={`sticky top-0 left-0 z-30 bg-slate-50 py-2 px-3 w-[38px] min-w-[38px] border-b border-slate-200 ${
                  pinnedActiveKeys.length === 0
                    ? 'shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
                    : 'shadow-[inset_-1px_0_0_#e2e8f0]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  aria-label="Select all visible Work Done records"
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
              </th>
              {activeColumns.map((col) => {
                const stickyTh = getHeaderStickyProps(col.key);
                const align = col.align === 'right' ? 'right' : 'left';
                return (
                  <th
                    key={col.key}
                    data-pinned-col={stickyTh['data-pinned-col']}
                    style={stickyTh.style}
                    className={`py-2 px-3 text-xs font-semibold whitespace-nowrap border-b border-slate-200 ${
                      align === 'right' ? 'text-right' : 'text-left'
                    } ${WORK_DONE_COL_WIDTHS[col.key] || 'min-w-[115px]'} ${stickyTh.className}`}
                  >
                    <ExcelColumnFilter
                      columnKey={col.key}
                      title={col.label}
                      values={excel.getColumnValues(col.key)}
                      selectedValues={excel.columnFilters[col.key]}
                      onChangeSelected={(next) => excel.setColumnFilter(col.key, next)}
                      sortDirection={
                        excel.sortState?.key === col.key ? excel.sortState.direction : null
                      }
                      onSort={(dir) => excel.setColumnSort(col.key, dir)}
                      align={align}
                    />
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 bg-slate-50 py-2 px-3 text-xs font-semibold text-right whitespace-nowrap border-b border-slate-200 min-w-[175px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {excel.rows.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length + 2} className="py-12 text-center text-slate-400">
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
              excel.rows.map((rec) => {
                const isChecked = Boolean(selectedIds[rec.id]);
                const isDeletingConfirm = confirmDeleteId === rec.id;
                const stickyBg = isChecked
                  ? 'bg-teal-50 group-hover:bg-teal-50/90'
                  : 'bg-white group-hover:bg-slate-50';
                return (
                  <tr
                    key={rec.id}
                    className={`group hover:bg-slate-50 transition-colors ${
                      isChecked ? 'bg-teal-50/40' : ''
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-10 ${stickyBg} w-[38px] min-w-[38px] py-2 px-3 ${
                        pinnedActiveKeys.length === 0
                          ? 'shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
                          : 'shadow-[inset_-1px_0_0_#e2e8f0]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectOne(rec.id)}
                        aria-label={`Select ${rec.workDoneId}`}
                        className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                      />
                    </td>
                    {activeColumns.map((col) => {
                      const key = col.key;
                      const stickyTd = getCellStickyProps(key, stickyBg);
                      const colWidth = WORK_DONE_COL_WIDTHS[key] || 'min-w-[115px]';
                      const wrapTd = (cls: string, content: React.ReactNode) => (
                        <td
                          key={key}
                          style={stickyTd.style}
                          className={`${cls} ${colWidth} ${stickyTd.className}`}
                        >
                          {content}
                        </td>
                      );

                      switch (key) {
                        case 'workDoneId':
                          return wrapTd(
                            'py-2 px-3 font-mono text-xs font-semibold text-slate-800 whitespace-nowrap',
                            rec.workDoneId
                          );
                        case 'clientName':
                          return wrapTd(
                            'py-2 px-3 whitespace-nowrap',
                            <>
                              <div
                                className="font-medium text-slate-900 leading-tight max-w-[240px] truncate"
                                title={rec.clientName}
                              >
                                {rec.clientName}
                              </div>
                              {rec.clientId && (
                                <div className="text-[10px] font-mono text-slate-400">
                                  {rec.clientId}
                                </div>
                              )}
                            </>
                          );
                        case 'ya':
                          return wrapTd(
                            'py-2 px-2.5 font-mono tabular-nums text-slate-700 whitespace-nowrap',
                            rec.ya || '—'
                          );
                        case 'jobType':
                          return wrapTd(
                            'py-2 px-2.5 text-slate-700 whitespace-nowrap',
                            rec.jobType || '—'
                          );
                        case 'jobId':
                          return wrapTd(
                            'py-2 px-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap',
                            rec.jobId || '—'
                          );
                        case 'pic':
                          return wrapTd(
                            'py-2 px-2.5 text-slate-700 whitespace-nowrap',
                            rec.pic || '—'
                          );
                        case 'reviewer':
                          return wrapTd(
                            'py-2 px-2.5 text-slate-600 whitespace-nowrap',
                            rec.reviewer || '—'
                          );
                        case 'pricingMode':
                          return wrapTd(
                            'py-2 px-2.5 whitespace-nowrap',
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                              {rec.pricingMode === 'Individual Allocation'
                                ? `Individual (${rec.feeAllocations?.length ?? 0})`
                                : 'Overall Fee'}
                            </span>
                          );
                        case 'quotationPrice':
                          return wrapTd(
                            'py-2 px-2.5 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap',
                            formatOptionalMoney(rec.quotationPrice)
                          );
                        case 'hodPrice':
                          return wrapTd(
                            'py-2 px-2.5 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap',
                            formatOptionalMoney(rec.hodPrice)
                          );
                        case 'additionalCharges':
                          return wrapTd(
                            'py-2 px-2.5 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap',
                            formatCurrencyRM(rec.additionalCharges)
                          );
                        case 'finalPrice':
                          return wrapTd(
                            'py-2 px-2.5 font-mono tabular-nums text-right font-medium text-slate-800 whitespace-nowrap',
                            formatCurrencyRM(rec.finalPrice)
                          );
                        case 'sstAmount':
                          return wrapTd(
                            'py-2 px-2.5 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap',
                            formatOptionalMoney(rec.sstAmount)
                          );
                        case 'totalInvoiceAmount':
                          return wrapTd(
                            'py-2 px-2.5 font-mono tabular-nums text-right font-semibold text-teal-800 whitespace-nowrap',
                            formatCurrencyRM(rec.totalInvoiceAmount)
                          );
                        case 'workDoneStatus':
                          return wrapTd(
                            'py-2 px-2.5 whitespace-nowrap',
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getWorkDoneBadgeStyle(
                                rec.workDoneStatus
                              )}`}
                            >
                              {rec.workDoneStatus}
                            </span>
                          );
                        case 'financeInvoiceStatus':
                          return wrapTd(
                            'py-2 px-2.5 whitespace-nowrap',
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getFinanceBadgeStyle(
                                rec.financeInvoiceStatus
                              )}`}
                            >
                              {rec.financeInvoiceStatus}
                            </span>
                          );
                        case 'invoiceNo':
                          return wrapTd(
                            'py-2 px-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap',
                            rec.invoiceNo || '—'
                          );
                        case 'issueDate':
                          return wrapTd(
                            'py-2 px-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap',
                            rec.issueDate ? formatDateDDMMYYYY(rec.issueDate) : '—'
                          );
                        case 'workDoneDescription':
                          return wrapTd(
                            'py-2 px-2.5 whitespace-nowrap',
                            <RemarksPreviewCell
                              text={rec.workDoneDescription}
                              recordTitle={rec.clientName}
                              recordId={rec.workDoneId}
                              fieldLabel="Work Done Description"
                            />
                          );
                        case 'remarks':
                          return wrapTd(
                            'py-2 px-2.5 whitespace-nowrap',
                            <RemarksPreviewCell
                              text={rec.remarks}
                              recordTitle={rec.clientName}
                              recordId={rec.workDoneId}
                              fieldLabel="Work Done Remarks"
                            />
                          );
                        default:
                          return wrapTd('py-2 px-2.5 text-slate-600 whitespace-nowrap', '—');
                      }
                    })}
                      <td className="py-2 px-3 text-xs text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setPreviewRecord(rec)}
                            className="font-medium text-teal-700 hover:underline"
                            title="Preview A4 PDF"
                          >
                            Preview
                          </button>
                          <span className="text-slate-300">·</span>
                          <button
                            type="button"
                            onClick={() => downloadWorkDonePdf(rec)}
                            className="font-medium text-sky-700 hover:underline"
                            title="Download A4 PDF"
                          >
                            PDF
                          </button>
                          <span className="text-slate-300">·</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRecord(rec);
                              setModalOpen(true);
                            }}
                            className="font-medium text-slate-700 hover:text-slate-950 hover:underline"
                            title={isReadOnly ? 'View Details' : 'Edit Record'}
                          >
                            {isReadOnly ? 'View' : 'Edit'}
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
                              <>
                                <span className="text-slate-300">·</span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(rec.id)}
                                  className="font-medium text-rose-600 hover:text-rose-800 hover:underline"
                                  title="Delete Record (Admin)"
                                >
                                  Delete
                                </button>
                              </>
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
