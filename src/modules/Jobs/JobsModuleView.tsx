import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Briefcase,
  Layers,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  ColumnDef,
  formatCurrencyRM,
  FYE_MONTHS,
  JOB_TYPES,
  JobHistoryEntry,
  JobModule,
  NavigationFilterPreset,
  TaxJob,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useColumnVisibility, usePinnedColumnOffsets } from '../../hooks/useColumnVisibility';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { RemarksPreviewCell } from '../../components/RemarksPreviewCell';
import { exportTableToPdf, exportToExcel, printTable } from '../../lib/exportUtils';
import { showToast } from '../../lib/toast';
import {
  AUDIT_TYPE_OPTIONS,
  addCalendarDays,
  analyzeJobDeadlines,
  buildClientLookupMap,
  extractFyeMonth,
  findMatchedClient,
  formatDateDDMMYYYY,
  formatOverdueLabel,
  getAuditTypePillClasses,
  getDeadlineStageBadge,
  getLatestSsmEot,
  getOverdueDays,
  getShortDeadlineRule,
  getSsmEotPillClasses,
  getStagePillClasses,
  getSubmissionStatusPillClasses,
  getYaSequencePillClasses,
  isIsoDateString,
  latestIsoDate,
  recomputeJobDeadlinesAndStatus,
  resolveJobDisplayFye,
} from '../../lib/jobUtils';
import { JobModal, JobModalTab } from './JobModal';
import { BatchAddJobsModal, BatchModalVariant } from './BatchAddJobsModal';

interface JobsModuleViewProps {
  mode: 'ALL' | JobModule;
  initialFilter?: NavigationFilterPreset | null;
}

const PAGE_SIZE = 50;

// Proportional Landscape A4 column width hints (ensures dates, EOT stages, and Overdue [N]d never clip)
const JOB_PDF_COLUMN_WEIGHTS: Record<string, number> = {
  clientId: 12,
  clientName: 27,
  jobCode: 15,
  module: 12,
  jobType: 11,
  groupId: 10,
  fye: 6,
  ya: 9,
  taxPic: 12,
  reviewer: 12,
  finalApplicableDeadline: 20,
  ssmEot: 14,
  status: 17,
  formC: 15,
  mitrs: 15,
  mitrsDueDate: 14,
  originalStatutoryDeadline: 14,
  formCDueDate: 14,
  internalDeadline: 14,
  lhdnEot1: 14,
  auditType: 11,
  auditBookInDate: 14,
  auditReportReceivedDate: 14,
  auditor: 15,
  workDoneStatus: 14,
  billingStatus: 14,
  remarks: 24,
  finalTaxPayable: 13,
  feeAmount: 12,
  checklistProgress: 10,
};

function getJobColumnMinWidth(key: string): string {
  switch (key) {
    case 'clientId':
      return 'w-[110px] min-w-[110px]';
    case 'clientName':
      return 'min-w-[225px]';
    case 'jobCode':
      return 'min-w-[130px]';
    case 'module':
    case 'jobType':
    case 'groupId':
      return 'min-w-[115px]';
    case 'fye':
      return 'min-w-[75px]';
    case 'ya':
      return 'min-w-[90px]';
    case 'taxPic':
    case 'reviewer':
      return 'min-w-[125px]';
    case 'status':
    case 'workDoneStatus':
    case 'billingStatus':
    case 'formCStatus':
    case 'mitrsStatus':
    case 'formEStatus':
    case 'cp8dStatus':
    case 'formEaStatus':
    case 'submissionStatus':
    case 'accountsStatus':
    case 'priority':
      return 'min-w-[140px]';
    case 'formC':
    case 'mitrs':
      return 'min-w-[120px]';
    case 'auditType':
      return 'min-w-[105px]';
    case 'auditor':
      return 'min-w-[155px]';
    case 'remarks':
      return 'min-w-[210px]';
    case 'finalApplicableDeadline':
    case 'originalStatutoryDeadline':
    case 'formCDueDate':
    case 'internalDeadline':
    case 'lhdnEot1':
    case 'ssmEot':
    case 'mitrsDueDate':
    case 'dueDate':
    case 'submissionDate':
    case 'auditBookInDate':
    case 'auditReportReceivedDate':
    case 'dateDocumentsReceived':
    case 'paymentDate':
    case 'letterDate':
    case 'responseDueDate':
    case 'responseSentDate':
      return 'min-w-[135px]';
    case 'finalTaxPayable':
    case 'feeAmount':
    case 'cp204Estimate':
    case 'cp204Revised6th':
    case 'cp204Revised9th':
    case 'cp204Revised11th':
    case 'amountDue':
    case 'amountPaid':
      return 'min-w-[130px]';
    default:
      return 'min-w-[115px]';
  }
}

const JOB_COL_FALLBACK_WIDTHS: Record<string, number> = {
  clientId: 110,
  clientName: 225,
  jobCode: 130,
  module: 115,
  jobType: 115,
  groupId: 115,
  fye: 75,
  ya: 90,
  taxPic: 125,
  reviewer: 125,
  status: 140,
  workDoneStatus: 140,
  billingStatus: 140,
  formCStatus: 140,
  mitrsStatus: 140,
  formEStatus: 140,
  cp8dStatus: 140,
  formEaStatus: 140,
  submissionStatus: 140,
  accountsStatus: 140,
  priority: 140,
  formC: 120,
  mitrs: 120,
  auditType: 105,
  auditor: 155,
  remarks: 210,
  finalApplicableDeadline: 135,
  originalStatutoryDeadline: 135,
  formCDueDate: 135,
  internalDeadline: 135,
  lhdnEot1: 135,
  ssmEot: 135,
  mitrsDueDate: 135,
  dueDate: 135,
  submissionDate: 135,
  auditBookInDate: 135,
  auditReportReceivedDate: 135,
  dateDocumentsReceived: 135,
  paymentDate: 135,
  letterDate: 135,
  responseDueDate: 135,
  responseSentDate: 135,
  finalTaxPayable: 130,
  feeAmount: 130,
  cp204Estimate: 130,
  cp204Revised6th: 130,
  cp204Revised9th: 130,
  cp204Revised11th: 130,
  amountDue: 130,
  amountPaid: 130,
};

