import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Printer,
  Download,
  Calendar as CalendarIcon,
  Edit3,
  Trash2,
  Check,
  X,
  Flag,
  Search,
} from 'lucide-react';
import { CalendarEvent } from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { printRegisterHtml } from '../../lib/exportUtils';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';

type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';
type CanonicalEventType = 'Company Holiday' | 'Staff Availability' | 'Internal Event';

const CANONICAL_EVENT_TYPES: CanonicalEventType[] = [
  'Company Holiday',
  'Staff Availability',
  'Internal Event',
];

interface ParsedCalendarEvent {
  raw: CalendarEvent;
  canonicalType: CanonicalEventType;
  staffName: string;
  cleanLabel: string;
  displayTitle: string;
}

/**
 * Parses [HOLIDAY], [LEAVE] [STAFF: Name], and [EVENT] title prefixes cleanly.
 */
function parseCalendarEvent(ev: CalendarEvent): ParsedCalendarEvent {
  const title = (ev.title || '').trim();
  const holidayMatch = /^\[HOLIDAY\]\s*(.*)$/i.exec(title);
  if (holidayMatch) {
    const clean = holidayMatch[1].trim() || title;
    return {
      raw: ev,
      canonicalType: 'Company Holiday',
      staffName: '',
      cleanLabel: clean,
      displayTitle: `[HOLIDAY] ${clean}`,
    };
  }

  const leaveStaffMatch = /^\[LEAVE\]\s*\[STAFF:\s*([^\]]+)\]\s*(.*)$/i.exec(title);
  if (leaveStaffMatch) {
    const parsedStaff = leaveStaffMatch[1].trim();
    const clean = leaveStaffMatch[2].trim() || 'Leave';
    return {
      raw: ev,
      canonicalType: 'Staff Availability',
      staffName: parsedStaff || ev.assignedTo || '',
      cleanLabel: clean,
      displayTitle: `[LEAVE] [STAFF: ${parsedStaff || ev.assignedTo || 'Staff'}] ${clean}`,
    };
  }

  const leaveSimpleMatch = /^\[LEAVE\]\s*(.*)$/i.exec(title);
  if (leaveSimpleMatch) {
    const clean = leaveSimpleMatch[1].trim() || 'Leave';
    const st = ev.assignedTo || '';
    return {
      raw: ev,
      canonicalType: 'Staff Availability',
      staffName: st,
      cleanLabel: clean,
      displayTitle: st ? `[LEAVE] [STAFF: ${st}] ${clean}` : `[LEAVE] ${clean}`,
    };
  }

  const eventMatch = /^\[EVENT\]\s*(.*)$/i.exec(title);
  if (eventMatch) {
    const clean = eventMatch[1].trim() || title;
    return {
      raw: ev,
      canonicalType: 'Internal Event',
      staffName: ev.assignedTo || '',
      cleanLabel: clean,
      displayTitle: `[EVENT] ${clean}`,
    };
  }

  // Fallback to eventType field
  const typeLower = (ev.eventType || '').toLowerCase();
  let canonicalType: CanonicalEventType = 'Internal Event';
  if (typeLower.includes('holiday')) canonicalType = 'Company Holiday';
  else if (typeLower.includes('leave') || typeLower.includes('availability')) {
    canonicalType = 'Staff Availability';
  }

  return {
    raw: ev,
    canonicalType,
    staffName: ev.assignedTo || '',
    cleanLabel: title,
    displayTitle: title,
  };
}

function buildFormattedTitle(
  type: CanonicalEventType,
  label: string,
  staffName: string
): string {
  const clean = label.trim();
  if (type === 'Company Holiday') {
    return `[HOLIDAY] ${clean}`;
  }
  if (type === 'Staff Availability') {
    const staffPart = staffName.trim() || 'Staff';
    return `[LEAVE] [STAFF: ${staffPart}] ${clean}`;
  }
  return `[EVENT] ${clean}`;
}

