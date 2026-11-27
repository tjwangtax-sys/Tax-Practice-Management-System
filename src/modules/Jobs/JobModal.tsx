import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Save,
  Lock,
  Plus,
  Trash2,
  History,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  CalendarClock,
  ShieldAlert,
} from 'lucide-react';
import {
  ChecklistStepStatus,
  ClientRecord,
  DocumentFollowupItem,
  FYE_MONTHS,
  JOB_TYPES,
  JobModule,
  JobType,
  TaxJob,
} from '../../types/tpms';
import {
  analyzeJobDeadlines,
  applyMalaysianJobRules,
  createDefaultComplianceChecklist,
  formatDisplayDate,
  isFormCJob,
  normalizeComplianceChecklist,
} from '../../lib/deadlineUtils';
import { useAuth } from '../../context/AuthContext';
import { JobSavePayload, useData } from '../../context/DataContext';
import { StatusPill } from '../../components/StatusPill';
import { ClientSelectorField } from '../../components/ClientSelectorField';
import { buildDynamicSelectOptions } from '../../lib/settingsDropdown';

export type JobModalTab = 'core' | 'workflow' | 'checklist' | 'followups' | 'history';

interface JobModalProps {
  open: boolean;
  job: TaxJob | null;
  defaultModule: JobModule;
  lockModule?: boolean;
  initialTab?: JobModalTab;
  onClose: () => void;
}

type ModalTab = JobModalTab;

const ALL_JOB_MODULES: JobModule[] = [
  'CP204',
  'Corporate',
  'Individual',
  'Ad Hoc',
  'Form E',
  'Tax Payment Monitor',
  'Correspondence',
];

const SUBMISSION_SUBSTATUS_OPTIONS = [
  'Pending',
  'In Progress',
  'Prepared',
  'Manager Review',
  'Client Approval',
  'Submitted',
  'Not Applicable',
];

function defaultJobTypeForModule(module: JobModule): JobType {
  switch (module) {
    case 'Corporate':
      return 'Form C';
    case 'Individual':
      return 'Form B';
    case 'Form E':
      return 'Form E';
    case 'CP204':
      return 'CP204';
    case 'Ad Hoc':
      return 'Tax Audit';
    default:
      return 'Other';
  }
}

function createEmptyJob(module: JobModule): JobSavePayload {
  const yr = String(new Date().getFullYear());
  const jobType = defaultJobTypeForModule(module);
  return applyMalaysianJobRules({
    jobCode: `${jobType.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}-${yr}-${String(
      Math.floor(100 + Math.random() * 900)
    )}`,
    module,
    jobType,
    clientDocId: '',
    clientId: '',
    clientName: '',
    groupId: '',
    fye: '12',
    ya: yr,
    taxPic: '',
    reviewer: '',
    status:
      module === 'Tax Payment Monitor'
        ? 'Unpaid'
        : module === 'Correspondence'
        ? 'Open Query'
        : 'Not Started',
    priority: 'Normal',
    dueDate: '',
    completedDate: '',
    internalDeadline: '',
    originalStatutoryDeadline: '',
    ssmEot1: '',
    ssmEot2: '',
    ssmEot3: '',
    lhdnEot1: '',
    lhdnEot2: '',
    lhdnEot3: '',
    finalApplicableDeadline: '',
    auditBookInDate: '',
    auditReportReceivedDate: '',
    formCStatus: jobType === 'Form C' ? 'Pending' : '',
    formCDueDate: '',
    formCSubmissionDate: '',
    formCSubmissionReference: '',
    mitrsStatus: jobType === 'Form C' ? 'Pending' : '',
    mitrsDueDate: '',
    mitrsSubmissionDate: '',
    mitrsSubmissionReference: '',
    dateDocumentsRequested: '',
    dateDocumentsReceived: '',
    draftDate: '',
    reviewDate: '',
    clientConfirmationDate: '',
    yaStatus: '',
    auditor: '',
    accountsStatus: '',
    accountBookInDate: '',
    accountReturnDate: '',
    accountReturnStatus: '',
    submissionStatus: '',
    submissionReference: '',
    personNo: '',
    yaSequence: '',
    finalTaxPayable: 0,
    finalTaxPayableDate: '',
    formEStatus: module === 'Form E' ? 'Pending' : '',
    cp8dStatus: module === 'Form E' ? 'Pending' : '',
    formEaStatus: module === 'Form E' ? 'Pending' : '',
    complianceChecklist: createDefaultComplianceChecklist(),
    documentFollowups: [],
    feeAmount: 0,
    billedAmount: 0,
    billingStatus: 'Unbilled WIP',
    hoursSpent: 0,
    remarks: '',
    formType: jobType,
    submissionDate: '',
    eFilingAckNo: '',
    taxPayable: 0,
    taxRefundable: 0,
    cp204Estimate: 0,
    cp204Revised6th: 0,
    cp204Revised9th: 0,
    cp204Revised11th: 0,
    cp204InstallmentStart: '',
    paymentType: module === 'Tax Payment Monitor' ? 'CP204 Installment' : '',
    installmentNo: module === 'Tax Payment Monitor' ? '1/12' : '',
    amountDue: 0,
    amountPaid: 0,
    paymentDate: '',
    receiptNo: '',
    correspondenceType: module === 'Correspondence' ? 'LHDN Desk Audit' : '',
    letterRefNo: '',
    letterDate: '',
    responseDueDate: '',
    responseSentDate: '',
  });
}

