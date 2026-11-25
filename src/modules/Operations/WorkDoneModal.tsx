import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Save,
  AlertTriangle,
  Lock,
  PlusCircle,
  Calculator,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import {
  FINANCE_INVOICE_STATUSES,
  FinanceInvoiceStatus,
  formatCurrencyRM,
  JOB_TYPES,
  WORK_DONE_PRICING_MODES,
  WORK_DONE_STATUSES,
  WorkDoneFeeAllocation,
  WorkDonePricingMode,
  WorkDoneRecord,
  WorkDoneStatus,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData, WorkDoneSavePayload } from '../../context/DataContext';

interface WorkDoneModalProps {
  open: boolean;
  record: WorkDoneRecord | null;
  onClose: () => void;
}

const ADMIN_ONLY_WD_STATUSES: WorkDoneStatus[] = [
  'Returned by Finance',
  'Ready for Invoicing',
  'Invoiced',
];

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toNumInputStr(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '';
  return String(val);
}

function getDescriptionLines(desc: string): string[] {
  return desc
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function syncAllocationsToDescription(
  desc: string,
  prev: WorkDoneFeeAllocation[]
): WorkDoneFeeAllocation[] {
  const lines = getDescriptionLines(desc);
  return lines.map((line, idx) => {
    const existingByIndex = prev[idx];
    const existingByMatch = prev.find((p) => p.description === line);
    const fee =
      existingByIndex && existingByIndex.description === line
        ? existingByIndex.fee
        : existingByMatch
        ? existingByMatch.fee
        : existingByIndex
        ? existingByIndex.fee
        : 0;
    return {
      lineNo: idx + 1,
      description: line,
      fee: Number.isFinite(fee) ? fee : 0,
    };
  });
}

export const WorkDoneModal: React.FC<WorkDoneModalProps> = ({ open, record, onClose }) => {
  const { isAdmin, isManagerOrAdmin, isReadOnly } = useAuth();
  const { jobs, clients, staff, getSettingsByGroup, saveWorkDone } = useData();

  const isEdit = Boolean(record);
  const wasAlreadyInvoiced = record?.workDoneStatus === 'Invoiced';
  const isLockedBecauseInvoiced = wasAlreadyInvoiced && !isAdmin;
  const formDisabled = isReadOnly || isLockedBecauseInvoiced;

  const canEditHodPricing = isManagerOrAdmin && !formDisabled;
  const canEditAdminFinance = isAdmin && !isReadOnly;

  // Form state
  const [jobSearch, setJobSearch] = useState('');
  const [jobId, setJobId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [ya, setYa] = useState(String(new Date().getFullYear()));
  const [jobType, setJobType] = useState('Form C');
  const [pic, setPic] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [jobStatus, setJobStatus] = useState('');

  const [workDoneDescription, setWorkDoneDescription] = useState('');
  const [selectedCatalogueItem, setSelectedCatalogueItem] = useState('');

  const [pricingMode, setPricingMode] = useState<WorkDonePricingMode>('Overall Fee');
  const [feeAllocations, setFeeAllocations] = useState<WorkDoneFeeAllocation[]>([]);
  const [auditFeeStr, setAuditFeeStr] = useState('');
  const [quotationPriceStr, setQuotationPriceStr] = useState('');
  const [priorYearPriceStr, setPriorYearPriceStr] = useState('');
  const [hodPriceStr, setHodPriceStr] = useState('');
  const [additionalChargesStr, setAdditionalChargesStr] = useState('0');
  const [sstAmountStr, setSstAmountStr] = useState('');

  const [workDoneStatus, setWorkDoneStatus] = useState<WorkDoneStatus>('Draft');
  const [financeInvoiceStatus, setFinanceInvoiceStatus] =
    useState<FinanceInvoiceStatus>('Not Submitted');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [cancellationDate, setCancellationDate] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const descriptionCatalogue = useMemo(
    () => getSettingsByGroup('WORK_DONE_DESCRIPTION'),
    [getSettingsByGroup]
  );

  const activeStaffNames = useMemo(
    () =>
      staff
        .filter((s) => s.active)
        .map((s) => s.staffName)
        .sort((a, b) => a.localeCompare(b)),
    [staff]
  );

  useEffect(() => {
    if (!open) return;
    setError('');
    setJobSearch('');
    setSelectedCatalogueItem('');

    if (record) {
      setJobId(record.jobId || '');
      setClientId(record.clientId || '');
      setClientName(record.clientName || '');
      setYa(record.ya || '');
      setJobType(record.jobType || 'Form C');
      setPic(record.pic || '');
      setReviewer(record.reviewer || '');
      setJobStatus(record.jobStatus || '');
      setWorkDoneDescription(record.workDoneDescription || '');
      setPricingMode(record.pricingMode || 'Overall Fee');
      setFeeAllocations(
        record.pricingMode === 'Individual Allocation'
          ? syncAllocationsToDescription(record.workDoneDescription || '', record.feeAllocations || [])
          : record.feeAllocations || []
      );
      setAuditFeeStr(toNumInputStr(record.auditFee));
      setQuotationPriceStr(toNumInputStr(record.quotationPrice));
      setPriorYearPriceStr(toNumInputStr(record.priorYearPrice));
      setHodPriceStr(toNumInputStr(record.hodPrice));
      setAdditionalChargesStr(String(record.additionalCharges ?? 0));
      setSstAmountStr(toNumInputStr(record.sstAmount));
      setWorkDoneStatus(record.workDoneStatus || 'Draft');
      setFinanceInvoiceStatus(record.financeInvoiceStatus || 'Not Submitted');
      setInvoiceNo(record.invoiceNo || '');
      setIssueDate(record.issueDate || '');
      setCancellationDate(record.cancellationDate || '');
      setCancellationReason(record.cancellationReason || '');
      setRemarks(record.remarks || '');
    } else {
      setJobId('');
      setClientId('');
      setClientName('');
      setYa(String(new Date().getFullYear()));
      setJobType('Form C');
      setPic('');
      setReviewer('');
      setJobStatus('');
      setWorkDoneDescription('');
      setPricingMode('Overall Fee');
      setFeeAllocations([]);
      setAuditFeeStr('');
      setQuotationPriceStr('');
      setPriorYearPriceStr('');
      setHodPriceStr('');
      setAdditionalChargesStr('0');
      setSstAmountStr('');
      setWorkDoneStatus('Draft');
      setFinanceInvoiceStatus('Not Submitted');
      setInvoiceNo('');
      setIssueDate('');
      setCancellationDate('');
      setCancellationReason('');
      setRemarks('');
    }
  }, [open, record]);

  // Keep feeAllocations synchronized 1-to-1 with description lines whenever in Individual Allocation mode
  const handleDescriptionChange = (nextDesc: string) => {
    setWorkDoneDescription(nextDesc);
    if (pricingMode === 'Individual Allocation') {
      const synced = syncAllocationsToDescription(nextDesc, feeAllocations);
      setFeeAllocations(synced);
      const sum = Number(synced.reduce((acc, row) => acc + (Number(row.fee) || 0), 0).toFixed(2));
      setHodPriceStr(synced.length > 0 ? String(sum) : '');
    }
  };

  const handlePricingModeChange = (nextMode: WorkDonePricingMode) => {
    if (!canEditHodPricing) return;
    setPricingMode(nextMode);
    if (nextMode === 'Individual Allocation') {
      const synced = syncAllocationsToDescription(workDoneDescription, feeAllocations);
      setFeeAllocations(synced);
      const sum = Number(synced.reduce((acc, row) => acc + (Number(row.fee) || 0), 0).toFixed(2));
      setHodPriceStr(synced.length > 0 ? String(sum) : '');
    }
  };

  const handleAllocationFeeChange = (lineIndex: number, rawVal: string) => {
    if (!canEditHodPricing) return;
    const numeric = rawVal.trim() === '' ? 0 : Number(rawVal);
    const updated = feeAllocations.map((row, idx) =>
      idx === lineIndex ? { ...row, fee: Number.isFinite(numeric) ? numeric : 0 } : row
    );
    setFeeAllocations(updated);
    const sum = Number(updated.reduce((acc, row) => acc + (Number(row.fee) || 0), 0).toFixed(2));
    setHodPriceStr(String(sum));
  };

  const handleAppendCatalogueLine = () => {
    if (!selectedCatalogueItem) return;
    const existing = workDoneDescription.trim();
    const nextDesc = existing ? `${existing}\n${selectedCatalogueItem}` : selectedCatalogueItem;
    handleDescriptionChange(nextDesc);
    setSelectedCatalogueItem('');
  };

  const handleSelectJob = (selectedJobCode: string) => {
    setJobId(selectedJobCode);
    const found = jobs.find((j) => j.jobCode === selectedJobCode || j.id === selectedJobCode);
    if (found) {
      setClientId(found.clientId || '');
      setClientName(found.clientName || '');
      setYa(found.ya || '');
      setJobType(found.jobType || found.module || 'Form C');
      setPic(found.taxPic || '');
      setReviewer(found.reviewer || '');
      setJobStatus(found.status || '');
    }
  };

  const handleSelectClient = (selectedClientId: string) => {
    setClientId(selectedClientId);
    const found = clients.find((c) => c.clientId === selectedClientId);
    if (found) {
      setClientName(found.clientName);
      if (!pic && found.taxPic) setPic(found.taxPic);
    }
  };

  const handleWorkDoneStatusChange = (nextStatus: WorkDoneStatus) => {
    setWorkDoneStatus(nextStatus);
    if (nextStatus === 'Completed — Pending Finance') {
      setFinanceInvoiceStatus('Pending Review');
    } else if (nextStatus === 'Returned by Finance') {
      setFinanceInvoiceStatus('Returned');
    } else if (nextStatus === 'Ready for Invoicing') {
      setFinanceInvoiceStatus('Ready for Invoicing');
    } else if (nextStatus === 'Invoiced') {
      setFinanceInvoiceStatus('Invoiced');
    } else if (nextStatus === 'Cancelled') {
      setFinanceInvoiceStatus('Cancelled');
      if (!cancellationDate) setCancellationDate(new Date().toISOString().slice(0, 10));
    } else if (
      nextStatus === 'Draft' ||
      nextStatus === 'Quotation Pending Approval' ||
      nextStatus === 'Quotation Issued' ||
      nextStatus === 'In Progress'
    ) {
      setFinanceInvoiceStatus('Not Submitted');
    }
  };

  // Live financial calculations
  const computedHodPrice = useMemo<number | null>(() => {
    if (pricingMode === 'Individual Allocation') {
      if (feeAllocations.length === 0) return null;
      return Number(
        feeAllocations.reduce((acc, row) => acc + (Number(row.fee) || 0), 0).toFixed(2)
      );
    }
    return parseOptionalNumber(hodPriceStr);
  }, [pricingMode, feeAllocations, hodPriceStr]);

  const additionalChargesNum = useMemo(() => {
    const n = Number(additionalChargesStr);
    return Number.isFinite(n) ? n : 0;
  }, [additionalChargesStr]);

  const sstAmountVal = useMemo(() => parseOptionalNumber(sstAmountStr), [sstAmountStr]);

  const finalPrice = Number(((computedHodPrice ?? 0) + additionalChargesNum).toFixed(2));
  const totalInvoiceAmount = Number((finalPrice + (sstAmountVal ?? 0)).toFixed(2));

  // Check if Admin modified pricing on an already-invoiced record
  const pricingChangedOnInvoiced = useMemo(() => {
    if (!wasAlreadyInvoiced || !record) return false;
    return (
      (record.hodPrice ?? null) !== computedHodPrice ||
      record.additionalCharges !== additionalChargesNum ||
      (record.sstAmount ?? null) !== sstAmountVal ||
      record.pricingMode !== pricingMode ||
      JSON.stringify(record.feeAllocations ?? []) !==
        JSON.stringify(pricingMode === 'Individual Allocation' ? feeAllocations : [])
    );
  }, [
    wasAlreadyInvoiced,
    record,
    computedHodPrice,
    additionalChargesNum,
    sstAmountVal,
    pricingMode,
    feeAllocations,
  ]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    const list = q
      ? jobs.filter(
          (j) =>
            j.clientName.toLowerCase().includes(q) ||
            j.jobCode.toLowerCase().includes(q) ||
            (j.jobType || '').toLowerCase().includes(q) ||
            (j.ya || '').toLowerCase().includes(q)
        )
      : jobs;
    return list.slice(0, 80);
  }, [jobs, jobSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formDisabled) return;
    setError('');

    if (!clientName.trim()) {
      setError('Please select a linked Job or Client.');
      return;
    }

    if (
      !isAdmin &&
      ADMIN_ONLY_WD_STATUSES.includes(workDoneStatus) &&
      record?.workDoneStatus !== workDoneStatus
    ) {
      setError(`Only Admin may set Work Done Status to "${workDoneStatus}".`);
      return;
    }

    if (pricingMode === 'Individual Allocation') {
      const descLines = getDescriptionLines(workDoneDescription);
      if (descLines.length === 0) {
        setError(
          'Individual Allocation requires at least one non-empty line in Work Done Description.'
        );
        return;
      }
      if (feeAllocations.length !== descLines.length) {
        setError(
          'Fee allocations must match every non-empty Work Done Description line in exact order.'
        );
        return;
      }
    }

    if (workDoneStatus === 'Completed — Pending Finance') {
      if (computedHodPrice === null) {
        setError(
          'Moving to "Completed — Pending Finance" requires an explicit HOD Price (Quotation Price is never substituted).'
        );
        return;
      }
      if (sstAmountVal === null) {
        setError(
          'Moving to "Completed — Pending Finance" requires an explicit SST Amount (enter 0 if SST-exempt).'
        );
        return;
      }
    }

    if (workDoneStatus === 'Invoiced') {
      if (!isAdmin) {
        setError('Only Admin can mark a record as Invoiced.');
        return;
      }
      if (!invoiceNo.trim() || !issueDate.trim()) {
        setError('Invoice No. and Issue Date are required when marking a record as Invoiced.');
        return;
      }
      if (computedHodPrice === null || sstAmountVal === null) {
        setError('Invoiced records require explicit HOD Price and SST Amount (0 if exempt).');
        return;
      }
    }

    if (pricingChangedOnInvoiced) {
      const trimmedRemarks = remarks.trim();
      const prevRemarks = (record?.remarks || '').trim();
      if (!trimmedRemarks || trimmedRemarks === prevRemarks) {
        setError(
          'Editing pricing on an already-invoiced record requires adding a correction reason in Remarks.'
        );
        return;
      }
    }

    setSaving(true);
    try {
      const payload: WorkDoneSavePayload = {
        workDoneId: record?.workDoneId,
        jobId: jobId.trim(),
        clientId: clientId.trim(),
        clientName: clientName.trim(),
        ya: ya.trim(),
        jobType: jobType.trim(),
        pic: pic.trim(),
        reviewer: reviewer.trim(),
        jobStatus: jobStatus.trim(),
        workDoneDescription: workDoneDescription.trim(),
        pricingMode,
        feeAllocations: pricingMode === 'Individual Allocation' ? feeAllocations : [],
        auditFee: parseOptionalNumber(auditFeeStr),
        quotationPrice: parseOptionalNumber(quotationPriceStr),
        priorYearPrice: parseOptionalNumber(priorYearPriceStr),
        hodPrice: computedHodPrice,
        additionalCharges: additionalChargesNum,
        sstAmount: sstAmountVal,
        workDoneStatus,
        financeInvoiceStatus:
          workDoneStatus === 'Completed — Pending Finance'
            ? 'Pending Review'
            : financeInvoiceStatus,
        invoiceNo: invoiceNo.trim(),
        issueDate: issueDate.trim(),
        cancellationDate: cancellationDate.trim(),
        cancellationReason: cancellationReason.trim(),
        remarks: remarks.trim(),
      };
      await saveWorkDone(payload, record?.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Work Done record.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <Receipt className="w-4 h-4 text-teal-700 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 truncate">
              {isEdit ? `Work Done Record — ${record?.workDoneId}` : 'New Work Done & Finance Record'}
            </h2>
            {wasAlreadyInvoiced && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                <CheckCircle2 className="w-3 h-3" />
                Invoiced
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isLockedBecauseInvoiced && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                This record has already been invoiced. Only an <strong>Admin</strong> may perform
                post-invoice corrections (with a mandatory correction reason in Remarks).
              </span>
            </div>
          )}

          {/* Section 1: Linked Job & Client */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5">
              1. Job & Client Reference
            </h3>

            {!formDisabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Quick-Filter Job Register
                  </label>
                  <input
                    type="text"
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                    placeholder="Type client name, job code, or YA..."
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Link to Tax Job (auto-populates fields)
                  </label>
                  <select
                    value={jobId}
                    onChange={(e) => handleSelectJob(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
                  >
                    <option value="">— Standalone / Select Job —</option>
                    {filteredJobs.map((j) => (
                      <option key={j.id} value={j.jobCode}>
                        {j.jobCode} • {j.clientName} ({j.jobType || j.module} YA {j.ya || '—'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Client *
                </label>
                <select
                  value={clientId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                >
                  <option value="">— Select Client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.clientId}>
                      {c.clientName} ({c.clientId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Client Name *
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={formDisabled}
                  required
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Job Code / Ref
                </label>
                <input
                  type="text"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  disabled={formDisabled}
                  placeholder="Optional job code"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">YA</label>
                <input
                  type="text"
                  value={ya}
                  onChange={(e) => setYa(e.target.value)}
                  disabled={formDisabled}
                  placeholder="e.g. 2025"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Job Type
                </label>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                >
                  {JOB_TYPES.map((jt) => (
                    <option key={jt} value={jt}>
                      {jt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">PIC</label>
                <select
                  value={pic}
                  onChange={(e) => setPic(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                >
                  <option value="">— Select PIC —</option>
                  {activeStaffNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Reviewer
                </label>
                <select
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                >
                  <option value="">— Select Reviewer —</option>
                  {activeStaffNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Job Status
                </label>
                <input
                  type="text"
                  value={jobStatus}
                  onChange={(e) => setJobStatus(e.target.value)}
                  disabled={formDisabled}
                  placeholder="Synced from job"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Work Done Description */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                2. Work Done Description (Multi-Line)
              </h3>
              {!formDisabled && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedCatalogueItem}
                    onChange={(e) => setSelectedCatalogueItem(e.target.value)}
                    className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md max-w-[260px]"
                  >
                    <option value="">+ Insert from Catalogue...</option>
                    {descriptionCatalogue.map((item) => (
                      <option key={item.id} value={item.displayName}>
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAppendCatalogueLine}
                    disabled={!selectedCatalogueItem}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200 rounded-md hover:bg-teal-100 disabled:opacity-40 whitespace-nowrap"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Append Line
                  </button>
                </div>
              )}
            </div>
            <textarea
              rows={4}
              value={workDoneDescription}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              disabled={formDisabled}
              placeholder="Enter one work item per line (e.g., Corporate Tax Computation & Form C Filing)..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-100 leading-relaxed"
            />
          </div>

          {/* Section 3: Pricing & Role-Controlled HOD Approval */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-teal-700" />
                3. Pricing & Fee Computation
              </h3>
              {!isManagerOrAdmin && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  <Lock className="w-3 h-3" />
                  HOD Price & Pricing Mode restricted to Manager-HOD / Admin
                </span>
              )}
            </div>

            {/* Pricing Mode & Reference Prices */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Pricing Mode
                </label>
                <select
                  value={pricingMode}
                  onChange={(e) =>
                    handlePricingModeChange(e.target.value as WorkDonePricingMode)
                  }
                  disabled={!canEditHodPricing}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                >
                  {WORK_DONE_PRICING_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Prior Year Price (RM)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={priorYearPriceStr}
                  onChange={(e) => setPriorYearPriceStr(e.target.value)}
                  disabled={formDisabled}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Quotation Price (RM)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={quotationPriceStr}
                  onChange={(e) => setQuotationPriceStr(e.target.value)}
                  disabled={formDisabled}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Audit Fee Ref (RM)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={auditFeeStr}
                  onChange={(e) => setAuditFeeStr(e.target.value)}
                  disabled={formDisabled}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
            </div>

            {/* Individual Allocation Table */}
            {pricingMode === 'Individual Allocation' && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/70">
                <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Individual Fee Allocation (1-to-1 with Description Lines)
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-teal-800 font-semibold">
                    Auto HOD Sum: {formatCurrencyRM(computedHodPrice ?? 0)}
                  </span>
                </div>
                {feeAllocations.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500">
                    Add at least one line in Work Done Description above to allocate individual fees.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 bg-white">
                    {feeAllocations.map((row, idx) => (
                      <div
                        key={`${row.lineNo}-${idx}`}
                        className="px-3 py-2 flex items-center gap-3"
                      >
                        <span className="text-[11px] font-mono text-slate-400 w-6 shrink-0">
                          #{row.lineNo}
                        </span>
                        <span className="text-xs text-slate-800 flex-1 truncate" title={row.description}>
                          {row.description}
                        </span>
                        <div className="w-36 shrink-0">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.fee}
                            onChange={(e) => handleAllocationFeeChange(idx, e.target.value)}
                            disabled={!canEditHodPricing}
                            className="w-full px-2 py-1 text-xs font-mono tabular-nums text-right bg-white border border-slate-200 rounded disabled:bg-slate-100"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Billing Inputs + Computed Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  HOD Price (RM)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={
                    pricingMode === 'Individual Allocation'
                      ? computedHodPrice !== null
                        ? String(computedHodPrice)
                        : ''
                      : hodPriceStr
                  }
                  onChange={(e) => setHodPriceStr(e.target.value)}
                  disabled={!canEditHodPricing || pricingMode === 'Individual Allocation'}
                  placeholder="Blank = Not Set"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Additional Charges (RM)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={additionalChargesStr}
                  onChange={(e) => setAdditionalChargesStr(e.target.value)}
                  disabled={formDisabled}
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Final Price (Auto)
                </label>
                <div className="px-2.5 py-1.5 text-xs font-mono tabular-nums font-semibold text-slate-900 bg-slate-100 border border-slate-200 rounded-md">
                  {formatCurrencyRM(finalPrice)}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  SST Amount (RM)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sstAmountStr}
                  onChange={(e) => setSstAmountStr(e.target.value)}
                  disabled={formDisabled}
                  placeholder="0 if SST-exempt"
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-teal-800 mb-1">
                  Total Invoice (Auto)
                </label>
                <div className="px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-teal-900 bg-teal-50 border border-teal-200 rounded-md">
                  {formatCurrencyRM(totalInvoiceAmount)}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Workflow Status, Finance & Invoicing */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5">
              4. Work Done Status & Finance Invoicing
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Work Done Status
                </label>
                <select
                  value={workDoneStatus}
                  onChange={(e) =>
                    handleWorkDoneStatusChange(e.target.value as WorkDoneStatus)
                  }
                  disabled={formDisabled}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                >
                  {WORK_DONE_STATUSES.map((st) => {
                    const adminRestricted =
                      ADMIN_ONLY_WD_STATUSES.includes(st) && !isAdmin;
                    return (
                      <option key={st} value={st} disabled={adminRestricted}>
                        {st}
                        {adminRestricted ? ' (Admin only)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Finance Invoice Status
                </label>
                <select
                  value={financeInvoiceStatus}
                  onChange={(e) =>
                    setFinanceInvoiceStatus(e.target.value as FinanceInvoiceStatus)
                  }
                  disabled={!canEditAdminFinance}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                >
                  {FINANCE_INVOICE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Invoice No. {workDoneStatus === 'Invoiced' ? '*' : ''}
                </label>
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  disabled={!canEditAdminFinance}
                  placeholder="Admin only"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Issue Date {workDoneStatus === 'Invoiced' ? '*' : ''}
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  disabled={!canEditAdminFinance}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                />
              </div>
            </div>

            {workDoneStatus === 'Cancelled' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-rose-50/70 border border-rose-200 rounded-lg">
                <div>
                  <label className="block text-[11px] font-medium text-rose-900 mb-1">
                    Cancellation Date
                  </label>
                  <input
                    type="date"
                    value={cancellationDate}
                    onChange={(e) => setCancellationDate(e.target.value)}
                    disabled={formDisabled}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-rose-200 rounded-md"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-rose-900 mb-1">
                    Cancellation Reason
                  </label>
                  <input
                    type="text"
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    disabled={formDisabled}
                    placeholder="Reason for cancelling this work done record..."
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-rose-200 rounded-md"
                  />
                </div>
              </div>
            )}

            {pricingChangedOnInvoiced && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Post-invoice pricing change detected: please document the correction reason in{' '}
                  <strong>Remarks</strong> before saving.
                </span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Remarks {pricingChangedOnInvoiced ? '(Correction Reason Required *)' : ''}
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={formDisabled}
                placeholder="Billing notes, finance return feedback, or post-invoice correction reason..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100"
          >
            {formDisabled ? 'Close' : 'Cancel'}
          </button>
          {!formDisabled && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Work Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
