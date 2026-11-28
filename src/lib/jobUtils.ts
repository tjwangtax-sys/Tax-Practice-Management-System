import { ClientRecord, JobModule, JobType, TaxJob } from '../types/tpms';
import {
  addCalendarDays,
  addMonthsToFyeEnd,
  analyzeJobDeadlines,
  applyMalaysianJobRules,
  ApplyJobRulesOptions,
  computeDefaultStatutoryDeadline,
  createDefaultComplianceChecklist,
  DeadlineAnalysis,
  DeadlineRuleSource,
  EarlierLhdnEotWarning,
  extractFyeMonth,
  extractYaYear,
  formatDateDDMMYYYY,
  formatDisplayDate,
  getLatestSsmEot,
  getShortDeadlineRule,
  inferModuleFromJobType,
  isFormCJob,
  isFormCSubmittedStatus,
  isIsoDateString,
  isMitrsCompletedStatus,
  JobRuleInput,
  latestIsoDate,
  normalizeComplianceChecklist,
  SsmEotInfo,
} from './deadlineUtils';

export {
  addCalendarDays,
  addMonthsToFyeEnd,
  analyzeJobDeadlines,
  applyMalaysianJobRules,
  computeDefaultStatutoryDeadline,
  createDefaultComplianceChecklist,
  extractFyeMonth,
  extractYaYear,
  formatDateDDMMYYYY,
  formatDisplayDate,
  getLatestSsmEot,
  getShortDeadlineRule,
  inferModuleFromJobType,
  isFormCJob,
  isFormCSubmittedStatus,
  isIsoDateString,
  isMitrsCompletedStatus,
  latestIsoDate,
  normalizeComplianceChecklist,
};

export type {
  ApplyJobRulesOptions,
  DeadlineAnalysis,
  DeadlineRuleSource,
  EarlierLhdnEotWarning,
  JobRuleInput,
  SsmEotInfo,
};

export type DeadlineStage = 'Normal' | '1st EOT' | '2nd EOT' | '3rd EOT';

export interface ClientLookupMap {
  byDocId: Map<string, ClientRecord>;
  byClientId: Map<string, ClientRecord>;
}

/**
 * Normalizes a Client ID for reliable cross-record matching (e.g. "C 233" -> "C233").
 */
export function normalizeClientIdKey(id?: string | null): string {
  return (id ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Builds fast lookup maps from Client Master keyed by Firestore doc ID and normalized Client ID.
 */
export function buildClientLookupMap(clients: ClientRecord[]): ClientLookupMap {
  const byDocId = new Map<string, ClientRecord>();
  const byClientId = new Map<string, ClientRecord>();
  for (const c of clients) {
    if (c.id) byDocId.set(c.id, c);
    const normId = normalizeClientIdKey(c.clientId);
    if (normId && !byClientId.has(normId)) {
      byClientId.set(normId, c);
    }
  }
  return { byDocId, byClientId };
}

/**
 * Finds the matching Client Master record for a job using clientDocId or normalized clientId ("C 233" === "C233").
 */
export function findMatchedClient(
  job: { clientDocId?: string; clientId?: string },
  lookup: ClientLookupMap
): ClientRecord | undefined {
  if (job.clientDocId) {
    const byDoc = lookup.byDocId.get(job.clientDocId);
    if (byDoc) return byDoc;
  }
  const normId = normalizeClientIdKey(job.clientId);
  if (normId) {
    return lookup.byClientId.get(normId);
  }
  return undefined;
}

/**
 * Resolves a job's effective FYE string from job.fye -> job.companyFye -> matchedClient.fye.
 */
export function resolveJobDisplayFye(
  job: Pick<TaxJob, 'fye' | 'companyFye' | 'clientDocId' | 'clientId'>,
  lookup: ClientLookupMap
): string {
  const ownFye = (job.fye ?? '').trim();
  if (ownFye) return ownFye;

  const legacyCompanyFye = (job.companyFye ?? '').trim();
  if (legacyCompanyFye) return legacyCompanyFye;

  const matchedClient = findMatchedClient(job, lookup);
  return (matchedClient?.fye ?? '').trim();
}

/**
 * Original Statutory Deadline (+7 Months): end of the 7th month after FYE.
 */
export function computeOriginalStatutoryDeadline(
  ya?: string,
  fye?: string,
  module: JobModule = 'Corporate',
  jobType?: JobType
): string {
  const yaYear = extractYaYear(ya) ?? extractYaYear(fye);
  if (!yaYear) return '';
  if (jobType === 'Form C' || (module === 'Corporate' && (!jobType || jobType === 'MITRS'))) {
    const fyeMonth = extractFyeMonth(fye);
    if (!fyeMonth) return '';
    return addMonthsToFyeEnd(yaYear, fyeMonth, 7);
  }
  return computeDefaultStatutoryDeadline(module, jobType, String(yaYear), fye);
}

/**
 * Normal E-Filing Deadline (+8 Months): end of the 8th month after FYE.
 */
export function computeNormalEfilingDeadline(ya?: string, fye?: string): string {
  const yaYear = extractYaYear(ya) ?? extractYaYear(fye);
  const fyeMonth = extractFyeMonth(fye);
  if (!yaYear || !fyeMonth) return '';
  return addMonthsToFyeEnd(yaYear, fyeMonth, 8);
}

/**
 * MITRS Applicable Deadline: Final Applicable Deadline + 30 calendar days.
 */
export function computeMitrsApplicableDeadline(finalApplicableDeadline?: string | null): string {
  if (!finalApplicableDeadline || !isIsoDateString(finalApplicableDeadline)) return '';
  return addCalendarDays(finalApplicableDeadline, 30);
}

/**
 * Parses common date strings (YYYY-MM-DD, YYYY-MM-DDTHH:mm..., YYYY-M-D, DD/MM/YYYY) into UTC midnight ms.
 */
function parseFlexibleDateUtcMs(raw?: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY-M-D (with optional ISO time suffix)
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return Date.UTC(y, m - 1, d);
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return Date.UTC(y, m - 1, d);
    }
  }

  return null;
}

