import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Save,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  ClientRecord,
  ColumnDef,
  formatCurrencyRM,
  safeNum,
  TAX_PAYMENT_FOLLOWUP_STATUSES,
  TAX_PAYMENT_TYPES,
  TAX_PAYMENT_VERIFICATION_STATUSES,
  TaxPaymentFollowUpStatus,
  TaxPaymentRecord,
  TaxPaymentType,
  TaxPaymentVerificationStatus,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { RemarksPreviewCell } from '../../components/RemarksPreviewCell';
import { ClientSelectorField } from '../../components/ClientSelectorField';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { useColumnVisibility, usePinnedColumnOffsets } from '../../hooks/useColumnVisibility';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';

const PAYMENT_COLUMNS: ColumnDef[] = [
  { key: 'paymentId', label: 'Payment ID', defaultVisible: true },
  { key: 'clientName', label: 'Client Name', defaultVisible: true },
  { key: 'paymentType', label: 'Payment Type', defaultVisible: true },
  { key: 'ya', label: 'YA', defaultVisible: true },
  { key: 'referenceCaseNo', label: 'Reference / Case No.', defaultVisible: true },
  { key: 'dueDate', label: 'Due Date', defaultVisible: true },
  { key: 'amountDue', label: 'Amount Due', defaultVisible: true, align: 'right' },
  { key: 'amountPaid', label: 'Amount Paid', defaultVisible: true, align: 'right' },
  { key: 'outstandingAmount', label: 'Outstanding', defaultVisible: true, align: 'right' },
  { key: 'paymentDate', label: 'Payment Date', defaultVisible: true },
  { key: 'paymentReference', label: 'Payment Ref', defaultVisible: true },
  { key: 'verificationStatus', label: 'Verification', defaultVisible: true },
  { key: 'followUpStatus', label: 'Follow-Up', defaultVisible: true },
  { key: 'remarks', label: 'Remarks', defaultVisible: false },
];

const PAYMENT_COL_WIDTHS: Record<string, string> = {
  paymentId: 'w-[130px] min-w-[130px]',
  clientName: 'min-w-[225px]',
  paymentType: 'min-w-[155px]',
  ya: 'min-w-[75px]',
  referenceCaseNo: 'min-w-[175px]',
  dueDate: 'min-w-[120px]',
  amountDue: 'min-w-[125px]',
  amountPaid: 'min-w-[125px]',
  outstandingAmount: 'min-w-[125px]',
  paymentDate: 'min-w-[120px]',
  paymentReference: 'min-w-[150px]',
  verificationStatus: 'min-w-[150px]',
  followUpStatus: 'min-w-[165px]',
  remarks: 'min-w-[200px]',
};

const PAYMENT_COL_FALLBACK_WIDTHS: Record<string, number> = {
  paymentId: 130,
  clientName: 225,
  paymentType: 155,
  ya: 75,
  referenceCaseNo: 175,
  dueDate: 120,
  amountDue: 125,
  amountPaid: 125,
  outstandingAmount: 125,
  paymentDate: 120,
  paymentReference: 150,
  verificationStatus: 150,
  followUpStatus: 165,
  remarks: 200,
};

const inputCls =
  'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-50 disabled:text-slate-500';
const labelCls = 'block text-[11px] font-medium text-slate-600 mb-1';

// =============================================================================
// Record / Edit Tax Payment Modal
// =============================================================================
interface TaxPaymentModalProps {
  open: boolean;
  editing: TaxPaymentRecord | null;
  onClose: () => void;
}