export const JobModal: React.FC<JobModalProps> = ({
  open,
  job,
  defaultModule,
  lockModule = false,
  initialTab = 'core',
  onClose,
}) => {
  const { isReadOnly, isManagerOrAdmin, role } = useAuth();
  const { clients, staff, saveJob, getSettingsByGroup, getHistoryForJob } = useData();

  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [form, setForm] = useState<JobSavePayload>(() => createEmptyJob(defaultModule));
  const [auditRemarks, setAuditRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setError(null);
    setAuditRemarks('');
    if (job) {
      setForm(
        applyMalaysianJobRules({
          jobCode: job.jobCode ?? '',
          module: job.module,
          jobType: job.jobType ?? defaultJobTypeForModule(job.module),
          clientDocId: job.clientDocId ?? '',
          clientId: job.clientId ?? '',
          clientName: job.clientName ?? '',
          groupId: job.groupId ?? '',
          fye: job.fye ?? '',
          ya: job.ya ?? '',
          taxPic: job.taxPic ?? '',
          reviewer: job.reviewer ?? '',
          status: job.status ?? 'Not Started',
          priority: job.priority ?? 'Normal',
          dueDate: job.dueDate ?? '',
          completedDate: job.completedDate ?? '',
          internalDeadline: job.internalDeadline ?? '',
          originalStatutoryDeadline: job.originalStatutoryDeadline ?? '',
          ssmEot1: job.ssmEot1 ?? '',
          ssmEot2: job.ssmEot2 ?? '',
          ssmEot3: job.ssmEot3 ?? '',
          lhdnEot1: job.lhdnEot1 ?? '',
          lhdnEot2: job.lhdnEot2 ?? '',
          lhdnEot3: job.lhdnEot3 ?? '',
          finalApplicableDeadline: job.finalApplicableDeadline ?? '',
          auditBookInDate: job.auditBookInDate ?? '',
          auditReportReceivedDate: job.auditReportReceivedDate ?? '',
          formCStatus: job.formCStatus ?? '',
          formCDueDate: job.formCDueDate ?? '',
          formCSubmissionDate: job.formCSubmissionDate ?? '',
          formCSubmissionReference: job.formCSubmissionReference ?? '',
          mitrsStatus: job.mitrsStatus ?? '',
          mitrsDueDate: job.mitrsDueDate ?? '',
          mitrsSubmissionDate: job.mitrsSubmissionDate ?? '',
          mitrsSubmissionReference: job.mitrsSubmissionReference ?? '',
          dateDocumentsRequested: job.dateDocumentsRequested ?? '',
          dateDocumentsReceived: job.dateDocumentsReceived ?? '',
          draftDate: job.draftDate ?? '',
          reviewDate: job.reviewDate ?? '',
          clientConfirmationDate: job.clientConfirmationDate ?? '',
          yaStatus: job.yaStatus ?? '',
          auditor: job.auditor ?? '',
          accountsStatus: job.accountsStatus ?? '',
          accountBookInDate: job.accountBookInDate ?? '',
          accountReturnDate: job.accountReturnDate ?? '',
          accountReturnStatus: job.accountReturnStatus ?? '',
          submissionStatus: job.submissionStatus ?? '',
          submissionReference: job.submissionReference ?? '',
          personNo: job.personNo ?? '',
          yaSequence: job.yaSequence ?? '',
          finalTaxPayable: job.finalTaxPayable ?? 0,
          finalTaxPayableDate: job.finalTaxPayableDate ?? '',
          formEStatus: job.formEStatus ?? '',
          cp8dStatus: job.cp8dStatus ?? '',
          formEaStatus: job.formEaStatus ?? '',
          complianceChecklist: normalizeComplianceChecklist(job.complianceChecklist),
          documentFollowups: Array.isArray(job.documentFollowups) ? job.documentFollowups : [],
          feeAmount: job.feeAmount ?? 0,
          billedAmount: job.billedAmount ?? 0,
          billingStatus: job.billingStatus ?? 'Unbilled WIP',
          hoursSpent: job.hoursSpent ?? 0,
          remarks: job.remarks ?? '',
          formType: job.formType ?? '',
          submissionDate: job.submissionDate ?? '',
          eFilingAckNo: job.eFilingAckNo ?? '',
          taxPayable: job.taxPayable ?? 0,
          taxRefundable: job.taxRefundable ?? 0,
          cp204Estimate: job.cp204Estimate ?? 0,
          cp204Revised6th: job.cp204Revised6th ?? 0,
          cp204Revised9th: job.cp204Revised9th ?? 0,
          cp204Revised11th: job.cp204Revised11th ?? 0,
          cp204InstallmentStart: job.cp204InstallmentStart ?? '',
          paymentType: job.paymentType ?? '',
          installmentNo: job.installmentNo ?? '',
          amountDue: job.amountDue ?? 0,
          amountPaid: job.amountPaid ?? 0,
          paymentDate: job.paymentDate ?? '',
          receiptNo: job.receiptNo ?? '',
          correspondenceType: job.correspondenceType ?? '',
          letterRefNo: job.letterRefNo ?? '',
          letterDate: job.letterDate ?? '',
          responseDueDate: job.responseDueDate ?? '',
          responseSentDate: job.responseSentDate ?? '',
        })
      );
    } else {
      setForm(createEmptyJob(defaultModule));
    }
  }, [open, job, defaultModule, initialTab]);

  // Live recalculated view of statutory deadlines & Form C/MITRS auto-status (preserving manual overrides)
  const liveForm = useMemo(() => applyMalaysianJobRules(form), [form]);
  const deadlineAnalysis = useMemo(() => analyzeJobDeadlines(liveForm), [liveForm]);
  const jobAuditLog = useMemo(() => (job ? getHistoryForJob(job.id) : []), [job, getHistoryForJob]);

  if (!open) return null;

  const isCompletedLocked = Boolean(job && job.status === 'Completed' && role === 'Staff');
  const effectiveReadOnly = isReadOnly || isCompletedLocked;

  const isFormC = isFormCJob(liveForm);
  const isFormE = liveForm.module === 'Form E' || liveForm.jobType === 'Form E';

  const statusGroup =
    liveForm.module === 'CP204'
      ? 'CP204_STATUS'
      : liveForm.module === 'Tax Payment Monitor'
      ? 'PAYMENT_STATUS'
      : liveForm.module === 'Correspondence'
      ? 'CORRESPONDENCE_STATUS'
      : 'JOB_STATUS';

  const jobTypeOptions = buildDynamicSelectOptions(
    getSettingsByGroup('JOB_TYPE'),
    JOB_TYPES,
    liveForm.jobType || 'Other'
  );

  const statusOptions = (() => {
    const specific = getSettingsByGroup(statusGroup);
    const general = getSettingsByGroup('JOB_STATUS');
    const combinedSettings = [...specific, ...general];
    const fallback = [
      'Not Started',
      'Pending Docs',
      'In Progress',
      'Manager Review',
      'Client Approval',
      'Pending MITRS',
      'Submitted to LHDN',
      'Completed',
      'On Hold',
    ];
    const built = buildDynamicSelectOptions(combinedSettings, fallback, liveForm.status);
    if (!built.some((o) => o.value === 'Pending MITRS')) {
      const compIdx = built.findIndex((o) => o.value === 'Completed');
      if (compIdx >= 0) {
        built.splice(compIdx, 0, { value: 'Pending MITRS', label: 'Pending MITRS' });
      } else {
        built.push({ value: 'Pending MITRS', label: 'Pending MITRS' });
      }
    }
    return built;
  })();

  const priorityOptions = buildDynamicSelectOptions(
    getSettingsByGroup('PRIORITY'),
    ['Urgent', 'High', 'Normal', 'Low'],
    liveForm.priority
  );

  const billingOptions = (() => {
    const list = getSettingsByGroup('BILLING_STATUS').map((s) => s.displayName);
    return list.length > 0 ? list : ['Unbilled WIP', 'Ready to Bill', 'Invoiced', 'Collected'];
  })();

  const corrTypeOptions = (() => {
    const list = getSettingsByGroup('CORRESPONDENCE_TYPE').map((s) => s.displayName);
    return list.length > 0
      ? list
      : ['LHDN Desk Audit', 'LHDN Field Audit', 'Section 78 / 81 Query', 'Form Q Appeal', 'Tax Refund Follow-up'];
  })();

  const activeStaffNames = Array.from(
    new Set(staff.filter((s) => s.active).map((s) => s.staffName.trim()).filter(Boolean))
  );

  const patchForm = (
    partial: Partial<JobSavePayload>,
    recomputeBaseDeadlines = false
  ) => {
    setForm((prev) =>
      applyMalaysianJobRules(
        { ...prev, ...partial },
        { forceRecomputeBaseDeadlines: recomputeBaseDeadlines }
      )
    );
  };

  const handleRecomputeDeadlines = () => {
    if (effectiveReadOnly) return;
    setForm((prev) =>
      applyMalaysianJobRules(prev, { forceRecomputeBaseDeadlines: true })
    );
  };

  const handleSelectClient = (found: ClientRecord | null) => {
    if (!found) {
      patchForm({ clientDocId: '', clientId: '', clientName: '' });
      return;
    }
    const fyeChanged = Boolean(found.fye && found.fye !== form.fye);
    patchForm(
      {
        clientDocId: found.id,
        clientId: found.clientId,
        clientName: found.clientName,
        groupId: found.groupId || form.groupId,
        fye: found.fye || form.fye,
        taxPic: found.taxPic || form.taxPic,
        auditor: found.auditor || form.auditor,
        personNo: found.personNo || form.personNo,
      },
      fyeChanged
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveReadOnly) return;
    if (!liveForm.jobCode.trim() || !liveForm.clientId.trim() || !liveForm.clientName.trim()) {
      setError('Job Code, Client ID, and Client Name are required.');
      setTab('core');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveJob(liveForm, job?.id, auditRemarks.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job.');
    } finally {
      setSaving(false);
    }
  };

  const addFollowupRow = () => {
    const row: DocumentFollowupItem = {
      id: `df_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      documentRequired: '',
      dateRequested: new Date().toISOString().slice(0, 10),
      followUpDate: '',
      dateReceived: '',
      pic: liveForm.taxPic || '',
      status: 'Pending',
      remarks: '',
    };
    patchForm({ documentFollowups: [...(liveForm.documentFollowups || []), row] });
  };

  const checklist = liveForm.complianceChecklist || [];
  const checklistDoneCount = checklist.filter((c) => c.status === 'Completed').length;
  const followups = liveForm.documentFollowups || [];

  const inputCls =
    'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-50 disabled:text-slate-500';
  const labelCls = 'block text-[11px] font-medium text-slate-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 no-print">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-6xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <h3 className="font-display font-bold text-base text-slate-900 truncate">
              {job ? `Job ${job.jobCode}` : `New ${liveForm.module} Job`}
            </h3>
            <StatusPill group={statusGroup} value={liveForm.status} />
            {liveForm.jobType && (
              <span className="text-xs font-mono text-slate-500">· {liveForm.jobType}</span>
            )}
            {effectiveReadOnly && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Lock className="w-3 h-3" />
                {isCompletedLocked ? 'Completed (Manager/Admin to reopen)' : 'Read-Only'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-2 border-b border-slate-200 bg-white flex items-center gap-1 overflow-x-auto shrink-0">
          {(
            [
              { id: 'core', label: 'Core, Deadlines & EOTs' },
              { id: 'workflow', label: 'Workflow, Accounts & Filing' },
              { id: 'checklist', label: `Compliance Checklist (${checklistDoneCount}/${checklist.length})` },
              { id: 'followups', label: `Document Follow-ups (${followups.length})` },
              { id: 'history', label: `Audit History (${jobAuditLog.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'border-teal-700 text-teal-800 bg-teal-50/40'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
            {error && (
              <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {error}
              </div>
            )}

            {/* TAB 1: CORE, DEADLINES, EOTs & FORM C / MITRS / FORM E */}
            {tab === 'core' && (
              <div className="space-y-5">
                {/* Core Identification */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className={labelCls}>Job Code *</label>
                    <input
                      required
                      maxLength={40}
                      disabled={effectiveReadOnly}
                      value={liveForm.jobCode}
                      onChange={(e) => patchForm({ jobCode: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Module *</label>
                    <select
                      disabled={effectiveReadOnly || lockModule}
                      value={liveForm.module}
                      onChange={(e) =>
                        patchForm({ module: e.target.value as JobModule }, true)
                      }
                      className={inputCls}
                    >
                      {ALL_JOB_MODULES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Job Type *</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={liveForm.jobType || 'Other'}
                      onChange={(e) =>
                        patchForm(
                          { jobType: e.target.value as JobType, formType: e.target.value },
                          true
                        )
                      }
                      className={inputCls}
                    >
                      {jobTypeOptions.map((jt) => (
                        <option key={jt.value} value={jt.value}>
                          {jt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <ClientSelectorField
                      clients={clients}
                      value={liveForm.clientId}
                      onSelectClient={handleSelectClient}
                      disabled={effectiveReadOnly}
                      label="Client Picker (Search by Name, Client ID, Company No. or TIN)"
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Client ID *</label>
                    <input
                      required
                      maxLength={40}
                      disabled={effectiveReadOnly}
                      value={liveForm.clientId}
                      onChange={(e) => patchForm({ clientId: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Client Name *</label>
                    <input
                      required
                      maxLength={200}
                      disabled={effectiveReadOnly}
                      value={liveForm.clientName}
                      onChange={(e) => patchForm({ clientName: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Group ID</label>
                    <input
                      maxLength={60}
                      disabled={effectiveReadOnly}
                      value={liveForm.groupId}
                      onChange={(e) => patchForm({ groupId: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>YA (Year of Assessment)</label>
                    <input
                      maxLength={16}
                      disabled={effectiveReadOnly}
                      value={liveForm.ya}
                      onChange={(e) => patchForm({ ya: e.target.value }, true)}
                      placeholder="2026"
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>FYE [01–12]</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={liveForm.fye}
                      onChange={(e) => patchForm({ fye: e.target.value }, true)}
                      className={`${inputCls} font-mono`}
                    >
                      <option value="">—</option>
                      {FYE_MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>TAX PIC</label>
                    <input
                      list="job-staff-list"
                      maxLength={120}
                      disabled={effectiveReadOnly}
                      value={liveForm.taxPic}
                      onChange={(e) => patchForm({ taxPic: e.target.value })}
                      className={inputCls}
                    />
                    <datalist id="job-staff-list">
                      {activeStaffNames.map((n) => (
                        <option key={n} value={n} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className={labelCls}>Reviewer (Manager-HOD)</label>
                    <input
                      list="job-staff-list"
                      maxLength={120}
                      disabled={effectiveReadOnly}
                      value={liveForm.reviewer}
                      onChange={(e) => patchForm({ reviewer: e.target.value })}
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>
                      Job Status{' '}
                      {isFormC && (
                        <span className="text-[10px] text-teal-700">
                          (Auto-Completed via Form C + MITRS)
                        </span>
                      )}
                    </label>
                    <select
                      disabled={effectiveReadOnly}
                      value={liveForm.status}
                      onChange={(e) => patchForm({ status: e.target.value })}
                      className={inputCls}
                    >
                      {statusOptions.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Priority</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={liveForm.priority}
                      onChange={(e) => patchForm({ priority: e.target.value })}
                      className={inputCls}
                    >
                      {priorityOptions.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>YA Status</label>
                    <input
                      maxLength={60}
                      disabled={effectiveReadOnly}
                      value={liveForm.yaStatus}
                      onChange={(e) => patchForm({ yaStatus: e.target.value })}
                      placeholder="e.g. Active / Dormant / 1st YA"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Completed Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={liveForm.completedDate}
                      onChange={(e) => patchForm({ completedDate: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                </div>

                {/* Deadlines & Extension of Time (EOT) Section */}
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-teal-700" />
                      <h4 className="text-xs font-semibold text-slate-900">
                        Deadlines &amp; Extension of Time (EOT) Schedule
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Auto-computed from YA &amp; FYE · Both statutory &amp; normal e-filing dates remain editable for overrides
                    </span>
                  </div>

                  {/* Top Row: Statutory & Normal e-Filing Deadlines (3-Column Side-by-Side) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Internal Deadline</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.internalDeadline}
                        onChange={(e) => patchForm({ internalDeadline: e.target.value })}
                        className={`${inputCls} font-mono tabular-nums`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        Original Statutory Deadline (+7 Months)
                      </label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.originalStatutoryDeadline}
                        onChange={(e) =>
                          patchForm({ originalStatutoryDeadline: e.target.value })
                        }
                        className={`${inputCls} font-mono tabular-nums`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        Normal e-Filing Deadline (+8 Months)
                      </label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.formCDueDate}
                        onChange={(e) => patchForm({ formCDueDate: e.target.value })}
                        className={`${inputCls} font-mono tabular-nums`}
                      />
                    </div>
                  </div>

                  {/* Grouped Extension Section 1: SSM EOT Extensions — Reference Only */}
                  <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                    <div className="px-3.5 py-2 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        SSM EOT Extensions — Reference Only
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Excluded from LHDN Final Applicable Deadline calculation
                      </span>
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/40">
                      <div>
                        <label className={labelCls}>SSM EOT 1</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.ssmEot1}
                          onChange={(e) => patchForm({ ssmEot1: e.target.value })}
                          className={`${inputCls} font-mono tabular-nums`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>SSM EOT 2</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.ssmEot2}
                          onChange={(e) => patchForm({ ssmEot2: e.target.value })}
                          className={`${inputCls} font-mono tabular-nums`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>SSM EOT 3</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.ssmEot3}
                          onChange={(e) => patchForm({ ssmEot3: e.target.value })}
                          className={`${inputCls} font-mono tabular-nums`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Grouped Extension Section 2: LHDN EOT Extensions */}
                  <div className="rounded-lg border border-teal-200/80 overflow-hidden bg-white">
                    <div className="px-3.5 py-2 bg-teal-50/80 border-b border-teal-200/70 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-teal-900">
                        LHDN EOT Extensions
                      </span>
                      <span className="text-[11px] text-teal-700">
                        Latest valid date extends the Final Applicable Deadline
                      </span>
                    </div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>LHDN EOT 1</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.lhdnEot1}
                          onChange={(e) => patchForm({ lhdnEot1: e.target.value })}
                          className={`${inputCls} font-mono tabular-nums`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>LHDN EOT 2</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.lhdnEot2}
                          onChange={(e) => patchForm({ lhdnEot2: e.target.value })}
                          className={`${inputCls} font-mono tabular-nums`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>LHDN EOT 3</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.lhdnEot3}
                          onChange={(e) => patchForm({ lhdnEot3: e.target.value })}
                          className={`${inputCls} font-mono tabular-nums`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Summary Cards (2 Columns Side-by-Side) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                    {/* Left Card: FINAL APPLICABLE DEADLINE */}
                    <div className="rounded-lg border border-slate-300 bg-slate-50/80 p-4 flex flex-col justify-between gap-3">
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold tracking-wide text-slate-700">
                            FINAL APPLICABLE DEADLINE
                          </span>
                          <div className="flex items-center gap-2">
                            {deadlineAnalysis.winningRule && (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${
                                  deadlineAnalysis.winningRule.includes('EOT')
                                    ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                    : 'bg-teal-100 text-teal-800 border border-teal-200'
                                }`}
                              >
                                {deadlineAnalysis.winningRule}
                              </span>
                            )}
                            {!effectiveReadOnly && (
                              <button
                                type="button"
                                onClick={handleRecomputeDeadlines}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0"
                                title="Recalculate Statutory (+7m), Normal e-Filing (+8m), Final Applicable, and MITRS deadlines from YA, FYE, and LHDN EOT 1–3"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Re-compute Deadlines
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-baseline gap-2.5">
                          <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                            {deadlineAnalysis.finalApplicableDeadline || '—'}
                          </span>
                          {deadlineAnalysis.finalApplicableDeadline && (
                            <span className="text-xs text-slate-500">
                              ({formatDisplayDate(deadlineAnalysis.finalApplicableDeadline)})
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500">
                          {liveForm.module === 'Ad Hoc' && !isFormC
                            ? 'Uses Internal Deadline for Ad Hoc engagements.'
                            : isFormC
                            ? 'Latest of Normal e-Filing (+8m) and LHDN EOT 1–3 (SSM EOTs excluded).'
                            : 'Latest of Original Statutory Deadline and LHDN EOT 1–3 (SSM EOTs excluded).'}
                        </p>
                      </div>

                      {/* Subtle Amber Warning if any LHDN EOT is earlier than base deadline */}
                      {deadlineAnalysis.earlierLhdnEots.length > 0 && (
                        <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            {deadlineAnalysis.earlierLhdnEots
                              .map((e) => `${e.label} (${e.date})`)
                              .join(', ')}{' '}
                            {deadlineAnalysis.earlierLhdnEots.length === 1 ? 'is' : 'are'} earlier
                            than the {deadlineAnalysis.baseLabel} deadline (
                            <span className="font-mono">{deadlineAnalysis.baseDeadline}</span>) and{' '}
                            {deadlineAnalysis.earlierLhdnEots.length === 1 ? 'does' : 'do'} not
                            extend the final deadline.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right Card: MITRS APPLICABLE DEADLINE */}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 flex flex-col justify-between gap-3">
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold tracking-wide text-emerald-900">
                            MITRS APPLICABLE DEADLINE
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                            +30 Days
                          </span>
                        </div>

                        <div className="flex items-baseline gap-2.5">
                          <span className="font-mono tabular-nums text-xl font-bold text-emerald-950">
                            {deadlineAnalysis.mitrsApplicableDeadline || '—'}
                          </span>
                          {deadlineAnalysis.mitrsApplicableDeadline && (
                            <span className="text-xs text-emerald-700/80">
                              ({formatDisplayDate(deadlineAnalysis.mitrsApplicableDeadline)})
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-emerald-800/80">
                          {isFormC
                            ? 'Automatically calculated as Final Applicable Deadline + 30 calendar days.'
                            : 'Calculated as Final Applicable Deadline + 30 calendar days (applicable to Form C / MITRS filings).'}
                        </p>
                      </div>

                      {isFormC && (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-900/90 pt-2 border-t border-emerald-200/70">
                          <ShieldAlert className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>
                            Form C Submitted → Pending MITRS; both Form C &amp; MITRS Submitted → Completed.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form C & MITRS Section */}
                {isFormC && (
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-slate-900">
                        Form C &amp; MITRS Filing Tracker
                      </h4>
                      <span className="text-[11px] text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                        Form C Submitted → Pending MITRS · Both Form C &amp; MITRS Submitted → Completed
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div>
                        <label className={labelCls}>Audit Book-In Date</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.auditBookInDate}
                          onChange={(e) => patchForm({ auditBookInDate: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Audit Report Received Date</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.auditReportReceivedDate}
                          onChange={(e) => patchForm({ auditReportReceivedDate: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Form C Status</label>
                        <select
                          disabled={effectiveReadOnly}
                          value={liveForm.formCStatus || 'Pending'}
                          onChange={(e) => patchForm({ formCStatus: e.target.value })}
                          className={inputCls}
                        >
                          {SUBMISSION_SUBSTATUS_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Form C Due Date (FYE + 8m)</label>
                        <input
                          type="date"
                          disabled
                          value={liveForm.formCDueDate}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Form C Submission Date</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.formCSubmissionDate}
                          onChange={(e) => patchForm({ formCSubmissionDate: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className={labelCls}>Form C Submission Reference</label>
                        <input
                          maxLength={80}
                          disabled={effectiveReadOnly}
                          value={liveForm.formCSubmissionReference}
                          onChange={(e) => patchForm({ formCSubmissionReference: e.target.value })}
                          placeholder="MyTax e-Filing Ack Ref"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>MITRS Status</label>
                        <select
                          disabled={effectiveReadOnly}
                          value={liveForm.mitrsStatus || 'Pending'}
                          onChange={(e) => patchForm({ mitrsStatus: e.target.value })}
                          className={inputCls}
                        >
                          {SUBMISSION_SUBSTATUS_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>MITRS Due Date (+30d)</label>
                        <input
                          type="date"
                          disabled
                          value={liveForm.mitrsDueDate}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>MITRS Submission Date</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.mitrsSubmissionDate}
                          onChange={(e) => patchForm({ mitrsSubmissionDate: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className={labelCls}>MITRS Submission Reference</label>
                        <input
                          maxLength={80}
                          disabled={effectiveReadOnly}
                          value={liveForm.mitrsSubmissionReference}
                          onChange={(e) => patchForm({ mitrsSubmissionReference: e.target.value })}
                          placeholder="MITRS Filing Reference"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Form E Sub-Statuses */}
                {isFormE && (
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-900">
                      Form E, C.P.8D &amp; Form EA Sub-Statuses
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Form E Status</label>
                        <select
                          disabled={effectiveReadOnly}
                          value={liveForm.formEStatus || 'Pending'}
                          onChange={(e) => patchForm({ formEStatus: e.target.value })}
                          className={inputCls}
                        >
                          {SUBMISSION_SUBSTATUS_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>C.P.8D Status</label>
                        <select
                          disabled={effectiveReadOnly}
                          value={liveForm.cp8dStatus || 'Pending'}
                          onChange={(e) => patchForm({ cp8dStatus: e.target.value })}
                          className={inputCls}
                        >
                          {SUBMISSION_SUBSTATUS_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Form EA Status</label>
                        <select
                          disabled={effectiveReadOnly}
                          value={liveForm.formEaStatus || 'Pending'}
                          onChange={(e) => patchForm({ formEaStatus: e.target.value })}
                          className={inputCls}
                        >
                          {SUBMISSION_SUBSTATUS_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Specialized CP204 / Payment / Correspondence */}
                {liveForm.module === 'CP204' && (
                  <div className="pt-3 border-t border-slate-200">
                    <h4 className="text-xs font-semibold text-slate-900 mb-3">
                      CP204 / CP204A Tax Estimate Schedule
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div>
                        <label className={labelCls}>Initial CP204 (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={effectiveReadOnly}
                          value={liveForm.cp204Estimate}
                          onChange={(e) => patchForm({ cp204Estimate: Number(e.target.value) })}
                          className={`${inputCls} font-mono text-right`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>6th Month Rev (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={effectiveReadOnly}
                          value={liveForm.cp204Revised6th}
                          onChange={(e) => patchForm({ cp204Revised6th: Number(e.target.value) })}
                          className={`${inputCls} font-mono text-right`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>9th Month Rev (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={effectiveReadOnly}
                          value={liveForm.cp204Revised9th}
                          onChange={(e) => patchForm({ cp204Revised9th: Number(e.target.value) })}
                          className={`${inputCls} font-mono text-right`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>11th Month Rev (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={effectiveReadOnly}
                          value={liveForm.cp204Revised11th}
                          onChange={(e) => patchForm({ cp204Revised11th: Number(e.target.value) })}
                          className={`${inputCls} font-mono text-right`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Installment Start</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.cp204InstallmentStart}
                          onChange={(e) => patchForm({ cp204InstallmentStart: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {liveForm.module === 'Tax Payment Monitor' && (
                  <div className="pt-3 border-t border-slate-200">
                    <h4 className="text-xs font-semibold text-slate-900 mb-3">
                      LHDN Tax Payment &amp; ByrHASiL Receipt Tracking
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Payment Type</label>
                        <select
                          disabled={effectiveReadOnly}
                          value={liveForm.paymentType}
                          onChange={(e) => patchForm({ paymentType: e.target.value })}
                          className={inputCls}
                        >
                          <option value="CP204 Installment">CP204 Installment</option>
                          <option value="CP500 Bi-Monthly">CP500 Bi-Monthly</option>
                          <option value="Balance Tax (Form C/B)">Balance Tax (Form C/B)</option>
                          <option value="Withholding Tax (Sec 107A/109)">
                            Withholding Tax (Sec 107A/109)
                          </option>
                          <option value="Penalty / Compound">Penalty / Compound</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Installment No.</label>
                        <input
                          maxLength={20}
                          disabled={effectiveReadOnly}
                          value={liveForm.installmentNo}
                          onChange={(e) => patchForm({ installmentNo: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>ByrHASiL / FPX Receipt No.</label>
                        <input
                          maxLength={80}
                          disabled={effectiveReadOnly}
                          value={liveForm.receiptNo}
                          onChange={(e) => patchForm({ receiptNo: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Amount Due (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={effectiveReadOnly}
                          value={liveForm.amountDue}
                          onChange={(e) => patchForm({ amountDue: Number(e.target.value) })}
                          className={`${inputCls} font-mono text-right`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Amount Paid (RM)</label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={effectiveReadOnly}
                          value={liveForm.amountPaid}
                          onChange={(e) => patchForm({ amountPaid: Number(e.target.value) })}
                          className={`${inputCls} font-mono text-right`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Payment Date</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.paymentDate}
                          onChange={(e) => patchForm({ paymentDate: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {liveForm.module === 'Correspondence' && (
                  <div className="pt-3 border-t border-slate-200">
                    <h4 className="text-xs font-semibold text-slate-900 mb-3">
                      LHDN Correspondence &amp; Audit Query Details
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div>
                        <label className={labelCls}>Correspondence Type</label>
                        <select
                          disabled={effectiveReadOnly}
                          value={liveForm.correspondenceType}
                          onChange={(e) => patchForm({ correspondenceType: e.target.value })}
                          className={inputCls}
                        >
                          {corrTypeOptions.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>LHDN Ref No.</label>
                        <input
                          maxLength={80}
                          disabled={effectiveReadOnly}
                          value={liveForm.letterRefNo}
                          onChange={(e) => patchForm({ letterRefNo: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Letter Date</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.letterDate}
                          onChange={(e) => patchForm({ letterDate: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Response Due Date</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.responseDueDate}
                          onChange={(e) => patchForm({ responseDueDate: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Response Sent Date</label>
                        <input
                          type="date"
                          disabled={effectiveReadOnly}
                          value={liveForm.responseSentDate}
                          onChange={(e) => patchForm({ responseSentDate: e.target.value })}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: WORKFLOW, ACCOUNTS, SUBMISSION & BILLING */}
            {tab === 'workflow' && (
              <div className="space-y-5">
                <section>
                  <h4 className="text-xs font-semibold text-slate-900 pb-2 mb-3 border-b border-slate-200">
                    1. Workflow Milestone Dates
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <label className={labelCls}>Date Documents Requested</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.dateDocumentsRequested}
                        onChange={(e) => patchForm({ dateDocumentsRequested: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Date Documents Received</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.dateDocumentsReceived}
                        onChange={(e) => patchForm({ dateDocumentsReceived: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Draft Date</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.draftDate}
                        onChange={(e) => patchForm({ draftDate: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Review Date</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.reviewDate}
                        onChange={(e) => patchForm({ reviewDate: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Client Confirmation Date</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.clientConfirmationDate}
                        onChange={(e) => patchForm({ clientConfirmationDate: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-semibold text-slate-900 pb-2 mb-3 border-b border-slate-200">
                    2. Auditor &amp; Accounts Tracking
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <label className={labelCls}>Auditor</label>
                      <input
                        maxLength={120}
                        disabled={effectiveReadOnly}
                        value={liveForm.auditor}
                        onChange={(e) => patchForm({ auditor: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Accounts Status</label>
                      <select
                        disabled={effectiveReadOnly}
                        value={liveForm.accountsStatus}
                        onChange={(e) => patchForm({ accountsStatus: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">— Select —</option>
                        <option value="Pending">Pending</option>
                        <option value="Book-In">Book-In</option>
                        <option value="Draft Received">Draft Received</option>
                        <option value="Final / Audited Received">Final / Audited Received</option>
                        <option value="Not Applicable">Not Applicable</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Account Book-In Date</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.accountBookInDate}
                        onChange={(e) => patchForm({ accountBookInDate: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Account Return Date</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.accountReturnDate}
                        onChange={(e) => patchForm({ accountReturnDate: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Account Return Status</label>
                      <select
                        disabled={effectiveReadOnly}
                        value={liveForm.accountReturnStatus}
                        onChange={(e) => patchForm({ accountReturnStatus: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">— Select —</option>
                        <option value="Pending">Pending</option>
                        <option value="In Review">In Review</option>
                        <option value="Returned to Client">Returned to Client</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-semibold text-slate-900 pb-2 mb-3 border-b border-slate-200">
                    3. Submission, Final Tax Payable &amp; Practice Billing
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className={labelCls}>Submission Status</label>
                      <select
                        disabled={effectiveReadOnly}
                        value={liveForm.submissionStatus}
                        onChange={(e) => patchForm({ submissionStatus: e.target.value })}
                        className={inputCls}
                      >
                        {SUBMISSION_SUBSTATUS_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Submission Reference</label>
                      <input
                        maxLength={80}
                        disabled={effectiveReadOnly}
                        value={liveForm.submissionReference}
                        onChange={(e) => patchForm({ submissionReference: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Submission Date</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.submissionDate}
                        onChange={(e) => patchForm({ submissionDate: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>e-Filing Ack No.</label>
                      <input
                        maxLength={80}
                        disabled={effectiveReadOnly}
                        value={liveForm.eFilingAckNo}
                        onChange={(e) => patchForm({ eFilingAckNo: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Final Tax Payable (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={effectiveReadOnly}
                        value={liveForm.finalTaxPayable}
                        onChange={(e) =>
                          patchForm({
                            finalTaxPayable: Number(e.target.value),
                            taxPayable: Number(e.target.value),
                          })
                        }
                        className={`${inputCls} font-mono text-right`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Final Tax Payable Date</label>
                      <input
                        type="date"
                        disabled={effectiveReadOnly}
                        value={liveForm.finalTaxPayableDate}
                        onChange={(e) => patchForm({ finalTaxPayableDate: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Tax Refundable (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={effectiveReadOnly}
                        value={liveForm.taxRefundable}
                        onChange={(e) => patchForm({ taxRefundable: Number(e.target.value) })}
                        className={`${inputCls} font-mono text-right`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Hours Spent</label>
                      <input
                        type="number"
                        step="0.25"
                        disabled={effectiveReadOnly}
                        value={liveForm.hoursSpent}
                        onChange={(e) => patchForm({ hoursSpent: Number(e.target.value) })}
                        className={`${inputCls} font-mono text-right`}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Agreed Fee (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={effectiveReadOnly}
                        value={liveForm.feeAmount}
                        onChange={(e) => patchForm({ feeAmount: Number(e.target.value) })}
                        className={`${inputCls} font-mono text-right`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Billed Amount (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={effectiveReadOnly}
                        value={liveForm.billedAmount}
                        onChange={(e) => patchForm({ billedAmount: Number(e.target.value) })}
                        className={`${inputCls} font-mono text-right`}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Billing Status</label>
                      <select
                        disabled={effectiveReadOnly}
                        value={liveForm.billingStatus}
                        onChange={(e) => patchForm({ billingStatus: e.target.value })}
                        className={inputCls}
                      >
                        {billingOptions.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-1 lg:col-span-2">
                      <label className={labelCls}>YA Sequence</label>
                      <input
                        maxLength={40}
                        disabled={effectiveReadOnly}
                        value={liveForm.yaSequence}
                        onChange={(e) => patchForm({ yaSequence: e.target.value })}
                        placeholder="e.g. 1st / 2nd / Ongoing"
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-1 lg:col-span-2">
                      <label className={labelCls}>Person No.</label>
                      <input
                        maxLength={60}
                        disabled={effectiveReadOnly}
                        value={liveForm.personNo}
                        onChange={(e) => patchForm({ personNo: e.target.value })}
                        placeholder="e.g. Individual / Director Person No."
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className={labelCls}>General Job Remarks</label>
                      <textarea
                        rows={2}
                        maxLength={2000}
                        disabled={effectiveReadOnly}
                        value={liveForm.remarks}
                        onChange={(e) => patchForm({ remarks: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 3: 7-STEP COMPLIANCE CHECKLIST */}
            {tab === 'checklist' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      Malaysian Tax Compliance Checklist (7 Mandatory Milestones)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Mark each compliance stage as Pending, Completed, or Not Applicable.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-teal-800">
                    {checklistDoneCount} / {checklist.length} Completed
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold w-10">#</th>
                        <th className="px-3 py-2 text-left font-semibold">Compliance Step</th>
                        <th className="px-3 py-2 text-left font-semibold w-56">Status</th>
                        <th className="px-3 py-2 text-left font-semibold w-36">Completed Date</th>
                        <th className="px-3 py-2 text-left font-semibold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {checklist.map((item, idx) => (
                        <tr key={item.step} className="hover:bg-slate-50/70">
                          <td className="px-3 py-2 font-mono text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-900 flex items-center gap-1.5">
                            {item.status === 'Completed' && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            )}
                            {item.step}
                          </td>
                          <td className="px-3 py-2">
                            <div className="inline-flex p-0.5 bg-slate-100 rounded-md">
                              {(['Pending', 'Completed', 'Not Applicable'] as ChecklistStepStatus[]).map(
                                (st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    disabled={effectiveReadOnly}
                                    onClick={() => {
                                      const next = [...checklist];
                                      next[idx] = {
                                        ...item,
                                        status: st,
                                        completedDate:
                                          st === 'Completed'
                                            ? item.completedDate ||
                                              new Date().toISOString().slice(0, 10)
                                            : '',
                                      };
                                      patchForm({ complianceChecklist: next });
                                    }}
                                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                                      item.status === st
                                        ? st === 'Completed'
                                          ? 'bg-emerald-600 text-white'
                                          : st === 'Not Applicable'
                                          ? 'bg-slate-600 text-white'
                                          : 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    } disabled:opacity-60`}
                                  >
                                    {st === 'Not Applicable' ? 'N/A' : st}
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              disabled={effectiveReadOnly || item.status !== 'Completed'}
                              value={item.completedDate || ''}
                              onChange={(e) => {
                                const next = [...checklist];
                                next[idx] = { ...item, completedDate: e.target.value };
                                patchForm({ complianceChecklist: next });
                              }}
                              className={`${inputCls} font-mono`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              disabled={effectiveReadOnly}
                              value={item.remarks || ''}
                              onChange={(e) => {
                                const next = [...checklist];
                                next[idx] = { ...item, remarks: e.target.value };
                                patchForm({ complianceChecklist: next });
                              }}
                              placeholder="Optional notes"
                              className={inputCls}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: DOCUMENT FOLLOW-UPS */}
            {tab === 'followups' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">Document Follow-ups</h4>
                    <p className="text-[11px] text-slate-500">
                      Track client document requests, follow-up chase dates, and receipt dates.
                    </p>
                  </div>
                  {!effectiveReadOnly && (
                    <button
                      type="button"
                      onClick={addFollowupRow}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Follow-up
                    </button>
                  )}
                </div>

                {followups.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                    No document follow-up items logged yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-2.5 py-2 text-left font-semibold">Document Required</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Date Requested</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Follow-Up Date</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Date Received</th>
                          <th className="px-2.5 py-2 text-left font-semibold">PIC</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Status</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Remarks</th>
                          {!effectiveReadOnly && <th className="px-2 py-2 w-10" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {followups.map((item, idx) => (
                          <tr key={item.id}>
                            <td className="p-1.5 min-w-[160px]">
                              <input
                                disabled={effectiveReadOnly}
                                value={item.documentRequired}
                                onChange={(e) => {
                                  const next = [...followups];
                                  next[idx] = { ...item, documentRequired: e.target.value };
                                  patchForm({ documentFollowups: next });
                                }}
                                placeholder="e.g. Audited FS / EA Form"
                                className={inputCls}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={effectiveReadOnly}
                                value={item.dateRequested}
                                onChange={(e) => {
                                  const next = [...followups];
                                  next[idx] = { ...item, dateRequested: e.target.value };
                                  patchForm({ documentFollowups: next });
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={effectiveReadOnly}
                                value={item.followUpDate}
                                onChange={(e) => {
                                  const next = [...followups];
                                  next[idx] = { ...item, followUpDate: e.target.value };
                                  patchForm({ documentFollowups: next });
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={effectiveReadOnly}
                                value={item.dateReceived}
                                onChange={(e) => {
                                  const next = [...followups];
                                  next[idx] = { ...item, dateReceived: e.target.value };
                                  patchForm({ documentFollowups: next });
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                list="job-staff-list"
                                disabled={effectiveReadOnly}
                                value={item.pic}
                                onChange={(e) => {
                                  const next = [...followups];
                                  next[idx] = { ...item, pic: e.target.value };
                                  patchForm({ documentFollowups: next });
                                }}
                                className={inputCls}
                              />
                            </td>
                            <td className="p-1.5">
                              <select
                                disabled={effectiveReadOnly}
                                value={item.status}
                                onChange={(e) => {
                                  const next = [...followups];
                                  next[idx] = { ...item, status: e.target.value };
                                  patchForm({ documentFollowups: next });
                                }}
                                className={inputCls}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Followed Up">Followed Up</option>
                                <option value="Partial">Partial</option>
                                <option value="Received">Received</option>
                                <option value="Waived">Waived</option>
                              </select>
                            </td>
                            <td className="p-1.5 min-w-[140px]">
                              <input
                                disabled={effectiveReadOnly}
                                value={item.remarks}
                                onChange={(e) => {
                                  const next = [...followups];
                                  next[idx] = { ...item, remarks: e.target.value };
                                  patchForm({ documentFollowups: next });
                                }}
                                className={inputCls}
                              />
                            </td>
                            {!effectiveReadOnly && (
                              <td className="p-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    patchForm({
                                      documentFollowups: followups.filter((_, i) => i !== idx),
                                    })
                                  }
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: IMMUTABLE AUDIT HISTORY */}
            {tab === 'history' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-teal-700" />
                  <h4 className="text-xs font-semibold text-slate-900">
                    Job Audit History (Immutable Log)
                  </h4>
                </div>
                {jobAuditLog.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                    {job
                      ? 'No audit history entries recorded yet for this job.'
                      : 'Audit history will be automatically created when you save this job.'}
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Timestamp</th>
                          <th className="px-3 py-2 text-left font-semibold">Action</th>
                          <th className="px-3 py-2 text-left font-semibold">Status Transition</th>
                          <th className="px-3 py-2 text-left font-semibold">User</th>
                          <th className="px-3 py-2 text-left font-semibold">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {jobAuditLog.map((h) => (
                          <tr key={h.id}>
                            <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                              {h.timestamp?.toDate
                                ? h.timestamp.toDate().toLocaleString('en-MY', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })
                                : 'Just now'}
                            </td>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                              {h.action}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                              {h.oldStatus ? `${h.oldStatus} → ${h.newStatus}` : h.newStatus}
                            </td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{h.user}</td>
                            <td className="px-3 py-2 text-slate-600">{h.remarks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer with optional Audit Note */}
          <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            {!effectiveReadOnly ? (
              <div className="flex-1 min-w-[220px] max-w-md">
                <input
                  type="text"
                  maxLength={300}
                  value={auditRemarks}
                  onChange={(e) => setAuditRemarks(e.target.value)}
                  placeholder="Optional audit log remark for this save..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-teal-700"
                />
              </div>
            ) : (
              <span className="text-[11px] text-slate-500">
                {isCompletedLocked && !isManagerOrAdmin
                  ? 'Completed jobs are locked for Staff edits.'
                  : 'Read-only preview.'}
              </span>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md"
              >
                {effectiveReadOnly ? 'Close' : 'Cancel'}
              </button>
              {!effectiveReadOnly && (
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : job ? 'Save Job & Log History' : 'Create Job'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
