import React, { useCallback, useMemo, useState } from 'react';
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
  FileText,
  FileSpreadsheet,
  ExternalLink,
  Palette,
} from 'lucide-react';
import {
  ClientRecord,
  NavigationFilterPreset,
  NavRoute,
  StaffMember,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  exportTableToPdf,
  exportToExcel,
  printTable,
  triggerBlobDownload,
} from '../../lib/exportUtils';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';
import { showToast } from '../../lib/toast';
import { ClientSelectorField } from '../../components/ClientSelectorField';
import { StaffMatrixView } from './StaffMatrixView';
import {
  addDays,
  addDaysIso,
  buildFormattedTitle,
  CalendarViewMode,
  CANONICAL_EVENT_TYPES,
  CanonicalEventType,
  computeOpenJobsByStaff,
  EVENT_COLOR_SWATCHES,
  EVENT_TYPE_DEFAULT_COLORS,
  eventCoversDate,
  getContrastingTextColor,
  getDefaultLeaveColor,
  getJohorMalaysiaPublicHolidays,
  getMonthDays,
  isValidHexColor,
  PaintTool,
  parseCalendarEvent,
  ParsedCalendarEvent,
  PublicHolidayRef,
  StaffMatrixRowSummary,
  startOfWeekMonday,
  toIsoDate,
} from './calendarUtils';
import {
  buildStaffMatrixExportModel,
  exportStaffMatrixToExcel,
  exportStaffMatrixToPdf,
  printStaffMatrix,
} from './staffMatrixExport';