const TaxPaymentModal: React.FC<TaxPaymentModalProps> = ({ open, editing, onClose }) => {
  const { isReadOnly } = useAuth();
  const { clients, saveTaxPayment } = useData();

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [paymentType, setPaymentType] = useState<TaxPaymentType>('CP204 Instalment');
  const [ya, setYa] = useState(String(new Date().getFullYear()));
  const [referenceCaseNo, setReferenceCaseNo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amountDue, setAmountDue] = useState('0');
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [verificationStatus, setVerificationStatus] =
    useState<TaxPaymentVerificationStatus>('Not Verified');
  const [followUpStatus, setFollowUpStatus] = useState<TaxPaymentFollowUpStatus>('Pending');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setClientId(editing.clientId);
      setClientName(editing.clientName);
      setPaymentType(editing.paymentType);
      setYa(editing.ya || '');
      setReferenceCaseNo(editing.referenceCaseNo || '');
      setDueDate(editing.dueDate || '');
      setAmountDue(String(editing.amountDue ?? 0));
      setAmountPaid(String(editing.amountPaid ?? 0));
      setPaymentDate(editing.paymentDate || '');
      setPaymentReference(editing.paymentReference || '');
      setVerificationStatus(editing.verificationStatus || 'Not Verified');
      setFollowUpStatus(editing.followUpStatus || 'Pending');
      setRemarks(editing.remarks || '');
    } else {
      setClientId('');
      setClientName('');
      setPaymentType('CP204 Instalment');
      setYa(String(new Date().getFullYear()));
      setReferenceCaseNo('');
      setDueDate('');
      setAmountDue('0');
      setAmountPaid('0');
      setPaymentDate('');
      setPaymentReference('');
      setVerificationStatus('Not Verified');
      setFollowUpStatus('Pending');
      setRemarks('');
    }
  }, [open, editing]);

  if (!open) return null;

  const numDue = Math.max(0, safeNum(amountDue));
  const numPaid = Math.max(0, safeNum(amountPaid));
  const liveOutstanding = Math.max(0, Math.round((numDue - numPaid) * 100) / 100);

  const needsPaymentDate = numPaid > 0 && !paymentDate.trim();
  const verificationBlocked =
    verificationStatus === 'Verified' &&
    (numPaid <= 0 || !paymentDate.trim() || !paymentReference.trim());

  const handleClientSelect = (found: ClientRecord | null) => {
    if (!found) {
      setClientId('');
      setClientName('');
      return;
    }
    setClientId(found.clientId);
    setClientName(found.clientName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setError(null);

    if (!clientId) {
      setError('Please select a client.');
      return;
    }
    if (numPaid > 0 && !paymentDate.trim()) {
      setError('Payment Date is required when Amount Paid is greater than 0.');
      return;
    }
    if (
      verificationStatus === 'Verified' &&
      (numPaid <= 0 || !paymentDate.trim() || !paymentReference.trim())
    ) {
      setError(
        'Payment cannot be marked Verified unless Amount Paid > 0, Payment Date, and Payment Reference are filled.'
      );
      return;
    }

    setSaving(true);
    try {
      await saveTaxPayment(
        {
          paymentId: editing?.paymentId,
          clientId,
          clientName,
          paymentType,
          ya,
          referenceCaseNo,
          dueDate,
          amountDue: numDue,
          amountPaid: numPaid,
          paymentDate,
          paymentReference,
          verificationStatus,
          followUpStatus,
          remarks,
        },
        editing?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tax payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="font-display font-bold text-sm text-slate-900">
              {editing
                ? `${isReadOnly ? 'View' : 'Edit'} Tax Payment (${editing.paymentId})`
                : 'Record Tax Payment'}
            </h3>
            <p className="text-[11px] text-slate-500">
              Track LHDN payments, instalment balances, payment references, and verification status
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Client Picker */}
          <ClientSelectorField
            clients={clients}
            value={clientId}
            onSelectClient={handleClientSelect}
            disabled={isReadOnly}
            required
            label="Client"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Payment Type *</label>
              <select
                disabled={isReadOnly}
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as TaxPaymentType)}
                className={inputCls}
              >
                {TAX_PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Year of Assessment (YA)</label>
              <input
                maxLength={16}
                disabled={isReadOnly}
                value={ya}
                onChange={(e) => setYa(e.target.value)}
                placeholder="2026"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Reference / Case No. (Bill No., Notice Ref, Instalment No.)</label>
            <input
              maxLength={120}
              disabled={isReadOnly}
              value={referenceCaseNo}
              onChange={(e) => setReferenceCaseNo(e.target.value)}
              placeholder="e.g. Bill No. 20260415-001 / Instalment #4"
              className={inputCls}
            />
          </div>

          {/* Financial Calculation Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <label className={labelCls}>Amount Due (RM) *</label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                disabled={isReadOnly}
                value={amountDue}
                onChange={(e) => setAmountDue(e.target.value)}
                className={`${inputCls} font-mono text-right`}
              />
            </div>
            <div>
              <label className={labelCls}>Amount Paid (RM)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                disabled={isReadOnly}
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className={`${inputCls} font-mono text-right`}
              />
            </div>
            <div>
              <label className={labelCls}>Outstanding Balance (RM)</label>
              <div
                className={`px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold rounded-md border text-right ${
                  liveOutstanding > 0
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {formatCurrencyRM(liveOutstanding)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Payment Date {numPaid > 0 ? <span className="text-rose-600">*</span> : null}
              </label>
              <input
                type="date"
                disabled={isReadOnly}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={`${inputCls} font-mono ${needsPaymentDate ? 'border-rose-400' : ''}`}
              />
              {needsPaymentDate && (
                <p className="mt-1 text-[11px] text-rose-600">
                  Required whenever Amount Paid is greater than 0.
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>
                Payment Reference (FPX / ByrHASiL Receipt No.)
                {verificationStatus === 'Verified' ? <span className="text-rose-600"> *</span> : null}
              </label>
              <input
                maxLength={120}
                disabled={isReadOnly}
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g. FPX20260415982311"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Verification Status</label>
              <select
                disabled={isReadOnly}
                value={verificationStatus}
                onChange={(e) =>
                  setVerificationStatus(e.target.value as TaxPaymentVerificationStatus)
                }
                className={inputCls}
              >
                {TAX_PAYMENT_VERIFICATION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              {verificationBlocked && (
                <p className="mt-1 text-[11px] text-rose-600">
                  Verified requires Amount Paid &gt; 0, Payment Date, and Payment Reference.
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Follow-Up Status</label>
              <select
                disabled={isReadOnly}
                value={followUpStatus}
                onChange={(e) => setFollowUpStatus(e.target.value as TaxPaymentFollowUpStatus)}
                className={inputCls}
              >
                {TAX_PAYMENT_FOLLOWUP_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Remarks</label>
            <textarea
              rows={2}
              maxLength={2000}
              disabled={isReadOnly}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className={inputCls}
            />
          </div>

          </div>

          <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              {isReadOnly ? 'Close' : 'Cancel'}
            </button>
            {!isReadOnly && (
              <button
                type="submit"
                disabled={saving || needsPaymentDate || verificationBlocked}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Record Payment'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// Tax Payment Monitor Main View
// =============================================================================
export const TaxPaymentMonitorView: React.FC = () => {
  const { isReadOnly, isManagerOrAdmin } = useAuth();
  const { taxPayments, deleteTaxPayment, refreshAll, refreshing } = useData();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState('');
  const [yaFilter, setYaFilter] = useState('');

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
  } = useColumnVisibility('tax_payments', PAYMENT_COLUMNS, ['paymentId', 'clientName']);
  const { headerRowRef, getHeaderStickyProps, getCellStickyProps } = usePinnedColumnOffsets(
    pinnedActiveKeys,
    PAYMENT_COL_FALLBACK_WIDTHS
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TaxPaymentRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const distinctYas = useMemo(() => {
    const set = new Set<string>();
    for (const p of taxPayments) {
      if (p.ya) set.add(p.ya.trim());
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [taxPayments]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return taxPayments.filter((p) => {
      if (typeFilter && p.paymentType !== typeFilter) return false;
      if (verificationFilter && p.verificationStatus !== verificationFilter) return false;
      if (followUpFilter && p.followUpStatus !== followUpFilter) return false;
      if (yaFilter && (p.ya || '').trim() !== yaFilter) return false;
      if (q) {
        const hay = `${p.paymentId} ${p.clientName} ${p.clientId} ${p.paymentType} ${p.ya} ${p.referenceCaseNo} ${p.paymentReference} ${p.remarks}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [taxPayments, typeFilter, verificationFilter, followUpFilter, yaFilter, search]);

  const paymentValueGetters = useMemo(
    () => ({
      paymentId: (p: TaxPaymentRecord) => p.paymentId,
      clientName: (p: TaxPaymentRecord) => p.clientName,
      paymentType: (p: TaxPaymentRecord) => p.paymentType,
      ya: (p: TaxPaymentRecord) => p.ya || '',
      referenceCaseNo: (p: TaxPaymentRecord) => p.referenceCaseNo || '',
      dueDate: (p: TaxPaymentRecord) => formatDateDDMMYYYY(p.dueDate),
      amountDue: (p: TaxPaymentRecord) => p.amountDue,
      amountPaid: (p: TaxPaymentRecord) => p.amountPaid,
      outstandingAmount: (p: TaxPaymentRecord) => p.outstandingAmount,
      paymentDate: (p: TaxPaymentRecord) => formatDateDDMMYYYY(p.paymentDate),
      paymentReference: (p: TaxPaymentRecord) => p.paymentReference || '',
      verificationStatus: (p: TaxPaymentRecord) => p.verificationStatus,
      followUpStatus: (p: TaxPaymentRecord) => p.followUpStatus,
      remarks: (p: TaxPaymentRecord) => p.remarks || '',
    }),
    []
  );

  const excel = useExcelTableFilters(filteredPayments, paymentValueGetters);
  const displayedPayments = excel.rows;

  const totals = useMemo(() => {
    let totalDue = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let overdueCount = 0;
    for (const p of displayedPayments) {
      totalDue += safeNum(p.amountDue);
      totalPaid += safeNum(p.amountPaid);
      totalOutstanding += safeNum(p.outstandingAmount);
      if (p.outstandingAmount > 0 && p.dueDate && p.dueDate < todayStr) {
        overdueCount += 1;
      }
    }
    return { totalDue, totalPaid, totalOutstanding, overdueCount };
  }, [displayedPayments, todayStr]);

  const hasActiveFilters = Boolean(
    search.trim() ||
      typeFilter ||
      verificationFilter ||
      followUpFilter ||
      yaFilter ||
      excel.hasActiveColumnFilters
  );

  const handleResetFilters = () => {
    setSearch('');
    setTypeFilter('');
    setVerificationFilter('');
    setFollowUpFilter('');
    setYaFilter('');
    excel.resetColumnFilters();
  };

  const buildExport = () => {
    const cols = activeColumns.map((c) => ({
      key: c.key,
      label: c.label,
    }));
    const rows = displayedPayments.map((p) => ({
      paymentId: p.paymentId,
      clientName: `${p.clientName} (${p.clientId})`,
      paymentType: p.paymentType,
      ya: p.ya || '—',
      referenceCaseNo: p.referenceCaseNo || '—',
      dueDate: formatDateDDMMYYYY(p.dueDate),
      amountDue: formatCurrencyRM(p.amountDue),
      amountPaid: formatCurrencyRM(p.amountPaid),
      outstandingAmount: formatCurrencyRM(p.outstandingAmount),
      paymentDate: formatDateDDMMYYYY(p.paymentDate),
      paymentReference: p.paymentReference || '—',
      verificationStatus: p.verificationStatus,
      followUpStatus: p.followUpStatus,
      remarks: p.remarks || '',
    }));
    return { cols, rows };
  };

  const handleExportExcel = () => {
    const { cols, rows } = buildExport();
    exportToExcel(`TPMS_Tax_Payments_${todayStr}`, 'Tax Payments', cols, rows);
  };

  const handlePrint = () => {
    const { cols, rows } = buildExport();
    printRegisterHtml(
      'Tax Payment Monitor',
      `Total Due: ${formatCurrencyRM(totals.totalDue)} | Total Paid: ${formatCurrencyRM(
        totals.totalPaid
      )} | Outstanding: ${formatCurrencyRM(totals.totalOutstanding)}`,
      cols,
      rows,
      false
    );
  };

  const handleSavePdf = () => {
    const { cols, rows } = buildExport();
    printRegisterHtml(
      'Tax Payment Monitor',
      `Total Due: ${formatCurrencyRM(totals.totalDue)} | Total Paid: ${formatCurrencyRM(
        totals.totalPaid
      )} | Outstanding: ${formatCurrencyRM(totals.totalOutstanding)}`,
      cols,
      rows,
      true
    );
  };

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteTaxPayment(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const getVerificationColor = (status: TaxPaymentVerificationStatus): string => {
    switch (status) {
      case 'Verified':
        return '#047857';
      case 'Pending Verification':
        return '#d97706';
      case 'Rejected / Mismatch':
        return '#be123c';
      default:
        return '#475569';
    }
  };

  const getFollowUpColor = (status: TaxPaymentFollowUpStatus): string => {
    switch (status) {
      case 'Verified Paid':
        return '#047857';
      case 'Paid - Pending Verification':
        return '#0369a1';
      case 'Partially Paid':
        return '#d97706';
      case 'Overdue':
        return '#be123c';
      case 'On Hold':
        return '#64748b';
      default:
        return '#b45309';
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-lg text-slate-900 tracking-tight">
            Tax Payment Monitor
          </h1>
          <p className="text-xs text-slate-500">
            Track CP204 instalments, Form C balances, audit settlements, penalties, receipts, and LHDN payment verification
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          className="no-print inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Total Due (Filtered)</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-slate-900">
            {formatCurrencyRM(totals.totalDue)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Total Paid (Filtered)</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-emerald-700">
            {formatCurrencyRM(totals.totalPaid)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Total Outstanding</div>
          <div
            className={`mt-0.5 font-mono tabular-nums text-base font-bold ${
              totals.totalOutstanding > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {formatCurrencyRM(totals.totalOutstanding)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Overdue Unpaid Items</div>
          <div
            className={`mt-0.5 font-mono tabular-nums text-base font-bold ${
              totals.overdueCount > 0 ? 'text-rose-700' : 'text-slate-800'
            }`}
          >
            {totals.overdueCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search Payment ID, client, reference/case no., FPX receipt, or remarks..."
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
        columns={orderedColumns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        pinnedColumns={pinnedColumns}
        onTogglePin={togglePin}
        onMoveColumn={moveColumn}
        onReorderColumn={reorderColumn}
        onExportExcel={handleExportExcel}
        onPrint={handlePrint}
        onSavePdf={handleSavePdf}
        recordCount={displayedPayments.length}
        totalCount={taxPayments.length}
        primaryAction={
          !isReadOnly ? (
            <button
              type="button"
              onClick={() => {
                setEditingRecord(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Record Tax Payment
            </button>
          ) : undefined
        }
        filters={
          <>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Payment Types</option>
              {TAX_PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Verification</option>
              {TAX_PAYMENT_VERIFICATION_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <select
              value={followUpFilter}
              onChange={(e) => setFollowUpFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Follow-Up Status</option>
              {TAX_PAYMENT_FOLLOWUP_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <select
              value={yaFilter}
              onChange={(e) => setYaFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All YA</option>
              {distinctYas.map((y) => (
                <option key={y} value={y}>
                  YA {y}
                </option>
              ))}
            </select>
          </>
        }
      />

      {/* Register Table */}
      <div className="max-h-[calc(100vh-64px)] overflow-auto relative bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm border-b border-slate-200 text-slate-700">
            <tr ref={headerRowRef}>
              {activeColumns.map((col) => {
                const stickyTh = getHeaderStickyProps(col.key);
                return (
                  <th
                    key={col.key}
                    data-pinned-col={stickyTh['data-pinned-col']}
                    style={stickyTh.style}
                    className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b border-slate-200 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${PAYMENT_COL_WIDTHS[col.key] || 'min-w-[120px]'} ${stickyTh.className}`}
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
                      align={col.align === 'right' ? 'right' : 'left'}
                    />
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-right text-xs font-semibold whitespace-nowrap border-b border-slate-200 min-w-[115px] no-print">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
              {displayedPayments.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length + 1} className="px-4 py-12 text-center text-slate-500">
                    {taxPayments.length === 0
                      ? 'No tax payments recorded yet. Click "+ Record Tax Payment" to log an entry.'
                      : 'No tax payments match the current filters.'}
                  </td>
                </tr>
              ) : (
                displayedPayments.map((p) => {
                  const isOverdue = p.outstandingAmount > 0 && Boolean(p.dueDate) && p.dueDate < todayStr;
                  return (
                    <tr key={p.id} className="group hover:bg-slate-50 align-top">
                      {activeColumns.map((col) => {
                        const key = col.key;
                        const stickyTd = getCellStickyProps(key);
                        const colWidth = PAYMENT_COL_WIDTHS[key] || 'min-w-[120px]';
                        const wrapTd = (
                          cls: string,
                          content: React.ReactNode,
                          title?: string
                        ) => (
                          <td
                            key={key}
                            style={stickyTd.style}
                            title={title}
                            className={`${cls} ${colWidth} ${stickyTd.className}`}
                          >
                            {content}
                          </td>
                        );

                        switch (key) {
                          case 'paymentId':
                            return wrapTd(
                              'px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap',
                              p.paymentId
                            );
                          case 'clientName':
                            return wrapTd(
                              'px-3 py-2',
                              <>
                                <div className="font-semibold text-slate-900 leading-snug">
                                  {p.clientName}
                                </div>
                                <div className="text-[11px] font-mono text-slate-400">
                                  {p.clientId}
                                </div>
                              </>
                            );
                          case 'paymentType':
                            return wrapTd(
                              'px-3 py-2 text-slate-700 whitespace-nowrap',
                              p.paymentType
                            );
                          case 'ya':
                            return wrapTd(
                              'px-3 py-2 font-mono text-slate-700 whitespace-nowrap',
                              p.ya || '—'
                            );
                          case 'referenceCaseNo':
                            return wrapTd(
                              'px-3 py-2 text-slate-700 max-w-[180px] truncate',
                              p.referenceCaseNo || '—',
                              p.referenceCaseNo
                            );
                          case 'dueDate':
                            return wrapTd(
                              'px-3 py-2 whitespace-nowrap',
                              <>
                                <div className="font-mono text-slate-800">
                                  {formatDateDDMMYYYY(p.dueDate)}
                                </div>
                                {isOverdue && (
                                  <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                                    Overdue
                                  </span>
                                )}
                              </>
                            );
                          case 'amountDue':
                            return wrapTd(
                              'px-3 py-2 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap',
                              formatCurrencyRM(p.amountDue)
                            );
                          case 'amountPaid':
                            return wrapTd(
                              'px-3 py-2 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap',
                              formatCurrencyRM(p.amountPaid)
                            );
                          case 'outstandingAmount':
                            return wrapTd(
                              'px-3 py-2 text-right font-mono tabular-nums font-semibold whitespace-nowrap',
                              <span
                                className={
                                  p.outstandingAmount > 0 ? 'text-rose-700' : 'text-emerald-700'
                                }
                              >
                                {formatCurrencyRM(p.outstandingAmount)}
                              </span>
                            );
                          case 'paymentDate':
                            return wrapTd(
                              'px-3 py-2 font-mono text-slate-700 whitespace-nowrap',
                              formatDateDDMMYYYY(p.paymentDate)
                            );
                          case 'paymentReference':
                            return wrapTd(
                              'px-3 py-2 font-mono text-slate-700 whitespace-nowrap',
                              p.paymentReference || '—'
                            );
                          case 'verificationStatus':
                            return wrapTd(
                              'px-3 py-2 whitespace-nowrap',
                              <StatusPill
                                group="PAYMENT_STATUS"
                                value={p.verificationStatus}
                                customColor={getVerificationColor(p.verificationStatus)}
                              />
                            );
                          case 'followUpStatus':
                            return wrapTd(
                              'px-3 py-2 whitespace-nowrap',
                              <StatusPill
                                group="PAYMENT_STATUS"
                                value={p.followUpStatus}
                                customColor={getFollowUpColor(p.followUpStatus)}
                              />
                            );
                          case 'remarks':
                            return wrapTd(
                              'px-3 py-2 whitespace-nowrap',
                              <RemarksPreviewCell
                                text={p.remarks}
                                recordTitle={p.clientName}
                                recordId={p.paymentId || p.clientId}
                                fieldLabel="Payment Remarks"
                              />
                            );
                          default:
                            return wrapTd('px-3 py-2 text-slate-600 whitespace-nowrap', '—');
                        }
                      })}
                      <td className="px-3 py-2 text-right whitespace-nowrap no-print">
                        {confirmDeleteId === p.id ? (
                          <div className="inline-flex items-center gap-1">
                            <span className="text-[11px] text-rose-700 font-medium mr-1">
                              Delete?
                            </span>
                            <button
                              type="button"
                              disabled={deletingId === p.id}
                              onClick={() => void handleConfirmDelete(p.id)}
                              className="p-1 rounded bg-rose-600 text-white hover:bg-rose-700"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRecord(p);
                                setModalOpen(true);
                              }}
                              className="text-xs font-medium text-teal-700 hover:underline"
                            >
                              {isReadOnly ? 'View' : 'Edit'}
                            </button>
                            {isManagerOrAdmin && (
                              <>
                                <span className="text-slate-300">·</span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(p.id)}
                                  className="text-xs font-medium text-rose-600 hover:text-rose-800 hover:underline"
                                  title="Delete payment"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
          </tbody>
        </table>
      </div>

      <TaxPaymentModal
        open={modalOpen}
        editing={editingRecord}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};
