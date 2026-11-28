import React, { useCallback, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
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
  Repeat2,
  Users,
} from 'lucide-react';
import {
  CalendarEvent,
  ClientRecord,
  NavigationFilterPreset,
  NavRoute,
  StaffMember,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  exportToExcel,
  triggerBlobDownload,
} from '../../lib/exportUtils';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';
import { showToast } from '../../lib/toast';
import { ClientSelectorField } from '../../components/ClientSelectorField';
import { StaffMatrixView } from './StaffMatrixView';
import {
  addDays,
  addDaysIso,
  buildConfigFromPreset,
  buildFormattedTitle,
  buildRRuleString,
  CalendarViewMode,
  CANONICAL_EVENT_TYPES,
  CanonicalEventType,
  computeOpenJobsByStaff,
  computeStaffRowSummaries,
  createDefaultRecurrenceConfig,
  defaultNeverHorizonForDate,
  defaultRepeatUntilForDate,
  detectPresetFromConfig,
  diffDaysIso,
  EVENT_COLOR_SWATCHES,
  EVENT_TYPE_DEFAULT_COLORS,
  eventCoversDate,
  formatRecurrenceRuleLabel,
  formatRecurrenceSummary,
  generateBatchGroupId,
  generateRecurrenceGroupId,
  generateRRuleOccurrences,
  getBatchSiblingEvents,
  getContrastingTextColor,
  getDefaultLeaveColor,
  getDistinctStaffInBatch,
  getGoogleRecurrencePresetOptions,
  getJohorMalaysiaPublicHolidays,
  getMonthDays,
  getNthWeekdayInfo,
  getWeekdayCodeFromDate,
  isStaffVisibleInMonth,
  isValidHexColor,
  PaintTool,
  parseCalendarEvent,
  ParsedCalendarEvent,
  parseIsoDateLocal,
  parseRRuleString,
  PublicHolidayRef,
  RecurrenceConfig,
  RecurrenceEndMode,
  RecurrenceFreq,
  RecurrenceMonthlyMode,
  RecurrencePresetKey,
  startOfWeekMonday,
  toIsoDate,
  WEEKDAY_BUTTONS,
  WeekdayCode,
} from './calendarUtils';
import {
  buildMonthCalendarExportModel,
  buildStaffMatrixExportModel,
  exportMonthCalendarToPdf,
  exportStaffMatrixToExcel,
  exportStaffMatrixToPdf,
  printMonthCalendar,
  printStaffMatrix,
} from './staffMatrixExport';

