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
  Pencil,
  RotateCcw,
} from 'lucide-react';
import {
  CP204_REVISION_MONTHS,
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
import { findClientRecordForRow, normalizeFyeMonthString } from '../../lib/jobUtils';
import {
  buildCp204aRevisionStatusOptions,
  buildCp204SubmissionStatusOptions,
} from '../../lib/settingsDropdown';
import { useStaffOptions } from '../../hooks/useStaffOptions';
import {
  computeCp204BasisDates,
  computeCp204CurrentEstimatedTax,
  computeRevisionDeadline,
  generateTwelveCp204Instalments,
  isEffectiveRevisionStatus,
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
  const { clients, cp204Records, saveCp204, batchCreateCp204, getSettingsByGroup } = useData();

  const [tab, setTab] = useState<Cp204AdvancedTab>(initialTab);
  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab 1: Bulk Creator state
  const [bulkClientId, setBulkClientId] = useState('');
  const [yaFrom, setYaFrom] = useState(String(new Date().getFullYear()));
  const [yaTo, setYaTo] = useState(String(new Date().getFullYear() + 2));
  const [bulkStatus, setBulkStatus] = useState<Cp204Status>('In Progress');

  // Tab 2/3/4: Working copy of selected CP204 record
  const [draft, setDraft] = useState<Cp204SavePayload | null>(null);
  const [inheritedFlags, setInheritedFlags] = useState<{ pic: boolean; fye: boolean }>({
    pic: false,
    fye: false,
  });

  // Tab 3: Single Add / Edit Revision Form state
  const [editingRevIdx, setEditingRevIdx] = useState<number | null>(null);
  const [revFormDirty, setRevFormDirty] = useState(false);
  const [revPicInherited, setRevPicInherited] = useState(false);
  const [revForm, setRevForm] = useState<Cp204Revision>({
    revisionId: '',
    revisionMonth: '6',
    previousEstimatedTax: 0,
    proposedEstimatedTax: 0,
    variance: 0,
    reason: '',
    reviewStatus: 'In Progress',
    pic: '',
    reviewer: '',
    submissionDeadline: '',
    submissionDate: '',
    acknowledgementUrl: '',
    remarks: '',
  });

  const corporateClients = useMemo(
    () => clients.filter((c) => c.category === 'Corporate' || c.category === 'Other'),
    [clients]
  );

  // Per-field active staff dropdown options (excludes Inactive staff unless currently stored on that field)
  const initialPicOptions = useStaffOptions(draft?.pic);
  const initialReviewerOptions = useStaffOptions(draft?.reviewer);
  const revPicOptions = useStaffOptions(revForm.pic);
  const revReviewerOptions = useStaffOptions(revForm.reviewer);

  // Controlled Values dropdown options for CP204 SUBMISSION STATUS & CP204A REVISIONS SUBMISSION STATUS
  const bulkStatusOptions = useMemo(
    () => buildCp204SubmissionStatusOptions(getSettingsByGroup, bulkStatus),
    [getSettingsByGroup, bulkStatus]
  );
  const initialStatusOptions = useMemo(
    () => buildCp204SubmissionStatusOptions(getSettingsByGroup, draft?.status),
    [getSettingsByGroup, draft?.status]
  );
  const revisionStatusOptions = useMemo(
    () => buildCp204aRevisionStatusOptions(getSettingsByGroup, revForm.reviewStatus),
    [getSettingsByGroup, revForm.reviewStatus]
  );

  const computePriorEstimateForMonth = (
    draftData: Cp204SavePayload,
    targetMonth: Cp204RevisionMonth,
    excludeIdx: number | null = null
  ): number => {
    const targetNum = Number(targetMonth);
    const earlierRevs = draftData.revisions.filter(
      (r, idx) => idx !== excludeIdx && Number(r.revisionMonth) < targetNum
    );
    return computeCp204CurrentEstimatedTax(draftData.originalEstimatedTax, earlierRevs);
  };

  const makeFreshRevisionForm = (
    draftData: Cp204SavePayload | null,
    clientFallbackPic = '',
    parentPicInherited = false
  ): { rev: Cp204Revision; picInherited: boolean } => {
    if (!draftData) {
      return {
        rev: {
          revisionId: '',
          revisionMonth: '6',
          previousEstimatedTax: 0,
          proposedEstimatedTax: 0,
          variance: 0,
          reason: '',
          reviewStatus: 'In Progress',
          pic: '',
          reviewer: '',
          submissionDeadline: '',
          submissionDate: '',
          acknowledgementUrl: '',
          remarks: '',
        },
        picInherited: false,
      };
    }
    const used = new Set(draftData.revisions.map((r) => r.revisionMonth));
    const nextMonth: Cp204RevisionMonth = !used.has('6') ? '6' : !used.has('9') ? '9' : '11';
    const prevTax = computePriorEstimateForMonth(draftData, nextMonth, null);
    const ownDraftPic = (draftData.pic || '').trim();
    const fallbackPic = (clientFallbackPic || '').trim();
    const resolvedPic = ownDraftPic || fallbackPic;
    const isInherited = (!ownDraftPic && Boolean(fallbackPic)) || (Boolean(ownDraftPic) && parentPicInherited);

    return {
      rev: {
        revisionId: `REV-${nextMonth}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        revisionMonth: nextMonth,
        previousEstimatedTax: prevTax,
        proposedEstimatedTax: prevTax,
        variance: 0,
        reason: '',
        reviewStatus: 'In Progress',
        pic: resolvedPic,
        reviewer: draftData.reviewer || '',
        submissionDeadline: computeRevisionDeadline(draftData.basisPeriodStart, nextMonth),
        submissionDate: '',
        acknowledgementUrl: '',
        remarks: '',
      },
      picInherited: isInherited,
    };
  };

  const loadRecordIntoDraft = (rec: Cp204Record | undefined) => {
    if (!rec) {
      setDraft(null);
      setInheritedFlags({ pic: false, fye: false });
      setEditingRevIdx(null);
      setRevFormDirty(false);
      setRevPicInherited(false);
      setRevForm(makeFreshRevisionForm(null).rev);
      return;
    }

    const matchedClient = findClientRecordForRow(clients, {
      clientId: rec.clientId,
      clientName: rec.clientName,
    });

    const rawRecordFye = (rec.fye || '').trim();
    const clientFye = (matchedClient?.fye || '').trim();
    const fyeInherited = !rawRecordFye && Boolean(clientFye);
    const resolvedFyeRaw = rawRecordFye || clientFye;
    const resolvedFye = normalizeFyeMonthString(resolvedFyeRaw) || resolvedFyeRaw;

    const rawRecordPic = (rec.pic || '').trim();
    const clientPic = (matchedClient?.taxPic || '').trim();
    const picInherited = !rawRecordPic && Boolean(clientPic);
    const resolvedPic = rawRecordPic || clientPic;

    const computedDates = resolvedFye ? computeCp204BasisDates(rec.ya, resolvedFye) : null;

    const nextDraft: Cp204SavePayload = {
      cp204Id: rec.cp204Id,
      clientId: rec.clientId,
      clientName: rec.clientName,
      ya: rec.ya,
      fye: resolvedFye,
      basisPeriodStart: rec.basisPeriodStart || computedDates?.basisPeriodStart || '',
      basisPeriodEnd: rec.basisPeriodEnd || computedDates?.basisPeriodEnd || '',
      originalEstimatedTax: rec.originalEstimatedTax,
      originalSubmissionDate: rec.originalSubmissionDate,
      currentEstimatedTax: computeCp204CurrentEstimatedTax(rec.originalEstimatedTax, rec.revisions),
      statutoryCp204DueDate: rec.statutoryCp204DueDate || computedDates?.statutoryCp204DueDate || '',
      pic: resolvedPic,
      reviewer: rec.reviewer,
      status: rec.status,
      acknowledgementUrl: rec.acknowledgementUrl,
      remarks: rec.remarks,
      revisions: rec.revisions.map((r) => ({ ...r })),
      instalments: rec.instalments.map((i) => ({ ...i })),
    };

    setInheritedFlags({ pic: picInherited, fye: fyeInherited });
    setDraft(nextDraft);
    setEditingRevIdx(null);
    setRevFormDirty(false);
    const fresh = makeFreshRevisionForm(nextDraft, clientPic, picInherited);
    setRevForm(fresh.rev);
    setRevPicInherited(fresh.picInherited);
  };

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setError(null);
    setSuccessMsg(null);
    setBulkStatus('In Progress');
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

  // Backfill PIC & FYE if clients finish loading after modal opened and draft fields are still empty
  useEffect(() => {
    if (!open || !draft || clients.length === 0) return;
    if ((draft.pic || '').trim() && (draft.fye || '').trim()) return;
    const matchedClient = findClientRecordForRow(clients, {
      clientId: draft.clientId,
      clientName: draft.clientName,
    });
    if (!matchedClient) return;

    const needsPic = !(draft.pic || '').trim() && Boolean((matchedClient.taxPic || '').trim());
    const needsFye = !(draft.fye || '').trim() && Boolean((matchedClient.fye || '').trim());
    if (!needsPic && !needsFye) return;

    const nextFye = needsFye
      ? normalizeFyeMonthString(matchedClient.fye) || matchedClient.fye.trim()
      : draft.fye;
    const computedDates = needsFye && nextFye ? computeCp204BasisDates(draft.ya, nextFye) : null;
    const nextBasisStart = draft.basisPeriodStart || computedDates?.basisPeriodStart || '';

    setDraft((prev) =>
      prev
        ? {
            ...prev,
            pic: needsPic ? matchedClient.taxPic.trim() : prev.pic,
            fye: nextFye,
            basisPeriodStart: nextBasisStart,
            basisPeriodEnd: prev.basisPeriodEnd || computedDates?.basisPeriodEnd || '',
            statutoryCp204DueDate:
              prev.statutoryCp204DueDate || computedDates?.statutoryCp204DueDate || '',
          }
        : prev
    );
    setInheritedFlags((prev) => ({
      pic: prev.pic || needsPic,
      fye: prev.fye || needsFye,
    }));
    if (editingRevIdx === null) {
      setRevForm((prev) => ({
        ...prev,
        pic: !prev.pic && needsPic ? matchedClient.taxPic.trim() : prev.pic,
        submissionDeadline:
          prev.submissionDeadline ||
          (nextBasisStart ? computeRevisionDeadline(nextBasisStart, prev.revisionMonth) : ''),
      }));
      if (needsPic) setRevPicInherited(true);
    }
  }, [open, clients, draft, editingRevIdx]);

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
          status: bulkStatus || 'In Progress',
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

    // If user filled in a new revision in Tab 3 and clicked footer Save directly, include it cleanly
    let finalRevisions = draft.revisions;
    if (tab === 'revisions' && editingRevIdx === null && revFormDirty) {
      const prev = safeNum(revForm.previousEstimatedTax);
      const prop = safeNum(revForm.proposedEstimatedTax);
      const committed: Cp204Revision = {
        ...revForm,
        revisionId:
          revForm.revisionId ||
          `REV-${revForm.revisionMonth}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        previousEstimatedTax: prev,
        proposedEstimatedTax: prop,
        variance: Math.round((prop - prev) * 100) / 100,
      };
      finalRevisions = [...draft.revisions, committed];
    }

    const finalCurrentTax = computeCp204CurrentEstimatedTax(
      draft.originalEstimatedTax,
      finalRevisions
    );

    setSaving(true);
    try {
      const updatedDraft: Cp204SavePayload = {
        ...draft,
        revisions: finalRevisions,
        currentEstimatedTax: finalCurrentTax,
      };
      await saveCp204(updatedDraft, selectedRecordId);
      setDraft(updatedDraft);
      setInheritedFlags({ pic: false, fye: false });
      if (editingRevIdx === null && revFormDirty) {
        setRevFormDirty(false);
        const fresh = makeFreshRevisionForm(updatedDraft, updatedDraft.pic, false);
        setRevForm(fresh.rev);
        setRevPicInherited(false);
      }
      setSuccessMsg(`Saved ${draft.cp204Id || ''} (${draft.clientName} · YA ${draft.ya}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save CP204 record.');
    } finally {
      setSaving(false);
    }
  };

  // Single Add / Edit Revision Form helpers
  const getMatchedClientForDraft = () =>
    draft
      ? findClientRecordForRow(clients, {
          clientId: draft.clientId,
          clientName: draft.clientName,
        })
      : undefined;

  const handleResetToNewRevision = (overrideDraft?: Cp204SavePayload) => {
    const targetDraft = overrideDraft ?? draft;
    if (!targetDraft) return;
    const matchedClient = findClientRecordForRow(clients, {
      clientId: targetDraft.clientId,
      clientName: targetDraft.clientName,
    });
    const fresh = makeFreshRevisionForm(
      targetDraft,
      matchedClient?.taxPic || '',
      inheritedFlags.pic
    );
    setEditingRevIdx(null);
    setRevForm(fresh.rev);
    setRevPicInherited(fresh.picInherited);
    setRevFormDirty(false);
    setError(null);
  };

  const handleEditRevisionRow = (idx: number) => {
    if (!draft) return;
    const target = draft.revisions[idx];
    if (!target) return;
    const matchedClient = getMatchedClientForDraft();
    const ownRevPic = (target.pic || '').trim();
    const fallbackPic = (draft.pic || '').trim() || (matchedClient?.taxPic || '').trim();
    const resolvedPic = ownRevPic || fallbackPic;
    const isInheritedFromClient =
      !ownRevPic && !(draft.pic || '').trim() && Boolean((matchedClient?.taxPic || '').trim());

    setEditingRevIdx(idx);
    setRevForm({
      ...target,
      pic: resolvedPic,
      submissionDeadline:
        target.submissionDeadline ||
        computeRevisionDeadline(draft.basisPeriodStart, target.revisionMonth),
    });
    setRevPicInherited(isInheritedFromClient);
    setRevFormDirty(false);
    setError(null);
  };

  const handlePatchRevForm = (
    patch: Partial<Cp204Revision>,
    options?: { manualPic?: boolean; monthChanged?: boolean }
  ) => {
    if (!draft) return;
    if (options?.manualPic) {
      setRevPicInherited(false);
    }

    const merged: Cp204Revision = { ...revForm, ...patch };
    if (options?.monthChanged && editingRevIdx === null) {
      const autoPrev = computePriorEstimateForMonth(draft, merged.revisionMonth, null);
      merged.previousEstimatedTax = autoPrev;
      if (!revFormDirty) {
        merged.proposedEstimatedTax = autoPrev;
      }
      merged.submissionDeadline = computeRevisionDeadline(
        draft.basisPeriodStart,
        merged.revisionMonth
      );
    } else if (options?.monthChanged && !merged.submissionDeadline) {
      merged.submissionDeadline = computeRevisionDeadline(
        draft.basisPeriodStart,
        merged.revisionMonth
      );
    }

    const prev = safeNum(merged.previousEstimatedTax);
    const prop = safeNum(merged.proposedEstimatedTax);
    const nextRev: Cp204Revision = {
      ...merged,
      variance: Math.round((prop - prev) * 100) / 100,
    };

    setRevForm(nextRev);

    if (editingRevIdx !== null) {
      // Live-sync edits into draft.revisions so summary table & Current Estimated Tax update immediately
      const nextRevisions = draft.revisions.map((r, i) => (i === editingRevIdx ? nextRev : r));
      setDraft({ ...draft, revisions: nextRevisions });
    } else {
      setRevFormDirty(true);
    }
  };

  const handleCommitRevisionForm = () => {
    if (!draft || isReadOnly) return;
    const prev = safeNum(revForm.previousEstimatedTax);
    const prop = safeNum(revForm.proposedEstimatedTax);
    const finalRev: Cp204Revision = {
      ...revForm,
      revisionId:
        revForm.revisionId ||
        `REV-${revForm.revisionMonth}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      previousEstimatedTax: prev,
      proposedEstimatedTax: prop,
      variance: Math.round((prop - prev) * 100) / 100,
    };

    if (editingRevIdx !== null) {
      const nextRevisions = draft.revisions.map((r, i) => (i === editingRevIdx ? finalRev : r));
      const nextDraft = { ...draft, revisions: nextRevisions };
      setDraft(nextDraft);
      handleResetToNewRevision(nextDraft);
      setSuccessMsg(
        `Updated ${finalRev.revisionMonth}th Month revision. Click "Save CP204 Changes" to persist.`
      );
    } else {
      const nextRevisions = [...draft.revisions, finalRev];
      const nextDraft = { ...draft, revisions: nextRevisions };
      setDraft(nextDraft);
      handleResetToNewRevision(nextDraft);
      setSuccessMsg(
        `Added ${finalRev.revisionMonth}th Month revision. Click "Save CP204 Changes" to persist.`
      );
    }
  };

  const removeRevision = (idx: number) => {
    if (!draft || isReadOnly) return;
    const nextRevisions = draft.revisions.filter((_, i) => i !== idx);
    const nextDraft = { ...draft, revisions: nextRevisions };
    setDraft(nextDraft);
    if (editingRevIdx === idx) {
      handleResetToNewRevision(nextDraft);
    } else if (editingRevIdx !== null && editingRevIdx > idx) {
      setEditingRevIdx(editingRevIdx - 1);
    }
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
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
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
                    <label className={labelCls}>Default Status</label>
                    <select
                      disabled={isReadOnly}
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value as Cp204Status)}
                      className={inputCls}
                    >
                      {bulkStatusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
                  <div className="text-[11px] text-slate-600">
                    {bulkPlan.error ? (
                      <span className="text-rose-700 font-medium">{bulkPlan.error}</span>
                    ) : selectedBulkClient ? (
                      <span>
                        Will create{' '}
                        <strong className="text-teal-700">{bulkPlan.missing.length}</strong> missing
                        YA(s) with status{' '}
                        <strong className="text-slate-900">{bulkStatus}</strong>;{' '}
                        <strong className="text-slate-700">{bulkPlan.existing.length}</strong>{' '}
                        existing preserved untouched.
                      </span>
                    ) : (
                      <span>Select a corporate client to preview missing YA records.</span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={
                      isReadOnly || saving || !bulkPlan.valid || bulkPlan.missing.length === 0
                    }
                    onClick={() => void handleBulkCreate()}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50 whitespace-nowrap"
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
                            {rec.fye || selectedBulkClient?.fye
                              ? Number(rec.fye || selectedBulkClient?.fye)
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {rec.pic || selectedBulkClient?.taxPic || '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-right text-slate-700">
                            {formatCurrencyRM(rec.originalEstimatedTax)}
                          </td>
                          <td className="px-3 py-2 font-mono text-right font-semibold text-slate-900">
                            {formatCurrencyRM(
                              computeCp204CurrentEstimatedTax(
                                rec.originalEstimatedTax,
                                rec.revisions
                              )
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <StatusPill group="CP204 SUBMISSION STATUS" value={rec.status} />
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
                          setInheritedFlags((prev) => ({ ...prev, fye: false }));
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
                      {inheritedFlags.fye && (
                        <p className="mt-1 text-[10px] font-medium text-teal-700">
                          Inherited from Client Master
                        </p>
                      )}
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
                      <p className="mt-1 text-[10px] text-slate-500">
                        (Updates from Submitted or Self-submit by Client revisions)
                      </p>
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
                        {initialStatusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelCls}>PIC</label>
                      <select
                        disabled={isReadOnly}
                        value={draft.pic}
                        onChange={(e) => {
                          setInheritedFlags((prev) => ({ ...prev, pic: false }));
                          setDraft({ ...draft, pic: e.target.value });
                        }}
                        className={inputCls}
                      >
                        {initialPicOptions.map((opt) => (
                          <option key={opt.value || '__blank__'} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {inheritedFlags.pic && (
                        <p className="mt-1 text-[10px] font-medium text-teal-700">
                          Inherited from Client Master
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Reviewer</label>
                      <select
                        disabled={isReadOnly}
                        value={draft.reviewer}
                        onChange={(e) => setDraft({ ...draft, reviewer: e.target.value })}
                        className={inputCls}
                      >
                        {initialReviewerOptions.map((opt) => (
                          <option key={opt.value || '__blank__'} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
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
                  {/* Estimate Summary Banner */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        Original Estimate:{' '}
                        <strong className="font-mono">
                          {formatCurrencyRM(draft.originalEstimatedTax)}
                        </strong>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>
                        Current Estimated Tax (Auto-derived):{' '}
                        <strong className="font-mono text-teal-800">
                          {formatCurrencyRM(liveCurrentTax)}
                        </strong>
                      </span>
                      <span className="text-[11px] text-slate-500">
                        (Updates from Submitted or Self-submit by Client revisions)
                      </span>
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleResetToNewRevision()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        New Revision
                      </button>
                    )}
                  </div>

                  {/* TOP: Compact Summary Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <div className="px-3.5 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        CP204A Revision Records — 6th, 9th &amp; 11th Month ({draft.revisions.length})
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {draft.clientName} · YA {draft.ya}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                              Month
                            </th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                              Previous Estimate (RM)
                            </th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                              Proposed Estimate (RM)
                            </th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                              Variance (RM)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                              Submission Status
                            </th>
                            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                              Submission Date
                            </th>
                            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                              PIC
                            </th>
                            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {draft.revisions.length === 0 ? (
                            <tr>
                              <td
                                colSpan={8}
                                className="px-4 py-7 text-center text-xs text-slate-500"
                              >
                                No CP204A revisions recorded yet for {draft.clientName} (YA{' '}
                                {draft.ya}). Use the form below to add a 6th, 9th, or 11th month
                                revision.
                              </td>
                            </tr>
                          ) : (
                            draft.revisions
                              .map((rev, idx) => ({ rev, idx }))
                              .sort(
                                (a, b) => Number(a.rev.revisionMonth) - Number(b.rev.revisionMonth)
                              )
                              .map(({ rev, idx }) => {
                                const isActiveEdit = editingRevIdx === idx;
                                const varianceVal =
                                  Math.round(
                                    (safeNum(rev.proposedEstimatedTax) -
                                      safeNum(rev.previousEstimatedTax)) *
                                      100
                                  ) / 100;
                                return (
                                  <tr
                                    key={rev.revisionId || idx}
                                    className={`transition-colors ${
                                      isActiveEdit
                                        ? 'bg-teal-50/70'
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5">
                                        <span>{rev.revisionMonth}th Month</span>
                                        {isActiveEdit && (
                                          <span className="px-1.5 py-0.5 rounded bg-teal-700 text-white text-[10px] font-sans font-semibold">
                                            Editing
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 font-mono tabular-nums text-right text-slate-700 whitespace-nowrap">
                                      {formatCurrencyRM(rev.previousEstimatedTax)}
                                    </td>
                                    <td className="px-3 py-2 font-mono tabular-nums text-right font-semibold text-slate-900 whitespace-nowrap">
                                      {formatCurrencyRM(rev.proposedEstimatedTax)}
                                    </td>
                                    <td
                                      className={`px-3 py-2 font-mono tabular-nums text-right font-medium whitespace-nowrap ${
                                        varianceVal > 0
                                          ? 'text-amber-700'
                                          : varianceVal < 0
                                          ? 'text-emerald-700'
                                          : 'text-slate-500'
                                      }`}
                                    >
                                      {varianceVal > 0 ? '+' : ''}
                                      {formatCurrencyRM(varianceVal)}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <StatusPill
                                        group="CP204A REVISIONS SUBMISSION STATUS"
                                        value={rev.reviewStatus}
                                      />
                                    </td>
                                    <td className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                      {rev.submissionDate
                                        ? formatDateDDMMYYYY(rev.submissionDate)
                                        : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                      {rev.pic || draft.pic || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleEditRevisionRow(idx)}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                                            isActiveEdit
                                              ? 'bg-teal-700 text-white border-teal-700'
                                              : 'bg-white text-teal-800 border-teal-200 hover:bg-teal-50'
                                          }`}
                                          title="Load revision into form below"
                                        >
                                          <Pencil className="w-3 h-3" />
                                          {isReadOnly ? 'View' : 'Edit'}
                                        </button>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={() => removeRevision(idx)}
                                            className="p-1 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                                            title="Remove revision"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
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
                  </div>

                  {/* BOTTOM: Single Compact 3-Column Add / Edit Form */}
                  <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-slate-900">
                          {editingRevIdx !== null
                            ? `Edit CP204A Revision — ${revForm.revisionMonth}th Month`
                            : 'Add / Edit CP204A Revision'}
                        </h4>
                        {editingRevIdx !== null ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                            Editing Existing ({revForm.revisionId})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            New Revision Entry
                          </span>
                        )}
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleResetToNewRevision()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-800 bg-white border border-teal-200 hover:bg-teal-50 rounded-md whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />+ New Revision
                        </button>
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Row 1: Month, Previous Estimate (RM), Proposed Estimate (RM) */}
                        <div>
                          <label className={labelCls}>Month</label>
                          <select
                            disabled={isReadOnly}
                            value={revForm.revisionMonth}
                            onChange={(e) =>
                              handlePatchRevForm(
                                { revisionMonth: e.target.value as Cp204RevisionMonth },
                                { monthChanged: true }
                              )
                            }
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
                          <label className={labelCls}>Previous Estimate (RM)</label>
                          <input
                            type="number"
                            step="0.01"
                            disabled={isReadOnly}
                            value={revForm.previousEstimatedTax}
                            onChange={(e) =>
                              handlePatchRevForm({
                                previousEstimatedTax: safeNum(e.target.value),
                              })
                            }
                            className={`${inputCls} font-mono text-right`}
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="text-[11px] font-medium text-slate-600">
                              Proposed Estimate (RM)
                            </label>
                            <span
                              className={`font-mono text-[10px] font-semibold tabular-nums ${
                                revForm.variance > 0
                                  ? 'text-amber-700'
                                  : revForm.variance < 0
                                  ? 'text-emerald-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              Var: {revForm.variance > 0 ? '+' : ''}
                              {formatCurrencyRM(revForm.variance)}
                            </span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            disabled={isReadOnly}
                            value={revForm.proposedEstimatedTax}
                            onChange={(e) =>
                              handlePatchRevForm({
                                proposedEstimatedTax: safeNum(e.target.value),
                              })
                            }
                            className={`${inputCls} font-mono text-right`}
                          />
                        </div>

                        {/* Row 2: Submission Status, Submission Date, Submission Deadline */}
                        <div>
                          <label className={labelCls}>Submission Status</label>
                          <select
                            disabled={isReadOnly}
                            value={revForm.reviewStatus}
                            onChange={(e) =>
                              handlePatchRevForm({
                                reviewStatus: e.target.value as Cp204RevisionStatus,
                              })
                            }
                            className={inputCls}
                          >
                            {revisionStatusOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={labelCls}>Submission Date</label>
                          <input
                            type="date"
                            disabled={isReadOnly}
                            value={revForm.submissionDate}
                            onChange={(e) =>
                              handlePatchRevForm({ submissionDate: e.target.value })
                            }
                            className={`${inputCls} font-mono`}
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Submission Deadline</label>
                          <input
                            type="date"
                            disabled={isReadOnly}
                            value={revForm.submissionDeadline}
                            onChange={(e) =>
                              handlePatchRevForm({ submissionDeadline: e.target.value })
                            }
                            className={`${inputCls} font-mono`}
                          />
                        </div>

                        {/* Row 3: PIC, Reviewer, Ack URL */}
                        <div>
                          <label className={labelCls}>PIC</label>
                          <select
                            disabled={isReadOnly}
                            value={revForm.pic}
                            onChange={(e) =>
                              handlePatchRevForm(
                                { pic: e.target.value },
                                { manualPic: true }
                              )
                            }
                            className={inputCls}
                          >
                            {revPicOptions.map((opt) => (
                              <option key={opt.value || '__blank__'} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          {revPicInherited && (
                            <p className="mt-1 text-[10px] font-medium text-teal-700">
                              Inherited from Client Master
                            </p>
                          )}
                        </div>

                        <div>
                          <label className={labelCls}>Reviewer</label>
                          <select
                            disabled={isReadOnly}
                            value={revForm.reviewer}
                            onChange={(e) => handlePatchRevForm({ reviewer: e.target.value })}
                            className={inputCls}
                          >
                            {revReviewerOptions.map((opt) => (
                              <option key={opt.value || '__blank__'} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={labelCls}>Ack URL</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="url"
                              disabled={isReadOnly}
                              value={revForm.acknowledgementUrl}
                              onChange={(e) =>
                                handlePatchRevForm({ acknowledgementUrl: e.target.value })
                              }
                              placeholder="https://..."
                              className={inputCls}
                            />
                            {revForm.acknowledgementUrl && (
                              <a
                                href={revForm.acknowledgementUrl}
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

                        {/* Row 4: Reason & Remarks */}
                        <div>
                          <label className={labelCls}>Reason</label>
                          <input
                            maxLength={500}
                            disabled={isReadOnly}
                            value={revForm.reason}
                            onChange={(e) => handlePatchRevForm({ reason: e.target.value })}
                            placeholder="e.g. Revised profit forecast / client self-filed"
                            className={inputCls}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className={labelCls}>Remarks</label>
                          <input
                            maxLength={1000}
                            disabled={isReadOnly}
                            value={revForm.remarks}
                            onChange={(e) => handlePatchRevForm({ remarks: e.target.value })}
                            placeholder="Optional internal remarks or LHDN filing notes..."
                            className={inputCls}
                          />
                        </div>
                      </div>

                      {/* Form Action Bar */}
                      {!isReadOnly && (
                        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500">
                            {isEffectiveRevisionStatus(revForm.reviewStatus) ? (
                              <>
                                Status{' '}
                                <strong className="text-teal-800">{revForm.reviewStatus}</strong>{' '}
                                updates Current Estimated Tax to{' '}
                                <strong className="font-mono text-teal-900">
                                  {formatCurrencyRM(revForm.proposedEstimatedTax)}
                                </strong>
                                .
                              </>
                            ) : (
                              <>
                                Status <strong>{revForm.reviewStatus}</strong> will not alter
                                Current Estimated Tax (Updates from Submitted or Self-submit by
                                Client revisions).
                              </>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            {editingRevIdx !== null && (
                              <button
                                type="button"
                                onClick={() => handleResetToNewRevision()}
                                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
                              >
                                Done Editing
                              </button>
                            )}
                            {editingRevIdx === null && (
                              <button
                                type="button"
                                onClick={handleCommitRevisionForm}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add Revision to List
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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
