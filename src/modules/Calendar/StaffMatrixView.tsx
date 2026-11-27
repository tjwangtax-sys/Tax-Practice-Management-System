import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Eraser,
  ExternalLink,
  Info,
  MousePointerClick,
  Paintbrush,
  Users,
} from 'lucide-react';
import {
  ClientRecord,
  Cp204Record,
  NavigationFilterPreset,
  NavRoute,
  StaffMember,
  TaxJob,
} from '../../types/tpms';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';
import {
  computeOpenJobsByStaff,
  computeStaffDeadlineCollisions,
  DeadlineCollisionItem,
  EVENT_TYPE_DEFAULT_COLORS,
  eventCoversDate,
  formatClientChipLabel,
  formatShortDayMonth,
  getContrastingTextColor,
  getMonthDays,
  isPeakFilingDate,
  PaintTool,
  ParsedCalendarEvent,
  PeakCoverageAlert,
  PublicHolidayRef,
  StaffMatrixRowSummary,
  toIsoDate,
} from './calendarUtils';

interface StaffMatrixViewProps {
  year: number;
  monthIndex: number;
  includeWeekends: boolean;
  onToggleWeekends: () => void;
  showPoolAccounts: boolean;
  onTogglePoolAccounts: () => void;
  canTogglePoolAccounts: boolean;
  poolAccountCount: number;
  activeStaff: StaffMember[];
  parsedEvents: ParsedCalendarEvent[];
  holidaysByDate: Map<string, PublicHolidayRef>;
  jobs: TaxJob[];
  cp204Records: Cp204Record[];
  clients: ClientRecord[];
  isReadOnly: boolean;
  onCellSelectModal: (staffName: string, isoDate: string, existingEvent?: ParsedCalendarEvent) => void;
  onPaintRange: (staffName: string, startIso: string, endIso: string, tool: Exclude<PaintTool, 'select'>) => Promise<void>;
  onNavigate?: (route: NavRoute, preset?: Omit<NavigationFilterPreset, 'nonce'>) => void;
}

