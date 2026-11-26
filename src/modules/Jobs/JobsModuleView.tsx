import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Eye,
  Trash2,
  Briefcase,
  Layers,
  UserPlus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ClientRecord,
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
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import {
  addCalendarDays,
  analyzeJobDeadlines,
  extractFyeMonth,
  formatDateDDMMYYYY,
  getLatestSsmEot,
  getShortDeadlineRule,
  isIsoDateString,
  latestIsoDate,
} from '../../lib/deadlineUtils';
import { JobModal, JobModalTab } from './JobModal';
import { BatchAddJobsModal, BatchModalVariant } from './BatchAddJobsModal';

interface JobsModuleViewProps {
  mode: 'ALL' | JobModule;
  initialFilter?: NavigationFilterPreset | null;
}

const PAGE_SIZE = 50;

function getColumnsForMode(mode: 'ALL' | JobModule): ColumnDef[] {
  // Exact Corporate table layout matching original TPMS register
  if (mode === 'Corporate') {
    return [
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
      { key: 'auditor', label: 'Auditor', defaultVisible: true },
      { key: 'mitrsDueDate', label: 'MITRS Due Date', defaultVisible: true },
      { key: 'workDoneStatus', label: 'Work Done Status', defaultVisible: true },
      // Optional toggleable columns
      { key: 'jobCode', label: 'Job Code', defaultVisible: false, optional: true },
      { key: 'clientId', label: 'Client ID', defaultVisible: false, optional: true },
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
    { key: 'jobCode', label: 'Job Code', defaultVisible: true },
    ...(mode === 'ALL' ? [{ key: 'module', label: 'Module', defaultVisible: true }] : []),
    { key: 'jobType', label: 'Job Type', defaultVisible: true },
    { key: 'clientId', label: 'Client ID', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
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
    { key: 'originalStatutoryDeadline', label: 'Orig. Statutory', defaultVisible: false },
    { key: 'internalDeadline', label: 'Internal Deadline', defaultVisible: false },
    { key: 'finalApplicableDeadline', label: 'Final Deadline', defaultVisible: true },
    { key: 'formCStatus', label: 'Form C', defaultVisible: false },
    { key: 'mitrsStatus', label: 'MITRS', defaultVisible: false },
    { key: 'formEStatus', label: 'Form E', defaultVisible: false },
    { key: 'submissionStatus', label: 'Submission Status', defaultVisible: true },
    { key: 'finalTaxPayable', label: 'Final Tax Payable', defaultVisible: true, align: 'right' },
    { key: 'checklistProgress', label: 'Checklist', defaultVisible: true },
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

function formatMonthYearLabel(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return ym;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return dt.toLocaleDateString('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function getStatusEffectiveDate(
  job: TaxJob,
  jobHistory: JobHistoryEntry[] | undefined
): string {
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
  const { jobs, clients, history, loading, deleteJob, getSettingsByGroup } = useData();

  const isCorporateView = mode === 'Corporate';
  const columns = useMemo(() => getColumnsForMode(mode), [mode]);
  const colKey = `jobs_v3_${mode.toLowerCase().replace(/\s+/g, '_')}`;
  const { visibleColumns, toggleColumn, resetColumns } = useColumnVisibility(colKey, columns);

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [yaFilter, setYaFilter] = useState('');
  const [fyeFilter, setFyeFilter] = useState('');
  const [picFilter, setPicFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [finalDeadlineFilter, setFinalDeadlineFilter] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<JobModalTab>('core');
  const [editingJob, setEditingJob] = useState<TaxJob | null>(null);
  const [batchModalVariant, setBatchModalVariant] = useState<BatchModalVariant | null>(null);

  useEffect(() => {
    if (!initialFilter) return;
    setFyeFilter(initialFilter.fye ?? '');
    setYaFilter(initialFilter.ya ?? '');
    setSearch(initialFilter.search ?? '');
    setModuleFilter('');
    setJobTypeFilter('');
    setPicFilter('');
    setStatusFilter('');
    setFinalDeadlineFilter('');
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
    finalDeadlineFilter,
  ]);

  const scopedJobs = useMemo(() => jobs.filter((j) => matchesJobView(j, mode)), [jobs, mode]);

  // Fast client lookup by doc ID or clientId (for Auditor fallback)
  const clientLookup = useMemo(() => {
    const byDocId = new Map<string, ClientRecord>();
    const byClientId = new Map<string, ClientRecord>();
    for (const c of clients) {
      byDocId.set(c.id, c);
      if (c.clientId) byClientId.set(c.clientId.trim().toLowerCase(), c);
    }
    return { byDocId, byClientId };
  }, [clients]);

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
    const set = new Set<string>(scopedJobs.map((j) => j.ya).filter(Boolean) as string[]);
    if (yaFilter) set.add(yaFilter);
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

  const distinctDeadlineMonths = useMemo(() => {
    const months = new Set<string>();
    for (const j of scopedJobs) {
      const d = j.finalApplicableDeadline || j.dueDate || '';
      if (isIsoDateString(d)) {
        months.add(d.slice(0, 7));
      }
    }
    return Array.from(months).sort();
  }, [scopedJobs]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const in30DaysStr = addCalendarDays(todayStr, 30);
  const thisMonthStr = todayStr.slice(0, 7);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedJobs.filter((j) => {
      if (mode === 'ALL' && moduleFilter && j.module !== moduleFilter) return false;
      if (jobTypeFilter && (j.jobType || j.formType) !== jobTypeFilter) return false;
      if (yaFilter && j.ya !== yaFilter) return false;
      if (fyeFilter) {
        const jobFyeNum = extractFyeMonth(j.fye);
        const filterFyeNum = extractFyeMonth(fyeFilter);
        if (jobFyeNum !== filterFyeNum) return false;
      }
      if (picFilter && j.taxPic !== picFilter) return false;
      if (statusFilter && j.status !== statusFilter) return false;

      if (finalDeadlineFilter) {
        const analysis = analyzeJobDeadlines(j);
        const effDate = analysis.finalApplicableDeadline || j.finalApplicableDeadline || j.dueDate || '';
        const shortRule = getShortDeadlineRule(analysis.winningRule);
        const isClosed =
          j.status === 'Completed' ||
          j.status === 'Paid (FPX / ByrHASiL)' ||
          j.status === 'Closed / Resolved';

        if (finalDeadlineFilter === 'OVERDUE') {
          if (!effDate || effDate >= todayStr || isClosed) return false;
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
        } else if (/^\d{4}-\d{2}$/.test(finalDeadlineFilter)) {
          if (!effDate.startsWith(finalDeadlineFilter)) return false;
        }
      }

      if (q) {
        const clientRec =
          (j.clientDocId ? clientLookup.byDocId.get(j.clientDocId) : undefined) ||
          (j.clientId ? clientLookup.byClientId.get(j.clientId.trim().toLowerCase()) : undefined);
        const hay = [
          j.jobCode,
          j.jobType,
          j.ya,
          j.yaSequence,
          j.clientId,
          j.clientName,
          j.groupId,
          j.taxPic,
          j.reviewer,
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
    finalDeadlineFilter,
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
    const clientRec =
      (j.clientDocId ? clientLookup.byDocId.get(j.clientDocId) : undefined) ||
      (j.clientId ? clientLookup.byClientId.get(j.clientId.trim().toLowerCase()) : undefined);
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
        const m = extractFyeMonth(j.fye);
        return isCorporateView ? (m !== null ? String(m) : '') : j.fye ?? '';
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
        const analysis = analyzeJobDeadlines(j);
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
        const analysis = analyzeJobDeadlines(j);
        const d = j.mitrsDueDate || analysis.mitrsApplicableDeadline || '';
        return d ? formatDateDDMMYYYY(d) : '';
      },
      auditor: (j: TaxJob) => resolveAuditor(j),
      workDoneStatus: (j: TaxJob) => j.billingStatus || 'Unbilled WIP',
      formCStatus: (j: TaxJob) => j.formCStatus ?? '',
      mitrsStatus: (j: TaxJob) => j.mitrsStatus ?? '',
      formEStatus: (j: TaxJob) => j.formEStatus ?? '',
      cp8dStatus: (j: TaxJob) => j.cp8dStatus ?? '',
      formEaStatus: (j: TaxJob) => j.formEaStatus ?? '',
      accountsStatus: (j: TaxJob) => j.accountsStatus ?? '',
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

  // Clear column filters when switching job module views
  useEffect(() => {
    excel.resetColumnFilters();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const activeCols = columns.filter((c) => visibleColumns[c.key]);
  const hasActiveFilters = Boolean(
    search ||
      moduleFilter ||
      jobTypeFilter ||
      yaFilter ||
      fyeFilter ||
      picFilter ||
      statusFilter ||
      finalDeadlineFilter ||
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

  const openJobModal = (jobToOpen: TaxJob | null, initialTab: JobModalTab = 'core') => {
    setEditingJob(jobToOpen);
    setModalInitialTab(initialTab);
    setModalOpen(true);
  };

  const exportRows = () =>
    displayedJobs.map((j) => {
      const analysis = analyzeJobDeadlines(j);
      const effDeadline = analysis.finalApplicableDeadline || j.finalApplicableDeadline || j.dueDate || '';
      const shortRule = getShortDeadlineRule(analysis.winningRule);
      const latestSsm = getLatestSsmEot(j);
      const fyeMonth = extractFyeMonth(j.fye);
      const formCSubmitted = (j.formCStatus || '').trim().toLowerCase() === 'submitted';
      const mitrsSubmitted = (j.mitrsStatus || '').trim().toLowerCase() === 'submitted';
      const mitrsDue = j.mitrsDueDate || analysis.mitrsApplicableDeadline || '';

      return {
        jobCode: j.jobCode,
        module: j.module,
        jobType: j.jobType || j.formType || '',
        clientId: j.clientId,
        clientName: j.clientName,
        groupId: j.groupId ?? '',
        ya: j.yaSequence ? `${j.ya ?? ''} (${j.yaSequence})`.trim() : j.ya ?? '',
        fye: isCorporateView ? (fyeMonth ? String(fyeMonth) : '') : j.fye ?? '',
        taxPic: j.taxPic ?? '',
        reviewer: j.reviewer ?? '',
        status: j.status,
        priority: j.priority ?? '',
        internalDeadline: formatDateDDMMYYYY(j.internalDeadline),
        originalStatutoryDeadline: formatDateDDMMYYYY(j.originalStatutoryDeadline),
        formCDueDate: formatDateDDMMYYYY(j.formCDueDate),
        lhdnEot1: formatDateDDMMYYYY(j.lhdnEot1),
        finalApplicableDeadline: effDeadline
          ? `${formatDateDDMMYYYY(effDeadline)}${shortRule ? ` (${shortRule})` : ''}`
          : '',
        ssmEot: latestSsm.date
          ? `${formatDateDDMMYYYY(latestSsm.date)}${latestSsm.label ? ` (${latestSsm.label})` : ''}`
          : '',
        formC: formCSubmitted
          ? `${formatDateDDMMYYYY(j.formCSubmissionDate)} (Submitted)`
          : formatDateDDMMYYYY(j.formCSubmissionDate),
        mitrs: mitrsSubmitted
          ? `${formatDateDDMMYYYY(j.mitrsSubmissionDate)} (Submitted)`
          : formatDateDDMMYYYY(j.mitrsSubmissionDate),
        mitrsDueDate: formatDateDDMMYYYY(mitrsDue),
        auditor: resolveAuditor(j),
        workDoneStatus: j.billingStatus || 'Unbilled WIP',
        formCStatus: j.formCStatus ?? '',
        mitrsStatus: j.mitrsStatus ?? '',
        formEStatus: j.formEStatus ?? '',
        cp8dStatus: j.cp8dStatus ?? '',
        formEaStatus: j.formEaStatus ?? '',
        accountsStatus: j.accountsStatus ?? '',
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
          setFinalDeadlineFilter('');
          excel.resetColumnFilters();
        }}
        columns={columns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        recordCount={displayedJobs.length}
        totalCount={scopedJobs.length}
        summaryText={summaryText}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_${title.replace(/\s+/g, '_')}_${todayStr}.xlsx`,
            title,
            activeCols,
            exportRows()
          )
        }
        onPrint={() =>
          printRegisterHtml(
            title,
            `${displayedJobs.length} compliance jobs`,
            activeCols,
            exportRows(),
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            title,
            `${displayedJobs.length} compliance jobs`,
            activeCols,
            exportRows(),
            true
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
              {FYE_MONTHS.map((m) => (
                <option key={m} value={m}>
                  FYE {Number(m)}
                </option>
              ))}
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
              {distinctDeadlineMonths.length > 0 && (
                <optgroup label="By Month">
                  {distinctDeadlineMonths.map((ym) => (
                    <option key={ym} value={ym}>
                      {formatMonthYearLabel(ym)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </>
        }
        primaryAction={
          !isReadOnly ? (
            <div className="flex flex-wrap items-center gap-1.5">
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
                onClick={() => openJobModal(null, 'core')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add {mode === 'ALL' ? 'Job' : mode}
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-285px)]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700">
              <tr>
                {activeCols.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 font-semibold whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
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
                ))}
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap no-print">
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
                  const deadlineAnalysis = analyzeJobDeadlines(j);
                  const effectiveDeadline =
                    deadlineAnalysis.finalApplicableDeadline ||
                    j.finalApplicableDeadline ||
                    j.dueDate ||
                    '';
                  const shortRule = getShortDeadlineRule(deadlineAnalysis.winningRule);
                  const latestSsm = getLatestSsmEot(j);
                  const isOverdue =
                    Boolean(effectiveDeadline) &&
                    effectiveDeadline < todayStr &&
                    j.status !== 'Completed' &&
                    j.status !== 'Paid (FPX / ByrHASiL)' &&
                    j.status !== 'Closed / Resolved';
                  const statusEffectiveDate = getStatusEffectiveDate(j, historyByJobId.get(j.id));
                  const formCSubmitted = (j.formCStatus || '').trim().toLowerCase() === 'submitted';
                  const mitrsSubmitted = (j.mitrsStatus || '').trim().toLowerCase() === 'submitted';
                  const fyeMonthNum = extractFyeMonth(j.fye);
                  const auditorName = resolveAuditor(j);
                  const mitrsDueValue =
                    j.mitrsDueDate || deadlineAnalysis.mitrsApplicableDeadline || '';

                  return (
                    <tr key={j.id} className="hover:bg-slate-50/90 transition-colors align-top">
                      {activeCols.map((col) => {
                        const key = col.key;

                        if (key === 'jobCode') {
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap"
                            >
                              {j.jobCode}
                            </td>
                          );
                        }

                        if (key === 'jobType') {
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 text-slate-700 font-medium whitespace-nowrap"
                            >
                              {j.jobType || j.formType || '—'}
                            </td>
                          );
                        }

                        if (key === 'clientName') {
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 font-medium text-slate-900 min-w-[180px]"
                            >
                              <button
                                type="button"
                                onClick={() => openJobModal(j, 'core')}
                                className="text-left hover:text-teal-700 hover:underline"
                              >
                                {j.clientName}
                              </button>
                            </td>
                          );
                        }

                        if (key === 'fye') {
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap"
                            >
                              {isCorporateView
                                ? fyeMonthNum !== null
                                  ? String(fyeMonthNum)
                                  : '—'
                                : j.fye || '—'}
                            </td>
                          );
                        }

                        if (key === 'ya') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                <span className="font-mono tabular-nums font-medium text-slate-800">
                                  {j.ya || '—'}
                                </span>
                                {j.yaSequence && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-semibold leading-none">
                                    {j.yaSequence}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (key === 'finalApplicableDeadline') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                <div className="inline-flex items-center gap-1.5">
                                  <span
                                    className={`font-mono tabular-nums ${
                                      isOverdue
                                        ? 'text-rose-700 font-semibold'
                                        : 'text-slate-800 font-medium'
                                    }`}
                                  >
                                    {formatDateDDMMYYYY(effectiveDeadline)}
                                  </span>
                                  {isOverdue && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold leading-none">
                                      Overdue
                                    </span>
                                  )}
                                </div>
                                {effectiveDeadline && shortRule && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-semibold leading-none">
                                    {shortRule}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (key === 'ssmEot') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                <span className="font-mono tabular-nums text-slate-700">
                                  {latestSsm.date ? formatDateDDMMYYYY(latestSsm.date) : '—'}
                                </span>
                                {latestSsm.date && latestSsm.label && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold leading-none">
                                    {latestSsm.label}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (key === 'status') {
                          if (isCorporateView) {
                            return (
                              <td key={key} className="px-3 py-2 whitespace-nowrap">
                                <div className="flex flex-col items-start gap-1">
                                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                                    {statusEffectiveDate}
                                  </span>
                                  <StatusPill group={statusBadgeGroup} value={j.status} />
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <StatusPill group={statusBadgeGroup} value={j.status} />
                            </td>
                          );
                        }

                        if (key === 'formC') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                <span className="font-mono tabular-nums text-slate-700">
                                  {formatDateDDMMYYYY(j.formCSubmissionDate)}
                                </span>
                                {formCSubmitted && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-semibold leading-none">
                                    Submitted
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (key === 'mitrs') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <div className="flex flex-col items-start gap-1">
                                <span className="font-mono tabular-nums text-slate-700">
                                  {formatDateDDMMYYYY(j.mitrsSubmissionDate)}
                                </span>
                                {mitrsSubmitted && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-semibold leading-none">
                                    Submitted
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (key === 'auditor') {
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[160px] truncate"
                              title={auditorName || undefined}
                            >
                              {auditorName || '—'}
                            </td>
                          );
                        }

                        if (key === 'mitrsDueDate') {
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap"
                            >
                              {formatDateDDMMYYYY(mitrsDueValue)}
                            </td>
                          );
                        }

                        if (key === 'workDoneStatus' || key === 'billingStatus') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <StatusPill
                                group="BILLING_STATUS"
                                value={j.billingStatus || 'Unbilled WIP'}
                              />
                            </td>
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
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <StatusPill group="JOB_STATUS" value={j[key]} />
                            </td>
                          );
                        }

                        if (key === 'priority') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <StatusPill group="PRIORITY" value={j.priority} />
                            </td>
                          );
                        }

                        if (key === 'dueDate') {
                          return (
                            <td
                              key={key}
                              className={`px-3 py-2 font-mono tabular-nums whitespace-nowrap ${
                                isOverdue
                                  ? 'text-rose-700 font-semibold'
                                  : 'text-slate-800 font-medium'
                              }`}
                            >
                              {formatDateDDMMYYYY(j.dueDate)}
                              {isOverdue && (
                                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold">
                                  Overdue
                                </span>
                              )}
                            </td>
                          );
                        }

                        if (key === 'checklistProgress') {
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap"
                            >
                              {getChecklistSummary(j)}
                            </td>
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
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 font-mono tabular-nums text-right text-slate-800 whitespace-nowrap"
                            >
                              {formatCurrencyRM(num)}
                            </td>
                          );
                        }

                        if (
                          [
                            'originalStatutoryDeadline',
                            'formCDueDate',
                            'internalDeadline',
                            'lhdnEot1',
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
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap"
                            >
                              {formatDateDDMMYYYY(rawDate)}
                            </td>
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

                        return (
                          <td
                            key={key}
                            className={`px-3 py-2 whitespace-nowrap text-slate-700 ${
                              isMono ? 'font-mono' : ''
                            } ${key === 'remarks' ? 'max-w-[200px] truncate' : ''}`}
                            title={
                              key === 'remarks' && rawVal ? String(rawVal) : undefined
                            }
                          >
                            {rawVal !== undefined && rawVal !== null && rawVal !== ''
                              ? String(rawVal)
                              : '—'}
                          </td>
                        );
                      })}

                      <td className="px-3 py-2 text-right whitespace-nowrap no-print">
                        {isCorporateView ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openJobModal(j, 'core')}
                              className="text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline"
                            >
                              {isReadOnly ? 'View' : 'Edit'}
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => openJobModal(j, 'workflow')}
                              className="text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
                            >
                              Work Done
                            </button>
                            {isManagerOrAdmin && (
                              <button
                                type="button"
                                onClick={() => void deleteJob(j.id)}
                                title="Delete job"
                                className="p-1 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openJobModal(j, 'core')}
                              title={isReadOnly ? 'View job' : 'Edit job'}
                              className="p-1.5 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                            >
                              {isReadOnly ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <Pencil className="w-3.5 h-3.5" />
                              )}
                            </button>
                            {isManagerOrAdmin && (
                              <button
                                type="button"
                                onClick={() => void deleteJob(j.id)}
                                title="Delete job"
                                className="p-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
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

        {/* Pagination Bar when > 50 jobs */}
        {filteredJobs.length > PAGE_SIZE && (
          <div className="px-3.5 py-2 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs text-slate-600 no-print">
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
      </div>

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
