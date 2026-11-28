import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Save,
  Lock,
  History,
  RotateCcw,
  AlertTriangle,
  CalendarClock,
  ShieldAlert,
} from 'lucide-react';
import {
  ClientRecord,
  FYE_MONTHS,
  JOB_TYPES,
  JobModule,
  JobType,
  TaxJob,
} from '../../types/tpms';
import {
  AUDIT_TYPE_OPTIONS,
  analyzeJobDeadlines,
  applyMalaysianJobRules,
  buildClientLookupMap,
  createDefaultComplianceChecklist,
  extractFyeMonth,
  findMatchedClient,
  formatDateDDMMYYYY,
  formatDisplayDate,
  formatOverdueLabel,
  getDeadlineStageBadge,
  getOverdueDays,
  getStagePillClasses,
  inferModuleFromJobType,
  isFormCJob,
  normalizeComplianceChecklist,
  normalizeFyeMonthString,
  resolveJobDisplayFye,
} from '../../lib/jobUtils';
import { useAuth } from '../../context/AuthContext';
import { JobSavePayload, useData } from '../../context/DataContext';
import { StatusPill } from '../../components/StatusPill';
import { ClientSelectorField } from '../../components/ClientSelectorField';
import { buildDynamicSelectOptions } from '../../lib/settingsDropdown';

export type JobModalTab = 'basic' | 'deadlines' | 'progress' | 'submission' | 'remarks';

interface JobModalProps {
  open: boolean;
  job: TaxJob | null;
  defaultModule: JobModule;
  lockModule?: boolean;
  initialTab?: JobModalTab;
  onClose: () => void;
}

const FYE_MONTH_LABELS: Record<string, string> = {
  '01': '01 — Jan',
  '02': '02 — Feb',
  '03': '03 — Mar',
  '04': '04 — Apr',
  '05': '05 — May',
  '06': '06 — Jun',
  '07': '07 — Jul',
  '08': '08 — Aug',
  '09': '09 — Sep',
  '10': '10 — Oct',
  '11': '11 — Nov',
  '12': '12 — Dec',
};

const YA_SEQUENCE_SUGGESTIONS = ['1st', '2nd', '3rd', '4th', '5th', 'Ongoing'];

const FORM_C_STATUS_FALLBACK = [
  'Pending',
  'In Progress',
  'Prepared',
  'Manager Review',
  'Client Approval',
  'Submitted',
  'Not Applicable',
];

