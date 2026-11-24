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
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
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
 * Computes default original statutory deadline for Individual & Form E when blank.
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

/**
 * Applies Malaysian Statutory Deadline & Status Rules deterministically to a job payload.
 *
 * Rules:
 * 1. Form C (jobType === 'Form C' or module === 'Corporate' with Form C):
 *    - originalStatutoryDeadline = FYE + 7 months
 *    - formCDueDate = FYE + 8 months
 *    - finalApplicableDeadline = latest(formCDueDate, lhdnEot1, lhdnEot2, lhdnEot3) [EXCLUDING ssmEot1..3]
 *    - mitrsDueDate = finalApplicableDeadline + 30 calendar days
 *    - status = 'Completed' ONLY when BOTH formCStatus === 'Submitted' AND mitrsStatus === 'Submitted'
 * 2. Individual & Form E:
 *    - finalApplicableDeadline = latest(originalStatutoryDeadline, lhdnEot1, lhdnEot2, lhdnEot3)
 * 3. Ad Hoc:
 *    - finalApplicableDeadline = internalDeadline
 */
export function applyMalaysianJobRules(input: JobRuleInput): JobRuleInput {
  const next: JobRuleInput = {
    ...input,
    complianceChecklist: normalizeComplianceChecklist(input.complianceChecklist),
  };

  const yaYear = extractYaYear(next.ya);
  const fyeMonth = extractFyeMonth(next.fye);
  const isFormC =
    next.jobType === 'Form C' || (next.module === 'Corporate' && !next.jobType);

  if (isFormC) {
    if (yaYear && fyeMonth) {
      next.originalStatutoryDeadline = addMonthsToFyeEnd(yaYear, fyeMonth, 7);
      next.formCDueDate = addMonthsToFyeEnd(yaYear, fyeMonth, 8);
    }

    // Strictly exclude ssmEot1..3 (reference-only)
    next.finalApplicableDeadline = latestIsoDate([
      next.formCDueDate,
      next.lhdnEot1,
      next.lhdnEot2,
      next.lhdnEot3,
    ]);

    next.mitrsDueDate = next.finalApplicableDeadline
      ? addCalendarDays(next.finalApplicableDeadline, 30)
      : '';

    const formCSubmitted = (next.formCStatus || '').trim().toLowerCase() === 'submitted';
    const mitrsSubmitted = (next.mitrsStatus || '').trim().toLowerCase() === 'submitted';

    if (formCSubmitted && mitrsSubmitted) {
      next.status = 'Completed';
      if (!next.completedDate) {
        next.completedDate =
          latestIsoDate([next.formCSubmissionDate, next.mitrsSubmissionDate]) ||
          new Date().toISOString().slice(0, 10);
      }
    } else if (next.status === 'Completed') {
      // Prevent premature Completed status when either Form C or MITRS is not Submitted
      next.status = formCSubmitted || mitrsSubmitted ? 'Submitted to LHDN' : 'In Progress';
    }
  } else if (next.module === 'Individual' || next.module === 'Form E') {
    if (!next.originalStatutoryDeadline) {
      next.originalStatutoryDeadline = computeDefaultStatutoryDeadline(
        next.module,
        next.jobType,
        next.ya,
        next.fye
      );
    }
    next.finalApplicableDeadline = latestIsoDate([
      next.originalStatutoryDeadline,
      next.lhdnEot1,
      next.lhdnEot2,
      next.lhdnEot3,
    ]);
  } else if (next.module === 'Ad Hoc') {
    next.finalApplicableDeadline = (next.internalDeadline || '').trim();
  } else if (!next.finalApplicableDeadline) {
    next.finalApplicableDeadline = latestIsoDate([
      next.originalStatutoryDeadline,
      next.lhdnEot1,
      next.lhdnEot2,
      next.lhdnEot3,
      next.internalDeadline,
    ]);
  }

  // Keep dueDate synchronized with finalApplicableDeadline so Calendar/Dashboard/Overdue views stay accurate
  if (next.finalApplicableDeadline) {
    next.dueDate = next.finalApplicableDeadline;
  }

  return next;
}