function getColumnsForMode(mode: 'ALL' | JobModule): ColumnDef[] {
  // Corporate table layout with Client ID & Client Name anchored on the left
  if (mode === 'Corporate') {
    return [
      { key: 'clientId', label: 'Client ID', defaultVisible: true },
      { key: 'clientName', label: 'Client Name', defaultVisible: true },
      { key: 'jobType', label: 'Job Type', defaultVisible: true },
      { key: 'fye', label: 'FYE', defaultVisible: true },
      { key: 'ya', label: 'YA', defaultVisible: true },
      { key: 'taxPic', label: 'PIC', defaultVisible: true },
      { key: 'reviewer', label: 'Reviewer', defaultVisible: true },
      { key: 'finalApplicableDeadline', label: 'Final Deadline', defaultVisible: true },
      { key: 'ssmEot', label: 'SSM EOT', defaultVisible: true },
      { key: 'status', label: 'Status', defaultVisible: true },
      { key: 'formC', label: 'Form C', defaultVisible: true },
      { key: 'mitrs', label: 'MITRS', defaultVisible: true },
      { key: 'remarks', label: 'Job Remarks', defaultVisible: true },
      { key: 'auditType', label: 'Audit Type', defaultVisible: true },
      { key: 'auditor', label: 'Auditor', defaultVisible: true },
      { key: 'mitrsDueDate', label: 'MITRS Due Date', defaultVisible: true },
      { key: 'workDoneStatus', label: 'Work Done Status', defaultVisible: true },
      // Optional toggleable columns
      { key: 'jobCode', label: 'Job Code', defaultVisible: false, optional: true },
      { key: 'groupId', label: 'Group ID', defaultVisible: false, optional: true },
      {
        key: 'originalStatutoryDeadline',
        label: 'Orig. Statutory (+7m)',
        defaultVisible: false,
        optional: true,
      },
      { key: 'formCDueDate', label: 'Normal e-Filing (+8m)', defaultVisible: false, optional: true },
      { key: 'accountsStatus', label: 'Accounts Status', defaultVisible: false, optional: true },
      {
        key: 'auditBookInDate',
        label: 'Audit Book-In Date',
        defaultVisible: false,
        optional: true,
      },
      {
        key: 'auditReportReceivedDate',
        label: 'Audit Report Recv',
        defaultVisible: false,
        optional: true,
      },
      {
        key: 'finalTaxPayable',
        label: 'Final Tax Payable',
        defaultVisible: false,
        optional: true,
        align: 'right',
      },
      { key: 'checklistProgress', label: 'Checklist', defaultVisible: false, optional: true },
    ];
  }

  const base: ColumnDef[] = [
    { key: 'clientId', label: 'Client ID', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'jobCode', label: 'Job Code', defaultVisible: true },
    ...(mode === 'ALL' ? [{ key: 'module', label: 'Module', defaultVisible: true }] : []),
    { key: 'jobType', label: 'Job Type', defaultVisible: true },
    { key: 'groupId', label: 'Group ID', defaultVisible: false, optional: true },
    { key: 'ya', label: 'YA', defaultVisible: true },
    { key: 'fye', label: 'FYE', defaultVisible: true },
    { key: 'taxPic', label: 'TAX PIC', defaultVisible: true },
    { key: 'reviewer', label: 'Reviewer', defaultVisible: false, optional: true },
    { key: 'status', label: 'Status', defaultVisible: true },
    { key: 'priority', label: 'Priority', defaultVisible: false, optional: true },
  ];

  if (mode === 'Form E') {
    return [
      ...base,
      { key: 'originalStatutoryDeadline', label: 'Orig. Statutory', defaultVisible: true },
      { key: 'lhdnEot1', label: 'LHDN EOT 1', defaultVisible: false },
      { key: 'finalApplicableDeadline', label: 'Final Deadline', defaultVisible: true },
      { key: 'formEStatus', label: 'Form E Status', defaultVisible: true },
      { key: 'cp8dStatus', label: 'C.P.8D Status', defaultVisible: true },
      { key: 'formEaStatus', label: 'Form EA Status', defaultVisible: true },
      { key: 'submissionReference', label: 'Submission Ref', defaultVisible: false },
      { key: 'checklistProgress', label: 'Checklist', defaultVisible: true },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  if (mode === 'Individual') {
    return [
      ...base,
      { key: 'personNo', label: 'Person No.', defaultVisible: false },
      { key: 'originalStatutoryDeadline', label: 'Orig. Statutory', defaultVisible: true },
      { key: 'lhdnEot1', label: 'LHDN EOT 1', defaultVisible: false },
      { key: 'finalApplicableDeadline', label: 'Final Deadline', defaultVisible: true },
      { key: 'submissionStatus', label: 'Submission Status', defaultVisible: true },
      { key: 'submissionDate', label: 'Submission Date', defaultVisible: true },
      { key: 'finalTaxPayable', label: 'Final Tax Payable', defaultVisible: true, align: 'right' },
      { key: 'checklistProgress', label: 'Checklist', defaultVisible: true },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  if (mode === 'Ad Hoc') {
    return [
      ...base,
      { key: 'internalDeadline', label: 'Internal Deadline', defaultVisible: true },
      { key: 'finalApplicableDeadline', label: 'Final Deadline', defaultVisible: true },
      { key: 'dateDocumentsReceived', label: 'Docs Received', defaultVisible: false },
      { key: 'submissionStatus', label: 'Submission Status', defaultVisible: true },
      { key: 'feeAmount', label: 'Fee (RM)', defaultVisible: true, align: 'right' },
      { key: 'checklistProgress', label: 'Checklist', defaultVisible: true },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  if (mode === 'CP204') {
    return [
      ...base,
      { key: 'finalApplicableDeadline', label: 'Final Deadline', defaultVisible: true },
      { key: 'cp204Estimate', label: 'Initial CP204', defaultVisible: true, align: 'right' },
      { key: 'cp204Revised6th', label: '6th Mth Rev', defaultVisible: true, align: 'right' },
      { key: 'cp204Revised9th', label: '9th Mth Rev', defaultVisible: true, align: 'right' },
      { key: 'cp204Revised11th', label: '11th Mth Rev', defaultVisible: false, align: 'right' },
      { key: 'cp204InstallmentStart', label: 'Installment Start', defaultVisible: false },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  if (mode === 'Tax Payment Monitor') {
    return [
      ...base,
      { key: 'dueDate', label: 'Due Date', defaultVisible: true },
      { key: 'paymentType', label: 'Payment Type', defaultVisible: true },
      { key: 'installmentNo', label: 'Inst. No.', defaultVisible: true },
      { key: 'amountDue', label: 'Amount Due', defaultVisible: true, align: 'right' },
      { key: 'amountPaid', label: 'Amount Paid', defaultVisible: true, align: 'right' },
      { key: 'paymentDate', label: 'Payment Date', defaultVisible: true },
      { key: 'receiptNo', label: 'Receipt No.', defaultVisible: false },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  if (mode === 'Correspondence') {
    return [
      ...base,
      { key: 'correspondenceType', label: 'Type', defaultVisible: true },
      { key: 'letterRefNo', label: 'LHDN Ref No.', defaultVisible: true },
      { key: 'letterDate', label: 'Letter Date', defaultVisible: true },
      { key: 'responseDueDate', label: 'Response Due', defaultVisible: true },
      { key: 'responseSentDate', label: 'Response Sent', defaultVisible: false },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  // ALL JOBS
  return [
    ...base,
    { key: 'auditType', label: 'Audit Type', defaultVisible: true },
    { key: 'originalStatutoryDeadline', label: 'Orig. Statutory', defaultVisible: false },
    { key: 'internalDeadline', label: 'Internal Deadline', defaultVisible: false },
    { key: 'finalApplicableDeadline', label: 'Final Deadline', defaultVisible: true },
    { key: 'formCStatus', label: 'Form C', defaultVisible: false },
    { key: 'mitrsStatus', label: 'MITRS', defaultVisible: false },
    { key: 'formEStatus', label: 'Form E', defaultVisible: false },
    { key: 'submissionStatus', label: 'Submission Status', defaultVisible: true },
    { key: 'finalTaxPayable', label: 'Final Tax Payable', defaultVisible: true, align: 'right' },
    { key: 'checklistProgress', label: 'Checklist', defaultVisible: true },
    {
      key: 'auditBookInDate',
      label: 'Audit Book-In Date',
      defaultVisible: false,
      optional: true,
    },
    {
      key: 'auditReportReceivedDate',
      label: 'Audit Report Recv',
      defaultVisible: false,
      optional: true,
    },
    { key: 'feeAmount', label: 'Fee (RM)', defaultVisible: false, align: 'right' },
    { key: 'billingStatus', label: 'Billing Status', defaultVisible: false },
    { key: 'remarks', label: 'Remarks', defaultVisible: false },
  ];
}

const MODULE_DESCRIPTIONS: Record<'ALL' | JobModule, string> = {
  ALL: 'Unified Malaysian tax compliance register with automated statutory deadlines and audit trail',
  CP204: 'Corporate tax estimate filings (CP204) and 6th / 9th / 11th month revisions (CP204A)',
  Corporate: 'Form C (FYE+7m statutory, +8m e-Filing) & MITRS (+30d) corporate compliance register',
  Individual: 'Form B / Form BE / Form M / Form P individual income tax filings & LHDN EOTs',
  'Ad Hoc': 'Tax Audit, RPGT / CKHT, Tax Appeal, Tax Refund, Tax Residency & special engagements',
  'Form E': 'Employer remuneration return register (Form E, C.P.8D, Form EA sub-statuses)',
  'Tax Payment Monitor': 'CP204 / CP500 installments, balance tax, and ByrHASiL payment tracking',
  Correspondence: 'LHDN desk/field audits, Section 78/81 queries, and Form Q appeals',
};

function matchesJobView(job: TaxJob, mode: 'ALL' | JobModule): boolean {
  if (mode === 'ALL') return true;
  if (job.module === mode) return true;
  if (mode === 'Corporate' && (job.jobType === 'Form C' || job.jobType === 'MITRS')) return true;
  if (
    mode === 'Individual' &&
    ['Form B', 'Form BE', 'Form M', 'Form P'].includes(job.jobType || '')
  ) {
    return true;
  }
  if (mode === 'Form E' && job.jobType === 'Form E') return true;
  if (
    mode === 'Ad Hoc' &&
    ['Tax Audit', 'RPGT / CKHT', 'Tax Appeal', 'Tax Refund', 'Tax Residency', 'Other'].includes(
      job.jobType || ''
    ) &&
    job.module !== 'Individual'
  ) {
    return true;
  }
  return false;
}

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatMonthYearLabel(ym: string): string {
  const allMatch = /^ALL-(\d{2})$/.exec(ym);
  if (allMatch) {
    const idx = Number(allMatch[1]) - 1;
    return idx >= 0 && idx < 12 ? `${SHORT_MONTH_NAMES[idx]} (All)` : ym;
  }
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return ym;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return dt.toLocaleDateString('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function getStatusEffectiveDate(
  job: TaxJob,
  jobHistory: JobHistoryEntry[] | undefined
): string {
  if (isIsoDateString(job.statusDate)) {
    return formatDateDDMMYYYY(job.statusDate);
  }
  const statusLower = (job.status || '').trim().toLowerCase();

  if (statusLower === 'completed') {
    const iso =
      (isIsoDateString(job.completedDate) ? job.completedDate : '') ||
      latestIsoDate([job.mitrsSubmissionDate, job.formCSubmissionDate]);
    if (iso) return formatDateDDMMYYYY(iso);
  }

  if (statusLower === 'pending mitrs') {
    const iso =
      (isIsoDateString(job.formCSubmissionDate) ? job.formCSubmissionDate : '') ||
      (isIsoDateString(job.submissionDate) ? job.submissionDate : '');
    if (iso) return formatDateDDMMYYYY(iso);
  }

  // Check most recent audit history transition into current status
  if (jobHistory && jobHistory.length > 0) {
    const matching = jobHistory.find(
      (h) => (h.newStatus || '').trim().toLowerCase() === statusLower && h.timestamp
    );
    if (matching?.timestamp) {
      return formatDateDDMMYYYY(matching.timestamp);
    }
  }

  // Workflow milestone fallback by status
  if (statusLower.includes('client approval') && isIsoDateString(job.clientConfirmationDate)) {
    return formatDateDDMMYYYY(job.clientConfirmationDate);
  }
  if (statusLower.includes('review') && isIsoDateString(job.reviewDate)) {
    return formatDateDDMMYYYY(job.reviewDate);
  }
  if (statusLower.includes('submitted') && isIsoDateString(job.submissionDate)) {
    return formatDateDDMMYYYY(job.submissionDate);
  }
  if (statusLower.includes('pending docs') && isIsoDateString(job.dateDocumentsRequested)) {
    return formatDateDDMMYYYY(job.dateDocumentsRequested);
  }
  if (statusLower.includes('progress')) {
    const progressDate =
      (isIsoDateString(job.draftDate) ? job.draftDate : '') ||
      (isIsoDateString(job.dateDocumentsReceived) ? job.dateDocumentsReceived : '');
    if (progressDate) return formatDateDDMMYYYY(progressDate);
  }

  if (job.updatedAt) return formatDateDDMMYYYY(job.updatedAt);
  if (job.createdAt) return formatDateDDMMYYYY(job.createdAt);
  return '—';
}

export const JobsModuleView: React.FC<JobsModuleViewProps> = ({ mode, initialFilter }) => {
  const { isReadOnly, isManagerOrAdmin } = useAuth();
  const { jobs, clients, history, loading, batchUpdateJobs, deleteJob, getSettingsByGroup } =
    useData();

  const isCorporateView = mode === 'Corporate';
  const columns = useMemo(() => getColumnsForMode(mode), [mode]);
  const colKey = `jobs_v4_${mode.toLowerCase().replace(/\s+/g, '_')}`;
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
  } = useColumnVisibility(colKey, columns, ['clientId', 'clientName']);
  const { headerRowRef, getHeaderStickyProps, getCellStickyProps } = usePinnedColumnOffsets(
    pinnedActiveKeys,
    JOB_COL_FALLBACK_WIDTHS
  );

  const normalizePresetFye = (raw?: string) => {
    if (!raw) return '';
    const m = extractFyeMonth(raw);
    return m !== null ? String(m).padStart(2, '0') : raw.trim();
  };

  const [search, setSearch] = useState(() => initialFilter?.search ?? '');
  const [moduleFilter, setModuleFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [yaFilter, setYaFilter] = useState(() => (initialFilter?.ya ?? '').trim());
  const [fyeFilter, setFyeFilter] = useState(() => normalizePresetFye(initialFilter?.fye));
  const [picFilter, setPicFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState('');
  const [finalDeadlineFilter, setFinalDeadlineFilter] = useState('');
  const [deadlineMonthFilter, setDeadlineMonthFilter] = useState('');
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState<string>('2026');
  const monthPopoverRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<JobModalTab>('basic');
  const [editingJob, setEditingJob] = useState<TaxJob | null>(null);
  const [batchModalVariant, setBatchModalVariant] = useState<BatchModalVariant | null>(null);
  const [recomputingBatch, setRecomputingBatch] = useState(false);

  useEffect(() => {
    if (!monthPopoverOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (monthPopoverRef.current && !monthPopoverRef.current.contains(e.target as Node)) {
        setMonthPopoverOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMonthPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [monthPopoverOpen]);

  useEffect(() => {
    if (!initialFilter) return;
    setFyeFilter(normalizePresetFye(initialFilter.fye));
    setYaFilter((initialFilter.ya ?? '').trim());
    setSearch(initialFilter.search ?? '');
    setModuleFilter('');
    setJobTypeFilter('');
    setPicFilter('');
    setStatusFilter('');
    setAuditTypeFilter('');
    setFinalDeadlineFilter('');
    setDeadlineMonthFilter('');
  }, [initialFilter?.nonce]);

  // Reset pagination when filters or mode change
  useEffect(() => {
    setPage(1);
  }, [
    mode,
    search,
    moduleFilter,
    jobTypeFilter,
    yaFilter,
    fyeFilter,
    picFilter,
    statusFilter,
    auditTypeFilter,
    finalDeadlineFilter,
    deadlineMonthFilter,
  ]);

  const scopedJobs = useMemo(() => jobs.filter((j) => matchesJobView(j, mode)), [jobs, mode]);

  // Normalized client lookup by doc ID or normalized Client ID ("C 233" === "C233")
  const clientLookup = useMemo(() => buildClientLookupMap(clients), [clients]);

  // Fast job history lookup grouped by jobId (already sorted newest-first from DataContext)
  const historyByJobId = useMemo(() => {
    const map = new Map<string, JobHistoryEntry[]>();
    for (const entry of history) {
      const list = map.get(entry.jobId);
      if (list) {
        list.push(entry);
      } else {
        map.set(entry.jobId, [entry]);
      }
    }
    return map;
  }, [history]);

  const distinctYAs = useMemo(() => {
    const set = new Set<string>(
      scopedJobs.map((j) => (j.ya || '').trim()).filter(Boolean)
    );
    if (yaFilter) set.add(yaFilter.trim());
    return Array.from(set).sort().reverse();
  }, [scopedJobs, yaFilter]);

  const distinctPics = useMemo(
    () => Array.from(new Set(scopedJobs.map((j) => j.taxPic).filter(Boolean) as string[])).sort(),
    [scopedJobs]
  );

  const distinctStatuses = useMemo(() => {
    const fromSettings = getSettingsByGroup('JOB_STATUS').map((s) => s.displayName);
    const fromJobs = scopedJobs.map((j) => j.status).filter(Boolean);
    const merged = Array.from(
      new Set([
        ...fromJobs,
        ...(isCorporateView ? ['Pending MITRS', 'Completed'] : []),
        ...fromSettings,
      ])
    );
    return merged.sort();
  }, [scopedJobs, getSettingsByGroup, isCorporateView]);

  const distinctFyeMonths = useMemo(() => {
    const monthSet = new Set<number>();
    for (const j of scopedJobs) {
      const m = extractFyeMonth(resolveJobDisplayFye(j, clientLookup));
      if (m !== null) monthSet.add(m);
    }
    if (fyeFilter) {
      const fm = extractFyeMonth(fyeFilter);
      if (fm !== null) monthSet.add(fm);
    }
    const sorted = Array.from(monthSet).sort((a, b) => a - b);
    if (sorted.length === 0) {
      return FYE_MONTHS.map((m) => Number(m));
    }
    return sorted;
  }, [scopedJobs, clientLookup, fyeFilter]);

  const auditTypeFilterOptions = useMemo(() => {
    const fromSettings = getSettingsByGroup('AUDIT TYPE').map((s) => s.displayName.trim()).filter(Boolean);
    const fromJobs = scopedJobs.map((j) => (j.auditType || '').trim()).filter(Boolean);
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const item of [...AUDIT_TYPE_OPTIONS, ...fromSettings, ...fromJobs]) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(item);
      }
    }
    return ordered;
  }, [scopedJobs, getSettingsByGroup]);

  const { deadlineMonthCounts, availableDeadlineYears } = useMemo(() => {
    const counts = new Map<string, number>();
    const years = new Set<string>(['2026']);
    for (const j of scopedJobs) {
      const displayFye = resolveJobDisplayFye(j, clientLookup);
      const analysis = analyzeJobDeadlines(displayFye && !j.fye ? { ...j, fye: displayFye } : j);
      const d = analysis.finalApplicableDeadline || j.finalApplicableDeadline || j.dueDate || '';
      if (isIsoDateString(d)) {
        const ym = d.slice(0, 7);
        counts.set(ym, (counts.get(ym) ?? 0) + 1);
        years.add(d.slice(0, 4));
      }
    }
    return {
      deadlineMonthCounts: counts,
      availableDeadlineYears: Array.from(years).sort(),
    };
  }, [scopedJobs, clientLookup]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const in30DaysStr = addCalendarDays(todayStr, 30);
  const thisMonthStr = todayStr.slice(0, 7);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedJobs.filter((j) => {
      if (mode === 'ALL' && moduleFilter && j.module !== moduleFilter) return false;
      if (jobTypeFilter && (j.jobType || j.formType) !== jobTypeFilter) return false;
      if (yaFilter && (j.ya || '').trim() !== yaFilter.trim()) return false;
      const displayFye = resolveJobDisplayFye(j, clientLookup);
      if (fyeFilter) {
        const jobFyeNum = extractFyeMonth(displayFye);
        const filterFyeNum = extractFyeMonth(fyeFilter);
        if (jobFyeNum !== filterFyeNum) return false;
      }
      if (picFilter && j.taxPic !== picFilter) return false;
      if (statusFilter && j.status !== statusFilter) return false;
      if (auditTypeFilter) {
        const at = (j.auditType || '').trim();
        if (auditTypeFilter === '__BLANK__') {
          if (at !== '') return false;
        } else if (at.toLowerCase() !== auditTypeFilter.toLowerCase()) {
          return false;
        }
      }

      if (finalDeadlineFilter || deadlineMonthFilter) {
        const analysis = analyzeJobDeadlines(displayFye && !j.fye ? { ...j, fye: displayFye } : j);
        const effDate = analysis.finalApplicableDeadline || j.finalApplicableDeadline || j.dueDate || '';
        const shortRule = getShortDeadlineRule(analysis.winningRule);
        const isClosed =
          j.status === 'Completed' ||
          j.status === 'Paid (FPX / ByrHASiL)' ||
          j.status === 'Closed / Resolved';

        if (finalDeadlineFilter === 'OVERDUE') {
          if (getOverdueDays(effDate, j.status, todayStr) <= 0) return false;
        } else if (finalDeadlineFilter === 'DUE_30') {
          if (!effDate || effDate < todayStr || effDate > in30DaysStr || isClosed) return false;
        } else if (finalDeadlineFilter === 'THIS_MONTH') {
          if (!effDate || !effDate.startsWith(thisMonthStr)) return false;
        } else if (finalDeadlineFilter === 'NORMAL') {
          if (shortRule !== 'Normal') return false;
        } else if (finalDeadlineFilter === 'EOT_1') {
          if (shortRule !== '1st EOT') return false;
        } else if (finalDeadlineFilter === 'EOT_2') {
          if (shortRule !== '2nd EOT') return false;
        } else if (finalDeadlineFilter === 'EOT_3') {
          if (shortRule !== '3rd EOT') return false;
        }

        if (deadlineMonthFilter) {
          if (deadlineMonthFilter.startsWith('ALL-')) {
            const targetMonth = deadlineMonthFilter.slice(4);
            if (!isIsoDateString(effDate) || effDate.slice(5, 7) !== targetMonth) return false;
          } else if (!effDate.startsWith(deadlineMonthFilter)) {
            return false;
          }
        }
      }

      if (q) {
        const clientRec = findMatchedClient(j, clientLookup);
        const hay = [
          j.jobCode,
          j.jobType,
          j.ya,
          j.yaSequence,
          j.clientId,
          j.clientName,
          j.groupId,
          displayFye,
          j.taxPic,
          j.reviewer,
          j.auditType,
          j.auditor || clientRec?.auditor,
          j.remarks,
          j.formType,
          j.formCSubmissionReference,
          j.mitrsSubmissionReference,
          j.submissionReference,
          j.letterRefNo,
          j.receiptNo,
          j.eFilingAckNo,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    scopedJobs,
    mode,
    moduleFilter,
    jobTypeFilter,
    yaFilter,
    fyeFilter,
    picFilter,
    statusFilter,
    auditTypeFilter,
    finalDeadlineFilter,
    deadlineMonthFilter,
    search,
    todayStr,
    in30DaysStr,
    thisMonthStr,
    clientLookup,
  ]);

  const getChecklistSummary = (j: TaxJob) => {
    const list = j.complianceChecklist || [];
    if (list.length === 0) return '0/7';
    const done = list.filter((x) => x.status === 'Completed').length;
    return `${done}/${list.length}`;
  };

  const resolveAuditor = (j: TaxJob) => {
    if (j.auditor && j.auditor.trim()) return j.auditor.trim();
    const clientRec = findMatchedClient(j, clientLookup);
    return clientRec?.auditor || '';
  };

  const jobValueGetters = useMemo(
    () => ({
      jobCode: (j: TaxJob) => j.jobCode,
      module: (j: TaxJob) => j.module,
      jobType: (j: TaxJob) => j.jobType || j.formType || '',
      clientId: (j: TaxJob) => j.clientId,
      clientName: (j: TaxJob) => j.clientName,
      groupId: (j: TaxJob) => j.groupId ?? '',
      ya: (j: TaxJob) => (j.yaSequence ? `${j.ya ?? ''} (${j.yaSequence})`.trim() : j.ya ?? ''),
      fye: (j: TaxJob) => {
        const displayFye = resolveJobDisplayFye(j, clientLookup);
        if (!displayFye) return '-';
        const m = extractFyeMonth(displayFye);
        return isCorporateView && m !== null ? String(m) : displayFye;
      },
      taxPic: (j: TaxJob) => j.taxPic ?? '',
      reviewer: (j: TaxJob) => j.reviewer ?? '',
      status: (j: TaxJob) => j.status ?? '',
      priority: (j: TaxJob) => j.priority ?? '',
      internalDeadline: (j: TaxJob) => formatDateDDMMYYYY(j.internalDeadline),
      originalStatutoryDeadline: (j: TaxJob) => formatDateDDMMYYYY(j.originalStatutoryDeadline),
      formCDueDate: (j: TaxJob) => formatDateDDMMYYYY(j.formCDueDate),
      lhdnEot1: (j: TaxJob) => formatDateDDMMYYYY(j.lhdnEot1),
      finalApplicableDeadline: (j: TaxJob) => {
        const displayFye = resolveJobDisplayFye(j, clientLookup);
        const analysis = analyzeJobDeadlines(displayFye && !j.fye ? { ...j, fye: displayFye } : j);
        const eff = analysis.finalApplicableDeadline || j.finalApplicableDeadline || j.dueDate || '';
        return eff ? formatDateDDMMYYYY(eff) : '';
      },
      ssmEot: (j: TaxJob) => {
        const latest = getLatestSsmEot(j);
        return latest.date ? formatDateDDMMYYYY(latest.date) : '';
      },
      formC: (j: TaxJob) =>
        (j.formCStatus || '').trim().toLowerCase() === 'submitted'
          ? 'Submitted'
          : j.formCStatus || '',
      mitrs: (j: TaxJob) =>
        (j.mitrsStatus || '').trim().toLowerCase() === 'submitted'
          ? 'Submitted'
          : j.mitrsStatus || '',
      mitrsDueDate: (j: TaxJob) => {
        const displayFye = resolveJobDisplayFye(j, clientLookup);
        const analysis = analyzeJobDeadlines(displayFye && !j.fye ? { ...j, fye: displayFye } : j);
        const d = j.mitrsDueDate || analysis.mitrsApplicableDeadline || '';
        return d ? formatDateDDMMYYYY(d) : '';
      },
      auditType: (j: TaxJob) => j.auditType ?? '',
      auditor: (j: TaxJob) => resolveAuditor(j),
      workDoneStatus: (j: TaxJob) => j.billingStatus || 'Unbilled WIP',
      formCStatus: (j: TaxJob) => j.formCStatus ?? '',
      mitrsStatus: (j: TaxJob) => j.mitrsStatus ?? '',
      formEStatus: (j: TaxJob) => j.formEStatus ?? '',
      cp8dStatus: (j: TaxJob) => j.cp8dStatus ?? '',
      formEaStatus: (j: TaxJob) => j.formEaStatus ?? '',
      accountsStatus: (j: TaxJob) => j.accountsStatus ?? '',
      auditBookInDate: (j: TaxJob) => formatDateDDMMYYYY(j.auditBookInDate),
      auditReportReceivedDate: (j: TaxJob) => formatDateDDMMYYYY(j.auditReportReceivedDate),
      dateDocumentsReceived: (j: TaxJob) => formatDateDDMMYYYY(j.dateDocumentsReceived),
      submissionStatus: (j: TaxJob) => j.submissionStatus ?? '',
      submissionReference: (j: TaxJob) => j.submissionReference ?? '',
      submissionDate: (j: TaxJob) => formatDateDDMMYYYY(j.submissionDate),
      personNo: (j: TaxJob) => j.personNo ?? '',
      finalTaxPayable: (j: TaxJob) => j.finalTaxPayable ?? j.taxPayable ?? 0,
      checklistProgress: (j: TaxJob) => getChecklistSummary(j),
      dueDate: (j: TaxJob) => formatDateDDMMYYYY(j.dueDate),
      feeAmount: (j: TaxJob) => j.feeAmount ?? 0,
      billingStatus: (j: TaxJob) => j.billingStatus ?? '',
      cp204Estimate: (j: TaxJob) => j.cp204Estimate ?? 0,
      cp204Revised6th: (j: TaxJob) => j.cp204Revised6th ?? 0,
      cp204Revised9th: (j: TaxJob) => j.cp204Revised9th ?? 0,
      cp204Revised11th: (j: TaxJob) => j.cp204Revised11th ?? 0,
      cp204InstallmentStart: (j: TaxJob) => j.cp204InstallmentStart ?? '',
      paymentType: (j: TaxJob) => j.paymentType ?? '',
      installmentNo: (j: TaxJob) => j.installmentNo ?? '',
      amountDue: (j: TaxJob) => j.amountDue ?? 0,
      amountPaid: (j: TaxJob) => j.amountPaid ?? 0,
      paymentDate: (j: TaxJob) => formatDateDDMMYYYY(j.paymentDate),
      receiptNo: (j: TaxJob) => j.receiptNo ?? '',
      correspondenceType: (j: TaxJob) => j.correspondenceType ?? '',
      letterRefNo: (j: TaxJob) => j.letterRefNo ?? '',
      letterDate: (j: TaxJob) => formatDateDDMMYYYY(j.letterDate),
      responseDueDate: (j: TaxJob) => formatDateDDMMYYYY(j.responseDueDate),
      responseSentDate: (j: TaxJob) => formatDateDDMMYYYY(j.responseSentDate),
      remarks: (j: TaxJob) => j.remarks ?? '',
    }),
    [isCorporateView, clientLookup] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const excel = useExcelTableFilters(filteredJobs, jobValueGetters);
  const displayedJobs = excel.rows;

  // Clear column filters when switching job module views or receiving a navigation preset
  useEffect(() => {
    excel.resetColumnFilters();
  }, [mode, initialFilter?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
  }, [excel.columnFilters, excel.sortState]);

  const totalPages = Math.max(1, Math.ceil(displayedJobs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedJobs = useMemo(
    () => displayedJobs.slice(startIndex, startIndex + PAGE_SIZE),
    [displayedJobs, startIndex]
  );

  const showingStart = displayedJobs.length === 0 ? 0 : startIndex + 1;
  const showingEnd = Math.min(startIndex + PAGE_SIZE, displayedJobs.length);
  const summaryText =
    displayedJobs.length === 0
      ? 'Showing 0 of 0 job(s)'
      : `Showing ${showingStart}–${showingEnd} of ${displayedJobs.length.toLocaleString()} job(s)`;

  const activeCols = activeColumns;
  const hasActiveFilters = Boolean(
    search ||
      moduleFilter ||
      jobTypeFilter ||
      yaFilter ||
      fyeFilter ||
      picFilter ||
      statusFilter ||
      auditTypeFilter ||
      finalDeadlineFilter ||
      deadlineMonthFilter ||
      excel.hasActiveColumnFilters
  );

  const statusBadgeGroup =
    mode === 'CP204'
      ? 'CP204_STATUS'
      : mode === 'Tax Payment Monitor'
      ? 'PAYMENT_STATUS'
      : mode === 'Correspondence'
      ? 'CORRESPONDENCE_STATUS'
      : 'JOB_STATUS';

  const openJobModal = (jobToOpen: TaxJob | null, initialTab: JobModalTab = 'basic') => {
    setEditingJob(jobToOpen);
    setModalInitialTab(initialTab);
    setModalOpen(true);
  };

  const handleBatchRecomputeDeadlines = async () => {
    if (isReadOnly || recomputingBatch) return;
    setRecomputingBatch(true);
    try {
      const updates: Array<{
        id: string;
        data: ReturnType<typeof recomputeJobDeadlinesAndStatus>['payload'];
        auditRemark: string;
      }> = [];
      let fyeBackfilledCount = 0;
      let auditTypeBackfilledCount = 0;
      let deadlinesRecalcCount = 0;
      let markedCompletedCount = 0;

      for (const j of scopedJobs) {
        const res = recomputeJobDeadlinesAndStatus(j, clientLookup);
        if (res.changed) {
          updates.push({
            id: j.id,
            data: res.payload,
            auditRemark: res.auditRemark,
          });
          if (res.fyeBackfilled) fyeBackfilledCount += 1;
          if (res.auditTypeBackfilled) auditTypeBackfilledCount += 1;
          if (res.deadlinesChanged) deadlinesRecalcCount += 1;
          if (res.markedCompleted) markedCompletedCount += 1;
        }
      }

      if (updates.length === 0) {
        showToast(
          'All jobs already have up-to-date FYEs, Audit Types, deadlines, and statuses.',
          'info',
          3500
        );
        return;
      }

      const { updatedCount } = await batchUpdateJobs(updates);
      const parts = [
        fyeBackfilledCount > 0 ? `${fyeBackfilledCount} FYE backfilled` : '',
        auditTypeBackfilledCount > 0 ? `${auditTypeBackfilledCount} Audit Type backfilled` : '',
        deadlinesRecalcCount > 0 ? `${deadlinesRecalcCount} deadlines updated` : '',
        markedCompletedCount > 0 ? `${markedCompletedCount} marked Completed` : '',
      ].filter(Boolean);

      showToast(
        `Re-computed ${updatedCount} job(s)${parts.length > 0 ? ` (${parts.join(', ')})` : ''}.`,
        'success',
        4500
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch recompute failed.';
      showToast(msg, 'error', 5000);
    } finally {
      setRecomputingBatch(false);
    }
  };

  const buildExportRows = (format: 'excel' | 'pdf') =>
    displayedJobs.map((j) => {
      const displayFye = resolveJobDisplayFye(j, clientLookup);
      const analysis = analyzeJobDeadlines(displayFye && !j.fye ? { ...j, fye: displayFye } : j);
      const effDeadline =
        analysis.finalApplicableDeadline || j.finalApplicableDeadline || j.dueDate || '';
      const stageBadge = getDeadlineStageBadge(analysis.winningRule);
      const overdueDays = getOverdueDays(effDeadline, j.status, todayStr);
      const overdueLabel = formatOverdueLabel(overdueDays);
      const latestSsm = getLatestSsmEot(j);
      const fyeMonth = extractFyeMonth(displayFye);
      const statusEffDate = getStatusEffectiveDate(j, historyByJobId.get(j.id));
      const formCStatusText = (j.formCStatus || '').trim();
      const mitrsStatusText = (j.mitrsStatus || '').trim();
      const formCDateText = formatDateDDMMYYYY(j.formCSubmissionDate);
      const mitrsDateText = formatDateDDMMYYYY(j.mitrsSubmissionDate);
      const mitrsDue = j.mitrsDueDate || analysis.mitrsApplicableDeadline || '';

      const stackedJoin = (parts: string[]) =>
        parts.filter(Boolean).join(format === 'pdf' ? '\n' : ' · ');

      const yaCell =
        format === 'pdf'
          ? stackedJoin([j.ya ?? '', j.yaSequence ?? ''])
          : j.yaSequence
          ? `${j.ya ?? ''} (${j.yaSequence})`.trim()
          : j.ya ?? '';

      const finalDeadlineCell = effDeadline
        ? format === 'pdf'
          ? stackedJoin([
              formatDateDDMMYYYY(effDeadline),
              stageBadge || '',
              overdueLabel,
            ])
          : `${formatDateDDMMYYYY(effDeadline)}${
              stageBadge || overdueLabel
                ? ` (${[stageBadge, overdueLabel].filter(Boolean).join(', ')})`
                : ''
            }`
        : '—';

      const ssmEotCell = latestSsm.date
        ? format === 'pdf'
          ? stackedJoin([formatDateDDMMYYYY(latestSsm.date), latestSsm.label || ''])
          : `${formatDateDDMMYYYY(latestSsm.date)}${latestSsm.label ? ` (${latestSsm.label})` : ''}`
        : '—';

      const statusCell =
        format === 'pdf'
          ? stackedJoin([j.status || '', statusEffDate && statusEffDate !== '—' ? statusEffDate : ''])
          : statusEffDate && statusEffDate !== '—'
          ? `${j.status} (${statusEffDate})`
          : j.status;

      const formCCell =
        format === 'pdf'
          ? stackedJoin([formCDateText !== '—' ? formCDateText : '', formCStatusText]) || '—'
          : formCDateText !== '—'
          ? `${formCDateText}${formCStatusText ? ` (${formCStatusText})` : ''}`
          : formCStatusText || '—';

      const mitrsCell =
        format === 'pdf'
          ? stackedJoin([mitrsDateText !== '—' ? mitrsDateText : '', mitrsStatusText]) || '—'
          : mitrsDateText !== '—'
          ? `${mitrsDateText}${mitrsStatusText ? ` (${mitrsStatusText})` : ''}`
          : mitrsStatusText || '—';

      return {
        jobCode: j.jobCode,
        module: j.module,
        jobType: j.jobType || j.formType || '',
        clientId: j.clientId,
        clientName: j.clientName,
        groupId: j.groupId ?? '',
        ya: yaCell,
        fye: displayFye
          ? isCorporateView && fyeMonth !== null
            ? String(fyeMonth)
            : displayFye
          : '-',
        taxPic: j.taxPic ?? '',
        reviewer: j.reviewer ?? '',
        status: statusCell,
        priority: j.priority ?? '',
        internalDeadline: formatDateDDMMYYYY(j.internalDeadline),
        originalStatutoryDeadline: formatDateDDMMYYYY(j.originalStatutoryDeadline),
        formCDueDate: formatDateDDMMYYYY(j.formCDueDate),
        lhdnEot1: formatDateDDMMYYYY(j.lhdnEot1),
        finalApplicableDeadline: finalDeadlineCell,
        ssmEot: ssmEotCell,
        formC: formCCell,
        mitrs: mitrsCell,
        mitrsDueDate: formatDateDDMMYYYY(mitrsDue),
        auditType: j.auditType ?? '',
        auditor: resolveAuditor(j),
        workDoneStatus: j.billingStatus || 'Unbilled WIP',
        formCStatus: j.formCStatus ?? '',
        mitrsStatus: j.mitrsStatus ?? '',
        formEStatus: j.formEStatus ?? '',
        cp8dStatus: j.cp8dStatus ?? '',
        formEaStatus: j.formEaStatus ?? '',
        accountsStatus: j.accountsStatus ?? '',
        auditBookInDate: formatDateDDMMYYYY(j.auditBookInDate),
        auditReportReceivedDate: formatDateDDMMYYYY(j.auditReportReceivedDate),
        dateDocumentsReceived: formatDateDDMMYYYY(j.dateDocumentsReceived),
        submissionStatus: j.submissionStatus ?? '',
        submissionReference: j.submissionReference ?? '',
        submissionDate: formatDateDDMMYYYY(j.submissionDate),
        personNo: j.personNo ?? '',
        finalTaxPayable: j.finalTaxPayable ?? j.taxPayable ?? 0,
        checklistProgress: getChecklistSummary(j),
        dueDate: formatDateDDMMYYYY(j.dueDate),
        feeAmount: j.feeAmount ?? 0,
        billingStatus: j.billingStatus ?? '',
        cp204Estimate: j.cp204Estimate ?? 0,
        cp204Revised6th: j.cp204Revised6th ?? 0,
        cp204Revised9th: j.cp204Revised9th ?? 0,
        cp204Revised11th: j.cp204Revised11th ?? 0,
        cp204InstallmentStart: j.cp204InstallmentStart ?? '',
        paymentType: j.paymentType ?? '',
        installmentNo: j.installmentNo ?? '',
        amountDue: j.amountDue ?? 0,
        amountPaid: j.amountPaid ?? 0,
        paymentDate: formatDateDDMMYYYY(j.paymentDate),
        receiptNo: j.receiptNo ?? '',
        correspondenceType: j.correspondenceType ?? '',
        letterRefNo: j.letterRefNo ?? '',
        letterDate: formatDateDDMMYYYY(j.letterDate),
        responseDueDate: formatDateDDMMYYYY(j.responseDueDate),
        responseSentDate: formatDateDDMMYYYY(j.responseSentDate),
        remarks: j.remarks ?? '',
      };
    });

  const title = mode === 'ALL' ? 'All Jobs' : mode;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{MODULE_DESCRIPTIONS[mode]}</p>
        </div>
      </div>

      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={
          isCorporateView
            ? 'Search Client / YA / Job Type'
            : `Search ${title} by Client, YA, Job Type, Code, PIC, Ref No...`
        }
        hasActiveFilters={hasActiveFilters}
        onResetFilters={() => {
          setSearch('');
          setModuleFilter('');
          setJobTypeFilter('');
          setYaFilter('');
          setFyeFilter('');
          setPicFilter('');
          setStatusFilter('');
          setAuditTypeFilter('');
          setFinalDeadlineFilter('');
          setDeadlineMonthFilter('');
          excel.resetColumnFilters();
        }}
        columns={orderedColumns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        pinnedColumns={pinnedColumns}
        onTogglePin={togglePin}
        onMoveColumn={moveColumn}
        onReorderColumn={reorderColumn}
        recordCount={displayedJobs.length}
        totalCount={scopedJobs.length}
        summaryText={summaryText}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_${title.replace(/\s+/g, '_')}_${todayStr}.xlsx`,
            title,
            activeCols,
            buildExportRows('excel')
          )
        }
        onPrint={() =>
          printTable(
            title,
            `${displayedJobs.length} compliance jobs`,
            activeCols,
            buildExportRows('pdf'),
            'landscape'
          )
        }
        onSavePdf={() =>
          exportTableToPdf(
            title,
            `${displayedJobs.length} compliance jobs`,
            activeCols,
            buildExportRows('pdf'),
            {
              orientation: 'landscape',
              fontSize: 7.5,
              styledPills: true,
              columnWidthHints: JOB_PDF_COLUMN_WEIGHTS,
              filename: `TPMS_${title.replace(/\s+/g, '_')}_${todayStr}.pdf`,
            }
          )
        }
        filters={
          <>
            {mode === 'ALL' && (
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Modules</option>
                <option value="CP204">CP204</option>
                <option value="Corporate">Corporate</option>
                <option value="Individual">Individual</option>
                <option value="Ad Hoc">Ad Hoc</option>
                <option value="Form E">Form E</option>
                <option value="Tax Payment Monitor">Tax Payment Monitor</option>
                <option value="Correspondence">Correspondence</option>
              </select>
            )}
            {!isCorporateView && (
              <select
                value={jobTypeFilter}
                onChange={(e) => setJobTypeFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Job Types</option>
                {JOB_TYPES.map((jt) => (
                  <option key={jt} value={jt}>
                    {jt}
                  </option>
                ))}
              </select>
            )}
            <select
              value={yaFilter}
              onChange={(e) => setYaFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-mono"
            >
              <option value="">All YAs</option>
              {distinctYAs.map((y) => (
                <option key={y} value={y}>
                  YA {y}
                </option>
              ))}
            </select>
            <select
              value={fyeFilter}
              onChange={(e) => setFyeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-mono"
            >
              <option value="">All FYE</option>
              {distinctFyeMonths.map((m) => {
                const padded = String(m).padStart(2, '0');
                return (
                  <option key={padded} value={padded}>
                    FYE {m}
                  </option>
                );
              })}
            </select>
            <select
              value={picFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All PICs</option>
              {distinctPics.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All statuses</option>
              {distinctStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={auditTypeFilter}
              onChange={(e) => setAuditTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Audit Types</option>
              {auditTypeFilterOptions.map((at) => (
                <option key={at} value={at}>
                  {at}
                </option>
              ))}
              <option value="__BLANK__">Blank / Unset</option>
            </select>
            <select
              value={finalDeadlineFilter}
              onChange={(e) => setFinalDeadlineFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Final Deadlines</option>
              <optgroup label="Deadline Window">
                <option value="OVERDUE">Overdue</option>
                <option value="DUE_30">Due within 30 Days</option>
                <option value="THIS_MONTH">Due This Month</option>
              </optgroup>
              <optgroup label="Extension Rule">
                <option value="NORMAL">Normal</option>
                <option value="EOT_1">1st EOT</option>
                <option value="EOT_2">2nd EOT</option>
                <option value="EOT_3">3rd EOT</option>
              </optgroup>
            </select>
            <div ref={monthPopoverRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setMonthPopoverOpen((prev) => {
                    const next = !prev;
                    if (next && deadlineMonthFilter) {
                      if (deadlineMonthFilter.startsWith('ALL-')) {
                        setMonthPickerYear('ALL');
                      } else if (/^\d{4}-\d{2}$/.test(deadlineMonthFilter)) {
                        setMonthPickerYear(deadlineMonthFilter.slice(0, 4));
                      }
                    }
                    return next;
                  });
                }}
                aria-haspopup="dialog"
                aria-expanded={monthPopoverOpen}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border whitespace-nowrap transition-colors ${
                  deadlineMonthFilter
                    ? 'bg-teal-50 text-teal-800 border-teal-300 font-medium'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 opacity-75" />
                <span>
                  {deadlineMonthFilter
                    ? formatMonthYearLabel(deadlineMonthFilter)
                    : 'All Months'}
                </span>
                {deadlineMonthFilter ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    title="Clear deadline month filter"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeadlineMonthFilter('');
                    }}
                    className="ml-0.5 p-0.5 rounded hover:bg-teal-200/70 text-teal-700"
                  >
                    <X className="w-3 h-3" />
                  </span>
                ) : (
                  <ChevronDown className="w-3 h-3 opacity-60" />
                )}
              </button>

              {monthPopoverOpen && (
                <div className="absolute left-0 mt-1.5 w-64 p-3 bg-white border border-slate-200 rounded-lg shadow-lg z-40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Deadline Month
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDeadlineMonthFilter('');
                        setMonthPopoverOpen(false);
                      }}
                      disabled={!deadlineMonthFilter}
                      className="text-[11px] font-medium text-teal-700 hover:text-teal-900 hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-default"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Year selector pills */}
                  <div className="flex flex-wrap items-center gap-1 pb-2 mb-2 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => setMonthPickerYear('ALL')}
                      className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                        monthPickerYear === 'ALL'
                          ? 'bg-teal-700 text-white border-teal-700 font-semibold'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      All
                    </button>
                    {availableDeadlineYears.map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setMonthPickerYear(yr)}
                        className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                          monthPickerYear === yr
                            ? 'bg-teal-700 text-white border-teal-700 font-semibold'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>

                  {/* 3x4 Month grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {SHORT_MONTH_NAMES.map((label, idx) => {
                      const mm = String(idx + 1).padStart(2, '0');
                      const token = monthPickerYear === 'ALL' ? `ALL-${mm}` : `${monthPickerYear}-${mm}`;
                      const isSelected = deadlineMonthFilter === token;
                      let count = 0;
                      if (monthPickerYear === 'ALL') {
                        for (const [ymKey, c] of deadlineMonthCounts.entries()) {
                          if (ymKey.endsWith(`-${mm}`)) count += c;
                        }
                      } else {
                        count = deadlineMonthCounts.get(token) ?? 0;
                      }
                      const hasDeadlines = count > 0;

                      return (
                        <button
                          key={mm}
                          type="button"
                          title={
                            hasDeadlines
                              ? `${label}${monthPickerYear === 'ALL' ? ' (All Years)' : ` ${monthPickerYear}`} — ${count} job(s)`
                              : `${label}${monthPickerYear === 'ALL' ? '' : ` ${monthPickerYear}`} — No deadlines`
                          }
                          onClick={() => {
                            setDeadlineMonthFilter((curr) => (curr === token ? '' : token));
                            setMonthPopoverOpen(false);
                          }}
                          className={`relative px-1.5 py-1.5 text-[11px] rounded border text-center transition-colors ${
                            isSelected
                              ? 'bg-teal-700 text-white border-teal-700 font-semibold shadow-xs'
                              : hasDeadlines
                              ? 'bg-teal-50/70 text-teal-900 border-teal-200/80 font-medium hover:bg-teal-100'
                              : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50 hover:text-slate-600'
                          }`}
                        >
                          <span>{label}</span>
                          {hasDeadlines && !isSelected && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-teal-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        }
        primaryAction={
          !isReadOnly ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={recomputingBatch || scopedJobs.length === 0}
                onClick={() => void handleBatchRecomputeDeadlines()}
                title="Backfill missing FYE from Client Master, populate Audit Type (Unaudited / EPC) from Job Remarks, recalculate statutory/e-Filing/Final/MITRS deadlines, and mark jobs with submitted Form C + MITRS (Submitted or Self-Submit) as Completed"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md whitespace-nowrap disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recomputingBatch ? 'animate-spin' : ''}`} />
                {recomputingBatch ? 'Re-computing...' : 'Re-compute Deadlines & Status'}
              </button>
              {mode !== 'Individual' && (
                <button
                  type="button"
                  onClick={() => setBatchModalVariant('general')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Batch Add Jobs
                </button>
              )}
              {(mode === 'ALL' || mode === 'Individual' || mode === 'Ad Hoc') && (
                <button
                  type="button"
                  onClick={() => setBatchModalVariant('individual')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-800 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-md whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Individual Batch Add
                </button>
              )}
              <button
                type="button"
                onClick={() => openJobModal(null, 'basic')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add {mode === 'ALL' ? 'Job' : mode}
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="max-h-[calc(100vh-64px)] overflow-auto relative bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm border-b border-slate-200 text-slate-700">
            <tr ref={headerRowRef}>
              {activeCols.map((col) => {
                const stickyTh = getHeaderStickyProps(col.key);
                return (
                  <th
                    key={col.key}
                    data-pinned-col={stickyTh['data-pinned-col']}
                    style={stickyTh.style}
                    className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b border-slate-200 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${getJobColumnMinWidth(col.key)} ${stickyTh.className}`}
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
              <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-right text-xs font-semibold whitespace-nowrap border-b border-slate-200 min-w-[155px] no-print">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={activeCols.length + 1} className="px-3 py-2.5">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={activeCols.length + 1} className="px-6 py-12 text-center">
                    <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No {title} records found</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {scopedJobs.length === 0
                        ? `Create a single ${title} job or use Batch Add to generate jobs from Client Master.`
                        : 'Clear active filters to view all records.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((j) => {
                  const displayFye = resolveJobDisplayFye(j, clientLookup);
                  const deadlineAnalysis = analyzeJobDeadlines(
                    displayFye && !j.fye ? { ...j, fye: displayFye } : j
                  );
                  const effectiveDeadline =
                    deadlineAnalysis.finalApplicableDeadline ||
                    j.finalApplicableDeadline ||
                    j.dueDate ||
                    '';
                  const stageBadge = getDeadlineStageBadge(deadlineAnalysis.winningRule);
                  const latestSsm = getLatestSsmEot(j);
                  const overdueDays = getOverdueDays(effectiveDeadline, j.status, todayStr);
                  const isOverdue = overdueDays > 0;
                  const statusEffectiveDate = getStatusEffectiveDate(j, historyByJobId.get(j.id));
                  const formCStatusText = (j.formCStatus || '').trim();
                  const mitrsStatusText = (j.mitrsStatus || '').trim();
                  const fyeMonthNum = extractFyeMonth(displayFye);
                  const auditorName = resolveAuditor(j);
                  const mitrsDueValue =
                    j.mitrsDueDate || deadlineAnalysis.mitrsApplicableDeadline || '';

                  return (
                    <tr key={j.id} className="group hover:bg-slate-50 transition-colors align-middle">
                      {activeCols.map((col) => {
                        const key = col.key;
                        const stickyTd = getCellStickyProps(key);
                        const wrapTd = (
                          cls: string,
                          content: React.ReactNode,
                          title?: string
                        ) => (
                          <td
                            key={key}
                            style={stickyTd.style}
                            title={title}
                            className={`${cls} ${getJobColumnMinWidth(key)} ${stickyTd.className}`}
                          >
                            {content}
                          </td>
                        );

                        if (key === 'clientId') {
                          return wrapTd(
                            'px-3 py-2 text-xs font-mono font-medium text-slate-800 whitespace-nowrap',
                            j.clientId || '—'
                          );
                        }

                        if (key === 'jobCode') {
                          return wrapTd(
                            'px-3 py-2 text-xs font-mono font-medium text-slate-900 whitespace-nowrap',
                            j.jobCode
                          );
                        }

                        if (key === 'jobType') {
                          return wrapTd(
                            'px-3 py-2 text-xs text-slate-700 font-medium whitespace-nowrap',
                            j.jobType || j.formType || '—'
                          );
                        }

                        if (key === 'clientName') {
                          return wrapTd(
                            'px-3 py-2 text-xs font-medium text-slate-900 whitespace-nowrap',
                            <button
                              type="button"
                              onClick={() => openJobModal(j, 'basic')}
                              className="text-left hover:text-teal-700 hover:underline max-w-[260px] truncate block"
                              title={j.clientName}
                            >
                              {j.clientName}
                            </button>
                          );
                        }

                        if (key === 'fye') {
                          return wrapTd(
                            'px-3 py-2 text-xs font-mono tabular-nums text-slate-700 whitespace-nowrap',
                            displayFye
                              ? isCorporateView && fyeMonthNum !== null
                                ? String(fyeMonthNum)
                                : displayFye
                              : '-'
                          );
                        }

                        if (key === 'ya') {
                          return wrapTd(
                            'px-3 py-2 text-xs whitespace-nowrap',
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-mono tabular-nums font-medium text-slate-800 leading-tight">
                                {j.ya || '—'}
                              </span>
                              {j.yaSequence && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${getYaSequencePillClasses(
                                    j.yaSequence
                                  )}`}
                                >
                                  {j.yaSequence}
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (key === 'finalApplicableDeadline') {
                          return wrapTd(
                            'px-3 py-2 text-xs whitespace-nowrap',
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`font-mono tabular-nums leading-tight ${
                                  isOverdue
                                    ? 'text-rose-700 font-semibold'
                                    : 'text-slate-800 font-medium'
                                }`}
                              >
                                {formatDateDDMMYYYY(effectiveDeadline)}
                              </span>
                              {(stageBadge || isOverdue) && effectiveDeadline && (
                                <div className="inline-flex items-center gap-1 flex-wrap">
                                  {stageBadge && (
                                    <span
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${getStagePillClasses(
                                        stageBadge
                                      )}`}
                                    >
                                      {stageBadge}
                                    </span>
                                  )}
                                  {isOverdue && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold leading-none">
                                      {formatOverdueLabel(overdueDays)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (key === 'ssmEot') {
                          return wrapTd(
                            'px-3 py-2 text-xs whitespace-nowrap',
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-mono tabular-nums text-slate-700 leading-tight">
                                {latestSsm.date ? formatDateDDMMYYYY(latestSsm.date) : '—'}
                              </span>
                              {latestSsm.date && latestSsm.label && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${getSsmEotPillClasses(
                                    latestSsm.label
                                  )}`}
                                >
                                  {latestSsm.label}
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (key === 'status') {
                          return wrapTd(
                            'px-3 py-2 text-xs whitespace-nowrap',
                            <div className="flex flex-col items-start gap-1">
                              <StatusPill group={statusBadgeGroup} value={j.status} />
                              {statusEffectiveDate && statusEffectiveDate !== '—' && (
                                <span className="text-[10px] font-mono tabular-nums text-slate-500 leading-tight">
                                  {statusEffectiveDate}
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (key === 'formC') {
                          return wrapTd(
                            'px-3 py-2 text-xs whitespace-nowrap',
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-mono tabular-nums text-slate-700 leading-tight">
                                {formatDateDDMMYYYY(j.formCSubmissionDate)}
                              </span>
                              {formCStatusText && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${getSubmissionStatusPillClasses(
                                    formCStatusText
                                  )}`}
                                >
                                  {formCStatusText}
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (key === 'mitrs') {
                          return wrapTd(
                            'px-3 py-2 text-xs whitespace-nowrap',
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-mono tabular-nums text-slate-700 leading-tight">
                                {formatDateDDMMYYYY(j.mitrsSubmissionDate)}
                              </span>
                              {mitrsStatusText && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${getSubmissionStatusPillClasses(
                                    mitrsStatusText
                                  )}`}
                                >
                                  {mitrsStatusText}
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (key === 'auditType') {
                          const at = (j.auditType || '').trim();
                          return wrapTd(
                            'px-3 py-2 text-xs whitespace-nowrap',
                            at ? (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold leading-none ${getAuditTypePillClasses(
                                  at
                                )}`}
                              >
                                {at}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )
                          );
                        }

                        if (key === 'auditor') {
                          return wrapTd(
                            'px-3 py-2 text-slate-700 whitespace-nowrap max-w-[160px] truncate',
                            auditorName || '—',
                            auditorName || undefined
                          );
                        }

                        if (key === 'mitrsDueDate') {
                          return wrapTd(
                            'px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap',
                            formatDateDDMMYYYY(mitrsDueValue)
                          );
                        }

                        if (key === 'workDoneStatus' || key === 'billingStatus') {
                          return wrapTd(
                            'px-3 py-2 whitespace-nowrap',
                            <StatusPill
                              group="BILLING_STATUS"
                              value={j.billingStatus || 'Unbilled WIP'}
                            />
                          );
                        }

                        if (
                          key === 'formCStatus' ||
                          key === 'mitrsStatus' ||
                          key === 'formEStatus' ||
                          key === 'cp8dStatus' ||
                          key === 'formEaStatus' ||
                          key === 'submissionStatus' ||
                          key === 'accountsStatus'
                        ) {
                          const pillGroup =
                            key === 'formCStatus'
                              ? 'FORM C SUBMISSION STATUS'
                              : key === 'mitrsStatus'
                              ? 'MITRS SUBMISSION STATUS'
                              : 'JOB_STATUS';
                          return wrapTd(
                            'px-3 py-2 whitespace-nowrap',
                            <StatusPill group={pillGroup} value={j[key]} />
                          );
                        }

                        if (key === 'priority') {
                          return wrapTd(
                            'px-3 py-2 whitespace-nowrap',
                            <StatusPill group="PRIORITY" value={j.priority} />
                          );
                        }

                        if (key === 'dueDate') {
                          return wrapTd(
                            `px-3 py-2 font-mono tabular-nums whitespace-nowrap ${
                              isOverdue
                                ? 'text-rose-700 font-semibold'
                                : 'text-slate-800 font-medium'
                            }`,
                            <div className="flex flex-col items-start gap-1">
                              <span>{formatDateDDMMYYYY(j.dueDate)}</span>
                              {isOverdue && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold leading-none">
                                  {formatOverdueLabel(overdueDays)}
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (key === 'checklistProgress') {
                          return wrapTd(
                            'px-3 py-2 font-mono text-slate-600 whitespace-nowrap',
                            getChecklistSummary(j)
                          );
                        }

                        if (
                          key === 'cp204Estimate' ||
                          key === 'cp204Revised6th' ||
                          key === 'cp204Revised9th' ||
                          key === 'cp204Revised11th' ||
                          key === 'taxPayable' ||
                          key === 'finalTaxPayable' ||
                          key === 'feeAmount' ||
                          key === 'amountDue' ||
                          key === 'amountPaid'
                        ) {
                          const num =
                            key === 'finalTaxPayable'
                              ? j.finalTaxPayable ?? j.taxPayable ?? 0
                              : (j[key] as number | undefined) ?? 0;
                          return wrapTd(
                            'px-3 py-2 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap',
                            formatCurrencyRM(num)
                          );
                        }

                        if (
                          [
                            'originalStatutoryDeadline',
                            'formCDueDate',
                            'internalDeadline',
                            'lhdnEot1',
                            'auditBookInDate',
                            'auditReportReceivedDate',
                            'dateDocumentsReceived',
                            'submissionDate',
                            'paymentDate',
                            'letterDate',
                            'responseDueDate',
                            'responseSentDate',
                          ].includes(key)
                        ) {
                          const rawDate = j[key as keyof TaxJob] as string | undefined;
                          return wrapTd(
                            'px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap',
                            formatDateDDMMYYYY(rawDate)
                          );
                        }

                        if (key === 'remarks' || key === 'statusRemarks') {
                          const remarkVal = j[key as keyof TaxJob] as string | undefined;
                          return wrapTd(
                            'px-3 py-2 whitespace-nowrap',
                            <RemarksPreviewCell
                              text={remarkVal}
                              recordTitle={j.clientName}
                              recordId={j.jobCode || j.clientId}
                              fieldLabel={
                                key === 'statusRemarks' ? 'Status Remarks' : 'Job Remarks'
                              }
                            />
                          );
                        }

                        const rawVal = j[key as keyof TaxJob];
                        const isMono = [
                          'clientId',
                          'groupId',
                          'personNo',
                          'submissionReference',
                          'eFilingAckNo',
                          'cp204InstallmentStart',
                          'installmentNo',
                          'receiptNo',
                          'letterRefNo',
                        ].includes(key);

                        return wrapTd(
                          `px-3 py-2 whitespace-nowrap text-slate-700 ${isMono ? 'font-mono' : ''}`,
                          rawVal !== undefined && rawVal !== null && rawVal !== ''
                            ? String(rawVal)
                            : '—'
                        );
                      })}

                      <td className="px-3 py-2 text-xs text-right whitespace-nowrap no-print">
                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openJobModal(j, 'basic')}
                            className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
                          >
                            {isReadOnly ? 'View' : 'Edit'}
                          </button>
                          {isCorporateView && (
                            <>
                              <span className="text-slate-300">·</span>
                              <button
                                type="button"
                                onClick={() => openJobModal(j, 'submission')}
                                className="font-medium text-sky-700 hover:text-sky-900 hover:underline"
                              >
                                Submission
                              </button>
                            </>
                          )}
                          {isManagerOrAdmin && (
                            <>
                              <span className="text-slate-300">·</span>
                              <button
                                type="button"
                                onClick={() => void deleteJob(j.id)}
                                title="Delete job"
                                className="font-medium text-rose-600 hover:text-rose-800 hover:underline"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar when > 50 jobs */}
      {filteredJobs.length > PAGE_SIZE && (
        <div className="px-3.5 py-2 border border-slate-200 rounded-lg bg-slate-50/70 flex items-center justify-between text-xs text-slate-600 no-print">
            <span className="font-mono tabular-nums text-[11px]">{summaryText}</span>
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <span className="px-2 font-mono text-[11px]">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      <JobModal
        open={modalOpen}
        job={editingJob}
        defaultModule={mode === 'ALL' ? 'Corporate' : mode}
        lockModule={mode !== 'ALL'}
        initialTab={modalInitialTab}
        onClose={() => setModalOpen(false)}
      />

      {batchModalVariant && (
        <BatchAddJobsModal
          open={true}
          variant={batchModalVariant}
          defaultModule={mode === 'ALL' ? undefined : mode}
          onClose={() => setBatchModalVariant(null)}
        />
      )}
    </div>
  );
};
