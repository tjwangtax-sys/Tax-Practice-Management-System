import React, { useMemo, useState } from 'react';
import { X, Search, CheckSquare, Square, Eye, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  ClientRecord,
  CORPORATE_BATCH_JOB_TYPES,
  FYE_MONTHS,
  INDIVIDUAL_BATCH_JOB_TYPES,
  JobModule,
  JobType,
} from '../../types/tpms';
import {
  applyMalaysianJobRules,
  computeDefaultStatutoryDeadline,
  createDefaultComplianceChecklist,
  inferModuleFromJobType,
} from '../../lib/deadlineUtils';
import { JobSavePayload, useData } from '../../context/DataContext';
import { StatusPill } from '../../components/StatusPill';

export type BatchModalVariant = 'general' | 'individual';

interface BatchAddJobsModalProps {
  open: boolean;
  variant: BatchModalVariant;
  defaultModule?: JobModule;
  onClose: () => void;
}

export const BatchAddJobsModal: React.FC<BatchAddJobsModalProps> = ({
  open,
  variant,
  defaultModule,
  onClose,
}) => {
  const { clients, jobs, staff, batchCreateJobs } = useData();

  const isIndividualMode = variant === 'individual';
  const availableJobTypes: JobType[] = isIndividualMode
    ? INDIVIDUAL_BATCH_JOB_TYPES
    : CORPORATE_BATCH_JOB_TYPES;

  const initialJobType: JobType = isIndividualMode
    ? 'Form B'
    : defaultModule === 'Form E'
    ? 'Form E'
    : defaultModule === 'CP204'
    ? 'CP204'
    : defaultModule === 'Ad Hoc'
    ? 'Tax Audit'
    : 'Form C';

  const [jobType, setJobType] = useState<JobType>(initialJobType);
  const [ya, setYa] = useState<string>(String(new Date().getFullYear()));
  const [taxPicOverride, setTaxPicOverride] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [internalDeadline, setInternalDeadline] = useState('');
  const [statutoryOverride, setStatutoryOverride] = useState('');
  const [defaultFee, setDefaultFee] = useState<number>(0);
  const [batchRemarks, setBatchRemarks] = useState('');

  // Client filter controls
  const [clientSearch, setClientSearch] = useState('');
  const [fyeFilter, setFyeFilter] = useState('');
  const [onlyActiveClients, setOnlyActiveClients] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);

  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetModule: JobModule = useMemo(() => {
    if (isIndividualMode) {
      if (['Form B', 'Form BE', 'Form M'].includes(jobType)) return 'Individual';
      return defaultModule === 'Ad Hoc' ? 'Ad Hoc' : 'Individual';
    }
    if (defaultModule && defaultModule !== 'Corporate' && defaultModule !== 'Form E') {
      return inferModuleFromJobType(jobType, defaultModule);
    }
    return inferModuleFromJobType(jobType, defaultModule || 'Corporate');
  }, [isIndividualMode, jobType, defaultModule]);

  // Existing duplicate signature lookup: clientId + ya + jobType
  const existingDuplicateKeys = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      const k = `${(j.clientId || '').trim().toLowerCase()}::${(j.ya || '')
        .trim()
        .toLowerCase()}::${(j.jobType || j.formType || j.module).trim().toLowerCase()}`;
      set.add(k);
    }
    return set;
  }, [jobs]);

  const isClientDuplicate = (c: ClientRecord) => {
    const k = `${c.clientId.trim().toLowerCase()}::${ya.trim().toLowerCase()}::${jobType
      .trim()
      .toLowerCase()}`;
    return existingDuplicateKeys.has(k);
  };

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return clients.filter((c) => {
      if (isIndividualMode && c.category !== 'Individual') return false;
      if (!isIndividualMode && defaultModule === 'Corporate' && c.category === 'Individual') {
        return false;
      }
      if (onlyActiveClients && c.clientStatus.toLowerCase() !== 'active') return false;
      if (fyeFilter && c.fye !== fyeFilter) return false;
      if (q) {
        const hay = [c.clientId, c.clientName, c.companyNo, c.tin, c.groupId, c.personNo]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clients, isIndividualMode, defaultModule, onlyActiveClients, fyeFilter, clientSearch]);

  const selectableClients = useMemo(
    () => filteredClients.filter((c) => !isClientDuplicate(c)),
    [filteredClients, existingDuplicateKeys, ya, jobType]
  );

  const selectedClients = useMemo(
    () => clients.filter((c) => selectedIds.has(c.id)),
    [clients, selectedIds]
  );

  const buildPayloadForClient = (c: ClientRecord): JobSavePayload => {
    const prefix = jobType.replace(/[^A-Z0-9]/gi, '').slice(0, 5).toUpperCase() || 'JOB';
    const baseStatutory =
      statutoryOverride || computeDefaultStatutoryDeadline(targetModule, jobType, ya, c.fye);

    const raw: JobSavePayload = {
      jobCode: `${prefix}-${ya || new Date().getFullYear()}-${c.clientId}`,
      module: targetModule,
      jobType,
      clientDocId: c.id,
      clientId: c.clientId,
      clientName: c.clientName,
      groupId: c.groupId || '',
      fye: c.fye || '',
      ya,
      taxPic: taxPicOverride || c.taxPic || '',
      reviewer,
      status: 'Not Started',
      priority,
      dueDate: '',
      completedDate: '',
      internalDeadline,
      originalStatutoryDeadline: baseStatutory,
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
      auditor: c.auditor || '',
      accountsStatus: '',
      accountBookInDate: '',
      accountReturnDate: '',
      accountReturnStatus: '',
      submissionStatus: 'Pending',
      submissionReference: '',
      personNo: c.personNo || '',
      yaSequence: '',
      finalTaxPayable: 0,
      finalTaxPayableDate: '',
      formEStatus: jobType === 'Form E' ? 'Pending' : '',
      cp8dStatus: jobType === 'Form E' ? 'Pending' : '',
      formEaStatus: jobType === 'Form E' ? 'Pending' : '',
      complianceChecklist: createDefaultComplianceChecklist(),
      documentFollowups: [],
      feeAmount: defaultFee,
      billedAmount: 0,
      billingStatus: 'Unbilled WIP',
      hoursSpent: 0,
      remarks: batchRemarks,
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
      paymentType: '',
      installmentNo: '',
      amountDue: 0,
      amountPaid: 0,
      paymentDate: '',
      receiptNo: '',
      correspondenceType: '',
      letterRefNo: '',
      letterDate: '',
      responseDueDate: '',
      responseSentDate: '',
    };
    return applyMalaysianJobRules(raw);
  };

  const previewRows = useMemo(
    () =>
      selectedClients.map((c) => ({
        client: c,
        duplicate: isClientDuplicate(c),
        payload: buildPayloadForClient(c),
      })),
    [
      selectedClients,
      jobType,
      ya,
      taxPicOverride,
      reviewer,
      priority,
      internalDeadline,
      statutoryOverride,
      defaultFee,
      batchRemarks,
      targetModule,
      existingDuplicateKeys,
    ]
  );

  if (!open) return null;

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of selectableClients) next.add(c.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleCommit = async () => {
    if (selectedClients.length === 0) return;
    setBusy(true);
    setError(null);
    setResultMsg(null);
    try {
      const payloads = selectedClients.map((c) => buildPayloadForClient(c));
      const res = await batchCreateJobs(payloads);
      setResultMsg({ created: res.createdCount, skipped: res.skippedCount });
      setSelectedIds(new Set());
      setShowPreview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const activeStaffNames = staff.filter((s) => s.active).map((s) => s.staffName);
  const willCreateCount = previewRows.filter((r) => !r.duplicate).length;
  const duplicateSelectedCount = previewRows.filter((r) => r.duplicate).length;

  const inputCls =
    'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 no-print">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-6xl max-h-[92vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700" />
              {isIndividualMode ? 'Individual Batch Add Jobs' : 'Batch Add Jobs (Corporate / General)'}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Select clients, configure shared YA &amp; Job Type, auto-calculate Malaysian statutory
              deadlines, and skip existing (Client ID + YA + Job Type) duplicates.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {resultMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Batch completed: Created {resultMsg.created} job(s), skipped {resultMsg.skipped}{' '}
                duplicate(s). Audit history entries recorded.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-700 text-white rounded hover:bg-emerald-800"
              >
                Done
              </button>
            </div>
          )}

          {/* Batch Parameters */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Job Type *</label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value as JobType)}
                className={inputCls}
              >
                {availableJobTypes.map((jt) => (
                  <option key={jt} value={jt}>
                    {jt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                YA (Year of Assessment) *
              </label>
              <input
                type="text"
                maxLength={16}
                value={ya}
                onChange={(e) => setYa(e.target.value)}
                placeholder="e.g. 2026"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                TAX PIC (Blank = Client Default)
              </label>
              <input
                list="batch-staff-list"
                value={taxPicOverride}
                onChange={(e) => setTaxPicOverride(e.target.value)}
                placeholder="Keep each client's TAX PIC"
                className={inputCls}
              />
              <datalist id="batch-staff-list">
                {activeStaffNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Reviewer</label>
              <input
                list="batch-staff-list"
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="Manager-HOD"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputCls}
              >
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Normal">Normal</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Internal Deadline {targetModule === 'Ad Hoc' ? '(Used as Final Deadline)' : ''}
              </label>
              <input
                type="date"
                value={internalDeadline}
                onChange={(e) => setInternalDeadline(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Statutory Deadline Override (Optional)
              </label>
              <input
                type="date"
                disabled={jobType === 'Form C'}
                value={statutoryOverride}
                onChange={(e) => setStatutoryOverride(e.target.value)}
                className={`${inputCls} font-mono disabled:bg-slate-100`}
                title={jobType === 'Form C' ? 'Form C auto-calculates from each client FYE' : ''}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Default Fee (RM)
              </label>
              <input
                type="number"
                step="0.01"
                value={defaultFee}
                onChange={(e) => setDefaultFee(Number(e.target.value))}
                className={`${inputCls} font-mono text-right`}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Batch Remarks (Optional)
              </label>
              <input
                type="text"
                maxLength={500}
                value={batchRemarks}
                onChange={(e) => setBatchRemarks(e.target.value)}
                placeholder="Shared notes applied to all newly created jobs"
                className={inputCls}
              />
            </div>
          </div>

          {/* Client Picker OR Preview Table */}
          {!showPreview ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <div className="relative min-w-[220px] flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Search Client ID, Name, TIN, SSM, Group..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-teal-700"
                    />
                  </div>
                  <select
                    value={fyeFilter}
                    onChange={(e) => setFyeFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md font-mono"
                  >
                    <option value="">All FYE (01–12)</option>
                    {FYE_MONTHS.map((m) => (
                      <option key={m} value={m}>
                        FYE {m}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyActiveClients}
                      onChange={(e) => setOnlyActiveClients(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    Active Clients Only
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    className="px-2.5 py-1 text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100"
                  >
                    Select All Eligible ({selectableClients.length})
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50"
                  >
                    Clear ({selectedIds.size})
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">Sel</th>
                        <th className="px-3 py-2 text-left font-semibold">Client ID</th>
                        <th className="px-3 py-2 text-left font-semibold">Client Name</th>
                        <th className="px-3 py-2 text-left font-semibold">Category</th>
                        <th className="px-3 py-2 text-left font-semibold">FYE</th>
                        <th className="px-3 py-2 text-left font-semibold">TAX PIC</th>
                        <th className="px-3 py-2 text-left font-semibold">Duplicate Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            No matching clients found.
                          </td>
                        </tr>
                      ) : (
                        filteredClients.map((c) => {
                          const dup = isClientDuplicate(c);
                          const checked = selectedIds.has(c.id);
                          return (
                            <tr
                              key={c.id}
                              onClick={() => !dup && toggleOne(c.id)}
                              className={`transition-colors ${
                                dup
                                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                                  : checked
                                  ? 'bg-teal-50/50 cursor-pointer'
                                  : 'hover:bg-slate-50 cursor-pointer'
                              }`}
                            >
                              <td className="px-3 py-2 text-center">
                                {dup ? (
                                  <Square className="w-4 h-4 text-slate-300 mx-auto" />
                                ) : checked ? (
                                  <CheckSquare className="w-4 h-4 text-teal-700 mx-auto" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400 mx-auto" />
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">
                                {c.clientId}
                              </td>
                              <td className="px-3 py-2 font-medium">{c.clientName}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{c.category}</td>
                              <td className="px-3 py-2 font-mono whitespace-nowrap">
                                {c.fye || '—'}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">{c.taxPic || '—'}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {dup ? (
                                  <span className="text-[11px] font-medium text-amber-700">
                                    Duplicate ({ya} · {jobType}) — Will Skip
                                  </span>
                                ) : (
                                  <StatusPill group="CLIENT_STATUS" value={c.clientStatus} />
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
            </div>
          ) : (
            /* Optional Preview Table */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-900">
                  Batch Creation Preview — {willCreateCount} job(s) ready to create
                  {duplicateSelectedCount > 0 && (
                    <span className="ml-2 text-amber-700 font-normal">
                      ({duplicateSelectedCount} duplicate(s) will be skipped)
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="text-xs font-medium text-teal-700 hover:underline"
                >
                  ← Back to Client Selection
                </button>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Job Code</th>
                        <th className="px-3 py-2 text-left font-semibold">Client</th>
                        <th className="px-3 py-2 text-left font-semibold">Module / Type</th>
                        <th className="px-3 py-2 text-left font-semibold">FYE / YA</th>
                        <th className="px-3 py-2 text-left font-semibold">Orig. Statutory</th>
                        {jobType === 'Form C' && (
                          <th className="px-3 py-2 text-left font-semibold">Form C Due (+8m)</th>
                        )}
                        <th className="px-3 py-2 text-left font-semibold">Final Deadline</th>
                        {jobType === 'Form C' && (
                          <th className="px-3 py-2 text-left font-semibold">MITRS Due (+30d)</th>
                        )}
                        <th className="px-3 py-2 text-left font-semibold">TAX PIC</th>
                        <th className="px-3 py-2 text-left font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.map((row) => (
                        <tr key={row.client.id} className={row.duplicate ? 'bg-amber-50/40' : ''}>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">
                            {row.payload.jobCode}
                          </td>
                          <td className="px-3 py-2 font-medium">{row.payload.clientName}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.payload.module} · {row.payload.jobType}
                          </td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">
                            M{row.payload.fye || '--'} / {row.payload.ya}
                          </td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">
                            {row.payload.originalStatutoryDeadline || '—'}
                          </td>
                          {jobType === 'Form C' && (
                            <td className="px-3 py-2 font-mono whitespace-nowrap">
                              {row.payload.formCDueDate || '—'}
                            </td>
                          )}
                          <td className="px-3 py-2 font-mono font-semibold text-teal-800 whitespace-nowrap">
                            {row.payload.finalApplicableDeadline || '—'}
                          </td>
                          {jobType === 'Form C' && (
                            <td className="px-3 py-2 font-mono whitespace-nowrap">
                              {row.payload.mitrsDueDate || '—'}
                            </td>
                          )}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.payload.taxPic || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-medium">
                            {row.duplicate ? (
                              <span className="text-amber-700">Skip Duplicate</span>
                            ) : (
                              <span className="text-emerald-700">Create</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-600">
            Selected: <span className="font-mono font-semibold">{selectedIds.size}</span> · Eligible
            to create: <span className="font-mono font-semibold text-teal-800">{willCreateCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => setShowPreview((p) => !p)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
              {showPreview ? 'Edit Selection' : 'Preview Deadlines'}
            </button>
            <button
              type="button"
              disabled={busy || willCreateCount === 0}
              onClick={() => void handleCommit()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5" />
              {busy ? 'Creating Batch...' : `Create ${willCreateCount} Job(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
