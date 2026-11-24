import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Save } from 'lucide-react';
import { CalendarEvent, ColumnDef } from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';

const EVENT_TYPES = [
  'Statutory Deadline',
  'Client Meeting',
  'LHDN Audit',
  'Team Leave',
  'Internal Review',
  'Training',
] as const;

const CALENDAR_LIST_COLS: ColumnDef[] = [
  { key: 'startDate', label: 'Start Date', defaultVisible: true },
  { key: 'endDate', label: 'End Date', defaultVisible: true },
  { key: 'eventType', label: 'Event Type', defaultVisible: true },
  { key: 'title', label: 'Event / Milestone', defaultVisible: true },
  { key: 'clientName', label: 'Client', defaultVisible: true },
  { key: 'assignedTo', label: 'Assigned PIC', defaultVisible: true },
  { key: 'notes', label: 'Notes', defaultVisible: false },
];

export const TeamCalendarView: React.FC = () => {
  const { isReadOnly, isManagerOrAdmin } = useAuth();
  const { calendarEvents, jobs, staff, clients, saveCalendarEvent, deleteCalendarEvent } = useData();

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [picFilter, setPicFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    title: '',
    eventType: 'Statutory Deadline',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    assignedTo: '',
    clientId: '',
    clientName: '',
    notes: '',
  });

  const colVis = useColumnVisibility('team_calendar', CALENDAR_LIST_COLS);

  // Merge manual events + open job due dates into unified schedule
  const combinedItems = useMemo(() => {
    const manual = calendarEvents.map((e) => ({
      id: e.id,
      source: 'event' as const,
      title: e.title,
      eventType: e.eventType,
      startDate: e.startDate,
      endDate: e.endDate,
      assignedTo: e.assignedTo || '',
      clientName: e.clientName || '',
      notes: e.notes || '',
      raw: e,
    }));

    const jobMilestones = jobs
      .filter((j) => j.dueDate)
      .map((j) => ({
        id: `job_${j.id}`,
        source: 'job' as const,
        title: `[${j.module}] ${j.jobCode}`,
        eventType: 'Job Due Date',
        startDate: j.dueDate!,
        endDate: j.dueDate!,
        assignedTo: j.taxPic || '',
        clientName: j.clientName,
        notes: `Status: ${j.status}`,
        raw: null as CalendarEvent | null,
      }));

    const q = search.trim().toLowerCase();
    return [...manual, ...jobMilestones]
      .filter((item) => {
        if (typeFilter && item.eventType !== typeFilter) return false;
        if (picFilter && item.assignedTo !== picFilter) return false;
        if (q) {
          const hay = [item.title, item.clientName, item.assignedTo, item.notes]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [calendarEvents, jobs, search, typeFilter, picFilter]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  const calendarCells = useMemo(() => {
    const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ dateStr: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ dateStr: `${year}-${mm}-${dd}`, dayNum: d });
    }
    return cells;
  }, [year, month, daysInMonth, firstWeekday]);

  const openNewEvent = (dateStr?: string) => {
    const d = dateStr || new Date().toISOString().slice(0, 10);
    setEditing(null);
    setForm({
      title: '',
      eventType: 'Statutory Deadline',
      startDate: d,
      endDate: d,
      assignedTo: '',
      clientId: '',
      clientName: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEditEvent = (ev: CalendarEvent) => {
    setEditing(ev);
    setForm({
      title: ev.title,
      eventType: ev.eventType,
      startDate: ev.startDate,
      endDate: ev.endDate,
      assignedTo: ev.assignedTo ?? '',
      clientId: ev.clientId ?? '',
      clientName: ev.clientName ?? '',
      notes: ev.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setBusy(true);
    try {
      await saveCalendarEvent(form, editing?.id);
      setModalOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const activeStaff = staff.filter((s) => s.active).map((s) => s.staffName);
  const activeCols = CALENDAR_LIST_COLS.filter((c) => colVis.visibleColumns[c.key]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Team Calendar</h2>
          <p className="text-xs text-slate-500">
            LHDN statutory deadlines, job due dates, audit visits, and staff leave schedule
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="p-1.5 border border-slate-200 bg-white rounded-md hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="font-display font-semibold text-xs text-slate-900 min-w-[130px] text-center">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="p-1.5 border border-slate-200 bg-white rounded-md hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            Today
          </button>
        </div>
      </div>

      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search events, job codes, clients, PIC..."
        hasActiveFilters={Boolean(search || typeFilter || picFilter)}
        onResetFilters={() => {
          setSearch('');
          setTypeFilter('');
          setPicFilter('');
        }}
        columns={CALENDAR_LIST_COLS}
        visibleColumns={colVis.visibleColumns}
        onToggleColumn={colVis.toggleColumn}
        onResetColumns={colVis.resetColumns}
        recordCount={combinedItems.length}
        totalCount={calendarEvents.length + jobs.filter((j) => j.dueDate).length}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_Team_Calendar_${year}-${String(month + 1).padStart(2, '0')}.xlsx`,
            'Team_Calendar',
            activeCols,
            combinedItems
          )
        }
        onPrint={() =>
          printRegisterHtml('Team Calendar', monthLabel, activeCols, combinedItems, false)
        }
        onSavePdf={() =>
          printRegisterHtml('Team Calendar', monthLabel, activeCols, combinedItems, true)
        }
        filters={
          <>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Event Types</option>
              <option value="Job Due Date">Job Due Date</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={picFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Staff</option>
              {activeStaff.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        }
        primaryAction={
          !isReadOnly ? (
            <button
              type="button"
              onClick={() => openNewEvent()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" /> Add Event
            </button>
          ) : undefined
        }
      />

      {/* Monthly Calendar Grid */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2.5 py-2 border-r border-slate-200 last:border-r-0">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
          {calendarCells.map((cell, idx) => {
            const dayItems = cell.dateStr
              ? combinedItems.filter(
                  (it) => it.startDate <= cell.dateStr! && it.endDate >= cell.dateStr!
                )
              : [];
            const isToday = cell.dateStr === new Date().toISOString().slice(0, 10);

            return (
              <div
                key={idx}
                className={`min-h-[96px] p-1.5 ${
                  cell.dateStr ? 'bg-white' : 'bg-slate-50/70'
                }`}
              >
                {cell.dayNum && (
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                        isToday
                          ? 'bg-teal-700 text-white font-bold'
                          : 'text-slate-600 font-medium'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => openNewEvent(cell.dateStr!)}
                        className="text-slate-300 hover:text-teal-700 p-0.5 no-print"
                        title="Add event on this date"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  {dayItems.slice(0, 3).map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => ev.raw && openEditEvent(ev.raw)}
                      className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate block ${
                        ev.source === 'job'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : ev.eventType === 'LHDN Audit'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : 'bg-teal-50 text-teal-800 border border-teal-200'
                      }`}
                      title={`${ev.title}${ev.clientName ? ` — ${ev.clientName}` : ''}`}
                    >
                      {ev.title}
                    </button>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="text-[10px] text-slate-400 px-1">
                      +{dayItems.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Event Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-slate-900">
                {editing ? 'Edit Calendar Event' : 'Add Team Calendar Event'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)} className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Event Title *
                </label>
                <input
                  required
                  disabled={isReadOnly}
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. LHDN Form E Statutory Cutoff"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Event Type
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={form.eventType}
                    onChange={(e) => setForm({ ...form, eventType: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Assigned PIC
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={form.assignedTo}
                    onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    <option value="">All Team</option>
                    {activeStaff.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    disabled={isReadOnly}
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    disabled={isReadOnly}
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Linked Client (Optional)
                </label>
                <select
                  disabled={isReadOnly}
                  value={form.clientId}
                  onChange={(e) => {
                    const found = clients.find((c) => c.clientId === e.target.value);
                    setForm({
                      ...form,
                      clientId: found?.clientId ?? '',
                      clientName: found?.clientName ?? '',
                    });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                >
                  <option value="">None</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.clientId}>
                      {c.clientId} — {c.clientName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  disabled={isReadOnly}
                  maxLength={1000}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  {editing && isManagerOrAdmin && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteCalendarEvent(editing.id);
                        setModalOpen(false);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md"
                  >
                    {isReadOnly ? 'Close' : 'Cancel'}
                  </button>
                  {!isReadOnly && (
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {busy ? 'Saving...' : 'Save Event'}
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
