import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, AlertCircle, Search } from 'lucide-react';
import {
  CP204_REVISION_MONTHS,
  CP204_REVISION_STATUS_OPTIONS,
  CP204_STATUS_OPTIONS,
  Cp204Record,
  Cp204Revision,
  Cp204RevisionMonth,
  Cp204RevisionStatus,
  Cp204Status,
  formatCurrencyRM,
  FYE_MONTHS,
  safeNum,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  computeCp204BasisDates,
  computeCp204CurrentEstimatedTax,
  computeRevisionDeadline,
} from './cp204Utils';

const inputCls =
  'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-50 disabled:text-slate-500';
const labelCls = 'block text-[11px] font-medium text-slate-600 mb-1';

// =============================================================================
// 1. Quick Add CP204 Initial Estimate Modal
// =============================================================================
interface Cp204InitialQuickModalProps {
  open: boolean;
  prefillClientId?: string;
  prefillYa?: string;
  onClose: () => void;
}

export const Cp204InitialQuickModal: React.FC<Cp204InitialQuickModalProps> = ({
  open,
  prefillClientId,
  prefillYa,
  onClose,
}) => {
  const { isReadOnly } = useAuth();
  const { clients, staff, saveCp204 } = useData();

  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [ya, setYa] = useState(String(new Date().getFullYear()));
  const [fye, setFye] = useState('12');
  const [basisPeriodStart, setBasisPeriodStart] = useState('');
  const [basisPeriodEnd, setBasisPeriodEnd] = useState('');
  const [statutoryCp204DueDate, setStatutoryCp204DueDate] = useState('');
  const [originalEstimatedTax, setOriginalEstimatedTax] = useState('0');
  const [originalSubmissionDate, setOriginalSubmissionDate] = useState('');
  const [pic, setPic] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [status, setStatus] = useState<Cp204Status>('In Progress');
  const [acknowledgementUrl, setAcknowledgementUrl] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const corporateClients = useMemo(
    () =>
      clients.filter((c) => c.category === 'Corporate' || c.category === 'Other'),
    [clients]
  );

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return corporateClients;
    return corporateClients.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        c.clientId.toLowerCase().includes(q) ||
        (c.companyNo || '').toLowerCase().includes(q)
    );
  }, [corporateClients, clientSearch]);

  const activeStaffNames = useMemo(
    () => staff.filter((s) => s.active).map((s) => s.staffName),
    [staff]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setClientSearch('');
    const targetYa = prefillYa || String(new Date().getFullYear());
    setYa(targetYa);

    const matched = prefillClientId
      ? clients.find((c) => c.clientId === prefillClientId)
      : undefined;

    if (matched) {
      setClientId(matched.clientId);
      setClientName(matched.clientName);
      const nextFye = matched.fye || '12';
      setFye(nextFye);
      setPic(matched.taxPic || '');
      const dates = computeCp204BasisDates(targetYa, nextFye);
      setBasisPeriodStart(dates.basisPeriodStart);
      setBasisPeriodEnd(dates.basisPeriodEnd);
      setStatutoryCp204DueDate(dates.statutoryCp204DueDate);
    } else {
      setClientId('');
      setClientName('');
      setFye('12');
      setPic('');
      const dates = computeCp204BasisDates(targetYa, '12');
      setBasisPeriodStart(dates.basisPeriodStart);
      setBasisPeriodEnd(dates.basisPeriodEnd);
      setStatutoryCp204DueDate(dates.statutoryCp204DueDate);
    }

    setOriginalEstimatedTax('0');
    setOriginalSubmissionDate('');
    setReviewer('');
    setStatus('In Progress');
    setAcknowledgementUrl('');
    setRemarks('');
  }, [open, prefillClientId, prefillYa, clients]);

  if (!open) return null;

  const handleSelectClient = (selectedClientId: string) => {
    const found = clients.find((c) => c.clientId === selectedClientId);
    if (!found) {
      setClientId('');
      setClientName('');
      return;
    }
    setClientId(found.clientId);
    setClientName(found.clientName);
    const nextFye = found.fye || fye || '12';
    setFye(nextFye);
    if (found.taxPic) setPic(found.taxPic);
    const dates = computeCp204BasisDates(ya, nextFye);
    setBasisPeriodStart(dates.basisPeriodStart);
    setBasisPeriodEnd(dates.basisPeriodEnd);
    setStatutoryCp204DueDate(dates.statutoryCp204DueDate);
  };

  const handleYaOrFyeChange = (nextYa: string, nextFye: string) => {
    setYa(nextYa);
    setFye(nextFye);
    const dates = computeCp204BasisDates(nextYa, nextFye);
    setBasisPeriodStart(dates.basisPeriodStart);
    setBasisPeriodEnd(dates.basisPeriodEnd);
    setStatutoryCp204DueDate(dates.statutoryCp204DueDate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setError(null);
    setSaving(true);
    try {
      const origTax = safeNum(originalEstimatedTax);
      await saveCp204({
        clientId,
        clientName,
        ya,
        fye,
        basisPeriodStart,
        basisPeriodEnd,
        originalEstimatedTax: origTax,
        originalSubmissionDate,
        currentEstimatedTax: origTax,
        statutoryCp204DueDate,
        pic,
        reviewer,
        status,
        acknowledgementUrl,
        remarks,
        revisions: [],
        instalments: [],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create CP204 record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-sm text-slate-900">
              Add CP204 Initial Estimate
            </h3>
            <p className="text-[11px] text-slate-500">
              Creates a unique Corporate CP204 master record per company and Year of Assessment
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

          {/* Searchable Corporate Client Picker */}
          <div className="space-y-2">
            <label className={labelCls}>Company (Corporate Client) *</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Filter corporate clients by name, Client ID, or SSM No..."
                className={`${inputCls} pl-8`}
              />
            </div>
            <select
              required
              disabled={isReadOnly}
              value={clientId}
              onChange={(e) => handleSelectClient(e.target.value)}
              className={inputCls}
            >
              <option value="">— Select Company —</option>
              {filteredClients.map((c) => (
                <option key={c.id} value={c.clientId}>
                  {c.clientName} ({c.clientId}) {c.fye ? `· FYE ${Number(c.fye)}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Year of Assessment (YA) *</label>
              <input
                required
                maxLength={16}
                disabled={isReadOnly}
                value={ya}
                onChange={(e) => handleYaOrFyeChange(e.target.value, fye)}
                placeholder="2026"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>FYE Month</label>
              <select
                disabled={isReadOnly}
                value={fye}
                onChange={(e) => handleYaOrFyeChange(ya, e.target.value)}
                className={`${inputCls} font-mono`}
              >
                <option value="">—</option>
                {FYE_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m} (Month {Number(m)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                disabled={isReadOnly}
                value={status}
                onChange={(e) => setStatus(e.target.value as Cp204Status)}
                className={inputCls}
              >
                {CP204_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Basis Period Start</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={basisPeriodStart}
                onChange={(e) => setBasisPeriodStart(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Basis Period End</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={basisPeriodEnd}
                onChange={(e) => setBasisPeriodEnd(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Statutory CP204 Due Date</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={statutoryCp204DueDate}
                onChange={(e) => setStatutoryCp204DueDate(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Original Estimated Tax (RM) *</label>
              <input
                type="number"
                step="0.01"
                required
                disabled={isReadOnly}
                value={originalEstimatedTax}
                onChange={(e) => setOriginalEstimatedTax(e.target.value)}
                className={`${inputCls} font-mono text-right`}
              />
            </div>
            <div>
              <label className={labelCls}>Original Submission Date</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={originalSubmissionDate}
                onChange={(e) => setOriginalSubmissionDate(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>PIC</label>
              <input
                list="cp204-quick-staff"
                maxLength={120}
                disabled={isReadOnly}
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                className={inputCls}
              />
              <datalist id="cp204-quick-staff">
                {activeStaffNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Reviewer</label>
              <input
                list="cp204-quick-staff"
                maxLength={120}
                disabled={isReadOnly}
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Acknowledgement URL (MyTax / PDF Link)</label>
            <input
              type="url"
              maxLength={500}
              disabled={isReadOnly}
              value={acknowledgementUrl}
              onChange={(e) => setAcknowledgementUrl(e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || isReadOnly}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Create CP204 Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// 2. Quick Add CP204A Revision Modal
// =============================================================================
interface Cp204RevisionQuickModalProps {
  open: boolean;
  preselectedRecordId?: string;
  onClose: () => void;
}

export const Cp204RevisionQuickModal: React.FC<Cp204RevisionQuickModalProps> = ({
  open,
  preselectedRecordId,
  onClose,
}) => {
  const { isReadOnly } = useAuth();
  const { cp204Records, staff, saveCp204 } = useData();

  const [recordSearch, setRecordSearch] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [revisionMonth, setRevisionMonth] = useState<Cp204RevisionMonth>('6');
  const [previousEstimatedTax, setPreviousEstimatedTax] = useState('0');
  const [proposedEstimatedTax, setProposedEstimatedTax] = useState('0');
  const [reason, setReason] = useState('');
  const [reviewStatus, setReviewStatus] = useState<Cp204RevisionStatus>('In Progress');
  const [pic, setPic] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [submissionDate, setSubmissionDate] = useState('');
  const [acknowledgementUrl, setAcknowledgementUrl] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredRecords = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return cp204Records;
    return cp204Records.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        r.clientId.toLowerCase().includes(q) ||
        r.ya.toLowerCase().includes(q) ||
        r.cp204Id.toLowerCase().includes(q)
    );
  }, [cp204Records, recordSearch]);

  const activeStaffNames = useMemo(
    () => staff.filter((s) => s.active).map((s) => s.staffName),
    [staff]
  );

  const parentRecord: Cp204Record | undefined = useMemo(
    () => cp204Records.find((r) => r.id === selectedRecordId),
    [cp204Records, selectedRecordId]
  );

  const applyParentDefaults = (rec: Cp204Record | undefined, month: Cp204RevisionMonth) => {
    if (!rec) return;
    const prevTax =
      rec.currentEstimatedTax > 0 ? rec.currentEstimatedTax : rec.originalEstimatedTax;
    setPreviousEstimatedTax(String(prevTax));
    setProposedEstimatedTax(String(prevTax));
    setPic(rec.pic || '');
    setReviewer(rec.reviewer || '');
    setSubmissionDeadline(computeRevisionDeadline(rec.basisPeriodStart, month));
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRecordSearch('');
    const initialId = preselectedRecordId || cp204Records[0]?.id || '';
    setSelectedRecordId(initialId);
    const rec = cp204Records.find((r) => r.id === initialId);

    // Suggest the next unrecorded revision month (6 -> 9 -> 11)
    let defaultMonth: Cp204RevisionMonth = '6';
    if (rec) {
      const existingMonths = new Set(rec.revisions.map((r) => r.revisionMonth));
      if (!existingMonths.has('6')) defaultMonth = '6';
      else if (!existingMonths.has('9')) defaultMonth = '9';
      else defaultMonth = '11';
    }
    setRevisionMonth(defaultMonth);
    applyParentDefaults(rec, defaultMonth);
    setReason('');
    setReviewStatus('In Progress');
    setSubmissionDate('');
    setAcknowledgementUrl('');
    setRemarks('');
  }, [open, preselectedRecordId, cp204Records]);

  if (!open) return null;

  const variance = Math.round((safeNum(proposedEstimatedTax) - safeNum(previousEstimatedTax)) * 100) / 100;
  const willUpdateMasterCurrentTax = reviewStatus === 'Approved' || reviewStatus === 'Submitted';

  const handleSelectParent = (recId: string) => {
    setSelectedRecordId(recId);
    const rec = cp204Records.find((r) => r.id === recId);
    applyParentDefaults(rec, revisionMonth);
  };

  const handleMonthChange = (month: Cp204RevisionMonth) => {
    setRevisionMonth(month);
    if (parentRecord) {
      setSubmissionDeadline(computeRevisionDeadline(parentRecord.basisPeriodStart, month));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!parentRecord) {
      setError('Please select a parent CP204 master record.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const newRevision: Cp204Revision = {
        revisionId: `REV-${revisionMonth}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        revisionMonth,
        previousEstimatedTax: safeNum(previousEstimatedTax),
        proposedEstimatedTax: safeNum(proposedEstimatedTax),
        variance,
        reason: reason.trim(),
        reviewStatus,
        pic: pic.trim(),
        reviewer: reviewer.trim(),
        submissionDeadline,
        submissionDate,
        acknowledgementUrl: acknowledgementUrl.trim(),
        remarks: remarks.trim(),
      };

      const nextRevisions = [...parentRecord.revisions, newRevision];
      const nextCurrentTax = computeCp204CurrentEstimatedTax(
        parentRecord.originalEstimatedTax,
        nextRevisions
      );

      await saveCp204(
        {
          cp204Id: parentRecord.cp204Id,
          clientId: parentRecord.clientId,
          clientName: parentRecord.clientName,
          ya: parentRecord.ya,
          fye: parentRecord.fye,
          basisPeriodStart: parentRecord.basisPeriodStart,
          basisPeriodEnd: parentRecord.basisPeriodEnd,
          originalEstimatedTax: parentRecord.originalEstimatedTax,
          originalSubmissionDate: parentRecord.originalSubmissionDate,
          currentEstimatedTax: nextCurrentTax,
          statutoryCp204DueDate: parentRecord.statutoryCp204DueDate,
          pic: parentRecord.pic,
          reviewer: parentRecord.reviewer,
          status: parentRecord.status,
          acknowledgementUrl: parentRecord.acknowledgementUrl,
          remarks: parentRecord.remarks,
          revisions: nextRevisions,
          instalments: parentRecord.instalments,
        },
        parentRecord.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save CP204A revision.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-sm text-slate-900">
              Add CP204A Revision (6th / 9th / 11th Month)
            </h3>
            <p className="text-[11px] text-slate-500">
              Previous Estimated Tax auto-fills from the parent CP204 record; master Current Estimated Tax updates only when Approved or Submitted
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

          <div className="space-y-2">
            <label className={labelCls}>Parent CP204 Master Record *</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                placeholder="Search by Company, Client ID, YA, or CP204 ID..."
                className={`${inputCls} pl-8`}
              />
            </div>
            <select
              required
              disabled={isReadOnly}
              value={selectedRecordId}
              onChange={(e) => handleSelectParent(e.target.value)}
              className={inputCls}
            >
              <option value="">— Select CP204 Record —</option>
              {filteredRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.clientName} ({r.clientId}) · YA {r.ya} · Current:{' '}
                  {formatCurrencyRM(r.currentEstimatedTax)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Revision Month *</label>
              <select
                disabled={isReadOnly}
                value={revisionMonth}
                onChange={(e) => handleMonthChange(e.target.value as Cp204RevisionMonth)}
                className={inputCls}
              >
                {CP204_REVISION_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}th Month Revision (CP204A)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Review Status *</label>
              <select
                disabled={isReadOnly}
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as Cp204RevisionStatus)}
                className={inputCls}
              >
                {CP204_REVISION_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Financial Variance Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <label className={labelCls}>Previous Estimated Tax (RM)</label>
              <input
                type="number"
                step="0.01"
                disabled={isReadOnly}
                value={previousEstimatedTax}
                onChange={(e) => setPreviousEstimatedTax(e.target.value)}
                className={`${inputCls} font-mono text-right`}
              />
            </div>
            <div>
              <label className={labelCls}>Proposed Estimated Tax (RM) *</label>
              <input
                type="number"
                step="0.01"
                required
                disabled={isReadOnly}
                value={proposedEstimatedTax}
                onChange={(e) => setProposedEstimatedTax(e.target.value)}
                className={`${inputCls} font-mono text-right`}
              />
            </div>
            <div>
              <label className={labelCls}>Computed Variance (RM)</label>
              <div
                className={`px-2.5 py-1.5 text-xs font-mono tabular-nums font-semibold rounded-md border text-right ${
                  variance > 0
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : variance < 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {variance > 0 ? '+' : ''}
                {formatCurrencyRM(variance)}
              </div>
            </div>
          </div>

          <div
            className={`px-3 py-2 rounded-md text-[11px] border ${
              willUpdateMasterCurrentTax
                ? 'bg-teal-50 border-teal-200 text-teal-800'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            {willUpdateMasterCurrentTax
              ? `Because Review Status is "${reviewStatus}", saving will automatically update the parent CP204 Current Estimated Tax to ${formatCurrencyRM(
                  safeNum(proposedEstimatedTax)
                )}.`
              : `Review Status is "${reviewStatus}" — parent Current Estimated Tax will remain unchanged until status is Approved or Submitted.`}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Submission Deadline</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={submissionDeadline}
                onChange={(e) => setSubmissionDeadline(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Submission Date</label>
              <input
                type="date"
                disabled={isReadOnly}
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>PIC</label>
              <input
                list="cp204-rev-staff"
                maxLength={120}
                disabled={isReadOnly}
                value={pic}
                onChange={(e) => setPic(e.target.value)}
                className={inputCls}
              />
              <datalist id="cp204-rev-staff">
                {activeStaffNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Reviewer</label>
              <input
                list="cp204-rev-staff"
                maxLength={120}
                disabled={isReadOnly}
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Reason for Revision</label>
            <input
              maxLength={500}
              disabled={isReadOnly}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Updated management accounts Q2 profit projection"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Acknowledgement URL</label>
            <input
              type="url"
              maxLength={500}
              disabled={isReadOnly}
              value={acknowledgementUrl}
              onChange={(e) => setAcknowledgementUrl(e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Remarks</label>
            <textarea
              rows={2}
              maxLength={1000}
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || isReadOnly || !parentRecord}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Revision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
