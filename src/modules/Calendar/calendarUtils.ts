import {
  CalendarEvent,
  ClientRecord,
  Cp204Record,
  RecurrenceRule,
  StaffMember,
  TaxJob,
} from '../../types/tpms';
import { formatDateDDMMYYYY, isIsoDateString } from '../../lib/deadlineUtils';
import { ExportColumn } from '../../lib/exportUtils';

export type CalendarViewMode = 'matrix' | 'month' | 'week' | 'day' | 'agenda';

export type CanonicalEventType =
  | 'Staff Availability'
  | 'Time-Off / Replace'
  | 'Tax Due Date'
  | 'Company Holiday'
  | 'Internal Event'
  | 'Client Appointment';

export type PaintTool =
  | 'select'
  | 'AL'
  | '1/2 AL'
  | 'SL'
  | 'MC'
  | 'RL'
  | 'UPL'
  | 'WFH'
  | 'TO'
  | 'clear';

export const CANONICAL_EVENT_TYPES: CanonicalEventType[] = [
  'Staff Availability',
  'Time-Off / Replace',
  'Tax Due Date',
  'Company Holiday',
  'Internal Event',
  'Client Appointment',
];

export const EVENT_TYPE_DEFAULT_COLORS: Record<CanonicalEventType, string> = {
  'Staff Availability': '#22d3ee', // Cyan
  'Time-Off / Replace': '#e0e7ff', // Soft Indigo
  'Tax Due Date': '#ef4444', // Coral / Rose Red
  'Company Holiday': '#facc15', // Yellow
  'Internal Event': '#f0abfc', // Magenta
  'Client Appointment': '#bae6fd', // Light Blue
};

export const EVENT_COLOR_SWATCHES: Array<{ hex: string; label: string }> = [
  { hex: '#22d3ee', label: 'Cyan (AL / SL / MC)' },
  { hex: '#fb923c', label: 'Orange (RL — Replacement Leave)' },
  { hex: '#f472b6', label: 'Pink (UPL — Unpaid Leave)' },
  { hex: '#86efac', label: 'Green (WFH / Fieldwork)' },
  { hex: '#e0e7ff', label: 'Soft Indigo (TO — Time-Off / Replace)' },
  { hex: '#ef4444', label: 'Coral Red (Tax Due Date)' },
  { hex: '#facc15', label: 'Yellow (Holiday)' },
  { hex: '#f0abfc', label: 'Magenta (Firm Seminar / Event)' },
  { hex: '#bae6fd', label: 'Light Blue (Client Appointment)' },
  { hex: '#fca5a5', label: 'Light Coral (Urgent / Reminder)' },
  { hex: '#cbd5e1', label: 'Slate (General)' },
];

export function getDefaultLeaveColor(codeOrLabel: string): string {
  const clean = (codeOrLabel || '').trim();
  if (!clean) return EVENT_TYPE_DEFAULT_COLORS['Staff Availability'];
  if (
    /^TO\b/i.test(clean) ||
    /\bTIME[\s-]*OFF\b/i.test(clean) ||
    /\bTIME\s+REPLACE/i.test(clean)
  ) {
    return '#e0e7ff';
  }
  if (/^WFH\b/i.test(clean) || /\bWORK\s+FROM\s+HOME\b/i.test(clean)) {
    return '#86efac';
  }
  if (
    /^(?:(?:1\/2|0\.5|half)(?:\s+day)?\s+)?RL\b/i.test(clean) ||
    /\bREPLACEMENT\s+LEAVE\b/i.test(clean)
  ) {
    return '#fb923c';
  }
  if (
    /^(?:(?:1\/2|0\.5|half)(?:\s+day)?\s+)?UPL\b/i.test(clean) ||
    /\bUNPAID\s+LEAVE\b/i.test(clean)
  ) {
    return '#f472b6';
  }
  return EVENT_TYPE_DEFAULT_COLORS['Staff Availability'];
}

export interface ParsedCalendarEvent {
  raw: CalendarEvent;
  canonicalType: CanonicalEventType;
  staffName: string;
  cleanLabel: string;
  displayTitle: string;
  color: string;
  leaveCode: string | null;
  leaveWeight: number; // 1 for AL/SL/MC, 0.5 for 1/2 AL, 0 for WFH/other
  isFirmWide: boolean;
}

export interface PublicHolidayRef {
  date: string;
  name: string;
  scope: 'Federal' | 'Johor' | 'Replacement';
  isReplacement?: boolean;
}

export interface StatutoryDeadlineRef {
  code: string;
  name: string;
  description: string;
}

export interface ShiftedDueDateInfo {
  actualDate: string;
  effectiveDate: string;
  shifted: boolean;
  actualWeekday: string;
  effectiveWeekday: string;
  shiftNote: string;
}

export interface DeadlineCollisionItem {
  source: 'job' | 'cp204' | 'statutory' | 'calendar';
  clientName: string;
  clientId: string;
  refCode: string;
  formName: string;
  deadlineType:
    | 'Final Deadline'
    | 'MITRS Due'
    | 'CP204 Due'
    | 'CP204 Revision Due'
    | 'LHDN Statutory'
    | 'Tax Due Date'
    | 'Recurring Due Date';
  dueDate: string;
  daysAfterLeave: number;
  severity: 'critical' | 'warning';
  picName?: string;
  shiftNote?: string;
}

export interface PeakCoverageAlert {
  date: string;
  label: string;
  awayCount: number;
  totalStaff: number;
  percentage: number;
  awayStaffNames: string[];
  isPeakFilingDay: boolean;
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

const CLOSED_CP204_STATUSES = new Set(['submitted', 'self-submit by client', 'completed']);

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
}

export function addDaysIso(iso: string, delta: number): string {
  return toIsoDate(addDays(parseIsoDateLocal(iso), delta));
}

