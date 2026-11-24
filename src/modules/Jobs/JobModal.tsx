import React, { useEffect, useState } from 'react';
import { X, Save, Lock } from 'lucide-react';
import { FYE_MONTHS, JobModule, TaxJob } from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

interface JobModalProps {
  open: boolean;
  job: TaxJob | null;
  defaultModule: JobModule;
  lockModule?: boolean;
  onClose: () => void;
}

type JobFormState = Omit<TaxJob, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>;

const ALL_JOB_MODULES: JobModule[] = [
  'CP204',
  'Corporate',
  'Individual',
  'Ad Hoc',
  'Form E',
  'Tax Payment Monitor',
  'Correspondence',
];

function createEmptyJob(module: JobModule): JobFormState {
  const yr = String(new Date().getFullYear());
  const defaultFormType =
    module === 'Corporate'
      ? 'Form C'
      : module === 'Individual'
      ? 'Form B'
      : module === 'Form E'
      ? 'Form E'
      : module === 'CP204'
      ? 'CP204'
      : '';
  return {
    jobCode: `${module.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}-${yr}-${String(
      Math.floor(100 + Math.random() * 900)
    )}`,
    module,
    clientDocId: '',
    clientId: '',
    clientName: '',
    groupId: '',
    fye: '12',
    ya: yr,
    taxPic: '',
    reviewer: '',
    status: module === 'Tax Payment Monitor' ? 'Unpaid' : module === 'Correspondence' ? 'Open Query' : 'Not Started',
    priority: 'Normal',
    dueDate: '',
    completedDate: '',
    feeAmount: 0,
    billedAmount: 0,
    billingStatus: 'Unbilled WIP',
    hoursSpent: 0,
    remarks: '',
    formType: defaultFormType,
    submissionDate: '',
    eFilingAckNo: '',
    taxPayable: 0,
    taxRefundable: 0,
    cp204Estimate: 0,
    cp204Revised6th: 0,
    cp204Revised9th: 0,
    cp204Revised11th: 0,
    cp204InstallmentStart: '',
    paymentType: 'CP204 Installment',
    installmentNo: '1/12',
    amountDue: 0,
    amountPaid: 0,
    paymentDate: '',
    receiptNo: '',
    correspondenceType: 'LHDN Desk Audit',
    letterRefNo: '',
    letterDate: '',
    responseDueDate: '',
    responseSentDate: '',
  };
}