const PAINT_TOOLS: Array<{
  id: PaintTool;
  label: string;
  hint: string;
  swatch?: string;
}> = [
  { id: 'select', label: 'Select / Modal', hint: 'Click any cell to open full event modal' },
  { id: 'AL', label: 'AL', hint: 'Annual Leave (1.0 day)', swatch: '#22d3ee' },
  { id: '1/2 AL', label: '1/2 AL', hint: 'Half-Day Annual Leave (0.5 day)', swatch: '#67e8f9' },
  { id: 'SL', label: 'SL', hint: 'Sick / Study Leave (1.0 day)', swatch: '#22d3ee' },
  { id: 'MC', label: 'MC', hint: 'Medical Certificate (1.0 day)', swatch: '#22d3ee' },
  { id: 'RL', label: 'RL', hint: 'Replacement Leave (1.0 day)', swatch: '#fb923c' },
  { id: 'UPL', label: 'UPL', hint: 'Unpaid Leave (1.0 day)', swatch: '#f472b6' },
  { id: 'WFH', label: 'WFH', hint: 'Work From Home (0 leave deduction)', swatch: '#86efac' },
  { id: 'clear', label: 'Clear', hint: 'Drag across cells to remove staff events' },
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const StaffMatrixView: React.FC<StaffMatrixViewProps> = ({
  year,
  monthIndex,
  includeWeekends,
  onToggleWeekends,
  showPoolAccounts,
  onTogglePoolAccounts,
  canTogglePoolAccounts,
  poolAccountCount,
  activeStaff,
  parsedEvents,
  holidaysByDate,
  jobs,
  cp204Records,
  clients,
  isReadOnly,
  onCellSelectModal,
  onPaintRange,
  onNavigate,
}) => {
  const [activeTool, setActiveTool] = useState<PaintTool>('select');
  const [dragState, setDragState] = useState<{
    staffName: string;
    anchorIso: string;
    currentIso: string;
  } | null>(null);
  const [paintingBusy, setPaintingBusy] = useState(false);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const days = useMemo(
    () => getMonthDays(year, monthIndex, includeWeekends),
    [year, monthIndex, includeWeekends]
  );

  // All Mon-Fri weekdays in the selected month (always used for Work Days capacity calculation)
  const monthWeekdays = useMemo(() => getMonthDays(year, monthIndex, false), [year, monthIndex]);

  const clientsById = useMemo(() => {
    const map = new Map<string, ClientRecord>();
    for (const c of clients) {
      if (c.clientId) map.set(c.clientId.trim().toLowerCase(), c);
    }
    return map;
  }, [clients]);

  const openJobsByStaff = useMemo(() => computeOpenJobsByStaff(jobs), [jobs]);

  // Identify Company Holiday & Firm-Wide Internal Events per date
  const companyHolidayByDate = useMemo(() => {
    const map = new Map<string, ParsedCalendarEvent>();
    for (const d of days) {
      const iso = toIsoDate(d);
      const found = parsedEvents.find(
        (e) => e.canonicalType === 'Company Holiday' && eventCoversDate(e.raw, iso)
      );
      if (found) map.set(iso, found);
    }
    return map;
  }, [days, parsedEvents]);

  const firmWideEventsByDate = useMemo(() => {
    const map = new Map<string, ParsedCalendarEvent[]>();
    for (const d of days) {
      const iso = toIsoDate(d);
      const list = parsedEvents.filter(
        (e) => e.isFirmWide && e.canonicalType === 'Internal Event' && eventCoversDate(e.raw, iso)
      );
      if (list.length > 0) map.set(iso, list);
    }
    return map;
  }, [days, parsedEvents]);

  // All events indexed by staffLower -> isoDate -> ParsedCalendarEvent[]
  const staffDayEventsMap = useMemo(() => {
    const outer = new Map<string, Map<string, ParsedCalendarEvent[]>>();
    for (const s of activeStaff) {
      outer.set(s.staffName.trim().toLowerCase(), new Map());
    }

    for (const d of days) {
      const iso = toIsoDate(d);
      for (const ev of parsedEvents) {
        if (ev.canonicalType === 'Company Holiday' || ev.isFirmWide) continue;
        if (!eventCoversDate(ev.raw, iso)) continue;
        const staffKey = ev.staffName.trim().toLowerCase();
        if (!staffKey || !outer.has(staffKey)) continue;
        const inner = outer.get(staffKey)!;
        const arr = inner.get(iso) ?? [];
        arr.push(ev);
        inner.set(iso, arr);
      }
    }
    return outer;
  }, [activeStaff, days, parsedEvents]);

  // Compute Work Days, Leave, and Open Jobs for each staff row
  const rowSummaries = useMemo<StaffMatrixRowSummary[]>(() => {
    // Count weekday holidays (Johor/Federal PH or Company Holiday events)
    let weekdayHolidayCount = 0;
    const weekdayHolidaySet = new Set<string>();
    for (const wd of monthWeekdays) {
      const iso = toIsoDate(wd);
      const isPh = holidaysByDate.has(iso);
      const isCompHol = parsedEvents.some(
        (e) => e.canonicalType === 'Company Holiday' && eventCoversDate(e.raw, iso)
      );
      if (isPh || isCompHol) {
        weekdayHolidayCount += 1;
        weekdayHolidaySet.add(iso);
      }
    }

    const baseWorkingDays = Math.max(0, monthWeekdays.length - weekdayHolidayCount);

    return activeStaff.map((s) => {
      const staffKey = s.staffName.trim().toLowerCase();
      let leaveDays = 0;
      for (const wd of monthWeekdays) {
        const iso = toIsoDate(wd);
        if (weekdayHolidaySet.has(iso)) continue;
        // Find max leave weight on this weekday for this staff
        let dayWeight = 0;
        for (const ev of parsedEvents) {
          if (ev.canonicalType !== 'Staff Availability') continue;
          if (ev.staffName.trim().toLowerCase() !== staffKey) continue;
          if (!eventCoversDate(ev.raw, iso)) continue;
          if (ev.leaveWeight > dayWeight) dayWeight = ev.leaveWeight;
        }
        leaveDays += dayWeight;
      }

      const workDays = Math.max(0, Math.round((baseWorkingDays - leaveDays) * 10) / 10);
      const openJobs = openJobsByStaff.get(staffKey) ?? 0;
      return {
        staff: s,
        workDays,
        leaveDays: Math.round(leaveDays * 10) / 10,
        openJobs,
      };
    });
  }, [activeStaff, monthWeekdays, holidaysByDate, parsedEvents, openJobsByStaff]);

  // Tax Deadline Collision map: `${staffLower}|${iso}` -> DeadlineCollisionItem[]
  const collisionMap = useMemo(() => {
    const map = new Map<string, DeadlineCollisionItem[]>();
    for (const s of activeStaff) {
      const staffKey = s.staffName.trim().toLowerCase();
      const inner = staffDayEventsMap.get(staffKey);
      if (!inner) continue;

      for (const [iso, evList] of inner.entries()) {
        const hasDeductibleLeave = evList.some(
          (e) => e.canonicalType === 'Staff Availability' && e.leaveWeight > 0
        );
        if (!hasDeductibleLeave) continue;

        const collisions = computeStaffDeadlineCollisions(s.staffName, iso, jobs, cp204Records);
        if (collisions.length > 0) {
          map.set(`${staffKey}|${iso}`, collisions);
        }
      }
    }
    return map;
  }, [activeStaff, staffDayEventsMap, jobs, cp204Records]);

  // Peak-Day Coverage Alerts (>30% of active staff away on the same day)
  const peakCoverageAlerts = useMemo<PeakCoverageAlert[]>(() => {
    const total = activeStaff.length;
    if (total === 0) return [];
    const alerts: PeakCoverageAlert[] = [];

    for (const d of monthWeekdays) {
      const iso = toIsoDate(d);
      if (holidaysByDate.has(iso) || companyHolidayByDate.has(iso)) continue;

      const awayNames: string[] = [];
      for (const s of activeStaff) {
        const staffKey = s.staffName.trim().toLowerCase();
        const evList = staffDayEventsMap.get(staffKey)?.get(iso) ?? [];
        const isAway = evList.some(
          (e) => e.canonicalType === 'Staff Availability' && e.leaveWeight > 0
        );
        if (isAway) awayNames.push(s.staffName);
      }

      const pct = Math.round((awayNames.length / total) * 100);
      if (awayNames.length / total > 0.3) {
        alerts.push({
          date: iso,
          label: formatShortDayMonth(d),
          awayCount: awayNames.length,
          totalStaff: total,
          percentage: pct,
          awayStaffNames: awayNames,
          isPeakFilingDay: isPeakFilingDate(iso),
        });
      }
    }
    return alerts;
  }, [activeStaff, monthWeekdays, holidaysByDate, companyHolidayByDate, staffDayEventsMap]);

  // Monthly Event Notes for the footer bar (Firm-wide Internal Events + Company Holidays + PH)
  const monthlyNotes = useMemo(() => {
    const monthStart = toIsoDate(new Date(year, monthIndex, 1));
    const monthEnd = toIsoDate(new Date(year, monthIndex + 1, 0));

    const firmEvents = parsedEvents.filter(
      (e) =>
        (e.isFirmWide || e.canonicalType === 'Company Holiday') &&
        e.raw.startDate <= monthEnd &&
        (e.raw.endDate || e.raw.startDate) >= monthStart
    );

    const phs = Array.from(holidaysByDate.values())
      .filter((h) => h.date >= monthStart && h.date <= monthEnd)
      .sort((a, b) => a.date.localeCompare(b.date));

    return { firmEvents, phs };
  }, [year, monthIndex, parsedEvents, holidaysByDate]);

  // Global mouseup to finalize drag-to-paint
  useEffect(() => {
    if (!dragState) return;
    const handleMouseUp = () => {
      const { staffName, anchorIso, currentIso } = dragState;
      const tool = activeTool;
      setDragState(null);
      if (tool === 'select' || isReadOnly) return;

      const startIso = anchorIso <= currentIso ? anchorIso : currentIso;
      const endIso = anchorIso <= currentIso ? currentIso : anchorIso;

      setPaintingBusy(true);
      void onPaintRange(staffName, startIso, endIso, tool).finally(() => {
        setPaintingBusy(false);
      });
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [dragState, activeTool, isReadOnly, onPaintRange]);

  const isCellInDragRange = (staffName: string, iso: string): boolean => {
    if (!dragState || dragState.staffName !== staffName) return false;
    const start = dragState.anchorIso <= dragState.currentIso ? dragState.anchorIso : dragState.currentIso;
    const end = dragState.anchorIso <= dragState.currentIso ? dragState.currentIso : dragState.anchorIso;
    return iso >= start && iso <= end;
  };

  const monthHeaderLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-MY', {
    month: 'short',
    year: 'numeric',
  });

  // Week divider: right border after Friday (dow === 5) when Mon–Fri, or after Sunday (dow === 0) when weekends included
  const isEndOfWeek = (d: Date, idx: number): boolean => {
    if (idx === days.length - 1) return false;
    return includeWeekends ? d.getDay() === 0 : d.getDay() === 5;
  };

  return (
    <div className="space-y-3 select-none">
      {/* Peak-Day Coverage Alert Banner (>30% away) */}
      {peakCoverageAlerts.length > 0 && (
        <div className="px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Team Coverage Alert (&gt;30% staff away): </span>
              {peakCoverageAlerts.map((a, idx) => (
                <span key={a.date} className="inline-block mr-2">
                  <strong className={a.isPeakFilingDay ? 'text-rose-700' : 'text-amber-900'}>
                    {a.label}
                    {a.isPeakFilingDay ? ' [Peak Filing]' : ''}
                  </strong>{' '}
                  ({a.awayCount}/{a.totalStaff} · {a.percentage}% — {a.awayStaffNames.join(', ')})
                  {idx < peakCoverageAlerts.length - 1 ? ';' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick-Paint Drag Toolbar + Weekend Toggle */}
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 mr-1">
            <Paintbrush className="w-3.5 h-3.5 text-teal-700" />
            Quick-Paint:
          </span>
          {PAINT_TOOLS.map((tool) => {
            const active = activeTool === tool.id;
            const disabled = isReadOnly && tool.id !== 'select';
            return (
              <button
                key={tool.id}
                type="button"
                disabled={disabled || paintingBusy}
                onClick={() => setActiveTool(tool.id)}
                title={tool.hint}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                  active
                    ? tool.id === 'clear'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-teal-700 text-white border-teal-700'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tool.id === 'select' && <MousePointerClick className="w-3 h-3" />}
                {tool.id === 'clear' && <Eraser className="w-3 h-3" />}
                {tool.swatch && (
                  <span
                    className="w-2.5 h-2.5 rounded-xs border border-slate-900/20 shrink-0"
                    style={{ backgroundColor: tool.swatch }}
                  />
                )}
                {tool.label}
              </button>
            );
          })}
          {paintingBusy && (
            <span className="text-[11px] text-teal-700 font-medium ml-1">Saving...</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeWeekends}
              onChange={onToggleWeekends}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            Include Weekends
          </label>
          {canTogglePoolAccounts && (
            <label
              className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer whitespace-nowrap"
              title="Include non-login pool accounts (blank email / noLogin), Report Viewers, and generic ADM to inspect their open job counts"
            >
              <input
                type="checkbox"
                checked={showPoolAccounts}
                onChange={onTogglePoolAccounts}
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              Show Pool / System Accounts
              {poolAccountCount > 0 && (
                <span className="text-[11px] font-mono text-slate-400">({poolAccountCount})</span>
              )}
            </label>
          )}
          <span className="text-[11px] text-slate-500 hidden xl:inline">
            {activeTool === 'select'
              ? 'Click any cell to open full event modal'
              : activeTool === 'clear'
              ? 'Click or drag across a staff row to clear cells'
              : `Click or drag across a staff row to paint "${activeTool}"`}
          </span>
        </div>
      </div>

      {/* Main Matrix Grid */}
      <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
        {activeStaff.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            No active staff members found in Staff Directory.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[68vh]">
            <table className="border-collapse w-max min-w-full text-xs">
              {/* Two-Row Green Header (#16a34a) */}
              <thead className="sticky top-0 z-30">
                <tr className="bg-[#16a34a] text-white">
                  <th
                    colSpan={4}
                    className="sticky left-0 z-40 bg-[#15803d] px-3 py-1.5 text-left font-bold text-xs tracking-wide border-b border-r-2 border-slate-800 whitespace-nowrap"
                    style={{ width: 340, minWidth: 340 }}
                  >
                    <div className="flex items-center justify-between">
                      <span>{monthHeaderLabel}</span>
                      <span className="text-[10px] font-normal text-emerald-100">
                        Johor / MY Matrix
                      </span>
                    </div>
                  </th>
                  {days.map((d, idx) => {
                    const iso = toIsoDate(d);
                    const dow = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isToday = iso === todayIso;
                    const weekEndDivider = isEndOfWeek(d, idx);
                    return (
                      <th
                        key={`dow-${iso}`}
                        className={`px-1 py-1 text-center text-[10px] font-semibold border-b border-emerald-700/70 ${
                          weekEndDivider ? 'border-r-2 border-r-slate-800' : 'border-r border-r-emerald-700/60'
                        } ${
                          isToday
                            ? 'bg-emerald-900 text-amber-200'
                            : isWeekend
                            ? 'bg-[#15803d]/90 text-emerald-100'
                            : 'bg-[#16a34a] text-white'
                        }`}
                        style={{ minWidth: 58, width: 58 }}
                      >
                        {WEEKDAY_SHORT[dow]}
                      </th>
                    );
                  })}
                </tr>

                <tr className="bg-[#16a34a] text-white">
                  <th
                    className="sticky left-0 z-40 bg-[#16a34a] px-3 py-1.5 text-left text-[11px] font-bold border-b-2 border-b-slate-800 border-r border-r-emerald-700/70 whitespace-nowrap"
                    style={{ width: 172, minWidth: 172, maxWidth: 172 }}
                  >
                    Staff
                  </th>
                  <th
                    className="sticky z-40 bg-[#16a34a] px-1.5 py-1.5 text-right text-[10px] font-bold border-b-2 border-b-slate-800 border-r border-r-emerald-700/70 whitespace-nowrap"
                    style={{ left: 172, width: 56, minWidth: 56, maxWidth: 56 }}
                    title="Net working weekdays in month (weekdays minus holidays & leave)"
                  >
                    Work
                  </th>
                  <th
                    className="sticky z-40 bg-[#16a34a] px-1.5 py-1.5 text-right text-[10px] font-bold border-b-2 border-b-slate-800 border-r border-r-emerald-700/70 whitespace-nowrap"
                    style={{ left: 228, width: 56, minWidth: 56, maxWidth: 56 }}
                    title="Leave days in month (1.0 per leave day, 0.5 if title starts with 1/2 or Half, 0 for WFH)"
                  >
                    Leave
                  </th>
                  <th
                    className="sticky z-40 bg-[#16a34a] px-1.5 py-1.5 text-right text-[10px] font-bold border-b-2 border-b-slate-800 border-r-2 border-r-slate-800 whitespace-nowrap"
                    style={{ left: 284, width: 56, minWidth: 56, maxWidth: 56 }}
                    title="Live count of active open jobs assigned to this PIC"
                  >
                    Jobs
                  </th>
                  {days.map((d, idx) => {
                    const iso = toIsoDate(d);
                    const dow = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isToday = iso === todayIso;
                    const weekEndDivider = isEndOfWeek(d, idx);
                    const isPeak = isPeakFilingDate(iso);
                    return (
                      <th
                        key={`dt-${iso}`}
                        className={`px-1 py-1 text-center text-[10px] font-mono tabular-nums font-semibold border-b-2 border-b-slate-800 whitespace-nowrap ${
                          weekEndDivider ? 'border-r-2 border-r-slate-800' : 'border-r border-r-emerald-700/60'
                        } ${
                          isToday
                            ? 'bg-emerald-900 text-amber-200 underline decoration-amber-300'
                            : isWeekend
                            ? 'bg-[#15803d]/90 text-emerald-100'
                            : 'bg-[#16a34a] text-white'
                        }`}
                        title={
                          isPeak
                            ? `${formatDateDDMMYYYY(iso)} — Peak LHDN filing date`
                            : formatDateDDMMYYYY(iso)
                        }
                      >
                        {formatShortDayMonth(d)}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {rowSummaries.map((summary, rowIdx) => {
                  const s = summary.staff;
                  const staffKey = s.staffName.trim().toLowerCase();
                  const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';

                  return (
                    <tr key={s.id} className={`${rowBg} hover:bg-teal-50/30`}>
                      {/* Sticky Left Columns */}
                      <td
                        className={`sticky left-0 z-20 ${rowBg} px-3 py-2 border-r border-slate-200 whitespace-nowrap`}
                        style={{ width: 172, minWidth: 172, maxWidth: 172 }}
                      >
                        <div className="font-semibold text-slate-900 truncate" title={s.staffName}>
                          {s.staffName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          {s.staffId}
                          {s.role ? ` · ${s.role}` : ''}
                        </div>
                      </td>
                      <td
                        className={`sticky z-20 ${rowBg} px-1.5 py-2 text-right font-mono tabular-nums font-semibold text-emerald-800 border-r border-slate-200 whitespace-nowrap`}
                        style={{ left: 172, width: 56, minWidth: 56, maxWidth: 56 }}
                      >
                        {summary.workDays}
                      </td>
                      <td
                        className={`sticky z-20 ${rowBg} px-1.5 py-2 text-right font-mono tabular-nums border-r border-slate-200 whitespace-nowrap ${
                          summary.leaveDays > 0 ? 'font-semibold text-cyan-800' : 'text-slate-400'
                        }`}
                        style={{ left: 228, width: 56, minWidth: 56, maxWidth: 56 }}
                      >
                        {summary.leaveDays}
                      </td>
                      <td
                        className={`sticky z-20 ${rowBg} px-1.5 py-2 text-right font-mono tabular-nums border-r-2 border-r-slate-800 whitespace-nowrap ${
                          summary.openJobs > 0 ? 'font-semibold text-slate-800' : 'text-slate-400'
                        }`}
                        style={{ left: 284, width: 56, minWidth: 56, maxWidth: 56 }}
                      >
                        {summary.openJobs}
                      </td>

                      {/* Date Cells */}
                      {days.map((d, colIdx) => {
                        const iso = toIsoDate(d);
                        const dow = d.getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        const weekEndDivider = isEndOfWeek(d, colIdx);
                        const rightBorderCls = weekEndDivider
                          ? 'border-r-2 border-r-slate-800'
                          : 'border-r border-r-slate-200';

                        // 1. Full-height Yellow Holiday Banner (Johor/Federal PH or Company Holiday)
                        const ph = holidaysByDate.get(iso);
                        const compHol = companyHolidayByDate.get(iso);
                        if (ph || compHol) {
                          if (rowIdx > 0) return null; // Covered by rowSpan from row 0
                          const bannerLabel = compHol ? compHol.cleanLabel : ph!.name;
                          const bannerColor = compHol?.color || EVENT_TYPE_DEFAULT_COLORS['Company Holiday'];
                          return (
                            <td
                              key={`hol-${iso}`}
                              rowSpan={rowSummaries.length}
                              onClick={() => {
                                if (compHol) {
                                  onCellSelectModal('', iso, compHol);
                                } else if (!isReadOnly) {
                                  onCellSelectModal('', iso);
                                }
                              }}
                              title={`${bannerLabel} (${formatDateDDMMYYYY(iso)})${
                                ph?.scope ? ` — ${ph.scope}` : ' — Company Holiday'
                              }`}
                              className={`p-1 text-center align-middle cursor-pointer transition-opacity hover:opacity-90 ${rightBorderCls}`}
                              style={{
                                backgroundColor: bannerColor,
                                color: getContrastingTextColor(bannerColor),
                              }}
                            >
                              <div className="flex items-center justify-center h-full min-h-[120px]">
                                <span
                                  className="font-bold text-[11px] tracking-wide whitespace-nowrap"
                                  style={{
                                    writingMode: 'vertical-rl',
                                    transform: 'rotate(180deg)',
                                  }}
                                >
                                  {bannerLabel}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        // 2. Normal Day Cell (may have Firm-Wide Magenta Seminar + Individual Leave / Client Appointments)
                        const firmEvents = firmWideEventsByDate.get(iso) ?? [];
                        const cellEvents = staffDayEventsMap.get(staffKey)?.get(iso) ?? [];
                        const collisions = collisionMap.get(`${staffKey}|${iso}`) ?? [];
                        const inDrag = isCellInDragRange(s.staffName, iso);

                        // Determine cell fill priority:
                        // Individual Staff Availability / Event color > Firm-Wide Magenta > Weekend tint > Default
                        const primaryLeave = cellEvents.find(
                          (e) => e.canonicalType === 'Staff Availability'
                        );
                        const clientAppointments = cellEvents.filter(
                          (e) =>
                            e.canonicalType === 'Client Appointment' ||
                            Boolean(e.raw.clientId || e.raw.clientName)
                        );
                        const otherPersonalEvents = cellEvents.filter(
                          (e) =>
                            e !== primaryLeave && !clientAppointments.includes(e)
                        );

                        let cellBg: string | undefined;
                        if (primaryLeave) {
                          cellBg =
                            primaryLeave.leaveCode === 'WFH' && primaryLeave.raw.color === '#22d3ee'
                              ? '#86efac'
                              : primaryLeave.color;
                        } else if (firmEvents.length > 0) {
                          cellBg = firmEvents[0].color || EVENT_TYPE_DEFAULT_COLORS['Internal Event'];
                        } else if (isWeekend) {
                          cellBg = '#f1f5f9';
                        }

                        const cellTextColor = cellBg ? getContrastingTextColor(cellBg) : undefined;
                        const hasCriticalCollision = collisions.some((c) => c.severity === 'critical');

                        const collisionTooltip = collisions
                          .map(
                            (c) =>
                              `${c.deadlineType}: ${c.clientName} (${c.refCode}) due ${formatDateDDMMYYYY(
                                c.dueDate
                              )}${c.daysAfterLeave === 0 ? ' [SAME DAY]' : ` (+${c.daysAfterLeave}d)`}`
                          )
                          .join('\n');

                        return (
                          <td
                            key={`${s.id}-${iso}`}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              if (activeTool === 'select') return;
                              if (isReadOnly) return;
                              e.preventDefault();
                              setDragState({
                                staffName: s.staffName,
                                anchorIso: iso,
                                currentIso: iso,
                              });
                            }}
                            onMouseEnter={() => {
                              if (dragState && dragState.staffName === s.staffName) {
                                setDragState((prev) =>
                                  prev ? { ...prev, currentIso: iso } : null
                                );
                              }
                            }}
                            onClick={() => {
                              if (activeTool !== 'select') return;
                              onCellSelectModal(s.staffName, iso, primaryLeave || otherPersonalEvents[0] || clientAppointments[0]);
                            }}
                            className={`relative p-1 align-top h-[46px] transition-shadow ${rightBorderCls} ${
                              activeTool === 'select' ? 'cursor-pointer' : 'cursor-crosshair'
                            } ${
                              inDrag
                                ? activeTool === 'clear'
                                  ? 'ring-2 ring-inset ring-rose-600 bg-rose-100/80'
                                  : 'ring-2 ring-inset ring-teal-700 bg-teal-100/70'
                                : ''
                            }`}
                            style={{
                              backgroundColor: inDrag ? undefined : cellBg,
                              color: inDrag ? undefined : cellTextColor,
                              minWidth: 58,
                              maxWidth: 112,
                            }}
                          >
                            {/* Tax Deadline Collision Badge (!) */}
                            {collisions.length > 0 && (
                              <span
                                title={`Tax Deadline Collision:\n${collisionTooltip}`}
                                className={`absolute top-0.5 right-0.5 z-10 w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-xs ${
                                  hasCriticalCollision ? 'bg-rose-600' : 'bg-amber-600'
                                }`}
                              >
                                !
                              </span>
                            )}

                            <div className="flex flex-col gap-0.5 min-h-[34px] justify-center">
                              {/* Primary Leave Label (AL, 1/2 AL, SL, MC, WFH) */}
                              {primaryLeave && (
                                <div
                                  className="text-[11px] font-bold text-center leading-tight truncate px-0.5"
                                  title={`${primaryLeave.displayTitle}${
                                    primaryLeave.raw.notes ? `\n${primaryLeave.raw.notes}` : ''
                                  }`}
                                >
                                  {primaryLeave.leaveCode || primaryLeave.cleanLabel}
                                </div>
                              )}

                              {/* Firm-Wide Internal Event / Seminar Tag */}
                              {firmEvents.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCellSelectModal('', iso, firmEvents[0]);
                                  }}
                                  title={`Firm Event: ${firmEvents.map((f) => f.cleanLabel).join(', ')}`}
                                  className="text-[10px] font-semibold text-center leading-tight truncate px-0.5 rounded hover:underline"
                                  style={{
                                    backgroundColor: primaryLeave
                                      ? firmEvents[0].color || '#f0abfc'
                                      : 'transparent',
                                    color: getContrastingTextColor(
                                      firmEvents[0].color || '#f0abfc'
                                    ),
                                  }}
                                >
                                  {firmEvents[0].cleanLabel.slice(0, 12)}
                                </button>
                              )}

                              {/* Clickable Client Appointment Chips */}
                              {clientAppointments.map((appt) => {
                                const client = appt.raw.clientId
                                  ? clientsById.get(appt.raw.clientId.trim().toLowerCase())
                                  : undefined;
                                const hoverInfo = [
                                  `Client: ${appt.raw.clientName || 'N/A'}${
                                    appt.raw.clientId ? ` (${appt.raw.clientId})` : ''
                                  }`,
                                  client?.tin ? `TIN: ${client.tin}` : '',
                                  client?.fye ? `FYE: Month ${client.fye}` : '',
                                  client?.taxPic ? `Tax PIC: ${client.taxPic}` : '',
                                  `Event: ${appt.cleanLabel}`,
                                  appt.raw.notes ? `Notes: ${appt.raw.notes}` : '',
                                  'Click to open Client Master (Shift+Click to edit event)',
                                ]
                                  .filter(Boolean)
                                  .join('\n');

                                const chipColor =
                                  appt.color || EVENT_TYPE_DEFAULT_COLORS['Client Appointment'];

                                return (
                                  <button
                                    key={appt.raw.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (e.shiftKey || !onNavigate) {
                                        onCellSelectModal(s.staffName, iso, appt);
                                        return;
                                      }
                                      onNavigate('client-master', {
                                        search: appt.raw.clientId || appt.raw.clientName || '',
                                      });
                                    }}
                                    title={hoverInfo}
                                    className="w-full text-left px-1 py-0.5 rounded border border-sky-900/20 text-[10px] font-medium leading-tight truncate inline-flex items-center justify-between gap-0.5 hover:brightness-95 transition"
                                    style={{
                                      backgroundColor: chipColor,
                                      color: getContrastingTextColor(chipColor),
                                    }}
                                  >
                                    <span className="truncate">{formatClientChipLabel(appt)}</span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                  </button>
                                );
                              })}

                              {/* Other Personal Events */}
                              {otherPersonalEvents.map((ev) => (
                                <button
                                  key={ev.raw.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCellSelectModal(s.staffName, iso, ev);
                                  }}
                                  title={`${ev.displayTitle}${ev.raw.notes ? `\n${ev.raw.notes}` : ''}`}
                                  className="w-full text-left px-1 py-0.5 rounded text-[10px] font-medium leading-tight truncate border border-slate-900/15"
                                  style={{
                                    backgroundColor: ev.color,
                                    color: getContrastingTextColor(ev.color),
                                  }}
                                >
                                  {ev.cleanLabel}
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend + Monthly Event Notes Footer Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Info className="w-3.5 h-3.5 text-teal-700" />
            Monthly Event Notes &amp; Holidays — {monthHeaderLabel}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#22d3ee] border border-slate-300" />
              AL / SL / MC
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#fb923c] border border-slate-300" />
              RL
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#f472b6] border border-slate-300" />
              UPL
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#86efac] border border-slate-300" />
              WFH
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#facc15] border border-slate-300" />
              Johor / MY Holiday
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#f0abfc] border border-slate-300" />
              Firm Seminar / Event
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#bae6fd] border border-slate-300" />
              Client Appt (click to view Client; Shift+Click to edit)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[9px] font-bold inline-flex items-center justify-center">
                !
              </span>
              Tax Deadline Collision
            </span>
          </div>
        </div>

        {monthlyNotes.firmEvents.length === 0 && monthlyNotes.phs.length === 0 ? (
          <div className="text-xs text-slate-400">
            No public holidays or firm-wide internal events recorded for {monthHeaderLabel}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {monthlyNotes.firmEvents.map((ev) => (
              <button
                key={ev.raw.id}
                type="button"
                onClick={() => onCellSelectModal('', ev.raw.startDate, ev)}
                className="text-left p-2 rounded-md border border-slate-200 hover:border-teal-400 transition-colors flex items-start gap-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-xs mt-1 shrink-0 border border-slate-900/15"
                  style={{ backgroundColor: ev.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {ev.cleanLabel}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatDateDDMMYYYY(ev.raw.startDate)}
                    {ev.raw.endDate && ev.raw.endDate !== ev.raw.startDate
                      ? ` – ${formatDateDDMMYYYY(ev.raw.endDate)}`
                      : ''}{' '}
                    · {ev.canonicalType}
                  </div>
                  {ev.raw.notes && (
                    <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                      {ev.raw.notes}
                    </div>
                  )}
                </div>
              </button>
            ))}

            {monthlyNotes.phs.map((ph) => (
              <div
                key={`${ph.date}-${ph.name}`}
                className="p-2 rounded-md border border-amber-200/80 bg-amber-50/40 flex items-start gap-2"
              >
                <span className="w-2.5 h-2.5 rounded-xs mt-1 shrink-0 bg-[#facc15] border border-amber-500/40" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 truncate">{ph.name}</div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatDateDDMMYYYY(ph.date)} · {ph.scope} Holiday
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