function getEventChipClasses(type: CanonicalEventType): string {
  switch (type) {
    case 'Company Holiday':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Staff Availability':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    default:
      return 'bg-teal-50 text-teal-800 border-teal-200';
  }
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, delta: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
  return next;
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function eventCoversDate(ev: CalendarEvent, isoDate: string): boolean {
  const start = (ev.startDate || '').slice(0, 10);
  const end = (ev.endDate || start).slice(0, 10);
  if (!start) return false;
  return isoDate >= start && isoDate <= (end >= start ? end : start);
}

interface PublicHolidayRef {
  date: string;
  name: string;
  scope: 'Federal' | 'KL / Selangor';
}

function getMalaysiaPublicHolidays(year: number): PublicHolidayRef[] {
  // Known lunar / Islamic holiday approximations + fixed Malaysian federal holidays
  const variableByYear: Record<number, PublicHolidayRef[]> = {
    2025: [
      { date: '2025-01-29', name: 'Chinese New Year (Day 1)', scope: 'Federal' },
      { date: '2025-01-30', name: 'Chinese New Year (Day 2)', scope: 'Federal' },
      { date: '2025-02-11', name: 'Thaipusam', scope: 'KL / Selangor' },
      { date: '2025-03-31', name: 'Hari Raya Aidilfitri (Day 1)', scope: 'Federal' },
      { date: '2025-04-01', name: 'Hari Raya Aidilfitri (Day 2)', scope: 'Federal' },
      { date: '2025-05-12', name: 'Wesak Day', scope: 'Federal' },
      { date: '2025-06-02', name: 'Agong Birthday', scope: 'Federal' },
      { date: '2025-06-07', name: 'Hari Raya Haji', scope: 'Federal' },
      { date: '2025-06-27', name: 'Awal Muharram', scope: 'Federal' },
      { date: '2025-09-05', name: 'Prophet Muhammad Birthday (Maulidur Rasul)', scope: 'Federal' },
      { date: '2025-10-20', name: 'Deepavali', scope: 'Federal' },
    ],
    2026: [
      { date: '2026-02-01', name: 'Thaipusam & Federal Territory Day', scope: 'KL / Selangor' },
      { date: '2026-02-17', name: 'Chinese New Year (Day 1)', scope: 'Federal' },
      { date: '2026-02-18', name: 'Chinese New Year (Day 2)', scope: 'Federal' },
      { date: '2026-03-20', name: 'Hari Raya Aidilfitri (Day 1)', scope: 'Federal' },
      { date: '2026-03-21', name: 'Hari Raya Aidilfitri (Day 2)', scope: 'Federal' },
      { date: '2026-05-27', name: 'Hari Raya Haji', scope: 'Federal' },
      { date: '2026-05-31', name: 'Wesak Day', scope: 'Federal' },
      { date: '2026-06-01', name: 'Agong Birthday', scope: 'Federal' },
      { date: '2026-06-17', name: 'Awal Muharram', scope: 'Federal' },
      { date: '2026-08-25', name: 'Prophet Muhammad Birthday (Maulidur Rasul)', scope: 'Federal' },
      { date: '2026-11-08', name: 'Deepavali', scope: 'Federal' },
    ],
    2027: [
      { date: '2027-02-06', name: 'Chinese New Year (Day 1)', scope: 'Federal' },
      { date: '2027-02-07', name: 'Chinese New Year (Day 2)', scope: 'Federal' },
      { date: '2027-03-10', name: 'Hari Raya Aidilfitri (Day 1)', scope: 'Federal' },
      { date: '2027-03-11', name: 'Hari Raya Aidilfitri (Day 2)', scope: 'Federal' },
      { date: '2027-05-17', name: 'Hari Raya Haji', scope: 'Federal' },
      { date: '2027-05-20', name: 'Wesak Day', scope: 'Federal' },
      { date: '2027-06-07', name: 'Agong Birthday / Awal Muharram', scope: 'Federal' },
      { date: '2027-08-15', name: 'Prophet Muhammad Birthday (Maulidur Rasul)', scope: 'Federal' },
      { date: '2027-10-28', name: 'Deepavali', scope: 'Federal' },
    ],
  };

  const fixed: PublicHolidayRef[] = [
    { date: `${year}-01-01`, name: "New Year's Day", scope: 'KL / Selangor' },
    { date: `${year}-02-01`, name: 'Federal Territory Day', scope: 'KL / Selangor' },
    { date: `${year}-05-01`, name: 'Labour Day', scope: 'Federal' },
    { date: `${year}-08-31`, name: 'National Day (Hari Merdeka)', scope: 'Federal' },
    { date: `${year}-09-16`, name: 'Malaysia Day', scope: 'Federal' },
    { date: `${year}-12-25`, name: 'Christmas Day', scope: 'Federal' },
  ];

  const merged = [...fixed, ...(variableByYear[year] ?? [])];
  // Deduplicate exact date+name
  const seen = new Set<string>();
  return merged
    .filter((h) => {
      const k = `${h.date}|${h.name}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function exportCalendarCsv(events: ParsedCalendarEvent[]): void {
  const headers = ['Event Type', 'Title', 'Staff', 'Start Date', 'End Date', 'Notes'];
  const escapeCsv = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escapeCsv).join(','),
    ...events.map((e) =>
      [
        e.canonicalType,
        e.displayTitle,
        e.staffName,
        e.raw.startDate,
        e.raw.endDate || e.raw.startDate,
        e.raw.notes || '',
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TPMS_Team_Calendar_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const TeamCalendarView: React.FC = () => {
  const { isReadOnly, isManagerOrAdmin } = useAuth();
  const { calendarEvents, staff, saveCalendarEvent, deleteCalendarEvent } = useData();

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [typeFilter, setTypeFilter] = useState<'' | CanonicalEventType>('');
  const [staffFilter, setStaffFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<CanonicalEventType>('Internal Event');
  const [formStaff, setFormStaff] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formStartDate, setFormStartDate] = useState(() => toIsoDate(new Date()));
  const [formEndDate, setFormEndDate] = useState(() => toIsoDate(new Date()));
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Inline delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const activeStaffNames = useMemo(
    () =>
      staff
        .filter((s) => s.active)
        .map((s) => s.staffName)
        .sort((a, b) => a.localeCompare(b)),
    [staff]
  );

  const parsedEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calendarEvents
      .map(parseCalendarEvent)
      .filter((ev) => {
        if (typeFilter && ev.canonicalType !== typeFilter) return false;
        if (staffFilter && ev.staffName.toLowerCase() !== staffFilter.toLowerCase()) return false;
        if (q) {
          const hay = `${ev.displayTitle} ${ev.canonicalType} ${ev.staffName} ${ev.raw.notes || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.raw.startDate.localeCompare(b.raw.startDate));
  }, [calendarEvents, typeFilter, staffFilter, search]);

  const holidaysForYear = useMemo(
    () => getMalaysiaPublicHolidays(cursorDate.getFullYear()),
    [cursorDate]
  );

  // Navigation handlers
  const handlePrev = () => {
    setCursorDate((prev) => {
      if (viewMode === 'month') return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      if (viewMode === 'week') return addDays(prev, -7);
      if (viewMode === 'day') return addDays(prev, -1);
      return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
    });
  };

  const handleNext = () => {
    setCursorDate((prev) => {
      if (viewMode === 'month') return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      if (viewMode === 'week') return addDays(prev, 7);
      if (viewMode === 'day') return addDays(prev, 1);
      return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
    });
  };

  const periodTitle = useMemo(() => {
    if (viewMode === 'month' || viewMode === 'agenda') {
      return cursorDate.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const start = startOfWeekMonday(cursorDate);
      const end = addDays(start, 6);
      return `${formatDateDDMMYYYY(toIsoDate(start))} – ${formatDateDDMMYYYY(toIsoDate(end))}`;
    }
    return cursorDate.toLocaleDateString('en-MY', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, [cursorDate, viewMode]);

  // Month grid cells (Monday-first 6-week or 5-week grid)
  const monthDays = useMemo(() => {
    const firstOfMonth = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const gridStart = startOfWeekMonday(firstOfMonth);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(addDays(gridStart, i));
    }
    return cells;
  }, [cursorDate]);

  // Week days (Mon..Sun)
  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(cursorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursorDate]);

  // Modal open helpers
  const openCreateModal = (defaultDate?: string) => {
    if (isReadOnly) return;
    setEditingId(null);
    setFormType('Internal Event');
    setFormStaff('');
    setFormLabel('');
    const dt = defaultDate || toIsoDate(cursorDate);
    setFormStartDate(dt);
    setFormEndDate(dt);
    setFormNotes('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (ev: ParsedCalendarEvent) => {
    setEditingId(ev.raw.id);
    setFormType(ev.canonicalType);
    setFormStaff(ev.staffName);
    setFormLabel(ev.cleanLabel);
    setFormStartDate(ev.raw.startDate || todayIso);
    setFormEndDate(ev.raw.endDate || ev.raw.startDate || todayIso);
    setFormNotes(ev.raw.notes || '');
    setFormError('');
    setModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setFormError('');
    if (!formLabel.trim()) {
      setFormError('Please enter an event title / description.');
      return;
    }
    if (formType === 'Staff Availability' && !formStaff.trim()) {
      setFormError('Please select a staff member for Staff Availability.');
      return;
    }
    if (!formStartDate) {
      setFormError('Start Date is required.');
      return;
    }
    const effectiveEnd = formEndDate && formEndDate >= formStartDate ? formEndDate : formStartDate;

    setSaving(true);
    try {
      await saveCalendarEvent(
        {
          title: buildFormattedTitle(formType, formLabel, formStaff),
          eventType: formType,
          startDate: formStartDate,
          endDate: effectiveEnd,
          assignedTo: formStaff.trim(),
          notes: formNotes.trim(),
        },
        editingId ?? undefined
      );
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save calendar event.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintCalendar = () => {
    const cols = [
      { key: 'type', label: 'Event Type' },
      { key: 'title', label: 'Event Title' },
      { key: 'staff', label: 'Staff' },
      { key: 'start', label: 'Start Date' },
      { key: 'end', label: 'End Date' },
      { key: 'notes', label: 'Notes' },
    ];
    const rows = parsedEvents.map((e) => ({
      type: e.canonicalType,
      title: e.displayTitle,
      staff: e.staffName || '—',
      start: formatDateDDMMYYYY(e.raw.startDate),
      end: formatDateDDMMYYYY(e.raw.endDate || e.raw.startDate),
      notes: e.raw.notes || '',
    }));
    printRegisterHtml('Team Calendar Schedule', periodTitle, cols, rows, false);
  };

  const cursorIso = toIsoDate(cursorDate);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Team Calendar</h1>
          <p className="text-xs text-slate-500">
            Company holidays, staff leave/availability, and internal tax practice milestones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrintCalendar}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Print
          </button>
          <button
            type="button"
            onClick={() => exportCalendarCsv(parsedEvents)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            CSV Export
          </button>
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Event
            </button>
          )}
        </div>
      </div>

      {/* Controls Bar: Navigation + View Modes + Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden bg-white">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCursorDate(new Date())}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 border-x border-slate-200 hover:bg-slate-100"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-sm font-semibold text-slate-900 ml-1 whitespace-nowrap">
            {periodTitle}
          </span>
        </div>

        {/* View Mode Switcher */}
        <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors ${
                viewMode === m
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-44">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events..."
              className="w-full pl-7 pr-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as '' | CanonicalEventType)}
            className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Event Types</option>
            {CANONICAL_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Staff</option>
            {activeStaffNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {WEEKDAY_NAMES.map((wd) => (
              <div
                key={wd}
                className="py-2 px-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-r last:border-r-0 border-slate-200"
              >
                {wd}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
            {monthDays.map((dayObj) => {
              const iso = toIsoDate(dayObj);
              const inCurrentMonth = dayObj.getMonth() === cursorDate.getMonth();
              const isToday = iso === todayIso;
              const dayEvents = parsedEvents.filter((e) => eventCoversDate(e.raw, iso));
              const refHoliday = holidaysForYear.find((h) => h.date === iso);

              return (
                <div
                  key={iso}
                  onDoubleClick={() => openCreateModal(iso)}
                  className={`min-h-[96px] p-1.5 flex flex-col gap-1 ${
                    inCurrentMonth ? 'bg-white' : 'bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                        isToday
                          ? 'bg-teal-700 text-white font-bold'
                          : inCurrentMonth
                          ? 'text-slate-700 font-medium'
                          : 'text-slate-400'
                      }`}
                    >
                      {dayObj.getDate()}
                    </span>
                    {refHoliday && (
                      <span
                        title={`Reference Holiday: ${refHoliday.name}`}
                        className="text-[9px] font-medium text-rose-700 bg-rose-50 px-1 rounded truncate max-w-[90px]"
                      >
                        {refHoliday.name}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[72px]">
                    {dayEvents.map((ev) => (
                      <button
                        key={ev.raw.id}
                        type="button"
                        onClick={() => openEditModal(ev)}
                        className={`w-full text-left px-1.5 py-0.5 rounded border text-[10px] font-medium truncate ${getEventChipClasses(
                          ev.canonicalType
                        )}`}
                        title={ev.displayTitle}
                      >
                        {ev.displayTitle}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {weekDays.map((dayObj, idx) => {
              const iso = toIsoDate(dayObj);
              const isToday = iso === todayIso;
              const dayEvents = parsedEvents.filter((e) => eventCoversDate(e.raw, iso));
              const refHoliday = holidaysForYear.find((h) => h.date === iso);
              return (
                <div key={iso} className="min-h-[260px] flex flex-col">
                  <div
                    className={`px-2.5 py-2 border-b border-slate-200 flex items-center justify-between ${
                      isToday ? 'bg-teal-50' : 'bg-slate-50'
                    }`}
                  >
                    <span className="text-[11px] font-semibold text-slate-600">
                      {WEEKDAY_NAMES[idx]}
                    </span>
                    <span
                      className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded ${
                        isToday ? 'bg-teal-700 text-white font-bold' : 'text-slate-800'
                      }`}
                    >
                      {dayObj.getDate()}/{dayObj.getMonth() + 1}
                    </span>
                  </div>
                  <div className="p-2 space-y-1.5 flex-1">
                    {refHoliday && (
                      <div className="px-2 py-1 rounded bg-rose-50/70 border border-rose-100 text-[10px] text-rose-700">
                        MY Ref: {refHoliday.name}
                      </div>
                    )}
                    {dayEvents.length === 0 ? (
                      <div className="text-[11px] text-slate-300 text-center pt-6">—</div>
                    ) : (
                      dayEvents.map((ev) => (
                        <button
                          key={ev.raw.id}
                          type="button"
                          onClick={() => openEditModal(ev)}
                          className={`w-full text-left p-2 rounded border text-[11px] space-y-0.5 ${getEventChipClasses(
                            ev.canonicalType
                          )}`}
                        >
                          <div className="font-semibold leading-snug">{ev.displayTitle}</div>
                          {ev.raw.notes && (
                            <div className="text-[10px] opacity-80 truncate">{ev.raw.notes}</div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DAY VIEW */}
      {viewMode === 'day' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">
              Schedule for {formatDateDDMMYYYY(cursorIso)}
            </span>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => openCreateModal(cursorIso)}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
              >
                <Plus className="w-3.5 h-3.5" /> Add on this date
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {parsedEvents.filter((e) => eventCoversDate(e.raw, cursorIso)).length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                <CalendarIcon className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                No team events scheduled for {formatDateDDMMYYYY(cursorIso)}.
              </div>
            ) : (
              parsedEvents
                .filter((e) => eventCoversDate(e.raw, cursorIso))
                .map((ev) => (
                  <div
                    key={ev.raw.id}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getEventChipClasses(
                            ev.canonicalType
                          )}`}
                        >
                          {ev.canonicalType}
                        </span>
                        <span className="text-xs font-semibold text-slate-900">
                          {ev.displayTitle}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatDateDDMMYYYY(ev.raw.startDate)}
                        {ev.raw.endDate && ev.raw.endDate !== ev.raw.startDate
                          ? ` – ${formatDateDDMMYYYY(ev.raw.endDate)}`
                          : ''}
                        {ev.staffName ? ` • Staff: ${ev.staffName}` : ''}
                      </div>
                      {ev.raw.notes && <p className="text-xs text-slate-600">{ev.raw.notes}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditModal(ev)}
                      className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* AGENDA VIEW */}
      {viewMode === 'agenda' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-4">Start Date</th>
                  <th className="py-2.5 px-4">End Date</th>
                  <th className="py-2.5 px-4">Event Type</th>
                  <th className="py-2.5 px-4">Event Title</th>
                  <th className="py-2.5 px-4">Staff</th>
                  <th className="py-2.5 px-4">Notes</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {parsedEvents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      No matching calendar events.
                    </td>
                  </tr>
                ) : (
                  parsedEvents.map((ev) => (
                    <tr key={ev.raw.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatDateDDMMYYYY(ev.raw.startDate)}
                      </td>
                      <td className="py-2 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatDateDDMMYYYY(ev.raw.endDate || ev.raw.startDate)}
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getEventChipClasses(
                            ev.canonicalType
                          )}`}
                        >
                          {ev.canonicalType}
                        </span>
                      </td>
                      <td className="py-2 px-4 font-medium text-slate-900">{ev.displayTitle}</td>
                      <td className="py-2 px-4 text-slate-700 whitespace-nowrap">
                        {ev.staffName || '—'}
                      </td>
                      <td className="py-2 px-4 text-slate-600 max-w-[240px] truncate">
                        {ev.raw.notes || '—'}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(ev)}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            title="Edit Event"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {isManagerOrAdmin &&
                            (confirmDeleteId === ev.raw.id ? (
                              <span className="inline-flex items-center gap-0.5 bg-rose-50 border border-rose-200 rounded px-1 py-0.5">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await deleteCalendarEvent(ev.raw.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="p-0.5 text-rose-700 hover:bg-rose-100 rounded"
                                  title="Confirm Delete"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="p-0.5 text-slate-500 hover:bg-slate-200 rounded"
                                  title="Cancel"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(ev.raw.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                                title="Delete Event"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Compact Malaysia Public Holidays — Reference Only Panel */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flag className="w-3.5 h-3.5 text-rose-600" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Malaysia Public Holidays — Reference Only ({cursorDate.getFullYear()})
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            Reference guide for statutory filing & office scheduling
          </span>
        </div>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {holidaysForYear.map((h) => {
            const dt = new Date(`${h.date}T00:00:00Z`);
            const weekday = dt.toLocaleDateString('en-MY', {
              weekday: 'short',
              timeZone: 'UTC',
            });
            return (
              <div
                key={`${h.date}-${h.name}`}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border border-slate-100 bg-slate-50/70 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate" title={h.name}>
                    {h.name}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500">
                    {formatDateDDMMYYYY(h.date)} ({weekday})
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 shrink-0">
                  {h.scope}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Add / Edit Event Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingId ? 'Edit Calendar Event' : 'Add Team Calendar Event'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-4 space-y-3">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Event Type *
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as CanonicalEventType)}
                    disabled={isReadOnly}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                  >
                    {CANONICAL_EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Staff {formType === 'Staff Availability' ? '*' : '(Optional)'}
                  </label>
                  <select
                    value={formStaff}
                    onChange={(e) => setFormStaff(e.target.value)}
                    disabled={isReadOnly || formType === 'Company Holiday'}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md disabled:bg-slate-100"
                  >
                    <option value="">— Select Staff —</option>
                    {activeStaffNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Title / Description *
                </label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  disabled={isReadOnly}
                  placeholder={
                    formType === 'Company Holiday'
                      ? 'e.g. Company Replacement Holiday'
                      : formType === 'Staff Availability'
                      ? 'e.g. Annual Leave / Study Leave'
                      : 'e.g. Tax Department Briefing'
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                />
                <div className="mt-1 text-[10px] font-mono text-slate-400">
                  Saved format: {buildFormattedTitle(formType, formLabel || '...', formStaff)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => {
                      setFormStartDate(e.target.value);
                      if (!formEndDate || formEndDate < e.target.value) {
                        setFormEndDate(e.target.value);
                      }
                    }}
                    disabled={isReadOnly}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    min={formStartDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    disabled={isReadOnly}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Optional details or coverage instructions..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                {editingId && isManagerOrAdmin ? (
                  confirmDeleteId === editingId ? (
                    <div className="inline-flex items-center gap-1.5">
                      <span className="text-[11px] text-rose-700 font-medium">Confirm delete?</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteCalendarEvent(editingId);
                          setConfirmDeleteId(null);
                          setModalOpen(false);
                        }}
                        className="px-2 py-1 text-[11px] font-medium text-white bg-rose-600 rounded hover:bg-rose-700"
                      >
                        Yes, Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-[11px] text-slate-600 bg-slate-100 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(editingId)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    {isReadOnly ? 'Close' : 'Cancel'}
                  </button>
                  {!isReadOnly && (
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : editingId ? 'Save Event' : 'Create Event'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