interface TeamCalendarViewProps {
  onNavigate?: (route: NavRoute, preset?: Omit<NavigationFilterPreset, 'nonce'>) => void;
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const QUICK_LEAVE_CODES = ['AL', '1/2 AL', 'SL', 'MC', 'RL', 'UPL', 'WFH', 'TO'] as const;

const SYSTEM_ACCOUNT_IDS = new Set(['ADM', 'TEMP', 'TO ASSIGN', 'TO_ASSIGN']);
const SYSTEM_ACCOUNT_NAMES = new Set([
  'adm',
  'temp',
  'to assign',
  'admin user',
  'temporary pic',
]);

function isPoolOrSystemStaffAccount(s: StaffMember): boolean {
  const hasEmail = Boolean(s.email?.trim());
  const staffIdUpper = (s.staffId || '').trim().toUpperCase();
  const staffNameLower = (s.staffName || '').trim().toLowerCase();
  return (
    !hasEmail ||
    s.noLogin === true ||
    s.role === 'Report Viewer' ||
    SYSTEM_ACCOUNT_IDS.has(staffIdUpper) ||
    SYSTEM_ACCOUNT_NAMES.has(staffNameLower)
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
    batchSaveCalendarEvents,
    batchUpdateCalendarEvents,
    deleteCalendarEvent,
    batchDeleteCalendarEvents,
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
  const [editingEvent, setEditingEvent] = useState<ParsedCalendarEvent | null>(null);
  const [formType, setFormType] = useState<CanonicalEventType>('Staff Availability');
  const [formSelectedStaff, setFormSelectedStaff] = useState<string[]>([]);
  const [formClientId, setFormClientId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formStartDate, setFormStartDate] = useState(() => toIsoDate(new Date()));
  const [formEndDate, setFormEndDate] = useState(() => toIsoDate(new Date()));
  const [recurrenceConfig, setRecurrenceConfig] = useState<RecurrenceConfig>(() =>
    createDefaultRecurrenceConfig(toIsoDate(new Date()))
  );
  const [customRecurrenceOpen, setCustomRecurrenceOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<RecurrenceConfig>(() =>
    createDefaultRecurrenceConfig(toIsoDate(new Date()))
  );
  const [formColor, setFormColor] = useState<string>(
    EVENT_TYPE_DEFAULT_COLORS['Staff Availability']
  );
  const [colorManuallyPicked, setColorManuallyPicked] = useState(false);
  const [formTimeOffNote, setFormTimeOffNote] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [holidaysExpanded, setHolidaysExpanded] = useState(false);
  const [showModalSystemAccounts, setShowModalSystemAccounts] = useState(false);
  const [showOptionalClient, setShowOptionalClient] = useState(false);

  // Inline delete confirm (agenda & modal) + unified multi-staff & recurring scope dialog
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmModalDelete, setConfirmModalDelete] = useState(false);
  const [seriesScopeChoice, setSeriesScopeChoice] = useState<'this' | 'following' | 'all'>('this');
  const [batchScopeChoice, setBatchScopeChoice] = useState<'this' | 'all'>('this');
  const [seriesScopePrompt, setSeriesScopePrompt] = useState<{
    action: 'save' | 'delete';
    targetEvent: ParsedCalendarEvent;
    hasSeries: boolean;
    hasBatch: boolean;
    seriesIds: string[];
    followingIds: string[];
    batchStaffNames: string[];
    batchAllIds: string[];
    batchSameDateIds: string[];
    batchFollowingIds: string[];
  } | null>(null);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const activeStaff = useMemo(
    () =>
      staff
        .filter((s) => s.active)
        .sort((a, b) => a.staffName.localeCompare(b.staffName)),
    [staff]
  );

  // Staff visible in the currently selected month (respects Join Date & Leave Date, preserving resigned staff in historical months)
  const monthVisibleStaff = useMemo(() => {
    const yr = cursorDate.getFullYear();
    const mo = cursorDate.getMonth();
    return staff
      .filter((s) => isStaffVisibleInMonth(s, yr, mo))
      .sort((a, b) => a.staffName.localeCompare(b.staffName));
  }, [staff, cursorDate]);

  const poolAccountCount = useMemo(
    () => monthVisibleStaff.filter(isPoolOrSystemStaffAccount).length,
    [monthVisibleStaff]
  );

  const matrixEligibleStaff = useMemo(() => {
    if (showPoolAccounts) return monthVisibleStaff;
    return monthVisibleStaff.filter((s) => !isPoolOrSystemStaffAccount(s));
  }, [monthVisibleStaff, showPoolAccounts]);

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
        const selected = monthVisibleStaff.find(
          (s) => s.staffName.toLowerCase() === staffFilter.toLowerCase()
        );
        if (selected && isPoolOrSystemStaffAccount(selected)) {
          setStaffFilter('');
        }
      }
      return next;
    });
  }, [monthVisibleStaff, staffFilter]);

  const activeStaffNames = useMemo(
    () => Array.from(new Set(activeStaff.map((s) => s.staffName.trim()).filter(Boolean))),
    [activeStaff]
  );

  const modalSystemAccountCount = useMemo(
    () => activeStaff.filter(isPoolOrSystemStaffAccount).length,
    [activeStaff]
  );

  const visibleModalStaffOptions = useMemo(() => {
    const byName = new Map<string, { staffId: string; staffName: string; isSystem: boolean }>();
    for (const s of activeStaff) {
      const name = s.staffName.trim();
      if (!name) continue;
      if (!byName.has(name)) {
        byName.set(name, {
          staffId: (s.staffId || '').trim(),
          staffName: name,
          isSystem: isPoolOrSystemStaffAccount(s),
        });
      }
    }
    for (const sel of formSelectedStaff) {
      const trimmed = sel.trim();
      if (!trimmed || byName.has(trimmed)) continue;
      const match = staff.find((s) => s.staffName.trim().toLowerCase() === trimmed.toLowerCase());
      byName.set(trimmed, {
        staffId: (match?.staffId || '').trim(),
        staffName: trimmed,
        isSystem: false,
      });
    }
    return Array.from(byName.values())
      .filter(
        (item) =>
          showModalSystemAccounts || !item.isSystem || formSelectedStaff.includes(item.staffName)
      )
      .sort((a, b) => a.staffName.localeCompare(b.staffName));
  }, [activeStaff, staff, formSelectedStaff, showModalSystemAccounts]);

  const batchStaffMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const groupIds = new Set<string>();
    for (const ev of calendarEvents) {
      if (ev.batchGroupId) groupIds.add(ev.batchGroupId);
    }
    for (const gid of groupIds) {
      const staffList = getDistinctStaffInBatch(calendarEvents, gid);
      if (staffList.length > 1) {
        map.set(gid, staffList);
      }
    }
    return map;
  }, [calendarEvents]);

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
        ev.canonicalType !== 'Tax Due Date' &&
        ev.staffName.toLowerCase() !== staffFilter.toLowerCase()
      ) {
        return false;
      }
      if (q) {
        const hay = `${ev.displayTitle} ${ev.canonicalType} ${ev.staffName} ${
          ev.raw.clientId || ''
        } ${ev.raw.clientName || ''} ${ev.raw.timeOffNote || ''} ${ev.raw.notes || ''}`.toLowerCase();
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

  // Helper to get all events in the same recurrence series (sorted chronologically)
  const getSeriesEvents = useCallback(
    (recurrenceGroupId?: string) => {
      if (!recurrenceGroupId) return [];
      return calendarEvents
        .filter((e) => e.recurrenceGroupId === recurrenceGroupId)
        .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    },
    [calendarEvents]
  );

  // Modal open helpers
  const openCreateModal = useCallback(
    (defaultDate?: string, defaultStaff?: string, defaultType?: CanonicalEventType) => {
      if (isReadOnly) return;
      const type: CanonicalEventType =
        defaultType ?? (defaultStaff ? 'Staff Availability' : 'Internal Event');
      setEditingId(null);
      setEditingEvent(null);
      setFormType(type);
      const initialStaff =
        type === 'Company Holiday' || type === 'Tax Due Date'
          ? []
          : defaultStaff?.trim()
          ? [defaultStaff.trim()]
          : [];
      setFormSelectedStaff(initialStaff);
      setFormClientId('');
      setFormClientName('');
      setFormLabel('');
      const dt = defaultDate || toIsoDate(cursorDate);
      setFormStartDate(dt);
      setFormEndDate(dt);
      setRecurrenceConfig(createDefaultRecurrenceConfig(dt));
      setCustomRecurrenceOpen(false);
      setFormColor(EVENT_TYPE_DEFAULT_COLORS[type]);
      setColorManuallyPicked(false);
      setFormTimeOffNote('');
      setFormNotes('');
      setFormError('');
      setConfirmModalDelete(false);
      setSeriesScopePrompt(null);
      setShowModalSystemAccounts(false);
      setShowOptionalClient(type === 'Client Appointment');
      setModalOpen(true);
    },
    [cursorDate, isReadOnly]
  );

  const openEditModal = useCallback(
    (ev: ParsedCalendarEvent) => {
      const startIso = ev.raw.startDate || toIsoDate(new Date());
      const parsedConfig = parseRRuleString(
        ev.raw.recurrenceRule,
        startIso,
        ev.raw.recurrenceUntil
      );
      const batchStaff = getDistinctStaffInBatch(calendarEvents, ev.raw.batchGroupId);
      const initialStaff =
        ev.canonicalType === 'Company Holiday' || ev.canonicalType === 'Tax Due Date'
          ? []
          : batchStaff.length > 1
          ? batchStaff
          : ev.staffName
          ? [ev.staffName]
          : [];

      setEditingId(ev.raw.id);
      setEditingEvent(ev);
      setFormType(ev.canonicalType);
      setFormSelectedStaff(initialStaff);
      setFormClientId(ev.raw.clientId || '');
      setFormClientName(ev.raw.clientName || '');
      setFormLabel(ev.cleanLabel);
      setFormStartDate(startIso);
      setFormEndDate(ev.raw.endDate || startIso);
      setRecurrenceConfig(parsedConfig);
      setCustomRecurrenceOpen(false);
      setFormColor(ev.color);
      setColorManuallyPicked(Boolean(isValidHexColor(ev.raw.color)));
      setFormTimeOffNote(ev.raw.timeOffNote || '');
      setFormNotes(ev.raw.notes || '');
      setFormError('');
      setConfirmModalDelete(false);
      setSeriesScopePrompt(null);
      setShowModalSystemAccounts(false);
      setShowOptionalClient(
        ev.canonicalType === 'Client Appointment' || Boolean(ev.raw.clientId?.trim())
      );
      setModalOpen(true);
    },
    [calendarEvents]
  );

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

      // Find overlapping Staff Availability / Time-Off events for this staff member
      const overlapping = allParsedEvents.filter((ev) => {
        if (
          ev.canonicalType !== 'Staff Availability' &&
          ev.canonicalType !== 'Time-Off / Replace'
        ) {
          return false;
        }
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
                timeOffNote: ev.raw.timeOffNote || '',
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
              timeOffNote: ev.raw.timeOffNote || '',
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
                timeOffNote: ev.raw.timeOffNote || '',
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
                timeOffNote: ev.raw.timeOffNote || '',
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

        const isToPaint = tool === 'TO';
        const targetEventType: CanonicalEventType = isToPaint
          ? 'Time-Off / Replace'
          : 'Staff Availability';
        const paintColor = isToPaint
          ? EVENT_TYPE_DEFAULT_COLORS['Time-Off / Replace']
          : getDefaultLeaveColor(tool);
        await saveCalendarEvent(
          {
            title: buildFormattedTitle(targetEventType, tool, staffName),
            eventType: targetEventType,
            startDate: startIso,
            endDate: endIso,
            assignedTo: staffName,
            clientId: '',
            clientName: '',
            color: paintColor,
            timeOffNote: '',
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
    if (nextType === 'Time-Off / Replace' && !formLabel.trim()) {
      setFormLabel('TO');
    }
    if (nextType === 'Company Holiday') {
      setFormSelectedStaff([]);
      setFormClientId('');
      setFormClientName('');
      setShowOptionalClient(false);
    } else if (nextType === 'Tax Due Date') {
      setFormSelectedStaff([]);
    } else if (nextType === 'Client Appointment') {
      setShowOptionalClient(true);
    }
  };

  const handleToggleStaffSelection = (staffName: string) => {
    setFormSelectedStaff((prev) =>
      prev.includes(staffName) ? prev.filter((s) => s !== staffName) : [...prev, staffName]
    );
  };

  const handleSelectClient = (client: ClientRecord | null) => {
    if (!client) {
      setFormClientId('');
      setFormClientName('');
      return;
    }
    setFormClientId(client.clientId);
    setFormClientName(client.clientName);
    if (
      client.taxPic &&
      formSelectedStaff.length === 0 &&
      formType !== 'Company Holiday' &&
      formType !== 'Tax Due Date'
    ) {
      setFormSelectedStaff([client.taxPic]);
    }
    if (!formLabel.trim() && formType === 'Client Appointment') {
      setFormLabel(`${client.clientName} Meeting`);
    }
  };

  const recurrencePresetOptions = useMemo(
    () => getGoogleRecurrencePresetOptions(formStartDate),
    [formStartDate]
  );

  const detectedPreset = useMemo(
    () => detectPresetFromConfig(recurrenceConfig, formStartDate),
    [recurrenceConfig, formStartDate]
  );

  const recurrenceSummary = useMemo(
    () => formatRecurrenceSummary(recurrenceConfig, formStartDate),
    [recurrenceConfig, formStartDate]
  );

  const previewOccurrences = useMemo(() => {
    if (!formStartDate || !recurrenceConfig.enabled) return [];
    const effectiveEnd =
      formEndDate && formEndDate >= formStartDate ? formEndDate : formStartDate;
    return generateRRuleOccurrences(formStartDate, effectiveEnd, recurrenceConfig);
  }, [formStartDate, formEndDate, recurrenceConfig]);

  const customDraftSummary = useMemo(
    () => formatRecurrenceSummary({ ...customDraft, enabled: true }, formStartDate),
    [customDraft, formStartDate]
  );

  const customDraftOccurrences = useMemo(() => {
    if (!formStartDate) return [];
    const effectiveEnd =
      formEndDate && formEndDate >= formStartDate ? formEndDate : formStartDate;
    return generateRRuleOccurrences(formStartDate, effectiveEnd, {
      ...customDraft,
      enabled: true,
    });
  }, [formStartDate, formEndDate, customDraft]);

  const openCustomRecurrenceDialog = useCallback(() => {
    const base = recurrenceConfig.enabled
      ? {
          ...recurrenceConfig,
          byWeekdays: [...recurrenceConfig.byWeekdays],
        }
      : {
          ...createDefaultRecurrenceConfig(formStartDate),
          enabled: true,
        };
    if (!base.untilDate || base.untilDate < formStartDate) {
      base.untilDate = defaultRepeatUntilForDate(formStartDate);
    }
    setCustomDraft(base);
    setCustomRecurrenceOpen(true);
  }, [recurrenceConfig, formStartDate]);

  const editingSeriesEvents = useMemo(
    () => getSeriesEvents(editingEvent?.raw.recurrenceGroupId),
    [editingEvent, getSeriesEvents]
  );

  const editingBatchSiblings = useMemo(
    () => getBatchSiblingEvents(calendarEvents, editingEvent?.raw.batchGroupId),
    [calendarEvents, editingEvent]
  );

  const editingBatchStaff = useMemo(
    () => getDistinctStaffInBatch(calendarEvents, editingEvent?.raw.batchGroupId),
    [calendarEvents, editingEvent]
  );

  const buildBaseEventFieldsForStaff = (staffName: string) => {
    const effectiveEnd =
      formEndDate && formEndDate >= formStartDate ? formEndDate : formStartDate;
    const effectiveColor = isValidHexColor(formColor)
      ? formColor.trim()
      : EVENT_TYPE_DEFAULT_COLORS[formType];
    const isToEntry =
      formType === 'Time-Off / Replace' ||
      (formType === 'Staff Availability' && formLabel.trim().toUpperCase() === 'TO');
    const resolvedType: CanonicalEventType = isToEntry ? 'Time-Off / Replace' : formType;
    const resolvedStaff =
      resolvedType === 'Company Holiday' || resolvedType === 'Tax Due Date'
        ? ''
        : staffName.trim();
    return {
      title: buildFormattedTitle(
        resolvedType,
        formLabel || (isToEntry ? 'TO' : ''),
        resolvedStaff,
        formClientName
      ),
      eventType: resolvedType,
      startDate: formStartDate,
      endDate: effectiveEnd,
      assignedTo: resolvedStaff,
      clientId: resolvedType === 'Company Holiday' ? '' : formClientId.trim(),
      clientName: resolvedType === 'Company Holiday' ? '' : formClientName.trim(),
      color: effectiveColor,
      timeOffNote: isToEntry ? formTimeOffNote.trim() : '',
      notes: formNotes.trim(),
    };
  };

  type SaveEventPayload = ReturnType<typeof buildBaseEventFieldsForStaff> & {
    batchGroupId: string;
    recurrenceGroupId: string;
    recurrenceRule: string;
    recurrenceLabel: string;
    recurrenceUntil: string;
  };

  const executeSaveEvent = async (
    recurrenceScope: 'this' | 'following' | 'all',
    batchScope: 'this' | 'all' = 'this'
  ) => {
    const effectiveEnd =
      formEndDate && formEndDate >= formStartDate ? formEndDate : formStartDate;
    const rruleStr = recurrenceConfig.enabled
      ? buildRRuleString(recurrenceConfig, formStartDate)
      : 'none';
    const rruleLabel = recurrenceConfig.enabled
      ? formatRecurrenceSummary(recurrenceConfig, formStartDate)
      : '';
    const rruleUntil =
      recurrenceConfig.enabled && recurrenceConfig.endMode === 'on'
        ? recurrenceConfig.untilDate
        : '';

    const isFirmOnlyType = formType === 'Company Holiday' || formType === 'Tax Due Date';
    const cleanedSelectedStaff = isFirmOnlyType
      ? ['']
      : formSelectedStaff.length > 0
      ? Array.from(new Set(formSelectedStaff.map((s) => s.trim()).filter(Boolean)))
      : [''];

    // Plan mutations (updates, creates, deletes) for a single staff member's event(s)
    const planStaffMutation = (params: {
      staffName: string;
      staffSeries: CalendarEvent[];
      anchorEvent: CalendarEvent | null;
      scope: 'this' | 'following' | 'all';
      targetBatchGroupId: string;
      origStart: string;
      origRule: string;
      origUntil: string;
      hasSeriesContext: boolean;
    }): {
      updates: Array<{ id: string; data: Partial<SaveEventPayload> }>;
      toCreate: SaveEventPayload[];
      toDelete: string[];
    } => {
      const {
        staffName,
        staffSeries,
        anchorEvent,
        scope,
        targetBatchGroupId,
        origStart,
        origRule,
        origUntil,
        hasSeriesContext,
      } = params;
      const base = buildBaseEventFieldsForStaff(staffName);
      const updates: Array<{ id: string; data: Partial<SaveEventPayload> }> = [];
      const toCreate: SaveEventPayload[] = [];
      const toDelete: string[] = [];

      // Case 1: Newly added staff member (no existing events in this batch)
      if (staffSeries.length === 0) {
        if (!recurrenceConfig.enabled || (scope === 'this' && hasSeriesContext)) {
          toCreate.push({
            ...base,
            batchGroupId: targetBatchGroupId,
            recurrenceGroupId: '',
            recurrenceRule: 'none',
            recurrenceLabel: '',
            recurrenceUntil: '',
          });
        } else {
          const occurrences = generateRRuleOccurrences(
            base.startDate,
            base.endDate,
            recurrenceConfig
          );
          const newRecGroupId = generateRecurrenceGroupId();
          for (const occ of occurrences) {
            toCreate.push({
              ...base,
              startDate: occ.startDate,
              endDate: occ.endDate,
              batchGroupId: targetBatchGroupId,
              recurrenceGroupId: newRecGroupId,
              recurrenceRule: rruleStr,
              recurrenceLabel: rruleLabel,
              recurrenceUntil: rruleUntil,
            });
          }
        }
        return { updates, toCreate, toDelete };
      }

      const ruleChanged = rruleStr !== origRule || rruleUntil !== origUntil;

      // Case 2: Updating a single occurrence ('this')
      if (scope === 'this') {
        if (!anchorEvent) {
          toCreate.push({
            ...base,
            batchGroupId: targetBatchGroupId,
            recurrenceGroupId: '',
            recurrenceRule: 'none',
            recurrenceLabel: '',
            recurrenceUntil: '',
          });
          return { updates, toCreate, toDelete };
        }
        const existingGroupId = anchorEvent.recurrenceGroupId || '';
        if (!existingGroupId && recurrenceConfig.enabled) {
          // Convert standalone event into a recurring series
          const occurrences = generateRRuleOccurrences(
            base.startDate,
            base.endDate,
            recurrenceConfig
          );
          const groupId = generateRecurrenceGroupId();
          const first = occurrences[0];
          updates.push({
            id: anchorEvent.id,
            data: {
              ...base,
              startDate: first.startDate,
              endDate: first.endDate,
              batchGroupId: targetBatchGroupId,
              recurrenceGroupId: groupId,
              recurrenceRule: rruleStr,
              recurrenceLabel: rruleLabel,
              recurrenceUntil: rruleUntil,
            },
          });
          for (const occ of occurrences.slice(1)) {
            toCreate.push({
              ...base,
              startDate: occ.startDate,
              endDate: occ.endDate,
              batchGroupId: targetBatchGroupId,
              recurrenceGroupId: groupId,
              recurrenceRule: rruleStr,
              recurrenceLabel: rruleLabel,
              recurrenceUntil: rruleUntil,
            });
          }
        } else {
          updates.push({
            id: anchorEvent.id,
            data: {
              ...base,
              batchGroupId: targetBatchGroupId,
              recurrenceGroupId: existingGroupId,
              recurrenceRule: existingGroupId
                ? anchorEvent.recurrenceRule || rruleStr
                : 'none',
              recurrenceLabel: existingGroupId
                ? anchorEvent.recurrenceLabel || rruleLabel
                : '',
              recurrenceUntil: existingGroupId ? anchorEvent.recurrenceUntil || '' : '',
            },
          });
        }
        return { updates, toCreate, toDelete };
      }

      // Case 3: Updating this and following occurrences ('following')
      if (scope === 'following') {
        const origGroupId =
          anchorEvent?.recurrenceGroupId ||
          staffSeries[0]?.recurrenceGroupId ||
          generateRecurrenceGroupId();
        const followingEvents = staffSeries.filter(
          (ev) => (anchorEvent && ev.id === anchorEvent.id) || (ev.startDate || '') >= origStart
        );
        const primaryTarget = anchorEvent || followingEvents[0] || staffSeries[0];

        if (!recurrenceConfig.enabled) {
          updates.push({
            id: primaryTarget.id,
            data: {
              ...base,
              batchGroupId: targetBatchGroupId,
              recurrenceGroupId: '',
              recurrenceRule: 'none',
              recurrenceLabel: '',
              recurrenceUntil: '',
            },
          });
          for (const ev of followingEvents) {
            if (ev.id !== primaryTarget.id) toDelete.push(ev.id);
          }
        } else if (!ruleChanged && followingEvents.length > 0) {
          const deltaDays = diffDaysIso(origStart, base.startDate);
          const newDurationDays = Math.max(0, diffDaysIso(base.startDate, base.endDate));
          const updatedGroupId =
            followingEvents.length < staffSeries.length
              ? generateRecurrenceGroupId()
              : origGroupId;
          const nextLabel = formatRecurrenceSummary(recurrenceConfig, base.startDate);

          for (const ev of followingEvents) {
            const shiftedStart =
              deltaDays !== 0 ? addDaysIso(ev.startDate, deltaDays) : ev.startDate;
            const shiftedEnd =
              newDurationDays > 0 ? addDaysIso(shiftedStart, newDurationDays) : shiftedStart;
            updates.push({
              id: ev.id,
              data: {
                ...base,
                startDate: shiftedStart,
                endDate: shiftedEnd,
                batchGroupId: targetBatchGroupId,
                recurrenceGroupId: updatedGroupId,
                recurrenceRule: rruleStr,
                recurrenceLabel: nextLabel,
                recurrenceUntil: rruleUntil,
              },
            });
          }
        } else {
          const newGroupId =
            followingEvents.length < staffSeries.length
              ? generateRecurrenceGroupId()
              : origGroupId;
          const occurrences = generateRRuleOccurrences(
            base.startDate,
            base.endDate,
            recurrenceConfig
          );
          occurrences.forEach((occ, idx) => {
            const payload: SaveEventPayload = {
              ...base,
              startDate: occ.startDate,
              endDate: occ.endDate,
              batchGroupId: targetBatchGroupId,
              recurrenceGroupId: newGroupId,
              recurrenceRule: rruleStr,
              recurrenceLabel: rruleLabel,
              recurrenceUntil: rruleUntil,
            };
            if (idx < followingEvents.length) {
              updates.push({ id: followingEvents[idx].id, data: payload });
            } else {
              toCreate.push(payload);
            }
          });
          for (const surplus of followingEvents.slice(occurrences.length)) {
            toDelete.push(surplus.id);
          }
        }
        return { updates, toCreate, toDelete };
      }

      // Case 4: Updating all occurrences in series ('all')
      const groupId =
        anchorEvent?.recurrenceGroupId ||
        staffSeries[0]?.recurrenceGroupId ||
        generateRecurrenceGroupId();
      const primaryTarget = anchorEvent || staffSeries[0];

      if (!recurrenceConfig.enabled) {
        updates.push({
          id: primaryTarget.id,
          data: {
            ...base,
            batchGroupId: targetBatchGroupId,
            recurrenceGroupId: '',
            recurrenceRule: 'none',
            recurrenceLabel: '',
            recurrenceUntil: '',
          },
        });
        for (const ev of staffSeries) {
          if (ev.id !== primaryTarget.id) toDelete.push(ev.id);
        }
      } else if (!ruleChanged && staffSeries.length > 0) {
        const deltaDays = diffDaysIso(origStart, base.startDate);
        const newDurationDays = Math.max(0, diffDaysIso(base.startDate, base.endDate));
        const anchorAfterShift =
          deltaDays !== 0 ? addDaysIso(staffSeries[0].startDate, deltaDays) : staffSeries[0].startDate;
        const allLabel = formatRecurrenceSummary(recurrenceConfig, anchorAfterShift);
        const allRRule = buildRRuleString(recurrenceConfig, anchorAfterShift);

        for (const ev of staffSeries) {
          const shiftedStart =
            deltaDays !== 0 ? addDaysIso(ev.startDate, deltaDays) : ev.startDate;
          const shiftedEnd =
            newDurationDays > 0 ? addDaysIso(shiftedStart, newDurationDays) : shiftedStart;
          updates.push({
            id: ev.id,
            data: {
              ...base,
              startDate: shiftedStart,
              endDate: shiftedEnd,
              batchGroupId: targetBatchGroupId,
              recurrenceGroupId: groupId,
              recurrenceRule: allRRule,
              recurrenceLabel: allLabel,
              recurrenceUntil: rruleUntil,
            },
          });
        }
      } else {
        const anchorStart =
          staffSeries.length > 0 && staffSeries[0].id !== primaryTarget.id
            ? staffSeries[0].startDate
            : base.startDate;
        const newDurationDays = Math.max(0, diffDaysIso(base.startDate, base.endDate));
        const anchorEnd =
          newDurationDays > 0 ? addDaysIso(anchorStart, newDurationDays) : anchorStart;
        const allRRule = buildRRuleString(recurrenceConfig, anchorStart);
        const allLabel = formatRecurrenceSummary(recurrenceConfig, anchorStart);
        const occurrences = generateRRuleOccurrences(anchorStart, anchorEnd, recurrenceConfig);

        occurrences.forEach((occ, idx) => {
          const payload: SaveEventPayload = {
            ...base,
            startDate: occ.startDate,
            endDate: occ.endDate,
            batchGroupId: targetBatchGroupId,
            recurrenceGroupId: groupId,
            recurrenceRule: allRRule,
            recurrenceLabel: allLabel,
            recurrenceUntil: rruleUntil,
          };
          if (idx < staffSeries.length) {
            updates.push({ id: staffSeries[idx].id, data: payload });
          } else {
            toCreate.push(payload);
          }
        });
        for (const surplus of staffSeries.slice(occurrences.length)) {
          toDelete.push(surplus.id);
        }
      }

      return { updates, toCreate, toDelete };
    };

    setSaving(true);
    try {
      if (!editingId) {
        // Creating new event(s) for 1 or multiple staff members (single or recurring)
        const sharedBatchId = cleanedSelectedStaff.length > 1 ? generateBatchGroupId() : '';
        const payloads: SaveEventPayload[] = [];
        const occurrences = recurrenceConfig.enabled
          ? generateRRuleOccurrences(formStartDate, effectiveEnd, recurrenceConfig)
          : [{ startDate: formStartDate, endDate: effectiveEnd }];

        for (const staffName of cleanedSelectedStaff) {
          const base = buildBaseEventFieldsForStaff(staffName);
          const staffRecGroupId = recurrenceConfig.enabled ? generateRecurrenceGroupId() : '';
          for (const occ of occurrences) {
            payloads.push({
              ...base,
              startDate: occ.startDate,
              endDate: occ.endDate,
              batchGroupId: sharedBatchId,
              recurrenceGroupId: staffRecGroupId,
              recurrenceRule: rruleStr,
              recurrenceLabel: rruleLabel,
              recurrenceUntil: rruleUntil,
            });
          }
        }

        if (payloads.length === 1) {
          await saveCalendarEvent(payloads[0]);
          showToast('Calendar event created.', 'success', 2400);
        } else {
          await batchSaveCalendarEvents(payloads);
          if (recurrenceConfig.enabled && cleanedSelectedStaff.length > 1) {
            showToast(
              `Created ${payloads.length} recurring events across ${cleanedSelectedStaff.length} staff — ${rruleLabel}.`,
              'success',
              3400
            );
          } else if (cleanedSelectedStaff.length > 1) {
            showToast(
              `Created event for ${cleanedSelectedStaff.length} staff members.`,
              'success',
              2800
            );
          } else {
            showToast(
              `Created ${occurrences.length} recurring event(s) — ${rruleLabel}.`,
              'success',
              3200
            );
          }
        }
      } else if (editingEvent) {
        const origStart = editingEvent.raw.startDate || formStartDate;
        const origRule = (editingEvent.raw.recurrenceRule || 'none').trim();
        const origUntil = (editingEvent.raw.recurrenceUntil || '').trim();
        const hasBatch = Boolean(editingEvent.raw.batchGroupId && editingBatchStaff.length > 1);
        const hasSeries = Boolean(
          editingEvent.raw.recurrenceGroupId && editingSeriesEvents.length > 1
        );

        const allUpdates: Array<{ id: string; data: Partial<SaveEventPayload> }> = [];
        const allToCreate: SaveEventPayload[] = [];
        const allToDelete: string[] = [];

        if (batchScope === 'this') {
          // Update only this staff member's event / series
          const targetStaffName = hasBatch
            ? editingEvent.staffName
            : cleanedSelectedStaff[0] || '';
          const staffSeries =
            editingSeriesEvents.length > 0 ? editingSeriesEvents : [editingEvent.raw];
          const res = planStaffMutation({
            staffName: targetStaffName,
            staffSeries,
            anchorEvent: editingEvent.raw,
            scope: recurrenceScope,
            targetBatchGroupId: editingEvent.raw.batchGroupId || '',
            origStart,
            origRule,
            origUntil,
            hasSeriesContext: hasSeries,
          });
          allUpdates.push(...res.updates);
          allToCreate.push(...res.toCreate);
          allToDelete.push(...res.toDelete);
        } else {
          // Update across ALL selected staff for this event (and sync added/removed staff)
          const targetBatchGroupId =
            cleanedSelectedStaff.length > 1
              ? editingEvent.raw.batchGroupId || generateBatchGroupId()
              : '';

          const siblings =
            editingBatchSiblings.length > 0 ? editingBatchSiblings : [editingEvent.raw];
          const siblingsByStaff = new Map<string, CalendarEvent[]>();
          for (const ev of siblings) {
            const key = (ev.assignedTo || '').trim().toLowerCase();
            const list = siblingsByStaff.get(key) || [];
            list.push(ev);
            siblingsByStaff.set(key, list);
          }
          for (const list of siblingsByStaff.values()) {
            list.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
          }

          const selectedLowerSet = new Set(cleanedSelectedStaff.map((s) => s.toLowerCase()));

          for (const staffName of cleanedSelectedStaff) {
            const key = staffName.toLowerCase();
            const staffSeries = siblingsByStaff.get(key) || [];
            const anchorEvent =
              staffSeries.find((ev) => ev.id === editingId) ||
              staffSeries.find((ev) => ev.startDate === origStart) ||
              null;
            const res = planStaffMutation({
              staffName,
              staffSeries,
              anchorEvent,
              scope: recurrenceScope,
              targetBatchGroupId,
              origStart,
              origRule,
              origUntil,
              hasSeriesContext: hasSeries,
            });
            allUpdates.push(...res.updates);
            allToCreate.push(...res.toCreate);
            allToDelete.push(...res.toDelete);
          }

          // Remove events in scope for staff members who were unchecked from this multi-staff event
          for (const [staffKey, staffEvents] of siblingsByStaff.entries()) {
            if (selectedLowerSet.has(staffKey)) continue;
            for (const ev of staffEvents) {
              if (recurrenceScope === 'all') {
                allToDelete.push(ev.id);
              } else if (recurrenceScope === 'following') {
                if ((ev.startDate || '') >= origStart) allToDelete.push(ev.id);
              } else if (ev.startDate === origStart) {
                allToDelete.push(ev.id);
              }
            }
          }
        }

        const uniqueDeleteIds = Array.from(new Set(allToDelete));

        if (allUpdates.length === 1) {
          await saveCalendarEvent(allUpdates[0].data as SaveEventPayload, allUpdates[0].id);
        } else if (allUpdates.length > 1) {
          await batchUpdateCalendarEvents(allUpdates);
        }

        if (allToCreate.length === 1) {
          await saveCalendarEvent(allToCreate[0]);
        } else if (allToCreate.length > 1) {
          await batchSaveCalendarEvents(allToCreate);
        }

        if (uniqueDeleteIds.length > 0 && isManagerOrAdmin) {
          if (uniqueDeleteIds.length === 1) {
            await deleteCalendarEvent(uniqueDeleteIds[0]);
          } else {
            await batchDeleteCalendarEvents(uniqueDeleteIds);
          }
        }

        if (batchScope === 'all' && cleanedSelectedStaff.length > 1) {
          showToast(
            `Updated event across ${cleanedSelectedStaff.length} selected staff members.`,
            'success',
            3000
          );
        } else if (recurrenceScope === 'all') {
          showToast('Updated all events in series.', 'success', 2800);
        } else if (recurrenceScope === 'following') {
          showToast('Updated this and following events.', 'success', 2800);
        } else {
          showToast('Updated calendar event.', 'success', 2400);
        }
      }

      setSeriesScopePrompt(null);
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save calendar event.');
    } finally {
      setSaving(false);
    }
  };

  const openScopeDialog = useCallback(
    (
      action: 'save' | 'delete',
      targetEvent: ParsedCalendarEvent,
      defaultBatchScope: 'this' | 'all' = 'this'
    ) => {
      const series = getSeriesEvents(targetEvent.raw.recurrenceGroupId);
      const targetStart = targetEvent.raw.startDate || '';
      const followingIds = series
        .filter((ev) => ev.id === targetEvent.raw.id || (ev.startDate || '') >= targetStart)
        .map((ev) => ev.id);

      const batchSiblings = getBatchSiblingEvents(calendarEvents, targetEvent.raw.batchGroupId);
      const batchStaffNames = getDistinctStaffInBatch(
        calendarEvents,
        targetEvent.raw.batchGroupId
      );
      const batchAllIds = batchSiblings.map((ev) => ev.id);
      const batchSameDateIds = batchSiblings
        .filter((ev) => ev.id === targetEvent.raw.id || ev.startDate === targetStart)
        .map((ev) => ev.id);
      const batchFollowingIds = batchSiblings
        .filter((ev) => ev.id === targetEvent.raw.id || (ev.startDate || '') >= targetStart)
        .map((ev) => ev.id);

      const hasSeries = Boolean(targetEvent.raw.recurrenceGroupId && series.length > 1);
      const hasBatch = Boolean(targetEvent.raw.batchGroupId && batchStaffNames.length > 1);

      setSeriesScopeChoice('this');
      setBatchScopeChoice(defaultBatchScope);
      setSeriesScopePrompt({
        action,
        targetEvent,
        hasSeries,
        hasBatch,
        seriesIds: series.map((s) => s.id),
        followingIds,
        batchStaffNames,
        batchAllIds,
        batchSameDateIds,
        batchFollowingIds,
      });
    },
    [calendarEvents, getSeriesEvents]
  );

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setFormError('');
    if (!formLabel.trim() && !(formType === 'Client Appointment' && formClientName.trim())) {
      setFormError('Please enter an event title / description.');
      return;
    }
    if (
      (formType === 'Staff Availability' || formType === 'Time-Off / Replace') &&
      formSelectedStaff.length === 0
    ) {
      setFormError(`Please select at least one staff member for ${formType}.`);
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
    if (
      recurrenceConfig.enabled &&
      recurrenceConfig.endMode === 'on' &&
      recurrenceConfig.untilDate &&
      recurrenceConfig.untilDate < formStartDate
    ) {
      setFormError('Recurrence end date must be on or after the Start Date.');
      return;
    }

    if (editingId && editingEvent) {
      const hasSeries = Boolean(
        editingEvent.raw.recurrenceGroupId && editingSeriesEvents.length > 1
      );
      const hasBatch = Boolean(editingEvent.raw.batchGroupId && editingBatchStaff.length > 1);

      if (hasSeries || hasBatch) {
        const origStaffSet = new Set(editingBatchStaff.map((s) => s.toLowerCase()));
        const nextStaffSet = new Set(formSelectedStaff.map((s) => s.toLowerCase()));
        const staffSelectionChanged =
          origStaffSet.size !== nextStaffSet.size ||
          Array.from(nextStaffSet).some((s) => !origStaffSet.has(s));
        openScopeDialog('save', editingEvent, staffSelectionChanged ? 'all' : 'this');
        return;
      }

      // Converting a standalone single-staff event into a multi-staff event
      if (
        formType !== 'Company Holiday' &&
        formType !== 'Tax Due Date' &&
        formSelectedStaff.length > 1
      ) {
        await executeSaveEvent('this', 'all');
        return;
      }
    }

    await executeSaveEvent('this', 'this');
  };

  const executeDeleteScope = async (
    prompt: NonNullable<typeof seriesScopePrompt>,
    recurrenceScope: 'this' | 'following' | 'all',
    batchScope: 'this' | 'all'
  ) => {
    if (!isManagerOrAdmin) return;
    setSaving(true);
    try {
      let idsToDelete: string[];
      if (prompt.hasBatch && batchScope === 'all') {
        if (prompt.hasSeries && recurrenceScope === 'all') {
          idsToDelete = prompt.batchAllIds;
        } else if (prompt.hasSeries && recurrenceScope === 'following') {
          idsToDelete = prompt.batchFollowingIds;
        } else {
          idsToDelete = prompt.batchSameDateIds;
        }
      } else {
        if (prompt.hasSeries && recurrenceScope === 'all') {
          idsToDelete = prompt.seriesIds;
        } else if (prompt.hasSeries && recurrenceScope === 'following') {
          idsToDelete = prompt.followingIds;
        } else {
          idsToDelete = [prompt.targetEvent.raw.id];
        }
      }

      const uniqueIds = Array.from(new Set(idsToDelete));
      if (uniqueIds.length > 1) {
        await batchDeleteCalendarEvents(uniqueIds);
        if (prompt.hasBatch && batchScope === 'all') {
          showToast(
            `Deleted ${uniqueIds.length} event(s) across ${prompt.batchStaffNames.length} staff members.`,
            'success',
            3000
          );
        } else if (recurrenceScope === 'all') {
          showToast(`Deleted all ${uniqueIds.length} events in series.`, 'success', 2800);
        } else {
          showToast(
            `Deleted this and ${uniqueIds.length - 1} following event(s).`,
            'success',
            2800
          );
        }
      } else if (uniqueIds.length === 1) {
        await deleteCalendarEvent(uniqueIds[0]);
        showToast('Calendar event deleted.', 'success', 2500);
      }

      setSeriesScopePrompt(null);
      setModalOpen(false);
      setConfirmModalDelete(false);
      setConfirmDeleteId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete event.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFromModal = async () => {
    if (!editingId || !editingEvent || !isManagerOrAdmin) return;
    const hasSeries = Boolean(
      editingEvent.raw.recurrenceGroupId && editingSeriesEvents.length > 1
    );
    const hasBatch = Boolean(editingEvent.raw.batchGroupId && editingBatchStaff.length > 1);
    if (hasSeries || hasBatch) {
      openScopeDialog('delete', editingEvent, 'this');
      return;
    }
    setSaving(true);
    try {
      await deleteCalendarEvent(editingId);
      showToast('Calendar event deleted.', 'success', 2500);
      setModalOpen(false);
      setConfirmModalDelete(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete event.';
      setFormError(msg);
      showToast(msg, 'error');
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

    const { rowSummaries } = computeStaffRowSummaries({
      staffList: filteredMatrixStaff,
      monthWeekdays,
      holidaysByDate,
      parsedEvents,
      openJobsByStaff,
    });

    return buildStaffMatrixExportModel({
      year,
      monthIndex,
      includeWeekends,
      days,
      activeStaff: filteredMatrixStaff,
      allStaff: staff,
      rowSummaries,
      holidaysByDate,
      parsedEvents,
      typeFilter,
      staffFilter,
      searchQuery: search,
    });
  };

  // Build Month Calendar + Complete Event Register export model (Page 1: Calendar Grid max 3/day, Page 2: Event Register)
  const buildMonthExportModel = () => {
    const year = cursorDate.getFullYear();
    const monthIndex = cursorDate.getMonth();
    const todayCursorIso = toIsoDate(cursorDate);

    let periodStart: string | undefined;
    let periodEnd: string | undefined;
    if (viewMode === 'week' && weekDays.length > 0) {
      periodStart = toIsoDate(weekDays[0]);
      periodEnd = toIsoDate(weekDays[weekDays.length - 1]);
    } else if (viewMode === 'day') {
      periodStart = todayCursorIso;
      periodEnd = todayCursorIso;
    } else if (viewMode === 'agenda') {
      // Empty bounds include all matching filtered events across dates
      periodStart = '';
      periodEnd = '';
    }

    return buildMonthCalendarExportModel({
      year,
      monthIndex,
      monthGridDays: monthDays,
      periodLabel: periodTitle,
      periodStart,
      periodEnd,
      parsedEvents,
      holidaysByDate,
      staffList: staff,
      typeFilter,
      staffFilter,
      searchQuery: search,
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
    printMonthCalendar(buildMonthExportModel());
  };

  const handleExportCalendarPdf = () => {
    if (viewMode === 'matrix') {
      exportStaffMatrixToPdf(buildMatrixExportModel());
      return;
    }
    exportMonthCalendarToPdf(buildMonthExportModel());
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
                      const isTaxDue = ev.canonicalType === 'Tax Due Date';
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
                          className={`w-full text-left px-1.5 py-0.5 rounded border text-[10px] font-medium truncate flex items-center justify-between gap-1 hover:brightness-95 ${
                            isTaxDue
                              ? 'bg-rose-100 text-rose-800 border-rose-300 font-semibold'
                              : 'border-slate-900/15'
                          }`}
                          style={
                            isTaxDue
                              ? undefined
                              : { backgroundColor: ev.color, color: textColor }
                          }
                          title={
                            ev.canonicalType === 'Client Appointment'
                              ? `${ev.displayTitle} — Client: ${ev.raw.clientName || ''} (Click to open Client Master; Shift+Click to edit)`
                              : isTaxDue
                              ? `Tax Due Date: ${ev.cleanLabel}${
                                  ev.raw.recurrenceGroupId
                                    ? ` (${formatRecurrenceRuleLabel(
                                        ev.raw.recurrenceRule,
                                        ev.raw.startDate,
                                        ev.raw.recurrenceLabel
                                      )})`
                                    : ''
                                }`
                              : ev.displayTitle
                          }
                        >
                          <span className="truncate inline-flex items-center gap-1">
                            {isTaxDue && (
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: ev.color || '#ef4444' }}
                              />
                            )}
                            {ev.raw.recurrenceGroupId && (
                              <Repeat2 className="w-2.5 h-2.5 shrink-0 opacity-80" />
                            )}
                            <span className="truncate">{ev.displayTitle}</span>
                          </span>
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
                      dayEvents.map((ev) => {
                        const isTaxDue = ev.canonicalType === 'Tax Due Date';
                        return (
                          <button
                            key={ev.raw.id}
                            type="button"
                            onClick={() => openEditModal(ev)}
                            className={`w-full text-left p-2 rounded border text-[11px] space-y-0.5 hover:brightness-95 ${
                              isTaxDue
                                ? 'bg-rose-100 text-rose-900 border-rose-300'
                                : 'border-slate-900/15'
                            }`}
                            style={
                              isTaxDue
                                ? undefined
                                : {
                                    backgroundColor: ev.color,
                                    color: getContrastingTextColor(ev.color),
                                  }
                            }
                          >
                            {isTaxDue && (
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#ef4444] text-white text-[9px] font-bold uppercase tracking-wide mb-0.5">
                                Tax Due Date
                              </div>
                            )}
                            <div className="font-semibold leading-snug inline-flex items-center gap-1">
                              {ev.raw.recurrenceGroupId && (
                                <Repeat2 className="w-3 h-3 shrink-0 opacity-80" />
                              )}
                              <span>{ev.displayTitle}</span>
                            </div>
                            {ev.raw.clientName && (
                              <div className="text-[10px] opacity-90 truncate">
                                Client: {ev.raw.clientName}
                              </div>
                            )}
                            {ev.raw.notes && (
                              <div className="text-[10px] opacity-80 truncate">{ev.raw.notes}</div>
                            )}
                          </button>
                        );
                      })
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
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${
                            ev.canonicalType === 'Tax Due Date'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'border-slate-900/15'
                          }`}
                          style={
                            ev.canonicalType === 'Tax Due Date'
                              ? undefined
                              : {
                                  backgroundColor: ev.color,
                                  color: getContrastingTextColor(ev.color),
                                }
                          }
                        >
                          {ev.canonicalType === 'Tax Due Date' && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: ev.color || '#ef4444' }}
                            />
                          )}
                          {ev.canonicalType}
                        </span>
                        <span className="text-xs font-semibold text-slate-900">
                          {ev.displayTitle}
                        </span>
                        {ev.raw.recurrenceGroupId && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[10px] font-medium text-teal-800">
                            <Repeat2 className="w-2.5 h-2.5" />
                            {formatRecurrenceRuleLabel(
                              ev.raw.recurrenceRule,
                              ev.raw.startDate,
                              ev.raw.recurrenceLabel
                            )}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>
                          {formatDateDDMMYYYY(ev.raw.startDate)}
                          {ev.raw.endDate && ev.raw.endDate !== ev.raw.startDate
                            ? ` – ${formatDateDDMMYYYY(ev.raw.endDate)}`
                            : ''}
                        </span>
                        {ev.canonicalType === 'Tax Due Date' ? (
                          <span>• All Staff / Statutory</span>
                        ) : (
                          ev.staffName && <span>• Staff: {ev.staffName}</span>
                        )}
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
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${
                            ev.canonicalType === 'Tax Due Date'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : ev.canonicalType === 'Time-Off / Replace'
                              ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                              : 'border-slate-900/15'
                          }`}
                          style={
                            ev.canonicalType === 'Tax Due Date' ||
                            ev.canonicalType === 'Time-Off / Replace'
                              ? undefined
                              : {
                                  backgroundColor: ev.color,
                                  color: getContrastingTextColor(ev.color),
                                }
                          }
                        >
                          {ev.canonicalType === 'Tax Due Date' && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: ev.color || '#ef4444' }}
                            />
                          )}
                          {ev.canonicalType === 'Time-Off / Replace' ? 'TO · Time-Off / Replace' : ev.canonicalType}
                        </span>
                      </td>
                      <td className="py-2 px-4 font-medium text-slate-900">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span>{ev.displayTitle}</span>
                          {ev.raw.batchGroupId && batchStaffMap.has(ev.raw.batchGroupId) && (
                            <span
                              title={`Multi-staff event (${batchStaffMap
                                .get(ev.raw.batchGroupId)!
                                .join(', ')})`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-[10px] font-medium text-sky-800 whitespace-nowrap"
                            >
                              <Users className="w-2.5 h-2.5" />
                              {batchStaffMap.get(ev.raw.batchGroupId)!.length} staff
                            </span>
                          )}
                          {ev.raw.recurrenceGroupId && (
                            <span
                              title={`Recurring series (${formatRecurrenceRuleLabel(
                                ev.raw.recurrenceRule,
                                ev.raw.startDate,
                                ev.raw.recurrenceLabel
                              )})`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[10px] font-medium text-teal-800 whitespace-nowrap"
                            >
                              <Repeat2 className="w-2.5 h-2.5" />
                              {formatRecurrenceRuleLabel(
                                ev.raw.recurrenceRule,
                                ev.raw.startDate,
                                ev.raw.recurrenceLabel
                              )}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-slate-700 whitespace-nowrap">
                        {ev.canonicalType === 'Tax Due Date'
                          ? 'All Staff / Statutory'
                          : ev.staffName || '—'}
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
                      <td className="py-2 px-4 text-slate-600 max-w-[240px] truncate" title={[ev.raw.timeOffNote, ev.raw.notes].filter(Boolean).join(' · ') || undefined}>
                        {[ev.raw.timeOffNote, ev.raw.notes].filter(Boolean).join(' · ') || '—'}
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
                                onClick={() => {
                                  const series = getSeriesEvents(ev.raw.recurrenceGroupId);
                                  const batchStaff = getDistinctStaffInBatch(
                                    calendarEvents,
                                    ev.raw.batchGroupId
                                  );
                                  if (
                                    (ev.raw.recurrenceGroupId && series.length > 1) ||
                                    (ev.raw.batchGroupId && batchStaff.length > 1)
                                  ) {
                                    openScopeDialog('delete', ev, 'this');
                                  } else {
                                    setConfirmDeleteId(ev.raw.id);
                                  }
                                }}
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

      {/* Johor & Malaysia Public Holidays — Collapsible Reference Panel (Collapsed by Default) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setHolidaysExpanded((prev) => !prev)}
          aria-expanded={holidaysExpanded}
          className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Flag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-700 truncate">
              Johor &amp; Malaysia Federal Public Holidays ({cursorDate.getFullYear()})
            </h2>
            <span className="text-[11px] font-mono text-slate-400 shrink-0">
              · {holidaysForYear.length} dates
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400 hidden md:inline">
              Highlighted automatically on matrix grid
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white text-[11px] font-medium text-slate-700">
              {holidaysExpanded ? (
                <>
                  Hide <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  Show <ChevronDown className="w-3 h-3" />
                </>
              )}
            </span>
          </div>
        </button>
        {holidaysExpanded && (
          <div className="p-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
        )}
      </section>

      {/* Add / Edit Event Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
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

            <form onSubmit={handleSaveEvent} className="flex flex-col flex-1 min-h-0">
              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {editingEvent?.raw.batchGroupId && editingBatchStaff.length > 1 && (
                  <div className="px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-[11px] text-sky-900 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-medium min-w-0">
                      <Users className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                      <span className="truncate" title={editingBatchStaff.join(', ')}>
                        Multi-staff event: {editingBatchStaff.join(', ')}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-sky-700 shrink-0">
                      {editingBatchStaff.length} staff
                    </span>
                  </div>
                )}

                {editingEvent?.raw.recurrenceGroupId && editingSeriesEvents.length > 1 && (
                  <div className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-[11px] text-teal-900 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-medium truncate">
                      <Repeat2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span className="truncate">
                        {formatRecurrenceRuleLabel(
                          editingEvent.raw.recurrenceRule,
                          editingEvent.raw.startDate,
                          editingEvent.raw.recurrenceLabel
                        )}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-teal-700 shrink-0">
                      {editingSeriesEvents.length} occurrences
                    </span>
                  </div>
                )}

                {formError && (
                  <div className="p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    {formError}
                  </div>
                )}

                {/* Row 1: Event Type + Event Title / Description (with quick-fill chips) */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                  <div className="sm:col-span-4">
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

                  <div className="sm:col-span-8">
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
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
                                  if (code === 'TO') {
                                    setFormType('Time-Off / Replace');
                                    setFormLabel('TO');
                                    if (!colorManuallyPicked) {
                                      setFormColor(
                                        EVENT_TYPE_DEFAULT_COLORS['Time-Off / Replace']
                                      );
                                    }
                                    return;
                                  }
                                  setFormLabel(code);
                                  if (!colorManuallyPicked) {
                                    setFormColor(swatchColor);
                                  }
                                }}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors ${
                                  isSelected
                                    ? 'bg-teal-700 text-white border-teal-700'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-xs border border-slate-900/20 shrink-0"
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
                        formType === 'Time-Off / Replace'
                          ? 'TO (Time-Off / Replace — 0 leave deduction)'
                          : formType === 'Staff Availability'
                          ? 'e.g. AL, 1/2 AL, SL, MC, RL, UPL, WFH, TO'
                          : formType === 'Tax Due Date'
                          ? 'e.g. CP204 & PCB Payment (15th) or CP500 Payment (Last Day)'
                          : formType === 'Client Appointment'
                          ? 'e.g. 1:20pm Tax Computation Sign-off'
                          : formType === 'Company Holiday'
                          ? 'e.g. Company Annual Dinner Off-Day'
                          : 'e.g. LHDN e-Invoice Seminar (Firm-Wide)'
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    />
                  </div>
                </div>

                {/* Optional Hours / Time Note for Time-Off / Replace (TO) */}
                {(formType === 'Time-Off / Replace' ||
                  (formType === 'Staff Availability' &&
                    formLabel.trim().toUpperCase() === 'TO')) && (
                  <div className="px-3 py-2 rounded-lg bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-900 shrink-0">
                      <Clock className="w-3.5 h-3.5 text-indigo-700" />
                      Hours / Time Note
                    </label>
                    <input
                      type="text"
                      maxLength={200}
                      value={formTimeOffNote}
                      onChange={(e) => setFormTimeOffNote(e.target.value)}
                      disabled={isReadOnly}
                      placeholder="e.g. Leave early 0.5 hr (5:00–5:30pm) or Replace 0.5 hr"
                      className="flex-1 min-w-[200px] px-2.5 py-1 text-xs bg-white border border-indigo-200 rounded-md text-slate-900 placeholder:text-slate-400"
                    />
                    <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 text-[10px] font-semibold shrink-0">
                      0 Leave Deduction
                    </span>
                  </div>
                )}

                {/* Row 2: Start Date, End Date, and Repeat side-by-side in 3 columns */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => {
                        const next = e.target.value;
                        const prevPreset = detectPresetFromConfig(recurrenceConfig, formStartDate);
                        setFormStartDate(next);
                        if (!formEndDate || formEndDate < next) setFormEndDate(next);
                        if (next) {
                          setRecurrenceConfig((prev) => {
                            if (!prev.enabled) {
                              return createDefaultRecurrenceConfig(next);
                            }
                            if (prevPreset === 'weekly') {
                              return {
                                ...prev,
                                byWeekdays: [getWeekdayCodeFromDate(parseIsoDateLocal(next))],
                              };
                            }
                            if (prev.endMode !== 'on' && prev.untilDate < next) {
                              return { ...prev, untilDate: defaultRepeatUntilForDate(next) };
                            }
                            return prev;
                          });
                        }
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
                  <div>
                    <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 mb-1">
                      <Repeat2 className="w-3.5 h-3.5 text-teal-700" />
                      Repeat
                    </label>
                    <select
                      value={detectedPreset === 'custom' ? 'custom_current' : detectedPreset}
                      onChange={(e) => {
                        const val = e.target.value as RecurrencePresetKey | 'custom_current';
                        if (val === 'custom') {
                          openCustomRecurrenceDialog();
                          return;
                        }
                        if (val === 'custom_current') return;
                        setRecurrenceConfig(buildConfigFromPreset(val, formStartDate));
                      }}
                      disabled={isReadOnly}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800"
                    >
                      {detectedPreset === 'custom' && (
                        <option value="custom_current">{recurrenceSummary}</option>
                      )}
                      {recurrencePresetOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Compact recurrence summary bar when Repeat is active */}
                {recurrenceConfig.enabled && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-teal-50 border border-teal-200 text-[11px] text-teal-900">
                    <span className="inline-flex items-center gap-1.5 font-medium min-w-0">
                      <Repeat2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span className="truncate">{recurrenceSummary}</span>
                      {previewOccurrences.length > 0 && (
                        <span className="font-mono text-[10px] text-teal-700 shrink-0">
                          · {previewOccurrences.length} occurrence
                          {previewOccurrences.length === 1 ? '' : 's'}
                          {formEndDate > formStartDate
                            ? ` (${diffDaysIso(formStartDate, formEndDate) + 1}d each)`
                            : ''}
                          {recurrenceConfig.endMode === 'never'
                            ? ` through ${formatDateDDMMYYYY(
                                defaultNeverHorizonForDate(formStartDate)
                              )}`
                            : ''}
                        </span>
                      )}
                    </span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={openCustomRecurrenceDialog}
                        className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 hover:underline shrink-0"
                      >
                        Customize
                      </button>
                    )}
                  </div>
                )}

                {/* Compact Clickable Staff Toggle Pills (4-Column Grid, No Scrollbar) */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                    <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      Staff Members{' '}
                      {formType === 'Staff Availability' || formType === 'Time-Off / Replace'
                        ? '*'
                        : formType === 'Tax Due Date'
                        ? '(Firm-Wide / Statutory)'
                        : formType === 'Company Holiday'
                        ? '(Firm-Wide)'
                        : formType === 'Internal Event'
                        ? '(Optional — empty = Firm-Wide)'
                        : '(Optional)'}
                    </label>
                    {formType !== 'Tax Due Date' && formType !== 'Company Holiday' && !isReadOnly && (
                      <div className="inline-flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-mono text-[10px] text-slate-500 mr-0.5">
                          {formSelectedStaff.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFormSelectedStaff(
                              visibleModalStaffOptions.map((item) => item.staffName)
                            )
                          }
                          className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setFormSelectedStaff([])}
                          className="font-medium text-slate-500 hover:text-slate-800 hover:underline"
                        >
                          Clear
                        </button>
                        {modalSystemAccountCount > 0 && (
                          <>
                            <span className="text-slate-300">·</span>
                            <button
                              type="button"
                              onClick={() => setShowModalSystemAccounts((prev) => !prev)}
                              className="text-[10px] font-medium text-slate-500 hover:text-teal-700 hover:underline"
                            >
                              {showModalSystemAccounts
                                ? 'Hide system accounts'
                                : `Show system accounts (${modalSystemAccountCount})`}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {formType === 'Tax Due Date' ? (
                    <div className="w-full px-2.5 py-1.5 text-xs bg-rose-50 border border-rose-200 rounded-md text-rose-800 font-medium">
                      All Staff / Statutory
                    </div>
                  ) : formType === 'Company Holiday' ? (
                    <div className="w-full px-2.5 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-md text-slate-600 font-medium">
                      Firm-Wide Holiday (Applies to All Staff)
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {visibleModalStaffOptions.map((item) => {
                        const selected = formSelectedStaff.includes(item.staffName);
                        const pillLabel =
                          item.staffId &&
                          item.staffId.toUpperCase() !== item.staffName.toUpperCase()
                            ? `${item.staffId} · ${item.staffName}`
                            : item.staffName;
                        return (
                          <button
                            key={item.staffName}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleToggleStaffSelection(item.staffName)}
                            title={pillLabel}
                            className={`px-2 py-1 rounded-md border text-[11px] text-left truncate transition-colors ${
                              selected
                                ? 'bg-teal-600 text-white border-teal-600 font-medium'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            } ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                            {pillLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Collapsible Linked Client (always expanded for Client Appointment) */}
                {formType !== 'Company Holiday' && formType !== 'Time-Off / Replace' && (
                  formType === 'Client Appointment' || showOptionalClient || Boolean(formClientId) ? (
                    <div
                      className={`rounded-lg border p-2.5 ${
                        formType === 'Client Appointment'
                          ? 'bg-sky-50/70 border-sky-200'
                          : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <ClientSelectorField
                            clients={clients}
                            value={formClientId}
                            onSelectClient={handleSelectClient}
                            label={
                              formType === 'Client Appointment'
                                ? 'Linked Client'
                                : formType === 'Tax Due Date'
                                ? 'Linked Client (Optional — leave blank for firm-wide statutory deadline)'
                                : 'Linked Client (Optional)'
                            }
                            required={formType === 'Client Appointment'}
                            disabled={isReadOnly}
                            placeholder="Search client by ID, Name, Company No, or TIN..."
                          />
                        </div>
                        {formType !== 'Client Appointment' && !isReadOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormClientId('');
                              setFormClientName('');
                              setShowOptionalClient(false);
                            }}
                            className="mt-5 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded shrink-0"
                          >
                            Hide
                          </button>
                        )}
                      </div>
                    </div>
                  ) : !isReadOnly ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowOptionalClient(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 border border-dashed border-slate-300 rounded-md hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/40 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Link Client (Optional)
                      </button>
                    </div>
                  ) : null
                )}

                {/* Bottom Row: Cell / Event Color + Notes / Remarks side-by-side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start pt-0.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                        <Palette className="w-3.5 h-3.5 text-slate-500" />
                        Cell / Event Color
                      </label>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold border border-slate-900/15 max-w-[140px] truncate"
                        style={{
                          backgroundColor: formColor,
                          color: getContrastingTextColor(formColor),
                        }}
                      >
                        {formLabel.trim() || formType}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
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
                            className={`w-5 h-5 rounded border transition-transform ${
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
                        className="w-6 h-5 p-0 border border-slate-200 rounded cursor-pointer bg-white"
                      />
                      <span className="text-[10px] font-mono text-slate-500">{formColor}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Notes / Remarks
                    </label>
                    <input
                      type="text"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Optional meeting venue, seminar notes, or coverage instructions..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    />
                  </div>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
                <div>
                  {editingId && isManagerOrAdmin && (
                    (editingEvent?.raw.recurrenceGroupId && editingSeriesEvents.length > 1) ||
                    (editingEvent?.raw.batchGroupId && editingBatchStaff.length > 1) ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleDeleteFromModal()}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    ) : confirmModalDelete ? (
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
                      {saving
                        ? 'Saving...'
                        : editingId
                        ? 'Save Changes'
                        : recurrenceConfig.enabled && formSelectedStaff.length > 1
                        ? `Create Series (${
                            previewOccurrences.length * formSelectedStaff.length
                          } · ${formSelectedStaff.length} staff)`
                        : recurrenceConfig.enabled
                        ? `Create Series (${previewOccurrences.length})`
                        : formSelectedStaff.length > 1
                        ? `Create for ${formSelectedStaff.length} Staff`
                        : 'Save Event'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Google Calendar-Style Custom Recurrence Sub-Dialog */}
      {customRecurrenceOpen && (() => {
        const anchorDate = parseIsoDateLocal(formStartDate || todayIso);
        const anchorDay = anchorDate.getDate();
        const nthInfo = getNthWeekdayInfo(anchorDate);
        const neverHorizonLabel = formatDateDDMMYYYY(defaultNeverHorizonForDate(formStartDate));

        const toggleDraftWeekday = (code: WeekdayCode) => {
          setCustomDraft((prev) => {
            const exists = prev.byWeekdays.includes(code);
            if (exists && prev.byWeekdays.length === 1) return prev; // Keep at least 1 weekday selected
            const nextDays = exists
              ? prev.byWeekdays.filter((w) => w !== code)
              : [...prev.byWeekdays, code];
            return { ...prev, byWeekdays: nextDays };
          });
        };

        return (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-900/60 p-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Repeat2 className="w-4 h-4 text-teal-700" />
                  <h3 className="text-sm font-semibold text-slate-900">Custom recurrence</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomRecurrenceOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
                {/* Repeat every [N] [unit] */}
                <div className="flex items-center gap-2.5">
                  <span className="text-slate-700 font-medium whitespace-nowrap">Repeat every</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={customDraft.interval}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(99, Number(e.target.value) || 1));
                      setCustomDraft((prev) => ({ ...prev, interval: val }));
                    }}
                    className="w-16 px-2.5 py-1.5 text-xs font-mono text-center bg-white border border-slate-300 rounded-md"
                  />
                  <select
                    value={customDraft.freq}
                    onChange={(e) => {
                      const nextFreq = e.target.value as RecurrenceFreq;
                      setCustomDraft((prev) => ({
                        ...prev,
                        freq: nextFreq,
                        byWeekdays:
                          nextFreq === 'WEEKLY' && prev.byWeekdays.length === 0
                            ? [getWeekdayCodeFromDate(anchorDate)]
                            : prev.byWeekdays,
                      }));
                    }}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                  >
                    <option value="DAILY">{customDraft.interval === 1 ? 'day' : 'days'}</option>
                    <option value="WEEKLY">{customDraft.interval === 1 ? 'week' : 'weeks'}</option>
                    <option value="MONTHLY">
                      {customDraft.interval === 1 ? 'month' : 'months'}
                    </option>
                    <option value="YEARLY">{customDraft.interval === 1 ? 'year' : 'years'}</option>
                  </select>
                </div>

                {/* Repeat on (Weekly circular buttons: M T W T F S S) */}
                {customDraft.freq === 'WEEKLY' && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-slate-700">Repeat on</div>
                    <div className="flex items-center gap-1.5">
                      {WEEKDAY_BUTTONS.map((day) => {
                        const selected = customDraft.byWeekdays.includes(day.code);
                        return (
                          <button
                            key={day.code}
                            type="button"
                            onClick={() => toggleDraftWeekday(day.code)}
                            title={day.full}
                            aria-pressed={selected}
                            className={`w-8 h-8 rounded-full text-xs font-semibold transition-colors border flex items-center justify-center ${
                              selected
                                ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {day.short1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Monthly mode radio options */}
                {customDraft.freq === 'MONTHLY' && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-slate-700">Monthly pattern</div>
                    <div className="space-y-1.5">
                      {(
                        [
                          {
                            mode: 'dayOfMonth' as RecurrenceMonthlyMode,
                            label: `Monthly on day ${anchorDay}`,
                          },
                          {
                            mode: 'nthWeekday' as RecurrenceMonthlyMode,
                            label: `Monthly on the ${nthInfo.ordinalLabel} ${nthInfo.weekdayFull}`,
                          },
                          {
                            mode: 'lastDay' as RecurrenceMonthlyMode,
                            label: 'Monthly on the last day',
                            hint: 'Automatically adjusts for 28/29 Feb, 30th & 31st',
                          },
                        ] as Array<{
                          mode: RecurrenceMonthlyMode;
                          label: string;
                          hint?: string;
                        }>
                      ).map((opt) => (
                        <label
                          key={opt.mode}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                            customDraft.monthlyMode === opt.mode
                              ? 'border-teal-500 bg-teal-50/40'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="customMonthlyMode"
                            checked={customDraft.monthlyMode === opt.mode}
                            onChange={() =>
                              setCustomDraft((prev) => ({ ...prev, monthlyMode: opt.mode }))
                            }
                            className="mt-0.5 text-teal-700 focus:ring-teal-600"
                          />
                          <div>
                            <div className="font-medium text-slate-800">{opt.label}</div>
                            {opt.hint && (
                              <div className="text-[10px] text-slate-500">{opt.hint}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ends radio group: Never | On [date] | After [N] occurrences */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-medium text-slate-700">Ends</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="customEndMode"
                        checked={customDraft.endMode === 'never'}
                        onChange={() =>
                          setCustomDraft((prev) => ({
                            ...prev,
                            endMode: 'never' as RecurrenceEndMode,
                          }))
                        }
                        className="text-teal-700 focus:ring-teal-600"
                      />
                      <span className="text-slate-800 font-medium">Never</span>
                      <span className="text-[11px] text-slate-400">
                        (generates through {neverHorizonLabel})
                      </span>
                    </label>

                    <div className="flex items-center gap-2.5">
                      <label className="inline-flex items-center gap-2.5 cursor-pointer w-20 shrink-0">
                        <input
                          type="radio"
                          name="customEndMode"
                          checked={customDraft.endMode === 'on'}
                          onChange={() =>
                            setCustomDraft((prev) => ({
                              ...prev,
                              endMode: 'on' as RecurrenceEndMode,
                              untilDate:
                                prev.untilDate && prev.untilDate >= formStartDate
                                  ? prev.untilDate
                                  : defaultRepeatUntilForDate(formStartDate),
                            }))
                          }
                          className="text-teal-700 focus:ring-teal-600"
                        />
                        <span className="text-slate-800 font-medium">On</span>
                      </label>
                      <input
                        type="date"
                        min={formStartDate}
                        value={customDraft.untilDate}
                        disabled={customDraft.endMode !== 'on'}
                        onChange={(e) =>
                          setCustomDraft((prev) => ({
                            ...prev,
                            endMode: 'on',
                            untilDate: e.target.value,
                          }))
                        }
                        className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    <div className="flex items-center gap-2.5">
                      <label className="inline-flex items-center gap-2.5 cursor-pointer w-20 shrink-0">
                        <input
                          type="radio"
                          name="customEndMode"
                          checked={customDraft.endMode === 'after'}
                          onChange={() =>
                            setCustomDraft((prev) => ({
                              ...prev,
                              endMode: 'after' as RecurrenceEndMode,
                              count: prev.count >= 1 ? prev.count : 10,
                            }))
                          }
                          className="text-teal-700 focus:ring-teal-600"
                        />
                        <span className="text-slate-800 font-medium">After</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={customDraft.count}
                        disabled={customDraft.endMode !== 'after'}
                        onChange={(e) => {
                          const c = Math.max(1, Math.min(365, Number(e.target.value) || 1));
                          setCustomDraft((prev) => ({
                            ...prev,
                            endMode: 'after',
                            count: c,
                          }));
                        }}
                        className="w-20 px-2.5 py-1.5 text-xs font-mono text-center bg-white border border-slate-300 rounded-md disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <span className="text-slate-600">occurrences</span>
                    </div>
                  </div>
                </div>

                {/* Live Summary Preview */}
                <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200 space-y-0.5">
                  <div className="text-[11px] font-semibold text-teal-900">
                    {customDraftSummary}
                  </div>
                  <div className="text-[10px] text-teal-800/80 font-mono">
                    {customDraftOccurrences.length} occurrence
                    {customDraftOccurrences.length === 1 ? '' : 's'}
                    {customDraftOccurrences.length > 0
                      ? ` · ${formatDateDDMMYYYY(
                          customDraftOccurrences[0].startDate
                        )} → ${formatDateDDMMYYYY(
                          customDraftOccurrences[customDraftOccurrences.length - 1].startDate
                        )}`
                      : ''}
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCustomRecurrenceOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      customDraft.endMode === 'on' &&
                      customDraft.untilDate &&
                      customDraft.untilDate < formStartDate
                    ) {
                      showToast(
                        'End date must be on or after the event Start Date.',
                        'warning',
                        3000
                      );
                      return;
                    }
                    setRecurrenceConfig({ ...customDraft, enabled: true });
                    setCustomRecurrenceOpen(false);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Unified Multi-Staff & Recurring Event Scope Confirmation Dialog */}
      {seriesScopePrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {seriesScopePrompt.hasBatch && !seriesScopePrompt.hasSeries ? (
                  <Users
                    className={`w-4 h-4 ${
                      seriesScopePrompt.action === 'delete' ? 'text-rose-600' : 'text-sky-700'
                    }`}
                  />
                ) : (
                  <Repeat2
                    className={`w-4 h-4 ${
                      seriesScopePrompt.action === 'delete' ? 'text-rose-600' : 'text-teal-700'
                    }`}
                  />
                )}
                <h3 className="text-sm font-semibold text-slate-900">
                  {seriesScopePrompt.action === 'delete'
                    ? seriesScopePrompt.hasBatch && seriesScopePrompt.hasSeries
                      ? 'Delete recurring multi-staff event'
                      : seriesScopePrompt.hasBatch
                      ? 'Delete multi-staff event'
                      : 'Delete recurring event'
                    : seriesScopePrompt.hasBatch && seriesScopePrompt.hasSeries
                    ? 'Edit recurring multi-staff event'
                    : seriesScopePrompt.hasBatch
                    ? 'Edit multi-staff event'
                    : 'Edit recurring event'}
                </h3>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setSeriesScopePrompt(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-900">
                  {seriesScopePrompt.targetEvent.displayTitle}
                </strong>{' '}
                ({formatDateDDMMYYYY(seriesScopePrompt.targetEvent.raw.startDate)})
              </p>

              {/* Multi-Staff Scope Options */}
              {seriesScopePrompt.hasBatch && (
                <div className="space-y-2">
                  {seriesScopePrompt.hasSeries && (
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Staff Scope
                    </div>
                  )}
                  {(
                    [
                      {
                        id: 'this' as const,
                        label: `This staff member only (${
                          seriesScopePrompt.targetEvent.staffName || 'Current'
                        })`,
                        desc:
                          seriesScopePrompt.action === 'delete'
                            ? `Delete only for ${
                                seriesScopePrompt.targetEvent.staffName || 'this staff member'
                              }.`
                            : `Apply changes only to ${
                                seriesScopePrompt.targetEvent.staffName || 'this staff member'
                              }.`,
                      },
                      {
                        id: 'all' as const,
                        label: `All selected staff for this event (${seriesScopePrompt.batchStaffNames.length} staff)`,
                        desc: `${
                          seriesScopePrompt.action === 'delete'
                            ? 'Delete across: '
                            : 'Update across: '
                        }${seriesScopePrompt.batchStaffNames.join(', ')}`,
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = batchScopeChoice === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selected
                            ? seriesScopePrompt.action === 'delete'
                              ? 'border-rose-500 bg-rose-50/50'
                              : 'border-sky-600 bg-sky-50/50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="batchScopeChoice"
                          checked={selected}
                          onChange={() => setBatchScopeChoice(opt.id)}
                          className={`mt-0.5 ${
                            seriesScopePrompt.action === 'delete'
                              ? 'text-rose-600 focus:ring-rose-500'
                              : 'text-sky-700 focus:ring-sky-600'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900">{opt.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 break-words">
                            {opt.desc}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Recurring Series Scope Options */}
              {seriesScopePrompt.hasSeries && (
                <div className="space-y-2">
                  {seriesScopePrompt.hasBatch && (
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Occurrence Scope
                    </div>
                  )}
                  {(
                    [
                      {
                        id: 'this' as const,
                        label: 'This event',
                        desc:
                          seriesScopePrompt.action === 'delete'
                            ? 'Delete only this occurrence.'
                            : 'Apply changes only to this occurrence.',
                      },
                      {
                        id: 'following' as const,
                        label: `This and following events (${seriesScopePrompt.followingIds.length})`,
                        desc:
                          seriesScopePrompt.action === 'delete'
                            ? 'Delete this occurrence and all later occurrences in the series.'
                            : 'Update this occurrence and all later occurrences; keep earlier ones.',
                      },
                      {
                        id: 'all' as const,
                        label: `All events (${seriesScopePrompt.seriesIds.length})`,
                        desc:
                          seriesScopePrompt.action === 'delete'
                            ? `Delete all ${seriesScopePrompt.seriesIds.length} occurrences in this series.`
                            : `Update all ${seriesScopePrompt.seriesIds.length} occurrences in this series.`,
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = seriesScopeChoice === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selected
                            ? seriesScopePrompt.action === 'delete'
                              ? 'border-rose-500 bg-rose-50/50'
                              : 'border-teal-600 bg-teal-50/50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="seriesScopeChoice"
                          checked={selected}
                          onChange={() => setSeriesScopeChoice(opt.id)}
                          className={`mt-0.5 ${
                            seriesScopePrompt.action === 'delete'
                              ? 'text-rose-600 focus:ring-rose-500'
                              : 'text-teal-700 focus:ring-teal-600'
                          }`}
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{opt.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setSeriesScopePrompt(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    const resolvedRecScope = seriesScopePrompt.hasSeries
                      ? seriesScopeChoice
                      : 'this';
                    const resolvedBatchScope = seriesScopePrompt.hasBatch
                      ? batchScopeChoice
                      : 'this';
                    if (seriesScopePrompt.action === 'delete') {
                      void executeDeleteScope(
                        seriesScopePrompt,
                        resolvedRecScope,
                        resolvedBatchScope
                      );
                    } else {
                      void executeSaveEvent(resolvedRecScope, resolvedBatchScope);
                    }
                  }}
                  className={`px-4 py-1.5 text-xs font-semibold text-white rounded-md disabled:opacity-50 ${
                    seriesScopePrompt.action === 'delete'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-teal-700 hover:bg-teal-800'
                  }`}
                >
                  {saving
                    ? 'Processing...'
                    : seriesScopePrompt.action === 'delete'
                    ? 'Delete'
                    : 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
