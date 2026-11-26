import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Save,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  ClientRecord,
  ColumnDef,
  CORRESPONDENCE_ACTION_STATUSES,
  CORRESPONDENCE_CATEGORIES,
  CORRESPONDENCE_LETTER_TYPES,
  CORRESPONDENCE_METHODS,
  CorrespondenceActionStatus,
  CorrespondenceCategory,
  CorrespondenceLetterType,
  CorrespondenceMethod,
  CorrespondenceRecord,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { ClientSelectorField } from '../../components/ClientSelectorField';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { buildDynamicSelectOptions } from '../../lib/settingsDropdown';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { addCalendarDays, formatDateDDMMYYYY } from '../../lib/deadlineUtils';

type DueDateFilter = '' | 'overdue' | 'due7' | 'due14';

const CORRESPONDENCE_COLUMNS: ColumnDef[] = [
  { key: 'correspondenceId', label: 'ID', defaultVisible: true },
  { key: 'clientName', label: 'Client Name', defaultVisible: true },
  { key: 'ya', label: 'YA', defaultVisible: true },
  { key: 'dateReceived', label: 'Date Received', defaultVisible: true },
  { key: 'methodReceived', label: 'Method', defaultVisible: false },
  { key: 'category', label: 'Category', defaultVisible: true },
  { key: 'letterType', label: 'Letter Type', defaultVisible: true },
  { key: 'letterSubject', label: 'Subject & Ref No.', defaultVisible: true },
  { key: 'dueDate', label: 'Due Date', defaultVisible: true },
  { key: 'pic', label: 'PIC', defaultVisible: true },
  { key: 'actionStatus', label: 'Action Status', defaultVisible: true },
  { key: 'actionDate', label: 'Action Date', defaultVisible: false },
  { key: 'jobId', label: 'Linked Job', defaultVisible: true },
  { key: 'remarks', label: 'Remarks', defaultVisible: false },
];

const DEFAULT_VISIBLE = CORRESPONDENCE_COLUMNS.reduce<Record<string, boolean>>((acc, col) => {
  acc[col.key] = col.defaultVisible;
  return acc;
}, {});

const CLOSED_STATUSES = new Set<CorrespondenceActionStatus>([
  'Completed',
  'No Action Required',
  'Cancelled',
]);

const inputCls =
  'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-50 disabled:text-slate-500';
const labelCls = 'block text-[11px] font-medium text-slate-600 mb-1';

// =============================================================================
// Add / Edit Correspondence Modal
// =============================================================================
interface CorrespondenceModalProps {
  open: boolean;
  editing: CorrespondenceRecord | null;
  onClose: () => void;
}