const MITRS_STATUS_FALLBACK = [
  'Pending',
  'Submitted',
  'Self-Submit',
  'Not Applicable',
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

const NON_CP204_JOB_TYPES = JOB_TYPES.filter(
  (jt) => jt !== 'CP204' && jt !== 'CP204A' && jt !== 'CP204B'
);

function defaultJobTypeForModule(module: JobModule): JobType {
  switch (module) {
    case 'Corporate':
      return 'Form C';
    case 'Individual':
      return 'Form B';
    case 'Form E':
      return 'Form E';
    case 'Ad Hoc':
      return 'Tax Audit';
    default:
      return 'Form C';
  }
}

function createEmptyJob(module: JobModule): JobSavePayload {
  const safeModule: JobModule = module === 'CP204' ? 'Corporate' : module;
  const yr = String(new Date().getFullYear());
  const todayIso = new Date().toISOString().slice(0, 10);
  const jobType = defaultJobTypeForModule(safeModule);
  return applyMalaysianJobRules({
    jobCode: `${jobType.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}-${yr}-${String(
      Math.floor(100 + Math.random() * 900)
    )}`,
    module: safeModule,
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
      safeModule === 'Tax Payment Monitor'
        ? 'Unpaid'
        : safeModule === 'Correspondence'
        ? 'Open Query'
        : 'Not Started',
    statusDate: todayIso,
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
    auditType: '',
    auditBookInDate: '',
    auditReportReceivedDate: '',
    formCStatus: '',
    formCDueDate: '',
    formCSubmissionDate: '',
    formCSubmissionReference: '',
    mitrsStatus: '',
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
    formEStatus: safeModule === 'Form E' ? 'Pending' : '',
    cp8dStatus: safeModule === 'Form E' ? 'Pending' : '',
    formEaStatus: safeModule === 'Form E' ? 'Pending' : '',
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
  });
}

export const JobModal: React.FC<JobModalProps> = ({
  open,
  job,
  defaultModule,
  lockModule = false,
  initialTab = 'basic',
  onClose,
}) => {
  const { isReadOnly, isManagerOrAdmin, role } = useAuth();
  const { clients, staff, saveJob, getSettingsByGroup, getHistoryForJob } = useData();

  const [tab, setTab] = useState<JobModalTab>(initialTab);
  const [form, setForm] = useState<JobSavePayload>(() => createEmptyJob(defaultModule));
  const [auditRemarks, setAuditRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientLookup = useMemo(() => buildClientLookupMap(clients), [clients]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setError(null);
    setAuditRemarks('');
    if (job) {
      const displayFye = resolveJobDisplayFye(job, buildClientLookupMap(clients));
      setForm(
        applyMalaysianJobRules({
          jobCode: job.jobCode ?? '',
          module: job.module,
          jobType: job.jobType ?? defaultJobTypeForModule(job.module),
          clientDocId: job.clientDocId ?? '',
          clientId: job.clientId ?? '',
          clientName: job.clientName ?? '',
          groupId: job.groupId ?? '',
          fye: normalizeFyeMonthString(displayFye) || displayFye,
          ya: job.ya ?? '',
          taxPic: job.taxPic ?? '',
          reviewer: job.reviewer ?? '',
          status: job.status ?? 'Not Started',
          statusDate: job.statusDate ?? '',
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
          auditType: job.auditType ?? '',
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
          finalTaxPayable: job.finalTaxPayable ?? job.taxPayable ?? 0,
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
  }, [open, job, defaultModule, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Backfill Company FYE if clients finish loading after modal opens and FYE is still blank
  useEffect(() => {
    if (!open || !job) return;
    setForm((prev) => {
      if (extractFyeMonth(prev.fye) !== null) return prev;
      const resolvedFye = resolveJobDisplayFye(
        {
          fye: prev.fye,
          companyFye: job.companyFye,
          clientDocId: prev.clientDocId || job.clientDocId,
          clientId: prev.clientId || job.clientId,
        },
        clientLookup
      );
      const normalized = normalizeFyeMonthString(resolvedFye) || resolvedFye;
      if (!normalized) return prev;
      return applyMalaysianJobRules({ ...prev, fye: normalized });
    });
  }, [open, job, clientLookup]);

  // Live recalculated view of statutory deadlines & Form C/MITRS auto-status
  const liveForm = useMemo(() => applyMalaysianJobRules(form), [form]);
  const deadlineAnalysis = useMemo(() => analyzeJobDeadlines(liveForm), [liveForm]);
  const stageBadge = useMemo(
    () => getDeadlineStageBadge(deadlineAnalysis.winningRule),
    [deadlineAnalysis.winningRule]
  );
  const overdueDays = useMemo(
    () => getOverdueDays(deadlineAnalysis.finalApplicableDeadline, liveForm.status),
    [deadlineAnalysis.finalApplicableDeadline, liveForm.status]
  );
  const jobAuditLog = useMemo(() => (job ? getHistoryForJob(job.id) : []), [job, getHistoryForJob]);

  if (!open) return null;

  const isCompletedLocked = Boolean(job && job.status === 'Completed' && role === 'Staff');
  const effectiveReadOnly = isReadOnly || isCompletedLocked;

  const isFormC = isFormCJob(liveForm);
  const isFormE = liveForm.module === 'Form E' || liveForm.jobType === 'Form E';

  const statusGroup =
    liveForm.module === 'Tax Payment Monitor'
      ? 'PAYMENT_STATUS'
      : liveForm.module === 'Correspondence'
      ? 'CORRESPONDENCE_STATUS'
      : 'JOB_STATUS';

  const jobTypeOptions = buildDynamicSelectOptions(
    getSettingsByGroup('JOB_TYPE').filter(
      (s) => !['CP204', 'CP204A', 'CP204B'].includes(s.displayName.trim().toUpperCase())
    ),
    NON_CP204_JOB_TYPES,
    liveForm.jobType || 'Form C'
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

  const auditTypeOptions = buildDynamicSelectOptions(
    getSettingsByGroup('AUDIT TYPE'),
    [...AUDIT_TYPE_OPTIONS],
    liveForm.auditType
  );

  const formCStatusOptions = buildDynamicSelectOptions(
    getSettingsByGroup('FORM C SUBMISSION STATUS'),
    FORM_C_STATUS_FALLBACK,
    liveForm.formCStatus
  );

  const mitrsStatusOptions = buildDynamicSelectOptions(
    getSettingsByGroup('MITRS SUBMISSION STATUS'),
    MITRS_STATUS_FALLBACK,
    liveForm.mitrsStatus
  );

  const activeStaffNames = Array.from(
    new Set(staff.filter((s) => s.active).map((s) => s.staffName.trim()).filter(Boolean))
  );

  const patchForm = (
    partial: Partial<JobSavePayload>,
    recomputeBaseDeadlines = false,
    triggerSubmissionAutoStatus = false
  ) => {
    setForm((prev) =>
      applyMalaysianJobRules(
        { ...prev, ...partial },
        {
          forceRecomputeBaseDeadlines: recomputeBaseDeadlines,
          applySubmissionAutoStatus: triggerSubmissionAutoStatus,
        }
      )
    );
  };

  const handleRecomputeDeadlines = () => {
    if (effectiveReadOnly) return;
    setForm((prev) => {
      let nextFye = prev.fye || '';
      if (extractFyeMonth(nextFye) === null) {
        const matchedClient = findMatchedClient(prev, clientLookup);
        if (matchedClient?.fye) {
          nextFye = normalizeFyeMonthString(matchedClient.fye) || matchedClient.fye.trim();
        }
      }
      return applyMalaysianJobRules(
        { ...prev, fye: nextFye },
        { forceRecomputeBaseDeadlines: true }
      );
    });
  };

  const handleSelectClient = (found: ClientRecord | null) => {
    if (!found) {
      patchForm({ clientDocId: '', clientId: '', clientName: '' });
      return;
    }
    const normalizedClientFye = found.fye
      ? normalizeFyeMonthString(found.fye) || found.fye.trim()
      : form.fye;
    const fyeChanged = Boolean(normalizedClientFye && normalizedClientFye !== form.fye);
    patchForm(
      {
        clientDocId: found.id,
        clientId: found.clientId,
        clientName: found.clientName,
        groupId: found.groupId || form.groupId,
        fye: normalizedClientFye,
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
      setError('Job ID, Client ID, and Client Name are required.');
      setTab('basic');
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

  const inputCls =
    'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-50 disabled:text-slate-500';
  const labelCls = 'block text-[11px] font-medium text-slate-600 mb-1';

  const TABS: ReadonlyArray<{ id: JobModalTab; label: string }> = [
    { id: 'basic', label: 'Basic' },
    { id: 'deadlines', label: 'Deadlines' },
    { id: 'progress', label: 'Progress & Documents' },
    { id: 'submission', label: 'Tax Submission' },
    { id: 'remarks', label: 'Remarks' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 no-print">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h3 className="font-display font-bold text-base text-slate-900 truncate">
              {job ? `Job ${job.jobCode}` : `New ${liveForm.module} Job`}
            </h3>
            <StatusPill group={statusGroup} value={liveForm.status} />
            {liveForm.jobType && (
              <span className="text-xs font-mono text-slate-500">· {liveForm.jobType}</span>
            )}
            {overdueDays > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold leading-none">
                {formatOverdueLabel(overdueDays)}
              </span>
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
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5 Compact Tabs */}
        <div className="px-5 pt-1.5 border-b border-slate-200 bg-white flex items-center gap-1 overflow-x-auto shrink-0">
          {TABS.map((t) => (
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

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {error}
              </div>
            )}

            <datalist id="job-staff-list">
              {activeStaffNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <datalist id="job-ya-seq-list">
              {YA_SEQUENCE_SUGGESTIONS.map((seq) => (
                <option key={seq} value={seq} />
              ))}
            </datalist>

            {/* TAB 1: BASIC */}
            {tab === 'basic' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className={labelCls}>Job ID *</label>
                    <input
                      required
                      maxLength={40}
                      disabled={effectiveReadOnly}
                      value={liveForm.jobCode}
                      onChange={(e) => patchForm({ jobCode: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <ClientSelectorField
                      clients={clients}
                      value={liveForm.clientId}
                      onSelectClient={handleSelectClient}
                      disabled={effectiveReadOnly}
                      label="Client ID (Search by ID, Name, Company No. or TIN) *"
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Client ID *</label>
                    <input
                      required
                      maxLength={40}
                      disabled={effectiveReadOnly}
                      value={liveForm.clientId}
                      onChange={(e) => {
                        const nextClientId = e.target.value;
                        const matched = findMatchedClient({ clientId: nextClientId }, clientLookup);
                        if (matched) {
                          const nextFye = matched.fye
                            ? normalizeFyeMonthString(matched.fye) || matched.fye.trim()
                            : liveForm.fye;
                          const fyeChanged = Boolean(nextFye && nextFye !== liveForm.fye);
                          patchForm(
                            {
                              clientId: nextClientId,
                              clientDocId: matched.id,
                              clientName: liveForm.clientName || matched.clientName,
                              fye: nextFye,
                            },
                            fyeChanged
                          );
                        } else {
                          patchForm({ clientId: nextClientId });
                        }
                      }}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
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
                    <label className={labelCls}>YA</label>
                    <input
                      maxLength={16}
                      disabled={effectiveReadOnly}
                      value={liveForm.ya}
                      onChange={(e) => patchForm({ ya: e.target.value }, true)}
                      placeholder="2026"
                      className={`${inputCls} font-mono tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Job Type *</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={liveForm.jobType || 'Form C'}
                      onChange={(e) => {
                        const nextJobType = e.target.value as JobType;
                        const nextModule = lockModule
                          ? liveForm.module
                          : inferModuleFromJobType(nextJobType, liveForm.module);
                        patchForm(
                          {
                            jobType: nextJobType,
                            formType: nextJobType,
                            module: nextModule,
                          },
                          true
                        );
                      }}
                      className={inputCls}
                    >
                      {jobTypeOptions.map((jt) => (
                        <option key={jt.value} value={jt.value}>
                          {jt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>PIC</label>
                    <input
                      list="job-staff-list"
                      maxLength={120}
                      disabled={effectiveReadOnly}
                      value={liveForm.taxPic}
                      onChange={(e) => patchForm({ taxPic: e.target.value })}
                      placeholder="Assign Tax PIC"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Reviewer</label>
                    <input
                      list="job-staff-list"
                      maxLength={120}
                      disabled={effectiveReadOnly}
                      value={liveForm.reviewer}
                      onChange={(e) => patchForm({ reviewer: e.target.value })}
                      placeholder="Assign Manager / HOD"
                      className={inputCls}
                    />
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
                    <label className={labelCls}>Company FYE</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={normalizeFyeMonthString(liveForm.fye)}
                      onChange={(e) => patchForm({ fye: e.target.value }, true)}
                      className={`${inputCls} font-mono`}
                    >
                      <option value="">— Select FYE —</option>
                      {FYE_MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {FYE_MONTH_LABELS[m] || m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>YA Sequence</label>
                    <input
                      list="job-ya-seq-list"
                      maxLength={40}
                      disabled={effectiveReadOnly}
                      value={liveForm.yaSequence}
                      onChange={(e) => patchForm({ yaSequence: e.target.value })}
                      placeholder="1st, 2nd, 3rd..."
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Audit Type</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={liveForm.auditType || ''}
                      onChange={(e) => patchForm({ auditType: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">— Select —</option>
                      {auditTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DEADLINES */}
            {tab === 'deadlines' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-teal-700" />
                    <h4 className="text-xs font-semibold text-slate-900">
                      Malaysian Tax &amp; SSM Statutory Deadlines
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Computed from YA ({liveForm.ya || '—'}) &amp; FYE (
                    {normalizeFyeMonthString(liveForm.fye) || '—'})
                  </span>
                </div>

                {/* Top 3-column base deadlines */}
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
                      Normal E-Filing Deadline (+8 Months)
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

                {/* Grouped SSM EOT Extensions */}
                <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                  <div className="px-3.5 py-2 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      SSM EOT Extensions
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Separate SSM tracking — never changes LHDN Final Applicable Deadline
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

                {/* Grouped LHDN EOT Extensions */}
                <div className="rounded-lg border border-teal-200/80 overflow-hidden bg-white">
                  <div className="px-3.5 py-2 bg-teal-50/80 border-b border-teal-200/70 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-teal-900">
                      LHDN EOT Extensions
                    </span>
                    <span className="text-[11px] text-teal-700">
                      Updates Final Applicable Deadline &amp; stage (1st EOT / 2nd EOT / 3rd EOT)
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

                {/* Bottom Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
                  {/* Final Applicable Deadline Card */}
                  <div className="rounded-lg border border-slate-300 bg-slate-50/80 p-3.5 flex flex-col justify-between gap-2.5">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold tracking-wide text-slate-700">
                          FINAL APPLICABLE DEADLINE
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {stageBadge && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${getStagePillClasses(
                                stageBadge
                              )}`}
                            >
                              {stageBadge}
                            </span>
                          )}
                          {overdueDays > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-700 border border-rose-200 whitespace-nowrap">
                              {formatOverdueLabel(overdueDays)}
                            </span>
                          )}
                          {!effectiveReadOnly && (
                            <button
                              type="button"
                              onClick={handleRecomputeDeadlines}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0"
                              title="Backfill missing FYE from Client Master and recalculate Statutory (+7m), Normal E-Filing (+8m), Final Applicable, and MITRS (+30d) deadlines"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Re-compute Deadlines
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-baseline gap-2.5">
                        <span
                          className={`font-mono tabular-nums text-lg font-bold ${
                            overdueDays > 0 ? 'text-rose-700' : 'text-slate-900'
                          }`}
                        >
                          {deadlineAnalysis.finalApplicableDeadline
                            ? formatDateDDMMYYYY(deadlineAnalysis.finalApplicableDeadline)
                            : '—'}
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
                          ? 'Defaults to Normal E-Filing (+8 Months); updates only via LHDN EOT 1–3 (SSM EOTs excluded).'
                          : 'Defaults to Original Statutory Deadline; updates only via LHDN EOT 1–3 (SSM EOTs excluded).'}
                      </p>
                    </div>

                    {deadlineAnalysis.earlierLhdnEots.length > 0 && (
                      <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          {deadlineAnalysis.earlierLhdnEots
                            .map((e) => `${e.label} (${formatDateDDMMYYYY(e.date)})`)
                            .join(', ')}{' '}
                          {deadlineAnalysis.earlierLhdnEots.length === 1 ? 'is' : 'are'} earlier
                          than {deadlineAnalysis.baseLabel} (
                          <span className="font-mono">
                            {formatDateDDMMYYYY(deadlineAnalysis.baseDeadline)}
                          </span>
                          ) and does not extend the final deadline.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* MITRS Applicable Deadline Card */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5 flex flex-col justify-between gap-2.5">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold tracking-wide text-emerald-900">
                          MITRS APPLICABLE DEADLINE
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                          +30 Days
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2.5">
                        <span className="font-mono tabular-nums text-lg font-bold text-emerald-950">
                          {deadlineAnalysis.mitrsApplicableDeadline
                            ? formatDateDDMMYYYY(deadlineAnalysis.mitrsApplicableDeadline)
                            : '—'}
                        </span>
                        {deadlineAnalysis.mitrsApplicableDeadline && (
                          <span className="text-xs text-emerald-700/80">
                            ({formatDisplayDate(deadlineAnalysis.mitrsApplicableDeadline)})
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-emerald-800/80">
                        Automatically calculated as Final Applicable Deadline + 30 calendar days.
                      </p>
                    </div>

                    {isFormC && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-900/90 pt-2 border-t border-emerald-200/70">
                        <ShieldAlert className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>
                          Form C Submitted → Pending MITRS; Form C Submitted + MITRS Submitted /
                          Self-Submit → Completed.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PROGRESS & DOCUMENTS (4-Column Grid) */}
            {tab === 'progress' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Overall Status</label>
                  <select
                    disabled={effectiveReadOnly}
                    value={liveForm.status}
                    onChange={(e) => {
                      const nextStatus = e.target.value;
                      patchForm({
                        status: nextStatus,
                        statusDate:
                          liveForm.statusDate || new Date().toISOString().slice(0, 10),
                      });
                    }}
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
                  <label className={labelCls}>Status Date</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.statusDate || ''}
                    onChange={(e) => patchForm({ statusDate: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Date Documents Requested</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.dateDocumentsRequested}
                    onChange={(e) => patchForm({ dateDocumentsRequested: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Date Documents Received</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.dateDocumentsReceived}
                    onChange={(e) => patchForm({ dateDocumentsReceived: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>

                <div>
                  <label className={labelCls}>Audit Book-In Date</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.auditBookInDate}
                    onChange={(e) => patchForm({ auditBookInDate: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Audit Report Received Date</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.auditReportReceivedDate}
                    onChange={(e) => patchForm({ auditReportReceivedDate: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
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
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>

                <div>
                  <label className={labelCls}>Account Return Date</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.accountReturnDate}
                    onChange={(e) => patchForm({ accountReturnDate: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
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
                <div>
                  <label className={labelCls}>Draft Date</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.draftDate}
                    onChange={(e) => patchForm({ draftDate: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Review Date</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.reviewDate}
                    onChange={(e) => patchForm({ reviewDate: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>

                <div>
                  <label className={labelCls}>Client Confirmation Date</label>
                  <input
                    type="date"
                    disabled={effectiveReadOnly}
                    value={liveForm.clientConfirmationDate}
                    onChange={(e) => patchForm({ clientConfirmationDate: e.target.value })}
                    className={`${inputCls} font-mono tabular-nums`}
                  />
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
                  <label className={labelCls}>Auditor</label>
                  <input
                    maxLength={120}
                    disabled={effectiveReadOnly}
                    value={liveForm.auditor}
                    onChange={(e) => patchForm({ auditor: e.target.value })}
                    placeholder="Audit firm name"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Person No.</label>
                  <input
                    maxLength={60}
                    disabled={effectiveReadOnly}
                    value={liveForm.personNo}
                    onChange={(e) => patchForm({ personNo: e.target.value })}
                    placeholder="Director / Individual ref"
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
            )}

            {/* TAB 4: TAX SUBMISSION (4-Column Grid) */}
            {tab === 'submission' && (
              <div className="space-y-4">
                {isFormC && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-sky-50 border border-sky-200 text-[11px] text-sky-900">
                    <span>
                      Auto-completion rule: <strong>Form C Submitted</strong> sets status to{' '}
                      <strong>Pending MITRS</strong>;{' '}
                      <strong>Form C Submitted + MITRS Submitted or Self-Submit</strong>{' '}
                      automatically marks the job <strong>Completed</strong>.
                    </span>
                    <span className="font-mono text-sky-800">
                      MITRS Due: {formatDateDDMMYYYY(deadlineAnalysis.mitrsApplicableDeadline)}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className={labelCls}>Form C Status</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={liveForm.formCStatus ?? ''}
                      onChange={(e) => patchForm({ formCStatus: e.target.value }, false, true)}
                      className={inputCls}
                    >
                      <option value="">-</option>
                      {formCStatusOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Form C Submission Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={liveForm.formCSubmissionDate}
                      onChange={(e) => patchForm({ formCSubmissionDate: e.target.value })}
                      className={`${inputCls} font-mono tabular-nums`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Form C Submission Reference</label>
                    <input
                      maxLength={80}
                      disabled={effectiveReadOnly}
                      value={liveForm.formCSubmissionReference}
                      onChange={(e) => patchForm({ formCSubmissionReference: e.target.value })}
                      placeholder="MyTax e-Filing Acknowledgement Ref"
                      className={`${inputCls} font-mono`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>MITRS Status</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={liveForm.mitrsStatus ?? ''}
                      onChange={(e) => patchForm({ mitrsStatus: e.target.value }, false, true)}
                      className={inputCls}
                    >
                      <option value="">-</option>
                      {mitrsStatusOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>MITRS Submission Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={liveForm.mitrsSubmissionDate}
                      onChange={(e) => patchForm({ mitrsSubmissionDate: e.target.value })}
                      className={`${inputCls} font-mono tabular-nums`}
                    />
                  </div>
                  <div className="sm:col-span-2">
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

                  <div className="sm:col-span-2">
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
                      className={`${inputCls} font-mono tabular-nums text-right`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Final Tax Payable Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={liveForm.finalTaxPayableDate}
                      onChange={(e) => patchForm({ finalTaxPayableDate: e.target.value })}
                      className={`${inputCls} font-mono tabular-nums`}
                    />
                  </div>
                </div>

                {isFormE && (
                  <div className="pt-3 border-t border-slate-200 space-y-2.5">
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
              </div>
            )}

            {/* TAB 5: REMARKS & INTERNAL AUDIT NOTES */}
            {tab === 'remarks' && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Job Remarks</label>
                  <textarea
                    rows={4}
                    maxLength={2000}
                    disabled={effectiveReadOnly}
                    value={liveForm.remarks}
                    onChange={(e) => patchForm({ remarks: e.target.value })}
                    placeholder="Key filing remarks, follow-up notes, client queries, EOT reasons..."
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Internal Audit Notes (Logged on Save)</label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    disabled={effectiveReadOnly}
                    value={auditRemarks}
                    onChange={(e) => setAuditRemarks(e.target.value)}
                    placeholder="Optional internal audit note appended to this job's immutable history on save..."
                    className={inputCls}
                  />
                </div>

                {job && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <History className="w-3.5 h-3.5 text-teal-700" />
                      <span>Audit Trail ({jobAuditLog.length})</span>
                    </div>
                    {jobAuditLog.length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        No audit log entries recorded yet for this job.
                      </p>
                    ) : (
                      <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-[11px] border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                            <tr>
                              <th className="px-2.5 py-1.5 text-left font-semibold">Date</th>
                              <th className="px-2.5 py-1.5 text-left font-semibold">Transition</th>
                              <th className="px-2.5 py-1.5 text-left font-semibold">User</th>
                              <th className="px-2.5 py-1.5 text-left font-semibold">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {jobAuditLog.slice(0, 20).map((h) => (
                              <tr key={h.id}>
                                <td className="px-2.5 py-1.5 font-mono text-slate-600 whitespace-nowrap">
                                  {h.timestamp?.toDate
                                    ? h.timestamp.toDate().toLocaleDateString('en-MY', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                      })
                                    : 'Just now'}
                                </td>
                                <td className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap">
                                  {h.oldStatus ? `${h.oldStatus} → ${h.newStatus}` : h.newStatus}
                                </td>
                                <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">
                                  {h.user}
                                </td>
                                <td className="px-2.5 py-1.5 text-slate-600">{h.remarks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              {effectiveReadOnly
                ? isCompletedLocked && !isManagerOrAdmin
                  ? 'Completed jobs are locked for Staff edits.'
                  : 'Read-only preview.'
                : 'Changes are automatically saved with an immutable audit trail entry.'}
            </span>
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
                  {saving ? 'Saving...' : job ? 'Save Job' : 'Create Job'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
