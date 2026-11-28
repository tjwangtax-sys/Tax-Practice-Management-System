import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Eraser,
  ExternalLink,
  Info,
  MousePointerClick,
  Paintbrush,
  Repeat2,
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
  computeHolidayDeadlineCollisions,
  computeOpenJobsByStaff,
  computeStaffDeadlineCollisions,
  computeStaffRowSummaries,
  DeadlineCollisionItem,
  EVENT_TYPE_DEFAULT_COLORS,
  eventCoversDate,
  formatClientChipLabel,
  formatRecurrenceRuleLabel,
  formatShortDayMonth,
  getContrastingTextColor,
  getMalaysianStatutoryDeadlinesForDate,
  getMonthDays,
  isDateWithinStaffEmployment,
  isPeakFilingDate,
  PaintTool,
  ParsedCalendarEvent,
  PeakCoverageAlert,
  PublicHolidayRef,
  StaffMatrixRowSummary,
  StatutoryDeadlineRef,
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
  { id: 'TO', label: 'TO', hint: 'Time-Off / Replace (0 leave deduction)', swatch: '#e0e7ff' },
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
  const [hoveredCollision, setHoveredCollision] = useState<{
    rect: DOMRect;
    dateIso: string;
    statusKind: 'leave' | 'holiday';
    staffName?: string;
    statusLabel: string;
    statusColor?: string;
    collisions: DeadlineCollisionItem[];
  } | null>(null);
  const [hoveredTimeOff, setHoveredTimeOff] = useState<{
    rect: DOMRect;
    dateIso: string;
    staffName: string;
    label: string;
    timeOffNote: string;
    notes: string;
  } | null>(null);

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

  // Tax Due Date events indexed by date (kept OUT of staff cells; marked in date header + Monthly Event Notes + collision alerts)
  const taxDueDatesByDate = useMemo(() => {
    const map = new Map<string, ParsedCalendarEvent[]>();
    for (const d of days) {
      const iso = toIsoDate(d);
      const list = parsedEvents.filter(
        (e) => e.canonicalType === 'Tax Due Date' && eventCoversDate(e.raw, iso)
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
        if (
          ev.canonicalType === 'Company Holiday' ||
          ev.canonicalType === 'Tax Due Date' ||
          ev.isFirmWide
        ) {
          continue;
        }
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

  // Compute Work Days, Leave, and Open Jobs for each staff row (pro-rated by Join/Leave Date; TO & WFH = 0 leave)
  const rowSummaries = useMemo<StaffMatrixRowSummary[]>(() => {
    return computeStaffRowSummaries({
      staffList: activeStaff,
      monthWeekdays,
      holidaysByDate,
      parsedEvents,
      openJobsByStaff,
    }).rowSummaries;
  }, [activeStaff, monthWeekdays, holidaysByDate, parsedEvents, openJobsByStaff]);

  // Statutory Malaysian LHDN deadlines per visible date
  const statutoryByDate = useMemo(() => {
    const map = new Map<string, StatutoryDeadlineRef[]>();
    for (const d of days) {
      const iso = toIsoDate(d);
      const list = getMalaysianStatutoryDeadlinesForDate(iso);
      if (list.length > 0) map.set(iso, list);
    }
    return map;
  }, [days]);

  // Tax Deadline Collision map for staff leave cells: `${staffLower}|${iso}` -> DeadlineCollisionItem[]
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

        const collisions = computeStaffDeadlineCollisions(
          s.staffName,
          iso,
          jobs,
          cp204Records,
          parsedEvents
        );
        if (collisions.length > 0) {
          map.set(`${staffKey}|${iso}`, collisions);
        }
      }
    }
    return map;
  }, [activeStaff, staffDayEventsMap, jobs, cp204Records, parsedEvents]);

  // Tax Deadline Collision map for Public Holidays & Company Holidays: `iso` -> DeadlineCollisionItem[]
  const holidayCollisionMap = useMemo(() => {
    const map = new Map<string, DeadlineCollisionItem[]>();
    for (const d of days) {
      const iso = toIsoDate(d);
      if (!holidaysByDate.has(iso) && !companyHolidayByDate.has(iso)) continue;
      const collisions = computeHolidayDeadlineCollisions(iso, jobs, cp204Records, parsedEvents);
      if (collisions.length > 0) {
        map.set(iso, collisions);
      }
    }
    return map;
  }, [days, holidaysByDate, companyHolidayByDate, jobs, cp204Records, parsedEvents]);

  // Peak-Day Coverage Alerts (>30% of employed staff away on the same day; TO & WFH excluded)
  const peakCoverageAlerts = useMemo<PeakCoverageAlert[]>(() => {
    if (activeStaff.length === 0) return [];
    const alerts: PeakCoverageAlert[] = [];

    for (const d of monthWeekdays) {
      const iso = toIsoDate(d);
      if (holidaysByDate.has(iso) || companyHolidayByDate.has(iso)) continue;

      const employedOnDay = activeStaff.filter((s) => isDateWithinStaffEmployment(s, iso));
      const total = employedOnDay.length;
      if (total === 0) continue;

      const awayNames: string[] = [];
      for (const s of employedOnDay) {
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

  // Monthly Event Notes for the footer bar (Tax Due Dates + Firm-wide Internal Events + Company Holidays + PH)
  const monthlyNotes = useMemo(() => {
    const monthStart = toIsoDate(new Date(year, monthIndex, 1));
    const monthEnd = toIsoDate(new Date(year, monthIndex + 1, 0));

    const taxDueEvents = parsedEvents
      .filter(
        (e) =>
          e.canonicalType === 'Tax Due Date' &&
          e.raw.startDate <= monthEnd &&
          (e.raw.endDate || e.raw.startDate) >= monthStart
      )
      .sort((a, b) => a.raw.startDate.localeCompare(b.raw.startDate));

    const firmEvents = parsedEvents.filter(
      (e) =>
        e.canonicalType !== 'Tax Due Date' &&
        (e.isFirmWide || e.canonicalType === 'Company Holiday') &&
        e.raw.startDate <= monthEnd &&
        (e.raw.endDate || e.raw.startDate) >= monthStart
    );

    const phs = Array.from(holidaysByDate.values())
      .filter((h) => h.date >= monthStart && h.date <= monthEnd)
      .sort((a, b) => a.date.localeCompare(b.date));

    return { taxDueEvents, firmEvents, phs };
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
          <div
            className="overflow-x-auto"
            onScroll={() => {
              if (hoveredCollision) setHoveredCollision(null);
              if (hoveredTimeOff) setHoveredTimeOff(null);
            }}
          >
            <table
              className="table-fixed border-collapse w-full text-xs"
              style={includeWeekends ? { minWidth: 281 + days.length * 38 } : undefined}
            >
              <colgroup>
                <col className="w-[155px]" />
                <col className="w-[42px]" />
                <col className="w-[42px]" />
                <col className="w-[42px]" />
                {days.map((d) => (
                  <col
                    key={`col-${toIsoDate(d)}`}
                    className={includeWeekends ? 'w-[38px]' : 'w-auto'}
                  />
                ))}
              </colgroup>

              {/* Two-Row Green Header (#16a34a) — Fixed Uniform Grid */}
              <thead className="sticky top-0 z-30">
                <tr className="bg-[#16a34a] text-white">
                  <th
                    colSpan={4}
                    className="sticky left-0 z-40 bg-[#15803d] w-[281px] px-2.5 py-1.5 text-left font-bold text-xs tracking-wide border-b border-r-2 border-slate-800 whitespace-nowrap overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{monthHeaderLabel}</span>
                      <span className="text-[10px] font-normal text-emerald-100 shrink-0">
                        Johor / MY
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
                        className={`px-0.5 py-1 text-center text-[9px] font-semibold border-b border-emerald-700/70 overflow-hidden ${
                          weekEndDivider ? 'border-r-2 border-r-slate-800' : 'border-r border-r-emerald-700/60'
                        } ${
                          isToday
                            ? 'bg-emerald-900 text-amber-200'
                            : isWeekend
                            ? 'bg-[#15803d]/90 text-emerald-100'
                            : 'bg-[#16a34a] text-white'
                        }`}
                      >
                        {WEEKDAY_SHORT[dow]}
                      </th>
                    );
                  })}
                </tr>

                <tr className="bg-[#16a34a] text-white">
                  <th className="sticky left-0 z-40 bg-[#16a34a] w-[155px] px-2.5 py-1.5 text-left text-[11px] font-bold border-b-2 border-b-slate-800 border-r border-r-emerald-700/70 whitespace-nowrap overflow-hidden">
                    Staff
                  </th>
                  <th
                    className="sticky left-[155px] z-40 bg-[#16a34a] w-[42px] px-1 py-1.5 text-right text-[10px] font-bold border-b-2 border-b-slate-800 border-r border-r-emerald-700/70 whitespace-nowrap overflow-hidden"
                    title="Net working weekdays in month (pro-rated by Join/Leave Date, minus holidays & deductible leave; TO & WFH = 0 deduction)"
                  >
                    Work
                  </th>
                  <th
                    className="sticky left-[197px] z-40 bg-[#16a34a] w-[42px] px-1 py-1.5 text-right text-[10px] font-bold border-b-2 border-b-slate-800 border-r border-r-emerald-700/70 whitespace-nowrap overflow-hidden"
                    title="Leave days in month (1.0 per leave day, 0.5 for half-day, 0 for WFH & TO)"
                  >
                    Leave
                  </th>
                  <th
                    className="sticky left-[239px] z-40 bg-[#16a34a] w-[42px] px-1 py-1.5 text-right text-[10px] font-bold border-b-2 border-b-slate-800 border-r-2 border-r-slate-800 whitespace-nowrap overflow-hidden"
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
                    const statList = statutoryByDate.get(iso) ?? [];
                    const dueList = taxDueDatesByDate.get(iso) ?? [];
                    const headerParts = [formatDateDDMMYYYY(iso)];
                    if (dueList.length > 0) {
                      headerParts.push(
                        `Tax Due Date: ${dueList.map((ev) => ev.cleanLabel).join(', ')}`
                      );
                    }
                    if (statList.length > 0) {
                      headerParts.push(
                        `LHDN Statutory: ${statList.map((st) => st.name).join(', ')}`
                      );
                    } else if (isPeak && dueList.length === 0) {
                      headerParts.push('Peak LHDN filing date');
                    }
                    const headerTitle = headerParts.join(' — ');
                    return (
                      <th
                        key={`dt-${iso}`}
                        className={`px-0.5 py-1 text-center text-[10px] font-mono tabular-nums font-semibold border-b-2 border-b-slate-800 whitespace-nowrap overflow-hidden ${
                          weekEndDivider ? 'border-r-2 border-r-slate-800' : 'border-r border-r-emerald-700/60'
                        } ${
                          isToday
                            ? 'bg-emerald-900 text-amber-200 underline decoration-amber-300'
                            : isWeekend
                            ? 'bg-[#15803d]/90 text-emerald-100'
                            : 'bg-[#16a34a] text-white'
                        }`}
                        title={headerTitle}
                      >
                        <span className="inline-flex items-center justify-center gap-0.5">
                          {d.getDate()}
                          {dueList.length > 0 && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full bg-[#ef4444] ring-1 ring-white/90 shrink-0"
                              aria-label="Tax Due Date"
                            />
                          )}
                          {statList.length > 0 && dueList.length === 0 && (
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"
                              aria-label="LHDN Statutory Deadline"
                            />
                          )}
                        </span>
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
                  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                  const joinedThisMonth = Boolean(s.joinDate && s.joinDate.startsWith(monthPrefix));
                  const leftThisMonth = Boolean(s.leaveDate && s.leaveDate.startsWith(monthPrefix));
                  const staffTenureNote = [
                    joinedThisMonth && s.joinDate
                      ? `Join ${s.joinDate.slice(8, 10)}/${s.joinDate.slice(5, 7)}`
                      : '',
                    leftThisMonth && s.leaveDate
                      ? `Left ${s.leaveDate.slice(8, 10)}/${s.leaveDate.slice(5, 7)}`
                      : !s.active && s.leaveDate
                      ? `Resigned`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <tr key={s.id} className={`${rowBg} hover:bg-teal-50/30 h-10 max-h-10`}>
                      {/* Sticky Left Columns */}
                      <td
                        className={`sticky left-0 z-20 ${rowBg} w-[155px] h-10 max-h-10 px-2.5 py-1 border-r border-slate-200 whitespace-nowrap overflow-hidden align-middle`}
                      >
                        <div
                          className="font-semibold text-slate-900 truncate text-[11px] leading-tight"
                          title={`${s.staffName}${
                            s.joinDate ? ` · Joined ${formatDateDDMMYYYY(s.joinDate)}` : ''
                          }${s.leaveDate ? ` · Left ${formatDateDDMMYYYY(s.leaveDate)}` : ''}`}
                        >
                          {s.staffName}
                        </div>
                        <div className="text-[9px] font-mono text-slate-400 truncate leading-tight mt-0.5">
                          {s.staffId}
                          {staffTenureNote ? (
                            <span className="text-amber-700 font-sans font-medium">
                              {' '}
                              · {staffTenureNote}
                            </span>
                          ) : s.role ? (
                            ` · ${s.role}`
                          ) : (
                            ''
                          )}
                        </div>
                      </td>
                      <td
                        className={`sticky left-[155px] z-20 ${rowBg} w-[42px] h-10 max-h-10 px-1 py-1 text-right font-mono tabular-nums text-[11px] font-semibold text-emerald-800 border-r border-slate-200 whitespace-nowrap overflow-hidden align-middle`}
                        title={
                          summary.isPartialMonth
                            ? `Pro-rated: ${summary.employedWorkingDays ?? summary.workDays} employed working day(s) minus ${summary.leaveDays} leave`
                            : undefined
                        }
                      >
                        {summary.workDays}
                      </td>
                      <td
                        className={`sticky left-[197px] z-20 ${rowBg} w-[42px] h-10 max-h-10 px-1 py-1 text-right font-mono tabular-nums text-[11px] border-r border-slate-200 whitespace-nowrap overflow-hidden align-middle ${
                          summary.leaveDays > 0 ? 'font-semibold text-cyan-800' : 'text-slate-400'
                        }`}
                      >
                        {summary.leaveDays}
                      </td>
                      <td
                        className={`sticky left-[239px] z-20 ${rowBg} w-[42px] h-10 max-h-10 px-1 py-1 text-right font-mono tabular-nums text-[11px] border-r-2 border-r-slate-800 whitespace-nowrap overflow-hidden align-middle ${
                          summary.openJobs > 0 ? 'font-semibold text-slate-800' : 'text-slate-400'
                        }`}
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
                          const holCollisions = holidayCollisionMap.get(iso) ?? [];
                          const holidayStatusLabel = `${bannerLabel} (${
                            compHol ? 'Company Holiday' : `${ph!.scope} Holiday`
                          })`;
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
                              onMouseEnter={(e) => {
                                if (holCollisions.length > 0) {
                                  const rawRect = e.currentTarget.getBoundingClientRect();
                                  const anchorY = Math.max(
                                    rawRect.top + 8,
                                    Math.min(e.clientY, rawRect.bottom - 8)
                                  );
                                  setHoveredCollision({
                                    rect: new DOMRect(rawRect.left, anchorY - 14, rawRect.width, 28),
                                    dateIso: iso,
                                    statusKind: 'holiday',
                                    statusLabel: holidayStatusLabel,
                                    statusColor: bannerColor,
                                    collisions: holCollisions,
                                  });
                                }
                              }}
                              onMouseLeave={() => {
                                if (holCollisions.length > 0) setHoveredCollision(null);
                              }}
                              title={
                                holCollisions.length === 0
                                  ? `${bannerLabel} (${formatDateDDMMYYYY(iso)})${
                                      ph?.scope ? ` — ${ph.scope}` : ' — Company Holiday'
                                    }`
                                  : undefined
                              }
                              className={`relative p-0.5 text-center align-middle cursor-pointer overflow-hidden transition-opacity hover:opacity-90 ${rightBorderCls}`}
                              style={{
                                backgroundColor: bannerColor,
                                color: getContrastingTextColor(bannerColor),
                                height: rowSummaries.length * 40,
                                maxHeight: rowSummaries.length * 40,
                              }}
                            >
                              {holCollisions.length > 0 && (
                                <span
                                  className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full text-[10px] font-bold text-white bg-rose-600 ring-1 ring-white flex items-center justify-center shadow-xs"
                                  aria-label={`Tax Deadline Collision (${holCollisions.length})`}
                                >
                                  !
                                </span>
                              )}
                              <div
                                className="flex items-center justify-center overflow-hidden mx-auto"
                                style={{ maxHeight: Math.max(32, rowSummaries.length * 40 - 8) }}
                              >
                                <span
                                  className="font-bold text-[10px] tracking-wide whitespace-nowrap truncate"
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

                        // 1b. Out-of-employment date (before Join Date or after Leave Date)
                        const isEmployed = isDateWithinStaffEmployment(s, iso);
                        if (!isEmployed) {
                          const outReason =
                            s.joinDate && iso < s.joinDate.slice(0, 10)
                              ? `${s.staffName} joined on ${formatDateDDMMYYYY(s.joinDate)}`
                              : s.leaveDate
                              ? `${s.staffName} left on ${formatDateDDMMYYYY(s.leaveDate)}`
                              : 'Outside employment dates';
                          return (
                            <td
                              key={`${s.id}-${iso}`}
                              title={outReason}
                              className={`p-0.5 align-middle text-center h-10 max-h-10 overflow-hidden bg-slate-100/80 text-slate-300 text-[10px] cursor-not-allowed ${rightBorderCls}`}
                            >
                              ·
                            </td>
                          );
                        }

                        // 2. Normal Day Cell (may have Firm-Wide Magenta Seminar + Individual Leave / TO / Client Appointments)
                        const firmEvents = firmWideEventsByDate.get(iso) ?? [];
                        const cellEvents = staffDayEventsMap.get(staffKey)?.get(iso) ?? [];
                        const collisions = collisionMap.get(`${staffKey}|${iso}`) ?? [];
                        const inDrag = isCellInDragRange(s.staffName, iso);

                        // Determine cell fill priority:
                        // Individual Staff Availability / Time-Off / Event color > Firm-Wide Magenta > Weekend tint > Default
                        const primaryLeave = cellEvents.find(
                          (e) =>
                            e.canonicalType === 'Staff Availability' ||
                            e.canonicalType === 'Time-Off / Replace'
                        );
                        const isTimeOffCell = Boolean(
                          primaryLeave &&
                            (primaryLeave.canonicalType === 'Time-Off / Replace' ||
                              primaryLeave.leaveCode === 'TO')
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
                          cellBg = isTimeOffCell
                            ? '#e0e7ff'
                            : primaryLeave.leaveCode === 'WFH' && primaryLeave.raw.color === '#22d3ee'
                            ? '#86efac'
                            : primaryLeave.color;
                        } else if (firmEvents.length > 0) {
                          cellBg = firmEvents[0].color || EVENT_TYPE_DEFAULT_COLORS['Internal Event'];
                        } else if (isWeekend) {
                          cellBg = '#f1f5f9';
                        }

                        const cellTextColor = isTimeOffCell
                          ? '#3730a3'
                          : cellBg
                          ? getContrastingTextColor(cellBg)
                          : undefined;
                        const hasCriticalCollision = collisions.some((c) => c.severity === 'critical');

                        const leaveStatusLabel = primaryLeave
                          ? `${primaryLeave.leaveCode || primaryLeave.cleanLabel}${
                              primaryLeave.cleanLabel &&
                              primaryLeave.leaveCode &&
                              primaryLeave.cleanLabel.toUpperCase() !== primaryLeave.leaveCode.toUpperCase()
                                ? ` (${primaryLeave.cleanLabel})`
                                : ''
                            }`
                          : 'On Leave';

                        const collisionTitleFallback = collisions
                          .map((c) =>
                            c.source === 'statutory'
                              ? `LHDN Statutory: ${c.formName}`
                              : c.source === 'calendar'
                              ? `${c.deadlineType}: ${c.formName} (${c.refCode})${
                                  c.clientId !== 'RECURRING' && c.clientId !== 'TAX DUE'
                                    ? ` — [${c.clientId}] ${c.clientName}`
                                    : ''
                                }`
                              : `[${c.clientId}] ${c.clientName} — ${c.formName} (${formatDateDDMMYYYY(
                                  c.dueDate
                                )}${c.daysAfterLeave === 0 ? ', SAME DAY' : `, +${c.daysAfterLeave}d`})`
                          )
                          .join('\n');

                        const toNoteText = (primaryLeave?.raw.timeOffNote || '').trim();
                        const toExtraNotes = (primaryLeave?.raw.notes || '').trim();
                        const hasToTooltip = Boolean(isTimeOffCell && primaryLeave);

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
                            onMouseEnter={(e) => {
                              if (dragState && dragState.staffName === s.staffName) {
                                setDragState((prev) =>
                                  prev ? { ...prev, currentIso: iso } : null
                                );
                              }
                              if (collisions.length > 0 && !dragState) {
                                setHoveredTimeOff(null);
                                setHoveredCollision({
                                  rect: e.currentTarget.getBoundingClientRect(),
                                  dateIso: iso,
                                  statusKind: 'leave',
                                  staffName: s.staffName,
                                  statusLabel: leaveStatusLabel,
                                  statusColor: cellBg,
                                  collisions,
                                });
                              } else if (hasToTooltip && primaryLeave && !dragState) {
                                setHoveredTimeOff({
                                  rect: e.currentTarget.getBoundingClientRect(),
                                  dateIso: iso,
                                  staffName: s.staffName,
                                  label: primaryLeave.cleanLabel || 'TO',
                                  timeOffNote: toNoteText,
                                  notes: toExtraNotes,
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              if (collisions.length > 0) setHoveredCollision(null);
                              if (hasToTooltip) setHoveredTimeOff(null);
                            }}
                            onClick={() => {
                              if (activeTool !== 'select') return;
                              onCellSelectModal(
                                s.staffName,
                                iso,
                                primaryLeave || otherPersonalEvents[0] || clientAppointments[0]
                              );
                            }}
                            className={`relative p-0.5 align-middle h-10 max-h-10 overflow-hidden transition-shadow ${rightBorderCls} ${
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
                            }}
                          >
                            {/* Tax Deadline Collision Badge (!) */}
                            {collisions.length > 0 && (
                              <span
                                title={`Tax Deadline Collision (${s.staffName} · ${leaveStatusLabel}):\n${collisionTitleFallback}`}
                                className={`absolute top-0.5 right-0.5 z-10 w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white ring-1 ring-white flex items-center justify-center shadow-xs ${
                                  hasCriticalCollision ? 'bg-rose-600' : 'bg-amber-600'
                                }`}
                              >
                                !
                              </span>
                            )}

                            <div className="flex flex-col gap-0.5 h-9 max-h-9 overflow-hidden justify-center w-full">
                              {/* Primary Leave / TO Label (AL, 1/2 AL, SL, MC, RL, UPL, WFH, TO) */}
                              {primaryLeave && (
                                <span
                                  className={`w-full truncate text-[10px] leading-tight px-1 py-0.5 block text-center font-bold ${
                                    isTimeOffCell
                                      ? 'rounded bg-indigo-100 text-indigo-800 border border-indigo-300'
                                      : ''
                                  }`}
                                  title={
                                    collisions.length === 0 && !hasToTooltip
                                      ? `${primaryLeave.displayTitle}${
                                          primaryLeave.raw.notes ? `\n${primaryLeave.raw.notes}` : ''
                                        }`
                                      : undefined
                                  }
                                >
                                  {isTimeOffCell
                                    ? 'TO'
                                    : primaryLeave.leaveCode || primaryLeave.cleanLabel}
                                </span>
                              )}

                              {/* Firm-Wide Internal Event / Seminar Tag */}
                              {firmEvents.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCellSelectModal('', iso, firmEvents[0]);
                                  }}
                                  title={`Firm Event: ${firmEvents.map((f) => f.displayTitle).join(', ')}`}
                                  className="w-full truncate text-[10px] leading-tight px-1 py-0.5 block text-center font-semibold rounded hover:underline"
                                  style={{
                                    backgroundColor: primaryLeave
                                      ? firmEvents[0].color || '#f0abfc'
                                      : 'transparent',
                                    color: getContrastingTextColor(
                                      firmEvents[0].color || '#f0abfc'
                                    ),
                                  }}
                                >
                                  {firmEvents[0].cleanLabel}
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
                                    className="w-full truncate text-[10px] leading-tight px-1 py-0.5 block text-center rounded border border-sky-900/20 font-medium hover:brightness-95 transition"
                                    style={{
                                      backgroundColor: chipColor,
                                      color: getContrastingTextColor(chipColor),
                                    }}
                                  >
                                    {formatClientChipLabel(appt)}
                                  </button>
                                );
                              })}

                              {/* Other Personal Events (e.g. [TRAINING], Internal Events) */}
                              {otherPersonalEvents.map((ev) => (
                                <button
                                  key={ev.raw.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCellSelectModal(s.staffName, iso, ev);
                                  }}
                                  title={`${ev.displayTitle}${ev.raw.notes ? `\n${ev.raw.notes}` : ''}`}
                                  className="w-full truncate text-[10px] leading-tight px-1 py-0.5 block text-center rounded font-medium border border-slate-900/15"
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
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-100 border border-indigo-300" />
              TO (Time-Off / Replace)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#ef4444] border border-rose-700/30" />
              Tax Due Date
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

        {monthlyNotes.taxDueEvents.length === 0 &&
        monthlyNotes.firmEvents.length === 0 &&
        monthlyNotes.phs.length === 0 ? (
          <div className="text-xs text-slate-400">
            No tax due dates, public holidays, or firm-wide internal events recorded for{' '}
            {monthHeaderLabel}.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {monthlyNotes.taxDueEvents.map((ev) => (
              <button
                key={ev.raw.id}
                type="button"
                onClick={() => onCellSelectModal('', ev.raw.startDate, ev)}
                className="text-left p-2 rounded-md border border-rose-300 bg-rose-50/50 hover:border-rose-500 transition-colors flex items-start gap-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-xs mt-1 shrink-0 border border-rose-700/30"
                  style={{ backgroundColor: ev.color || '#ef4444' }}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="text-xs font-semibold text-rose-950 truncate">
                      {ev.cleanLabel}
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[9px] font-semibold whitespace-nowrap shrink-0">
                      Tax Due Date
                    </span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-rose-800/80 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {formatDateDDMMYYYY(ev.raw.startDate)}
                      {ev.raw.endDate && ev.raw.endDate !== ev.raw.startDate
                        ? ` – ${formatDateDDMMYYYY(ev.raw.endDate)}`
                        : ''}
                    </span>
                    {ev.raw.recurrenceGroupId && (
                      <span className="inline-flex items-center gap-0.5 font-sans text-[10px] text-rose-700">
                        · <Repeat2 className="w-2.5 h-2.5" />
                        {formatRecurrenceRuleLabel(
                          ev.raw.recurrenceRule,
                          ev.raw.startDate,
                          ev.raw.recurrenceLabel
                        )}
                      </span>
                    )}
                  </div>
                  {ev.raw.notes && (
                    <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                      {ev.raw.notes}
                    </div>
                  )}
                </div>
              </button>
            ))}

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

      {/* Portal-Rendered Tax Deadline Collision Hover Tooltip (Never Clipped by Table Scroll) */}
      {hoveredCollision &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const tooltipWidth = 340;
            const margin = 12;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const estimatedHeight = Math.min(340, 108 + hoveredCollision.collisions.length * 48);
            const spaceBelow = vh - hoveredCollision.rect.bottom;
            const openAbove =
              spaceBelow < estimatedHeight + 16 && hoveredCollision.rect.top > spaceBelow;
            const left = Math.max(
              margin,
              Math.min(
                hoveredCollision.rect.left + hoveredCollision.rect.width / 2 - tooltipWidth / 2,
                vw - tooltipWidth - margin
              )
            );
            const top = openAbove
              ? Math.max(margin, hoveredCollision.rect.top - estimatedHeight - 8)
              : Math.min(vh - estimatedHeight - margin, hoveredCollision.rect.bottom + 8);
            const hasCritical = hoveredCollision.collisions.some((c) => c.severity === 'critical');

            return (
              <div
                className="fixed z-[9999] pointer-events-none bg-white border border-slate-300 rounded-lg shadow-2xl overflow-hidden text-xs"
                style={{
                  left,
                  top,
                  width: tooltipWidth,
                }}
              >
                <div
                  className={`px-3 py-2 flex items-center justify-between gap-2 text-white ${
                    hasCritical ? 'bg-rose-600' : 'bg-amber-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Tax Deadline Collision ({hoveredCollision.collisions.length})</span>
                  </div>
                  <span className="font-mono text-[11px] opacity-95">
                    {formatDateDDMMYYYY(hoveredCollision.dateIso)}
                  </span>
                </div>

                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  {hoveredCollision.statusColor && (
                    <span
                      className="w-2.5 h-2.5 rounded-xs border border-slate-900/20 shrink-0"
                      style={{ backgroundColor: hoveredCollision.statusColor }}
                    />
                  )}
                  <div className="min-w-0 text-[11px] text-slate-800">
                    {hoveredCollision.statusKind === 'holiday' ? (
                      <>
                        <span className="font-semibold">Holiday Status: </span>
                        <span>{hoveredCollision.statusLabel}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">{hoveredCollision.staffName}</span>
                        <span className="text-slate-500"> · Leave Status: </span>
                        <span className="font-semibold text-slate-900">
                          {hoveredCollision.statusLabel}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-2.5 space-y-1.5 max-h-[220px] overflow-y-auto">
                  {hoveredCollision.collisions.map((c, idx) => (
                    <div
                      key={`${c.source}-${c.refCode}-${c.deadlineType}-${idx}`}
                      className={`p-2 rounded-md border space-y-0.5 ${
                        c.deadlineType === 'Tax Due Date'
                          ? 'border-rose-300 bg-rose-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-900 truncate">
                          {c.source === 'calendar' && c.deadlineType !== 'Tax Due Date' ? (
                            <Repeat2 className="w-3 h-3 text-teal-700 shrink-0" />
                          ) : (
                            <CalendarClock className="w-3 h-3 text-rose-600 shrink-0" />
                          )}
                          <span className="truncate">{c.formName}</span>
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                            c.deadlineType === 'Tax Due Date'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : c.source === 'statutory'
                              ? 'bg-rose-100 text-rose-800'
                              : c.source === 'calendar'
                              ? 'bg-teal-100 text-teal-900'
                              : c.daysAfterLeave === 0
                              ? 'bg-rose-600 text-white'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {c.deadlineType === 'Tax Due Date'
                            ? 'TAX DUE DATE'
                            : c.source === 'statutory'
                            ? 'LHDN STATUTORY'
                            : c.source === 'calendar'
                            ? 'RECURRING DUE'
                            : c.daysAfterLeave === 0
                            ? 'SAME DAY'
                            : `+${c.daysAfterLeave}d`}
                        </span>
                      </div>

                      {c.source === 'statutory' ? (
                        <div className="text-[11px] text-slate-600">
                          Malaysian LHDN Statutory Deadline ({formatDateDDMMYYYY(c.dueDate)})
                        </div>
                      ) : c.source === 'calendar' ? (
                        <div className="text-[11px] text-slate-700 leading-snug">
                          {c.clientId !== 'RECURRING' && c.clientId !== 'TAX DUE' ? (
                            <>
                              <span className="font-mono font-semibold text-teal-800">
                                {c.clientId}
                              </span>{' '}
                              — <span className="font-medium">{c.clientName}</span>
                            </>
                          ) : (
                            <span className="font-medium text-slate-700">{c.clientName}</span>
                          )}
                          <div className="text-[10px] text-slate-500">
                            {c.refCode} · Due {formatDateDDMMYYYY(c.dueDate)}
                            {c.picName ? ` · PIC: ${c.picName}` : ''}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-700 leading-snug">
                          <span className="font-mono font-semibold text-teal-800">
                            {c.clientId}
                          </span>{' '}
                          — <span className="font-medium">{c.clientName}</span>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {c.refCode} · Due {formatDateDDMMYYYY(c.dueDate)}
                            {c.picName ? ` · PIC: ${c.picName}` : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })(),
          document.body
        )}

      {/* Portal-Rendered Time-Off / Replace (TO) Hover Tooltip */}
      {hoveredTimeOff &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const tooltipWidth = 280;
            const margin = 12;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const estimatedHeight = 120;
            const spaceBelow = vh - hoveredTimeOff.rect.bottom;
            const openAbove =
              spaceBelow < estimatedHeight + 16 && hoveredTimeOff.rect.top > spaceBelow;
            const left = Math.max(
              margin,
              Math.min(
                hoveredTimeOff.rect.left + hoveredTimeOff.rect.width / 2 - tooltipWidth / 2,
                vw - tooltipWidth - margin
              )
            );
            const top = openAbove
              ? Math.max(margin, hoveredTimeOff.rect.top - estimatedHeight - 8)
              : Math.min(vh - estimatedHeight - margin, hoveredTimeOff.rect.bottom + 8);

            return (
              <div
                className="fixed z-[9999] pointer-events-none bg-white border border-indigo-300 rounded-lg shadow-xl overflow-hidden text-xs"
                style={{ left, top, width: tooltipWidth }}
              >
                <div className="px-3 py-1.5 bg-indigo-600 text-white flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Time-Off / Replace (TO)
                  </span>
                  <span className="font-mono text-[10px] opacity-90">
                    {formatDateDDMMYYYY(hoveredTimeOff.dateIso)}
                  </span>
                </div>
                <div className="p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-slate-900">{hoveredTimeOff.staffName}</span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-medium">
                      0 leave deduction
                    </span>
                  </div>
                  {hoveredTimeOff.timeOffNote ? (
                    <div className="p-2 rounded bg-indigo-50/70 border border-indigo-200/80 text-[11px] text-indigo-950 font-medium">
                      {hoveredTimeOff.timeOffNote}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic">
                      Click cell to add Hours / Time Note (e.g. Leave early 0.5 hr).
                    </div>
                  )}
                  {hoveredTimeOff.notes && (
                    <div className="text-[11px] text-slate-600 whitespace-pre-wrap">
                      {hoveredTimeOff.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
};
