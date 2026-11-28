import {
  ClientRecord,
  CP204_REVISION_STATUS_OPTIONS,
  CP204_SUBMISSION_STATUS_FALLBACK,
  Cp204Instalment,
  Cp204Record,
  Cp204Revision,
  Cp204RevisionMonth,
  Cp204RevisionStatus,
  Cp204Status,
  safeNum,
  TaxJob,
} from '../../types/tpms';
import { addCalendarDays, extractFyeMonth, extractYaYear } from '../../lib/deadlineUtils';
import { normalizeClientIdKey } from '../../lib/jobUtils';

export const CP204_SUBMISSION_FILTERS = [
  'Follow-up required',
  'Up to date',
  'On hold',
  'CP204 submitted; revisions not recorded',
  'CP204 record missing',
] as const;

export type Cp204SubmissionFilter = (typeof CP204_SUBMISSION_FILTERS)[number];

const REVISION_MONTH_ORDER: Record<Cp204RevisionMonth, number> = {
  '6': 6,
  '9': 9,
  '11': 11,
};

/**
 * Generates sequential IDs like CP204-0001, TAXPAY-0001, COR-0001.
 */
export function generateNextSequentialId(prefix: string, existingIds: string[]): string {
  const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  let maxNum = 0;
  for (const id of existingIds) {
    const m = regex.exec((id || '').trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Normalizes a CP204 initial submission status string while preserving all custom
 * Controlled Values (e.g. "SME Exempted", "NSME -Follow Up", "NSME -Inactive",
 * "NSME -Over Due", "Pending Submission", "Self-submit by Client", "Resigned").
 * Never coerces unrecognized non-empty statuses to "In Progress".
 */
export function normalizeCp204Status(
  raw: unknown,
  fallback: Cp204Status = 'In Progress'
): Cp204Status {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  const lower = s.toLowerCase().replace(/\s+/g, ' ');

  const exact = CP204_SUBMISSION_STATUS_FALLBACK.find((opt) => opt.toLowerCase() === lower);
  if (exact) return exact;

  if (
    lower === 'client self-submit' ||
    lower === 'client self submit' ||
    lower === 'self-submit' ||
    lower === 'self submit' ||
    lower === 'self-submit by client' ||
    lower === 'self submit by client' ||
    lower.includes('self-submit') ||
    lower.includes('self submit')
  ) {
    return 'Self-submit by Client';
  }
  if (lower === 'sme exempted' || lower === 'sme exempt') return 'SME Exempted';
  if (lower === 'pending submission') return 'Pending Submission';
  if (lower === 'submitted' || lower === 'filed') return 'Submitted';
  if (lower === 'in progress') return 'In Progress';
  if (lower === 'resigned') return 'Resigned';

  return s.slice(0, 100);
}

/**
 * Normalizes a CP204A revision status string (preserving "Self-submit by Client",
 * "SME Exempted", "NSME -*", "Reviewed - No Revision Required", "Pending", "Not Required",
 * and any custom Controlled Values verbatim without coercing to "In Progress").
 */
export function normalizeCp204RevisionStatus(
  raw: unknown,
  fallback: Cp204RevisionStatus = 'In Progress'
): Cp204RevisionStatus {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  const lower = s.toLowerCase().replace(/\s+/g, ' ');

  const exact = CP204_REVISION_STATUS_OPTIONS.find((opt) => opt.toLowerCase() === lower);
  if (exact) return exact;

  if (
    lower === 'client self-submit' ||
    lower === 'client self submit' ||
    lower === 'self-submit' ||
    lower === 'self submit' ||
    lower === 'self-submit by client' ||
    lower === 'self submit by client' ||
    lower.includes('self-submit') ||
    lower.includes('self submit')
  ) {
    return 'Self-submit by Client';
  }
  if (
    lower.includes('no revision') ||
    lower === 'reviewed - no revision required' ||
    lower === 'reviewed - no revision'
  ) {
    return 'Reviewed - No Revision Required';
  }
  if (lower === 'not required' || lower === 'n/a' || lower === 'na' || lower === 'not applicable') {
    return 'Not Required';
  }
  if (lower === 'sme exempted' || lower === 'sme exempt') return 'SME Exempted';
  if (lower === 'pending submission') return 'Pending Submission';
  if (lower === 'pending') return 'Pending';
  if (lower === 'pending review') return 'Pending Review';
  if (lower === 'submitted' || lower === 'filed') return 'Submitted';
  if (lower === 'approved') return 'Approved';
  if (lower === 'completed') return 'Completed';
  if (lower === 'on hold') return 'On Hold';
  if (lower === 'in progress') return 'In Progress';
  if (lower === 'resigned') return 'Resigned';

  return s.slice(0, 100);
}

/**
 * Returns true if a CP204A revision status is effective for deriving Current Estimated Tax
 * (Submitted, Approved, or Self-submit by Client).
 */
export function isEffectiveRevisionStatus(status?: string | null): boolean {
  const norm = (status || '').trim().toLowerCase();
  return (
    norm === 'submitted' ||
    norm === 'approved' ||
    norm === 'self-submit by client' ||
    norm === 'client self-submit' ||
    norm === 'self-submit' ||
    norm === 'self submit'
  );
}

/**
 * Normalizes CP204A revisions and deterministically computes variance = proposedEstimatedTax - previousEstimatedTax.
 */
export function normalizeCp204Revisions(revisions?: Cp204Revision[]): Cp204Revision[] {
  if (!Array.isArray(revisions)) return [];
  return revisions.slice(0, 20).map((r, idx) => {
    const prev = safeNum(r.previousEstimatedTax);
    const prop = safeNum(r.proposedEstimatedTax);
    const month: Cp204RevisionMonth =
      r.revisionMonth === '9' || r.revisionMonth === '11' ? r.revisionMonth : '6';
    return {
      revisionId: (r.revisionId || `REV-${month}-${idx + 1}`).trim().slice(0, 40),
      revisionMonth: month,
      previousEstimatedTax: prev,
      proposedEstimatedTax: prop,
      variance: Math.round((prop - prev) * 100) / 100,
      reason: (r.reason || '').trim().slice(0, 500),
      reviewStatus: normalizeCp204RevisionStatus(r.reviewStatus, 'In Progress'),
      pic: (r.pic || '').trim().slice(0, 120),
      reviewer: (r.reviewer || '').trim().slice(0, 120),
      submissionDeadline: (r.submissionDeadline || '').trim().slice(0, 20),
      submissionDate: (r.submissionDate || '').trim().slice(0, 20),
      acknowledgementUrl: (r.acknowledgementUrl || '').trim().slice(0, 500),
      remarks: (r.remarks || '').trim().slice(0, 1000),
    };
  });
}

/**
 * Derives currentEstimatedTax from originalEstimatedTax plus revisions ONLY when
 * reviewStatus is 'Submitted', 'Approved', or 'Self-submit by Client'.
 */
export function computeCp204CurrentEstimatedTax(
  originalEstimatedTax: number,
  revisions?: Cp204Revision[]
): number {
  let current = safeNum(originalEstimatedTax);
  const sorted = [...normalizeCp204Revisions(revisions)].sort(
    (a, b) => REVISION_MONTH_ORDER[a.revisionMonth] - REVISION_MONTH_ORDER[b.revisionMonth]
  );
  for (const rev of sorted) {
    if (isEffectiveRevisionStatus(rev.reviewStatus)) {
      current = safeNum(rev.proposedEstimatedTax);
    }
  }
  return current;
}

/**
 * Normalizes instalments and computes outstandingAmount = Math.max(0, amountDue - amountPaid).
 */
export function normalizeCp204Instalments(instalments?: Cp204Instalment[]): Cp204Instalment[] {
  if (!Array.isArray(instalments)) return [];
  return instalments.slice(0, 36).map((inst, idx) => {
    const due = Math.max(0, safeNum(inst.amountDue));
    const paid = Math.max(0, safeNum(inst.amountPaid));
    const outstanding = Math.max(0, Math.round((due - paid) * 100) / 100);
    return {
      instalmentId: (inst.instalmentId || `INST-${idx + 1}`).trim().slice(0, 40),
      instalmentNo: Math.max(1, Math.min(36, Math.round(safeNum(inst.instalmentNo || idx + 1)))),
      dueDate: (inst.dueDate || '').trim().slice(0, 20),
      amountDue: due,
      amountPaid: paid,
      paymentDate: (inst.paymentDate || '').trim().slice(0, 20),
      paymentReference: (inst.paymentReference || '').trim().slice(0, 80),
      paymentVerified: inst.paymentVerified === 'Yes' ? 'Yes' : 'No',
      outstandingAmount: outstanding,
      followUpStatus: (inst.followUpStatus || (outstanding === 0 && due > 0 ? 'Paid' : 'Pending'))
        .trim()
        .slice(0, 60),
      remarks: (inst.remarks || '').trim().slice(0, 500),
    };
  });
}

/**
 * Enforces instalment business rules:
 * - paymentDate is required if amountPaid > 0
 * - paymentVerified === 'Yes' is blocked unless amountPaid > 0 and paymentDate is filled
 */
export function validateCp204Instalments(instalments: Cp204Instalment[]): string | null {
  for (const inst of instalments) {
    const paid = safeNum(inst.amountPaid);
    const hasPaymentDate = Boolean((inst.paymentDate || '').trim());
    if (paid > 0 && !hasPaymentDate) {
      return `Instalment #${inst.instalmentNo}: Payment Date is required when Amount Paid is greater than 0.`;
    }
    if (inst.paymentVerified === 'Yes' && (paid <= 0 || !hasPaymentDate)) {
      return `Instalment #${inst.instalmentNo}: Payment cannot be marked Verified unless Amount Paid > 0 and Payment Date is filled.`;
    }
  }
  return null;
}

/**
 * Computes default 12-month Malaysian basis period & statutory CP204 due date
 * (30 days before basis period start per s.107C ITA 1967) from YA + FYE.
 */
export function computeCp204BasisDates(ya?: string, fye?: string): {
  basisPeriodStart: string;
  basisPeriodEnd: string;
  statutoryCp204DueDate: string;
} {
  const year = extractYaYear(ya);
  const fyeMonth = extractFyeMonth(fye);
  if (!year || !fyeMonth) {
    return { basisPeriodStart: '', basisPeriodEnd: '', statutoryCp204DueDate: '' };
  }
  const endDt = new Date(Date.UTC(year, fyeMonth, 0));
  const startDt = new Date(Date.UTC(year - 1, fyeMonth, 1));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;
  const basisPeriodStart = fmt(startDt);
  const basisPeriodEnd = fmt(endDt);
  const statutoryCp204DueDate = addCalendarDays(basisPeriodStart, -30);
  return { basisPeriodStart, basisPeriodEnd, statutoryCp204DueDate };
}

/**
 * Computes default revision submission deadline (end of 6th, 9th, or 11th month of basis period).
 */
export function computeRevisionDeadline(
  basisPeriodStart: string | undefined,
  month: Cp204RevisionMonth
): string {
  if (!basisPeriodStart || !/^\d{4}-\d{2}-\d{2}$/.test(basisPeriodStart)) return '';
  const [y, m] = basisPeriodStart.split('-').map(Number);
  const offset = Number(month);
  // End of Nth month from basisPeriodStart
  const target = new Date(Date.UTC(y, m - 1 + offset, 0));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(
    target.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * Generates a 12-month CP204 instalment schedule starting from the 2nd month of the basis period (due 15th of each month).
 */
export function generateTwelveCp204Instalments(
  basisPeriodStart: string | undefined,
  currentEstimatedTax: number
): Cp204Instalment[] {
  const total = Math.max(0, safeNum(currentEstimatedTax));
  const baseAmt = Math.floor((total / 12) * 100) / 100;
  const remainder = Math.round((total - baseAmt * 12) * 100) / 100;

  let startYear = new Date().getFullYear();
  let startMonth = 1;
  if (basisPeriodStart && /^\d{4}-\d{2}-\d{2}$/.test(basisPeriodStart)) {
    const parts = basisPeriodStart.split('-').map(Number);
    startYear = parts[0];
    startMonth = parts[1];
  }

  return Array.from({ length: 12 }, (_, idx) => {
    // 1st instalment due on 15th of 2nd month of basis period
    const dueDt = new Date(Date.UTC(startYear, startMonth - 1 + idx + 1, 15));
    const dueDate = `${dueDt.getUTCFullYear()}-${String(dueDt.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}-${String(dueDt.getUTCDate()).padStart(2, '0')}`;
    const amt = idx === 11 ? Math.round((baseAmt + remainder) * 100) / 100 : baseAmt;
    return {
      instalmentId: `INST-${String(idx + 1).padStart(2, '0')}`,
      instalmentNo: idx + 1,
      dueDate,
      amountDue: amt,
      amountPaid: 0,
      paymentDate: '',
      paymentReference: '',
      paymentVerified: 'No',
      outstandingAmount: amt,
      followUpStatus: 'Pending',
      remarks: '',
    };
  });
}

/**
 * Returns the latest revision matching a given month ('6' | '9' | '11').
 */
export function getRevisionForMonth(
  record: Cp204Record,
  month: Cp204RevisionMonth
): Cp204Revision | undefined {
  const matches = (record.revisions || []).filter((r) => r.revisionMonth === month);
  return matches.length > 0 ? matches[matches.length - 1] : undefined;
}

/**
 * Classifies a CP204 record into the summary Submission Status filter buckets.
 */
export function classifyCp204SubmissionStatus(
  record: Cp204Record,
  todayStr: string
): Exclude<Cp204SubmissionFilter, 'CP204 record missing'> {
  const statusNorm = (record.status || '').trim().toLowerCase();
  if (statusNorm === 'on hold') return 'On hold';

  if (
    statusNorm.includes('sme exempt') ||
    statusNorm.includes('inactive') ||
    statusNorm === 'resigned'
  ) {
    return 'Up to date';
  }

  const hasRevisionPending = (record.revisions || []).some((r) => {
    const revNorm = (r.reviewStatus || '').trim().toLowerCase();
    return (
      revNorm === 'in progress' ||
      revNorm === 'pending review' ||
      revNorm === 'pending submission' ||
      revNorm === 'pending' ||
      revNorm.includes('follow up') ||
      revNorm.includes('over due') ||
      revNorm.includes('overdue')
    );
  });
  const hasOverdueInstalment = (record.instalments || []).some(
    (inst) => inst.outstandingAmount > 0 && Boolean(inst.dueDate) && inst.dueDate < todayStr
  );

  if (
    statusNorm === 'in progress' ||
    statusNorm === 'pending review' ||
    statusNorm === 'pending submission' ||
    statusNorm.includes('follow up') ||
    statusNorm.includes('over due') ||
    statusNorm.includes('overdue') ||
    hasRevisionPending ||
    hasOverdueInstalment
  ) {
    return 'Follow-up required';
  }

  if (
    (statusNorm === 'submitted' ||
      statusNorm === 'self-submit by client' ||
      statusNorm === 'client self-submit' ||
      statusNorm === 'completed') &&
    (record.revisions || []).length === 0
  ) {
    return 'CP204 submitted; revisions not recorded';
  }

  return 'Up to date';
}

export type Cp204YaSequence = '1st' | '2nd' | '';

function normalizeFirstSecondSequence(raw?: string | null): Cp204YaSequence {
  const norm = (raw ?? '').trim().toLowerCase();
  if (!norm) return '';
  if (norm === '1' || norm.startsWith('1st') || norm.startsWith('first')) return '1st';
  if (norm === '2' || norm.startsWith('2nd') || norm.startsWith('second')) return '2nd';
  return '';
}

/**
 * Builds a fast lookup map of `normalizedClientId::yaYear` -> `'1st' | '2nd'`
 * from Corporate / Form C jobs that already have `yaSequence` recorded.
 */
export function buildCorporateJobYaSequenceMap(jobs: TaxJob[]): Map<string, '1st' | '2nd'> {
  const map = new Map<string, '1st' | '2nd'>();
  for (const job of jobs) {
    const seq = normalizeFirstSecondSequence(job.yaSequence);
    if (!seq) continue;
    const isCorp =
      job.module === 'Corporate' ||
      job.jobType === 'Form C' ||
      job.jobType === 'MITRS';
    const clientKey = normalizeClientIdKey(job.clientId);
    const yaYear = extractYaYear(job.ya);
    if (!clientKey || yaYear === null) continue;
    const mapKey = `${clientKey}::${yaYear}`;
    // Corporate / Form C jobs take priority over any other module
    if (isCorp || !map.has(mapKey)) {
      map.set(mapKey, seq);
    }
  }
  return map;
}

/**
 * Resolves whether a CP204 row (`clientId` + `ya`) is the company's 1st or 2nd YA by checking:
 *  1. The linked Client Master record (`firstYa` / `firstYA` and `secondYa`, or `firstYa + 1` for 2nd), and
 *  2. Any matching Corporate Job (`clientId` + `ya`) with `yaSequence` (`1st` or `2nd`) recorded.
 */
export function resolveCp204YaSequence(
  rowYa: string | undefined | null,
  matchedClient?: ClientRecord | null,
  corporateJobYaSeqMap?: Map<string, '1st' | '2nd'>,
  clientId?: string | null
): Cp204YaSequence {
  const yaYear = extractYaYear(rowYa);
  if (yaYear === null) return '';

  // 1. Check linked Client Master (firstYa / firstYA & secondYa)
  if (matchedClient) {
    const firstYaNum = extractYaYear(matchedClient.firstYa || matchedClient.firstYA);
    const secondYaNum = extractYaYear(matchedClient.secondYa);

    if (firstYaNum !== null && yaYear === firstYaNum) {
      return '1st';
    }
    if (
      (secondYaNum !== null && yaYear === secondYaNum) ||
      (firstYaNum !== null && yaYear === firstYaNum + 1)
    ) {
      return '2nd';
    }
  }

  // 2. Fallback to matching Corporate Job yaSequence (1st or 2nd)
  if (corporateJobYaSeqMap) {
    const effectiveClientId = clientId || matchedClient?.clientId || '';
    const clientKey = normalizeClientIdKey(effectiveClientId);
    if (clientKey) {
      const fromJob = corporateJobYaSeqMap.get(`${clientKey}::${yaYear}`);
      if (fromJob) return fromJob;
    }
  }

  return '';
}
