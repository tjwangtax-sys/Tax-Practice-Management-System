import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  FileDown,
  Lock,
  Search,
  RotateCcw,
  ShieldAlert,
  ChevronDown,
} from 'lucide-react';
import { AuditLogEntry, ColumnDef } from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { exportToCsv, exportToExcel, printRegisterHtml } from '../../lib/exportUtils';

const AUDIT_COLUMNS: ColumnDef[] = [
  { key: 'timestamp', label: 'Timestamp', defaultVisible: true },
  { key: 'user', label: 'User / Staff', defaultVisible: true },
  { key: 'module', label: 'Module', defaultVisible: true },
  { key: 'action', label: 'Action', defaultVisible: true },
  { key: 'recordClient', label: 'Record ID / Client', defaultVisible: true },
  { key: 'details', label: 'Details', defaultVisible: true },
];

interface NormalizedAuditRow {
  id: string;
  timestampMs: number;
  timestampDisplay: string;
  userDisplay: string;
  userName: string;
  userStaffId: string;
  userEmail: string;
  module: string;
  action: string;
  recordId: string;
  clientId: string;
  clientName: string;
  recordClientDisplay: string;
  details: string;
  source: 'auditLogs' | 'history';
}

function formatAuditTimestamp(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

function formatActionLabel(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'Updated';
  const upper = s.toUpperCase();
  if (upper === 'CREATED') return 'Created';
  if (upper === 'UPDATED') return 'Updated';
  if (upper === 'DELETED') return 'Deleted';
  if (upper === 'STATUS_CHANGED') return 'Status Changed';
  if (upper === 'PIC_HANDOVER') return 'PIC Handover';
  if (upper === 'BATCH_CREATED') return 'Batch Created';
  if (upper === 'BATCH_UPDATED') return 'Batch Updated';
  if (upper === 'RECOMPUTED') return 'Recomputed';
  return s;
}

function getActionBadgeClasses(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('delete') || lower.includes('remove')) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (lower.includes('handover') || lower.includes('transfer')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
  if (lower.includes('import')) {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  }
  if (lower.includes('create') || lower.includes('seed')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (lower.includes('status')) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

function getModuleBadgeClasses(mod: string): string {
  const lower = mod.toLowerCase();
  if (lower.includes('import')) return 'bg-purple-50 text-purple-800 border-purple-200';
  if (lower.includes('client')) return 'bg-teal-50 text-teal-800 border-teal-200';
  if (lower.includes('cp204')) return 'bg-cyan-50 text-cyan-800 border-cyan-200';
  if (lower.includes('job')) return 'bg-blue-50 text-blue-800 border-blue-200';
  if (lower.includes('work done') || lower.includes('finance')) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (lower.includes('payment')) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (lower.includes('correspondence')) return 'bg-orange-50 text-orange-800 border-orange-200';
  if (lower.includes('calendar')) return 'bg-violet-50 text-violet-800 border-violet-200';
  if (lower.includes('staff') || lower.includes('controlled')) {
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function parseLegacyUserLabel(rawUser: string): { name: string; email: string } {
  const s = (rawUser || '').trim();
  if (!s) return { name: 'System', email: '' };
  const match = s.match(/^(.+?)\s*\(([^)]+@[^)]+)\)$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  if (s.includes('@')) {
    return { name: s.split('@')[0], email: s };
  }
  return { name: s, email: '' };
}

export const AuditTrailTab: React.FC = () => {
  const { isAdmin } = useAuth();
  const { auditLogs, history, jobs, staff } = useData();

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [displayLimit, setDisplayLimit] = useState(100);

  const colVis = useColumnVisibility('admin_audit_trail', AUDIT_COLUMNS);

  const staffByEmail = useMemo(() => {
    const map = new Map<string, { staffId: string; staffName: string }>();
    for (const s of staff) {
      if (s.email) {
        map.set(s.email.trim().toLowerCase(), {
          staffId: s.staffId || '',
          staffName: s.staffName || '',
        });
      }
    }
    return map;
  }, [staff]);

  const jobsById = useMemo(() => {
    const map = new Map<string, { jobCode: string; module: string; clientId: string; clientName: string }>();
    for (const j of jobs) {
      map.set(j.id, {
        jobCode: j.jobCode || j.id,
        module: j.module || 'Jobs',
        clientId: j.clientId || '',
        clientName: j.clientName || '',
      });
    }
    return map;
  }, [jobs]);

  // Combine live auditLogs collection with legacy job/handover history entries (deduplicated), sorted newest first
  const allRows = useMemo<NormalizedAuditRow[]>(() => {
    const rows: NormalizedAuditRow[] = [];

    const fromAuditEntry = (entry: AuditLogEntry): NormalizedAuditRow => {
      const ms = entry.timestamp?.toMillis?.() ?? 0;
      const matchedStaff = entry.userEmail
        ? staffByEmail.get(entry.userEmail.trim().toLowerCase())
        : undefined;
      const userStaffId = entry.userStaffId || matchedStaff?.staffId || '';
      const userName = entry.userName || matchedStaff?.staffName || entry.userEmail || 'System';
      const userEmail = entry.userEmail || '';
      const userDisplay = userStaffId
        ? `${userStaffId} — ${userName}`
        : userName;
      const clientPart = [entry.clientId, entry.clientName].filter(Boolean).join(' · ');
      const recordClientDisplay = clientPart
        ? `${entry.recordId} (${clientPart})`
        : entry.recordId || '—';

      return {
        id: `aud_${entry.id}`,
        timestampMs: ms,
        timestampDisplay: formatAuditTimestamp(ms),
        userDisplay,
        userName,
        userStaffId,
        userEmail,
        module: entry.module || 'General',
        action: formatActionLabel(entry.action),
        recordId: entry.recordId || '—',
        clientId: entry.clientId || '',
        clientName: entry.clientName || '',
        recordClientDisplay,
        details: entry.details || '—',
        source: 'auditLogs',
      };
    };

    for (const entry of auditLogs) {
      rows.push(fromAuditEntry(entry));
    }

    // Include historical `history` entries not already mirrored in `auditLogs`
    for (const h of history) {
      const hMs = h.timestamp?.toMillis?.() ?? 0;
      const jobMeta = jobsById.get(h.jobId);
      const resolvedRecordId =
        h.jobId === 'BATCH_PIC_TRANSFER'
          ? 'BATCH_PIC_TRANSFER'
          : jobMeta?.jobCode || h.jobId || '—';

      // Skip if an auditLogs entry already captured this exact record within 15 seconds
      const isMirrored = rows.some(
        (r) =>
          r.source === 'auditLogs' &&
          (r.recordId === resolvedRecordId || r.recordId === h.jobId) &&
          Math.abs(r.timestampMs - hMs) < 15000
      );
      if (isMirrored) continue;

      const parsed = parseLegacyUserLabel(h.user);
      const matchedStaff = parsed.email
        ? staffByEmail.get(parsed.email.trim().toLowerCase())
        : undefined;
      const userStaffId = matchedStaff?.staffId || '';
      const userName = matchedStaff?.staffName || parsed.name || 'System';
      const userDisplay = userStaffId ? `${userStaffId} — ${userName}` : userName;

      const isBatchTransfer = h.jobId === 'BATCH_PIC_TRANSFER';
      const modName = isBatchTransfer
        ? 'Client Master'
        : jobMeta
        ? `Jobs (${jobMeta.module})`
        : 'Jobs';
      const actionLabel = isBatchTransfer ? 'Batch PIC Handover' : formatActionLabel(h.action);
      const clientId = jobMeta?.clientId || '';
      const clientName = jobMeta?.clientName || '';
      const clientPart = [clientId, clientName].filter(Boolean).join(' · ');
      const recordClientDisplay = clientPart
        ? `${resolvedRecordId} (${clientPart})`
        : resolvedRecordId;

      const statusSuffix =
        !isBatchTransfer && h.oldStatus && h.newStatus && h.oldStatus !== h.newStatus && !h.remarks?.includes(h.newStatus)
          ? ` (${h.oldStatus} → ${h.newStatus})`
          : '';

      rows.push({
        id: `hist_${h.id}`,
        timestampMs: hMs,
        timestampDisplay: formatAuditTimestamp(hMs),
        userDisplay,
        userName,
        userStaffId,
        userEmail: parsed.email,
        module: modName,
        action: actionLabel,
        recordId: resolvedRecordId,
        clientId,
        clientName,
        recordClientDisplay,
        details: `${h.remarks || actionLabel}${statusSuffix}`,
        source: 'history',
      });
    }

    rows.sort((a, b) => b.timestampMs - a.timestampMs);
    return rows;
  }, [auditLogs, history, jobsById, staffByEmail]);

  const distinctModules = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.module) set.add(r.module);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const distinctUsers = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.userDisplay) set.add(r.userDisplay);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const distinctActions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.action) set.add(r.action);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (moduleFilter && r.module !== moduleFilter) return false;
      if (userFilter && r.userDisplay !== userFilter) return false;
      if (actionFilter && r.action !== actionFilter) return false;
      if (q) {
        const hay = [
          r.timestampDisplay,
          r.userDisplay,
          r.userEmail,
          r.module,
          r.action,
          r.recordId,
          r.clientId,
          r.clientName,
          r.details,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, search, moduleFilter, userFilter, actionFilter]);

  const valueGetters = useMemo(
    () => ({
      timestamp: (r: NormalizedAuditRow) => r.timestampDisplay,
      user: (r: NormalizedAuditRow) => r.userDisplay,
      module: (r: NormalizedAuditRow) => r.module,
      action: (r: NormalizedAuditRow) => r.action,
      recordClient: (r: NormalizedAuditRow) => r.recordClientDisplay,
      details: (r: NormalizedAuditRow) => r.details,
    }),
    []
  );

  const excelTable = useExcelTableFilters(filteredRows, valueGetters);
  const displayedRows = excelTable.rows;
  const visibleRows = useMemo(
    () => displayedRows.slice(0, displayLimit),
    [displayedRows, displayLimit]
  );

  const visibleCols = AUDIT_COLUMNS.filter((c) => colVis.visibleColumns[c.key]);

  const buildExportRows = () =>
    displayedRows.map((r) => ({
      timestamp: r.timestampDisplay,
      user: r.userEmail ? `${r.userDisplay} (${r.userEmail})` : r.userDisplay,
      module: r.module,
      action: r.action,
      recordClient: r.recordClientDisplay,
      details: r.details,
    }));

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto mb-2" />
        <h3 className="font-display font-bold text-sm text-slate-900">
          Administrator Privileges Required
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          The practice-wide Audit Trail is strictly restricted to Admin users.
        </p>
      </div>
    );
  }

  const todayStamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* Read-Only Notice Bar */}
      <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200/80 text-slate-800 font-semibold text-[11px]">
            <Lock className="w-3 h-3" />
            Read-Only Audit Log
          </span>
          <span className="text-slate-600">
            Chronological, tamper-proof record of live edits, bulk imports, status changes, and PIC
            handovers (newest first).
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
          {displayedRows.length.toLocaleString()} / {allRows.length.toLocaleString()} entries
        </span>
      </div>

      {/* Toolbar: Search, Module/User/Action Filters, Export Excel & CSV */}
      <RegisterToolbar
        searchValue={search}
        onSearchChange={(val) => {
          setSearch(val);
          setDisplayLimit(100);
        }}
        searchPlaceholder="Search timestamp, user, module, action, record ID, client, or details..."
        hasActiveFilters={Boolean(
          search || moduleFilter || userFilter || actionFilter || excelTable.hasActiveColumnFilters
        )}
        onResetFilters={() => {
          setSearch('');
          setModuleFilter('');
          setUserFilter('');
          setActionFilter('');
          excelTable.resetColumnFilters();
          setDisplayLimit(100);
        }}
        columns={AUDIT_COLUMNS}
        visibleColumns={colVis.visibleColumns}
        onToggleColumn={colVis.toggleColumn}
        onResetColumns={colVis.resetColumns}
        recordCount={displayedRows.length}
        totalCount={allRows.length}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_Audit_Trail_${todayStamp}.xlsx`,
            'Audit Trail',
            visibleCols,
            buildExportRows()
          )
        }
        onPrint={() =>
          printRegisterHtml(
            'Practice Audit Trail',
            `Read-only activity log — ${displayedRows.length} records (newest first)`,
            visibleCols,
            buildExportRows(),
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            'Practice Audit Trail',
            `Read-only activity log — ${displayedRows.length} records (newest first)`,
            visibleCols,
            buildExportRows(),
            true
          )
        }
        filters={
          <>
            <select
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setDisplayLimit(100);
              }}
              aria-label="Filter by Module"
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Modules</option>
              {distinctModules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setDisplayLimit(100);
              }}
              aria-label="Filter by User / Staff"
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 max-w-[200px]"
            >
              <option value="">All Users / Staff</option>
              {distinctUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setDisplayLimit(100);
              }}
              aria-label="Filter by Action"
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Actions</option>
              {distinctActions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </>
        }
        primaryAction={
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              disabled={displayedRows.length === 0}
              onClick={() =>
                exportToExcel(
                  `TPMS_Audit_Trail_${todayStamp}.xlsx`,
                  'Audit Trail',
                  visibleCols,
                  buildExportRows()
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
            <button
              type="button"
              disabled={displayedRows.length === 0}
              onClick={() =>
                exportToCsv(
                  `TPMS_Audit_Trail_${todayStamp}.csv`,
                  visibleCols,
                  buildExportRows()
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md whitespace-nowrap disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        }
      />

      {/* Audit Trail Table */}
      <div className="max-h-[calc(100vh-120px)] overflow-auto relative bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm border-b border-slate-200 text-slate-700">
            <tr>
              {visibleCols.map((col) => {
                const widthCls =
                  col.key === 'timestamp'
                    ? 'w-[148px] min-w-[142px]'
                    : col.key === 'user'
                    ? 'w-[185px] min-w-[165px]'
                    : col.key === 'module'
                    ? 'w-[145px] min-w-[130px]'
                    : col.key === 'action'
                    ? 'w-[135px] min-w-[120px]'
                    : col.key === 'recordClient'
                    ? 'w-[220px] min-w-[185px]'
                    : 'min-w-[280px]';
                return (
                  <th
                    key={col.key}
                    className={`sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left text-xs font-semibold whitespace-nowrap border-b border-slate-200 ${widthCls}`}
                  >
                    <ExcelColumnFilter
                      columnKey={col.key}
                      title={col.label}
                      values={excelTable.getColumnValues(col.key)}
                      selectedValues={excelTable.columnFilters[col.key]}
                      onChangeSelected={(next) => excelTable.setColumnFilter(col.key, next)}
                      sortDirection={
                        excelTable.sortState?.key === col.key
                          ? excelTable.sortState.direction
                          : null
                      }
                      onSort={(dir) => excelTable.setColumnSort(col.key, dir)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(1, visibleCols.length)} className="px-6 py-12 text-center">
                  <Search className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    {allRows.length === 0
                      ? 'No audit trail entries recorded yet'
                      : 'No audit entries match your current filters'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {allRows.length === 0
                      ? 'Live edits, data imports, status updates, and portfolio handovers will appear here automatically.'
                      : 'Try clearing the search query or module/user filters.'}
                  </p>
                  {(search || moduleFilter || userFilter || actionFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setModuleFilter('');
                        setUserFilter('');
                        setActionFilter('');
                        excelTable.resetColumnFilters();
                      }}
                      className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset Filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors align-top">
                  {colVis.visibleColumns.timestamp && (
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-slate-600 whitespace-nowrap">
                      {row.timestampDisplay}
                    </td>
                  )}
                  {colVis.visibleColumns.user && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {row.userStaffId && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] font-semibold text-slate-700">
                            {row.userStaffId}
                          </span>
                        )}
                        <span className="font-medium text-slate-900">{row.userName}</span>
                      </div>
                      {row.userEmail && (
                        <div className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]">
                          {row.userEmail}
                        </div>
                      )}
                    </td>
                  )}
                  {colVis.visibleColumns.module && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${getModuleBadgeClasses(
                          row.module
                        )}`}
                      >
                        {row.module}
                      </span>
                    </td>
                  )}
                  {colVis.visibleColumns.action && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold ${getActionBadgeClasses(
                          row.action
                        )}`}
                      >
                        {row.action}
                      </span>
                    </td>
                  )}
                  {colVis.visibleColumns.recordClient && (
                    <td className="px-3 py-2">
                      <div className="font-mono text-[11px] font-semibold text-slate-800 break-all">
                        {row.recordId}
                      </div>
                      {(row.clientId || row.clientName) && (
                        <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {row.clientId && (
                            <span className="font-mono text-[10px] text-slate-500 mr-1">
                              {row.clientId}
                            </span>
                          )}
                          <span>{row.clientName}</span>
                        </div>
                      )}
                    </td>
                  )}
                  {colVis.visibleColumns.details && (
                    <td className="px-3 py-2 text-slate-700 leading-relaxed break-words">
                      {row.details}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {displayedRows.length > displayLimit && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Showing {visibleRows.length.toLocaleString()} of{' '}
              {displayedRows.length.toLocaleString()} matching entries
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDisplayLimit((prev) => prev + 100)}
                className="inline-flex items-center gap-1 px-3 py-1 font-semibold text-teal-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Load 100 More
              </button>
              <button
                type="button"
                onClick={() => setDisplayLimit(displayedRows.length)}
                className="px-2.5 py-1 font-medium text-slate-600 hover:text-slate-900"
              >
                Show All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