export function diffDaysIso(startIso: string, endIso: string): number {
  const a = new Date(`${startIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${endIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

export function eventCoversDate(ev: CalendarEvent, isoDate: string): boolean {
  const start = (ev.startDate || '').slice(0, 10);
  const end = (ev.endDate || start).slice(0, 10);
  if (!start) return false;
  return isoDate >= start && isoDate <= (end >= start ? end : start);
}

// =============================================================================
// Google Calendar-Style RFC 5545 Recurrence Engine
// =============================================================================
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RecurrenceMonthlyMode = 'dayOfMonth' | 'nthWeekday' | 'lastDay';
export type RecurrenceEndMode = 'never' | 'on' | 'after';
export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
export type RecurrencePresetKey =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly_day'
  | 'monthly_nth'
  | 'monthly_last'
  | 'annually'
  | 'weekdays'
  | 'custom';

export interface RecurrenceConfig {
  enabled: boolean;
  freq: RecurrenceFreq;
  interval: number; // 1..99
  byWeekdays: WeekdayCode[];
  monthlyMode: RecurrenceMonthlyMode;
  endMode: RecurrenceEndMode;
  untilDate: string; // YYYY-MM-DD (used when endMode === 'on')
  count: number; // 1..365 (used when endMode === 'after')
}

export const WEEKDAY_BUTTONS: Array<{
  code: WeekdayCode;
  short1: string;
  short3: string;
  full: string;
  jsDay: number; // 0=Sun..6=Sat
}> = [
  { code: 'MO', short1: 'M', short3: 'Mon', full: 'Monday', jsDay: 1 },
  { code: 'TU', short1: 'T', short3: 'Tue', full: 'Tuesday', jsDay: 2 },
  { code: 'WE', short1: 'W', short3: 'Wed', full: 'Wednesday', jsDay: 3 },
  { code: 'TH', short1: 'T', short3: 'Thu', full: 'Thursday', jsDay: 4 },
  { code: 'FR', short1: 'F', short3: 'Fri', full: 'Friday', jsDay: 5 },
  { code: 'SA', short1: 'S', short3: 'Sat', full: 'Saturday', jsDay: 6 },
  { code: 'SU', short1: 'S', short3: 'Sun', full: 'Sunday', jsDay: 0 },
];

const WEEKDAY_ORDER: WeekdayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const JS_DAY_TO_CODE: WeekdayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const MONTH_FULL_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function getWeekdayCodeFromDate(d: Date): WeekdayCode {
  return JS_DAY_TO_CODE[d.getDay()] ?? 'MO';
}

export function getWeekdayMeta(code: WeekdayCode) {
  return WEEKDAY_BUTTONS.find((w) => w.code === code) ?? WEEKDAY_BUTTONS[0];
}

export function getNthWeekdayInfo(d: Date): { pos: 1 | 2 | 3 | 4 | -1; ordinalLabel: string; weekdayFull: string; weekdayCode: WeekdayCode } {
  const day = d.getDate();
  const nth = Math.ceil(day / 7);
  const weekdayCode = getWeekdayCodeFromDate(d);
  const weekdayFull = getWeekdayMeta(weekdayCode).full;
  if (nth >= 5) {
    return { pos: -1, ordinalLabel: 'last', weekdayFull, weekdayCode };
  }
  const labels: Record<number, string> = {
    1: 'first',
    2: 'second',
    3: 'third',
    4: 'fourth',
  };
  return {
    pos: nth as 1 | 2 | 3 | 4,
    ordinalLabel: labels[nth] || 'first',
    weekdayFull,
    weekdayCode,
  };
}

export function defaultRepeatUntilForDate(startDateIso: string): string {
  const dt = isIsoDateString(startDateIso) ? parseIsoDateLocal(startDateIso) : new Date();
  return `${dt.getFullYear()}-12-31`;
}

export function defaultNeverHorizonForDate(startDateIso: string): string {
  const dt = isIsoDateString(startDateIso) ? parseIsoDateLocal(startDateIso) : new Date();
  return `${dt.getFullYear() + 1}-12-31`;
}

export function generateRecurrenceGroupId(): string {
  return `REC_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateBatchGroupId(): string {
  return `BATCH_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getBatchSiblingEvents(
  events: CalendarEvent[],
  batchGroupId?: string
): CalendarEvent[] {
  const cleanId = (batchGroupId || '').trim();
  if (!cleanId) return [];
  return events
    .filter((e) => (e.batchGroupId || '').trim() === cleanId)
    .sort(
      (a, b) =>
        (a.startDate || '').localeCompare(b.startDate || '') ||
        (a.assignedTo || '').localeCompare(b.assignedTo || '')
    );
}

export function getDistinctStaffInBatch(
  events: CalendarEvent[],
  batchGroupId?: string
): string[] {
  const siblings = getBatchSiblingEvents(events, batchGroupId);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const ev of siblings) {
    const name = (ev.assignedTo || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function createDefaultRecurrenceConfig(startDateIso: string): RecurrenceConfig {
  const anchor = isIsoDateString(startDateIso) ? parseIsoDateLocal(startDateIso) : new Date();
  return {
    enabled: false,
    freq: 'WEEKLY',
    interval: 1,
    byWeekdays: [getWeekdayCodeFromDate(anchor)],
    monthlyMode: 'dayOfMonth',
    endMode: 'never',
    untilDate: defaultRepeatUntilForDate(startDateIso),
    count: 10,
  };
}

export function getGoogleRecurrencePresetOptions(
  startDateIso: string
): Array<{ key: RecurrencePresetKey; label: string }> {
  const anchor = isIsoDateString(startDateIso) ? parseIsoDateLocal(startDateIso) : new Date();
  const day = anchor.getDate();
  const monthName = MONTH_FULL_NAMES[anchor.getMonth()] || 'January';
  const nth = getNthWeekdayInfo(anchor);

  return [
    { key: 'none', label: 'Does not repeat' },
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: `Weekly on ${nth.weekdayFull}` },
    { key: 'monthly_day', label: `Monthly on day ${day}` },
    { key: 'monthly_nth', label: `Monthly on the ${nth.ordinalLabel} ${nth.weekdayFull}` },
    { key: 'monthly_last', label: 'Monthly on the last day' },
    { key: 'annually', label: `Annually on ${monthName} ${day}` },
    { key: 'weekdays', label: 'Every weekday (Monday to Friday)' },
    { key: 'custom', label: 'Custom...' },
  ];
}

export function buildConfigFromPreset(
  preset: Exclude<RecurrencePresetKey, 'custom'>,
  startDateIso: string
): RecurrenceConfig {
  const base = createDefaultRecurrenceConfig(startDateIso);
  const anchor = isIsoDateString(startDateIso) ? parseIsoDateLocal(startDateIso) : new Date();
  const wd = getWeekdayCodeFromDate(anchor);

  switch (preset) {
    case 'none':
      return { ...base, enabled: false };
    case 'daily':
      return { ...base, enabled: true, freq: 'DAILY', interval: 1, endMode: 'never' };
    case 'weekly':
      return {
        ...base,
        enabled: true,
        freq: 'WEEKLY',
        interval: 1,
        byWeekdays: [wd],
        endMode: 'never',
      };
    case 'monthly_day':
      return {
        ...base,
        enabled: true,
        freq: 'MONTHLY',
        interval: 1,
        monthlyMode: 'dayOfMonth',
        endMode: 'never',
      };
    case 'monthly_nth':
      return {
        ...base,
        enabled: true,
        freq: 'MONTHLY',
        interval: 1,
        monthlyMode: 'nthWeekday',
        endMode: 'never',
      };
    case 'monthly_last':
      return {
        ...base,
        enabled: true,
        freq: 'MONTHLY',
        interval: 1,
        monthlyMode: 'lastDay',
        endMode: 'never',
      };
    case 'annually':
      return {
        ...base,
        enabled: true,
        freq: 'YEARLY',
        interval: 1,
        endMode: 'never',
      };
    case 'weekdays':
      return {
        ...base,
        enabled: true,
        freq: 'WEEKLY',
        interval: 1,
        byWeekdays: ['MO', 'TU', 'WE', 'TH', 'FR'],
        endMode: 'never',
      };
  }
}

export function detectPresetFromConfig(
  config: RecurrenceConfig,
  startDateIso: string
): RecurrencePresetKey {
  if (!config.enabled) return 'none';
  if (config.interval !== 1 || config.endMode !== 'never') return 'custom';

  const anchor = isIsoDateString(startDateIso) ? parseIsoDateLocal(startDateIso) : new Date();
  const anchorWd = getWeekdayCodeFromDate(anchor);
  const sortedDays = WEEKDAY_ORDER.filter((d) => config.byWeekdays.includes(d));

  if (config.freq === 'DAILY') return 'daily';
  if (config.freq === 'YEARLY') return 'annually';
  if (config.freq === 'WEEKLY') {
    if (sortedDays.length === 1 && sortedDays[0] === anchorWd) return 'weekly';
    if (
      sortedDays.length === 5 &&
      sortedDays.join(',') === 'MO,TU,WE,TH,FR'
    ) {
      return 'weekdays';
    }
    return 'custom';
  }
  if (config.freq === 'MONTHLY') {
    if (config.monthlyMode === 'dayOfMonth') return 'monthly_day';
    if (config.monthlyMode === 'nthWeekday') return 'monthly_nth';
    if (config.monthlyMode === 'lastDay') return 'monthly_last';
  }
  return 'custom';
}

export function buildRRuleString(config: RecurrenceConfig, startDateIso: string): string {
  if (!config.enabled) return '';
  const anchor = isIsoDateString(startDateIso) ? parseIsoDateLocal(startDateIso) : new Date();
  const parts: string[] = [`FREQ=${config.freq}`];
  const interval = Math.max(1, Math.min(99, Math.round(config.interval || 1)));
  if (interval > 1) {
    parts.push(`INTERVAL=${interval}`);
  }

  if (config.freq === 'WEEKLY') {
    const sorted = WEEKDAY_ORDER.filter((w) => config.byWeekdays.includes(w));
    const finalDays = sorted.length > 0 ? sorted : [getWeekdayCodeFromDate(anchor)];
    parts.push(`BYDAY=${finalDays.join(',')}`);
  } else if (config.freq === 'MONTHLY') {
    if (config.monthlyMode === 'lastDay') {
      parts.push('BYMONTHDAY=-1');
    } else if (config.monthlyMode === 'nthWeekday') {
      const nth = getNthWeekdayInfo(anchor);
      parts.push(`BYDAY=${nth.pos}${nth.weekdayCode}`);
    } else {
      parts.push(`BYMONTHDAY=${anchor.getDate()}`);
    }
  } else if (config.freq === 'YEARLY') {
    parts.push(`BYMONTH=${anchor.getMonth() + 1}`);
    parts.push(`BYMONTHDAY=${anchor.getDate()}`);
  }

  if (config.endMode === 'on' && isIsoDateString(config.untilDate)) {
    parts.push(`UNTIL=${config.untilDate.replace(/-/g, '')}`);
  } else if (config.endMode === 'after' && config.count > 0) {
    parts.push(`COUNT=${Math.max(1, Math.min(365, Math.round(config.count)))}`);
  }

  return parts.join(';');
}

export function parseRRuleString(
  ruleRaw: string | undefined | null,
  startDateIso: string,
  fallbackUntil?: string
): RecurrenceConfig {
  const base = createDefaultRecurrenceConfig(startDateIso);
  const raw = (ruleRaw || '').trim();
  if (!raw || raw.toLowerCase() === 'none') {
    return { ...base, enabled: false };
  }

  // Backwards compatibility with legacy simple rules ('weekly', 'monthly', 'yearly')
  const lower = raw.toLowerCase();
  if (lower === 'weekly' || lower === 'monthly' || lower === 'yearly' || lower === 'daily') {
    const freqMap: Record<string, RecurrenceFreq> = {
      daily: 'DAILY',
      weekly: 'WEEKLY',
      monthly: 'MONTHLY',
      yearly: 'YEARLY',
    };
    return {
      ...base,
      enabled: true,
      freq: freqMap[lower],
      endMode: isIsoDateString(fallbackUntil) ? 'on' : 'never',
      untilDate: isIsoDateString(fallbackUntil) ? fallbackUntil! : base.untilDate,
    };
  }

  const kv = new Map<string, string>();
  for (const seg of raw.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = seg.split('=');
    if (k && v) kv.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }

  const freqVal = kv.get('FREQ');
  if (
    freqVal !== 'DAILY' &&
    freqVal !== 'WEEKLY' &&
    freqVal !== 'MONTHLY' &&
    freqVal !== 'YEARLY'
  ) {
    return { ...base, enabled: false };
  }

  const intervalParsed = Number(kv.get('INTERVAL') || '1');
  const interval =
    Number.isFinite(intervalParsed) && intervalParsed >= 1
      ? Math.min(99, Math.round(intervalParsed))
      : 1;

  let byWeekdays = base.byWeekdays;
  let monthlyMode: RecurrenceMonthlyMode = 'dayOfMonth';

  const byDay = kv.get('BYDAY');
  const byMonthDay = kv.get('BYMONTHDAY');

  if (freqVal === 'WEEKLY' && byDay) {
    const parsedDays = byDay
      .split(',')
      .map((token) => token.replace(/^-?\d+/, '') as WeekdayCode)
      .filter((code) => WEEKDAY_ORDER.includes(code));
    if (parsedDays.length > 0) byWeekdays = parsedDays;
  } else if (freqVal === 'MONTHLY') {
    if (byMonthDay === '-1') {
      monthlyMode = 'lastDay';
    } else if (byDay) {
      monthlyMode = 'nthWeekday';
    } else {
      monthlyMode = 'dayOfMonth';
    }
  }

  let endMode: RecurrenceEndMode = 'never';
  let untilDate = base.untilDate;
  let count = base.count;

  const untilRaw = kv.get('UNTIL');
  const countRaw = kv.get('COUNT');

  if (untilRaw) {
    const clean = untilRaw.replace(/[^0-9]/g, '');
    if (clean.length >= 8) {
      const parsedIso = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      if (isIsoDateString(parsedIso)) {
        endMode = 'on';
        untilDate = parsedIso;
      }
    }
  } else if (countRaw) {
    const c = Number(countRaw);
    if (Number.isFinite(c) && c >= 1) {
      endMode = 'after';
      count = Math.min(365, Math.round(c));
    }
  } else if (isIsoDateString(fallbackUntil)) {
    endMode = 'on';
    untilDate = fallbackUntil!;
  }

  return {
    enabled: true,
    freq: freqVal,
    interval,
    byWeekdays,
    monthlyMode,
    endMode,
    untilDate,
    count,
  };
}

export function formatRecurrenceSummary(
  config: RecurrenceConfig,
  startDateIso: string
): string {
  if (!config.enabled) return 'Does not repeat';
  const anchor = isIsoDateString(startDateIso) ? parseIsoDateLocal(startDateIso) : new Date();
  const interval = Math.max(1, Math.min(99, Math.round(config.interval || 1)));
  const day = anchor.getDate();
  const monthName = MONTH_FULL_NAMES[anchor.getMonth()] || 'January';
  const nth = getNthWeekdayInfo(anchor);

  let core = '';
  if (config.freq === 'DAILY') {
    core = interval === 1 ? 'Daily' : `Every ${interval} days`;
  } else if (config.freq === 'WEEKLY') {
    const sorted = WEEKDAY_ORDER.filter((d) => config.byWeekdays.includes(d));
    const effectiveDays = sorted.length > 0 ? sorted : [nth.weekdayCode];
    if (interval === 1 && effectiveDays.join(',') === 'MO,TU,WE,TH,FR') {
      core = 'Every weekday (Monday to Friday)';
    } else if (interval === 1 && effectiveDays.length === 1) {
      core = `Weekly on ${getWeekdayMeta(effectiveDays[0]).full}`;
    } else if (interval === 1) {
      core = `Weekly on ${effectiveDays.map((c) => getWeekdayMeta(c).short3).join(', ')}`;
    } else {
      core = `Every ${interval} weeks on ${effectiveDays
        .map((c) => getWeekdayMeta(c).short3)
        .join(', ')}`;
    }
  } else if (config.freq === 'MONTHLY') {
    const prefix = interval === 1 ? 'Monthly' : `Every ${interval} months`;
    if (config.monthlyMode === 'lastDay') {
      core = `${prefix} on the last day`;
    } else if (config.monthlyMode === 'nthWeekday') {
      core = `${prefix} on the ${nth.ordinalLabel} ${nth.weekdayFull}`;
    } else {
      core = `${prefix} on day ${day}`;
    }
  } else {
    core =
      interval === 1
        ? `Annually on ${monthName} ${day}`
        : `Every ${interval} years on ${monthName} ${day}`;
  }

  if (config.endMode === 'on' && isIsoDateString(config.untilDate)) {
    return `${core} until ${formatDateDDMMYYYY(config.untilDate)}`;
  }
  if (config.endMode === 'after' && config.count > 0) {
    return `${core}, ${config.count} time${config.count === 1 ? '' : 's'}`;
  }
  return core;
}

export function formatRecurrenceRuleLabel(
  rule?: RecurrenceRule,
  startDateIso?: string,
  storedLabel?: string
): string {
  if (storedLabel && storedLabel.trim()) return storedLabel.trim();
  if (!rule || rule === 'none') return 'Does not repeat';
  const dt = startDateIso && isIsoDateString(startDateIso) ? startDateIso : toIsoDate(new Date());
  const parsed = parseRRuleString(rule, dt);
  return formatRecurrenceSummary(parsed, dt);
}

function getNthWeekdayDateInMonth(
  year: number,
  monthIndex: number,
  weekdayCode: WeekdayCode,
  pos: 1 | 2 | 3 | 4 | -1
): Date {
  const targetJsDay = getWeekdayMeta(weekdayCode).jsDay;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  if (pos === -1) {
    for (let d = lastDay; d >= 1; d--) {
      const dt = new Date(year, monthIndex, d);
      if (dt.getDay() === targetJsDay) return dt;
    }
    return new Date(year, monthIndex, lastDay);
  }

  let seen = 0;
  let lastMatch = new Date(year, monthIndex, 1);
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(year, monthIndex, d);
    if (dt.getDay() === targetJsDay) {
      seen += 1;
      lastMatch = dt;
      if (seen === pos) return dt;
    }
  }
  return lastMatch;
}

/**
 * Generates occurrence date ranges for any RFC 5545 RecurrenceConfig,
 * preserving multi-day duration when endDateIso > startDateIso.
 * When endMode === 'never', generates occurrences through 31/12 of the following year.
 */
export function generateRRuleOccurrences(
  startDateIso: string,
  endDateIso: string,
  config: RecurrenceConfig,
  maxOccurrences = 400
): Array<{ startDate: string; endDate: string }> {
  if (!isIsoDateString(startDateIso)) return [];
  const effectiveEnd =
    isIsoDateString(endDateIso) && endDateIso >= startDateIso ? endDateIso : startDateIso;
  const durationDays = Math.max(0, diffDaysIso(startDateIso, effectiveEnd));

  if (!config.enabled) {
    return [{ startDate: startDateIso, endDate: effectiveEnd }];
  }

  const anchor = parseIsoDateLocal(startDateIso);
  const interval = Math.max(1, Math.min(99, Math.round(config.interval || 1)));
  const maxCount =
    config.endMode === 'after'
      ? Math.max(1, Math.min(maxOccurrences, Math.round(config.count || 1)))
      : maxOccurrences;
  const horizonIso =
    config.endMode === 'on' && isIsoDateString(config.untilDate)
      ? config.untilDate
      : config.endMode === 'never'
      ? defaultNeverHorizonForDate(startDateIso)
      : `${anchor.getFullYear() + 30}-12-31`;

  if (config.endMode === 'on' && horizonIso < startDateIso) {
    return [{ startDate: startDateIso, endDate: effectiveEnd }];
  }

  const occurrences: Array<{ startDate: string; endDate: string }> = [];
  const pushOccurrence = (occStart: string): boolean => {
    if (occStart < startDateIso) return true;
    if (occStart > horizonIso) return false;
    const occEnd = durationDays > 0 ? addDaysIso(occStart, durationDays) : occStart;
    occurrences.push({ startDate: occStart, endDate: occEnd });
    return occurrences.length < maxCount;
  };

  if (config.freq === 'DAILY') {
    for (let step = 0; step < 5000; step++) {
      const occStart = toIsoDate(addDays(anchor, step * interval));
      if (!pushOccurrence(occStart)) break;
    }
  } else if (config.freq === 'WEEKLY') {
    const sorted = WEEKDAY_ORDER.filter((d) => config.byWeekdays.includes(d));
    const effectiveDays = sorted.length > 0 ? sorted : [getWeekdayCodeFromDate(anchor)];
    const mondayAnchor = startOfWeekMonday(anchor);
    const dayOffsets = effectiveDays.map((code) => WEEKDAY_ORDER.indexOf(code));

    outerWeekly: for (let weekStep = 0; weekStep < 1500; weekStep++) {
      const weekMonday = addDays(mondayAnchor, weekStep * interval * 7);
      if (toIsoDate(weekMonday) > horizonIso) break;
      for (const offset of dayOffsets) {
        const occStart = toIsoDate(addDays(weekMonday, offset));
        if (occStart > horizonIso) break outerWeekly;
        if (!pushOccurrence(occStart)) break outerWeekly;
      }
    }
  } else if (config.freq === 'MONTHLY') {
    const anchorYear = anchor.getFullYear();
    const anchorMonth = anchor.getMonth();
    const anchorDay = anchor.getDate();
    const nth = getNthWeekdayInfo(anchor);

    for (let step = 0; step < 600; step++) {
      const firstOfMonth = new Date(anchorYear, anchorMonth + step * interval, 1);
      const ty = firstOfMonth.getFullYear();
      const tm = firstOfMonth.getMonth();
      const lastDay = new Date(ty, tm + 1, 0).getDate();

      let dt: Date;
      if (config.monthlyMode === 'lastDay') {
        dt = new Date(ty, tm, lastDay);
      } else if (config.monthlyMode === 'nthWeekday') {
        dt = getNthWeekdayDateInMonth(ty, tm, nth.weekdayCode, nth.pos);
      } else {
        dt = new Date(ty, tm, Math.min(anchorDay, lastDay));
      }

      const occStart = toIsoDate(dt);
      if (occStart > horizonIso) break;
      if (!pushOccurrence(occStart)) break;
    }
  } else {
    // YEARLY
    const anchorYear = anchor.getFullYear();
    const anchorMonth = anchor.getMonth();
    const anchorDay = anchor.getDate();

    for (let step = 0; step < 100; step++) {
      const ty = anchorYear + step * interval;
      const lastDay = new Date(ty, anchorMonth + 1, 0).getDate();
      const occStart = toIsoDate(new Date(ty, anchorMonth, Math.min(anchorDay, lastDay)));
      if (occStart > horizonIso) break;
      if (!pushOccurrence(occStart)) break;
    }
  }

  return occurrences.length > 0
    ? occurrences
    : [{ startDate: startDateIso, endDate: effectiveEnd }];
}

export function isValidHexColor(hex: string | undefined | null): hex is string {
  return Boolean(hex && /^#[0-9a-fA-F]{6}$/.test(hex.trim()));
}

export function getContrastingTextColor(hex: string): string {
  if (!isValidHexColor(hex)) return '#0f172a';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#0f172a' : '#ffffff';
}

export function detectLeaveCodeAndWeight(label: string): { code: string | null; weight: number } {
  const clean = (label || '').trim();
  const upper = clean.toUpperCase();
  if (!clean) return { code: null, weight: 1 };

  // Time-Off / Replace (TO) is a 0-leave-deduction hourly arrangement
  if (
    /^TO\b/i.test(clean) ||
    /\bTIME[\s-]*OFF\b/i.test(clean) ||
    /\bTIME\s+REPLACE/i.test(clean)
  ) {
    return { code: 'TO', weight: 0 };
  }

  // WFH is a working day (0 leave deduction)
  if (/^WFH\b/i.test(clean) || /\bWORK\s+FROM\s+HOME\b/i.test(clean)) {
    return { code: 'WFH', weight: 0 };
  }

  // Any leave starting with "1/2", "0.5", or "Half" (or containing "Half Day") counts as 0.5 leave day
  const isHalf =
    /^(?:1\/2|0\.5|half)\b/i.test(clean) ||
    /\bhalf[\s-]*day\b/i.test(clean) ||
    /\bhalf[\s-]*al\b/i.test(clean);

  if (isHalf) {
    if (/\bRL\b/i.test(clean) || /\bREPLACEMENT\b/i.test(clean)) {
      return { code: '1/2 RL', weight: 0.5 };
    }
    if (/\bUPL\b/i.test(clean) || /\bUNPAID\b/i.test(clean)) {
      return { code: '1/2 UPL', weight: 0.5 };
    }
    if (/\bSL\b/i.test(clean) || /\bSICK\b/i.test(clean) || /\bSTUDY\b/i.test(clean)) {
      return { code: '1/2 SL', weight: 0.5 };
    }
    if (/\bMC\b/i.test(clean) || /\bMEDICAL\b/i.test(clean)) {
      return { code: '1/2 MC', weight: 0.5 };
    }
    if (/\bAL\b/i.test(clean) || /\bANNUAL\b/i.test(clean)) {
      return { code: '1/2 AL', weight: 0.5 };
    }
    return { code: clean.slice(0, 12), weight: 0.5 };
  }

  // Standard full-day leave codes (1.0 leave day)
  if (/^RL\b/i.test(clean) || /\bREPLACEMENT\s+LEAVE\b/i.test(clean)) {
    return { code: 'RL', weight: 1 };
  }
  if (/^UPL\b/i.test(clean) || /\bUNPAID\s+LEAVE\b/i.test(clean)) {
    return { code: 'UPL', weight: 1 };
  }
  if (/^MC\b/i.test(clean) || /\bMEDICAL\b/i.test(clean)) {
    return { code: 'MC', weight: 1 };
  }
  if (/^SL\b/i.test(clean) || /\bSICK\s*LEAVE\b/i.test(clean) || /\bSTUDY\s*LEAVE\b/i.test(clean)) {
    return { code: 'SL', weight: 1 };
  }
  if (/^EL\b/i.test(clean) || /\bEMERGENCY\s*LEAVE\b/i.test(clean)) {
    return { code: 'EL', weight: 1 };
  }
  if (/^AL\b/i.test(clean) || /\bANNUAL\s*LEAVE\b/i.test(clean) || upper === 'LEAVE') {
    return { code: 'AL', weight: 1 };
  }

  // Any other custom Staff Availability code counts as 1.0 leave day
  return { code: clean.slice(0, 12), weight: 1 };
}

export function parseCalendarEvent(ev: CalendarEvent): ParsedCalendarEvent {
  const title = (ev.title || '').trim();
  const typeLower = (ev.eventType || '').trim().toLowerCase();

  let canonicalType: CanonicalEventType = 'Internal Event';
  let staffName = (ev.assignedTo || '').trim();
  let cleanLabel = title;
  let displayTitle = title;

  const holidayMatch = /^\[HOLIDAY\]\s*(.*)$/i.exec(title);
  const dueMatch = /^\[DUE\]\s*(.*)$/i.exec(title);
  const toStaffMatch = /^\[TO\]\s*\[STAFF:\s*([^\]]+)\]\s*(.*)$/i.exec(title);
  const toSimpleMatch = /^\[TO\]\s*(.*)$/i.exec(title);
  const leaveStaffMatch = /^\[LEAVE\]\s*\[STAFF:\s*([^\]]+)\]\s*(.*)$/i.exec(title);
  const leaveSimpleMatch = /^\[LEAVE\]\s*(.*)$/i.exec(title);
  const clientMatch = /^\[CLIENT\]\s*(.*)$/i.exec(title);
  const eventMatch = /^\[EVENT\]\s*(.*)$/i.exec(title);

  if (holidayMatch || typeLower.includes('holiday')) {
    canonicalType = 'Company Holiday';
    staffName = '';
    cleanLabel = (holidayMatch ? holidayMatch[1] : title).trim() || 'Company Holiday';
    displayTitle = `[HOLIDAY] ${cleanLabel}`;
  } else if (
    dueMatch ||
    typeLower === 'tax due date' ||
    typeLower.includes('tax due') ||
    typeLower.includes('due date')
  ) {
    canonicalType = 'Tax Due Date';
    if (staffName.toLowerCase() === 'all staff / statutory') {
      staffName = '';
    }
    cleanLabel = (dueMatch ? dueMatch[1] : title).trim() || 'Tax Due Date';
    displayTitle = cleanLabel;
  } else if (
    toStaffMatch ||
    toSimpleMatch ||
    typeLower === 'time-off / replace' ||
    typeLower.includes('time-off') ||
    typeLower.includes('time off')
  ) {
    canonicalType = 'Time-Off / Replace';
    if (toStaffMatch) {
      staffName = toStaffMatch[1].trim() || staffName;
      cleanLabel = toStaffMatch[2].trim() || 'TO';
    } else if (toSimpleMatch) {
      cleanLabel = toSimpleMatch[1].trim() || 'TO';
    } else {
      cleanLabel = title || 'TO';
    }
    displayTitle = staffName
      ? `[TO] [STAFF: ${staffName}] ${cleanLabel}`
      : `[TO] ${cleanLabel}`;
  } else if (
    clientMatch ||
    typeLower.includes('client') ||
    typeLower.includes('appointment') ||
    (Boolean(ev.clientId || ev.clientName) && !leaveStaffMatch && !leaveSimpleMatch && !eventMatch)
  ) {
    canonicalType = 'Client Appointment';
    cleanLabel = (clientMatch ? clientMatch[1] : title).trim() || ev.clientName || 'Client Meeting';
    displayTitle = cleanLabel;
  } else if (leaveStaffMatch) {
    canonicalType = 'Staff Availability';
    staffName = leaveStaffMatch[1].trim() || staffName;
    cleanLabel = leaveStaffMatch[2].trim() || 'AL';
    displayTitle = `[LEAVE] [STAFF: ${staffName || 'Staff'}] ${cleanLabel}`;
  } else if (leaveSimpleMatch || typeLower.includes('leave') || typeLower.includes('availability')) {
    canonicalType = 'Staff Availability';
    cleanLabel = (leaveSimpleMatch ? leaveSimpleMatch[1] : title).trim() || 'AL';
    displayTitle = staffName
      ? `[LEAVE] [STAFF: ${staffName}] ${cleanLabel}`
      : `[LEAVE] ${cleanLabel}`;
  } else if (eventMatch) {
    canonicalType = 'Internal Event';
    cleanLabel = eventMatch[1].trim() || title;
    displayTitle = `[EVENT] ${cleanLabel}`;
  } else {
    canonicalType = 'Internal Event';
    cleanLabel = title || 'Internal Event';
    displayTitle = title || 'Internal Event';
  }

  const leaveInfo =
    canonicalType === 'Time-Off / Replace'
      ? { code: 'TO', weight: 0 }
      : canonicalType === 'Staff Availability'
      ? detectLeaveCodeAndWeight(cleanLabel)
      : { code: null, weight: 0 };

  const leaveWeight = canonicalType === 'Staff Availability' ? leaveInfo.weight : 0;

  const color = isValidHexColor(ev.color)
    ? ev.color.trim()
    : canonicalType === 'Staff Availability'
    ? getDefaultLeaveColor(cleanLabel)
    : EVENT_TYPE_DEFAULT_COLORS[canonicalType];

  const isFirmWide =
    canonicalType === 'Company Holiday' ||
    canonicalType === 'Tax Due Date' ||
    (canonicalType === 'Internal Event' && !staffName && !ev.clientId && !ev.clientName);

  return {
    raw: ev,
    canonicalType,
    staffName,
    cleanLabel,
    displayTitle,
    color,
    leaveCode: leaveInfo.code,
    leaveWeight,
    isFirmWide,
  };
}

export function buildFormattedTitle(
  type: CanonicalEventType,
  label: string,
  staffName: string,
  clientName?: string
): string {
  const clean = label.trim();
  if (type === 'Company Holiday') {
    return `[HOLIDAY] ${clean}`;
  }
  if (type === 'Tax Due Date') {
    return `[DUE] ${clean}`;
  }
  if (type === 'Time-Off / Replace') {
    const staffPart = staffName.trim() || 'Staff';
    return `[TO] [STAFF: ${staffPart}] ${clean || 'TO'}`;
  }
  if (type === 'Staff Availability') {
    const staffPart = staffName.trim() || 'Staff';
    return `[LEAVE] [STAFF: ${staffPart}] ${clean}`;
  }
  if (type === 'Client Appointment') {
    if (clean) return clean;
    return clientName ? `${clientName} Appointment` : 'Client Appointment';
  }
  return `[EVENT] ${clean}`;
}

/**
 * Johor & Malaysia Federal Public Holidays (2025–2027 + fixed annual holidays)
 * with automatic Monday replacement when a holiday falls on a Sunday
 * (Johor shifted back to Sat–Sun weekends effective 1 Jan 2025).
 */
export function getJohorMalaysiaPublicHolidays(year: number): PublicHolidayRef[] {
  const variableByYear: Record<number, PublicHolidayRef[]> = {
    2025: [
      { date: '2025-01-29', name: 'Chinese New Year (Day 1)', scope: 'Federal' },
      { date: '2025-01-30', name: 'Chinese New Year (Day 2)', scope: 'Federal' },
      { date: '2025-02-11', name: 'Thaipusam', scope: 'Johor' },
      { date: '2025-03-02', name: 'Awal Ramadan (Johor)', scope: 'Johor' },
      { date: '2025-03-23', name: 'Sultan of Johor Birthday', scope: 'Johor' },
      { date: '2025-03-31', name: 'Hari Raya Aidilfitri (Day 1)', scope: 'Federal' },
      { date: '2025-04-01', name: 'Hari Raya Aidilfitri (Day 2)', scope: 'Federal' },
      { date: '2025-05-12', name: 'Wesak Day', scope: 'Federal' },
      { date: '2025-06-02', name: 'Agong Birthday', scope: 'Federal' },
      { date: '2025-06-07', name: 'Hari Raya Haji', scope: 'Federal' },
      { date: '2025-06-27', name: 'Awal Muharram', scope: 'Federal' },
      { date: '2025-07-31', name: 'Hari Hol Almarhum Sultan Iskandar', scope: 'Johor' },
      { date: '2025-09-05', name: 'Maulidur Rasul', scope: 'Federal' },
      { date: '2025-10-20', name: 'Deepavali', scope: 'Federal' },
    ],
    2026: [
      { date: '2026-02-01', name: 'Thaipusam', scope: 'Johor' },
      { date: '2026-02-17', name: 'Chinese New Year (Day 1)', scope: 'Federal' },
      { date: '2026-02-18', name: 'Chinese New Year (Day 2)', scope: 'Federal' },
      { date: '2026-02-19', name: 'Awal Ramadan (Johor)', scope: 'Johor' },
      { date: '2026-03-20', name: 'Hari Raya Aidilfitri (Day 1)', scope: 'Federal' },
      { date: '2026-03-21', name: 'Hari Raya Aidilfitri (Day 2)', scope: 'Federal' },
      { date: '2026-03-23', name: 'Sultan of Johor Birthday', scope: 'Johor' },
      { date: '2026-05-27', name: 'Hari Raya Haji', scope: 'Federal' },
      { date: '2026-05-31', name: 'Wesak Day', scope: 'Federal' },
      { date: '2026-06-01', name: 'Agong Birthday', scope: 'Federal' },
      { date: '2026-06-17', name: 'Awal Muharram', scope: 'Federal' },
      { date: '2026-07-21', name: 'Hari Hol Almarhum Sultan Iskandar', scope: 'Johor' },
      { date: '2026-08-25', name: 'Maulidur Rasul', scope: 'Federal' },
      { date: '2026-11-08', name: 'Deepavali', scope: 'Federal' },
    ],
    2027: [
      { date: '2027-01-22', name: 'Thaipusam', scope: 'Johor' },
      { date: '2027-02-06', name: 'Chinese New Year (Day 1)', scope: 'Federal' },
      { date: '2027-02-07', name: 'Chinese New Year (Day 2)', scope: 'Federal' },
      { date: '2027-02-08', name: 'Awal Ramadan (Johor)', scope: 'Johor' },
      { date: '2027-03-10', name: 'Hari Raya Aidilfitri (Day 1)', scope: 'Federal' },
      { date: '2027-03-11', name: 'Hari Raya Aidilfitri (Day 2)', scope: 'Federal' },
      { date: '2027-03-23', name: 'Sultan of Johor Birthday', scope: 'Johor' },
      { date: '2027-05-17', name: 'Hari Raya Haji', scope: 'Federal' },
      { date: '2027-05-20', name: 'Wesak Day', scope: 'Federal' },
      { date: '2027-06-07', name: 'Agong Birthday / Awal Muharram', scope: 'Federal' },
      { date: '2027-07-10', name: 'Hari Hol Almarhum Sultan Iskandar', scope: 'Johor' },
      { date: '2027-08-15', name: 'Maulidur Rasul', scope: 'Federal' },
      { date: '2027-10-28', name: 'Deepavali', scope: 'Federal' },
    ],
  };

  const fixed: PublicHolidayRef[] = [
    { date: `${year}-03-23`, name: 'Sultan of Johor Birthday', scope: 'Johor' },
    { date: `${year}-05-01`, name: 'Labour Day', scope: 'Federal' },
    { date: `${year}-08-31`, name: 'National Day (Hari Merdeka)', scope: 'Federal' },
    { date: `${year}-09-16`, name: 'Malaysia Day', scope: 'Federal' },
    { date: `${year}-12-25`, name: 'Christmas Day', scope: 'Federal' },
  ];

  // Deduplicate base holidays by date+name
  const baseMerged = [...fixed, ...(variableByYear[year] ?? [])];
  const seen = new Set<string>();
  const baseList = baseMerged
    .filter((h) => {
      const k = `${h.date}|${h.name.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const occupiedDates = new Set(baseList.map((h) => h.date));
  const replacements: PublicHolidayRef[] = [];

  for (const h of baseList) {
    const dt = parseIsoDateLocal(h.date);
    if (dt.getDay() === 0) {
      // Falls on Sunday -> next available weekday (usually Monday; Tuesday if Monday is already a holiday)
      let repIso = addDaysIso(h.date, 1);
      while (occupiedDates.has(repIso) || parseIsoDateLocal(repIso).getDay() === 0 || parseIsoDateLocal(repIso).getDay() === 6) {
        repIso = addDaysIso(repIso, 1);
      }
      occupiedDates.add(repIso);
      replacements.push({
        date: repIso,
        name: `${h.name} (Replacement)`,
        scope: 'Replacement',
        isReplacement: true,
      });
    }
  }

  return [...baseList, ...replacements].sort((a, b) => a.date.localeCompare(b.date));
}

export function getMonthDays(year: number, monthIndex: number, includeWeekends: boolean): Date[] {
  const days: Date[] = [];
  const total = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= total; d++) {
    const dt = new Date(year, monthIndex, d);
    const dow = dt.getDay();
    if (!includeWeekends && (dow === 0 || dow === 6)) continue;
    days.push(dt);
  }
  return days;
}

export function formatShortDayMonth(d: Date): string {
  const monthShort = d.toLocaleDateString('en-MY', { month: 'short' });
  return `${d.getDate()}-${monthShort}`;
}

export function formatClientChipLabel(ev: ParsedCalendarEvent): string {
  const clientBase = (ev.raw.clientName || '').trim();
  const label = ev.cleanLabel.trim();
  // Shorten Sdn Bhd / Berhad for compact cell chip display
  const shortClient = clientBase
    .replace(/\bSdn\.?\s*Bhd\.?/gi, '')
    .replace(/\bBerhad\b/gi, '')
    .trim()
    .slice(0, 18);

  const timeMatch = /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i.exec(label);
  if (shortClient && timeMatch) {
    return `${shortClient} · ${timeMatch[1].replace(/\s+/g, '').toLowerCase()}`;
  }
  if (shortClient && label && !label.toLowerCase().includes(shortClient.toLowerCase())) {
    return `${shortClient} · ${label.slice(0, 14)}`;
  }
  return shortClient || label.slice(0, 22) || 'Client Appt';
}

export function isJobActiveForWorkload(job: TaxJob): boolean {
  return !CLOSED_JOB_STATUSES.has((job.status || '').trim().toLowerCase());
}

export function computeOpenJobsByStaff(jobs: TaxJob[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const j of jobs) {
    if (!isJobActiveForWorkload(j)) continue;
    const picKey = (j.taxPic || '').trim().toLowerCase();
    if (!picKey) continue;
    map.set(picKey, (map.get(picKey) ?? 0) + 1);
  }
  return map;
}

/**
 * Key recurring Malaysian LHDN statutory filing & payment deadlines.
 */
export function getMalaysianStatutoryDeadlinesForDate(isoDate: string): StatutoryDeadlineRef[] {
  if (!isIsoDateString(isoDate)) return [];
  const dt = parseIsoDateLocal(isoDate);
  const month = dt.getMonth() + 1; // 1..12
  const day = dt.getDate(); // 1..31
  const results: StatutoryDeadlineRef[] = [];

  // 15th of every month: CP204 Instalment & PCB Due
  if (day === 15) {
    results.push({
      code: 'LHDN-15',
      name: 'CP204 Instalment & PCB Due',
      description: 'Monthly 15th statutory CP204 instalment & PCB/MTD remittance deadline',
    });
  }

  // 28 Feb (and 29 Feb on leap years): Form EA
  if (month === 2 && (day === 28 || day === 29)) {
    results.push({
      code: 'LHDN-EA',
      name: 'Form EA',
      description: 'Employer Statement of Remuneration (Form EA) due 28 Feb',
    });
  }

  // 31 Mar / 30 Apr: Form E & CP58
  if ((month === 3 && day === 31) || (month === 4 && day === 30)) {
    results.push({
      code: 'LHDN-E',
      name: 'Form E & CP58',
      description:
        month === 3
          ? 'Statutory Form E & CP58 deadline (31 Mar)'
          : 'e-Filing Form E grace deadline (30 Apr)',
    });
  }

  // 30 Apr / 15 May: Form BE
  if ((month === 4 && day === 30) || (month === 5 && day === 15)) {
    results.push({
      code: 'LHDN-BE',
      name: 'Form BE',
      description:
        month === 4
          ? 'Individual Non-Business Tax Return (Form BE) statutory deadline (30 Apr)'
          : 'Individual Non-Business Tax Return (Form BE) e-Filing grace deadline (15 May)',
    });
  }

  // 30 Jun / 15 Jul: Form B / P
  if ((month === 6 && day === 30) || (month === 7 && day === 15)) {
    results.push({
      code: 'LHDN-BP',
      name: 'Form B / P',
      description:
        month === 6
          ? 'Individual Business (Form B) & Partnership (Form P) statutory deadline (30 Jun)'
          : 'Individual Business (Form B) & Partnership (Form P) e-Filing grace deadline (15 Jul)',
    });
  }

  // 31 Jul / 31 Aug: Dec FYE Form C & CP204
  if ((month === 7 && day === 31) || (month === 8 && day === 31)) {
    results.push({
      code: 'LHDN-C',
      name: 'Dec FYE Form C & CP204',
      description:
        month === 7
          ? 'Dec FYE Form C (7 months) & CP204 submission deadline (31 Jul)'
          : 'Dec FYE Form C e-Filing grace / CP204 deadline (31 Aug)',
    });
  }

  return results;
}

const SHORT_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * When a statutory or calendar Tax Due Date falls on a weekend (Sat/Sun),
 * shifts its effective working day backward to the last working weekday before
 * that weekend (also stepping back past any Johor/MY Public Holiday or Company Holiday).
 * Weekday due dates are returned unchanged (shifted: false).
 */
export function shiftToLastWorkingWeekday(
  isoDate: string,
  holidaysByDate?: Map<string, PublicHolidayRef>,
  companyHolidayDates?: Set<string>
): ShiftedDueDateInfo {
  const cleanIso = (isoDate || '').slice(0, 10);
  if (!isIsoDateString(cleanIso)) {
    return {
      actualDate: cleanIso,
      effectiveDate: cleanIso,
      shifted: false,
      actualWeekday: '',
      effectiveWeekday: '',
      shiftNote: '',
    };
  }

  const dt = parseIsoDateLocal(cleanIso);
  const dow = dt.getDay();
  const actualWeekday = SHORT_WEEKDAY_LABELS[dow] || '';

  if (dow !== 0 && dow !== 6) {
    return {
      actualDate: cleanIso,
      effectiveDate: cleanIso,
      shifted: false,
      actualWeekday,
      effectiveWeekday: actualWeekday,
      shiftNote: '',
    };
  }

  let cursor = addDaysIso(cleanIso, -1);
  for (let steps = 0; steps < 14; steps++) {
    const cDt = parseIsoDateLocal(cursor);
    const cDow = cDt.getDay();
    const isWknd = cDow === 0 || cDow === 6;
    const isPh = Boolean(holidaysByDate?.has(cursor));
    const isCompHol = Boolean(companyHolidayDates?.has(cursor));
    if (!isWknd && !isPh && !isCompHol) {
      const effectiveWeekday = SHORT_WEEKDAY_LABELS[cDow] || '';
      return {
        actualDate: cleanIso,
        effectiveDate: cursor,
        shifted: true,
        actualWeekday,
        effectiveWeekday,
        shiftNote: `Actual due date: ${formatDateDDMMYYYY(cleanIso)} (${actualWeekday}) → Last working day: ${effectiveWeekday} ${formatDateDDMMYYYY(cursor)}`,
      };
    }
    cursor = addDaysIso(cursor, -1);
  }

  const fallbackDow = parseIsoDateLocal(cursor).getDay();
  const effectiveWeekday = SHORT_WEEKDAY_LABELS[fallbackDow] || '';
  return {
    actualDate: cleanIso,
    effectiveDate: cursor,
    shifted: true,
    actualWeekday,
    effectiveWeekday,
    shiftNote: `Actual due date: ${formatDateDDMMYYYY(cleanIso)} (${actualWeekday}) → Last working day: ${effectiveWeekday} ${formatDateDDMMYYYY(cursor)}`,
  };
}

export function computeStaffDeadlineCollisions(
  staffName: string,
  leaveDateIso: string,
  jobs: TaxJob[],
  cp204Records: Cp204Record[],
  parsedEvents: ParsedCalendarEvent[] = [],
  holidaysByDate?: Map<string, PublicHolidayRef>,
  companyHolidayDates?: Set<string>
): DeadlineCollisionItem[] {
  const target = staffName.trim().toLowerCase();
  if (!target || !isIsoDateString(leaveDateIso)) return [];

  const collisions: DeadlineCollisionItem[] = [];

  // 1. Live Jobs assigned to this PIC (Final Applicable Deadline or MITRS Due Date)
  for (const j of jobs) {
    if (!isJobActiveForWorkload(j)) continue;
    if ((j.taxPic || '').trim().toLowerCase() !== target) continue;

    const jobFormLabel = (j.jobType || j.formType || j.module || 'Tax Job').trim();
    const checks: Array<{
      date?: string;
      type: 'Final Deadline' | 'MITRS Due';
      formName: string;
    }> = [
      {
        date: j.finalApplicableDeadline || j.dueDate,
        type: 'Final Deadline',
        formName: `${jobFormLabel} (Final Deadline)`,
      },
      {
        date: j.mitrsDueDate,
        type: 'MITRS Due',
        formName: 'MITRS Due',
      },
    ];

    for (const c of checks) {
      if (!isIsoDateString(c.date)) continue;
      const diff = diffDaysIso(leaveDateIso, c.date!);
      if (diff >= 0 && diff <= 2) {
        collisions.push({
          source: 'job',
          clientName: j.clientName,
          clientId: j.clientId,
          refCode: j.jobCode,
          formName: c.formName,
          deadlineType: c.type,
          dueDate: c.date!,
          daysAfterLeave: diff,
          severity: diff === 0 ? 'critical' : 'warning',
          picName: j.taxPic || staffName,
        });
      }
    }
  }

  // 2. Active CP204 due dates (initial statutory due date & open revision deadlines) assigned to this PIC
  for (const cp of cp204Records) {
    if (CLOSED_CP204_STATUSES.has((cp.status || '').trim().toLowerCase())) continue;
    const cpPicMatch = (cp.pic || '').trim().toLowerCase() === target;

    if (cpPicMatch && isIsoDateString(cp.statutoryCp204DueDate)) {
      const diff = diffDaysIso(leaveDateIso, cp.statutoryCp204DueDate);
      if (diff >= 0 && diff <= 2) {
        collisions.push({
          source: 'cp204',
          clientName: cp.clientName,
          clientId: cp.clientId,
          refCode: cp.cp204Id,
          formName: `CP204${cp.ya ? ` (YA ${cp.ya})` : ''}`,
          deadlineType: 'CP204 Due',
          dueDate: cp.statutoryCp204DueDate,
          daysAfterLeave: diff,
          severity: diff === 0 ? 'critical' : 'warning',
          picName: cp.pic || staffName,
        });
      }
    }

    for (const rev of cp.revisions || []) {
      const revStatusLower = (rev.reviewStatus || '').trim().toLowerCase();
      if (revStatusLower === 'submitted' || revStatusLower === 'completed') continue;
      const revPic = (rev.pic || cp.pic || '').trim().toLowerCase();
      if (revPic !== target) continue;
      if (!isIsoDateString(rev.submissionDeadline)) continue;
      const diff = diffDaysIso(leaveDateIso, rev.submissionDeadline);
      if (diff >= 0 && diff <= 2) {
        collisions.push({
          source: 'cp204',
          clientName: cp.clientName,
          clientId: cp.clientId,
          refCode: rev.revisionId || cp.cp204Id,
          formName: `CP204A ${rev.revisionMonth}th Mth Rev${cp.ya ? ` (YA ${cp.ya})` : ''}`,
          deadlineType: 'CP204 Revision Due',
          dueDate: rev.submissionDeadline,
          daysAfterLeave: diff,
          severity: diff === 0 ? 'critical' : 'warning',
          picName: rev.pic || cp.pic || staffName,
        });
      }
    }
  }

  // Identify weekend dates immediately following leaveDateIso whose shifted last working weekday lands on leaveDateIso
  const shiftedWeekendMatches: ShiftedDueDateInfo[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const candidateIso = addDaysIso(leaveDateIso, offset);
    const dow = parseIsoDateLocal(candidateIso).getDay();
    if (dow !== 0 && dow !== 6) continue;
    const shiftInfo = shiftToLastWorkingWeekday(candidateIso, holidaysByDate, companyHolidayDates);
    if (shiftInfo.shifted && shiftInfo.effectiveDate === leaveDateIso) {
      shiftedWeekendMatches.push(shiftInfo);
    }
  }

  const seenCalendarKeys = new Set<string>();

  // 3. Tax Due Date events (direct or shifted from a weekend) & recurring due calendar events falling on this leave date
  for (const ev of parsedEvents) {
    if (ev.canonicalType === 'Staff Availability' || ev.canonicalType === 'Company Holiday') continue;
    const isTaxDue = ev.canonicalType === 'Tax Due Date';
    if (!isTaxDue && !ev.raw.recurrenceGroupId) continue;

    const assignedLower = ev.staffName.trim().toLowerCase();
    if (!isTaxDue && !ev.isFirmWide && assignedLower && assignedLower !== target) continue;

    const recurrenceText = ev.raw.recurrenceGroupId
      ? formatRecurrenceRuleLabel(
          ev.raw.recurrenceRule,
          ev.raw.startDate,
          ev.raw.recurrenceLabel
        )
      : 'Tax Due Date';

    if (eventCoversDate(ev.raw, leaveDateIso)) {
      const dedupeKey = `${ev.raw.id}|${leaveDateIso}`;
      if (!seenCalendarKeys.has(dedupeKey)) {
        seenCalendarKeys.add(dedupeKey);
        collisions.push({
          source: 'calendar',
          clientName:
            ev.raw.clientName ||
            (isTaxDue
              ? 'All Staff / Statutory Tax Due Date'
              : ev.isFirmWide
              ? 'Firm-Wide Recurring Event'
              : 'Recurring Event'),
          clientId: ev.raw.clientId || (isTaxDue ? 'TAX DUE' : 'RECURRING'),
          refCode: recurrenceText,
          formName: ev.cleanLabel,
          deadlineType: isTaxDue ? 'Tax Due Date' : 'Recurring Due Date',
          dueDate: leaveDateIso,
          daysAfterLeave: 0,
          severity: 'critical',
          picName: ev.staffName || undefined,
        });
      }
    }

    if (isTaxDue) {
      for (const shifted of shiftedWeekendMatches) {
        if (!eventCoversDate(ev.raw, shifted.actualDate)) continue;
        const dedupeKey = `${ev.raw.id}|${shifted.actualDate}`;
        if (seenCalendarKeys.has(dedupeKey)) continue;
        seenCalendarKeys.add(dedupeKey);
        collisions.push({
          source: 'calendar',
          clientName: ev.raw.clientName || 'All Staff / Statutory Tax Due Date',
          clientId: ev.raw.clientId || 'TAX DUE',
          refCode: recurrenceText,
          formName: ev.cleanLabel,
          deadlineType: 'Tax Due Date',
          dueDate: shifted.actualDate,
          daysAfterLeave: 0,
          severity: 'critical',
          picName: ev.staffName || undefined,
          shiftNote: shifted.shiftNote,
        });
      }
    }
  }

  // 4. Key recurring Malaysian LHDN statutory deadlines falling directly on this leave date or shifted from a weekend
  const seenStatutoryKeys = new Set<string>();
  const statutory = getMalaysianStatutoryDeadlinesForDate(leaveDateIso);
  for (const st of statutory) {
    const key = `${st.code}|${leaveDateIso}`;
    if (seenStatutoryKeys.has(key)) continue;
    seenStatutoryKeys.add(key);
    collisions.push({
      source: 'statutory',
      clientName: 'LHDN Statutory Deadline',
      clientId: 'LHDN',
      refCode: st.code,
      formName: st.name,
      deadlineType: 'LHDN Statutory',
      dueDate: leaveDateIso,
      daysAfterLeave: 0,
      severity: 'critical',
    });
  }

  for (const shifted of shiftedWeekendMatches) {
    const shiftedStat = getMalaysianStatutoryDeadlinesForDate(shifted.actualDate);
    for (const st of shiftedStat) {
      const key = `${st.code}|${shifted.actualDate}`;
      if (seenStatutoryKeys.has(key)) continue;
      seenStatutoryKeys.add(key);
      collisions.push({
        source: 'statutory',
        clientName: 'LHDN Statutory Deadline',
        clientId: 'LHDN',
        refCode: st.code,
        formName: st.name,
        deadlineType: 'LHDN Statutory',
        dueDate: shifted.actualDate,
        daysAfterLeave: 0,
        severity: 'critical',
        shiftNote: shifted.shiftNote,
      });
    }
  }

  return collisions.sort((a, b) => {
    if (a.daysAfterLeave !== b.daysAfterLeave) return a.daysAfterLeave - b.daysAfterLeave;
    const rank = { job: 0, cp204: 1, calendar: 2, statutory: 3 };
    return rank[a.source] - rank[b.source];
  });
}

/**
 * Computes all Tax Deadlines (Live Jobs, CP204, Recurring Due Date Events, and Malaysian LHDN Statutory deadlines)
 * colliding with a Public Holiday or Company Holiday date.
 */
export function computeHolidayDeadlineCollisions(
  holidayDateIso: string,
  jobs: TaxJob[],
  cp204Records: Cp204Record[],
  parsedEvents: ParsedCalendarEvent[] = []
): DeadlineCollisionItem[] {
  if (!isIsoDateString(holidayDateIso)) return [];

  const collisions: DeadlineCollisionItem[] = [];

  for (const j of jobs) {
    if (!isJobActiveForWorkload(j)) continue;
    const jobFormLabel = (j.jobType || j.formType || j.module || 'Tax Job').trim();
    const checks: Array<{
      date?: string;
      type: 'Final Deadline' | 'MITRS Due';
      formName: string;
    }> = [
      {
        date: j.finalApplicableDeadline || j.dueDate,
        type: 'Final Deadline',
        formName: `${jobFormLabel} (Final Deadline)`,
      },
      {
        date: j.mitrsDueDate,
        type: 'MITRS Due',
        formName: 'MITRS Due',
      },
    ];

    for (const c of checks) {
      if (!isIsoDateString(c.date)) continue;
      if (c.date!.slice(0, 10) === holidayDateIso) {
        collisions.push({
          source: 'job',
          clientName: j.clientName,
          clientId: j.clientId,
          refCode: j.jobCode,
          formName: c.formName,
          deadlineType: c.type,
          dueDate: c.date!,
          daysAfterLeave: 0,
          severity: 'critical',
          picName: j.taxPic || '',
        });
      }
    }
  }

  for (const cp of cp204Records) {
    if (CLOSED_CP204_STATUSES.has((cp.status || '').trim().toLowerCase())) continue;
    if (
      isIsoDateString(cp.statutoryCp204DueDate) &&
      cp.statutoryCp204DueDate.slice(0, 10) === holidayDateIso
    ) {
      collisions.push({
        source: 'cp204',
        clientName: cp.clientName,
        clientId: cp.clientId,
        refCode: cp.cp204Id,
        formName: `CP204${cp.ya ? ` (YA ${cp.ya})` : ''}`,
        deadlineType: 'CP204 Due',
        dueDate: cp.statutoryCp204DueDate,
        daysAfterLeave: 0,
        severity: 'critical',
        picName: cp.pic || '',
      });
    }

    for (const rev of cp.revisions || []) {
      const revStatusLower = (rev.reviewStatus || '').trim().toLowerCase();
      if (revStatusLower === 'submitted' || revStatusLower === 'completed') continue;
      if (
        isIsoDateString(rev.submissionDeadline) &&
        rev.submissionDeadline.slice(0, 10) === holidayDateIso
      ) {
        collisions.push({
          source: 'cp204',
          clientName: cp.clientName,
          clientId: cp.clientId,
          refCode: rev.revisionId || cp.cp204Id,
          formName: `CP204A ${rev.revisionMonth}th Mth Rev${cp.ya ? ` (YA ${cp.ya})` : ''}`,
          deadlineType: 'CP204 Revision Due',
          dueDate: rev.submissionDeadline,
          daysAfterLeave: 0,
          severity: 'critical',
          picName: rev.pic || cp.pic || '',
        });
      }
    }
  }

  for (const ev of parsedEvents) {
    if (ev.canonicalType === 'Staff Availability' || ev.canonicalType === 'Company Holiday') continue;
    const isTaxDue = ev.canonicalType === 'Tax Due Date';
    if (!isTaxDue && !ev.raw.recurrenceGroupId) continue;
    if (!eventCoversDate(ev.raw, holidayDateIso)) continue;
    const recurrenceText = ev.raw.recurrenceGroupId
      ? formatRecurrenceRuleLabel(
          ev.raw.recurrenceRule,
          ev.raw.startDate,
          ev.raw.recurrenceLabel
        )
      : 'Tax Due Date';
    collisions.push({
      source: 'calendar',
      clientName:
        ev.raw.clientName ||
        (isTaxDue
          ? 'All Staff / Statutory Tax Due Date'
          : ev.isFirmWide
          ? 'Firm-Wide Recurring Event'
          : 'Recurring Event'),
      clientId: ev.raw.clientId || (isTaxDue ? 'TAX DUE' : 'RECURRING'),
      refCode: recurrenceText,
      formName: ev.cleanLabel,
      deadlineType: isTaxDue ? 'Tax Due Date' : 'Recurring Due Date',
      dueDate: holidayDateIso,
      daysAfterLeave: 0,
      severity: 'critical',
      picName: ev.staffName || undefined,
    });
  }

  const statutory = getMalaysianStatutoryDeadlinesForDate(holidayDateIso);
  for (const st of statutory) {
    collisions.push({
      source: 'statutory',
      clientName: 'LHDN Statutory Deadline',
      clientId: 'LHDN',
      refCode: st.code,
      formName: st.name,
      deadlineType: 'LHDN Statutory',
      dueDate: holidayDateIso,
      daysAfterLeave: 0,
      severity: 'critical',
    });
  }

  return collisions.sort((a, b) => {
    const rank = { statutory: 0, calendar: 1, job: 2, cp204: 3 };
    return rank[a.source] - rank[b.source];
  });
}

export function isPeakFilingDate(iso: string): boolean {
  if (getMalaysianStatutoryDeadlinesForDate(iso).length > 0) return true;
  const dt = parseIsoDateLocal(iso);
  const day = dt.getDate();
  const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  // 15th (CP204 instalments) or last 3 days of month (Form C / MITRS / Form E month-end)
  return day === 15 || day >= lastDay - 2;
}

export interface StaffMatrixRowSummary {
  staff: StaffMember;
  workDays: number;
  leaveDays: number;
  openJobs: number;
  employedWorkingDays?: number;
  isPartialMonth?: boolean;
}

/**
 * Determines whether a staff member should appear on the Staff Matrix for a given month.
 * - Hides staff in months strictly before their joinDate.
 * - Hides staff in months strictly after their leaveDate.
 * - Keeps resigned/inactive staff visible in historical months up to their leaveDate.
 */
export function isStaffVisibleInMonth(
  staff: StaffMember,
  year: number,
  monthIndex: number
): boolean {
  const monthStartIso = toIsoDate(new Date(year, monthIndex, 1));
  const monthEndIso = toIsoDate(new Date(year, monthIndex + 1, 0));
  const joinIso = isIsoDateString(staff.joinDate) ? staff.joinDate!.slice(0, 10) : '';
  const leaveIso = isIsoDateString(staff.leaveDate) ? staff.leaveDate!.slice(0, 10) : '';

  if (!staff.active && !leaveIso) return false;
  if (joinIso && joinIso > monthEndIso) return false;
  if (leaveIso && leaveIso < monthStartIso) return false;
  return true;
}

/**
 * Checks whether a specific date (YYYY-MM-DD) falls within the staff member's employment span.
 */
export function isDateWithinStaffEmployment(staff: StaffMember, isoDate: string): boolean {
  const joinIso = isIsoDateString(staff.joinDate) ? staff.joinDate!.slice(0, 10) : '';
  const leaveIso = isIsoDateString(staff.leaveDate) ? staff.leaveDate!.slice(0, 10) : '';
  if (joinIso && isoDate < joinIso) return false;
  if (leaveIso && isoDate > leaveIso) return false;
  return true;
}

/**
 * Computes per-staff monthly Work, Leave, and Open Jobs totals with automatic
 * joinDate / leaveDate pro-rating and 0 leave deduction for WFH and Time-Off / Replace (TO).
 */
export function computeStaffRowSummaries(params: {
  staffList: StaffMember[];
  monthWeekdays: Date[];
  holidaysByDate: Map<string, PublicHolidayRef>;
  parsedEvents: ParsedCalendarEvent[];
  openJobsByStaff: Map<string, number>;
}): { baseWorkingDays: number; rowSummaries: StaffMatrixRowSummary[] } {
  const { staffList, monthWeekdays, holidaysByDate, parsedEvents, openJobsByStaff } = params;

  const weekdayHolidaySet = new Set<string>();
  for (const wd of monthWeekdays) {
    const iso = toIsoDate(wd);
    if (
      holidaysByDate.has(iso) ||
      parsedEvents.some(
        (e) => e.canonicalType === 'Company Holiday' && eventCoversDate(e.raw, iso)
      )
    ) {
      weekdayHolidaySet.add(iso);
    }
  }
  const baseWorkingDays = Math.max(0, monthWeekdays.length - weekdayHolidaySet.size);

  const rowSummaries: StaffMatrixRowSummary[] = staffList.map((s) => {
    const staffKey = s.staffName.trim().toLowerCase();
    let employedWorkingDays = 0;
    let leaveDays = 0;

    for (const wd of monthWeekdays) {
      const iso = toIsoDate(wd);
      if (!isDateWithinStaffEmployment(s, iso)) continue;
      if (weekdayHolidaySet.has(iso)) continue;
      employedWorkingDays += 1;

      let dayWeight = 0;
      for (const ev of parsedEvents) {
        if (ev.canonicalType !== 'Staff Availability') continue;
        if (ev.staffName.trim().toLowerCase() !== staffKey) continue;
        if (!eventCoversDate(ev.raw, iso)) continue;
        if (ev.leaveWeight > dayWeight) dayWeight = ev.leaveWeight;
      }
      leaveDays += dayWeight;
    }

    const workDays = Math.max(0, Math.round((employedWorkingDays - leaveDays) * 10) / 10);
    return {
      staff: s,
      workDays,
      leaveDays: Math.round(leaveDays * 10) / 10,
      openJobs: openJobsByStaff.get(staffKey) ?? 0,
      employedWorkingDays,
      isPartialMonth: employedWorkingDays < baseWorkingDays,
    };
  });

  return { baseWorkingDays, rowSummaries };
}

export function buildStaffMatrixExportData(params: {
  year: number;
  monthIndex: number;
  days: Date[];
  activeStaff: StaffMember[];
  rowSummaries: StaffMatrixRowSummary[];
  holidaysByDate: Map<string, PublicHolidayRef>;
  parsedEvents: ParsedCalendarEvent[];
  clientsById: Map<string, ClientRecord>;
}): { columns: ExportColumn[]; rows: Record<string, string | number>[]; subtitle: string } {
  const { year, monthIndex, days, rowSummaries, holidaysByDate, parsedEvents } = params;
  const monthName = new Date(year, monthIndex, 1).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  });

  const weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const columns: ExportColumn[] = [
    { key: 'staff', label: 'Staff' },
    { key: 'workDays', label: 'Work', align: 'right' },
    { key: 'leaveDays', label: 'Leave', align: 'right' },
    { key: 'openJobs', label: 'Jobs', align: 'right' },
    ...days.map((d) => ({
      key: `d_${toIsoDate(d)}`,
      label: `${weekdayShort[d.getDay()]}\n${d.getDate()}/${monthIndex + 1}`,
      align: 'center' as const,
    })),
  ];

  const rows: Record<string, string | number>[] = rowSummaries.map((summary) => {
    const row: Record<string, string | number> = {
      staff: `${summary.staff.staffName} (${summary.staff.staffId})`,
      workDays: summary.workDays,
      leaveDays: summary.leaveDays,
      openJobs: summary.openJobs,
    };
    const staffLower = summary.staff.staffName.trim().toLowerCase();

    for (const d of days) {
      const iso = toIsoDate(d);
      if (!isDateWithinStaffEmployment(summary.staff, iso)) {
        row[`d_${iso}`] = '—';
        continue;
      }
      const ph = holidaysByDate.get(iso);
      const companyHol = parsedEvents.find(
        (e) => e.canonicalType === 'Company Holiday' && eventCoversDate(e.raw, iso)
      );
      if (ph || companyHol) {
        row[`d_${iso}`] = companyHol ? companyHol.cleanLabel : ph!.name;
        continue;
      }

      const cellTokens: string[] = [];
      for (const ev of parsedEvents) {
        if (!eventCoversDate(ev.raw, iso)) continue;
        if (ev.canonicalType === 'Tax Due Date') continue;
        if (ev.isFirmWide && ev.canonicalType === 'Internal Event') {
          cellTokens.push(ev.cleanLabel.slice(0, 12));
        } else if (ev.staffName.trim().toLowerCase() === staffLower) {
          if (ev.canonicalType === 'Time-Off / Replace') {
            cellTokens.push('TO');
          } else if (ev.canonicalType === 'Staff Availability') {
            cellTokens.push(ev.leaveCode || ev.cleanLabel.slice(0, 10));
          } else if (ev.canonicalType === 'Client Appointment') {
            cellTokens.push(formatClientChipLabel(ev));
          } else {
            cellTokens.push(ev.cleanLabel.slice(0, 12));
          }
        }
      }
      row[`d_${iso}`] = cellTokens.join(' / ');
    }
    return row;
  });

  // Add Public Holiday / Firm Event legend note in subtitle
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const phCount = Array.from(holidaysByDate.keys()).filter((k) => k.startsWith(monthPrefix)).length;
  const subtitle = `Staff Matrix — ${monthName} • ${rowSummaries.length} active staff • ${phCount} Johor/Federal holiday day(s) • Generated ${formatDateDDMMYYYY(
    toIsoDate(new Date())
  )}`;

  return { columns, rows, subtitle };
}