/**
 * Computes exact overdue calendar days when status !== 'Completed' and today > finalDeadline.
 * Returns 0 when completed, not overdue, or deadline is empty/invalid.
 */
export function getOverdueDays(
  finalDeadline?: string | null,
  status?: string | null,
  todayIso?: string
): number {
  const normalizedStatus = (status ?? '').trim().toLowerCase();
  if (normalizedStatus === 'completed') return 0;

  const dueMs = parseFlexibleDateUtcMs(finalDeadline);
  if (dueMs === null) return 0;

  const todayMs =
    parseFlexibleDateUtcMs(todayIso) ??
    (() => {
      const now = new Date();
      return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    })();

  if (todayMs <= dueMs) return 0;

  const diffDays = Math.floor((todayMs - dueMs) / 86_400_000);
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Formats the Overdue [N]d label (e.g. "Overdue 1063d"), or empty string when not overdue.
 */
export function formatOverdueLabel(overdueDays: number): string {
  return overdueDays > 0 ? `Overdue ${overdueDays}d` : '';
}

/**
 * Maps winning rule into canonical stage badge: Normal, 1st EOT, 2nd EOT, or 3rd EOT.
 */
export function getDeadlineStageBadge(winningRule: DeadlineRuleSource): DeadlineStage | null {
  return getShortDeadlineRule(winningRule);
}

/**
 * Tailwind pill classes for Final Deadline stage badges.
 */
export function getStagePillClasses(stage: DeadlineStage | null): string {
  switch (stage) {
    case '1st EOT':
      return 'bg-sky-100 text-sky-800 border border-sky-200';
    case '2nd EOT':
      return 'bg-amber-100 text-amber-800 border border-amber-200';
    case '3rd EOT':
      return 'bg-purple-100 text-purple-800 border border-purple-200';
    case 'Normal':
    default:
      return 'bg-teal-50 text-teal-800 border border-teal-200';
  }
}

/**
 * Tailwind pill classes for SSM EOT badges (visually distinct reference-only styling).
 */
export function getSsmEotPillClasses(stage: '1st EOT' | '2nd EOT' | '3rd EOT' | null): string {
  switch (stage) {
    case '1st EOT':
      return 'bg-slate-100 text-slate-700 border border-slate-200';
    case '2nd EOT':
      return 'bg-amber-50 text-amber-800 border border-amber-200';
    case '3rd EOT':
      return 'bg-orange-100 text-orange-800 border border-orange-200';
    default:
      return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}

/**
 * Tailwind pill classes for Form C / MITRS sub-status pills.
 */
export function getSubmissionStatusPillClasses(status?: string | null): string {
  const norm = (status ?? '').trim().toLowerCase();
  if (!norm) return 'bg-slate-100 text-slate-500 border border-slate-200';
  if (
    norm === 'submitted' ||
    norm === 'completed' ||
    norm === 'self-submit' ||
    norm === 'self submit'
  ) {
    return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  }
  if (norm === 'client approval') {
    return 'bg-violet-100 text-violet-800 border border-violet-200';
  }
  if (norm === 'manager review') {
    return 'bg-amber-100 text-amber-800 border border-amber-200';
  }
  if (norm === 'prepared') {
    return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
  }
  if (norm === 'in progress') {
    return 'bg-sky-100 text-sky-800 border border-sky-200';
  }
  if (norm === 'not applicable' || norm === 'n/a') {
    return 'bg-slate-100 text-slate-500 border border-slate-200';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

/**
 * Tailwind pill classes for YA Sequence (1st, 2nd, 3rd, etc.) badges.
 */
export function getYaSequencePillClasses(seq?: string | null): string {
  const norm = (seq ?? '').trim().toLowerCase();
  if (norm.startsWith('1')) {
    return 'bg-sky-100 text-sky-800 border border-sky-200';
  }
  if (norm.startsWith('2')) {
    return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
  }
  if (norm.startsWith('3')) {
    return 'bg-violet-100 text-violet-800 border border-violet-200';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

/**
 * Canonical Audit Type options for Corporate & All Jobs.
 */
export const AUDIT_TYPE_OPTIONS = ['Audited', 'Unaudited', 'EPC'] as const;

/**
 * Tailwind pill classes for Audit Type badges (Audited, Unaudited, EPC).
 */
export function getAuditTypePillClasses(auditType?: string | null): string {
  const norm = (auditType ?? '').trim().toLowerCase();
  if (norm === 'audited') {
    return 'bg-sky-50 text-sky-800 border border-sky-200';
  }
  if (norm === 'unaudited') {
    return 'bg-amber-50 text-amber-800 border border-amber-200';
  }
  if (norm === 'epc') {
    return 'bg-purple-50 text-purple-800 border border-purple-200';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

/**
 * Extracts Unaudited or EPC from legacy Job Remarks and strips standalone tags cleanly
 * so remarks remain focused on substantive notes.
 */
export function extractAuditTypeFromRemarks(remarks?: string | null): {
  auditType: 'Unaudited' | 'EPC' | '';
  cleanedRemarks: string;
} {
  const raw = remarks ?? '';
  if (!raw.trim()) {
    return { auditType: '', cleanedRemarks: '' };
  }

  let detected: 'Unaudited' | 'EPC' | '' = '';
  if (/\bunaudited\b/i.test(raw)) {
    detected = 'Unaudited';
  } else if (/\bepc\b/i.test(raw)) {
    detected = 'EPC';
  }

  if (!detected) {
    return { auditType: '', cleanedRemarks: raw };
  }

  const tagPattern = detected === 'Unaudited' ? 'unaudited' : 'epc';
  const bracketedRe = new RegExp(`[(\\[{]\\s*${tagPattern}\\s*[)\\]}]`, 'gi');
  const delimitedRe = new RegExp(
    `(^|[,;/|\\-–—:])\\s*\\b${tagPattern}\\b\\s*(?=[,;/|\\-–—:.]|$)`,
    'gi'
  );
  const leadingRe = new RegExp(`^\\s*\\b${tagPattern}\\b\\s*(?:[,;/|\\-–—:.]+\\s*)?`, 'i');
  const trailingRe = new RegExp(`(?:\\s*[,;/|\\-–—:.]+)?\\s*\\b${tagPattern}\\b\\s*$`, 'i');

  const cleanedLines = raw
    .split(/\r?\n/)
    .map((line) => {
      let s = line.replace(bracketedRe, ' ');
      s = s.replace(delimitedRe, '$1');
      s = s.replace(leadingRe, '');
      s = s.replace(trailingRe, '');
      // Collapse duplicate adjacent separators left behind after stripping the tag
      s = s.replace(/([,;/|\-–—])\s*([,;/|\-–—])+/g, '$1 ');
      // Trim dangling punctuation/separators and normalize internal spaces
      s = s.replace(/^[\s,;/|\-–—:]+/, '').replace(/[\s,;/|\-–—:]+$/, '');
      s = s.replace(/\s{2,}/g, ' ').trim();
      return s;
    })
    .filter(Boolean);

  return {
    auditType: detected,
    cleanedRemarks: cleanedLines.join('\n'),
  };
}

/**
 * Normalizes a two-digit FYE month string ("01".."12") when possible.
 */
export function normalizeFyeMonthString(fye?: string | null): string {
  const m = extractFyeMonth(fye);
  if (m === null) return (fye ?? '').trim();
  return String(m).padStart(2, '0');
}

export interface RecomputeJobResult {
  payload: JobRuleInput;
  changed: boolean;
  fyeBackfilled: boolean;
  auditTypeBackfilled: boolean;
  deadlinesChanged: boolean;
  statusChanged: boolean;
  markedCompleted: boolean;
  auditRemark: string;
}

/**
 * Recomputes a single TaxJob record:
 * 1. Resolves FYE via job.fye || job.companyFye || matchedClient.fye (using normalized Client ID matching)
 *    and writes the resolved fye directly onto the job document.
 * 2. Backfills auditType (Unaudited / EPC) from Job Remarks when auditType is blank and strips
 *    standalone Unaudited / EPC tags from remarks.
 * 3. Recalculates Original Statutory (+7m), Normal E-Filing (+8m), Final Applicable Deadline
 *    (Normal +8m or latest LHDN EOT 1–3, strictly excluding SSM EOT 1–3), and MITRS (+30d).
 * 4. Marks jobs with both Form C & MITRS submitted as Completed (and Form C submitted / MITRS pending as Pending MITRS).
 */
export function recomputeJobDeadlinesAndStatus(
  job: TaxJob,
  clientLookup: ClientLookupMap
): RecomputeJobResult {
  const matchedClient = findMatchedClient(job, clientLookup);
  const rawStoredFye = (job.fye ?? '').trim();
  const resolvedDisplayFye = resolveJobDisplayFye(job, clientLookup);

  const resolvedMonth = extractFyeMonth(resolvedDisplayFye);
  const nextFye =
    resolvedMonth !== null
      ? String(resolvedMonth).padStart(2, '0')
      : resolvedDisplayFye;

  const fyeBackfilled = Boolean(!rawStoredFye && nextFye);

  const existingAuditType = (job.auditType ?? '').trim();
  let nextAuditType = existingAuditType;
  let nextRemarks = job.remarks ?? '';
  let auditTypeBackfilled = false;

  if (!existingAuditType) {
    const extracted = extractAuditTypeFromRemarks(job.remarks);
    if (extracted.auditType) {
      nextAuditType = extracted.auditType;
      nextRemarks = extracted.cleanedRemarks;
      auditTypeBackfilled = true;
    }
  }

  const {
    id: _id,
    createdBy: _cb,
    updatedBy: _ub,
    createdAt: _ca,
    updatedAt: _ua,
    ...rest
  } = job;

  const baseInput: JobRuleInput = {
    ...rest,
    fye: nextFye,
    auditType: nextAuditType,
    remarks: nextRemarks,
    clientDocId: job.clientDocId || matchedClient?.id || '',
  };

  const computed = applyMalaysianJobRules(baseInput, {
    forceRecomputeBaseDeadlines: true,
    applySubmissionAutoStatus: true,
  });

  // Ensure statusDate is stamped when transitioning to Completed or Pending MITRS
  const prevStatus = (job.status || '').trim();
  const nextStatus = (computed.status || '').trim();
  const statusChanged = prevStatus !== nextStatus;
  const markedCompleted =
    statusChanged && nextStatus.toLowerCase() === 'completed';

  if (markedCompleted && !computed.statusDate) {
    computed.statusDate =
      (isIsoDateString(computed.mitrsSubmissionDate) ? computed.mitrsSubmissionDate : '') ||
      (isIsoDateString(computed.formCSubmissionDate) ? computed.formCSubmissionDate : '') ||
      computed.completedDate ||
      new Date().toISOString().slice(0, 10);
  } else if (statusChanged && !computed.statusDate) {
    computed.statusDate = new Date().toISOString().slice(0, 10);
  }

  const deadlinesChanged =
    (job.originalStatutoryDeadline ?? '') !== (computed.originalStatutoryDeadline ?? '') ||
    (job.formCDueDate ?? '') !== (computed.formCDueDate ?? '') ||
    (job.finalApplicableDeadline ?? '') !== (computed.finalApplicableDeadline ?? '') ||
    (job.mitrsDueDate ?? '') !== (computed.mitrsDueDate ?? '') ||
    (job.dueDate ?? '') !== (computed.dueDate ?? '');

  const changed =
    fyeBackfilled ||
    auditTypeBackfilled ||
    rawStoredFye !== (computed.fye ?? '') ||
    deadlinesChanged ||
    statusChanged ||
    (job.completedDate ?? '') !== (computed.completedDate ?? '') ||
    (job.statusDate ?? '') !== (computed.statusDate ?? '');

  const notes: string[] = [];
  if (fyeBackfilled) notes.push(`FYE persisted from Client Master (${nextFye})`);
  if (auditTypeBackfilled) notes.push(`Audit Type backfilled (${nextAuditType}) from remarks`);
  if (deadlinesChanged) notes.push('deadlines recalculated');
  if (markedCompleted) notes.push('marked Completed (Form C Submitted + MITRS Submitted / Self-Submit)');
  else if (statusChanged) notes.push(`status updated to ${nextStatus}`);

  return {
    payload: computed,
    changed,
    fyeBackfilled,
    auditTypeBackfilled,
    deadlinesChanged,
    statusChanged,
    markedCompleted,
    auditRemark:
      notes.length > 0
        ? `Batch Re-compute: ${notes.join('; ')}`
        : 'Batch Re-compute Deadlines & Status',
  };
}
