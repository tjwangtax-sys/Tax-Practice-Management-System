import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { formatDateDDMMYYYY } from '../../lib/deadlineUtils';
import {
  appendPdfTableSection,
  buildPrintTableSectionCss,
  buildPrintTableSectionHtml,
  ExportColumn,
  printHtml,
  PrintTableSectionSpec,
  triggerBlobDownload,
} from '../../lib/exportUtils';
import { showToast } from '../../lib/toast';
import { StaffMember } from '../../types/tpms';
import {
  EVENT_TYPE_DEFAULT_COLORS,
  eventCoversDate,
  formatClientChipLabel,
  getContrastingTextColor,
  isDateWithinStaffEmployment,
  ParsedCalendarEvent,
  PublicHolidayRef,
  StaffMatrixRowSummary,
  toIsoDate,
} from './calendarUtils';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface MatrixExportDay {
  date: Date;
  iso: string;
  weekdayShort: string;
  dateShort: string;
  isWeekend: boolean;
  isEndOfWeek: boolean;
  holidayName: string | null;
  holidayColor: string | null;
  holidayScope: string | null;
}

export interface MatrixExportCell {
  kind: 'holiday' | 'leave' | 'firm' | 'client' | 'other' | 'weekend' | 'empty';
  text: string;
  bgColor: string | null;
  textColor: string;
  secondaryFirmLabel?: string;
  secondaryFirmColor?: string;
}

export interface MatrixExportRow {
  staffName: string;
  staffId: string;
  workDays: number;
  leaveDays: number;
  openJobs: number;
  cells: Record<string, MatrixExportCell>;
}

export interface MatrixExportNote {
  kind: 'due' | 'firm' | 'holiday';
  title: string;
  dateLabel: string;
  categoryLabel: string;
  color: string;
  notes: string;
}

export interface CalendarRegisterRow {
  sortDate: string;
  sortPriority: number;
  dateTime: string;
  event: string;
  type: string;
  typeColor: string;
  staff: string;
  clientLocation: string;
  description: string;
}

export const COMPLETE_EVENT_REGISTER_COLUMNS: ExportColumn[] = [
  { key: 'dateTime', label: 'Date / Time' },
  { key: 'event', label: 'Event' },
  { key: 'type', label: 'Type' },
  { key: 'staff', label: 'Staff' },
  { key: 'clientLocation', label: 'Linked Client / Location' },
  { key: 'description', label: 'Description / Notes' },
];

const REGISTER_COL_WIDTHS_PCT = ['15%', '22%', '14%', '14%', '15%', '20%'];
const REGISTER_COL_WEIGHTS = [15, 22, 14, 14, 15, 20];

function extractTimeHint(text: string): string {
  const s = (text || '').trim();
  if (!s) return '';
  // Match ranges like 8-8:30am, 8:00-8:30am, 5:00–5:30pm, 9am-11am or single times like 1:20pm
  const rangeMatch = s.match(
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[–-]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i
  );
  if (rangeMatch) return rangeMatch[0].replace(/\s+/g, ' ').trim();
  const singleMatch = s.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i);
  if (singleMatch) return singleMatch[0].replace(/\s+/g, ' ').trim();
  return '';
}

function mapEventTypeDisplay(ev: ParsedCalendarEvent): { label: string; priority: number } {
  switch (ev.canonicalType) {
    case 'Tax Due Date':
      return { label: 'Tax Due Date', priority: 1 };
    case 'Company Holiday':
      return { label: 'Johor / MY Holiday', priority: 0 };
    case 'Internal Event':
      return { label: 'Firm Seminar / Event', priority: 2 };
    case 'Client Appointment':
      return { label: 'Client Appt', priority: 3 };
    case 'Time-Off / Replace':
    case 'Staff Availability':
    default:
      return { label: 'Staff Availability', priority: 4 };
  }
}

