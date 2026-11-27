import {
  CalendarEvent,
  ClientRecord,
  Cp204Record,
  StaffMember,
  TaxJob,
} from '../../types/tpms';
import { formatDateDDMMYYYY, isIsoDateString } from '../../lib/deadlineUtils';
import { ExportColumn } from '../../lib/exportUtils';

export type CalendarViewMode = 'matrix' | 'month' | 'week' | 'day' | 'agenda';

export type CanonicalEventType =
  | 'Staff Availability'
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
  | 'clear';

export const CANONICAL_EVENT_TYPES: CanonicalEventType[] = [
  'Staff Availability',
  'Company Holiday',
  'Internal Event',
  'Client Appointment',
];

export const EVENT_TYPE_DEFAULT_COLORS: Record<CanonicalEventType, string> = {
  'Staff Availability': '#22d3ee', // Cyan
  'Company Holiday': '#facc15', // Yellow
  'Internal Event': '#f0abfc', // Magenta
  'Client Appointment': '#bae6fd', // Light Blue
};

export const EVENT_COLOR_SWATCHES: Array<{ hex: string; label: string }> = [
  { hex: '#22d3ee', label: 'Cyan (AL / SL / MC)' },
  { hex: '#fb923c', label: 'Orange (RL — Replacement Leave)' },
  { hex: '#f472b6', label: 'Pink (UPL — Unpaid Leave)' },
  { hex: '#86efac', label: 'Green (WFH / Fieldwork)' },
  { hex: '#facc15', label: 'Yellow (Holiday)' },
  { hex: '#f0abfc', label: 'Magenta (Firm Seminar / Event)' },
  { hex: '#bae6fd', label: 'Light Blue (Client Appointment)' },
  { hex: '#fca5a5', label: 'Coral (Urgent / Deadline)' },
  { hex: '#cbd5e1', label: 'Slate (General)' },
];

export function getDefaultLeaveColor(codeOrLabel: string): string {
  const clean = (codeOrLabel || '').trim();
  if (!clean) return EVENT_TYPE_DEFAULT_COLORS['Staff Availability'];
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

export interface DeadlineCollisionItem {
  clientName: string;
  clientId: string;
  refCode: string;
  deadlineType: 'Final Deadline' | 'MITRS Due' | 'CP204 Due';
  dueDate: string;
  daysAfterLeave: number;
  severity: 'critical' | 'warning';
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
    canonicalType === 'Staff Availability'
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

export function computeStaffDeadlineCollisions(
  staffName: string,
  leaveDateIso: string,
  jobs: TaxJob[],
  cp204Records: Cp204Record[]
): DeadlineCollisionItem[] {
  const target = staffName.trim().toLowerCase();
  if (!target || !isIsoDateString(leaveDateIso)) return [];

  const collisions: DeadlineCollisionItem[] = [];

  for (const j of jobs) {
    if (!isJobActiveForWorkload(j)) continue;
    if ((j.taxPic || '').trim().toLowerCase() !== target) continue;

    const checks: Array<{ date?: string; type: 'Final Deadline' | 'MITRS Due' }> = [
      { date: j.finalApplicableDeadline || j.dueDate, type: 'Final Deadline' },
      { date: j.mitrsDueDate, type: 'MITRS Due' },
    ];

    for (const c of checks) {
      if (!isIsoDateString(c.date)) continue;
      const diff = diffDaysIso(leaveDateIso, c.date!);
      if (diff >= 0 && diff <= 2) {
        collisions.push({
          clientName: j.clientName,
          clientId: j.clientId,
          refCode: j.jobCode,
          deadlineType: c.type,
          dueDate: c.date!,
          daysAfterLeave: diff,
          severity: diff === 0 ? 'critical' : 'warning',
        });
      }
    }
  }

  for (const cp of cp204Records) {
    if (CLOSED_CP204_STATUSES.has((cp.status || '').trim().toLowerCase())) continue;
    if ((cp.pic || '').trim().toLowerCase() !== target) continue;
    if (!isIsoDateString(cp.statutoryCp204DueDate)) continue;
    const diff = diffDaysIso(leaveDateIso, cp.statutoryCp204DueDate);
    if (diff >= 0 && diff <= 2) {
      collisions.push({
        clientName: cp.clientName,
        clientId: cp.clientId,
        refCode: cp.cp204Id,
        deadlineType: 'CP204 Due',
        dueDate: cp.statutoryCp204DueDate,
        daysAfterLeave: diff,
        severity: diff === 0 ? 'critical' : 'warning',
      });
    }
  }

  return collisions.sort((a, b) => a.daysAfterLeave - b.daysAfterLeave);
}

export function isPeakFilingDate(iso: string): boolean {
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
        if (ev.isFirmWide && ev.canonicalType === 'Internal Event') {
          cellTokens.push(ev.cleanLabel.slice(0, 12));
        } else if (ev.staffName.trim().toLowerCase() === staffLower) {
          if (ev.canonicalType === 'Staff Availability') {
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
