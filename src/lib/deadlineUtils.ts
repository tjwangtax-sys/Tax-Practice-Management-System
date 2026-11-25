import {
  COMPLIANCE_CHECKLIST_STEPS,
  ComplianceChecklistItem,
  JobModule,
  JobType,
  TaxJob,
} from '../types/tpms';

/**
 * Formats a UTC Date as YYYY-MM-DD.
 */
function formatIsoUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses a YYYY-MM-DD string strictly into a UTC Date.
 */
function parseIsoDate(str?: string | null): Date | null {
  if (!str) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Formats an ISO YYYY-MM-DD date into readable Malaysian format e.g. "31 Aug 2027".
 */
export function formatDisplayDate(isoDate?: string | null): string {
  const dt = parseIsoDate(isoDate);
  if (!dt) return '';
  return dt.toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Formats an ISO YYYY-MM-DD date or Firestore Timestamp / Date into DD/MM/YYYY.
 */
export function formatDateDDMMYYYY(
  val?: string | Date | { toDate?: () => Date } | null
): string {
  if (!val) return '—';
  if (typeof val === 'string') {
    const dt = parseIsoDate(val);
    if (!dt) return '—';
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dt.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const dateObj = val instanceof Date ? val : typeof val.toDate === 'function' ? val.toDate() : null;
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '—';
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Validates whether a string is a clean YYYY-MM-DD ISO date.
 */
export function isIsoDateString(str?: string | null): boolean {
  return parseIsoDate(str) !== null;
}

/**
 * Extracts a 4-digit YA year (e.g. "2025" from "2025" or "YA 2025").
 */
export function extractYaYear(ya?: string | null): number | null {
  if (!ya) return null;
  const match = /(\d{4})/.exec(ya);
  if (!match) return null;
  const yr = Number(match[1]);
  return yr >= 1990 && yr <= 2100 ? yr : null;
}

/**
 * Extracts a 1..12 month from FYE string ("01".."12" or "YYYY-MM-DD").
 */
export function extractFyeMonth(fye?: string | null): number | null {
  if (!fye) return null;
  const trimmed = fye.trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    const m = Number(trimmed);
    return m >= 1 && m <= 12 ? m : null;
  }
  const iso = parseIsoDate(trimmed);
  if (iso) return iso.getUTCMonth() + 1;
  return null;
}

/**
 * Adds N months to the last day of (year, month1Based) and returns the last day of the target month.
 * Example: YA 2025, FYE 12 + 7 months => 2026-07-31; + 8 months => 2026-08-31.
 */
export function addMonthsToFyeEnd(year: number, fyeMonth1Based: number, monthsToAdd: number): string {
  // Day 0 of (monthIndex + monthsToAdd + 1) is the last calendar day of (monthIndex + monthsToAdd)
  const dt = new Date(Date.UTC(year, fyeMonth1Based - 1 + monthsToAdd + 1, 0));
  return formatIsoUtc(dt);
}

/**
 * Adds N calendar days to an ISO YYYY-MM-DD date string.
 */
export function addCalendarDays(isoDate?: string | null, days = 30): string {
  const dt = parseIsoDate(isoDate);
  if (!dt) return '';
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatIsoUtc(dt);
}

/**
 * Returns the latest (maximum) valid YYYY-MM-DD date among the candidates.
 */
export function latestIsoDate(dates: Array<string | undefined | null>): string {
  const valid = dates
    .map((d) => (d ?? '').trim())
    .filter((d) => isIsoDateString(d));
  if (valid.length === 0) return '';
  return valid.reduce((max, curr) => (curr > max ? curr : max), valid[0]);
}

/**
 * Maps a JobType to its canonical JobModule.
 */
export function inferModuleFromJobType(jobType: JobType, fallback: JobModule = 'Corporate'): JobModule {
  switch (jobType) {
    case 'Form C':
    case 'MITRS':
      return 'Corporate';
    case 'Form B':
    case 'Form BE':
    case 'Form M':
    case 'Form P':
      return 'Individual';
    case 'Form E':
      return 'Form E';
    case 'CP204':
    case 'CP204A':
    case 'CP204B':
      return 'CP204';
    case 'Tax Audit':
    case 'RPGT / CKHT':
    case 'Tax Appeal':
    case 'Tax Refund':
    case 'Tax Residency':
    case 'Other':
      return fallback === 'Individual' ? 'Individual' : 'Ad Hoc';
    default:
      return fallback;
  }
}

/**
 * Builds the default 7-step Malaysian tax compliance checklist.
 */
export function createDefaultComplianceChecklist(): ComplianceChecklistItem[] {
  return COMPLIANCE_CHECKLIST_STEPS.map((step) => ({
    step,
    status: 'Pending',
    completedDate: '',
    remarks: '',
  }));
}

/**
 * Ensures any saved checklist always contains all 7 canonical steps.
 */
export function normalizeComplianceChecklist(
  existing?: ComplianceChecklistItem[]
): ComplianceChecklistItem[] {
  const byStep = new Map<string, ComplianceChecklistItem>();
  for (const item of existing ?? []) {
    if (item && item.step) {
      byStep.set(item.step, {
        step: item.step,
        status:
          item.status === 'Completed' || item.status === 'Not Applicable'
            ? item.status
            : 'Pending',
        completedDate: item.completedDate ?? '',
        remarks: item.remarks ?? '',
      });
    }
  }
  return COMPLIANCE_CHECKLIST_STEPS.map(
    (step) =>
      byStep.get(step) ?? {
        step,
        status: 'Pending',
        completedDate: '',
        remarks: '',
      }
  );
}

/**
 * Computes default original statutory deadline for Form C, Individual & Form E.
 */
export function computeDefaultStatutoryDeadline(
  module: JobModule,
  jobType: JobType | undefined,
  ya?: string,
  fye?: string
): string {
  const yaYear = extractYaYear(ya);
  if (!yaYear) return '';

  if (jobType === 'Form C' || (module === 'Corporate' && (!jobType || jobType === 'MITRS'))) {
    const fyeMonth = extractFyeMonth(fye);
    if (!fyeMonth) return '';
    return addMonthsToFyeEnd(yaYear, fyeMonth, 7);
  }

  if (module === 'Form E' || jobType === 'Form E') {
    return `${yaYear + 1}-03-31`;
  }

  if (jobType === 'Form BE') {
    return `${yaYear + 1}-04-30`;
  }

  if (jobType === 'Form B' || jobType === 'Form P' || jobType === 'Form M' || module === 'Individual') {
    return `${yaYear + 1}-06-30`;
  }

  return '';
}

export type JobRuleInput = Omit<
  TaxJob,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

export interface ApplyJobRulesOptions {
  /**
   * When true, recalculates Original Statutory Deadline (+7m / statutory default)
   * and Normal e-Filing Deadline (+8m) from YA + FYE + Job Type, overriding any
   * manual edits. Leave false to preserve manual overrides while still updating
   * Final Applicable Deadline, MITRS Due Date, and completion status.
   */
  forceRecomputeBaseDeadlines?: boolean;
}

export type DeadlineRuleSource =
  | 'Normal (+8m)'
  | 'Statutory'
  | 'Internal'
  | '1st EOT'
  | '2nd EOT'
  | '3rd EOT'
  | null;

export interface EarlierLhdnEotWarning {
  label: '1st EOT' | '2nd EOT' | '3rd EOT';
  field: 'lhdnEot1' | 'lhdnEot2' | 'lhdnEot3';
  date: string;
}

export interface DeadlineAnalysis {
  isFormC: boolean;
  baseLabel: 'Normal (+8m)' | 'Statutory' | 'Internal';
  baseDeadline: string;
  finalApplicableDeadline: string;
  mitrsApplicableDeadline: string;
  winningRule: DeadlineRuleSource;
  earlierLhdnEots: EarlierLhdnEotWarning[];
}

export interface SsmEotInfo {
  date: string;
  label: '1st EOT' | '2nd EOT' | '3rd EOT' | null;
}

/**
 * Returns the latest valid SSM EOT date among ssmEot1, ssmEot2, ssmEot3 and its corresponding EOT pill label.
 */
export function getLatestSsmEot(job: {
  ssmEot1?: string;
  ssmEot2?: string;
  ssmEot3?: string;
}): SsmEotInfo {
  const candidates: Array<{ date: string; label: '1st EOT' | '2nd EOT' | '3rd EOT' }> = [
    { date: (job.ssmEot1 ?? '').trim(), label: '1st EOT' },
    { date: (job.ssmEot2 ?? '').trim(), label: '2nd EOT' },
    { date: (job.ssmEot3 ?? '').trim(), label: '3rd EOT' },
  ];
  let best: SsmEotInfo = { date: '', label: null };
  for (const c of candidates) {
    if (!isIsoDateString(c.date)) continue;
    if (!best.date || c.date >= best.date) {
      best = { date: c.date, label: c.label };
    }
  }
  return best;
}

/**
 * Maps a DeadlineRuleSource to the compact table badge label ("Normal", "1st EOT", "2nd EOT", "3rd EOT").
 */
export function getShortDeadlineRule(
  winningRule: DeadlineRuleSource
): 'Normal' | '1st EOT' | '2nd EOT' | '3rd EOT' | null {
  if (!winningRule) return null;
  if (winningRule === '1st EOT' || winningRule === '2nd EOT' || winningRule === '3rd EOT') {
    return winningRule;
  }
  return 'Normal';
}

export function isFormCJob(job: { module?: JobModule; jobType?: JobType }): boolean {
  return job.jobType === 'Form C' || (job.module === 'Corporate' && !job.jobType);
}

/**
 * Analyzes a job's deadlines to determine:
 * - The base deadline (Normal e-Filing +8m for Form C, Original Statutory for non-Form C, Internal for Ad Hoc)
 * - The Final Applicable Deadline (latest among base + LHDN EOT 1..3, strictly excluding SSM EOTs)
 * - Which rule won ("Normal (+8m)", "1st EOT", "2nd EOT", "3rd EOT", "Statutory", or "Internal")
 * - MITRS Applicable Deadline (Final Applicable Deadline + 30 calendar days)
 * - Any entered LHDN EOT dates that are earlier than the base deadline (amber warning)
 */
export function analyzeJobDeadlines(job: Partial<JobRuleInput>): DeadlineAnalysis {
  const formC = isFormCJob(job);
  const isAdHoc = job.module === 'Ad Hoc' && !formC;

  if (isAdHoc) {
    const internal = (job.internalDeadline ?? '').trim();
    const validInternal = isIsoDateString(internal) ? internal : '';
    return {
      isFormC: false,
      baseLabel: 'Internal',
      baseDeadline: validInternal,
      finalApplicableDeadline: validInternal,
      mitrsApplicableDeadline: validInternal ? addCalendarDays(validInternal, 30) : '',
      winningRule: validInternal ? 'Internal' : null,
      earlierLhdnEots: [],
    };
  }

  const normalEfiling = (job.formCDueDate ?? '').trim();
  const origStatutory = (job.originalStatutoryDeadline ?? '').trim();

  // For Form C: base is Normal e-Filing (+8m) (falling back to Original Statutory if +8m blank).
  // For non-Form C: base is Original Statutory Deadline (or Normal e-Filing if user explicitly populated it).
  const baseDeadline = formC
    ? isIsoDateString(normalEfiling)
      ? normalEfiling
      : isIsoDateString(origStatutory)
      ? origStatutory
      : ''
    : isIsoDateString(origStatutory)
    ? origStatutory
    : isIsoDateString(normalEfiling)
    ? normalEfiling
    : '';

  const baseLabel: 'Normal (+8m)' | 'Statutory' =
    formC || (!isIsoDateString(origStatutory) && isIsoDateString(normalEfiling))
      ? 'Normal (+8m)'
      : 'Statutory';

  const rawEotEntries: EarlierLhdnEotWarning[] = [
    { label: '1st EOT', field: 'lhdnEot1', date: (job.lhdnEot1 ?? '').trim() },
    { label: '2nd EOT', field: 'lhdnEot2', date: (job.lhdnEot2 ?? '').trim() },
    { label: '3rd EOT', field: 'lhdnEot3', date: (job.lhdnEot3 ?? '').trim() },
  ];
  const eotEntries = rawEotEntries.filter((entry) => isIsoDateString(entry.date));

  let finalDate = baseDeadline;
  let winningRule: DeadlineRuleSource = baseDeadline ? baseLabel : null;

  for (const eot of eotEntries) {
    if (!finalDate || eot.date > finalDate) {
      finalDate = eot.date;
      winningRule = eot.label;
    }
  }

  // Flag any entered LHDN EOT strictly earlier than the base deadline (Normal +8m / Statutory)
  const earlierLhdnEots: EarlierLhdnEotWarning[] = baseDeadline
    ? eotEntries.filter((eot) => eot.date < baseDeadline)
    : [];

  return {
    isFormC: formC,
    baseLabel,
    baseDeadline,
    finalApplicableDeadline: finalDate,
    mitrsApplicableDeadline: finalDate ? addCalendarDays(finalDate, 30) : '',
    winningRule,
    earlierLhdnEots,
  };
}

/**
 * Applies Malaysian Statutory Deadline & Status Rules deterministically to a job payload.
 *
 * Rules:
 * 1. Form C (jobType === 'Form C' or module === 'Corporate' with Form C):
 *    - originalStatutoryDeadline = YA + FYE + 7 months (auto-computed when blank or forced; editable override preserved)
 *    - formCDueDate = YA + FYE + 8 months (Normal e-Filing Deadline; auto-computed when blank or forced; editable override preserved)
 *    - finalApplicableDeadline = latest(formCDueDate, lhdnEot1, lhdnEot2, lhdnEot3) [EXCLUDING ssmEot1..3]
 *    - mitrsDueDate = finalApplicableDeadline + 30 calendar days
 *    - status = 'Completed' ONLY when BOTH formCStatus === 'Submitted' AND mitrsStatus === 'Submitted'
 * 2. Individual & Form E:
 *    - finalApplicableDeadline = latest(originalStatutoryDeadline, lhdnEot1, lhdnEot2, lhdnEot3)
 * 3. Ad Hoc:
 *    - finalApplicableDeadline = internalDeadline
 */
export function applyMalaysianJobRules(
  input: JobRuleInput,
  options: ApplyJobRulesOptions = {}
): JobRuleInput {
  const { forceRecomputeBaseDeadlines = false } = options;

  const next: JobRuleInput = {
    ...input,
    complianceChecklist: normalizeComplianceChecklist(input.complianceChecklist),
  };

  const yaYear = extractYaYear(next.ya);
  const fyeMonth = extractFyeMonth(next.fye);
  const formC = isFormCJob(next);

  if (formC) {
    if (yaYear && fyeMonth) {
      if (forceRecomputeBaseDeadlines || !isIsoDateString(next.originalStatutoryDeadline)) {
        next.originalStatutoryDeadline = addMonthsToFyeEnd(yaYear, fyeMonth, 7);
      }
      if (forceRecomputeBaseDeadlines || !isIsoDateString(next.formCDueDate)) {
        next.formCDueDate = addMonthsToFyeEnd(yaYear, fyeMonth, 8);
      }
    }

    const analysis = analyzeJobDeadlines(next);
    next.finalApplicableDeadline = analysis.finalApplicableDeadline;
    next.mitrsDueDate = analysis.mitrsApplicableDeadline;

    const formCSubmitted = (next.formCStatus || '').trim().toLowerCase() === 'submitted';
    const mitrsSubmitted = (next.mitrsStatus || '').trim().toLowerCase() === 'submitted';

    if (formCSubmitted && mitrsSubmitted) {
      next.status = 'Completed';
      if (!next.completedDate) {
        next.completedDate =
          latestIsoDate([next.mitrsSubmissionDate, next.formCSubmissionDate]) ||
          new Date().toISOString().slice(0, 10);
      }
    } else if (formCSubmitted && !mitrsSubmitted) {
      next.status = 'Pending MITRS';
      // Record status transition date for Pending MITRS (uses Form C submission date or today)
      if (!next.submissionDate) {
        next.submissionDate =
          (isIsoDateString(next.formCSubmissionDate) ? next.formCSubmissionDate : '') ||
          new Date().toISOString().slice(0, 10);
      }
      if (next.completedDate) {
        next.completedDate = '';
      }
    } else if (next.status === 'Completed') {
      // Prevent premature Completed status when Form C and MITRS are not both Submitted
      next.status = 'In Progress';
      if (next.completedDate) {
        next.completedDate = '';
      }
    } else if (next.status === 'Pending MITRS' && !next.submissionDate) {
      next.submissionDate = new Date().toISOString().slice(0, 10);
    }
  } else if (next.module === 'Individual' || next.module === 'Form E') {
    if (forceRecomputeBaseDeadlines || !isIsoDateString(next.originalStatutoryDeadline)) {
      next.originalStatutoryDeadline = computeDefaultStatutoryDeadline(
        next.module,
        next.jobType,
        next.ya,
        next.fye
      );
    }
    if (forceRecomputeBaseDeadlines) {
      next.formCDueDate = '';
    }
    const analysis = analyzeJobDeadlines(next);
    next.finalApplicableDeadline = analysis.finalApplicableDeadline;
  } else if (next.module === 'Ad Hoc') {
    if (forceRecomputeBaseDeadlines) {
      next.originalStatutoryDeadline = '';
      next.formCDueDate = '';
    }
    next.finalApplicableDeadline = (next.internalDeadline || '').trim();
  } else {
    if (forceRecomputeBaseDeadlines && yaYear && fyeMonth) {
      next.originalStatutoryDeadline = addMonthsToFyeEnd(yaYear, fyeMonth, 7);
      next.formCDueDate = addMonthsToFyeEnd(yaYear, fyeMonth, 8);
    }
    const analysis = analyzeJobDeadlines(next);
    next.finalApplicableDeadline =
      analysis.finalApplicableDeadline || (next.internalDeadline || '').trim();
    if (next.jobType === 'MITRS') {
      next.mitrsDueDate = analysis.mitrsApplicableDeadline;
    }
  }

  // Keep dueDate synchronized with finalApplicableDeadline so Calendar/Dashboard/Overdue views stay accurate
  if (next.finalApplicableDeadline) {
    next.dueDate = next.finalApplicableDeadline;
  }

  return next;
}
