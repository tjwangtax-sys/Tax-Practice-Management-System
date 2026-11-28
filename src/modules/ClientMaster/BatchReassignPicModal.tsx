import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CheckSquare,
  Search,
  Square,
  Users,
  X,
  AlertTriangle,
  Briefcase,
  FileSpreadsheet,
} from 'lucide-react';
import { ClientRecord, StaffMember } from '../../types/tpms';
import { useData } from '../../context/DataContext';
import { getStaffOptions } from '../../lib/settingsDropdown';
import { normalizeClientIdKey } from '../../lib/jobUtils';
import { showToast } from '../../lib/toast';
import { StatusPill } from '../../components/StatusPill';

interface BatchReassignPicModalProps {
  open: boolean;
  initialFromPic?: string;
  onClose: () => void;
}

interface FromStaffBucket {
  key: string; // canonical uppercase key or '__UNASSIGNED__'
  rawValue: string; // representative raw value for display/audit
  label: string;
  isInactive: boolean;
  matchedStaff?: StaffMember;
  clients: ClientRecord[];
}

const UNASSIGNED_KEY = '__UNASSIGNED__';

function splitStaffTokens(val: string): string[] {
  const trimmed = (val || '').trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\s*[—–-]\s*/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set([trimmed.toUpperCase(), ...parts]));
}

function matchStaffDirectoryMember(rawPic: string, staffList: StaffMember[]): StaffMember | undefined {
  const tokens = splitStaffTokens(rawPic);
  if (tokens.length === 0) return undefined;
  return staffList.find((s) => {
    const id = (s.staffId || '').trim().toUpperCase();
    const name = (s.staffName || '').trim().toUpperCase();
    return (id && tokens.includes(id)) || (name && tokens.includes(name));
  });
}

function isJobOpenStatus(status?: string): boolean {
  const s = (status || '').trim().toLowerCase();
  return s !== 'completed' && s !== 'cancelled' && s !== 'closed' && s !== 'n/a';
}