interface TeamCalendarViewProps {
  onNavigate?: (route: NavRoute, preset?: Omit<NavigationFilterPreset, 'nonce'>) => void;
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const QUICK_LEAVE_CODES = ['AL', '1/2 AL', 'SL', 'MC', 'RL', 'UPL', 'WFH'] as const;

function isPoolOrSystemStaffAccount(s: StaffMember): boolean {
  const hasEmail = Boolean(s.email?.trim());
  const staffIdUpper = (s.staffId || '').trim().toUpperCase();
  return (
    !hasEmail ||
    s.noLogin === true ||
    s.role === 'Report Viewer' ||
    staffIdUpper === 'ADM'
  );
}

function exportCalendarCsv(events: ParsedCalendarEvent[]): void {
  try {
    const headers = [
      'Event Type',
      'Title',
      'Staff',
      'Client',
      'Start Date',
      'End Date',
      'Color',
      'Notes',
    ];
    const escapeCsv = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const lines = [
      headers.map(escapeCsv).join(','),
      ...events.map((e) =>
        [
          e.canonicalType,
          e.displayTitle,
          e.staffName,
          e.raw.clientName
            ? `${e.raw.clientId ? `${e.raw.clientId} — ` : ''}${e.raw.clientName}`
            : '',
          e.raw.startDate,
          e.raw.endDate || e.raw.startDate,
          e.color,
          e.raw.notes || '',
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];
    const filename = `TPMS_Team_Calendar_${new Date().toISOString().slice(0, 10)}.csv`;
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, filename);
    showToast(`Downloaded ${filename}`, 'success', 3200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`CSV export failed: ${msg}`, 'error');
  }
}

export const TeamCalendarView: React.FC<TeamCalendarViewProps> = ({ onNavigate }) => {
  const { isReadOnly, isManagerOrAdmin } = useAuth();
  const {
    calendarEvents,
    clients,
    staff,
    jobs,
    cp204Records,
    saveCalendarEvent,
    deleteCalendarEvent,
  } = useData();

  const [viewMode, setViewMode] = useState<CalendarViewMode>('matrix');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [showPoolAccounts, setShowPoolAccounts] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'' | CanonicalEventType>('');
  const [staffFilter, setStaffFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<CanonicalEventType>('Staff Availability');
  const [formStaff, setFormStaff] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formStartDate, setFormStartDate] = useState(() => toIsoDate(new Date()));
  const [formEndDate, setFormEndDate] = useState(() => toIsoDate(new Date()));
  const [formColor, setFormColor] = useState<string>(
    EVENT_TYPE_DEFAULT_COLORS['Staff Availability']
  );
  const [colorManuallyPicked, setColorManuallyPicked] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Inline delete confirm (agenda & modal)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmModalDelete, setConfirmModalDelete] = useState(false);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const activeStaff = useMemo(
    () =>
      staff
        .filter((s) => s.active)
        .sort((a, b) => a.staffName.localeCompare(b.staffName)),
    [staff]
  );

  const poolAccountCount = useMemo(
    () => activeStaff.filter(isPoolOrSystemStaffAccount).length,
    [activeStaff]
  );

  const matrixEligibleStaff = useMemo(() => {
    if (showPoolAccounts) return activeStaff;
    return activeStaff.filter((s) => !isPoolOrSystemStaffAccount(s));
  }, [activeStaff, showPoolAccounts]);

  const filteredMatrixStaff = useMemo(() => {
    if (!staffFilter) return matrixEligibleStaff;
    return matrixEligibleStaff.filter(
      (s) => s.staffName.toLowerCase() === staffFilter.toLowerCase()
    );
  }, [matrixEligibleStaff, staffFilter]);

  const handleTogglePoolAccounts = useCallback(() => {
    setShowPoolAccounts((prev) => {
      const next = !prev;
      if (!next && staffFilter) {
        const selected = activeStaff.find(
          (s) => s.staffName.toLowerCase() === staffFilter.toLowerCase()
        );
        if (selected && isPoolOrSystemStaffAccount(selected)) {
          setStaffFilter('');
        }
      }
      return next;
    });
  }, [activeStaff, staffFilter]);

  const activeStaffNames = useMemo(
    () => Array.from(new Set(activeStaff.map((s) => s.staffName.trim()).filter(Boolean))),
    [activeStaff]
  );

  const filterStaffNames = useMemo(
    () =>
      viewMode === 'matrix'
        ? Array.from(new Set(matrixEligibleStaff.map((s) => s.staffName.trim()).filter(Boolean)))
        : activeStaffNames,
    [viewMode, matrixEligibleStaff, activeStaffNames]
  );

  const allParsedEvents = useMemo(
    () =>
      calendarEvents
        .map(parseCalendarEvent)
        .sort((a, b) => a.raw.startDate.localeCompare(b.raw.startDate)),
    [calendarEvents]
  );

  const parsedEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allParsedEvents.filter((ev) => {
      if (typeFilter && ev.canonicalType !== typeFilter) return false;
      if (
        staffFilter &&
        !ev.isFirmWide &&
        ev.canonicalType !== 'Company Holiday' &&
        ev.staffName.toLowerCase() !== staffFilter.toLowerCase()
      ) {
        return false;
      }
      if (q) {
        const hay = `${ev.displayTitle} ${ev.canonicalType} ${ev.staffName} ${
          ev.raw.clientId || ''
        } ${ev.raw.clientName || ''} ${ev.raw.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allParsedEvents, typeFilter, staffFilter, search]);

  const holidaysForYear = useMemo(
    () => getJohorMalaysiaPublicHolidays(cursorDate.getFullYear()),
    [cursorDate]
  );

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, PublicHolidayRef>();
    for (const h of holidaysForYear) {
      if (!map.has(h.date)) {
        map.set(h.date, h);
      } else {
        const prev = map.get(h.date)!;
        map.set(h.date, { ...prev, name: `${prev.name} / ${h.name}` });
      }
    }
    return map;
  }, [holidaysForYear]);

  // Navigation handlers
  const handlePrev = () => {
    setCursorDate((prev) => {
      if (viewMode === 'matrix' || viewMode === 'month' || viewMode === 'agenda') {
        return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      }
      if (viewMode === 'week') return addDays(prev, -7);
      return addDays(prev, -1);
    });
  };

  const handleNext = () => {
    setCursorDate((prev) => {
      if (viewMode === 'matrix' || viewMode === 'month' || viewMode === 'agenda') {
        return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      }
      if (viewMode === 'week') return addDays(prev, 7);
      return addDays(prev, 1);
    });
  };

  const periodTitle = useMemo(() => {
    if (viewMode === 'matrix' || viewMode === 'month' || viewMode === 'agenda') {
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

  // Month grid cells (Monday-first 6-week grid)
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
  const openCreateModal = useCallback(
    (defaultDate?: string, defaultStaff?: string, defaultType?: CanonicalEventType) => {
      if (isReadOnly) return;
      const type: CanonicalEventType =
        defaultType ?? (defaultStaff ? 'Staff Availability' : 'Internal Event');
      setEditingId(null);
      setFormType(type);
      setFormStaff(defaultStaff ?? '');
      setFormClientId('');
      setFormClientName('');
      setFormLabel('');
      const dt = defaultDate || toIsoDate(cursorDate);
      setFormStartDate(dt);
      setFormEndDate(dt);
      setFormColor(EVENT_TYPE_DEFAULT_COLORS[type]);
      setColorManuallyPicked(false);
      setFormNotes('');
      setFormError('');
      setConfirmModalDelete(false);
      setModalOpen(true);
    },
    [cursorDate, isReadOnly]
  );

  const openEditModal = useCallback((ev: ParsedCalendarEvent) => {
    setEditingId(ev.raw.id);
    setFormType(ev.canonicalType);
    setFormStaff(ev.staffName);
    setFormClientId(ev.raw.clientId || '');
    setFormClientName(ev.raw.clientName || '');
    setFormLabel(ev.cleanLabel);
    setFormStartDate(ev.raw.startDate || toIsoDate(new Date()));
    setFormEndDate(ev.raw.endDate || ev.raw.startDate || toIsoDate(new Date()));
    setFormColor(ev.color);
    setColorManuallyPicked(Boolean(isValidHexColor(ev.raw.color)));
    setFormNotes(ev.raw.notes || '');
    setFormError('');
    setConfirmModalDelete(false);
    setModalOpen(true);
  }, []);

  const handleCellSelectModal = useCallback(
    (staffName: string, isoDate: string, existingEvent?: ParsedCalendarEvent) => {
      if (existingEvent) {
        openEditModal(existingEvent);
      } else {
        openCreateModal(
          isoDate,
          staffName,
          staffName ? 'Staff Availability' : 'Company Holiday'
        );
      }
    },
    [openCreateModal, openEditModal]
  );

  // Quick-Paint Drag Handler for Staff Matrix
  const handlePaintRange = useCallback(
    async (
      staffName: string,
      startIso: string,
      endIso: string,
      tool: Exclude<PaintTool, 'select'>
    ) => {
      if (isReadOnly) return;
      const staffLower = staffName.trim().toLowerCase();

      // Find overlapping Staff Availability events for this staff member
      const overlapping = allParsedEvents.filter((ev) => {
        if (ev.canonicalType !== 'Staff Availability') return false;
        if (ev.staffName.trim().toLowerCase() !== staffLower) return false;
        const evStart = (ev.raw.startDate || '').slice(0, 10);
        const evEnd = (ev.raw.endDate || evStart).slice(0, 10);
        return evStart <= endIso && evEnd >= startIso;
      });

      try {
        // Check if we can reuse an exact-range existing event when painting (also works for Staff without delete permission)
        let reusedEventId: string | undefined;
        let blockedDeletes = 0;

        for (const ev of overlapping) {
          const evStart = (ev.raw.startDate || '').slice(0, 10);
          const evEnd = (ev.raw.endDate || evStart).slice(0, 10);

          if (evStart >= startIso && evEnd <= endIso) {
            if (tool !== 'clear' && !reusedEventId && evStart === startIso && evEnd === endIso) {
              reusedEventId = ev.raw.id;
              continue;
            }
            if (isManagerOrAdmin) {
              await deleteCalendarEvent(ev.raw.id);
            } else {
              blockedDeletes += 1;
            }
          } else if (evStart < startIso && evEnd > endIso) {
            // Split into before + after segments
            await saveCalendarEvent(
              {
                title: ev.raw.title,
                eventType: ev.raw.eventType,
                startDate: evStart,
                endDate: addDaysIso(startIso, -1),
                assignedTo: ev.staffName,
                clientId: ev.raw.clientId || '',
                clientName: ev.raw.clientName || '',
                color: ev.color,
                notes: ev.raw.notes || '',
              },
              ev.raw.id
            );
            await saveCalendarEvent({
              title: ev.raw.title,
              eventType: ev.raw.eventType,
              startDate: addDaysIso(endIso, 1),
              endDate: evEnd,
              assignedTo: ev.staffName,
              clientId: ev.raw.clientId || '',
              clientName: ev.raw.clientName || '',
              color: ev.color,
              notes: ev.raw.notes || '',
            });
          } else if (evStart < startIso && evEnd >= startIso && evEnd <= endIso) {
            // Trim right side
            await saveCalendarEvent(
              {
                title: ev.raw.title,
                eventType: ev.raw.eventType,
                startDate: evStart,
                endDate: addDaysIso(startIso, -1),
                assignedTo: ev.staffName,
                clientId: ev.raw.clientId || '',
                clientName: ev.raw.clientName || '',
                color: ev.color,
                notes: ev.raw.notes || '',
              },
              ev.raw.id
            );
          } else if (evStart >= startIso && evStart <= endIso && evEnd > endIso) {
            // Trim left side
            await saveCalendarEvent(
              {
                title: ev.raw.title,
                eventType: ev.raw.eventType,
                startDate: addDaysIso(endIso, 1),
                endDate: evEnd,
                assignedTo: ev.staffName,
                clientId: ev.raw.clientId || '',
                clientName: ev.raw.clientName || '',
                color: ev.color,
                notes: ev.raw.notes || '',
              },
              ev.raw.id
            );
          }
        }

        if (tool === 'clear') {
          if (blockedDeletes > 0) {
            showToast(
              'Only Manager-HOD or Admin can delete calendar entries. Open the event to edit dates instead.',
              'warning',
              4500
            );
          } else if (overlapping.length > 0) {
            showToast(
              `Cleared ${staffName} (${formatDateDDMMYYYY(startIso)}${
                endIso !== startIso ? ` – ${formatDateDDMMYYYY(endIso)}` : ''
              })`,
              'success',
              2600
            );
          }
          return;
        }

        const paintColor = getDefaultLeaveColor(tool);
        await saveCalendarEvent(
          {
            title: buildFormattedTitle('Staff Availability', tool, staffName),
            eventType: 'Staff Availability',
            startDate: startIso,
            endDate: endIso,
            assignedTo: staffName,
            clientId: '',
            clientName: '',
            color: paintColor,
            notes: '',
          },
          reusedEventId
        );

        showToast(
          `Painted ${tool} for ${staffName} (${formatDateDDMMYYYY(startIso)}${
            endIso !== startIso ? ` – ${formatDateDDMMYYYY(endIso)}` : ''
          })`,
          'success',
          2600
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update schedule.';
        showToast(msg, 'error');
      }
    },
    [allParsedEvents, deleteCalendarEvent, isManagerOrAdmin, isReadOnly, saveCalendarEvent]
  );

  const handleEventTypeChange = (nextType: CanonicalEventType) => {
    setFormType(nextType);
    if (!colorManuallyPicked) {
      setFormColor(EVENT_TYPE_DEFAULT_COLORS[nextType]);
    }
    if (nextType === 'Company Holiday') {
      setFormStaff('');
      setFormClientId('');
      setFormClientName('');
    }
  };

  const handleSelectClient = (client: ClientRecord | null) => {
    if (!client) {
      setFormClientId('');
      setFormClientName('');
      return;
    }
    setFormClientId(client.clientId);
    setFormClientName(client.clientName);
    if (client.taxPic && !formStaff && formType !== 'Company Holiday') {
      setFormStaff(client.taxPic);
    }
    if (!formLabel.trim() && formType === 'Client Appointment') {
      setFormLabel(`${client.clientName} Meeting`);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setFormError('');
    if (!formLabel.trim() && !(formType === 'Client Appointment' && formClientName.trim())) {
      setFormError('Please enter an event title / description.');
      return;
    }
    if (formType === 'Staff Availability' && !formStaff.trim()) {
      setFormError('Please select a staff member for Staff Availability.');
      return;
    }
    if (formType === 'Client Appointment' && !formClientName.trim()) {
      setFormError('Please select a client for a Client Appointment.');
      return;
    }
    if (!formStartDate) {
      setFormError('Start Date is required.');
      return;
    }
    const effectiveEnd =
      formEndDate && formEndDate >= formStartDate ? formEndDate : formStartDate;

    const effectiveColor = isValidHexColor(formColor)
      ? formColor.trim()
      : EVENT_TYPE_DEFAULT_COLORS[formType];

    setSaving(true);
    try {
      await saveCalendarEvent(
        {
          title: buildFormattedTitle(formType, formLabel, formStaff, formClientName),
          eventType: formType,
          startDate: formStartDate,
          endDate: effectiveEnd,
          assignedTo: formType === 'Company Holiday' ? '' : formStaff.trim(),
          clientId: formType === 'Company Holiday' ? '' : formClientId.trim(),
          clientName: formType === 'Company Holiday' ? '' : formClientName.trim(),
          color: effectiveColor,
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

  const handleDeleteFromModal = async () => {
    if (!editingId || !isManagerOrAdmin) return;
    setSaving(true);
    try {
      await deleteCalendarEvent(editingId);
      setModalOpen(false);
      setConfirmModalDelete(false);
      showToast('Calendar event deleted.', 'success', 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete event.');
    } finally {
      setSaving(false);
    }
  };

  // Build rich Staff Matrix export model (2-row weekday/date header, colors, week dividers, holiday names, notes)
  const buildMatrixExportModel = () => {
    const year = cursorDate.getFullYear();
    const monthIndex = cursorDate.getMonth();
    const days = getMonthDays(year, monthIndex, includeWeekends);
    const monthWeekdays = getMonthDays(year, monthIndex, false);
    const openJobsByStaff = computeOpenJobsByStaff(jobs);

    let weekdayHolidayCount = 0;
    const weekdayHolidaySet = new Set<string>();
    for (const wd of monthWeekdays) {
      const iso = toIsoDate(wd);
      if (
        holidaysByDate.has(iso) ||
        parsedEvents.some(
          (e) => e.canonicalType === 'Company Holiday' && eventCoversDate(e.raw, iso)
        )
      ) {
        weekdayHolidayCount += 1;
        weekdayHolidaySet.add(iso);
      }
    }
    const baseWorkingDays = Math.max(0, monthWeekdays.length - weekdayHolidayCount);

    const rowSummaries: StaffMatrixRowSummary[] = filteredMatrixStaff.map((s) => {
      const staffKey = s.staffName.trim().toLowerCase();
      let leaveDays = 0;
      for (const wd of monthWeekdays) {
        const iso = toIsoDate(wd);
        if (weekdayHolidaySet.has(iso)) continue;
        let dayWeight = 0;
        for (const ev of parsedEvents) {
          if (ev.canonicalType !== 'Staff Availability') continue;
          if (ev.staffName.trim().toLowerCase() !== staffKey) continue;
          if (!eventCoversDate(ev.raw, iso)) continue;
          if (ev.leaveWeight > dayWeight) dayWeight = ev.leaveWeight;
        }
        leaveDays += dayWeight;
      }
      return {
        staff: s,
        workDays: Math.max(0, Math.round((baseWorkingDays - leaveDays) * 10) / 10),
        leaveDays: Math.round(leaveDays * 10) / 10,
        openJobs: openJobsByStaff.get(staffKey) ?? 0,
      };
    });

    return buildStaffMatrixExportModel({
      year,
      monthIndex,
      includeWeekends,
      days,
      activeStaff: filteredMatrixStaff,
      rowSummaries,
      holidaysByDate,
      parsedEvents,
    });
  };

  // Schedule list export builder for Month / Week / Day / Agenda views
  const buildScheduleExport = () => {
    const columns = [
      { key: 'type', label: 'Event Type' },
      { key: 'title', label: 'Event Title' },
      { key: 'staff', label: 'Staff' },
      { key: 'client', label: 'Client' },
      { key: 'start', label: 'Start Date' },
      { key: 'end', label: 'End Date' },
      { key: 'notes', label: 'Notes' },
    ];
    const rows = parsedEvents.map((e) => ({
      type: e.canonicalType,
      title: e.displayTitle,
      staff: e.staffName || '—',
      client: e.raw.clientName
        ? `${e.raw.clientId ? `${e.raw.clientId} — ` : ''}${e.raw.clientName}`
        : '—',
      start: formatDateDDMMYYYY(e.raw.startDate),
      end: formatDateDDMMYYYY(e.raw.endDate || e.raw.startDate),
      notes: e.raw.notes || '',
    }));
    const subtitle = [
      periodTitle,
      typeFilter ? `Type: ${typeFilter}` : '',
      staffFilter ? `Staff: ${staffFilter}` : '',
    ]
      .filter(Boolean)
      .join(' • ');

    return {
      title: 'Team Calendar Schedule',
      subtitle,
      columns,
      rows,
      sheetName: 'Team_Calendar',
      filenameBase: `TPMS_Team_Calendar_${new Date().toISOString().slice(0, 10)}`,
    };
  };

  const handleExportExcel = () => {
    if (viewMode === 'matrix') {
      void exportStaffMatrixToExcel(buildMatrixExportModel());
      return;
    }
    const exp = buildScheduleExport();
    exportToExcel(`${exp.filenameBase}.xlsx`, exp.sheetName, exp.columns, exp.rows);
    showToast(`Downloaded ${exp.filenameBase}.xlsx`, 'success', 3000);
  };

  const handlePrintCalendar = () => {
    if (viewMode === 'matrix') {
      printStaffMatrix(buildMatrixExportModel());
      return;
    }
    const exp = buildScheduleExport();
    printTable(exp.title, exp.subtitle, exp.columns, exp.rows, 'landscape');
  };

  const handleExportCalendarPdf = () => {
    if (viewMode === 'matrix') {
      exportStaffMatrixToPdf(buildMatrixExportModel());
      return;
    }
    const exp = buildScheduleExport();
    exportTableToPdf(exp.title, exp.subtitle, exp.columns, exp.rows, {
      orientation: 'landscape',
      filename: `${exp.filenameBase}.pdf`,
    });
  };

  const cursorIso = toIsoDate(cursorDate);

  const VIEW_OPTIONS: Array<{ id: CalendarViewMode; label: string }> = [
    { id: 'matrix', label: 'Staff Matrix' },
    { id: 'month', label: 'Month' },
    { id: 'week', label: 'Week' },
    { id: 'day', label: 'Day' },
    { id: 'agenda', label: 'Agenda' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Team Calendar</h1>
          <p className="text-xs text-slate-500">
            Smart staff availability matrix, Johor &amp; Malaysia public holidays, client appointments, and tax deadline collision alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={handleExportCalendarPdf}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-rose-700" />
            Export PDF
          </button>
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
            <Download className="w-3.5 h-3.5 text-slate-600" />
            CSV
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
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setViewMode(opt.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                viewMode === opt.id
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
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
              placeholder="Search events / client..."
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
            {filterStaffNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* STAFF MATRIX VIEW */}
      {viewMode === 'matrix' && (
        <StaffMatrixView
          year={cursorDate.getFullYear()}
          monthIndex={cursorDate.getMonth()}
          includeWeekends={includeWeekends}
          onToggleWeekends={() => setIncludeWeekends((v) => !v)}
          showPoolAccounts={showPoolAccounts}
          onTogglePoolAccounts={handleTogglePoolAccounts}
          canTogglePoolAccounts={isManagerOrAdmin}
          poolAccountCount={poolAccountCount}
          activeStaff={filteredMatrixStaff}
          parsedEvents={parsedEvents}
          holidaysByDate={holidaysByDate}
          jobs={jobs}
          cp204Records={cp204Records}
          clients={clients}
          isReadOnly={isReadOnly}
          onCellSelectModal={handleCellSelectModal}
          onPaintRange={handlePaintRange}
          onNavigate={onNavigate}
        />
      )}

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
              const refHoliday = holidaysByDate.get(iso);

              return (
                <div
                  key={iso}
                  onDoubleClick={() => openCreateModal(iso)}
                  className={`min-h-[104px] p-1.5 flex flex-col gap-1 ${
                    inCurrentMonth ? 'bg-white' : 'bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
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
                        title={`${refHoliday.name} (${refHoliday.scope})`}
                        className="text-[9px] font-semibold text-amber-950 bg-[#facc15] px-1.5 py-0.5 rounded truncate max-w-[105px]"
                      >
                        {refHoliday.name}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[82px]">
                    {dayEvents.map((ev) => {
                      const textColor = getContrastingTextColor(ev.color);
                      return (
                        <button
                          key={ev.raw.id}
                          type="button"
                          onClick={(e) => {
                            if (
                              ev.canonicalType === 'Client Appointment' &&
                              onNavigate &&
                              !e.shiftKey &&
                              (ev.raw.clientId || ev.raw.clientName)
                            ) {
                              onNavigate('client-master', {
                                search: ev.raw.clientId || ev.raw.clientName || '',
                              });
                              return;
                            }
                            openEditModal(ev);
                          }}
                          className="w-full text-left px-1.5 py-0.5 rounded border border-slate-900/15 text-[10px] font-medium truncate flex items-center justify-between gap-1 hover:brightness-95"
                          style={{ backgroundColor: ev.color, color: textColor }}
                          title={
                            ev.canonicalType === 'Client Appointment'
                              ? `${ev.displayTitle} — Client: ${ev.raw.clientName || ''} (Click to open Client Master; Shift+Click to edit)`
                              : ev.displayTitle
                          }
                        >
                          <span className="truncate">{ev.displayTitle}</span>
                          {ev.canonicalType === 'Client Appointment' && (
                            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                          )}
                        </button>
                      );
                    })}
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
              const refHoliday = holidaysByDate.get(iso);
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
                      <div className="px-2 py-1 rounded bg-[#facc15] border border-amber-400 text-[10px] font-semibold text-amber-950">
                        {refHoliday.scope}: {refHoliday.name}
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
                          className="w-full text-left p-2 rounded border border-slate-900/15 text-[11px] space-y-0.5 hover:brightness-95"
                          style={{
                            backgroundColor: ev.color,
                            color: getContrastingTextColor(ev.color),
                          }}
                        >
                          <div className="font-semibold leading-snug">{ev.displayTitle}</div>
                          {ev.raw.clientName && (
                            <div className="text-[10px] opacity-90 truncate">
                              Client: {ev.raw.clientName}
                            </div>
                          )}
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
                          className="inline-flex items-center px-2 py-0.5 rounded border border-slate-900/15 text-[11px] font-semibold"
                          style={{
                            backgroundColor: ev.color,
                            color: getContrastingTextColor(ev.color),
                          }}
                        >
                          {ev.canonicalType}
                        </span>
                        <span className="text-xs font-semibold text-slate-900">
                          {ev.displayTitle}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>
                          {formatDateDDMMYYYY(ev.raw.startDate)}
                          {ev.raw.endDate && ev.raw.endDate !== ev.raw.startDate
                            ? ` – ${formatDateDDMMYYYY(ev.raw.endDate)}`
                            : ''}
                        </span>
                        {ev.staffName && <span>• Staff: {ev.staffName}</span>}
                        {ev.raw.clientName && (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate?.('client-master', {
                                search: ev.raw.clientId || ev.raw.clientName || '',
                              })
                            }
                            className="inline-flex items-center gap-1 text-teal-700 hover:underline font-medium"
                          >
                            • Client: {ev.raw.clientName}
                            {ev.raw.clientId ? ` (${ev.raw.clientId})` : ''}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
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
                  <th className="py-2.5 px-4">Client</th>
                  <th className="py-2.5 px-4">Notes</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {parsedEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
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
                          className="inline-flex items-center px-2 py-0.5 rounded border border-slate-900/15 text-[11px] font-semibold"
                          style={{
                            backgroundColor: ev.color,
                            color: getContrastingTextColor(ev.color),
                          }}
                        >
                          {ev.canonicalType}
                        </span>
                      </td>
                      <td className="py-2 px-4 font-medium text-slate-900">{ev.displayTitle}</td>
                      <td className="py-2 px-4 text-slate-700 whitespace-nowrap">
                        {ev.staffName || '—'}
                      </td>
                      <td className="py-2 px-4 text-slate-700 whitespace-nowrap">
                        {ev.raw.clientName ? (
                          <button
                            type="button"
                            onClick={() =>
                              onNavigate?.('client-master', {
                                search: ev.raw.clientId || ev.raw.clientName || '',
                              })
                            }
                            className="text-left group"
                          >
                            <div className="font-medium text-teal-800 group-hover:underline inline-flex items-center gap-1">
                              {ev.raw.clientName}
                              <ExternalLink className="w-3 h-3 opacity-70" />
                            </div>
                            {ev.raw.clientId && (
                              <div className="text-[10px] font-mono text-slate-400">
                                {ev.raw.clientId}
                              </div>
                            )}
                          </button>
                        ) : (
                          '—'
                        )}
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

      {/* Johor & Malaysia Public Holidays — Reference Panel */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flag className="w-3.5 h-3.5 text-amber-600" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Johor &amp; Malaysia Federal Public Holidays ({cursorDate.getFullYear()})
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            Includes automatic Monday replacement holidays for Sunday observances
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
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-medium ${
                    h.scope === 'Johor'
                      ? 'bg-sky-50 border-sky-200 text-sky-800'
                      : h.scope === 'Replacement'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-xs border border-slate-900/20"
                  style={{ backgroundColor: formColor }}
                />
                <h3 className="text-sm font-semibold text-slate-900">
                  {editingId ? 'Edit Calendar Event' : 'Add Team Calendar Event'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-4 space-y-3.5 overflow-y-auto">
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
                    onChange={(e) => handleEventTypeChange(e.target.value as CanonicalEventType)}
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
                    <option value="">
                      {formType === 'Internal Event'
                        ? '— Firm-Wide (All Staff) —'
                        : '— Select Staff —'}
                    </option>
                    {activeStaffNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Client Selector — prominent for Client Appointment, optional for Internal Event / Staff Availability */}
              {formType !== 'Company Holiday' && (
                <div
                  className={
                    formType === 'Client Appointment'
                      ? 'p-2.5 rounded-lg bg-sky-50/70 border border-sky-200'
                      : ''
                  }
                >
                  <ClientSelectorField
                    clients={clients}
                    value={formClientId}
                    onSelectClient={handleSelectClient}
                    label={
                      formType === 'Client Appointment'
                        ? 'Linked Client'
                        : 'Linked Client (Optional — for Client Meetings)'
                    }
                    required={formType === 'Client Appointment'}
                    disabled={isReadOnly}
                    placeholder="Search client by ID, Name, Company No, or TIN..."
                  />
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Event Title / Description *
                  </label>
                  {formType === 'Staff Availability' && !isReadOnly && (
                    <div className="flex flex-wrap items-center gap-1">
                      {QUICK_LEAVE_CODES.map((code) => {
                        const swatchColor = getDefaultLeaveColor(code);
                        const isSelected = formLabel.trim().toUpperCase() === code;
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => {
                              setFormLabel(code);
                              if (!colorManuallyPicked) {
                                setFormColor(swatchColor);
                              }
                            }}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                              isSelected
                                ? 'bg-teal-700 text-white border-teal-700'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span
                              className="w-2 h-2 rounded-xs border border-slate-900/20 shrink-0"
                              style={{ backgroundColor: swatchColor }}
                            />
                            {code}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setFormLabel(nextVal);
                    if (formType === 'Staff Availability' && !colorManuallyPicked) {
                      setFormColor(getDefaultLeaveColor(nextVal));
                    }
                  }}
                  disabled={isReadOnly}
                  placeholder={
                    formType === 'Staff Availability'
                      ? 'e.g. AL, 1/2 AL, SL, MC, RL, UPL, WFH, or custom leave'
                      : formType === 'Client Appointment'
                      ? 'e.g. 1:20pm Tax Computation Sign-off'
                      : formType === 'Company Holiday'
                      ? 'e.g. Company Annual Dinner Off-Day'
                      : 'e.g. LHDN e-Invoice Seminar (Firm-Wide)'
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                />
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
                      const next = e.target.value;
                      setFormStartDate(next);
                      if (!formEndDate || formEndDate < next) setFormEndDate(next);
                    }}
                    disabled={isReadOnly}
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    End Date *
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

              {/* Quick Color Swatch Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                    <Palette className="w-3.5 h-3.5 text-slate-500" />
                    Cell / Event Color
                  </label>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-900/15"
                    style={{
                      backgroundColor: formColor,
                      color: getContrastingTextColor(formColor),
                    }}
                  >
                    {formLabel.trim() || formType}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {EVENT_COLOR_SWATCHES.map((sw) => {
                    const selected = formColor.toLowerCase() === sw.hex.toLowerCase();
                    return (
                      <button
                        key={sw.hex}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => {
                          setFormColor(sw.hex);
                          setColorManuallyPicked(true);
                        }}
                        title={sw.label}
                        className={`w-6 h-6 rounded-md border transition-transform ${
                          selected
                            ? 'ring-2 ring-offset-1 ring-teal-700 border-slate-900 scale-105'
                            : 'border-slate-300 hover:scale-105'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    );
                  })}
                  <input
                    type="color"
                    disabled={isReadOnly}
                    value={isValidHexColor(formColor) ? formColor : '#22d3ee'}
                    onChange={(e) => {
                      setFormColor(e.target.value);
                      setColorManuallyPicked(true);
                    }}
                    title="Pick custom color"
                    className="w-7 h-6 p-0 border border-slate-200 rounded cursor-pointer bg-white"
                  />
                  <span className="text-[11px] font-mono text-slate-500">{formColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Optional meeting venue, seminar notes, or coverage instructions..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <div>
                  {editingId && isManagerOrAdmin && (
                    confirmModalDelete ? (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[11px] text-rose-700 font-medium">Delete event?</span>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDeleteFromModal()}
                          className="px-2 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded hover:bg-rose-700"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmModalDelete(false)}
                          className="px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmModalDelete(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  {!isReadOnly && (
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Event'}
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