export function buildCalendarEventRegisterRows(params: {
  periodStart?: string;
  periodEnd?: string;
  parsedEvents: ParsedCalendarEvent[];
  holidaysByDate: Map<string, PublicHolidayRef>;
  staffList: StaffMember[];
  typeFilter?: string;
  searchQuery?: string;
}): CalendarRegisterRow[] {
  const {
    periodStart,
    periodEnd,
    parsedEvents,
    holidaysByDate,
    staffList,
    typeFilter = '',
    searchQuery = '',
  } = params;

  const staffIdByName = new Map<string, string>();
  for (const s of staffList) {
    const nm = (s.staffName || '').trim().toLowerCase();
    const id = (s.staffId || '').trim();
    if (nm && id) staffIdByName.set(nm, id);
  }

  const formatStaffDisplay = (ev: ParsedCalendarEvent): string => {
    if (
      ev.canonicalType === 'Tax Due Date' ||
      ev.canonicalType === 'Company Holiday'
    ) {
      return 'All Staff / Statutory';
    }
    if (ev.isFirmWide || !ev.staffName.trim()) {
      return ev.canonicalType === 'Internal Event' ? 'All Staff / Statutory' : '-';
    }
    const nm = ev.staffName.trim();
    const id = staffIdByName.get(nm.toLowerCase());
    return id && id.toUpperCase() !== nm.toUpperCase() ? `${id} · ${nm}` : nm;
  };

  const rows: CalendarRegisterRow[] = [];

  for (const ev of parsedEvents) {
    const start = ev.raw.startDate || '';
    const end = ev.raw.endDate || start;
    if (periodStart && end < periodStart) continue;
    if (periodEnd && start > periodEnd) continue;

    const datePart =
      end && end !== start
        ? `${formatDateDDMMYYYY(start)} – ${formatDateDDMMYYYY(end)}`
        : formatDateDDMMYYYY(start);
    const timeHint =
      extractTimeHint(ev.raw.timeOffNote || '') || extractTimeHint(ev.cleanLabel || '');
    const dateTime = timeHint ? `${datePart} · ${timeHint}` : `${datePart} · All day`;

    const { label: typeLabel, priority } = mapEventTypeDisplay(ev);

    const clientParts = [ev.raw.clientId?.trim(), ev.raw.clientName?.trim()].filter(Boolean);
    const clientLocation = clientParts.length > 0 ? clientParts.join(' · ') : '-';

    const descParts: string[] = [];
    const toNote = (ev.raw.timeOffNote || '').trim();
    const rawNotes = (ev.raw.notes || '').trim();
    if (toNote) descParts.push(toNote);
    if (rawNotes && rawNotes.toLowerCase() !== toNote.toLowerCase()) descParts.push(rawNotes);
    const description = descParts.length > 0 ? descParts.join(' · ') : '-';

    const eventTitle =
      ev.canonicalType === 'Time-Off / Replace' && ev.cleanLabel.trim().toUpperCase() === 'TO'
        ? 'TO (Time-Off / Replace)'
        : ev.cleanLabel || ev.displayTitle;

    rows.push({
      sortDate: start,
      sortPriority: priority,
      dateTime,
      event: eventTitle,
      type: typeLabel,
      typeColor: ev.color || EVENT_TYPE_DEFAULT_COLORS[ev.canonicalType] || '#94a3b8',
      staff: formatStaffDisplay(ev),
      clientLocation,
      description,
    });
  }

  // Include Johor / Malaysia public holidays in the selected period, respecting active type & search filters
  const q = searchQuery.trim().toLowerCase();
  const includePublicHolidays = !typeFilter || typeFilter === 'Company Holiday';
  if (includePublicHolidays) {
    for (const ph of holidaysByDate.values()) {
      if (periodStart && ph.date < periodStart) continue;
      if (periodEnd && ph.date > periodEnd) continue;
      if (q) {
        const hay = `${ph.name} ${ph.scope} johor malaysia holiday ${formatDateDDMMYYYY(ph.date)}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push({
        sortDate: ph.date,
        sortPriority: 0,
        dateTime: `${formatDateDDMMYYYY(ph.date)} · All day`,
        event: ph.name,
        type: 'Johor / MY Holiday',
        typeColor: EVENT_TYPE_DEFAULT_COLORS['Company Holiday'],
        staff: 'All Staff / Statutory',
        clientLocation: '-',
        description: `${ph.scope} Public Holiday`,
      });
    }
  }

  rows.sort((a, b) => {
    const dateCmp = a.sortDate.localeCompare(b.sortDate);
    if (dateCmp !== 0) return dateCmp;
    if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
    return a.event.localeCompare(b.event);
  });

  return rows;
}

function buildCompleteEventRegisterSpec(rows: CalendarRegisterRow[]): PrintTableSectionSpec {
  return {
    heading: 'Complete Event Register',
    subtitle: `All ${rows.length} matching events for the selected period are listed below. The calendar grid shows up to three events per date for readability.`,
    columns: COMPLETE_EVENT_REGISTER_COLUMNS,
    rows: rows as unknown as Record<string, unknown>[],
    emptyMessage: 'No matching events for the selected period and active filters.',
    pageBreakBefore: true,
    badgeColumnKey: 'type',
    badgeColorKey: 'typeColor',
  };
}

export interface StaffMatrixExportModel {
  year: number;
  monthIndex: number;
  monthLabel: string;
  includeWeekends: boolean;
  title: string;
  subtitle: string;
  activeFilterSummary: string;
  filenameBase: string;
  sheetName: string;
  days: MatrixExportDay[];
  rows: MatrixExportRow[];
  monthlyNotes: MatrixExportNote[];
  eventRegister: CalendarRegisterRow[];
  hasFirmEvents: boolean;
}

export function buildStaffMatrixExportModel(params: {
  year: number;
  monthIndex: number;
  includeWeekends: boolean;
  days: Date[];
  activeStaff: StaffMember[];
  allStaff?: StaffMember[];
  rowSummaries: StaffMatrixRowSummary[];
  holidaysByDate: Map<string, PublicHolidayRef>;
  parsedEvents: ParsedCalendarEvent[];
  typeFilter?: string;
  staffFilter?: string;
  searchQuery?: string;
}): StaffMatrixExportModel {
  const {
    year,
    monthIndex,
    includeWeekends,
    days,
    activeStaff,
    allStaff,
    rowSummaries,
    holidaysByDate,
    parsedEvents,
    typeFilter = '',
    staffFilter = '',
    searchQuery = '',
  } = params;

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  });

  const exportDays: MatrixExportDay[] = days.map((d, idx) => {
    const iso = toIsoDate(d);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isEndOfWeek =
      idx < days.length - 1 && (includeWeekends ? dow === 0 : dow === 5);

    const ph = holidaysByDate.get(iso);
    const compHol = parsedEvents.find(
      (e) => e.canonicalType === 'Company Holiday' && eventCoversDate(e.raw, iso)
    );

    const holidayName = compHol ? compHol.cleanLabel : ph ? ph.name : null;
    const holidayColor = compHol
      ? compHol.color || EVENT_TYPE_DEFAULT_COLORS['Company Holiday']
      : ph
      ? EVENT_TYPE_DEFAULT_COLORS['Company Holiday']
      : null;
    const holidayScope = compHol ? 'Company Holiday' : ph ? `${ph.scope} Holiday` : null;

    return {
      date: d,
      iso,
      weekdayShort: WEEKDAY_SHORT[dow],
      dateShort: `${d.getDate()}/${monthIndex + 1}`,
      isWeekend,
      isEndOfWeek,
      holidayName,
      holidayColor,
      holidayScope,
    };
  });

  const rows: MatrixExportRow[] = rowSummaries.map((summary) => {
    const staffLower = summary.staff.staffName.trim().toLowerCase();
    const cells: Record<string, MatrixExportCell> = {};

    for (const day of exportDays) {
      if (!isDateWithinStaffEmployment(summary.staff, day.iso)) {
        cells[day.iso] = {
          kind: 'empty',
          text: '—',
          bgColor: '#f1f5f9',
          textColor: '#94a3b8',
        };
        continue;
      }

      if (day.holidayName && day.holidayColor) {
        cells[day.iso] = {
          kind: 'holiday',
          text: day.holidayName,
          bgColor: day.holidayColor,
          textColor: getContrastingTextColor(day.holidayColor),
        };
        continue;
      }

      const firmEvents = parsedEvents.filter(
        (e) =>
          e.isFirmWide &&
          e.canonicalType === 'Internal Event' &&
          eventCoversDate(e.raw, day.iso)
      );

      const staffEvents = parsedEvents.filter(
        (e) =>
          !e.isFirmWide &&
          e.canonicalType !== 'Company Holiday' &&
          e.canonicalType !== 'Tax Due Date' &&
          e.staffName.trim().toLowerCase() === staffLower &&
          eventCoversDate(e.raw, day.iso)
      );

      const primaryLeave = staffEvents.find(
        (e) =>
          e.canonicalType === 'Staff Availability' ||
          e.canonicalType === 'Time-Off / Replace'
      );
      const clientAppts = staffEvents.filter(
        (e) =>
          e.canonicalType === 'Client Appointment' ||
          Boolean(e.raw.clientId || e.raw.clientName)
      );
      const otherPersonal = staffEvents.filter(
        (e) => e !== primaryLeave && !clientAppts.includes(e)
      );

      if (primaryLeave) {
        const isTo =
          primaryLeave.canonicalType === 'Time-Off / Replace' ||
          primaryLeave.leaveCode === 'TO';
        const leaveColor = isTo
          ? '#e0e7ff'
          : primaryLeave.leaveCode === 'WFH' && primaryLeave.raw.color === '#22d3ee'
          ? '#86efac'
          : primaryLeave.color || EVENT_TYPE_DEFAULT_COLORS['Staff Availability'];
        const tokens = [
          isTo ? 'TO' : primaryLeave.leaveCode || primaryLeave.cleanLabel.slice(0, 10),
          ...clientAppts.map((a) => formatClientChipLabel(a)),
        ];
        cells[day.iso] = {
          kind: 'leave',
          text: tokens.join('\n'),
          bgColor: leaveColor,
          textColor: isTo ? '#3730a3' : getContrastingTextColor(leaveColor),
          secondaryFirmLabel: firmEvents[0]?.cleanLabel,
          secondaryFirmColor: firmEvents[0]?.color || EVENT_TYPE_DEFAULT_COLORS['Internal Event'],
        };
        continue;
      }

      if (firmEvents.length > 0) {
        const firmColor = firmEvents[0].color || EVENT_TYPE_DEFAULT_COLORS['Internal Event'];
        const parts = [
          firmEvents[0].cleanLabel.slice(0, 16),
          ...clientAppts.map((a) => formatClientChipLabel(a)),
          ...otherPersonal.map((o) => o.cleanLabel.slice(0, 14)),
        ];
        cells[day.iso] = {
          kind: 'firm',
          text: parts.join('\n'),
          bgColor: firmColor,
          textColor: getContrastingTextColor(firmColor),
        };
        continue;
      }

      if (clientAppts.length > 0) {
        const apptColor = clientAppts[0].color || EVENT_TYPE_DEFAULT_COLORS['Client Appointment'];
        cells[day.iso] = {
          kind: 'client',
          text: clientAppts.map((a) => formatClientChipLabel(a)).join('\n'),
          bgColor: apptColor,
          textColor: getContrastingTextColor(apptColor),
        };
        continue;
      }

      if (otherPersonal.length > 0) {
        const otherColor = otherPersonal[0].color || '#e2e8f0';
        cells[day.iso] = {
          kind: 'other',
          text: otherPersonal.map((o) => o.cleanLabel.slice(0, 14)).join('\n'),
          bgColor: otherColor,
          textColor: getContrastingTextColor(otherColor),
        };
        continue;
      }

      cells[day.iso] = {
        kind: day.isWeekend ? 'weekend' : 'empty',
        text: '',
        bgColor: day.isWeekend ? '#f1f5f9' : null,
        textColor: '#0f172a',
      };
    }

    return {
      staffName: summary.staff.staffName,
      staffId: summary.staff.staffId,
      workDays: summary.workDays,
      leaveDays: summary.leaveDays,
      openJobs: summary.openJobs,
      cells,
    };
  });

  // Monthly Event Notes (Tax Due Dates + firm-wide seminars/internal events + company holidays + PH)
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

  const monthPhs = Array.from(holidaysByDate.values())
    .filter((h) => h.date >= monthStart && h.date <= monthEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthlyNotes: MatrixExportNote[] = [
    ...taxDueEvents.map((ev) => ({
      kind: 'due' as const,
      title: ev.cleanLabel,
      dateLabel:
        ev.raw.endDate && ev.raw.endDate !== ev.raw.startDate
          ? `${formatDateDDMMYYYY(ev.raw.startDate)} – ${formatDateDDMMYYYY(ev.raw.endDate)}`
          : formatDateDDMMYYYY(ev.raw.startDate),
      categoryLabel: 'Tax Due Date',
      color: ev.color || '#ef4444',
      notes: ev.raw.notes || '',
    })),
    ...firmEvents.map((ev) => ({
      kind: (ev.canonicalType === 'Company Holiday' ? 'holiday' : 'firm') as 'firm' | 'holiday',
      title: ev.cleanLabel,
      dateLabel:
        ev.raw.endDate && ev.raw.endDate !== ev.raw.startDate
          ? `${formatDateDDMMYYYY(ev.raw.startDate)} – ${formatDateDDMMYYYY(ev.raw.endDate)}`
          : formatDateDDMMYYYY(ev.raw.startDate),
      categoryLabel: ev.canonicalType,
      color: ev.color,
      notes: ev.raw.notes || '',
    })),
    ...monthPhs.map((ph) => ({
      kind: 'holiday' as const,
      title: ph.name,
      dateLabel: formatDateDDMMYYYY(ph.date),
      categoryLabel: `${ph.scope} Holiday`,
      color: EVENT_TYPE_DEFAULT_COLORS['Company Holiday'],
      notes: '',
    })),
  ];

  const eventRegister = buildCalendarEventRegisterRows({
    periodStart: monthStart,
    periodEnd: monthEnd,
    parsedEvents,
    holidaysByDate,
    staffList: allStaff && allStaff.length > 0 ? allStaff : activeStaff,
    typeFilter,
    searchQuery,
  });

  const activeFilterSummary = [
    typeFilter ? `Type: ${typeFilter}` : '',
    staffFilter ? `Staff: ${staffFilter}` : '',
    searchQuery.trim() ? `Search: "${searchQuery.trim()}"` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const subtitle = [
    monthLabel,
    'Source: TJW Tax Department',
    `${eventRegister.length} matching events`,
    `${rows.length} staff`,
    activeFilterSummary,
  ]
    .filter(Boolean)
    .join(' • ');

  return {
    year,
    monthIndex,
    monthLabel,
    includeWeekends,
    title: `Team Staff Matrix — ${monthLabel}`,
    subtitle,
    activeFilterSummary,
    filenameBase: `TPMS_Staff_Matrix_${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    sheetName: `Matrix_${year}_${String(monthIndex + 1).padStart(2, '0')}`,
    days: exportDays,
    rows,
    monthlyNotes,
    eventRegister,
    hasFirmEvents: firmEvents.length > 0,
  };
}

// =============================================================================
// 1. PRINT HTML (Popup-free hidden iframe with exact colors, 2-row header, dividers & notes)
// =============================================================================
function escapeHtml(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printStaffMatrix(model: StaffMatrixExportModel): void {
  const generatedAt = new Date().toLocaleString('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const dowHeaders = model.days
    .map((d) => {
      const cls = [
        'day-col',
        d.isEndOfWeek ? 'week-divider' : '',
        d.isWeekend ? 'wknd-head' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<th class="${cls}">${escapeHtml(d.weekdayShort)}</th>`;
    })
    .join('');

  const dateHeaders = model.days
    .map((d) => {
      const cls = [
        'day-col date-num',
        d.isEndOfWeek ? 'week-divider' : '',
        d.isWeekend ? 'wknd-head' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<th class="${cls}">${escapeHtml(d.dateShort)}</th>`;
    })
    .join('');

  const rowCount = Math.max(1, model.rows.length);

  const bodyRows =
    model.rows.length === 0
      ? `<tr><td colspan="${4 + model.days.length}" style="text-align:center;padding:18px;color:#64748b;">No active staff records found.</td></tr>`
      : model.rows
          .map((row, rowIdx) => {
            const cellsHtml = model.days
              .map((d) => {
                const weekCls = d.isEndOfWeek ? 'week-divider' : '';
                if (d.holidayName && d.holidayColor) {
                  if (rowIdx > 0) return '';
                  const txtColor = getContrastingTextColor(d.holidayColor);
                  return `<td rowspan="${rowCount}" class="holiday-cell ${weekCls}" style="background:${escapeHtml(
                    d.holidayColor
                  )};color:${escapeHtml(txtColor)};"><div class="holiday-vertical">${escapeHtml(
                    d.holidayName
                  )}</div></td>`;
                }

                const cell = row.cells[d.iso];
                const bgStyle = cell?.bgColor
                  ? `background:${escapeHtml(cell.bgColor)};color:${escapeHtml(cell.textColor)};`
                  : '';
                const textLines = (cell?.text || '')
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => `<div>${escapeHtml(line)}</div>`)
                  .join('');
                const firmBadge = cell?.secondaryFirmLabel
                  ? `<div class="firm-mini" style="background:${escapeHtml(
                      cell.secondaryFirmColor || '#f0abfc'
                    )};color:${escapeHtml(
                      getContrastingTextColor(cell.secondaryFirmColor || '#f0abfc')
                    )};">${escapeHtml(cell.secondaryFirmLabel.slice(0, 12))}</div>`
                  : '';

                return `<td class="matrix-cell ${weekCls}" style="${bgStyle}">${textLines}${firmBadge}</td>`;
              })
              .join('');

            return `<tr>
              <td class="staff-col">
                <div class="staff-name">${escapeHtml(row.staffName)}</div>
                <div class="staff-id">${escapeHtml(row.staffId)}</div>
              </td>
              <td class="num-col work-num">${escapeHtml(row.workDays)}</td>
              <td class="num-col leave-num">${escapeHtml(row.leaveDays)}</td>
              <td class="num-col jobs-num week-divider">${escapeHtml(row.openJobs)}</td>
              ${cellsHtml}
            </tr>`;
          })
          .join('');

  const notesStripHtml =
    model.monthlyNotes.length > 0
      ? `<div class="notes-panel">
          <div class="notes-title">Monthly Event Notes &amp; Holidays — ${escapeHtml(model.monthLabel)}</div>
          <div class="notes-grid">
            ${model.monthlyNotes
              .map(
                (n) => `<div class="note-card">
                  <span class="note-swatch" style="background:${escapeHtml(n.color)};"></span>
                  <div class="note-body">
                    <div class="note-head">${escapeHtml(n.title)}</div>
                    <div class="note-meta">${escapeHtml(n.dateLabel)} · ${escapeHtml(n.categoryLabel)}</div>
                    ${n.notes ? `<div class="note-text">${escapeHtml(n.notes)}</div>` : ''}
                  </div>
                </div>`
              )
              .join('')}
          </div>
        </div>`
      : '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 8.5px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1.5px solid #16a34a;
      padding-bottom: 5px;
      margin-bottom: 7px;
    }
    .title { font-size: 13px; font-weight: 700; margin: 0; color: #0f172a; }
    .subtitle { font-size: 9px; color: #475569; margin: 2px 0 0 0; }
    .legend { display: flex; gap: 10px; align-items: center; font-size: 8px; color: #334155; }
    .legend-item { display: inline-flex; align-items: center; gap: 4px; }
    .swatch { width: 9px; height: 9px; border-radius: 2px; border: 0.75px solid rgba(15,23,42,0.25); display: inline-block; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th {
      background: #16a34a;
      color: #ffffff;
      font-weight: 700;
      text-align: center;
      padding: 3.5px 2px;
      border: 0.75px solid #15803d;
      font-size: 8px;
      line-height: 1.15;
    }
    th.month-banner {
      background: #15803d;
      text-align: left;
      padding-left: 6px;
      font-size: 8.5px;
    }
    th.wknd-head { background: #15803d; color: #dcfce7; }
    th.sub-left { text-align: left; padding-left: 6px; border-bottom: 1.8px solid #0f172a; }
    th.sub-num { text-align: right; padding-right: 4px; border-bottom: 1.8px solid #0f172a; }
    th.date-num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; border-bottom: 1.8px solid #0f172a; }
    td {
      border: 0.75px solid #cbd5e1;
      padding: 3px 2px;
      vertical-align: middle;
    }
    .staff-col {
      width: 118px;
      padding: 3px 5px;
      background: #ffffff;
    }
    .staff-name { font-weight: 600; font-size: 8.2px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .staff-id { font-size: 7px; color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .num-col {
      width: 28px;
      text-align: right;
      padding: 3px 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 600;
      font-size: 8px;
      background: #ffffff;
    }
    .work-num { color: #065f46; }
    .leave-num { color: #0e7490; }
    .jobs-num { color: #1e293b; }
    .matrix-cell {
      text-align: center;
      font-size: 7.4px;
      font-weight: 700;
      line-height: 1.15;
      word-break: break-word;
      height: 24px;
    }
    .firm-mini {
      margin-top: 2px;
      padding: 1px 2px;
      border-radius: 2px;
      font-size: 6.5px;
      font-weight: 600;
    }
    .holiday-cell {
      text-align: center;
      vertical-align: middle;
      padding: 4px 1px;
    }
    .holiday-vertical {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-weight: 700;
      font-size: 8px;
      letter-spacing: 0.2px;
      margin: 0 auto;
      white-space: nowrap;
    }
    .week-divider {
      border-right: 2px solid #0f172a !important;
    }
    .notes-panel {
      margin-top: 9px;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 6px 8px;
      background: #f8fafc;
      page-break-inside: avoid;
    }
    .notes-title {
      font-size: 8.5px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .notes-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .note-card {
      display: flex;
      align-items: flex-start;
      gap: 5px;
      background: #ffffff;
      border: 0.75px solid #e2e8f0;
      border-radius: 4px;
      padding: 4px 6px;
    }
    .note-swatch {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      margin-top: 2px;
      flex-shrink: 0;
      border: 0.5px solid rgba(15,23,42,0.25);
    }
    .note-head { font-weight: 700; font-size: 8px; color: #0f172a; }
    .note-meta { font-size: 7.2px; color: #475569; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .note-text { font-size: 7.4px; color: #334155; margin-top: 1px; }
    .footer {
      margin-top: 7px;
      font-size: 7.5px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
    ${buildPrintTableSectionCss()}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p class="title">Tax Practice Management System — ${escapeHtml(model.title)}</p>
      <p class="subtitle">${escapeHtml(model.subtitle)} • Printed: ${escapeHtml(generatedAt)}</p>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="swatch" style="background:#22d3ee;"></span>Leave</span>
      <span class="legend-item"><span class="swatch" style="background:#86efac;"></span>WFH</span>
      <span class="legend-item"><span class="swatch" style="background:#ef4444;"></span>Tax Due Date</span>
      <span class="legend-item"><span class="swatch" style="background:#facc15;"></span>Holiday</span>
      <span class="legend-item"><span class="swatch" style="background:#f0abfc;"></span>Firm Event</span>
      <span class="legend-item"><span class="swatch" style="background:#bae6fd;"></span>Client Appt</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th colspan="4" class="month-banner week-divider">${escapeHtml(model.monthLabel)} — Johor / MY Matrix</th>
        ${dowHeaders}
      </tr>
      <tr>
        <th class="sub-left" style="width:118px;">Staff</th>
        <th class="sub-num" style="width:28px;">Work</th>
        <th class="sub-num" style="width:28px;">Leave</th>
        <th class="sub-num week-divider" style="width:28px;">Jobs</th>
        ${dateHeaders}
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
  ${notesStripHtml}
  ${buildPrintTableSectionHtml(
    buildCompleteEventRegisterSpec(model.eventRegister),
    REGISTER_COL_WIDTHS_PCT
  )}
  <div class="footer">
    <span>Source: TJW Tax Department · Tax Practice Management System (Malaysia)</span>
    <span>Printed: ${escapeHtml(generatedAt)}</span>
  </div>
</body>
</html>`;

  printHtml(html);
}

// =============================================================================
// 2. PDF EXPORT (Direct jsPDF A4 Landscape with 2-row green header, colors, vertical holidays, thick dividers & notes)
// =============================================================================
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return [241, 245, 249];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [241, 245, 249];
  return [r, g, b];
}

export function exportStaffMatrixToPdf(model: StaffMatrixExportModel): void {
  try {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 297;
    const pageHeight = 210;
    const marginX = 8;
    const marginTop = 9;
    const footerReserve = 10;
    const contentWidth = pageWidth - marginX * 2; // 281mm
    const maxY = pageHeight - footerReserve;

    const staffColW = 38;
    const workColW = 9.5;
    const leaveColW = 9.5;
    const jobsColW = 9.5;
    const leftBlockW = staffColW + workColW + leaveColW + jobsColW; // 66.5mm
    const daysAreaW = contentWidth - leftBlockW; // 214.5mm
    const dayColW = model.days.length > 0 ? daysAreaW / model.days.length : daysAreaW;

    const headerRow1H = 5.4;
    const headerRow2H = 5.6;
    const dataRowH = 8.4;

    const generatedAt = new Date().toLocaleString('en-MY', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    let y = marginTop;

    const drawPageHeader = (isContinuation: boolean) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isContinuation ? 9.5 : 11.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Tax Practice Management System — ${model.title}`,
        marginX,
        y + 3.8
      );

      // Legend on right
      const legendItems = [
        { label: 'Leave', hex: '#22d3ee' },
        { label: 'WFH', hex: '#86efac' },
        { label: 'Tax Due Date', hex: '#ef4444' },
        { label: 'Holiday', hex: '#facc15' },
        { label: 'Firm Event', hex: '#f0abfc' },
        { label: 'Client Appt', hex: '#bae6fd' },
      ];
      let lx = pageWidth - marginX;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      for (let i = legendItems.length - 1; i >= 0; i--) {
        const item = legendItems[i];
        const tw = doc.getTextWidth(item.label);
        lx -= tw;
        doc.setTextColor(51, 65, 85);
        doc.text(item.label, lx, y + 3.5);
        lx -= 3.6;
        const [r, g, b] = hexToRgb(item.hex);
        doc.setFillColor(r, g, b);
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.15);
        doc.rect(lx, y + 1.3, 2.5, 2.5, 'FD');
        lx -= 3.2;
      }

      y += isContinuation ? 5.2 : 6.0;

      if (!isContinuation) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(model.subtitle, marginX, y + 1.4);
        y += 3.6;
      }

      doc.setDrawColor(22, 163, 74);
      doc.setLineWidth(0.45);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 2.0;
    };

    const drawMatrixTableHeader = (): number => {
      const headerTop = y;

      // Row 1: Month label across left block + Mon..Fri across days
      doc.setFillColor(21, 128, 61); // #15803d
      doc.setDrawColor(21, 128, 61);
      doc.setLineWidth(0.2);
      doc.rect(marginX, y, leftBlockW, headerRow1H, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${model.monthLabel} — Johor / MY Matrix`, marginX + 1.8, y + 3.7);

      let x = marginX + leftBlockW;
      for (const d of model.days) {
        const [r, g, b] = d.isWeekend ? [21, 128, 61] : [22, 163, 74];
        doc.setFillColor(r, g, b);
        doc.setDrawColor(21, 128, 61);
        doc.setLineWidth(0.18);
        doc.rect(x, y, dayColW, headerRow1H, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.6);
        doc.setTextColor(d.isWeekend ? 220 : 255, d.isWeekend ? 252 : 255, d.isWeekend ? 231 : 255);
        doc.text(d.weekdayShort, x + dayColW / 2, y + 3.7, { align: 'center' });
        x += dayColW;
      }

      y += headerRow1H;

      // Row 2: Staff, Work, Leave, Jobs + Date numbers (2/11, 3/11, ...)
      const leftCols = [
        { label: 'Staff', w: staffColW, align: 'left' as const },
        { label: 'Work', w: workColW, align: 'right' as const },
        { label: 'Leave', w: leaveColW, align: 'right' as const },
        { label: 'Jobs', w: jobsColW, align: 'right' as const },
      ];

      x = marginX;
      for (const lc of leftCols) {
        doc.setFillColor(22, 163, 74);
        doc.setDrawColor(21, 128, 61);
        doc.setLineWidth(0.18);
        doc.rect(x, y, lc.w, headerRow2H, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        const tx = lc.align === 'right' ? x + lc.w - 1.3 : x + 1.8;
        doc.text(lc.label, tx, y + 3.8, { align: lc.align });
        x += lc.w;
      }

      for (const d of model.days) {
        const [r, g, b] = d.isWeekend ? [21, 128, 61] : [22, 163, 74];
        doc.setFillColor(r, g, b);
        doc.setDrawColor(21, 128, 61);
        doc.setLineWidth(0.18);
        doc.rect(x, y, dayColW, headerRow2H, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.3);
        doc.setTextColor(d.isWeekend ? 220 : 255, d.isWeekend ? 252 : 255, d.isWeekend ? 231 : 255);
        doc.text(d.dateShort, x + dayColW / 2, y + 3.8, { align: 'center' });
        x += dayColW;
      }

      y += headerRow2H;

      // Dark bottom rule under header
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.5);
      doc.line(marginX, y, pageWidth - marginX, y);

      return headerTop;
    };

    const drawVerticalHolidayBannersAndDividers = (
      headerTopY: number,
      bodyTopY: number,
      bodyBottomY: number
    ) => {
      // Draw full-height yellow holiday columns spanning bodyTopY..bodyBottomY
      const bodyHeight = bodyBottomY - bodyTopY;
      if (bodyHeight > 0) {
        let x = marginX + leftBlockW;
        for (const d of model.days) {
          if (d.holidayName && d.holidayColor) {
            const [r, g, b] = hexToRgb(d.holidayColor);
            doc.setFillColor(r, g, b);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.18);
            doc.rect(x, bodyTopY, dayColW, bodyHeight, 'FD');

            const [tr, tg, tb] = hexToRgb(getContrastingTextColor(d.holidayColor));
            doc.setFont('helvetica', 'bold');
            const labelSize = Math.min(7.2, Math.max(5.5, dayColW * 0.62));
            doc.setFontSize(labelSize);
            doc.setTextColor(tr, tg, tb);

            // Truncate only if longer than column height
            let text = d.holidayName;
            const maxTextLenMm = Math.max(8, bodyHeight - 4);
            while (text.length > 4 && doc.getTextWidth(text) > maxTextLenMm) {
              text = `${text.slice(0, -2)}…`;
            }
            const textW = doc.getTextWidth(text);
            // Rotate 90° counterclockwise centered vertically inside the holiday banner
            const centerX = x + dayColW / 2 + labelSize * 0.13;
            const startY = bodyTopY + bodyHeight / 2 + textW / 2;
            doc.text(text, centerX, startY, { angle: 90 });
          }
          x += dayColW;
        }
      }

      // Draw thick dark vertical week dividers after Jobs column and after each Friday (isEndOfWeek)
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.6);
      doc.line(marginX + leftBlockW, headerTopY, marginX + leftBlockW, bodyBottomY);

      let dx = marginX + leftBlockW;
      for (const d of model.days) {
        dx += dayColW;
        if (d.isEndOfWeek) {
          doc.line(dx, headerTopY, dx, bodyBottomY);
        }
      }

      // Outer border box around the table section on this page
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.35);
      doc.rect(marginX, headerTopY, contentWidth, bodyBottomY - headerTopY, 'S');
    };

    drawPageHeader(false);
    let currentHeaderTop = drawMatrixTableHeader();
    let currentBodyTop = y;

    if (model.rows.length === 0) {
      doc.setDrawColor(203, 213, 225);
      doc.rect(marginX, y, contentWidth, 10, 'S');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('No active staff records found.', pageWidth / 2, y + 6.2, { align: 'center' });
      y += 10;
      drawVerticalHolidayBannersAndDividers(currentHeaderTop, currentBodyTop, y);
    } else {
      model.rows.forEach((row, rowIdx) => {
        if (y + dataRowH > maxY) {
          drawVerticalHolidayBannersAndDividers(currentHeaderTop, currentBodyTop, y);
          doc.addPage();
          y = marginTop;
          drawPageHeader(true);
          currentHeaderTop = drawMatrixTableHeader();
          currentBodyTop = y;
        }

        const isAlt = rowIdx % 2 === 1;
        // Left 4 columns background
        doc.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.18);
        doc.rect(marginX, y, leftBlockW, dataRowH, 'FD');

        // Vertical separators inside left 4 columns
        doc.line(marginX + staffColW, y, marginX + staffColW, y + dataRowH);
        doc.line(
          marginX + staffColW + workColW,
          y,
          marginX + staffColW + workColW,
          y + dataRowH
        );
        doc.line(
          marginX + staffColW + workColW + leaveColW,
          y,
          marginX + staffColW + workColW + leaveColW,
          y + dataRowH
        );

        // Staff name + ID
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(15, 23, 42);
        const nameClipped = doc.splitTextToSize(row.staffName, staffColW - 3)[0] || row.staffName;
        doc.text(nameClipped, marginX + 1.5, y + 3.8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(row.staffId, marginX + 1.5, y + 6.9);

        // Numeric totals
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(6, 95, 70);
        doc.text(String(row.workDays), marginX + staffColW + workColW - 1.3, y + 5.2, {
          align: 'right',
        });

        doc.setTextColor(row.leaveDays > 0 ? 14 : 148, row.leaveDays > 0 ? 116 : 163, row.leaveDays > 0 ? 144 : 184);
        doc.text(
          String(row.leaveDays),
          marginX + staffColW + workColW + leaveColW - 1.3,
          y + 5.2,
          { align: 'right' }
        );

        doc.setTextColor(row.openJobs > 0 ? 30 : 148, row.openJobs > 0 ? 41 : 163, row.openJobs > 0 ? 59 : 184);
        doc.text(String(row.openJobs), marginX + leftBlockW - 1.3, y + 5.2, { align: 'right' });

        // Day cells
        let x = marginX + leftBlockW;
        for (const d of model.days) {
          if (d.holidayName && d.holidayColor) {
            x += dayColW;
            continue; // Drawn as full-height vertical banner after rows on this page
          }

          const cell = row.cells[d.iso];
          if (cell?.bgColor) {
            const [r, g, b] = hexToRgb(cell.bgColor);
            doc.setFillColor(r, g, b);
          } else {
            doc.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
          }
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.18);
          doc.rect(x, y, dayColW, dataRowH, 'FD');

          if (cell?.text) {
            const [tr, tg, tb] = hexToRgb(cell.textColor);
            doc.setTextColor(tr, tg, tb);
            doc.setFont('helvetica', 'bold');
            const cellFontSize = cell.kind === 'leave' ? 6.1 : 5.1;
            doc.setFontSize(cellFontSize);
            const rawLines = cell.text
              .split('\n')
              .flatMap((line) => doc.splitTextToSize(line, Math.max(4, dayColW - 1.2)) as string[])
              .slice(0, 2);
            const lineH = cellFontSize * 0.43 + 0.6;
            const totalTextH = rawLines.length * lineH;
            const startY = y + (dataRowH - totalTextH) / 2 + lineH * 0.78;
            rawLines.forEach((line, idx) => {
              doc.text(line, x + dayColW / 2, startY + idx * lineH, { align: 'center' });
            });
          }

          x += dayColW;
        }

        y += dataRowH;
      });

      drawVerticalHolidayBannersAndDividers(currentHeaderTop, currentBodyTop, y);
    }

    // Monthly Event Notes Footer Strip
    if (model.monthlyNotes.length > 0) {
      y += 4.5;
      const cardCols = 3;
      const cardGap = 3;
      const cardW = (contentWidth - cardGap * (cardCols - 1)) / cardCols;
      const cardH = 12.5;
      const rowsNeeded = Math.ceil(model.monthlyNotes.length / cardCols);
      const totalStripH = 6.5 + rowsNeeded * (cardH + 2);

      if (y + totalStripH > maxY) {
        doc.addPage();
        y = marginTop;
        drawPageHeader(true);
      }

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.roundedRect(marginX, y, contentWidth, totalStripH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `MONTHLY EVENT NOTES & HOLIDAYS — ${model.monthLabel.toUpperCase()}`,
        marginX + 2.5,
        y + 4.3
      );

      let cardY = y + 6.2;
      model.monthlyNotes.forEach((note, idx) => {
        const colIdx = idx % cardCols;
        if (idx > 0 && colIdx === 0) {
          cardY += cardH + 2;
        }
        const cx = marginX + 2 + colIdx * (cardW - 1.3 + cardGap);
        const w = cardW - 1.3;

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.roundedRect(cx, cardY, w, cardH, 1, 1, 'FD');

        const [sr, sg, sb] = hexToRgb(note.color);
        doc.setFillColor(sr, sg, sb);
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.15);
        doc.rect(cx + 2, cardY + 2.4, 2.5, 2.5, 'FD');

        const textX = cx + 6;
        const maxW = w - 7.5;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(15, 23, 42);
        const titleLine = (doc.splitTextToSize(note.title, maxW) as string[])[0] || note.title;
        doc.text(titleLine, textX, cardY + 4.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.0);
        doc.setTextColor(71, 85, 105);
        doc.text(`${note.dateLabel} · ${note.categoryLabel}`, textX, cardY + 7.4);

        if (note.notes) {
          doc.setFontSize(5.8);
          doc.setTextColor(51, 65, 85);
          const noteLine = (doc.splitTextToSize(note.notes, maxW) as string[])[0] || '';
          doc.text(noteLine, textX, cardY + 10.6);
        }
      });
    }

    // Page 2+ — Complete Event Register Table
    appendPdfTableSection(doc, buildCompleteEventRegisterSpec(model.eventRegister), {
      marginX,
      marginTop,
      footerReserve: 11,
      columnWeights: REGISTER_COL_WEIGHTS,
    });

    // Page numbers across all pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(marginX, pageHeight - 7.5, pageWidth - marginX, pageHeight - 7.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Source: TJW Tax Department  |  Printed: ${generatedAt}`,
        marginX,
        pageHeight - 4
      );
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 4, {
        align: 'right',
      });
    }

    const filename = `${model.filenameBase}.pdf`;
    triggerBlobDownload(doc.output('blob'), filename);
    showToast(`Downloaded ${filename}`, 'success', 3200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Matrix PDF export failed: ${msg}`, 'error');
  }
}

// =============================================================================
// 3. STYLED EXCEL (.XLSX) EXPORT (OOXML via JSZip — real cell colors, thick week dividers, 2-row header, merged vertical holidays & notes)
// =============================================================================
function escapeXml(val: string): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colIndexToLetter(zeroBasedCol: number): string {
  let n = zeroBasedCol + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function hexToArgb(hex: string): string {
  const clean = hex.replace('#', '').trim().toUpperCase();
  if (/^[0-9A-F]{6}$/.test(clean)) return `FF${clean}`;
  return 'FFFFFFFF';
}

interface XfSpec {
  fontId: number;
  fillId: number;
  borderId: number;
  hAlign: 'left' | 'center' | 'right';
  vAlign: 'center' | 'top';
  wrapText: boolean;
  textRotation: number;
}

export async function exportStaffMatrixToExcel(model: StaffMatrixExportModel): Promise<void> {
  try {
    // Dynamic style registries for xl/styles.xml
    const fillHexList: string[] = []; // index 0 -> fillId 2 (0=none, 1=gray125 are reserved by Excel)
    const fillMap = new Map<string, number>();

    const getFillId = (hex: string | null): number => {
      if (!hex) return 0;
      const argb = hexToArgb(hex);
      const existing = fillMap.get(argb);
      if (existing !== undefined) return existing;
      const id = 2 + fillHexList.length;
      fillHexList.push(argb);
      fillMap.set(argb, id);
      return id;
    };

    const xfList: XfSpec[] = [
      // index 0: default Normal style
      {
        fontId: 0,
        fillId: 0,
        borderId: 0,
        hAlign: 'left',
        vAlign: 'center',
        wrapText: false,
        textRotation: 0,
      },
    ];
    const xfMap = new Map<string, number>();

    const getXfId = (spec: XfSpec): number => {
      const key = `${spec.fontId}|${spec.fillId}|${spec.borderId}|${spec.hAlign}|${spec.vAlign}|${
        spec.wrapText ? 1 : 0
      }|${spec.textRotation}`;
      const existing = xfMap.get(key);
      if (existing !== undefined) return existing;
      const id = xfList.length;
      xfList.push(spec);
      xfMap.set(key, id);
      return id;
    };

    // Font indices:
    // 0: 10pt regular #0F172A
    // 1: 10pt bold #FFFFFF (headers / dark fills)
    // 2: 10pt bold #0F172A (staff / leave / light fills)
    // 3: 13pt bold #0F172A (sheet title)
    // 4: 9pt regular #475569 (subtitle / metadata)
    // 5: 9pt bold #065F46 (Work days)
    // 6: 9pt bold #0E7490 (Leave days)
    // 7: 9pt bold #0F172A (small bold cell text / rotated holiday)
    // 8: 9pt bold #FFFFFF (small bold white cell text)

    // Border indices:
    // 0: none
    // 1: thin grid all sides (#CBD5E1)
    // 2: thin top/left/bottom (#CBD5E1), MEDIUM right (#0F172A) -> Week Divider & Jobs Divider
    // 3: header row 1 normal (thin #15803D all)
    // 4: header row 1 week divider (thin top/left/bottom #15803D, MEDIUM right #0F172A)
    // 5: header row 2 normal (thin top/left/right #15803D, MEDIUM bottom #0F172A)
    // 6: header row 2 week divider (thin top/left #15803D, MEDIUM right & bottom #0F172A)
    // 7: notes box border (thin #CBD5E1)

    const totalCols = 4 + model.days.length;
    const lastColLetter = colIndexToLetter(totalCols - 1);
    const merges: string[] = [];
    const rowsXml: string[] = [];

    const strCell = (r: number, c: number, val: string, styleId: number) =>
      `<c r="${colIndexToLetter(c)}${r}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
        val
      )}</t></is></c>`;

    const numCell = (r: number, c: number, val: number, styleId: number) =>
      `<c r="${colIndexToLetter(c)}${r}" s="${styleId}"><v>${Number.isFinite(val) ? val : 0}</v></c>`;

    // Row 1: Report Title
    const titleXf = getXfId({
      fontId: 3,
      fillId: 0,
      borderId: 0,
      hAlign: 'left',
      vAlign: 'center',
      wrapText: false,
      textRotation: 0,
    });
    rowsXml.push(
      `<row r="1" ht="22" customHeight="1">${strCell(
        1,
        0,
        `Tax Practice Management System — ${model.title}`,
        titleXf
      )}</row>`
    );
    merges.push(`A1:${lastColLetter}1`);

    // Row 2: Subtitle
    const subXf = getXfId({
      fontId: 4,
      fillId: 0,
      borderId: 0,
      hAlign: 'left',
      vAlign: 'center',
      wrapText: false,
      textRotation: 0,
    });
    rowsXml.push(
      `<row r="2" ht="16" customHeight="1">${strCell(2, 0, model.subtitle, subXf)}</row>`
    );
    merges.push(`A2:${lastColLetter}2`);

    // Row 3: Header Row 1 (Month Banner across A3:D3 + Mon, Tue, Wed, Thu, Fri...)
    const monthBannerFill = getFillId('#15803D');
    const headerGreenFill = getFillId('#16A34A');
    const weekendHeadFill = getFillId('#15803D');

    const monthBannerLeftXf = getXfId({
      fontId: 1,
      fillId: monthBannerFill,
      borderId: 3,
      hAlign: 'left',
      vAlign: 'center',
      wrapText: false,
      textRotation: 0,
    });
    const monthBannerRightXf = getXfId({
      fontId: 1,
      fillId: monthBannerFill,
      borderId: 4,
      hAlign: 'left',
      vAlign: 'center',
      wrapText: false,
      textRotation: 0,
    });

    const r3Cells: string[] = [
      strCell(3, 0, `${model.monthLabel} — Johor / MY Matrix`, monthBannerLeftXf),
      strCell(3, 1, '', monthBannerLeftXf),
      strCell(3, 2, '', monthBannerLeftXf),
      strCell(3, 3, '', monthBannerRightXf),
    ];
    merges.push('A3:D3');

    model.days.forEach((d, idx) => {
      const xf = getXfId({
        fontId: 1,
        fillId: d.isWeekend ? weekendHeadFill : headerGreenFill,
        borderId: d.isEndOfWeek ? 4 : 3,
        hAlign: 'center',
        vAlign: 'center',
        wrapText: false,
        textRotation: 0,
      });
      r3Cells.push(strCell(3, 4 + idx, d.weekdayShort, xf));
    });
    rowsXml.push(`<row r="3" ht="19" customHeight="1">${r3Cells.join('')}</row>`);

    // Row 4: Header Row 2 (Staff, Work, Leave, Jobs + 2/11, 3/11, ...)
    const leftSubHeadXf = getXfId({
      fontId: 1,
      fillId: headerGreenFill,
      borderId: 5,
      hAlign: 'left',
      vAlign: 'center',
      wrapText: false,
      textRotation: 0,
    });
    const numSubHeadXf = getXfId({
      fontId: 1,
      fillId: headerGreenFill,
      borderId: 5,
      hAlign: 'right',
      vAlign: 'center',
      wrapText: false,
      textRotation: 0,
    });
    const jobsSubHeadXf = getXfId({
      fontId: 1,
      fillId: headerGreenFill,
      borderId: 6,
      hAlign: 'right',
      vAlign: 'center',
      wrapText: false,
      textRotation: 0,
    });

    const r4Cells: string[] = [
      strCell(4, 0, 'Staff', leftSubHeadXf),
      strCell(4, 1, 'Work', numSubHeadXf),
      strCell(4, 2, 'Leave', numSubHeadXf),
      strCell(4, 3, 'Jobs', jobsSubHeadXf),
    ];
    model.days.forEach((d, idx) => {
      const xf = getXfId({
        fontId: 1,
        fillId: d.isWeekend ? weekendHeadFill : headerGreenFill,
        borderId: d.isEndOfWeek ? 6 : 5,
        hAlign: 'center',
        vAlign: 'center',
        wrapText: false,
        textRotation: 0,
      });
      r4Cells.push(strCell(4, 4 + idx, d.dateShort, xf));
    });
    rowsXml.push(`<row r="4" ht="19" customHeight="1">${r4Cells.join('')}</row>`);

    // Data rows: start at row 5
    const firstDataRow = 5;
    const lastDataRow = firstDataRow + Math.max(0, model.rows.length - 1);

    // Pre-register vertical merges for holiday columns across all staff rows
    if (model.rows.length > 1) {
      model.days.forEach((d, idx) => {
        if (d.holidayName) {
          const colLet = colIndexToLetter(4 + idx);
          merges.push(`${colLet}${firstDataRow}:${colLet}${lastDataRow}`);
        }
      });
    }

    const altRowFill = getFillId('#F8FAFC');

    model.rows.forEach((row, rowIdx) => {
      const excelRowNum = firstDataRow + rowIdx;
      const baseFillId = rowIdx % 2 === 1 ? altRowFill : 0;

      const staffXf = getXfId({
        fontId: 2,
        fillId: baseFillId,
        borderId: 1,
        hAlign: 'left',
        vAlign: 'center',
        wrapText: false,
        textRotation: 0,
      });
      const workXf = getXfId({
        fontId: 5,
        fillId: baseFillId,
        borderId: 1,
        hAlign: 'right',
        vAlign: 'center',
        wrapText: false,
        textRotation: 0,
      });
      const leaveXf = getXfId({
        fontId: 6,
        fillId: baseFillId,
        borderId: 1,
        hAlign: 'right',
        vAlign: 'center',
        wrapText: false,
        textRotation: 0,
      });
      const jobsXf = getXfId({
        fontId: 2,
        fillId: baseFillId,
        borderId: 2,
        hAlign: 'right',
        vAlign: 'center',
        wrapText: false,
        textRotation: 0,
      });

      const cells: string[] = [
        strCell(excelRowNum, 0, `${row.staffName} (${row.staffId})`, staffXf),
        numCell(excelRowNum, 1, row.workDays, workXf),
        numCell(excelRowNum, 2, row.leaveDays, leaveXf),
        numCell(excelRowNum, 3, row.openJobs, jobsXf),
      ];

      model.days.forEach((d, idx) => {
        const colIdx = 4 + idx;
        const borderId = d.isEndOfWeek ? 2 : 1;

        if (d.holidayName && d.holidayColor) {
          const isDarkText = getContrastingTextColor(d.holidayColor) === '#0f172a';
          const holXf = getXfId({
            fontId: isDarkText ? 7 : 8,
            fillId: getFillId(d.holidayColor),
            borderId,
            hAlign: 'center',
            vAlign: 'center',
            wrapText: true,
            textRotation: 90,
          });
          cells.push(strCell(excelRowNum, colIdx, rowIdx === 0 ? d.holidayName : '', holXf));
          return;
        }

        const cell = row.cells[d.iso];
        const cellFillId = cell?.bgColor ? getFillId(cell.bgColor) : baseFillId;
        const isDarkText = cell?.textColor !== '#ffffff';
        const cellXf = getXfId({
          fontId: cell?.text ? (isDarkText ? 7 : 8) : 0,
          fillId: cellFillId,
          borderId,
          hAlign: 'center',
          vAlign: 'center',
          wrapText: true,
          textRotation: 0,
        });
        const displayVal = cell?.secondaryFirmLabel
          ? `${cell.text}\n[${cell.secondaryFirmLabel.slice(0, 12)}]`
          : cell?.text || '';
        cells.push(strCell(excelRowNum, colIdx, displayVal, cellXf));
      });

      rowsXml.push(`<row r="${excelRowNum}" ht="22" customHeight="1">${cells.join('')}</row>`);
    });

    // Monthly Event Notes Footer Strip below the table
    if (model.monthlyNotes.length > 0) {
      let noteRowNum = (model.rows.length > 0 ? lastDataRow : firstDataRow) + 2;

      const notesBannerXf = getXfId({
        fontId: 2,
        fillId: getFillId('#E2E8F0'),
        borderId: 7,
        hAlign: 'left',
        vAlign: 'center',
        wrapText: false,
        textRotation: 0,
      });
      const bannerCells = [
        strCell(noteRowNum, 0, `Monthly Event Notes & Holidays — ${model.monthLabel}`, notesBannerXf),
        ...Array.from({ length: totalCols - 1 }, (_, i) => strCell(noteRowNum, i + 1, '', notesBannerXf)),
      ];
      rowsXml.push(`<row r="${noteRowNum}" ht="19" customHeight="1">${bannerCells.join('')}</row>`);
      merges.push(`A${noteRowNum}:${lastColLetter}${noteRowNum}`);
      noteRowNum += 1;

      for (const note of model.monthlyNotes) {
        const isDark = getContrastingTextColor(note.color) === '#0f172a';
        const tagXf = getXfId({
          fontId: isDark ? 7 : 8,
          fillId: getFillId(note.color),
          borderId: 7,
          hAlign: 'center',
          vAlign: 'center',
          wrapText: false,
          textRotation: 0,
        });
        const detailXf = getXfId({
          fontId: 0,
          fillId: getFillId('#FFFFFF'),
          borderId: 7,
          hAlign: 'left',
          vAlign: 'center',
          wrapText: true,
          textRotation: 0,
        });

        const summaryText = `${note.dateLabel} — ${note.title}${
          note.notes ? ` (${note.notes})` : ''
        }`;
        const nCells = [
          strCell(noteRowNum, 0, note.categoryLabel, tagXf),
          strCell(noteRowNum, 1, summaryText, detailXf),
          ...Array.from({ length: Math.max(0, totalCols - 2) }, (_, i) =>
            strCell(noteRowNum, i + 2, '', detailXf)
          ),
        ];
        rowsXml.push(`<row r="${noteRowNum}" ht="18" customHeight="1">${nCells.join('')}</row>`);
        merges.push(`B${noteRowNum}:${lastColLetter}${noteRowNum}`);
        noteRowNum += 1;
      }
    }

    // Build XML files
    const fillsXml = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
      ...fillHexList.map(
        (argb) =>
          `<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/><bgColor indexed="64"/></patternFill></fill>`
      ),
    ].join('');

    const fontsXml = [
      '<font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>',
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
      '<font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>',
      '<font><b/><sz val="13"/><color rgb="FF0F172A"/><name val="Calibri"/></font>',
      '<font><sz val="9"/><color rgb="FF475569"/><name val="Calibri"/></font>',
      '<font><b/><sz val="9"/><color rgb="FF065F46"/><name val="Calibri"/></font>',
      '<font><b/><sz val="9"/><color rgb="FF0E7490"/><name val="Calibri"/></font>',
      '<font><b/><sz val="9"/><color rgb="FF0F172A"/><name val="Calibri"/></font>',
      '<font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    ].join('');

    const bordersXml = [
      '<border><left/><right/><top/><bottom/><diagonal/></border>',
      '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>',
      '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="medium"><color rgb="FF0F172A"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>',
      '<border><left style="thin"><color rgb="FF15803D"/></left><right style="thin"><color rgb="FF15803D"/></right><top style="thin"><color rgb="FF15803D"/></top><bottom style="thin"><color rgb="FF15803D"/></bottom><diagonal/></border>',
      '<border><left style="thin"><color rgb="FF15803D"/></left><right style="medium"><color rgb="FF0F172A"/></right><top style="thin"><color rgb="FF15803D"/></top><bottom style="thin"><color rgb="FF15803D"/></bottom><diagonal/></border>',
      '<border><left style="thin"><color rgb="FF15803D"/></left><right style="thin"><color rgb="FF15803D"/></right><top style="thin"><color rgb="FF15803D"/></top><bottom style="medium"><color rgb="FF0F172A"/></bottom><diagonal/></border>',
      '<border><left style="thin"><color rgb="FF15803D"/></left><right style="medium"><color rgb="FF0F172A"/></right><top style="thin"><color rgb="FF15803D"/></top><bottom style="medium"><color rgb="FF0F172A"/></bottom><diagonal/></border>',
      '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>',
    ].join('');

    const cellXfsXml = xfList
      .map((xf) => {
        const rotAttr = xf.textRotation ? ` textRotation="${xf.textRotation}"` : '';
        const wrapAttr = xf.wrapText ? ' wrapText="1"' : '';
        return `<xf numFmtId="0" fontId="${xf.fontId}" fillId="${xf.fillId}" borderId="${xf.borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${xf.hAlign}" vertical="${xf.vAlign}"${wrapAttr}${rotAttr}/></xf>`;
      })
      .join('');

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="9">${fontsXml}</fonts>
  <fills count="${2 + fillHexList.length}">${fillsXml}</fills>
  <borders count="8">${bordersXml}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="${xfList.length}">${cellXfsXml}</cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    const colsXml = [
      '<col min="1" max="1" width="26" customWidth="1"/>',
      '<col min="2" max="4" width="7.5" customWidth="1"/>',
      ...(model.days.length > 0
        ? [`<col min="5" max="${4 + model.days.length}" width="9.5" customWidth="1"/>`]
        : []),
    ].join('');

    const mergesXml =
      merges.length > 0
        ? `<mergeCells count="${merges.length}">${merges
            .map((ref) => `<mergeCell ref="${ref}"/>`)
            .join('')}</mergeCells>`
        : '';

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <sheetViews><sheetView workbookViewId="0"><pane xSplit="4" ySplit="4" topLeftCell="E5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml.join('')}</sheetData>
  ${mergesXml}
  <pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

    const safeSheetName = escapeXml(
      model.sheetName.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Staff_Matrix'
    );

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('_rels/.rels', rootRelsXml);
    zip.file('xl/workbook.xml', workbookXml);
    zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
    zip.file('xl/styles.xml', stylesXml);
    zip.file('xl/worksheets/sheet1.xml', sheetXml);

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const filename = `${model.filenameBase}.xlsx`;
    triggerBlobDownload(blob, filename);
    showToast(`Downloaded ${filename}`, 'success', 3200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Matrix Excel export failed: ${msg}`, 'error');
  }
}

// =============================================================================
// 4. MONTH VIEW PRINT & PDF REPORT (Page 1: Month Grid max 3 events/day + Page 2: Complete Event Register)
// =============================================================================
export interface MonthGridCellEvent {
  label: string;
  bgColor: string;
  textColor: string;
}

export interface MonthGridCell {
  iso: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  holidayName: string | null;
  events: MonthGridCellEvent[];
  overflowCount: number;
}

export interface MonthCalendarExportModel {
  year: number;
  monthIndex: number;
  monthLabel: string;
  periodLabel: string;
  title: string;
  subtitle: string;
  filenameBase: string;
  weeks: MonthGridCell[][];
  eventRegister: CalendarRegisterRow[];
}

export function buildMonthCalendarExportModel(params: {
  year: number;
  monthIndex: number;
  monthGridDays: Date[];
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  parsedEvents: ParsedCalendarEvent[];
  holidaysByDate: Map<string, PublicHolidayRef>;
  staffList: StaffMember[];
  typeFilter?: string;
  staffFilter?: string;
  searchQuery?: string;
}): MonthCalendarExportModel {
  const {
    year,
    monthIndex,
    monthGridDays,
    periodLabel,
    periodStart,
    periodEnd,
    parsedEvents,
    holidaysByDate,
    staffList,
    typeFilter = '',
    staffFilter = '',
    searchQuery = '',
  } = params;

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  });
  const effectiveStart = periodStart ?? toIsoDate(new Date(year, monthIndex, 1));
  const effectiveEnd = periodEnd ?? toIsoDate(new Date(year, monthIndex + 1, 0));

  const eventRegister = buildCalendarEventRegisterRows({
    periodStart: effectiveStart,
    periodEnd: effectiveEnd,
    parsedEvents,
    holidaysByDate,
    staffList,
    typeFilter,
    searchQuery,
  });

  const q = searchQuery.trim().toLowerCase();
  const includePublicHolidays = !typeFilter || typeFilter === 'Company Holiday';

  const cells: MonthGridCell[] = monthGridDays.map((dayObj) => {
    const iso = toIsoDate(dayObj);
    const inCurrentMonth = dayObj.getMonth() === monthIndex;

    const ph = holidaysByDate.get(iso);
    const showPh =
      Boolean(ph) &&
      includePublicHolidays &&
      (!q ||
        `${ph!.name} ${ph!.scope} johor malaysia holiday ${formatDateDDMMYYYY(ph!.date)}`
          .toLowerCase()
          .includes(q));

    const dayEvents = parsedEvents.filter((ev) => eventCoversDate(ev.raw, iso));
    const allCellItems: MonthGridCellEvent[] = [];

    if (showPh && ph) {
      allCellItems.push({
        label: ph.name,
        bgColor: EVENT_TYPE_DEFAULT_COLORS['Company Holiday'],
        textColor: getContrastingTextColor(EVENT_TYPE_DEFAULT_COLORS['Company Holiday']),
      });
    }

    for (const ev of dayEvents) {
      const bg = ev.color || EVENT_TYPE_DEFAULT_COLORS[ev.canonicalType] || '#e2e8f0';
      allCellItems.push({
        label: ev.displayTitle || ev.cleanLabel,
        bgColor: bg,
        textColor: getContrastingTextColor(bg),
      });
    }

    const visibleItems = allCellItems.slice(0, 3);
    const overflowCount = Math.max(0, allCellItems.length - 3);

    return {
      iso,
      dayNumber: dayObj.getDate(),
      inCurrentMonth,
      holidayName: showPh && ph ? ph.name : null,
      events: visibleItems,
      overflowCount,
    };
  });

  const weeks: MonthGridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const activeFilters = [
    typeFilter ? `Type: ${typeFilter}` : '',
    staffFilter ? `Staff: ${staffFilter}` : '',
    searchQuery.trim() ? `Search: "${searchQuery.trim()}"` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const displayPeriod = periodLabel || monthLabel;
  const subtitle = [
    displayPeriod,
    'Source: TJW Tax Department',
    `${eventRegister.length} matching events`,
    activeFilters,
  ]
    .filter(Boolean)
    .join(' • ');

  return {
    year,
    monthIndex,
    monthLabel,
    periodLabel: displayPeriod,
    title: `Team Calendar — ${monthLabel}`,
    subtitle,
    filenameBase: `TPMS_Team_Calendar_${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    weeks,
    eventRegister,
  };
}

export function printMonthCalendar(model: MonthCalendarExportModel): void {
  const generatedAt = new Date().toLocaleString('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekRowsHtml = model.weeks
    .map(
      (week) =>
        `<tr>${week
          .map((cell) => {
            const pillsHtml = cell.events
              .map(
                (ev) =>
                  `<div class="cal-pill" style="background:${escapeHtml(
                    ev.bgColor
                  )};color:${escapeHtml(ev.textColor)};">${escapeHtml(ev.label)}</div>`
              )
              .join('');
            const moreHtml =
              cell.overflowCount > 0
                ? `<div class="cal-more">+${cell.overflowCount} more (see register)</div>`
                : '';
            return `<td class="cal-cell ${cell.inCurrentMonth ? '' : 'cal-outside'}">
              <div class="cal-day-num">${cell.dayNumber}</div>
              <div class="cal-pills">${pillsHtml}${moreHtml}</div>
            </td>`;
          })
          .join('')}</tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 8.5px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1.5px solid #0f766e;
      padding-bottom: 5px;
      margin-bottom: 7px;
    }
    .title { font-size: 13px; font-weight: 700; margin: 0; color: #0f172a; }
    .subtitle { font-size: 8.8px; color: #475569; margin: 2px 0 0 0; }
    .legend { display: flex; gap: 9px; align-items: center; font-size: 8px; color: #334155; }
    .legend-item { display: inline-flex; align-items: center; gap: 4px; }
    .swatch { width: 8px; height: 8px; border-radius: 2px; border: 0.5px solid rgba(15,23,42,0.25); display: inline-block; }
    table.month-grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    table.month-grid th {
      background: #0f766e;
      color: #ffffff;
      font-weight: 700;
      text-align: center;
      padding: 4px 3px;
      border: 0.75px solid #115e59;
      font-size: 8.5px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    table.month-grid td.cal-cell {
      border: 0.75px solid #cbd5e1;
      vertical-align: top;
      padding: 3px 4px;
      height: ${model.weeks.length >= 6 ? '26.5mm' : '31.5mm'};
      background: #ffffff;
    }
    table.month-grid td.cal-outside {
      background: #f8fafc;
      color: #94a3b8;
    }
    .cal-day-num {
      font-size: 8.5px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      margin-bottom: 2px;
      color: #334155;
    }
    .cal-outside .cal-day-num { color: #94a3b8; font-weight: 500; }
    .cal-pills {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cal-pill {
      padding: 1.5px 3.5px;
      border-radius: 2.5px;
      font-size: 7.3px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border: 0.4px solid rgba(15,23,42,0.12);
    }
    .cal-more {
      font-size: 7px;
      font-weight: 600;
      color: #0f766e;
      padding-left: 2px;
    }
    .footer {
      margin-top: 7px;
      font-size: 7.5px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
    ${buildPrintTableSectionCss()}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p class="title">Tax Practice Management System — ${escapeHtml(model.title)}</p>
      <p class="subtitle">${escapeHtml(model.subtitle)} • Printed: ${escapeHtml(generatedAt)}</p>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="swatch" style="background:#22d3ee;"></span>Leave</span>
      <span class="legend-item"><span class="swatch" style="background:#86efac;"></span>WFH</span>
      <span class="legend-item"><span class="swatch" style="background:#ef4444;"></span>Tax Due Date</span>
      <span class="legend-item"><span class="swatch" style="background:#facc15;"></span>Holiday</span>
      <span class="legend-item"><span class="swatch" style="background:#f0abfc;"></span>Firm Event</span>
      <span class="legend-item"><span class="swatch" style="background:#bae6fd;"></span>Client Appt</span>
    </div>
  </div>
  <table class="month-grid">
    <thead>
      <tr>${weekdayLabels.map((wd) => `<th>${wd}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${weekRowsHtml}
    </tbody>
  </table>
  ${buildPrintTableSectionHtml(
    buildCompleteEventRegisterSpec(model.eventRegister),
    REGISTER_COL_WIDTHS_PCT
  )}
  <div class="footer">
    <span>Source: TJW Tax Department · Tax Practice Management System (Malaysia)</span>
    <span>Printed: ${escapeHtml(generatedAt)}</span>
  </div>
</body>
</html>`;

  printHtml(html);
}

export function exportMonthCalendarToPdf(model: MonthCalendarExportModel): void {
  try {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 297;
    const pageHeight = 210;
    const marginX = 8;
    const marginTop = 9;
    const footerReserve = 11;
    const contentWidth = pageWidth - marginX * 2; // 281mm

    const generatedAt = new Date().toLocaleString('en-MY', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    let y = marginTop;

    // Page 1 Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Tax Practice Management System — ${model.title}`, marginX, y + 3.8);

    // Legend
    const legendItems = [
      { label: 'Leave', hex: '#22d3ee' },
      { label: 'WFH', hex: '#86efac' },
      { label: 'Tax Due Date', hex: '#ef4444' },
      { label: 'Holiday', hex: '#facc15' },
      { label: 'Firm Event', hex: '#f0abfc' },
      { label: 'Client Appt', hex: '#bae6fd' },
    ];
    let lx = pageWidth - marginX;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    for (let i = legendItems.length - 1; i >= 0; i--) {
      const item = legendItems[i];
      const tw = doc.getTextWidth(item.label);
      lx -= tw;
      doc.setTextColor(51, 65, 85);
      doc.text(item.label, lx, y + 3.5);
      lx -= 3.6;
      const [r, g, b] = hexToRgb(item.hex);
      doc.setFillColor(r, g, b);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.15);
      doc.rect(lx, y + 1.3, 2.5, 2.5, 'FD');
      lx -= 3.2;
    }

    y += 5.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${model.subtitle} • Printed: ${generatedAt}`, marginX, y + 1.4);
    y += 3.6;

    doc.setDrawColor(15, 118, 110);
    doc.setLineWidth(0.45);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 2.2;

    // 7-Column Month Grid
    const colW = contentWidth / 7;
    const headH = 6.2;
    const weekdayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    weekdayLabels.forEach((wd, idx) => {
      const cx = marginX + idx * colW;
      doc.setFillColor(15, 118, 110);
      doc.setDrawColor(17, 94, 89);
      doc.setLineWidth(0.2);
      doc.rect(cx, y, colW, headH, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(255, 255, 255);
      doc.text(wd, cx + colW / 2, y + 4.1, { align: 'center' });
    });
    y += headH;

    const weekCount = Math.max(1, model.weeks.length);
    const availH = pageHeight - footerReserve - y - 1;
    const rowH = availH / weekCount;

    model.weeks.forEach((week, wIdx) => {
      const ry = y + wIdx * rowH;
      week.forEach((cell, dIdx) => {
        const cx = marginX + dIdx * colW;
        doc.setFillColor(
          cell.inCurrentMonth ? 255 : 248,
          cell.inCurrentMonth ? 255 : 250,
          cell.inCurrentMonth ? 255 : 252
        );
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.rect(cx, ry, colW, rowH, 'FD');

        // Day number
        doc.setFont('helvetica', cell.inCurrentMonth ? 'bold' : 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(
          cell.inCurrentMonth ? 30 : 148,
          cell.inCurrentMonth ? 41 : 163,
          cell.inCurrentMonth ? 59 : 184
        );
        doc.text(String(cell.dayNumber), cx + 1.8, ry + 4.1);

        // Up to 3 event pills
        let py = ry + 5.6;
        const pillH = 4.6;
        const pillGap = 1.1;
        cell.events.slice(0, 3).forEach((ev) => {
          if (py + pillH > ry + rowH - 1.2) return;
          const [r, g, b] = hexToRgb(ev.bgColor);
          const [tr, tg, tb] = hexToRgb(ev.textColor);
          doc.setFillColor(r, g, b);
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.1);
          doc.roundedRect(cx + 1.3, py, colW - 2.6, pillH, 0.8, 0.8, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(tr, tg, tb);
          const maxTextW = colW - 4.6;
          let label = ev.label;
          while (label.length > 3 && doc.getTextWidth(label) > maxTextW) {
            label = `${label.slice(0, -2)}…`;
          }
          doc.text(label, cx + 2.2, py + 3.2);
          py += pillH + pillGap;
        });

        if (cell.overflowCount > 0 && py + 2.8 <= ry + rowH - 0.5) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.0);
          doc.setTextColor(15, 118, 110);
          doc.text(`+${cell.overflowCount} more`, cx + 1.8, py + 2.3);
        }
      });
    });

    // Page 2+ — Complete Event Register Table
    appendPdfTableSection(doc, buildCompleteEventRegisterSpec(model.eventRegister), {
      marginX,
      marginTop,
      footerReserve,
      columnWeights: REGISTER_COL_WEIGHTS,
    });

    // Page numbers across all pages
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(marginX, pageHeight - 7.5, pageWidth - marginX, pageHeight - 7.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Source: TJW Tax Department  |  Printed: ${generatedAt}`,
        marginX,
        pageHeight - 4
      );
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 4, {
        align: 'right',
      });
    }

    const filename = `${model.filenameBase}.pdf`;
    triggerBlobDownload(doc.output('blob'), filename);
    showToast(`Downloaded ${filename}`, 'success', 3200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Calendar PDF export failed: ${msg}`, 'error');
  }
}
