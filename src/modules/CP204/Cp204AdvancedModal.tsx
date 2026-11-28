import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Layers,
  CalendarPlus,
  ExternalLink,
} from 'lucide-react';
import {
  CP204_REVISION_MONTHS,
  CP204_REVISION_STATUS_OPTIONS,
  CP204_STATUS_OPTIONS,
  Cp204Instalment,
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
import { Cp204SavePayload, useData } from '../../context/DataContext';
import { StatusPill } from '../../components/StatusPill';
import { ClientSelectorField } from '../../components/ClientSelectorField';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';
import {
  computeCp204BasisDates,
  computeCp204CurrentEstimatedTax,
  computeRevisionDeadline,
  generateTwelveCp204Instalments,
  validateCp204Instalments,
} from './cp204Utils';

export type Cp204AdvancedTab = 'bulk' | 'initial' | 'revisions' | 'instalments';

interface Cp204AdvancedModalProps {
  open: boolean;
  initialTab?: Cp204AdvancedTab;
  initialRecordId?: string;
  onClose: () => void;
}

const inputCls =
  'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-50 disabled:text-slate-500';
const labelCls = 'block text-[11px] font-medium text-slate-600 mb-1';

export const Cp204AdvancedModal: React.FC<Cp204AdvancedModalProps> = ({
  open,
  initialTab = 'bulk',
  initialRecordId,
  onClose,
}) => {
  const { isReadOnly } = useAuth();
  const { clients, staff, cp204Records, saveCp204, batchCreateCp204 } = useData();

  const [tab, setTab] = useState<Cp204AdvancedTab>(initialTab);
  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab 1: Bulk Creator state
  const [bulkClientId, setBulkClientId] = useState('');
  const [yaFrom, setYaFrom] = useState(String(new Date().getFullYear()));
  const [yaTo, setYaTo] = useState(String(new Date().getFullYear() + 2));

  // Tab 2/3/4: Working copy of selected CP204 record
  const [draft, setDraft] = useState<Cp204SavePayload | null>(null);

  const corporateClients = useMemo(
    () => clients.filter((c) => c.category === 'Corporate' || c.category === 'Other'),
    [clients]
  );

  const activeStaffNames = useMemo(
    () =>
      Array.from(
        new Set(staff.filter((s) => s.active).map((s) => s.staffName.trim()).filter(Boolean))
      ),
    [staff]
  );

  const loadRecordIntoDraft = (rec: Cp204Record | undefined) => {
    if (!rec) {
      setDraft(null);
      return;
    }
    setDraft({
      cp204Id: rec.cp204Id,
      clientId: rec.clientId,
      clientName: rec.clientName,
      ya: rec.ya,
      fye: rec.fye,
      basisPeriodStart: rec.basisPeriodStart,
      basisPeriodEnd: rec.basisPeriodEnd,
      originalEstimatedTax: rec.originalEstimatedTax,
      originalSubmissionDate: rec.originalSubmissionDate,
      currentEstimatedTax: rec.currentEstimatedTax,
      statutoryCp204DueDate: rec.statutoryCp204DueDate,
      pic: rec.pic,
      reviewer: rec.reviewer,
      status: rec.status,
      acknowledgementUrl: rec.acknowledgementUrl,
      remarks: rec.remarks,
      revisions: rec.revisions.map((r) => ({ ...r })),
      instalments: rec.instalments.map((i) => ({ ...i })),
    });
  };

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setError(null);
    setSuccessMsg(null);
    const recId = initialRecordId || cp204Records[0]?.id || '';
    setSelectedRecordId(recId);
    const rec = cp204Records.find((r) => r.id === recId);
    loadRecordIntoDraft(rec);
    if (rec) {
      setBulkClientId(rec.clientId);
    } else if (corporateClients[0]) {
      setBulkClientId(corporateClients[0].clientId);
    }
  }, [open, initialTab, initialRecordId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep selected record in sync when user switches record dropdown
  const handleSwitchRecord = (recId: string) => {
    setSelectedRecordId(recId);
    setError(null);
    setSuccessMsg(null);
    const rec = cp204Records.find((r) => r.id === recId);
    loadRecordIntoDraft(rec);
  };

  // Bulk Creator preview calculation
  const selectedBulkClient = useMemo(
    () => corporateClients.find((c) => c.clientId === bulkClientId),
    [corporateClients, bulkClientId]
  );

  const bulkClientExistingRecords = useMemo(
    () =>
      cp204Records
        .filter((r) => r.clientId === bulkClientId)
        .sort((a, b) => (b.ya || '').localeCompare(a.ya || '')),
    [cp204Records, bulkClientId]
  );

  const bulkPlan = useMemo(() => {
    const start = Number(yaFrom);
    const end = Number(yaTo);
    if (
      !selectedBulkClient ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1990 ||
      end > 2100 ||
      end < start
    ) {
      return { valid: false, error: 'Enter a valid YA range (e.g. 2024 to 2027).', years: [] as string[], missing: [] as string[], existing: [] as string[] };
    }
    const span = end - start + 1;
    if (span > 21) {
      return {
        valid: false,
        error: `Maximum span is 21 years per batch (currently ${span} years selected).`,
        years: [] as string[],
        missing: [] as string[],
        existing: [] as string[],
      };
    }
    const existingSet = new Set(bulkClientExistingRecords.map((r) => r.ya.trim()));
    const years: string[] = [];
    const missing: string[] = [];
    const existing: string[] = [];
    for (let y = start; y <= end; y++) {
      const ys = String(y);
      years.push(ys);
      if (existingSet.has(ys)) existing.push(ys);
      else missing.push(ys);
    }
    return { valid: true, error: null, years, missing, existing };
  }, [selectedBulkClient, yaFrom, yaTo, bulkClientExistingRecords]);

  const instTotals = useMemo(() => {
    const list = draft?.instalments || [];
    const due = list.reduce((s, i) => s + safeNum(i.amountDue), 0);
    const paid = list.reduce((s, i) => s + safeNum(i.amountPaid), 0);
    const out = list.reduce((s, i) => s + Math.max(0, safeNum(i.amountDue) - safeNum(i.amountPaid)), 0);
    return { due, paid, out };
  }, [draft]);

  if (!open) return null;

  const liveCurrentTax = draft
    ? computeCp204CurrentEstimatedTax(draft.originalEstimatedTax, draft.revisions)
    : 0;

  // Bulk Creator Submit
  const handleBulkCreate = async () => {
    if (isReadOnly || !selectedBulkClient || !bulkPlan.valid || bulkPlan.missing.length === 0) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      const fye = selectedBulkClient.fye || '12';
      const items: Cp204SavePayload[] = bulkPlan.missing.map((yaStr) => {
        const dates = computeCp204BasisDates(yaStr, fye);
        return {
          clientId: selectedBulkClient.clientId,
          clientName: selectedBulkClient.clientName,
          ya: yaStr,
          fye,
          basisPeriodStart: dates.basisPeriodStart,
          basisPeriodEnd: dates.basisPeriodEnd,
          originalEstimatedTax: 0,
          originalSubmissionDate: '',
          currentEstimatedTax: 0,
          statutoryCp204DueDate: dates.statutoryCp204DueDate,
          pic: selectedBulkClient.taxPic || '',
          reviewer: '',
          status: 'In Progress',
          acknowledgementUrl: '',
          remarks: '',
          revisions: [],
          instalments: [],
        };
      });
      const res = await batchCreateCp204(items);
      setSuccessMsg(
        `Created ${res.createdCount} missing CP204 record(s) for ${selectedBulkClient.clientName}${
          res.skippedCount > 0 ? ` (${res.skippedCount} existing skipped)` : ''
        }.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch creation failed.');
    } finally {
      setSaving(false);
    }
  };

  // Save Master + Revisions + Instalments
  const handleSaveRecord = async () => {
    if (isReadOnly || !draft || !selectedRecordId) return;
    setError(null);
    setSuccessMsg(null);

    const instErr = validateCp204Instalments(draft.instalments);
    if (instErr) {
      setError(instErr);
      setTab('instalments');
      return;
    }

    setSaving(true);
    try {
      await saveCp204(
        {
          ...draft,
          currentEstimatedTax: liveCurrentTax,
        },
        selectedRecordId
      );
      setSuccessMsg(`Saved ${draft.cp204Id || ''} (${draft.clientName} · YA ${draft.ya}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save CP204 record.');
    } finally {
      setSaving(false);
    }
  };

  // Revision helpers
  const addRevisionRow = () => {
    if (!draft || isReadOnly) return;
    const used = new Set(draft.revisions.map((r) => r.revisionMonth));
    const nextMonth: Cp204RevisionMonth = !used.has('6') ? '6' : !used.has('9') ? '9' : '11';
    const prevTax = liveCurrentTax > 0 ? liveCurrentTax : safeNum(draft.originalEstimatedTax);
    const newRev: Cp204Revision = {
      revisionId: `REV-${nextMonth}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      revisionMonth: nextMonth,
      previousEstimatedTax: prevTax,
      proposedEstimatedTax: prevTax,
      variance: 0,
      reason: '',
      reviewStatus: 'In Progress',
      pic: draft.pic || '',
      reviewer: draft.reviewer || '',
      submissionDeadline: computeRevisionDeadline(draft.basisPeriodStart, nextMonth),
      submissionDate: '',
      acknowledgementUrl: '',
      remarks: '',
    };
    setDraft({ ...draft, revisions: [...draft.revisions, newRev] });
  };

  const updateRevision = (idx: number, patch: Partial<Cp204Revision>) => {
    if (!draft) return;
    const next = draft.revisions.map((r, i) => {
      if (i !== idx) return r;
      const merged = { ...r, ...patch };
      const prev = safeNum(merged.previousEstimatedTax);
      const prop = safeNum(merged.proposedEstimatedTax);
      return {
        ...merged,
        variance: Math.round((prop - prev) * 100) / 100,
      };
    });
    setDraft({ ...draft, revisions: next });
  };

  const removeRevision = (idx: number) => {
    if (!draft || isReadOnly) return;
    setDraft({ ...draft, revisions: draft.revisions.filter((_, i) => i !== idx) });
  };

  // Instalment helpers
  const addInstalmentRow = () => {
    if (!draft || isReadOnly) return;
    const nextNo = draft.instalments.length + 1;
    const newInst: Cp204Instalment = {
      instalmentId: `INST-${String(nextNo).padStart(2, '0')}-${Date.now().toString(36).slice(-3)}`,
      instalmentNo: nextNo,
      dueDate: '',
      amountDue: 0,
      amountPaid: 0,
      paymentDate: '',
      paymentReference: '',
      paymentVerified: 'No',
      outstandingAmount: 0,
      followUpStatus: 'Pending',
      remarks: '',
    };
    setDraft({ ...draft, instalments: [...draft.instalments, newInst] });
  };

  const handleGenerate12Instalments = () => {
    if (!draft || isReadOnly) return;
    const generated = generateTwelveCp204Instalments(draft.basisPeriodStart, liveCurrentTax);
    setDraft({ ...draft, instalments: generated });
  };

  const updateInstalment = (idx: number, patch: Partial<Cp204Instalment>) => {
    if (!draft) return;
    const next = draft.instalments.map((inst, i) => {
      if (i !== idx) return inst;
      const merged = { ...inst, ...patch };
      const due = Math.max(0, safeNum(merged.amountDue));
      const paid = Math.max(0, safeNum(merged.amountPaid));
      const outstanding = Math.max(0, Math.round((due - paid) * 100) / 100);
      return {
        ...merged,
        amountDue: due,
        amountPaid: paid,
        outstandingAmount: outstanding,
      };
    });
    setDraft({ ...draft, instalments: next });
  };

  const removeInstalment = (idx: number) => {
    if (!draft || isReadOnly) return;
    setDraft({ ...draft, instalments: draft.instalments.filter((_, i) => i !== idx) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <h3 className="font-display font-bold text-sm text-slate-900">
              Advanced CP204 Data Entry &amp; Detailed Records
            </h3>
            <p className="text-[11px] text-slate-500">
              Bulk YA creation, initial CP204 master schedule, 6th/9th/11th month CP204A revisions, and monthly instalment tracker
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Tabs */}
        <div className="shrink-0 px-5 pt-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'bulk', label: '1. Client / Year Listing & Bulk Creator' },
                { id: 'initial', label: '2. CP204 Initial Estimate Detailed Form' },
                {
                  id: 'revisions',
                  label: `3. CP204A Revisions (${draft?.revisions.length ?? 0})`,
                },
                {
                  id: 'instalments',
                  label: `4. CP204 Instalments Tracker (${draft?.instalments.length ?? 0})`,
                },
              ] as Array<{ id: Cp204AdvancedTab; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-teal-700 text-teal-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab !== 'bulk' && cp204Records.length > 0 && (
            <div className="pb-2 flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                Active Record:
              </span>
              <select
                value={selectedRecordId}
                onChange={(e) => handleSwitchRecord(e.target.value)}
                className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 max-w-xs"
              >
                {cp204Records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.clientName} · YA {r.ya} ({r.cp204Id})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Alerts */}
        {(error || successMsg) && (
          <div className="shrink-0 px-5 pt-3">
            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {/* TAB 1: Client / Year Listing & Bulk Creator */}
          {tab === 'bulk' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end p-4 rounded-lg border border-slate-200 bg-slate-50/70">
                <div className="lg:col-span-5">
                  <ClientSelectorField
                    clients={clients}
                    value={bulkClientId}
                    onSelectClient={(c) => setBulkClientId(c?.clientId ?? '')}
                    label="Corporate Client"
                    required
                    filterClients={(c) => c.category === 'Corporate' || c.category === 'Other'}
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className={labelCls}>YA From</label>
                  <input
                    type="number"
                    min={1990}
                    max={2100}
                    disabled={isReadOnly}
                    value={yaFrom}
                    onChange={(e) => setYaFrom(e.target.value)}
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className={labelCls}>YA To (Max 21 yrs)</label>
                  <input
                    type="number"
                    min={1990}
                    max={2100}
                    disabled={isReadOnly}
                    value={yaTo}
                    onChange={(e) => setYaTo(e.target.value)}
                    className={`${inputCls} font-mono`}
                  />
                </div>

                <div className="lg:col-span-3">
                  <button
                    type="button"
                    disabled={
                      isReadOnly || saving || !bulkPlan.valid || bulkPlan.missing.length === 0
                    }
                    onClick={() => void handleBulkCreate()}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50 whitespace-nowrap"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    {saving
                      ? 'Creating...'
                      : `Create Missing YA Records (${bulkPlan.missing.length})`}
                  </button>
                </div>
              </div>

              {selectedBulkClient && (
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3 px-1">
                  <span>
                    <strong className="text-slate-900">{selectedBulkClient.clientName}</strong> (
                    <span className="font-mono">{selectedBulkClient.clientId}</span>)
                  </span>
                  <span>·</span>
                  <span>
                    FYE:{' '}
                    <strong className="font-mono">
                      {selectedBulkClient.fye ? Number(selectedBulkClient.fye) : '—'}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Default PIC: <strong>{selectedBulkClient.taxPic || '—'}</strong>
                  </span>
                  {bulkPlan.error ? (
                    <span className="text-rose-700 font-medium">· {bulkPlan.error}</span>
                  ) : (
                    <span>
                      · Will create{' '}
                      <strong className="text-teal-700">{bulkPlan.missing.length}</strong> missing
                      YA(s);{' '}
                      <strong className="text-slate-700">{bulkPlan.existing.length}</strong>{' '}
                      existing preserved untouched.
                    </span>
                  )}
                </div>
              )}

              {/* Existing Year Listing for Selected Client */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Existing CP204 Records for Selected Company ({bulkClientExistingRecords.length})
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">CP204 ID</th>
                      <th className="px-3 py-2 text-left font-semibold">YA</th>
                      <th className="px-3 py-2 text-left font-semibold">FYE</th>
                      <th className="px-3 py-2 text-left font-semibold">PIC</th>
                      <th className="px-3 py-2 text-right font-semibold">Original Est.</th>
                      <th className="px-3 py-2 text-right font-semibold">Current Est.</th>
                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                      <th className="px-3 py-2 text-right font-semibold">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkClientExistingRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          No CP204 records yet for this company. Set YA From / YA To above and click
                          &ldquo;Create Missing YA Records&rdquo;.
                        </td>
                      </tr>
                    ) : (
                      bulkClientExistingRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-slate-700">{rec.cp204Id}</td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                            {rec.ya}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700">
                            {rec.fye ? Number(rec.fye) : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{rec.pic || '—'}</td>
                          <td className="px-3 py-2 font-mono text-right text-slate-700">
                            {formatCurrencyRM(rec.originalEstimatedTax)}
                          </td>
                          <td className="px-3 py-2 font-mono text-right font-semibold text-slate-900">
                            {formatCurrencyRM(rec.currentEstimatedTax)}
                          </td>
                          <td className="px-3 py-2">
                            <StatusPill group="CP204_STATUS" value={rec.status} />
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                handleSwitchRecord(rec.id);
                                setTab('initial');
                              }}
                              className="text-xs font-medium text-teal-700 hover:underline mr-2"
                            >
                              Master
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleSwitchRecord(rec.id);
                                setTab('revisions');
                              }}
                              className="text-xs font-medium text-sky-700 hover:underline mr-2"
                            >
                              Revisions
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleSwitchRecord(rec.id);
                                setTab('instalments');
                              }}
                              className="text-xs font-medium text-indigo-700 hover:underline"
                            >
                              Instalments
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: CP204 Initial Estimate Detailed Form */}
          {tab === 'initial' && (
            <>
              {!draft ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No CP204 record selected. Create one in Tab 1 or via &ldquo;+ Add CP204 Initial
                  Estimate&rdquo;.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className={labelCls}>CP204 ID</label>
                      <input
                        disabled
                        value={draft.cp204Id || ''}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Company Name</label>
                      <input disabled value={`${draft.clientName} (${draft.clientId})`} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>YA *</label>
                      <input
                        maxLength={16}
                        disabled={isReadOnly}
                        value={draft.ya}
                        onChange={(e) => {
                          const nextYa = e.target.value;
                          const dates = computeCp204BasisDates(nextYa, draft.fye);
                          setDraft({ ...draft, ya: nextYa, ...dates });
                        }}
                        className={`${inputCls} font-mono`}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>FYE Month</label>
                      <select
                        disabled={isReadOnly}
                        value={draft.fye}
                        onChange={(e) => {
                          const nextFye = e.target.value;
                          const dates = computeCp204BasisDates(draft.ya, nextFye);
                          setDraft({ ...draft, fye: nextFye, ...dates });
                        }}
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
                      <label className={labelCls}>Basis Period Start</label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={draft.basisPeriodStart}
                        onChange={(e) => setDraft({ ...draft, basisPeriodStart: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Basis Period End</label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={draft.basisPeriodEnd}
                        onChange={(e) => setDraft({ ...draft, basisPeriodEnd: e.target.value })}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Statutory CP204 Due Date</label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={draft.statutoryCp204DueDate}
                        onChange={(e) =>
                          setDraft({ ...draft, statutoryCp204DueDate: e.target.value })
                        }
                        className={`${inputCls} font-mono`}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Original Estimated Tax (RM)</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={isReadOnly}
                        value={draft.originalEstimatedTax}
                        onChange={(e) =>
                          setDraft({ ...draft, originalEstimatedTax: safeNum(e.target.value) })
                        }
                        className={`${inputCls} font-mono text-right`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Original Submission Date</label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={draft.originalSubmissionDate}
                        onChange={(e) =>
                          setDraft({ ...draft, originalSubmissionDate: e.target.value })
                        }
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Current Estimated Tax (Auto-derived)</label>
                      <div className="px-2.5 py-1.5 text-xs font-mono font-bold text-teal-900 bg-teal-50 border border-teal-200 rounded-md text-right">
                        {formatCurrencyRM(liveCurrentTax)}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Status</label>
                      <select
                        disabled={isReadOnly}
                        value={draft.status}
                        onChange={(e) =>
                          setDraft({ ...draft, status: e.target.value as Cp204Status })
                        }
                        className={inputCls}
                      >
                        {CP204_STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelCls}>PIC</label>
                      <input
                        list="cp204-adv-staff"
                        maxLength={120}
                        disabled={isReadOnly}
                        value={draft.pic}
                        onChange={(e) => setDraft({ ...draft, pic: e.target.value })}
                        className={inputCls}
                      />
                      <datalist id="cp204-adv-staff">
                        {activeStaffNames.map((n) => (
                          <option key={n} value={n} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className={labelCls}>Reviewer</label>
                      <input
                        list="cp204-adv-staff"
                        maxLength={120}
                        disabled={isReadOnly}
                        value={draft.reviewer}
                        onChange={(e) => setDraft({ ...draft, reviewer: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Acknowledgement URL</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="url"
                          maxLength={500}
                          disabled={isReadOnly}
                          value={draft.acknowledgementUrl}
                          onChange={(e) =>
                            setDraft({ ...draft, acknowledgementUrl: e.target.value })
                          }
                          placeholder="https://..."
                          className={inputCls}
                        />
                        {draft.acknowledgementUrl && (
                          <a
                            href={draft.acknowledgementUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded border border-slate-200 text-teal-700 hover:bg-teal-50 shrink-0"
                            title="Open acknowledgement"
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
                      rows={3}
                      maxLength={2000}
                      disabled={isReadOnly}
                      value={draft.remarks}
                      onChange={(e) => setDraft({ ...draft, remarks: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 3: CP204A Revisions (6th, 9th, 11th Month) */}
          {tab === 'revisions' && (
            <>
              {!draft ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Select a CP204 record to manage its 6th, 9th, and 11th month revisions.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-700 space-x-3">
                      <span>
                        Original Estimate:{' '}
                        <strong className="font-mono">
                          {formatCurrencyRM(draft.originalEstimatedTax)}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>
                        Current Estimated Tax:{' '}
                        <strong className="font-mono text-teal-800">
                          {formatCurrencyRM(liveCurrentTax)}
                        </strong>
                      </span>
                      <span className="text-[11px] text-slate-500">
                        (Updates only from Approved or Submitted revisions)
                      </span>
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={addRevisionRow}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Revision Row
                      </button>
                    )}
                  </div>

                  {draft.revisions.length === 0 ? (
                    <div className="py-10 text-center border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                      No CP204A revisions recorded for {draft.clientName} (YA {draft.ya}).
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {draft.revisions.map((rev, idx) => (
                        <div
                          key={rev.revisionId || idx}
                          className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-800">
                                {rev.revisionMonth}th Month Revision
                              </span>
                              <span className="font-mono text-[11px] text-slate-400">
                                ({rev.revisionId})
                              </span>
                              <StatusPill group="CP204_STATUS" value={rev.reviewStatus} />
                            </div>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => removeRevision(idx)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 hover:underline"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            <div>
                              <label className={labelCls}>Month</label>
                              <select
                                disabled={isReadOnly}
                                value={rev.revisionMonth}
                                onChange={(e) => {
                                  const m = e.target.value as Cp204RevisionMonth;
                                  updateRevision(idx, {
                                    revisionMonth: m,
                                    submissionDeadline:
                                      rev.submissionDeadline ||
                                      computeRevisionDeadline(draft.basisPeriodStart, m),
                                  });
                                }}
                                className={inputCls}
                              >
                                {CP204_REVISION_MONTHS.map((m) => (
                                  <option key={m} value={m}>
                                    {m}th Month
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>Previous Est. (RM)</label>
                              <input
                                type="number"
                                step="0.01"
                                disabled={isReadOnly}
                                value={rev.previousEstimatedTax}
                                onChange={(e) =>
                                  updateRevision(idx, {
                                    previousEstimatedTax: safeNum(e.target.value),
                                  })
                                }
                                className={`${inputCls} font-mono text-right`}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Proposed Est. (RM)</label>
                              <input
                                type="number"
                                step="0.01"
                                disabled={isReadOnly}
                                value={rev.proposedEstimatedTax}
                                onChange={(e) =>
                                  updateRevision(idx, {
                                    proposedEstimatedTax: safeNum(e.target.value),
                                  })
                                }
                                className={`${inputCls} font-mono text-right`}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Variance (RM)</label>
                              <div className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-md text-right text-slate-800">
                                {rev.variance > 0 ? '+' : ''}
                                {formatCurrencyRM(rev.variance)}
                              </div>
                            </div>
                            <div>
                              <label className={labelCls}>Review Status</label>
                              <select
                                disabled={isReadOnly}
                                value={rev.reviewStatus}
                                onChange={(e) =>
                                  updateRevision(idx, {
                                    reviewStatus: e.target.value as Cp204RevisionStatus,
                                  })
                                }
                                className={inputCls}
                              >
                                {CP204_REVISION_STATUS_OPTIONS.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className={labelCls}>Submission Deadline</label>
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={rev.submissionDeadline}
                                onChange={(e) =>
                                  updateRevision(idx, { submissionDeadline: e.target.value })
                                }
                                className={`${inputCls} font-mono`}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Submission Date</label>
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={rev.submissionDate}
                                onChange={(e) =>
                                  updateRevision(idx, { submissionDate: e.target.value })
                                }
                                className={`${inputCls} font-mono`}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>PIC</label>
                              <input
                                list="cp204-adv-staff"
                                disabled={isReadOnly}
                                value={rev.pic}
                                onChange={(e) => updateRevision(idx, { pic: e.target.value })}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Reviewer</label>
                              <input
                                list="cp204-adv-staff"
                                disabled={isReadOnly}
                                value={rev.reviewer}
                                onChange={(e) => updateRevision(idx, { reviewer: e.target.value })}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Ack URL</label>
                              <input
                                type="url"
                                disabled={isReadOnly}
                                value={rev.acknowledgementUrl}
                                onChange={(e) =>
                                  updateRevision(idx, { acknowledgementUrl: e.target.value })
                                }
                                placeholder="https://..."
                                className={inputCls}
                              />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <label className={labelCls}>Reason</label>
                              <input
                                disabled={isReadOnly}
                                value={rev.reason}
                                onChange={(e) => updateRevision(idx, { reason: e.target.value })}
                                className={inputCls}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelCls}>Remarks</label>
                              <input
                                disabled={isReadOnly}
                                value={rev.remarks}
                                onChange={(e) => updateRevision(idx, { remarks: e.target.value })}
                                className={inputCls}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* TAB 4: CP204 Instalments Tracker */}
          {tab === 'instalments' && (
            <>
              {!draft ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Select a CP204 record to track monthly instalments.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span>
                        Total Due:{' '}
                        <strong className="font-mono">{formatCurrencyRM(instTotals.due)}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Paid:{' '}
                        <strong className="font-mono text-emerald-700">
                          {formatCurrencyRM(instTotals.paid)}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>
                        Outstanding:{' '}
                        <strong className="font-mono text-amber-800">
                          {formatCurrencyRM(instTotals.out)}
                        </strong>
                      </span>
                    </div>
                    {!isReadOnly && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGenerate12Instalments}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md whitespace-nowrap"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          Generate 12 Monthly Instalments
                        </button>
                        <button
                          type="button"
                          onClick={addInstalmentRow}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Row
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Rule: Payment Date is mandatory whenever Amount Paid &gt; 0. Verified cannot be
                    set to &ldquo;Yes&rdquo; unless Amount Paid &gt; 0 and Payment Date is filled.
                  </p>

                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold w-14">No.</th>
                          <th className="px-2 py-2 text-left font-semibold">Due Date</th>
                          <th className="px-2 py-2 text-right font-semibold">Amount Due</th>
                          <th className="px-2 py-2 text-right font-semibold">Amount Paid</th>
                          <th className="px-2 py-2 text-right font-semibold">Outstanding</th>
                          <th className="px-2 py-2 text-left font-semibold">Payment Date</th>
                          <th className="px-2 py-2 text-left font-semibold">Payment Ref</th>
                          <th className="px-2 py-2 text-left font-semibold">Verified</th>
                          <th className="px-2 py-2 text-left font-semibold">Follow-Up</th>
                          <th className="px-2 py-2 text-left font-semibold">Remarks</th>
                          {!isReadOnly && <th className="px-2 py-2 w-8" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {draft.instalments.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                              No instalments recorded yet. Click &ldquo;Generate 12 Monthly
                              Instalments&rdquo; or &ldquo;Add Row&rdquo;.
                            </td>
                          </tr>
                        ) : (
                          draft.instalments.map((inst, idx) => {
                            const canVerify =
                              safeNum(inst.amountPaid) > 0 && Boolean((inst.paymentDate || '').trim());
                            return (
                              <tr key={inst.instalmentId || idx} className="hover:bg-slate-50/70">
                                <td className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    max={36}
                                    disabled={isReadOnly}
                                    value={inst.instalmentNo}
                                    onChange={(e) =>
                                      updateInstalment(idx, {
                                        instalmentNo: Number(e.target.value),
                                      })
                                    }
                                    className={`${inputCls} font-mono w-14`}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="date"
                                    disabled={isReadOnly}
                                    value={inst.dueDate}
                                    onChange={(e) =>
                                      updateInstalment(idx, { dueDate: e.target.value })
                                    }
                                    className={`${inputCls} font-mono w-32`}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    disabled={isReadOnly}
                                    value={inst.amountDue}
                                    onChange={(e) =>
                                      updateInstalment(idx, {
                                        amountDue: safeNum(e.target.value),
                                      })
                                    }
                                    className={`${inputCls} font-mono text-right w-28`}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    disabled={isReadOnly}
                                    value={inst.amountPaid}
                                    onChange={(e) =>
                                      updateInstalment(idx, {
                                        amountPaid: safeNum(e.target.value),
                                      })
                                    }
                                    className={`${inputCls} font-mono text-right w-28`}
                                  />
                                </td>
                                <td className="px-2 py-1.5 font-mono text-right whitespace-nowrap font-medium text-slate-800">
                                  {formatCurrencyRM(
                                    Math.max(0, safeNum(inst.amountDue) - safeNum(inst.amountPaid))
                                  )}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="date"
                                    disabled={isReadOnly}
                                    value={inst.paymentDate}
                                    onChange={(e) =>
                                      updateInstalment(idx, { paymentDate: e.target.value })
                                    }
                                    className={`${inputCls} font-mono w-32 ${
                                      safeNum(inst.amountPaid) > 0 && !inst.paymentDate
                                        ? 'border-rose-400 bg-rose-50/40'
                                        : ''
                                    }`}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    maxLength={80}
                                    disabled={isReadOnly}
                                    value={inst.paymentReference}
                                    onChange={(e) =>
                                      updateInstalment(idx, { paymentReference: e.target.value })
                                    }
                                    placeholder="FPX / Bill No."
                                    className={`${inputCls} font-mono w-28`}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <select
                                    disabled={isReadOnly}
                                    value={inst.paymentVerified}
                                    onChange={(e) => {
                                      const val = e.target.value as 'Yes' | 'No';
                                      if (val === 'Yes' && !canVerify) {
                                        setError(
                                          `Instalment #${inst.instalmentNo}: Enter Amount Paid > 0 and Payment Date before marking Verified = Yes.`
                                        );
                                        return;
                                      }
                                      setError(null);
                                      updateInstalment(idx, { paymentVerified: val });
                                    }}
                                    className={`${inputCls} w-20`}
                                  >
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                  </select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    maxLength={60}
                                    disabled={isReadOnly}
                                    value={inst.followUpStatus}
                                    onChange={(e) =>
                                      updateInstalment(idx, { followUpStatus: e.target.value })
                                    }
                                    className={`${inputCls} w-28`}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    maxLength={500}
                                    disabled={isReadOnly}
                                    value={inst.remarks}
                                    onChange={(e) =>
                                      updateInstalment(idx, { remarks: e.target.value })
                                    }
                                    className={`${inputCls} w-32`}
                                  />
                                </td>
                                {!isReadOnly && (
                                  <td className="px-2 py-1.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeInstalment(idx)}
                                      className="p-1 text-slate-400 hover:text-rose-700"
                                      title="Remove instalment"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">
            {draft && tab !== 'bulk'
              ? `${draft.clientName} · YA ${draft.ya} · Statutory Due: ${formatDateDDMMYYYY(
                  draft.statutoryCp204DueDate
                )}`
              : 'Select a company and YA range to batch-create missing CP204 records.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Close
            </button>
            {tab !== 'bulk' && draft && !isReadOnly && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveRecord()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save CP204 Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