export const BatchReassignPicModal: React.FC<BatchReassignPicModalProps> = ({
  open,
  initialFromPic,
  onClose,
}) => {
  // All React hooks declared unconditionally before any early return
  const { clients, jobs, cp204Records, staff, batchReassignClientPic } = useData();

  const [fromKey, setFromKey] = useState<string>('');
  const [toPic, setToPic] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [cascadeToJobsAndCp204, setCascadeToJobsAndCp204] = useState<boolean>(true);
  const [handoverNote, setHandoverNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Build From Staff buckets from every distinct taxPic currently assigned to >= 1 client
  const fromBuckets = useMemo<FromStaffBucket[]>(() => {
    const map = new Map<string, { rawCounts: Map<string, number>; clients: ClientRecord[] }>();
    for (const c of clients) {
      const raw = (c.taxPic || '').trim();
      const key = raw ? raw.toUpperCase() : UNASSIGNED_KEY;
      let entry = map.get(key);
      if (!entry) {
        entry = { rawCounts: new Map(), clients: [] };
        map.set(key, entry);
      }
      entry.clients.push(c);
      entry.rawCounts.set(raw, (entry.rawCounts.get(raw) ?? 0) + 1);
    }

    const buckets: FromStaffBucket[] = [];
    for (const [key, entry] of map.entries()) {
      // Pick most common raw casing for display
      let rawValue = '';
      let maxCount = -1;
      for (const [val, cnt] of entry.rawCounts.entries()) {
        if (cnt > maxCount) {
          maxCount = cnt;
          rawValue = val;
        }
      }

      const sortedClients = [...entry.clients].sort((a, b) =>
        (a.clientId || '').localeCompare(b.clientId || '', undefined, { numeric: true })
      );

      if (key === UNASSIGNED_KEY) {
        buckets.push({
          key,
          rawValue: 'Unassigned',
          label: `Unassigned / Blank (${sortedClients.length} client${sortedClients.length === 1 ? '' : 's'})`,
          isInactive: false,
          clients: sortedClients,
        });
        continue;
      }

      const matched = matchStaffDirectoryMember(rawValue, staff);
      const isInactive = Boolean(matched && !matched.active);
      const code = (matched?.staffId || '').trim();
      const name = (matched?.staffName || '').trim();
      const baseName =
        matched && code && name && code.toLowerCase() !== name.toLowerCase()
          ? `${code} — ${name}`
          : rawValue;

      const suffix = isInactive
        ? `Inactive · ${sortedClients.length} client${sortedClients.length === 1 ? '' : 's'}`
        : `${sortedClients.length} client${sortedClients.length === 1 ? '' : 's'}`;

      buckets.push({
        key,
        rawValue,
        label: `${baseName} (${suffix})`,
        isInactive,
        matchedStaff: matched,
        clients: sortedClients,
      });
    }

    // Sort: Inactive staff first, then Unassigned / TO ASSIGN, then Active alphabetically
    return buckets.sort((a, b) => {
      if (a.isInactive !== b.isInactive) return a.isInactive ? -1 : 1;
      const aSpecial = a.key === UNASSIGNED_KEY || a.key === 'TO ASSIGN' ? 0 : 1;
      const bSpecial = b.key === UNASSIGNED_KEY || b.key === 'TO ASSIGN' ? 0 : 1;
      if (aSpecial !== bSpecial) return aSpecial - bSpecial;
      return a.label.localeCompare(b.label);
    });
  }, [clients, staff]);

  // Strictly Active staff from staffDirectory + TO ASSIGN
  const toStaffOptions = useMemo(() => {
    return getStaffOptions(staff).filter((opt) => opt.value !== '');
  }, [staff]);

  // Sync modal state on open / initialFromPic change
  useEffect(() => {
    if (!open) return;
    setError(null);
    setClientSearch('');
    setHandoverNote('');
    setCascadeToJobsAndCp204(true);
    setToPic('');

    if (initialFromPic && initialFromPic.trim()) {
      const targetTokens = splitStaffTokens(initialFromPic);
      const matchedBucket = fromBuckets.find((b) => {
        if (b.key === UNASSIGNED_KEY) return false;
        const bTokens = splitStaffTokens(b.rawValue);
        if (bTokens.some((t) => targetTokens.includes(t))) return true;
        if (b.matchedStaff) {
          const mId = (b.matchedStaff.staffId || '').trim().toUpperCase();
          const mName = (b.matchedStaff.staffName || '').trim().toUpperCase();
          if ((mId && targetTokens.includes(mId)) || (mName && targetTokens.includes(mName))) {
            return true;
          }
        }
        return false;
      });

      if (matchedBucket) {
        setFromKey(matchedBucket.key);
        setSelectedClientIds(new Set(matchedBucket.clients.map((c) => c.id)));
        return;
      }
    }

    // Default to first inactive staff bucket if any exist, else empty
    const firstInactive = fromBuckets.find((b) => b.isInactive);
    if (firstInactive) {
      setFromKey(firstInactive.key);
      setSelectedClientIds(new Set(firstInactive.clients.map((c) => c.id)));
    } else {
      setFromKey('');
      setSelectedClientIds(new Set());
    }
  }, [open, initialFromPic, fromBuckets]);

  const activeBucket = useMemo(
    () => fromBuckets.find((b) => b.key === fromKey) ?? null,
    [fromBuckets, fromKey]
  );

  const visibleClients = useMemo(() => {
    if (!activeBucket) return [];
    const q = clientSearch.trim().toLowerCase();
    if (!q) return activeBucket.clients;
    return activeBucket.clients.filter((c) =>
      [c.clientId, c.clientName, c.fye, c.clientStatus, c.groupId]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [activeBucket, clientSearch]);

  // Live impact preview: how many open Jobs and active CP204 records will be cascaded
  const cascadeImpact = useMemo(() => {
    if (selectedClientIds.size === 0) return { jobsCount: 0, cp204Count: 0 };
    const selectedClients = clients.filter((c) => selectedClientIds.has(c.id));
    const normIds = new Set(
      selectedClients.map((c) => normalizeClientIdKey(c.clientId)).filter(Boolean)
    );

    let jobsCount = 0;
    for (const j of jobs) {
      if (
        isJobOpenStatus(j.status) &&
        ((j.clientDocId && selectedClientIds.has(j.clientDocId)) ||
          normIds.has(normalizeClientIdKey(j.clientId)))
      ) {
        jobsCount += 1;
      }
    }

    let cp204Count = 0;
    for (const r of cp204Records) {
      if (
        (r.status || '').trim().toLowerCase() !== 'completed' &&
        normIds.has(normalizeClientIdKey(r.clientId))
      ) {
        cp204Count += 1;
      }
    }

    return { jobsCount, cp204Count };
  }, [selectedClientIds, clients, jobs, cp204Records]);

  if (!open) return null;

  const handleChangeFromStaff = (nextKey: string) => {
    setFromKey(nextKey);
    setError(null);
    const bucket = fromBuckets.find((b) => b.key === nextKey);
    if (bucket) {
      setSelectedClientIds(new Set(bucket.clients.map((c) => c.id)));
    } else {
      setSelectedClientIds(new Set());
    }
  };

  const toggleClient = (docId: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      for (const c of visibleClients) next.add(c.id);
      return next;
    });
  };

  const handleDeselectAllVisible = () => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      for (const c of visibleClients) next.delete(c.id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBucket) {
      setError('Please select a From Staff portfolio.');
      return;
    }
    if (!toPic) {
      setError('Please select a To Staff assignee.');
      return;
    }
    if (selectedClientIds.size === 0) {
      setError('Please select at least one client to reassign.');
      return;
    }
    if (activeBucket.rawValue.trim().toUpperCase() === toPic.trim().toUpperCase()) {
      setError('From Staff and To Staff cannot be the same.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await batchReassignClientPic({
        fromPic: activeBucket.rawValue,
        toPic,
        clientDocIds: Array.from(selectedClientIds),
        cascadeToJobsAndCp204,
        note: handoverNote.trim() || undefined,
      });

      const cascadePart = cascadeToJobsAndCp204
        ? ` (+ ${res.jobsUpdated} open job${res.jobsUpdated === 1 ? '' : 's'}, ${res.cp204Updated} active CP204)`
        : '';

      showToast(
        `Reassigned ${res.clientsUpdated} client${res.clientsUpdated === 1 ? '' : 's'} from ${activeBucket.rawValue} to ${toPic}${cascadePart}.`,
        'success',
        5200
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch reassign client PIC.');
    } finally {
      setSubmitting(false);
    }
  };

  const allVisibleSelected =
    visibleClients.length > 0 && visibleClients.every((c) => selectedClientIds.has(c.id));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 no-print">
      <div className="fixed inset-0 bg-slate-900/50" onClick={() => !submitting && onClose()} />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-4 h-4 text-teal-700" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-sm text-slate-900">
                Batch Portfolio Handover — Reassign Tax PIC
              </h3>
              <p className="text-[11px] text-slate-500">
                Transfer clients from an inactive or departing staff member to an active PIC in one
                audited batch.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/60"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* From -> To Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                From Staff (Current Tax PIC) *
              </label>
              <select
                value={fromKey}
                onChange={(e) => handleChangeFromStaff(e.target.value)}
                required
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-teal-700"
              >
                <option value="">— Select current PIC portfolio —</option>
                {fromBuckets.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                To Staff (New Active Tax PIC) *
              </label>
              <select
                value={toPic}
                onChange={(e) => {
                  setToPic(e.target.value);
                  setError(null);
                }}
                required
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-teal-700"
              >
                <option value="">— Select new active staff —</option>
                {toStaffOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Client Selection Checklist */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-teal-700" />
                <span className="font-semibold text-slate-800">Clients to Transfer</span>
                {activeBucket && (
                  <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono text-[10px] font-semibold">
                    {selectedClientIds.size} / {activeBucket.clients.length} selected
                  </span>
                )}
              </div>

              {activeBucket && activeBucket.clients.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Filter list..."
                      className="pl-6 pr-2 py-1 text-[11px] bg-white border border-slate-200 rounded w-36 focus:outline-none focus:border-teal-700"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={allVisibleSelected ? handleDeselectAllVisible : handleSelectAllVisible}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-teal-700 bg-white border border-slate-200 rounded hover:bg-teal-50"
                  >
                    {allVisibleSelected ? (
                      <>
                        <Square className="w-3 h-3" /> Deselect All
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-3 h-3" /> Select All
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {!activeBucket ? (
              <div className="px-4 py-8 text-center text-slate-500">
                Choose a <span className="font-semibold text-slate-700">From Staff</span> above to
                preview and select their assigned clients.
              </div>
            ) : visibleClients.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500">
                No clients match your search filter.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                {visibleClients.map((c) => {
                  const checked = selectedClientIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                        checked ? 'bg-teal-50/40 hover:bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClient(c.id)}
                        className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                      />
                      <span className="font-mono font-semibold text-slate-800 w-16 shrink-0">
                        {c.clientId}
                      </span>
                      <span className="font-medium text-slate-900 truncate flex-1">
                        {c.clientName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 shrink-0">
                        FYE {c.fye || '—'}
                      </span>
                      <div className="shrink-0">
                        <StatusPill group="CLIENT_STATUS" value={c.clientStatus} />
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Handover Note (Optional) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Handover Note (Optional)
            </label>
            <input
              type="text"
              maxLength={240}
              value={handoverNote}
              onChange={(e) => setHandoverNote(e.target.value)}
              placeholder="e.g. Staff departure handover, workload rebalancing, maternity cover..."
              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-700"
            />
          </div>

          {/* Cascade Option */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={cascadeToJobsAndCp204}
                onChange={(e) => setCascadeToJobsAndCp204(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <div>
                <div className="font-semibold text-slate-800">
                  Also update PIC on all open (non-completed) Jobs and active CP204 records for
                  selected clients
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Completed historical jobs and completed CP204 filings are preserved unchanged for
                  audit integrity.
                </div>
              </div>
            </label>

            {selectedClientIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 pl-6 pt-1 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1 font-medium">
                  <Briefcase className="w-3.5 h-3.5 text-teal-700" />
                  {cascadeToJobsAndCp204 ? (
                    <>
                      <strong className="text-slate-900">{cascadeImpact.jobsCount}</strong> open job
                      {cascadeImpact.jobsCount === 1 ? '' : 's'} will be updated
                    </>
                  ) : (
                    <span>Jobs untouched</span>
                  )}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" />
                  {cascadeToJobsAndCp204 ? (
                    <>
                      <strong className="text-slate-900">{cascadeImpact.cp204Count}</strong> active
                      CP204 record{cascadeImpact.cp204Count === 1 ? '' : 's'} will be updated
                    </>
                  ) : (
                    <span>CP204 untouched</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            Client PIC history, job previous PIC, and audit trail entries are logged automatically.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !activeBucket || !toPic || selectedClientIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {submitting
                ? 'Transferring...'
                : `Reassign ${selectedClientIds.size} Client${selectedClientIds.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