export const JobModal: React.FC<JobModalProps> = ({
  open,
  job,
  defaultModule,
  lockModule = false,
  onClose,
}) => {
  const { isReadOnly, isManagerOrAdmin, role } = useAuth();
  const { clients, staff, saveJob, getSettingsByGroup } = useData();

  const [form, setForm] = useState<JobFormState>(() => createEmptyJob(defaultModule));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (job) {
      setForm({
        jobCode: job.jobCode ?? '',
        module: job.module,
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
      });
    } else {
      setForm(createEmptyJob(defaultModule));
    }
  }, [open, job, defaultModule]);

  if (!open) return null;

  const isCompletedLocked = Boolean(job && job.status === 'Completed' && role === 'Staff');
  const effectiveReadOnly = isReadOnly || isCompletedLocked;

  const statusGroup =
    form.module === 'CP204'
      ? 'CP204_STATUS'
      : form.module === 'Tax Payment Monitor'
      ? 'PAYMENT_STATUS'
      : form.module === 'Correspondence'
      ? 'CORRESPONDENCE_STATUS'
      : 'JOB_STATUS';

  const statusOptions = (() => {
    const specific = getSettingsByGroup(statusGroup).map((s) => s.displayName);
    const general = getSettingsByGroup('JOB_STATUS').map((s) => s.displayName);
    const merged = Array.from(new Set([...specific, ...general]));
    if (merged.length > 0) return merged;
    return [
      'Not Started',
      'Pending Docs',
      'In Progress',
      'Manager Review',
      'Client Approval',
      'Submitted to LHDN',
      'Completed',
      'On Hold',
    ];
  })();

  const priorityOptions = (() => {
    const list = getSettingsByGroup('PRIORITY').map((s) => s.displayName);
    return list.length > 0 ? list : ['Urgent', 'High', 'Normal', 'Low'];
  })();

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

  const activeStaffNames = staff.filter((s) => s.active).map((s) => s.staffName);

  const handleSelectClient = (clientDocId: string) => {
    const found = clients.find((c) => c.id === clientDocId);
    if (!found) return;
    setForm((prev) => ({
      ...prev,
      clientDocId: found.id,
      clientId: found.clientId,
      clientName: found.clientName,
      groupId: found.groupId || prev.groupId,
      fye: found.fye || prev.fye,
      taxPic: found.taxPic || prev.taxPic,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveReadOnly) return;
    if (!form.jobCode.trim() || !form.clientId.trim() || !form.clientName.trim()) {
      setError('Job Code, Client ID, and Client Name are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveJob(form, job?.id);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 no-print">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-sm text-slate-900">
                {job ? `Job ${job.jobCode} (${form.module})` : `New ${form.module} Job`}
              </h3>
              {effectiveReadOnly && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <Lock className="w-3 h-3" />
                  {isCompletedLocked ? 'Completed (Manager/Admin to reopen)' : 'Read-Only'}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {error && (
              <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {error}
              </div>
            )}

            {/* Client Picker & Core Job Identification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Job Code *</label>
                <input
                  required
                  maxLength={40}
                  disabled={effectiveReadOnly}
                  value={form.jobCode}
                  onChange={(e) => setForm({ ...form, jobCode: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Module *</label>
                <select
                  disabled={effectiveReadOnly || lockModule}
                  value={form.module}
                  onChange={(e) => setForm({ ...form, module: e.target.value as JobModule })}
                  className={inputCls}
                >
                  {ALL_JOB_MODULES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Quick-Select from Client Master</label>
                <select
                  disabled={effectiveReadOnly}
                  value={form.clientDocId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select existing client (auto-fills details) —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.clientId} — {c.clientName} (FYE {c.fye || '-'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Client ID *</label>
                <input
                  required
                  maxLength={40}
                  disabled={effectiveReadOnly}
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Client Name *</label>
                <input
                  required
                  maxLength={200}
                  disabled={effectiveReadOnly}
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Group ID</label>
                <input
                  maxLength={60}
                  disabled={effectiveReadOnly}
                  value={form.groupId}
                  onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>

              <div>
                <label className={labelCls}>YA (Year of Assessment)</label>
                <input
                  maxLength={16}
                  disabled={effectiveReadOnly}
                  value={form.ya}
                  onChange={(e) => setForm({ ...form, ya: e.target.value })}
                  placeholder="2026"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>FYE</label>
                <select
                  disabled={effectiveReadOnly}
                  value={form.fye}
                  onChange={(e) => setForm({ ...form, fye: e.target.value })}
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
                  value={form.taxPic}
                  onChange={(e) => setForm({ ...form, taxPic: e.target.value })}
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
                  value={form.reviewer}
                  onChange={(e) => setForm({ ...form, reviewer: e.target.value })}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Status *</label>
                <select
                  disabled={effectiveReadOnly}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className={inputCls}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <select
                  disabled={effectiveReadOnly}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className={inputCls}
                >
                  {priorityOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Statutory Due Date</label>
                <input
                  type="date"
                  disabled={effectiveReadOnly}
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Completed Date</label>
                <input
                  type="date"
                  disabled={effectiveReadOnly}
                  value={form.completedDate}
                  onChange={(e) => setForm({ ...form, completedDate: e.target.value })}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>

            {/* Module-specific sections */}
            {form.module === 'CP204' && (
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
                      value={form.cp204Estimate}
                      onChange={(e) => setForm({ ...form, cp204Estimate: Number(e.target.value) })}
                      className={`${inputCls} font-mono text-right`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>6th Month Rev (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={effectiveReadOnly}
                      value={form.cp204Revised6th}
                      onChange={(e) => setForm({ ...form, cp204Revised6th: Number(e.target.value) })}
                      className={`${inputCls} font-mono text-right`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>9th Month Rev (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={effectiveReadOnly}
                      value={form.cp204Revised9th}
                      onChange={(e) => setForm({ ...form, cp204Revised9th: Number(e.target.value) })}
                      className={`${inputCls} font-mono text-right`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>11th Month Rev (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={effectiveReadOnly}
                      value={form.cp204Revised11th}
                      onChange={(e) =>
                        setForm({ ...form, cp204Revised11th: Number(e.target.value) })
                      }
                      className={`${inputCls} font-mono text-right`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Installment Start</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={form.cp204InstallmentStart}
                      onChange={(e) => setForm({ ...form, cp204InstallmentStart: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                </div>
              </div>
            )}

            {(form.module === 'Corporate' ||
              form.module === 'Individual' ||
              form.module === 'Form E' ||
              form.module === 'Ad Hoc') && (
              <div className="pt-3 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-slate-900 mb-3">
                  Filing &amp; Tax Assessment Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className={labelCls}>Form / Engagement Type</label>
                    <input
                      maxLength={40}
                      disabled={effectiveReadOnly}
                      value={form.formType}
                      onChange={(e) => setForm({ ...form, formType: e.target.value })}
                      placeholder="Form C / B / BE / E / RPGT"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Submission Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={form.submissionDate}
                      onChange={(e) => setForm({ ...form, submissionDate: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>e-Filing Ack No.</label>
                    <input
                      maxLength={80}
                      disabled={effectiveReadOnly}
                      value={form.eFilingAckNo}
                      onChange={(e) => setForm({ ...form, eFilingAckNo: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Tax Payable (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={effectiveReadOnly}
                      value={form.taxPayable}
                      onChange={(e) => setForm({ ...form, taxPayable: Number(e.target.value) })}
                      className={`${inputCls} font-mono text-right`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Tax Refundable (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={effectiveReadOnly}
                      value={form.taxRefundable}
                      onChange={(e) => setForm({ ...form, taxRefundable: Number(e.target.value) })}
                      className={`${inputCls} font-mono text-right`}
                    />
                  </div>
                </div>
              </div>
            )}

            {form.module === 'Tax Payment Monitor' && (
              <div className="pt-3 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-slate-900 mb-3">
                  LHDN Tax Payment &amp; ByrHASiL Receipt Tracking
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Payment Type</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={form.paymentType}
                      onChange={(e) => setForm({ ...form, paymentType: e.target.value })}
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
                      value={form.installmentNo}
                      onChange={(e) => setForm({ ...form, installmentNo: e.target.value })}
                      placeholder="e.g. 5/12"
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>ByrHASiL / FPX Receipt No.</label>
                    <input
                      maxLength={80}
                      disabled={effectiveReadOnly}
                      value={form.receiptNo}
                      onChange={(e) => setForm({ ...form, receiptNo: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Amount Due (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={effectiveReadOnly}
                      value={form.amountDue}
                      onChange={(e) => setForm({ ...form, amountDue: Number(e.target.value) })}
                      className={`${inputCls} font-mono text-right`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Amount Paid (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={effectiveReadOnly}
                      value={form.amountPaid}
                      onChange={(e) => setForm({ ...form, amountPaid: Number(e.target.value) })}
                      className={`${inputCls} font-mono text-right`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Payment Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={form.paymentDate}
                      onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                </div>
              </div>
            )}

            {form.module === 'Correspondence' && (
              <div className="pt-3 border-t border-slate-200">
                <h4 className="text-xs font-semibold text-slate-900 mb-3">
                  LHDN Correspondence &amp; Audit Query Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className={labelCls}>Correspondence Type</label>
                    <select
                      disabled={effectiveReadOnly}
                      value={form.correspondenceType}
                      onChange={(e) => setForm({ ...form, correspondenceType: e.target.value })}
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
                      value={form.letterRefNo}
                      onChange={(e) => setForm({ ...form, letterRefNo: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Letter Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={form.letterDate}
                      onChange={(e) => setForm({ ...form, letterDate: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Response Due Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={form.responseDueDate}
                      onChange={(e) => setForm({ ...form, responseDueDate: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Response Sent Date</label>
                    <input
                      type="date"
                      disabled={effectiveReadOnly}
                      value={form.responseSentDate}
                      onChange={(e) => setForm({ ...form, responseSentDate: e.target.value })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Billing, Hours & Remarks */}
            <div className="pt-3 border-t border-slate-200">
              <h4 className="text-xs font-semibold text-slate-900 mb-3">
                Work Done, Billing &amp; Remarks
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Agreed Fee (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={effectiveReadOnly}
                    value={form.feeAmount}
                    onChange={(e) => setForm({ ...form, feeAmount: Number(e.target.value) })}
                    className={`${inputCls} font-mono text-right`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Billed Amount (RM)</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={effectiveReadOnly}
                    value={form.billedAmount}
                    onChange={(e) => setForm({ ...form, billedAmount: Number(e.target.value) })}
                    className={`${inputCls} font-mono text-right`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Billing Status</label>
                  <select
                    disabled={effectiveReadOnly}
                    value={form.billingStatus}
                    onChange={(e) => setForm({ ...form, billingStatus: e.target.value })}
                    className={inputCls}
                  >
                    {billingOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Hours Spent</label>
                  <input
                    type="number"
                    step="0.25"
                    disabled={effectiveReadOnly}
                    value={form.hoursSpent}
                    onChange={(e) => setForm({ ...form, hoursSpent: Number(e.target.value) })}
                    className={`${inputCls} font-mono text-right`}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className={labelCls}>Remarks / Audit Trail Notes</label>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    disabled={effectiveReadOnly}
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {isCompletedLocked && !isManagerOrAdmin
                ? 'Completed jobs are locked for Staff edits.'
                : 'Synced with Work Done & Finance and KPI modules.'}
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
