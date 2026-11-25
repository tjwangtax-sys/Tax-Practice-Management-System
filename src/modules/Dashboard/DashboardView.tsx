import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  AlertTriangle,
  CalendarClock,
  MailWarning,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { NavigationFilterPreset, NavRoute, TaxJob } from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { extractFyeMonth, formatDateDDMMYYYY, isIsoDateString } from '../../lib/deadlineUtils';

interface DashboardViewProps {
  onNavigate: (route: NavRoute, preset?: Omit<NavigationFilterPreset, 'nonce'>) => void;
}

const CLOSED_JOB_STATUSES = new Set([
  'completed',
  'submitted',
  'filed',
  'closed',
  'cancelled',
  'billed',
  'paid',
  'not applicable',
  'n/a',
]);

const CLOSED_CORR_STATUSES = new Set(['completed', 'no action required', 'cancelled']);

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function addMonthsToYearMonth(
  year: number,
  month1Based: number,
  deltaMonths: number
): { year: number; month: number } {
  const zeroBased = year * 12 + (month1Based - 1) + deltaMonths;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return { year: targetYear, month: targetMonth };
}

function isJobOpen(job: TaxJob): boolean {
  const s = (job.status || '').trim().toLowerCase();
  return !CLOSED_JOB_STATUSES.has(s);
}

function getEffectiveJobDeadline(job: TaxJob): string {
  const candidates = [job.finalApplicableDeadline, job.dueDate, job.internalDeadline];
  for (const c of candidates) {
    if (isIsoDateString(c)) return c!.trim();
  }
  return '';
}