const CorrespondenceModal: React.FC<CorrespondenceModalProps> = ({ open, editing, onClose }) => {
  const { isReadOnly } = useAuth();
  const { clients, jobs, staff, saveCorrespondence, getSettingsByGroup } = useData();

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [ya, setYa] = useState(String(new Date().getFullYear()));
  const [jobId, setJobId] = useState('');
  const [dateReceived, setDateReceived] = useState('');
  const [methodReceived, setMethodReceived] = useState<CorrespondenceMethod>('Email');
  const [category, setCategory] = useState<CorrespondenceCategory>('LHDN');
  const [letterType, setLetterType] = useState<CorrespondenceLetterType>('Notice');
  const [letterSubject, setLetterSubject] = useState('');
  const [letterReferenceNo, setLetterReferenceNo] = useState('');
  const [detailedInformation, setDetailedInformation] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [actionRequired, setActionRequired] = useState('');
  const [pic, setPic] = useState('');
  const [actionStatus, setActionStatus] = useState<CorrespondenceActionStatus>('Pending');
  const [actionDate, setActionDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientJobs = useMemo(
    () => (clientId ? jobs.filter((j) => j.clientId === clientId) : []),
    [jobs, clientId]
  );

  const activeStaffNames = useMemo(
    () => staff.filter((s) => s.active).map((s) => s.staffName),
    [staff]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    if (editing) {
      setClientId(editing.clientId);
      setClientName(editing.clientName);
      setYa(editing.ya || '');
      setJobId(editing.jobId || '');
      setDateReceived(editing.dateReceived || '');
      setMethodReceived(editing.methodReceived || 'Email');
      setCategory(editing.category || 'LHDN');
      setLetterType(editing.letterType || 'Notice');
      setLetterSubject(editing.letterSubject || '');
      setLetterReferenceNo(editing.letterReferenceNo || '');
      setDetailedInformation(editing.detailedInformation || '');
      setDueDate(editing.dueDate || '');
      setActionRequired(editing.actionRequired || '');
      setPic(editing.pic || '');
      setActionStatus(editing.actionStatus || 'Pending');
      setActionDate(editing.actionDate || '');
      setRemarks(editing.remarks || '');
      setAttachmentUrl(editing.attachmentUrl || '');
    } else {
      setClientId('');
      setClientName('');
      setYa(String(new Date().getFullYear()));
      setJobId('');
      setDateReceived(today);
      setMethodReceived('Email');
      setCategory('LHDN');
      setLetterType('Notice');
      setLetterSubject('');
      setLetterReferenceNo('');
      setDetailedInformation('');
      setDueDate('');
      setActionRequired('');
      setPic('');
      setActionStatus('Pending');
      setActionDate('');
      setRemarks('');
      setAttachmentUrl('');
    }
  }, [open, editing]);

  if (!open) return null;

  const methodOptions = buildDynamicSelectOptions(
    getSettingsByGroup('METHOD_RECEIVED'),
    CORRESPONDENCE_METHODS,
    methodReceived
  );
  const categoryOptions = buildDynamicSelectOptions(
    getSettingsByGroup('CORRESPONDENCE_CATEGORY'),
    CORRESPONDENCE_CATEGORIES,
    category
  );
  const letterTypeOptions = buildDynamicSelectOptions(
    getSettingsByGroup('LETTER_TYPE'),
    CORRESPONDENCE_LETTER_TYPES,
    letterType
  );

  const handleSelectClient = (found: ClientRecord | null) => {
    if (!found) {
      setClientId('');
      setClientName('');
      setJobId('');
      return;
    }
    setClientId(found.clientId);
    setClientName(found.clientName);
    setJobId('');
    if (found.taxPic) setPic(found.taxPic);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setError(null);
    if (!clientId) {
      setError('Please select a client.');
      return;
    }
    if (!letterSubject.trim()) {
      setError('Letter Subject is required.');
      return;
    }
    setSaving(true);
    try {
      await saveCorrespondence(
        {
          correspondenceId: editing?.correspondenceId,
          clientId,
          clientName,
          ya,
          jobId,
          dateReceived,
          methodReceived,
          category,
          letterType,
          letterSubject,
          letterReferenceNo,
          detailedInformation,
          dueDate,
          actionRequired,
          pic,
          actionStatus,
          actionDate,
          remarks,
          attachmentUrl,
        },
        editing?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save correspondence.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-3xl max-h-[93vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-sm text-slate-900">
              {editing
                ? `${isReadOnly ? 'View' : 'Edit'} Correspondence (${editing.correspondenceId})`
                : 'Add Correspondence'}
            </h3>
            <p className="text-[11px] text-slate-500">
              Log LHDN notices, queries, audits, appeals, SSM letters, and client or auditor correspondence
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Client + Linked Job */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-7">
              <ClientSelectorField
                clients={clients}
                value={clientId}
                onSelectClient={handleSelectClient}
                disabled={isReadOnly}
                required
                label="Client"
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>YA</label>
              <input
                maxLength={16}
                disabled={isReadOnly}
                value={ya}
                onChange={(e) => setYa(e.target.value)}
                placeholder="2026"
                className={`${inputCls} font-mono`}
              />
            </div>

            <div className="md:col-span-3">
              <label className={labelCls}>Linked Job (Optional)</label>
              <select
                disabled={isReadOnly || !clientId}
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className={inputCls}
              >
                <option value="">— None —</option>
                {clientJobs.map((j) => (
                  <option key={j.id} value={j.jobCode || j.id}>
                    {j.jobCode} · {j.jobType || j.module} {j.ya ? `(YA ${j.ya})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reception & Classification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Date Received</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={dateReceived}
                onChange={(e) => setDateReceived(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Method Received</label>
              <select
                disabled={isReadOnly}
                value={methodReceived}
                onChange={(e) => setMethodReceived(e.target.value as CorrespondenceMethod)}
                className={inputCls}
              >
                {methodOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select
                disabled={isReadOnly}
                value={category}
                onChange={(e) => setCategory(e.target.value as CorrespondenceCategory)}
                className={inputCls}
              >
                {categoryOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Letter Type</label>
              <select
                disabled={isReadOnly}
                value={letterType}
                onChange={(e) => setLetterType(e.target.value as CorrespondenceLetterType)}
                className={inputCls}
              >
                {letterTypeOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject & Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label className={labelCls}>Letter Subject *</label>
              <input
                required
                maxLength={300}
                disabled={isReadOnly}
                value={letterSubject}
                onChange={(e) => setLetterSubject(e.target.value)}
                placeholder="e.g. LHDN Desk Audit Query — Entertainment & Legal Expenses YA 2024"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-4">
              <label className={labelCls}>Letter Reference No.</label>
              <input
                maxLength={120}
                disabled={isReadOnly}
                value={letterReferenceNo}
                onChange={(e) => setLetterReferenceNo(e.target.value)}
                placeholder="e.g. LHDN.KL/2026/88412"
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Detailed Information</label>
            <textarea
              rows={2}
              maxLength={4000}
              disabled={isReadOnly}
              value={detailedInformation}
              onChange={(e) => setDetailedInformation(e.target.value)}
              placeholder="Summary of LHDN/authority notice, assessment figures, or documents requested..."
              className={inputCls}
            />
          </div>

          {/* Action & Deadlines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <div>
              <label className={labelCls}>PIC</label>
              <input
                list="cor-modal-staff"
                maxLength={120}
                disabled={isReadOnly}
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                className={inputCls}
              />
              <datalist id="cor-modal-staff">
                {activeStaffNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Action Status</label>
              <select
                disabled={isReadOnly}
                value={actionStatus}
                onChange={(e) => setActionStatus(e.target.value as CorrespondenceActionStatus)}
                className={inputCls}
              >
                {CORRESPONDENCE_ACTION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Action Date</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={actionDate}
                onChange={(e) => setActionDate(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Action Required</label>
              <input
                maxLength={1000}
                disabled={isReadOnly}
                value={actionRequired}
                onChange={(e) => setActionRequired(e.target.value)}
                placeholder="e.g. Prepare supporting invoices & submit reply via MyTax"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Attachment URL (Google Drive / PDF Link)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  maxLength={500}
                  disabled={isReadOnly}
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="https://..."
                  className={inputCls}
                />
                {attachmentUrl && (
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded border border-slate-200 text-teal-700 hover:bg-teal-50 shrink-0"
                    title="Open attachment"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
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

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
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
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Correspondence'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// Correspondence Register Main View
// =============================================================================
export const CorrespondenceView: React.FC = () => {
  const { isReadOnly, isManagerOrAdmin } = useAuth();
  const { correspondenceRecords, deleteCorrespondence, refreshAll, refreshing, getSettingsByGroup } =
    useData();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>('');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(DEFAULT_VISIBLE);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CorrespondenceRecord | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const in7DaysStr = useMemo(() => addCalendarDays(todayStr, 7), [todayStr]);
  const in14DaysStr = useMemo(() => addCalendarDays(todayStr, 14), [todayStr]);

  const kpis = useMemo(() => {
    let overdue = 0;
    let due7 = 0;
    let due14 = 0;
    for (const r of correspondenceRecords) {
      if (CLOSED_STATUSES.has(r.actionStatus) || !r.dueDate) continue;
      if (r.dueDate < todayStr) overdue += 1;
      else {
        if (r.dueDate <= in7DaysStr) due7 += 1;
        if (r.dueDate <= in14DaysStr) due14 += 1;
      }
    }
    return {
      total: correspondenceRecords.length,
      overdue,
      due7,
      due14,
    };
  }, [correspondenceRecords, todayStr, in7DaysStr, in14DaysStr]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return correspondenceRecords.filter((r) => {
      if (statusFilter && r.actionStatus !== statusFilter) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (dueDateFilter) {
        if (CLOSED_STATUSES.has(r.actionStatus) || !r.dueDate) return false;
        if (dueDateFilter === 'overdue' && !(r.dueDate < todayStr)) return false;
        if (dueDateFilter === 'due7' && !(r.dueDate >= todayStr && r.dueDate <= in7DaysStr))
          return false;
        if (dueDateFilter === 'due14' && !(r.dueDate >= todayStr && r.dueDate <= in14DaysStr))
          return false;
      }
      if (q) {
        const hay = `${r.correspondenceId} ${r.clientName} ${r.clientId} ${r.ya} ${r.jobId} ${r.category} ${r.letterType} ${r.letterSubject} ${r.letterReferenceNo} ${r.pic} ${r.actionRequired} ${r.remarks}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    correspondenceRecords,
    statusFilter,
    categoryFilter,
    dueDateFilter,
    todayStr,
    in7DaysStr,
    in14DaysStr,
    search,
  ]);

  const categoryFilterOptions = useMemo(
    () =>
      buildDynamicSelectOptions(
        getSettingsByGroup('CORRESPONDENCE_CATEGORY'),
        CORRESPONDENCE_CATEGORIES,
        categoryFilter
      ),
    [getSettingsByGroup, categoryFilter]
  );

  const correspondenceValueGetters = useMemo(
    () => ({
      correspondenceId: (r: CorrespondenceRecord) => r.correspondenceId,
      clientName: (r: CorrespondenceRecord) => r.clientName,
      ya: (r: CorrespondenceRecord) => r.ya || '',
      dateReceived: (r: CorrespondenceRecord) => formatDateDDMMYYYY(r.dateReceived),
      methodReceived: (r: CorrespondenceRecord) => r.methodReceived,
      category: (r: CorrespondenceRecord) => r.category,
      letterType: (r: CorrespondenceRecord) => r.letterType,
      letterSubject: (r: CorrespondenceRecord) => r.letterSubject,
      dueDate: (r: CorrespondenceRecord) => formatDateDDMMYYYY(r.dueDate),
      pic: (r: CorrespondenceRecord) => r.pic || '',
      actionStatus: (r: CorrespondenceRecord) => r.actionStatus,
      actionDate: (r: CorrespondenceRecord) => formatDateDDMMYYYY(r.actionDate),
      jobId: (r: CorrespondenceRecord) => r.jobId || '',
      remarks: (r: CorrespondenceRecord) => r.remarks || '',
    }),
    []
  );

  const excel = useExcelTableFilters(filteredRecords, correspondenceValueGetters);
  const displayedRecords = excel.rows;

  const hasActiveFilters = Boolean(
    search.trim() ||
      statusFilter ||
      categoryFilter ||
      dueDateFilter ||
      excel.hasActiveColumnFilters
  );

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setCategoryFilter('');
    setDueDateFilter('');
    excel.resetColumnFilters();
  };

  const handleToggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const buildExport = () => {
    const cols = CORRESPONDENCE_COLUMNS.filter((c) => visibleColumns[c.key]).map((c) => ({
      key: c.key,
      label: c.label,
    }));
    const rows = displayedRecords.map((r) => ({
      correspondenceId: r.correspondenceId,
      clientName: `${r.clientName} (${r.clientId})`,
      ya: r.ya || '—',
      dateReceived: formatDateDDMMYYYY(r.dateReceived),
      methodReceived: r.methodReceived,
      category: r.category,
      letterType: r.letterType,
      letterSubject: r.letterReferenceNo
        ? `${r.letterSubject} [Ref: ${r.letterReferenceNo}]`
        : r.letterSubject,
      dueDate: formatDateDDMMYYYY(r.dueDate),
      pic: r.pic || '—',
      actionStatus: r.actionStatus,
      actionDate: formatDateDDMMYYYY(r.actionDate),
      jobId: r.jobId || '—',
      remarks: r.remarks || '',
    }));
    return { cols, rows };
  };

  const handleExportExcel = () => {
    const { cols, rows } = buildExport();
    exportToExcel(`TPMS_Correspondence_${todayStr}`, 'Correspondence', cols, rows);
  };

  const handlePrint = () => {
    const { cols, rows } = buildExport();
    printRegisterHtml(
      'Correspondence Register',
      `${displayedRecords.length} correspondence record(s) | Overdue: ${kpis.overdue}`,
      cols,
      rows,
      false
    );
  };

  const handleSavePdf = () => {
    const { cols, rows } = buildExport();
    printRegisterHtml(
      'Correspondence Register',
      `${displayedRecords.length} correspondence record(s) | Overdue: ${kpis.overdue}`,
      cols,
      rows,
      true
    );
  };

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCorrespondence(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusColor = (st: CorrespondenceActionStatus): string => {
    switch (st) {
      case 'Completed':
        return '#047857';
      case 'In Progress':
        return '#0369a1';
      case 'Pending':
        return '#d97706';
      case 'No Action Required':
        return '#64748b';
      case 'Cancelled':
        return '#94a3b8';
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-lg text-slate-900 tracking-tight">
            Correspondence
          </h1>
          <p className="text-xs text-slate-500">
            Central register for LHDN notices, queries, assessments, audits, appeals, SSM letters, and response deadlines
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

      {/* Clickable Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setDueDateFilter('')}
          className={`text-left bg-white border rounded-lg px-3.5 py-2.5 transition-colors ${
            dueDateFilter === ''
              ? 'border-teal-600 ring-1 ring-teal-600/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Total Correspondence</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-slate-900">
            {kpis.total.toLocaleString()}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setDueDateFilter((prev) => (prev === 'overdue' ? '' : 'overdue'))}
          className={`text-left bg-white border rounded-lg px-3.5 py-2.5 transition-colors ${
            dueDateFilter === 'overdue'
              ? 'border-rose-500 ring-1 ring-rose-500/20 bg-rose-50/40'
              : 'border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Overdue</div>
          <div
            className={`mt-0.5 font-mono tabular-nums text-base font-bold ${
              kpis.overdue > 0 ? 'text-rose-700' : 'text-slate-800'
            }`}
          >
            {kpis.overdue.toLocaleString()}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setDueDateFilter((prev) => (prev === 'due7' ? '' : 'due7'))}
          className={`text-left bg-white border rounded-lg px-3.5 py-2.5 transition-colors ${
            dueDateFilter === 'due7'
              ? 'border-amber-500 ring-1 ring-amber-500/20 bg-amber-50/40'
              : 'border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Due in 7 Days</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-amber-700">
            {kpis.due7.toLocaleString()}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setDueDateFilter((prev) => (prev === 'due14' ? '' : 'due14'))}
          className={`text-left bg-white border rounded-lg px-3.5 py-2.5 transition-colors ${
            dueDateFilter === 'due14'
              ? 'border-sky-500 ring-1 ring-sky-500/20 bg-sky-50/40'
              : 'border-slate-200 hover:border-sky-300'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-500">Due in 14 Days</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-sky-700">
            {kpis.due14.toLocaleString()}
          </div>
        </button>
      </div>

      {/* Toolbar */}
      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search ID, client, subject, letter ref, PIC, linked job, or remarks..."
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
        columns={CORRESPONDENCE_COLUMNS}
        visibleColumns={visibleColumns}
        onToggleColumn={handleToggleColumn}
        onResetColumns={() => setVisibleColumns(DEFAULT_VISIBLE)}
        onExportExcel={handleExportExcel}
        onPrint={handlePrint}
        onSavePdf={handleSavePdf}
        recordCount={displayedRecords.length}
        totalCount={correspondenceRecords.length}
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
              Add Correspondence
            </button>
          ) : undefined
        }
        filters={
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Action Statuses</option>
              {CORRESPONDENCE_ACTION_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Categories</option>
              {categoryFilterOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={dueDateFilter}
              onChange={(e) => setDueDateFilter(e.target.value as DueDateFilter)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Due Dates</option>
              <option value="overdue">Overdue</option>
              <option value="due7">Due in 7 days</option>
              <option value="due14">Due in 14 days</option>
            </select>
          </>
        }
      />

      {/* Register Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 text-slate-700">
              <tr>
                {CORRESPONDENCE_COLUMNS.filter((c) => visibleColumns[c.key]).map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2.5 text-left font-semibold whitespace-nowrap"
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
                    />
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap no-print">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-slate-500">
                    {correspondenceRecords.length === 0
                      ? 'No correspondence logged yet. Click "+ Add Correspondence" to record a letter or notice.'
                      : 'No correspondence records match the current filters.'}
                  </td>
                </tr>
              ) : (
                displayedRecords.map((r) => {
                  const isOpen = !CLOSED_STATUSES.has(r.actionStatus);
                  const isOverdue = isOpen && Boolean(r.dueDate) && r.dueDate < todayStr;
                  const isDueSoon =
                    isOpen && Boolean(r.dueDate) && r.dueDate >= todayStr && r.dueDate <= in7DaysStr;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/90 align-top">
                      {visibleColumns.correspondenceId && (
                        <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                          {r.correspondenceId}
                        </td>
                      )}
                      {visibleColumns.clientName && (
                        <td className="px-3 py-2 min-w-[175px]">
                          <div className="font-semibold text-slate-900 leading-snug">
                            {r.clientName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">{r.clientId}</div>
                        </td>
                      )}
                      {visibleColumns.ya && (
                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                          {r.ya || '—'}
                        </td>
                      )}
                      {visibleColumns.dateReceived && (
                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                          {formatDateDDMMYYYY(r.dateReceived)}
                        </td>
                      )}
                      {visibleColumns.methodReceived && (
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {r.methodReceived}
                        </td>
                      )}
                      {visibleColumns.category && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                            {r.category}
                          </span>
                        </td>
                      )}
                      {visibleColumns.letterType && (
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {r.letterType}
                        </td>
                      )}
                      {visibleColumns.letterSubject && (
                        <td className="px-3 py-2 min-w-[220px] max-w-[300px]">
                          <div className="font-medium text-slate-900 leading-snug flex items-start gap-1.5">
                            <span className="break-words">{r.letterSubject}</span>
                            {r.attachmentUrl && (
                              <a
                                href={r.attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-teal-700 hover:text-teal-900 shrink-0 mt-0.5"
                                title="Open attachment"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          {r.letterReferenceNo && (
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                              Ref: {r.letterReferenceNo}
                            </div>
                          )}
                          {r.actionRequired && (
                            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                              Action: {r.actionRequired}
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.dueDate && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="font-mono text-slate-800">
                            {formatDateDDMMYYYY(r.dueDate)}
                          </div>
                          {isOverdue && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-100 text-rose-700">
                              Overdue
                            </span>
                          )}
                          {!isOverdue && isDueSoon && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                              Due &le; 7d
                            </span>
                          )}
                        </td>
                      )}
                      {visibleColumns.pic && (
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {r.pic || '—'}
                        </td>
                      )}
                      {visibleColumns.actionStatus && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <StatusPill
                            group="CORRESPONDENCE_STATUS"
                            value={r.actionStatus}
                            customColor={getStatusColor(r.actionStatus)}
                          />
                        </td>
                      )}
                      {visibleColumns.actionDate && (
                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                          {formatDateDDMMYYYY(r.actionDate)}
                        </td>
                      )}
                      {visibleColumns.jobId && (
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                          {r.jobId || '—'}
                        </td>
                      )}
                      {visibleColumns.remarks && (
                        <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate" title={r.remarks}>
                          {r.remarks || '—'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right whitespace-nowrap no-print">
                        {confirmDeleteId === r.id ? (
                          <div className="inline-flex items-center gap-1">
                            <span className="text-[11px] text-rose-700 font-medium mr-1">
                              Delete?
                            </span>
                            <button
                              type="button"
                              disabled={deletingId === r.id}
                              onClick={() => void handleConfirmDelete(r.id)}
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
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRecord(r);
                                setModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline"
                            >
                              <Edit3 className="w-3 h-3" />
                              {isReadOnly ? 'View' : 'Edit'}
                            </button>
                            {isManagerOrAdmin && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(r.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                                title="Delete correspondence"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
      </div>

      <CorrespondenceModal
        open={modalOpen}
        editing={editingRecord}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};