function daysBetweenIso(earlierIso: string, laterIso: string): number {
  const d1 = new Date(`${earlierIso}T00:00:00Z`).getTime();
  const d2 = new Date(`${laterIso}T00:00:00Z`).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 0;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function isActiveCorporateClient(status: string | undefined, category: string | undefined): boolean {
  if (category !== 'Corporate') return false;
  const s = (status || '').trim().toLowerCase();
  return s === '' || s === 'active' || s === 're-appoint';
}

type PanelKey = 'cp204' | 'formC' | 'overdueJobs' | 'overdueCorr';

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { staffProfile } = useAuth();
  const {
    clients,
    jobs,
    cp204Records,
    correspondenceRecords,
    refreshAll,
    refreshing,
    lastRefreshedAt,
  } = useData();

  const [quickSearch, setQuickSearch] = useState('');
  const [timelineNonce, setTimelineNonce] = useState(0);
  const [openPanels, setOpenPanels] = useState<Record<PanelKey, boolean>>({
    cp204: true,
    formC: true,
    overdueJobs: true,
    overdueCorr: true,
  });

  const now = useMemo(() => new Date(), [timelineNonce]);
  const todayStr = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1..12
  const currentMonthLabel = `${MONTH_SHORT_NAMES[currentMonth - 1]} ${currentYear}`;
  const myStaffName = (staffProfile?.staffName || '').trim().toLowerCase();

  const allCollapsed = Object.values(openPanels).every((v) => !v);
  const togglePanel = (key: PanelKey) =>
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  const setAllPanels = (open: boolean) =>
    setOpenPanels({ cp204: open, formC: open, overdueJobs: open, overdueCorr: open });

  const handleRefreshTimeline = () => {
    setTimelineNonce((n) => n + 1);
    refreshAll();
  };

  // Active Corporate clients list
  const activeCorporateClients = useMemo(
    () => clients.filter((c) => isActiveCorporateClient(c.clientStatus, c.category)),
    [clients]
  );

  // Open jobs + Overdue + Due Today + My Work Today
  const {
    myWorkTodayCount,
    myOverdueCount,
    allOverdueJobs,
    dueTodayCount,
    overdueCorrespondence,
  } = useMemo(() => {
    const openJobs = jobs.filter(isJobOpen);
    const overdue: Array<TaxJob & { effectiveDeadline: string; daysOverdue: number }> = [];
    let dueToday = 0;
    let myWork = 0;
    let myOverdue = 0;

    for (const j of openJobs) {
      const dl = getEffectiveJobDeadline(j);
      const isOverdue = Boolean(dl && dl < todayStr);
      const isDueToday = Boolean(dl && dl === todayStr);
      const isMine =
        Boolean(myStaffName) &&
        ((j.taxPic || '').trim().toLowerCase() === myStaffName ||
          (j.reviewer || '').trim().toLowerCase() === myStaffName);

      if (isOverdue) {
        overdue.push({
          ...j,
          effectiveDeadline: dl,
          daysOverdue: daysBetweenIso(dl, todayStr),
        });
      }
      if (isDueToday) dueToday += 1;
      if (isMine) {
        myWork += 1;
        if (isOverdue) myOverdue += 1;
      }
    }

    // Most recently overdue open jobs first (latest effectiveDeadline descending)
    overdue.sort((a, b) => b.effectiveDeadline.localeCompare(a.effectiveDeadline));

    const overdueCorr = correspondenceRecords
      .filter((c) => {
        const statusLower = (c.actionStatus || '').trim().toLowerCase();
        if (CLOSED_CORR_STATUSES.has(statusLower)) return false;
        return isIsoDateString(c.dueDate) && c.dueDate < todayStr;
      })
      .map((c) => ({
        ...c,
        daysOverdue: daysBetweenIso(c.dueDate, todayStr),
      }))
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

    return {
      myWorkTodayCount: myWork,
      myOverdueCount: myOverdue,
      allOverdueJobs: overdue,
      dueTodayCount: dueToday,
      overdueCorrespondence: overdueCorr,
    };
  }, [jobs, correspondenceRecords, todayStr, myStaffName]);

  // 1. Current Month Focus — CP204 / CP204A Timeline
  const cp204TimelineRows = useMemo(() => {
    const defs = [
      { category: 'CP204 Initial', offsetMonths: 13 },
      { category: 'CP204A 6th', offsetMonths: 6 },
      { category: 'CP204A 9th', offsetMonths: 3 },
      { category: 'CP204A 11th', offsetMonths: 1 },
    ];

    return defs.map((def) => {
      const target = addMonthsToYearMonth(currentYear, currentMonth, def.offsetMonths);
      const fyeMonthStr = String(target.month).padStart(2, '0');
      const targetYa = String(target.year);

      const matchingClients = activeCorporateClients.filter(
        (c) => extractFyeMonth(c.fye) === target.month
      );

      // Match against cp204Records for targetYa & fyeMonth
      const trackedClientIds = new Set<string>();
      for (const rec of cp204Records) {
        const recFye = extractFyeMonth(rec.fye);
        if (rec.ya.trim() === targetYa && recFye === target.month) {
          trackedClientIds.add(rec.clientId.trim().toLowerCase());
        }
      }

      const companiesCount = matchingClients.length;
      const foundCount = matchingClients.filter((c) =>
        trackedClientIds.has(c.clientId.trim().toLowerCase())
      ).length;

      let trackerStatus: 'Tracker records found' | 'Some tracker records missing' | 'No tracker records';
      if (companiesCount === 0 || foundCount === 0) {
        trackerStatus = 'No tracker records';
      } else if (foundCount >= companiesCount) {
        trackerStatus = 'Tracker records found';
      } else {
        trackerStatus = 'Some tracker records missing';
      }

      return {
        category: def.category,
        fyeMonth: target.month,
        fyeMonthStr,
        targetYa,
        dueMonth: currentMonthLabel,
        companiesCount,
        foundCount,
        trackerStatus,
      };
    });
  }, [activeCorporateClients, cp204Records, currentYear, currentMonth, currentMonthLabel]);

  // 2. Current Month Focus — Form C & MITRS Timeline
  const formCMitrsTimelineRows = useMemo(() => {
    const defs = [
      { category: 'Form C' as const, backMonths: 8 },
      { category: 'MITRS' as const, backMonths: 9 },
    ];

    return defs.map((def) => {
      // Form C: FYE + 8m === currentMonth; MITRS: FYE + 9m === currentMonth
      const target = addMonthsToYearMonth(currentYear, currentMonth, -def.backMonths);
      const fyeMonthStr = String(target.month).padStart(2, '0');
      const targetYa = String(target.year);

      const matchingClients = activeCorporateClients.filter(
        (c) => extractFyeMonth(c.fye) === target.month
      );

      // Corporate / Form C jobs for that YA
      const corpJobsByClient = new Map<string, TaxJob>();
      for (const j of jobs) {
        const isCorp =
          j.module === 'Corporate' || j.jobType === 'Form C' || j.jobType === 'MITRS';
        if (!isCorp) continue;
        if ((j.ya || '').trim() !== targetYa) continue;
        const jobFye = extractFyeMonth(j.fye);
        if (jobFye !== null && jobFye !== target.month) continue;
        if (j.clientId) {
          corpJobsByClient.set(j.clientId.trim().toLowerCase(), j);
        }
      }

      const companiesCount = matchingClients.length;
      let submittedCount = 0;

      for (const c of matchingClients) {
        const job = corpJobsByClient.get(c.clientId.trim().toLowerCase());
        if (!job) continue;
        if (def.category === 'Form C') {
          const fcDone =
            (job.formCStatus || '').trim().toLowerCase() === 'submitted' ||
            (job.status || '').trim().toLowerCase() === 'completed';
          if (fcDone) submittedCount += 1;
        } else {
          const mitrsDone =
            (job.mitrsStatus || '').trim().toLowerCase() === 'submitted' ||
            (job.status || '').trim().toLowerCase() === 'completed';
          if (mitrsDone) submittedCount += 1;
        }
      }

      let trackerStatus: 'All submitted' | 'Pending' | 'Mixed status';
      if (companiesCount === 0 || submittedCount === 0) {
        trackerStatus = 'Pending';
      } else if (submittedCount >= companiesCount) {
        trackerStatus = 'All submitted';
      } else {
        trackerStatus = 'Mixed status';
      }

      return {
        category: def.category,
        fyeMonth: target.month,
        fyeMonthStr,
        targetYa,
        dueMonth: currentMonthLabel,
        companiesCount,
        submittedCount,
        trackerStatus,
      };
    });
  }, [activeCorporateClients, jobs, currentYear, currentMonth, currentMonthLabel]);

  // Apply quick search across tables
  const q = quickSearch.trim().toLowerCase();

  const visibleOverdueJobs = useMemo(() => {
    const filtered = q
      ? allOverdueJobs.filter((j) =>
          [j.clientName, j.clientId, j.jobCode, j.jobType, j.ya, j.taxPic, j.status]
            .join(' ')
            .toLowerCase()
            .includes(q)
        )
      : allOverdueJobs;
    return filtered.slice(0, 10);
  }, [allOverdueJobs, q]);

  const visibleOverdueCorr = useMemo(() => {
    if (!q) return overdueCorrespondence;
    return overdueCorrespondence.filter((c) =>
      [
        c.correspondenceId,
        c.clientName,
        c.category,
        c.letterType,
        c.letterSubject,
        c.pic,
        c.actionStatus,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [overdueCorrespondence, q]);

  const visibleCp204Timeline = useMemo(() => {
    if (!q) return cp204TimelineRows;
    return cp204TimelineRows.filter((r) =>
      `${r.category} FYE ${r.fyeMonth} YA ${r.targetYa} ${r.dueMonth} ${r.trackerStatus}`
        .toLowerCase()
        .includes(q)
    );
  }, [cp204TimelineRows, q]);

  const visibleFormCTimeline = useMemo(() => {
    if (!q) return formCMitrsTimelineRows;
    return formCMitrsTimelineRows.filter((r) =>
      `${r.category} FYE ${r.fyeMonth} YA ${r.targetYa} ${r.dueMonth} ${r.trackerStatus}`
        .toLowerCase()
        .includes(q)
    );
  }, [formCMitrsTimelineRows, q]);

  return (
    <div className="space-y-4">
      {/* Header + Quick Search + Collapse/Expand Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Practice Dashboard</h1>
          <p className="text-xs text-slate-500">
            Current Month Focus ({currentMonthLabel}) & overdue compliance action queue.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Quick search dashboard..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
            />
          </div>
          <button
            type="button"
            onClick={() => setAllPanels(allCollapsed)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            {allCollapsed ? (
              <>
                <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
                Expand all
              </>
            ) : (
              <>
                <ChevronsDownUp className="w-3.5 h-3.5 text-slate-500" />
                Collapse all
              </>
            )}
          </button>
        </div>
      </div>

      {/* Top 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() =>
            onNavigate('all-jobs', staffProfile?.staffName ? { search: staffProfile.staffName } : undefined)
          }
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-teal-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              My Work Today
            </span>
            <Briefcase className="w-4 h-4 text-teal-700" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {myWorkTodayCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Open jobs assigned to you
            {myOverdueCount > 0 ? (
              <span className="text-rose-700 font-medium"> • {myOverdueCount} overdue</span>
            ) : null}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('all-jobs')}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-rose-300 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Overdue Jobs
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-rose-700">
            {allOverdueJobs.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Open jobs past Final Applicable Deadline
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('all-jobs')}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Due Today
            </span>
            <CalendarClock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-700">
            {dueTodayCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Deadlines falling on {formatDateDDMMYYYY(todayStr)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('correspondence')}
          className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-rose-300 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Overdue Correspondence
            </span>
            <MailWarning className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-rose-700">
            {overdueCorrespondence.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            LHDN / SSM / client letters past due date
          </div>
        </button>
      </div>

      {/* Collapsible Panel 1: Current Month Focus — CP204 / CP204A Timeline */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Current Month Focus — CP204 / CP204A Timeline
            </h2>
            <p className="text-[11px] text-slate-500">
              Active corporate clients with CP204 Initial or Revision due in {currentMonthLabel}.
              {lastRefreshedAt ? ` Updated ${lastRefreshedAt.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}.` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshTimeline}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh timeline
            </button>
            <button
              type="button"
              onClick={() => togglePanel('cp204')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
            >
              {openPanels.cp204 ? (
                <>
                  Hide <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Show <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {openPanels.cp204 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/70 border-b border-slate-200">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 px-4">Category</th>
                  <th className="py-2 px-4">FYE</th>
                  <th className="py-2 px-4">Due Month</th>
                  <th className="py-2 px-4 text-right">Companies</th>
                  <th className="py-2 px-4">Tracker status</th>
                  <th className="py-2 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {visibleCp204Timeline.map((row) => {
                  const statusClass =
                    row.trackerStatus === 'Tracker records found'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : row.trackerStatus === 'Some tracker records missing'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200';
                  return (
                    <tr key={row.category} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {row.category}
                        <span className="ml-2 text-[10px] font-mono text-slate-400">
                          YA {row.targetYa}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        Month {row.fyeMonth} ({MONTH_SHORT_NAMES[row.fyeMonth - 1]})
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                        {row.dueMonth}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {row.companiesCount}
                        {row.companiesCount > 0 && (
                          <span className="text-[10px] font-normal text-slate-400 ml-1">
                            ({row.foundCount} tracked)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${statusClass}`}
                        >
                          {row.trackerStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate('cp204', { fye: row.fyeMonthStr, ya: row.targetYa })
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline"
                        >
                          View companies
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Collapsible Panel 2: Current Month Focus — Form C & MITRS Timeline */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Current Month Focus — Form C & MITRS Timeline
            </h2>
            <p className="text-[11px] text-slate-500">
              Form C (FYE + 8 months) and MITRS (FYE + 9 months, statutory timeline) due in{' '}
              {currentMonthLabel}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshTimeline}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh timeline
            </button>
            <button
              type="button"
              onClick={() => togglePanel('formC')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
            >
              {openPanels.formC ? (
                <>
                  Hide <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Show <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {openPanels.formC && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/70 border-b border-slate-200">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 px-4">Category</th>
                  <th className="py-2 px-4">FYE</th>
                  <th className="py-2 px-4">Due Month</th>
                  <th className="py-2 px-4 text-right">Companies</th>
                  <th className="py-2 px-4">Tracker status</th>
                  <th className="py-2 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {visibleFormCTimeline.map((row) => {
                  const statusClass =
                    row.trackerStatus === 'All submitted'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : row.trackerStatus === 'Mixed status'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200';
                  return (
                    <tr key={row.category} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {row.category}
                        <span className="ml-2 text-[10px] font-mono text-slate-400">
                          YA {row.targetYa}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {row.fyeMonth} ({MONTH_SHORT_NAMES[row.fyeMonth - 1]})
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                        {row.dueMonth}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {row.companiesCount}
                        {row.companiesCount > 0 && (
                          <span className="text-[10px] font-normal text-slate-400 ml-1">
                            ({row.submittedCount} submitted)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${statusClass}`}
                        >
                          {row.trackerStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate('corporate', { fye: row.fyeMonthStr, ya: row.targetYa })
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline"
                        >
                          View companies
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bottom 2 Collapsible Tables: Overdue Jobs (Top 10) & Overdue Correspondence */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Overdue Jobs (Top 10 Most Recently Overdue) */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Overdue Jobs{' '}
                <span className="text-xs font-mono font-normal text-rose-700">
                  (Top 10 most recent of {allOverdueJobs.length})
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('all-jobs')}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap"
              >
                All Jobs <ExternalLink className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => togglePanel('overdueJobs')}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
              >
                {openPanels.overdueJobs ? 'Hide' : 'Show'}
                {openPanels.overdueJobs ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {openPanels.overdueJobs && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/70 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2 px-3">Client</th>
                    <th className="py-2 px-3">Job / YA</th>
                    <th className="py-2 px-3">PIC</th>
                    <th className="py-2 px-3">Deadline</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {visibleOverdueJobs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No overdue open jobs found.
                      </td>
                    </tr>
                  ) : (
                    visibleOverdueJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <div className="font-medium text-slate-900 leading-tight">
                            {job.clientName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">{job.jobCode}</div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-slate-700">
                          <div>{job.jobType || job.module}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            YA {job.ya || '—'}
                          </div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                          {job.taxPic || '—'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="font-mono tabular-nums text-rose-700 font-medium">
                            {formatDateDDMMYYYY(job.effectiveDeadline)}
                          </div>
                          <div className="text-[10px] font-mono text-rose-600">
                            {job.daysOverdue}d overdue
                          </div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                            {job.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Overdue Correspondence */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Overdue Correspondence{' '}
                <span className="text-xs font-mono font-normal text-rose-700">
                  ({overdueCorrespondence.length})
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('correspondence')}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap"
              >
                Correspondence <ExternalLink className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => togglePanel('overdueCorr')}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
              >
                {openPanels.overdueCorr ? 'Hide' : 'Show'}
                {openPanels.overdueCorr ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {openPanels.overdueCorr && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/70 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2 px-3">Client / Ref</th>
                    <th className="py-2 px-3">Subject</th>
                    <th className="py-2 px-3">PIC</th>
                    <th className="py-2 px-3">Due Date</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {visibleOverdueCorr.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No overdue correspondence items.
                      </td>
                    </tr>
                  ) : (
                    visibleOverdueCorr.slice(0, 10).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <div className="font-medium text-slate-900 leading-tight">
                            {item.clientName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {item.correspondenceId} • {item.category}
                          </div>
                        </td>
                        <td className="py-2 px-3 max-w-[200px]">
                          <div className="truncate text-slate-800" title={item.letterSubject}>
                            {item.letterSubject || item.letterType}
                          </div>
                          <div className="text-[10px] text-slate-400">{item.letterType}</div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                          {item.pic || '—'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="font-mono tabular-nums text-rose-700 font-medium">
                            {formatDateDDMMYYYY(item.dueDate)}
                          </div>
                          <div className="text-[10px] font-mono text-rose-600">
                            {item.daysOverdue}d overdue
                          </div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium">
                            {item.actionStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
