import * as XLSX from 'xlsx';
import { triggerBlobDownload } from '../../lib/exportUtils';
import { normalizeSettingGroup } from '../../lib/settingsDropdown';
import { showToast } from '../../lib/toast';
import {
  ClientCategory,
  CorrespondenceActionStatus,
  CorrespondenceCategory,
  CorrespondenceLetterType,
  CorrespondenceMethod,
  Cp204Instalment,
  Cp204Revision,
  Cp204RevisionMonth,
  Cp204RevisionStatus,
  Cp204Status,
  CP204_REVISION_STATUS_OPTIONS,
  FinanceInvoiceStatus,
  JobModule,
  JobType,
  StaffRole,
  TaxPaymentFollowUpStatus,
  TaxPaymentType,
  TaxPaymentVerificationStatus,
  WorkDoneFeeAllocation,
  WorkDonePricingMode,
  WorkDoneStatus,
} from '../../types/tpms';

export type ImportTargetKey =
  | 'clients'
  | 'jobs'
  | 'cp204'
  | 'cp204_revisions'
  | 'cp204_instalments'
  | 'taxPayments'
  | 'correspondence'
  | 'workDone'
  | 'workDone_allocations'
  | 'calendarEvents'
  | 'staff'
  | 'settings'
  | 'history';

export type ImportModeKey = 'full_combined' | ImportTargetKey;

/** Strict parent-before-child Firestore execution order for Full Combined Backup imports */
export const FULL_IMPORT_ORDER: ImportTargetKey[] = [
  'staff',
  'settings',
  'clients',
  'jobs',
  'cp204',
  'cp204_revisions',
  'cp204_instalments',
  'taxPayments',
  'correspondence',
  'workDone',
  'workDone_allocations',
  'calendarEvents',
  'history',
];

export const TEMPLATE_SHEET_NAMES: Record<ImportTargetKey, string> = {
  staff: 'Staff',
  settings: 'Settings',
  clients: 'Clients',
  jobs: 'Jobs',
  cp204: 'CP204 Master',
  cp204_revisions: 'CP204 Revisions',
  cp204_instalments: 'CP204 Instalments',
  taxPayments: 'Tax Payments',
  correspondence: 'Correspondence',
  workDone: 'Work Done',
  workDone_allocations: 'Work Done Fee Allocations',
  calendarEvents: 'Calendar',
  history: 'History',
};

export interface ImportTargetDefinition {
  key: ImportTargetKey;
  label: string;
  collection: string;
  isChildMerge?: boolean;
  parentCollection?: string;
  description: string;
  sampleFilenames: string[];
  templateHeaders: string[];
  previewColumns: Array<{ key: string; label: string }>;
}

export interface ParsedImportRow {
  rowNumber: number;
  docId: string;
  valid: boolean;
  reason?: string;
  note?: string;
  payload: Record<string, unknown>;
  preview: Record<string, string | number>;
  /** For child merge imports (cp204_revisions, cp204_instalments, workDone_allocations) */
  parentDocId?: string;
}

export const IMPORT_TARGETS: ImportTargetDefinition[] = [
  {
    key: 'clients',
    label: 'Client Master (clients)',
    collection: 'clients',
    description: 'All 40 Client Master fields (Corporate, Individual, Other). Uses Client ID as document ID.',
    sampleFilenames: ['clients.json', 'clients.xlsx', 'client_master.csv'],
    templateHeaders: [
      'Client ID', 'Client Name', 'Company No', 'TIN', 'FYE', 'Tax PIC', 'Category', 'Client Status',
      'SME Status', 'Tax Agent', 'MyTax Appointment', 'e-Invoice Status', 'SST Registered', 'SST No',
      'Email', 'Phone', 'Date of Incorporation', 'Date of Commencement Business', 'Date of Engagement',
      'Date of Resigned', 'Auditor', 'Account', 'E Number', 'Special Remarks', 'Person No', 'Relationship',
      'Engagement Status', 'Business Name', 'Business Type', 'Business SSM No', 'Business E Number',
      'Business Start Date', 'Business Status', '1st YA', '1st YA Status', '2nd YA', '2nd YA Status',
      'Group ID', 'Company Secretary', 'Registered Address',
      'Principal Activity 1', 'MSIC Code 1', 'Principal Activity 2', 'MSIC Code 2',
      'Principal Activity 3', 'MSIC Code 3',
    ],
    previewColumns: [
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientName', label: 'Client Name' },
      { key: 'category', label: 'Category' },
      { key: 'tin', label: 'TIN' },
      { key: 'fye', label: 'FYE' },
      { key: 'taxPic', label: 'Tax PIC' },
      { key: 'clientStatus', label: 'Status' },
    ],
  },
  {
    key: 'jobs',
    label: 'Tax Jobs Register (jobs)',
    collection: 'jobs',
    description: 'All 50 Jobs columns including Form C, MITRS, SSM/LHDN EOTs, Form E, and workflow dates.',
    sampleFilenames: ['jobs.json', 'jobs.xlsx', 'tax_jobs.csv'],
    templateHeaders: [
      'Job ID', 'Module', 'Job Type', 'Client ID', 'Client Name', 'Group ID', 'FYE', 'YA',
      'Tax PIC', 'Reviewer', 'Status', 'Priority', 'Internal Deadline', 'Original Statutory Deadline',
      'SSM EOT 1', 'SSM EOT 2', 'SSM EOT 3', 'LHDN EOT 1', 'LHDN EOT 2', 'LHDN EOT 3',
      'Final Applicable Deadline', 'Audit Type', 'Audit Book-In Date', 'Audit Report Received Date',
      'Form C Status', 'Form C Due Date', 'Form C Submission Date', 'Form C Submission Reference',
      'MITRS Status', 'MITRS Due Date', 'MITRS Submission Date', 'MITRS Submission Reference',
      'Date Documents Requested', 'Date Documents Received', 'Draft Date', 'Review Date',
      'Client Confirmation Date', 'YA Status', 'Auditor', 'Accounts Status', 'Account Book-In Date',
      'Account Return Date', 'Account Return Status', 'Submission Status', 'Submission Reference',
      'Person No', 'YA Sequence', 'Total Tax', 'Less: CP204 Payment', 'Under Estimate Penalty',
      'Balance Tax Payable', 'Balance Tax Due Date', 'Form E Status',
      'CP8D Status', 'Form EA Status', 'Completed Date', 'Remarks',
    ],
    previewColumns: [
      { key: 'jobCode', label: 'Job ID' },
      { key: 'module', label: 'Module' },
      { key: 'jobType', label: 'Job Type' },
      { key: 'clientName', label: 'Client Name' },
      { key: 'ya', label: 'YA' },
      { key: 'taxPic', label: 'PIC' },
      { key: 'finalApplicableDeadline', label: 'Final Deadline' },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    key: 'cp204',
    label: 'CP204 Master (cp204)',
    collection: 'cp204',
    description: 'Initial CP204 tax estimates, basis periods, statutory due dates, and PIC assignments.',
    sampleFilenames: ['cp204_master.json', 'cp204.xlsx'],
    templateHeaders: [
      'CP204 ID', 'Client ID', 'Client Name', 'YA', 'FYE', 'Basis Period Start', 'Basis Period End',
      'Original Estimated Tax', 'Original Submission Date', 'Current Estimated Tax',
      'Statutory CP204 Due Date', 'PIC', 'Reviewer', 'Status', 'Acknowledgement URL', 'Remarks',
    ],
    previewColumns: [
      { key: 'cp204Id', label: 'CP204 ID' },
      { key: 'clientName', label: 'Client' },
      { key: 'ya', label: 'YA' },
      { key: 'originalEstimatedTax', label: 'Orig Est (RM)' },
      { key: 'currentEstimatedTax', label: 'Curr Est (RM)' },
      { key: 'status', label: 'Status' },
    ],
  },
  {
    key: 'cp204_revisions',
    label: 'CP204 Revisions → Attach to CP204',
    collection: 'cp204',
    isChildMerge: true,
    parentCollection: 'cp204',
    description: 'Merges CP204A 6th/9th/11th Month revision rows onto matching parent CP204 ID documents.',
    sampleFilenames: ['cp204_revisions.json', 'cp204_revisions.xlsx'],
    templateHeaders: [
      'CP204 ID', 'Revision Month', 'Previous Estimated Tax', 'Proposed Estimated Tax',
      'Reason', 'Review Status', 'PIC', 'Reviewer', 'Submission Deadline', 'Submission Date',
      'Acknowledgement URL', 'Remarks',
    ],
    previewColumns: [
      { key: 'cp204Id', label: 'Parent CP204 ID' },
      { key: 'revisionMonth', label: 'Month' },
      { key: 'proposedEstimatedTax', label: 'Proposed Est (RM)' },
      { key: 'submissionDate', label: 'Submission Date' },
      { key: 'reviewStatus', label: 'Status' },
    ],
  },
  {
    key: 'cp204_instalments',
    label: 'CP204 Instalments → Attach to CP204',
    collection: 'cp204',
    isChildMerge: true,
    parentCollection: 'cp204',
    description: 'Merges monthly CP204 instalment rows (1–12) onto matching parent CP204 ID documents.',
    sampleFilenames: ['cp204_instalments.json', 'cp204_instalments.xlsx'],
    templateHeaders: [
      'CP204 ID', 'Instalment No', 'Due Date', 'Amount Due', 'Amount Paid', 'Payment Date',
      'Payment Reference', 'Payment Verified', 'Follow-Up Status', 'Remarks',
    ],
    previewColumns: [
      { key: 'cp204Id', label: 'Parent CP204 ID' },
      { key: 'instalmentNo', label: 'Inst #' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'amountDue', label: 'Due (RM)' },
      { key: 'amountPaid', label: 'Paid (RM)' },
      { key: 'followUpStatus', label: 'Status' },
    ],
  },
  {
    key: 'taxPayments',
    label: 'Tax Payment Monitor (taxPayments)',
    collection: 'taxPayments',
    description: 'Tax payment tracking, receipts, verification status, and follow-up status.',
    sampleFilenames: ['tax_payments.json', 'tax_payments.xlsx'],
    templateHeaders: [
      'Payment ID', 'Client ID', 'Client Name', 'Payment Type', 'YA', 'Reference / Case No',
      'Due Date', 'Amount Due', 'Amount Paid', 'Payment Date', 'Payment Reference',
      'Verification Status', 'Follow-Up Status', 'Remarks',
    ],
    previewColumns: [
      { key: 'paymentId', label: 'Payment ID' },
      { key: 'clientName', label: 'Client' },
      { key: 'paymentType', label: 'Type' },
      { key: 'amountDue', label: 'Due (RM)' },
      { key: 'amountPaid', label: 'Paid (RM)' },
      { key: 'followUpStatus', label: 'Follow-Up' },
    ],
  },
  {
    key: 'correspondence',
    label: 'Correspondence Register (correspondence)',
    collection: 'correspondence',
    description: 'LHDN, SSM, Client, and Auditor letters, queries, action dates, and PIC assignments.',
    sampleFilenames: ['correspondence.json', 'correspondence.xlsx'],
    templateHeaders: [
      'Correspondence ID', 'Client ID', 'Client Name', 'YA', 'Job ID', 'Date Received',
      'Method Received', 'Category', 'Letter Type', 'Letter Subject', 'Letter Reference No',
      'Detailed Information', 'Due Date', 'Action Required', 'PIC', 'Action Status',
      'Action Date', 'Remarks', 'Attachment URL',
    ],
    previewColumns: [
      { key: 'correspondenceId', label: 'Corr ID' },
      { key: 'clientName', label: 'Client' },
      { key: 'dateReceived', label: 'Received' },
      { key: 'category', label: 'Category' },
      { key: 'letterSubject', label: 'Subject' },
      { key: 'actionStatus', label: 'Status' },
    ],
  },
  {
    key: 'workDone',
    label: 'Work Done & Finance (workDone)',
    collection: 'workDone',
    description: 'Billing proposals, HOD pricing, SST, finance invoicing status, and remarks.',
    sampleFilenames: ['work_done.json', 'work_done.xlsx'],
    templateHeaders: [
      'Work Done ID', 'Job ID', 'Client ID', 'Client Name', 'YA', 'Job Type', 'PIC', 'Reviewer',
      'Job Status', 'Work Done Description', 'Pricing Mode', 'Audit Fee', 'Quotation Price',
      'Prior Year Price', 'HOD Price', 'Additional Charges', 'Final Price', 'SST Amount',
      'Total Invoice Amount', 'Work Done Status', 'Finance Invoice Status', 'Invoice No',
      'Issue Date', 'Cancellation Date', 'Cancellation Reason', 'Remarks',
    ],
    previewColumns: [
      { key: 'workDoneId', label: 'WD ID' },
      { key: 'clientName', label: 'Client' },
      { key: 'ya', label: 'YA' },
      { key: 'finalPrice', label: 'Final Price' },
      { key: 'workDoneStatus', label: 'WD Status' },
      { key: 'financeInvoiceStatus', label: 'Finance Status' },
    ],
  },
  {
    key: 'workDone_allocations',
    label: 'Work Done Fee Allocations → Attach to Work Done',
    collection: 'workDone',
    isChildMerge: true,
    parentCollection: 'workDone',
    description: 'Attaches line-item fee allocations onto matching parent Work Done ID documents.',
    sampleFilenames: ['work_done_fee_allocations.json', 'work_done_fee_allocations.xlsx'],
    templateHeaders: ['Work Done ID', 'Line No', 'Description', 'Fee'],
    previewColumns: [
      { key: 'workDoneId', label: 'Parent WD ID' },
      { key: 'lineNo', label: 'Line #' },
      { key: 'description', label: 'Description' },
      { key: 'fee', label: 'Fee (RM)' },
    ],
  },
  {
    key: 'calendarEvents',
    label: 'Team Calendar Events (calendarEvents)',
    collection: 'calendarEvents',
    description: 'Staff leave/availability, company holidays, firm seminars, and client appointments.',
    sampleFilenames: ['calendar_events.json', 'calendar_events.xlsx'],
    templateHeaders: [
      'Event ID', 'Event Type', 'Title', 'Start Date', 'End Date', 'Assigned To',
      'Client ID', 'Client Name', 'Color', 'Time-Off Note', 'Notes',
    ],
    previewColumns: [
      { key: 'eventType', label: 'Type' },
      { key: 'title', label: 'Title' },
      { key: 'assignedTo', label: 'Staff' },
      { key: 'startDate', label: 'Start' },
      { key: 'endDate', label: 'End' },
    ],
  },
  {
    key: 'staff',
    label: 'Staff Directory (staff)',
    collection: 'staff',
    description: 'Imports Staff RBAC profiles safely — automatically strips Password Hash & Password Salt.',
    sampleFilenames: ['staff.json', 'staff.xlsx'],
    templateHeaders: [
      'Staff ID', 'Staff Name', 'Email', 'Role', 'Active', 'Department', 'Designation', 'Phone', 'Join Date', 'Leave Date',
    ],
    previewColumns: [
      { key: 'staffId', label: 'Staff ID' },
      { key: 'staffName', label: 'Staff Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'active', label: 'Active' },
    ],
  },
  {
    key: 'settings',
    label: 'Controlled Settings (settings)',
    collection: 'settings',
    description: 'Controlled dropdown values, status badges, and sort order across all modules.',
    sampleFilenames: ['settings.json', 'settings.xlsx'],
    templateHeaders: [
      'Group', 'Code', 'Display Name', 'Module', 'Badge Color', 'Active', 'Sort Order',
    ],
    previewColumns: [
      { key: 'group', label: 'Group' },
      { key: 'code', label: 'Code' },
      { key: 'displayName', label: 'Display Name' },
      { key: 'module', label: 'Module' },
      { key: 'badgeColor', label: 'Color' },
    ],
  },
  {
    key: 'history',
    label: 'Audit History Log (history)',
    collection: 'history',
    description: 'Immutable job workflow transition audit entries. Existing History IDs are skipped.',
    sampleFilenames: ['history.json', 'history.xlsx'],
    templateHeaders: ['History ID', 'Job ID', 'Action', 'Old Status', 'New Status', 'User', 'Remarks'],
    previewColumns: [
      { key: 'jobId', label: 'Job ID' },
      { key: 'action', label: 'Action' },
      { key: 'oldStatus', label: 'Old Status' },
      { key: 'newStatus', label: 'New Status' },
      { key: 'user', label: 'User' },
    ],
  },
];

export function getTargetDefinition(key: ImportTargetKey): ImportTargetDefinition {
  return IMPORT_TARGETS.find((t) => t.key === key) ?? IMPORT_TARGETS[0];
}

export function detectImportTargetFromFilename(name: string): ImportTargetKey | null {
  const lower = String(name || '').trim().toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, '');
  if (!compact) return null;

  if (compact.includes('cp204revision') || compact.includes('cp204rev')) return 'cp204_revisions';
  if (compact.includes('cp204instalment') || compact.includes('cp204installment') || compact.includes('cp204instal')) {
    return 'cp204_instalments';
  }
  if (compact.includes('cp204')) return 'cp204';
  if (
    compact.includes('feeallocation') ||
    compact.includes('workdonefee') ||
    compact.includes('workdonealloc')
  ) {
    return 'workDone_allocations';
  }
  if (compact.includes('workdone')) return 'workDone';
  if (compact.includes('taxpayment') || compact === 'payments' || compact === 'payment') {
    return 'taxPayments';
  }
  if (compact.includes('correspondence') || compact.includes('letter')) return 'correspondence';
  if (compact.includes('calendar') || compact === 'events') return 'calendarEvents';
  if (compact.includes('staff') || compact === 'users') return 'staff';
  if (compact.includes('setting') || compact.includes('controlledvalue')) return 'settings';
  if (compact.includes('history') || compact.includes('auditlog')) return 'history';
  if (compact.includes('job')) return 'jobs';
  if (compact.includes('client')) return 'clients';
  return null;
}

// ---------------------------------------------------------------------------
// Primitive Normalization Helpers
// ---------------------------------------------------------------------------
export function sanitizeDocId(raw: string, fallbackPrefix = 'REC'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  if (cleaned) return cleaned;
  return `${fallbackPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeHeaderKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildNormalizedRowMap(rawRow: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(rawRow)) {
    const norm = normalizeHeaderKey(k);
    if (norm && !map.has(norm)) {
      map.set(norm, v);
    }
  }
  return map;
}

function pickRaw(map: Map<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const val = map.get(normalizeHeaderKey(alias));
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return val;
    }
  }
  return undefined;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

function sanitizeFirestoreValue(val: unknown): unknown {
  if (val === undefined) return undefined;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (Array.isArray(val)) {
    const out: unknown[] = [];
    for (const item of val) {
      const cleaned = sanitizeFirestoreValue(item);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }
  if (isPlainObject(val)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      const cleaned = sanitizeFirestoreValue(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  // Primitives (string, boolean, null) and Firestore sentinels/Date/Timestamp instances
  return val;
}

/**
 * Recursively strips `undefined` keys and replaces non-finite numbers (`NaN`/`Infinity`) with `0`
 * while preserving Firestore FieldValue sentinels (e.g. `serverTimestamp()`), Timestamps, and Dates.
 */
export function sanitizeFirestorePayload(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const cleaned = sanitizeFirestoreValue(v);
    if (cleaned !== undefined) {
      out[k] = cleaned;
    }
  }
  return out;
}

function clampStr(val: unknown, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function pickStr(map: Map<string, unknown>, aliases: string[], maxLen: number, fallback = ''): string {
  const raw = pickRaw(map, aliases);
  if (raw === undefined) return String(fallback ?? '').trim().slice(0, maxLen);
  return clampStr(raw, maxLen);
}

function safeNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  const cleaned = String(val).replace(/RM|MYR|,|\s+/gi, '').trim();
  if (!cleaned) return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function pickOptNum(map: Map<string, unknown>, aliases: string[]): number | undefined {
  const raw = pickRaw(map, aliases);
  if (raw === undefined) return undefined;
  const cleaned = String(raw).replace(/RM|MYR|,|\s+/gi, '').trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseBool(val: unknown, fallback = true): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'active'].includes(s)) return true;
    if (['false', 'no', 'n', '0', 'inactive', 'disabled'].includes(s)) return false;
  }
  return fallback;
}

/**
 * Normalizes dates from ISO strings, DD/MM/YYYY, YYYY/MM/DD, Excel serial numbers,
 * or JS Date objects into YYYY-MM-DD.
 */
export function normalizeImportDate(val: unknown): string {
  if (val === undefined || val === null || val === '') return '';

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Excel serial date number (approx 1950–2100)
  if (typeof val === 'number' && val > 18000 && val < 80000) {
    const utcDays = Math.floor(val - 25569);
    const dt = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const s = String(val).trim();
  if (!s || s === '-' || s === '—' || s.toLowerCase() === 'n/a') return '';

  // Already YYYY-MM-DD (or ISO timestamp)
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // YYYY/MM/DD
  const ymdSlash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (ymdSlash) {
    return `${ymdSlash[1]}-${ymdSlash[2].padStart(2, '0')}-${ymdSlash[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY (Malaysian date format default)
  const dmyMatch = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    let y = Number(dmyMatch[3]);
    if (y < 100) y += y >= 50 ? 1900 : 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // Fallback if MM/DD/YYYY (m > 12)
    if (d >= 1 && d <= 12 && m >= 1 && m <= 31) {
      return `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
    }
  }

  // Natural date strings e.g. "31 Dec 2025" or ISO Date.parse
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    if (y >= 1900 && y <= 2100) return `${y}-${m}-${d}`;
  }

  return '';
}

function matchEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  const exact = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  // Normalize dashes/spaces for partial matching
  const norm = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const fuzzy = allowed.find((a) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
  return fuzzy ?? fallback;
}

function normalizeFyeMonth(val: unknown): string {
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (/^(1[0-2]|[1-9])$/.test(s)) return String(Number(s));
  if (/^0[1-9]$/.test(s)) return String(Number(s));
  const months: Record<string, string> = {
    jan: '1', january: '1',
    feb: '2', february: '2',
    mar: '3', march: '3',
    apr: '4', april: '4',
    may: '5',
    jun: '6', june: '6',
    jul: '7', july: '7',
    aug: '8', august: '8',
    sep: '9', sept: '9', september: '9',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
  };
  const lower = s.toLowerCase();
  for (const [k, num] of Object.entries(months)) {
    if (lower.includes(k)) return num;
  }
  const dt = normalizeImportDate(s);
  if (dt) return String(Number(dt.slice(5, 7)));
  return s.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Allowed Enum Lists (in exact lockstep with firestore.rules)
// ---------------------------------------------------------------------------
const CLIENT_CATEGORIES: readonly ClientCategory[] = ['Corporate', 'Individual', 'Other'];
const JOB_MODULES: readonly JobModule[] = [
  'CP204', 'Corporate', 'Individual', 'Ad Hoc', 'Form E', 'Tax Payment Monitor', 'Correspondence',
];
const JOB_TYPES: readonly JobType[] = [
  'Form C', 'Form B', 'Form BE', 'Form M', 'Form P', 'Form E',
  'CP204', 'CP204A', 'CP204B', 'MITRS', 'Tax Audit',
  'RPGT / CKHT', 'Tax Appeal', 'Tax Refund', 'Tax Residency', 'Other',
];
const CP204_STATUSES: readonly Cp204Status[] = [
  'In Progress', 'Pending Review', 'Submitted', 'Self-submit by Client', 'Completed', 'On Hold',
];
const CP204_REV_MONTHS: readonly Cp204RevisionMonth[] = ['6', '9', '11'];
const PAYMENT_TYPES: readonly TaxPaymentType[] = [
  'CP204 Instalment', 'Final Tax', 'Form C Balance', 'Tax Audit Settlement',
  'Compound / Penalty', 'CP500 Instalment', 'RPGT / CKHT', 'Withholding Tax', 'Other Tax Payment',
];
const PAYMENT_VERIFICATIONS: readonly TaxPaymentVerificationStatus[] = [
  'Not Verified', 'Pending Verification', 'Verified', 'Rejected / Mismatch',
];
const PAYMENT_FOLLOWUPS: readonly TaxPaymentFollowUpStatus[] = [
  'Pending', 'Partially Paid', 'Paid - Pending Verification', 'Verified Paid', 'Overdue', 'On Hold',
];
const CORR_METHODS: readonly CorrespondenceMethod[] = [
  'Email', 'Post', 'Portal', 'Hand Delivered', 'Other',
];
const CORR_CATEGORIES: readonly CorrespondenceCategory[] = [
  'LHDN', 'SSM', 'Client', 'Auditor', 'Other',
];
const CORR_LETTER_TYPES: readonly CorrespondenceLetterType[] = [
  'Notice', 'Query', 'Assessment', 'Audit', 'Appeal', 'Reminder', 'Other',
];
const CORR_STATUSES: readonly CorrespondenceActionStatus[] = [
  'Pending', 'In Progress', 'Completed', 'No Action Required', 'Cancelled',
];
const WD_PRICING_MODES: readonly WorkDonePricingMode[] = ['Overall Fee', 'Individual Allocation'];
const WD_STATUSES: readonly WorkDoneStatus[] = [
  'Draft', 'Quotation Pending Approval', 'Quotation Issued', 'In Progress',
  'Completed — Pending Finance', 'Returned by Finance', 'Ready for Invoicing',
  'Invoiced', 'Cancelled',
];
const FIN_STATUSES: readonly FinanceInvoiceStatus[] = [
  'Not Submitted', 'Pending Review', 'Returned', 'Ready for Invoicing', 'Invoiced', 'Cancelled',
];
const STAFF_ROLES: readonly StaffRole[] = ['Admin', 'Manager-HOD', 'Staff', 'Report Viewer'];

function inferModuleFromJobType(jobType: JobType): JobModule {
  if (jobType === 'Form C' || jobType === 'MITRS') return 'Corporate';
  if (jobType === 'Form B' || jobType === 'Form BE' || jobType === 'Form M' || jobType === 'Form P') {
    return 'Individual';
  }
  if (jobType === 'Form E') return 'Form E';
  if (jobType === 'CP204' || jobType === 'CP204A' || jobType === 'CP204B') return 'CP204';
  return 'Ad Hoc';
}

// ---------------------------------------------------------------------------
// Per-Target Row Parser & Validator
// ---------------------------------------------------------------------------
export function parseAndValidateRow(
  target: ImportTargetKey,
  rawRow: Record<string, unknown>,
  rowNumber: number
): ParsedImportRow {
  const m = buildNormalizedRowMap(rawRow);

  switch (target) {
    case 'clients': {
      const clientId = pickStr(m, ['Client ID', 'clientId', 'ID'], 40);
      const clientName = pickStr(m, ['Client Name', 'clientName', 'Company Name', 'Name'], 200);
      if (!clientId) {
        return { rowNumber, docId: '', valid: false, reason: 'Missing required Client ID', payload: {}, preview: {} };
      }
      if (!clientName) {
        return { rowNumber, docId: '', valid: false, reason: 'Missing required Client Name', payload: {}, preview: { clientId } };
      }

      const categoryRaw = pickStr(m, ['Category', 'Client Type', 'Type'], 40, 'Corporate');
      const category = matchEnum<ClientCategory>(categoryRaw, CLIENT_CATEGORIES, 'Corporate');
      const clientStatus = pickStr(m, ['Client Status', 'Status'], 60, 'Active');
      const fye = normalizeFyeMonth(pickRaw(m, ['FYE', 'FYE Month', 'Financial Year End']));

      const payload: Record<string, unknown> = {
        clientId,
        clientName,
        companyNo: pickStr(m, ['Company No', 'companyNo', 'SSM No', 'Registration No', 'registrationNo', 'Reg No'], 60),
        tin: pickStr(m, ['TIN', 'Tax File No', 'Income Tax No'], 60),
        fye,
        taxPic: pickStr(m, ['Tax PIC', 'taxPic', 'PIC'], 120),
        category,
        clientStatus,
        smeStatus: pickStr(m, ['SME Status', 'smeStatus'], 40),
        taxAgent: pickStr(m, ['Tax Agent', 'taxAgent'], 120),
        myTaxAppointment: pickStr(m, ['MyTax Appointment', 'myTaxAppointment', 'MyTax'], 60),
        eInvoiceStatus: pickStr(m, ['e-Invoice Status', 'eInvoiceStatus', 'E-Invoice'], 60),
        sstRegistered: pickStr(m, ['SST Registered', 'sstRegistered'], 20),
        sstNo: pickStr(m, ['SST No', 'sstNo'], 60),
        email: pickStr(m, ['Email', 'Client Email'], 160),
        phone: pickStr(m, ['Phone', 'Contact No', 'Telephone'], 60),
        dateOfIncorporation: normalizeImportDate(pickRaw(m, ['Date of Incorporation', 'dateOfIncorporation', 'Incorporation Date'])),
        dateOfCommencementBusiness: normalizeImportDate(pickRaw(m, ['Date of Commencement Business', 'Date of Commencement', 'dateOfCommencementBusiness'])),
        dateOfEngagement: normalizeImportDate(pickRaw(m, ['Date of Engagement', 'dateOfEngagement', 'Engagement Date'])),
        dateOfResigned: normalizeImportDate(pickRaw(m, ['Date of Resigned', 'dateOfResigned', 'Resigned Date'])),
        auditor: pickStr(m, ['Auditor', 'Audit Firm'], 120),
        account: pickStr(m, ['Account', 'Accountant', 'Account Prep'], 120),
        eNumber: pickStr(m, ['E Number', 'eNumber', 'Employer No', 'employerNo', 'E No'], 60),
        specialRemarks: pickStr(m, ['Special Remarks', 'specialRemarks', 'Remarks', 'Notes'], 2000),
        personNo: pickStr(m, ['Person No', 'personNo', 'IC / Passport', 'NRIC'], 60),
        relationship: pickStr(m, ['Relationship', 'relationship'], 80),
        engagementStatus: pickStr(m, ['Engagement Status', 'engagementStatus'], 60),
        businessName: pickStr(m, ['Business Name', 'businessName'], 200),
        businessType: pickStr(m, ['Business Type', 'businessType'], 80),
        businessSsmNo: pickStr(m, ['Business SSM No', 'businessSsmNo'], 60),
        businessENumber: pickStr(m, ['Business E Number', 'businessENumber'], 60),
        businessStartDate: normalizeImportDate(pickRaw(m, ['Business Start Date', 'businessStartDate'])),
        businessStatus: pickStr(m, ['Business Status', 'businessStatus'], 60),
        firstYa: pickStr(m, ['1st YA', 'First YA', 'firstYA', 'firstYa', '1st_ya', 'first_ya'], 20),
        firstYA: pickStr(m, ['1st YA', 'First YA', 'firstYA', 'firstYa', '1st_ya', 'first_ya'], 20),
        firstYaStatus: pickStr(m, ['1st YA Status', 'First YA Status', 'firstYaStatus'], 60),
        secondYa: pickStr(m, ['2nd YA', 'Second YA', 'secondYa'], 20),
        secondYaStatus: pickStr(m, ['2nd YA Status', 'Second YA Status', 'secondYaStatus'], 60),
        groupId: pickStr(m, ['Group ID', 'groupId', 'Group'], 60),
        companySecretary: pickStr(m, ['Company Secretary', 'companySecretary', 'Co Sec'], 120),
        registeredAddress: pickStr(m, ['Registered Address', 'registeredAddress', 'Address'], 500),
      };

      const resolvedPrincipalActivity1 = pickStr(
        m,
        ['Principal Activity 1', 'Activity 1', 'principalActivity1', 'Principal Activity', 'principalActivity'],
        250
      );
      const optionalClientExtras: Array<[string, string]> = [
        ['oldRegNo', pickStr(m, ['Old Reg No', 'Old Reg. No.', 'oldRegNo'], 60)],
        ['principalActivity', resolvedPrincipalActivity1],
        ['principalActivity1', resolvedPrincipalActivity1],
        ['msicCode1', pickStr(m, ['MSIC Code 1', 'MSIC 1', 'msicCode1', 'MSIC Code', 'MSIC', 'msicCode'], 20)],
        ['principalActivity2', pickStr(m, ['Principal Activity 2', 'Activity 2', 'principalActivity2'], 250)],
        ['msicCode2', pickStr(m, ['MSIC Code 2', 'MSIC 2', 'msicCode2'], 20)],
        ['principalActivity3', pickStr(m, ['Principal Activity 3', 'Activity 3', 'principalActivity3'], 250)],
        ['msicCode3', pickStr(m, ['MSIC Code 3', 'MSIC 3', 'msicCode3'], 20)],
        ['feeBillingNotes', pickStr(m, ['Fee / Billing Notes', 'Fee Notes', 'Billing Notes', 'feeBillingNotes'], 500)],
        ['eInvoiceImplDate', normalizeImportDate(pickRaw(m, ['e-Invoice Implementation Date', 'eInvoiceImplDate']))],
        ['maritalStatus', pickStr(m, ['Marital Status', 'maritalStatus'], 40)],
        ['spouseName', pickStr(m, ['Spouse Name', 'spouseName'], 160)],
        ['spouseTin', pickStr(m, ['Spouse TIN', 'spouseTin'], 60)],
        ['employerDetails', pickStr(m, ['Employer Details', 'employerDetails'], 250)],
        ['contactPerson', pickStr(m, ['Contact Person', 'contactPerson'], 120)],
        ['correspondenceAddress', pickStr(m, ['Correspondence Address', 'correspondenceAddress'], 500)],
      ];
      for (const [k, v] of optionalClientExtras) {
        if (v) payload[k] = v;
      }

      const postcode = pickStr(m, ['Postcode', 'Postal Code', 'Zip', 'postcode'], 20);
      if (postcode) payload.postcode = postcode;
      const reviewer = pickStr(m, ['Reviewer', 'Tax Reviewer', 'reviewer'], 120);
      if (reviewer) payload.reviewer = reviewer;

      // Optional nested schedule arrays if present in JSON export (plain objects only)
      for (const schedKey of ['businessHistory', 'relatedPersons', 'partnershipPartners', 'yaMonitoring']) {
        const rawArr = pickRaw(m, [schedKey]);
        if (Array.isArray(rawArr)) {
          const validMaps = rawArr
            .filter((item): item is Record<string, unknown> => isPlainObject(item))
            .slice(0, 50)
            .map((item) => sanitizeFirestorePayload(item));
          payload[schedKey] = validMaps;
        }
      }

      return {
        rowNumber,
        docId: sanitizeDocId(clientId, 'CL'),
        valid: true,
        payload,
        preview: {
          clientId,
          clientName,
          category,
          tin: String(payload.tin || '—'),
          fye: fye || '—',
          taxPic: String(payload.taxPic || '—'),
          clientStatus,
        },
      };
    }

    case 'jobs': {
      const jobCode = pickStr(m, ['Job ID', 'Job Code', 'jobCode', 'jobId', 'ID'], 40);
      const clientId = pickStr(m, ['Client ID', 'clientId'], 40);
      const clientName = pickStr(m, ['Client Name', 'clientName'], 200);
      if (!jobCode) {
        return { rowNumber, docId: '', valid: false, reason: 'Missing required Job ID / Job Code', payload: {}, preview: {} };
      }
      if (!clientId || !clientName) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Missing required Client ID or Client Name',
          payload: {},
          preview: { jobCode, clientName: clientName || '—' },
        };
      }

      const rawJobType = pickStr(m, ['Job Type', 'jobType', 'Form Type', 'formType'], 40);
      const jobType = matchEnum<JobType>(rawJobType, JOB_TYPES, 'Other');
      const rawModule = pickStr(m, ['Module', 'Job Module', 'Category'], 40);
      const module = matchEnum<JobModule>(rawModule, JOB_MODULES, inferModuleFromJobType(jobType));
      const status = pickStr(m, ['Status', 'Job Status'], 60, 'Not Started');
      const fye = normalizeFyeMonth(pickRaw(m, ['FYE', 'FYE Month']));
      const finalApplicableDeadline = normalizeImportDate(
        pickRaw(m, ['Final Applicable Deadline', 'Final Deadline', 'finalApplicableDeadline', 'Due Date', 'dueDate'])
      );

      const payload: Record<string, unknown> = {
        jobCode,
        module,
        jobType,
        clientId,
        clientName,
        groupId: pickStr(m, ['Group ID', 'groupId'], 60),
        fye,
        ya: pickStr(m, ['YA', 'Year of Assessment'], 16),
        taxPic: pickStr(m, ['Tax PIC', 'taxPic', 'PIC'], 120),
        reviewer: pickStr(m, ['Reviewer', 'Tax Reviewer'], 120),
        status,
        priority: pickStr(m, ['Priority'], 30, 'Normal'),
        dueDate: normalizeImportDate(pickRaw(m, ['Due Date', 'dueDate'])) || finalApplicableDeadline,
        completedDate: normalizeImportDate(pickRaw(m, ['Completed Date', 'completedDate'])),
        internalDeadline: normalizeImportDate(pickRaw(m, ['Internal Deadline', 'internalDeadline'])),
        originalStatutoryDeadline: normalizeImportDate(
          pickRaw(m, ['Original Statutory Deadline', 'Statutory Deadline', 'originalStatutoryDeadline'])
        ),
        ssmEot1: normalizeImportDate(pickRaw(m, ['SSM EOT 1', 'ssmEot1'])),
        ssmEot2: normalizeImportDate(pickRaw(m, ['SSM EOT 2', 'ssmEot2'])),
        ssmEot3: normalizeImportDate(pickRaw(m, ['SSM EOT 3', 'ssmEot3'])),
        lhdnEot1: normalizeImportDate(pickRaw(m, ['LHDN EOT 1', 'lhdnEot1'])),
        lhdnEot2: normalizeImportDate(pickRaw(m, ['LHDN EOT 2', 'lhdnEot2'])),
        lhdnEot3: normalizeImportDate(pickRaw(m, ['LHDN EOT 3', 'lhdnEot3'])),
        finalApplicableDeadline,
        auditType: pickStr(m, ['Audit Type', 'auditType', 'Audit Status'], 40),
        auditBookInDate: normalizeImportDate(pickRaw(m, ['Audit Book-In Date', 'Audit Book In Date', 'auditBookInDate'])),
        auditReportReceivedDate: normalizeImportDate(
          pickRaw(m, ['Audit Report Received Date', 'auditReportReceivedDate'])
        ),
        formCStatus: pickStr(m, ['Form C Status', 'formCStatus'], 60),
        formCDueDate: normalizeImportDate(
          pickRaw(m, ['Form C Due Date', 'Normal e-Filing Deadline', 'formCDueDate'])
        ),
        formCSubmissionDate: normalizeImportDate(pickRaw(m, ['Form C Submission Date', 'formCSubmissionDate'])),
        formCSubmissionReference: pickStr(
          m,
          ['Form C Submission Reference', 'Form C Ref', 'formCSubmissionReference'],
          80
        ),
        mitrsStatus: pickStr(m, ['MITRS Status', 'mitrsStatus'], 60),
        mitrsDueDate: normalizeImportDate(pickRaw(m, ['MITRS Due Date', 'mitrsDueDate'])),
        mitrsSubmissionDate: normalizeImportDate(pickRaw(m, ['MITRS Submission Date', 'mitrsSubmissionDate'])),
        mitrsSubmissionReference: pickStr(
          m,
          ['MITRS Submission Reference', 'MITRS Ref', 'mitrsSubmissionReference'],
          80
        ),
        dateDocumentsRequested: normalizeImportDate(
          pickRaw(m, ['Date Documents Requested', 'dateDocumentsRequested'])
        ),
        dateDocumentsReceived: normalizeImportDate(
          pickRaw(m, ['Date Documents Received', 'dateDocumentsReceived'])
        ),
        draftDate: normalizeImportDate(pickRaw(m, ['Draft Date', 'draftDate'])),
        reviewDate: normalizeImportDate(pickRaw(m, ['Review Date', 'reviewDate'])),
        clientConfirmationDate: normalizeImportDate(
          pickRaw(m, ['Client Confirmation Date', 'clientConfirmationDate'])
        ),
        yaStatus: pickStr(m, ['YA Status', 'yaStatus'], 60),
        auditor: pickStr(m, ['Auditor'], 120),
        accountsStatus: pickStr(m, ['Accounts Status', 'accountsStatus'], 60),
        accountBookInDate: normalizeImportDate(
          pickRaw(m, ['Account Book-In Date', 'Account Book In Date', 'accountBookInDate'])
        ),
        accountReturnDate: normalizeImportDate(pickRaw(m, ['Account Return Date', 'accountReturnDate'])),
        accountReturnStatus: pickStr(m, ['Account Return Status', 'accountReturnStatus'], 60),
        submissionStatus: pickStr(m, ['Submission Status', 'submissionStatus'], 60),
        submissionReference: pickStr(m, ['Submission Reference', 'submissionReference'], 80),
        personNo: pickStr(m, ['Person No', 'personNo'], 60),
        yaSequence: pickStr(m, ['YA Sequence', 'yaSequence'], 40),
        finalTaxPayableDate: normalizeImportDate(
          pickRaw(m, ['Balance Tax Due Date', 'Final Tax Payable Date', 'finalTaxPayableDate'])
        ),
        formEStatus: pickStr(m, ['Form E Status', 'formEStatus'], 60),
        cp8dStatus: pickStr(m, ['CP8D Status', 'cp8dStatus'], 60),
        formEaStatus: pickStr(m, ['Form EA Status', 'formEaStatus'], 60),
        billingStatus: pickStr(m, ['Billing Status', 'Work Done Status', 'billingStatus'], 40),
        remarks: pickStr(m, ['Remarks', 'Job Remarks', 'Notes'], 2000),
      };

      const numFields: Array<[string, string[]]> = [
        ['totalTax', ['Total Tax', 'Total Tax (RM)', 'totalTax']],
        [
          'cp204Payment',
          ['Less: CP204 Payment', 'Less: CP204 Payment (RM)', 'CP204 Payment', 'CP204 Paid', 'cp204Payment'],
        ],
        [
          'underEstimatePenalty',
          ['Under Estimate Penalty', 'Add: Under Estimate Penalty (RM)', 'underEstimatePenalty'],
        ],
        [
          'finalTaxPayable',
          ['Balance Tax Payable', 'Balance Tax Payable (RM)', 'Final Tax Payable', 'Final Tax Payable (RM)', 'finalTaxPayable'],
        ],
        ['feeAmount', ['Fee Amount', 'feeAmount']],
        ['billedAmount', ['Billed Amount', 'billedAmount']],
        ['hoursSpent', ['Hours Spent', 'hoursSpent']],
        ['taxPayable', ['Tax Payable', 'taxPayable']],
        ['taxRefundable', ['Tax Refundable', 'taxRefundable']],
      ];
      for (const [k, aliases] of numFields) {
        const val = pickOptNum(m, aliases);
        if (val !== undefined) payload[k] = val;
      }

      return {
        rowNumber,
        docId: sanitizeDocId(jobCode, 'JOB'),
        valid: true,
        payload,
        preview: {
          jobCode,
          module,
          jobType,
          clientName,
          ya: String(payload.ya || '—'),
          taxPic: String(payload.taxPic || '—'),
          finalApplicableDeadline: finalApplicableDeadline || '—',
          status,
        },
      };
    }

    case 'cp204': {
      const cp204Id = pickStr(m, ['CP204 ID', 'cp204Id', 'ID'], 40);
      const clientId = pickStr(m, ['Client ID', 'clientId'], 40);
      const clientName = pickStr(m, ['Client Name', 'clientName'], 200);
      const ya = pickStr(m, ['YA', 'Year of Assessment'], 16);
      if (!cp204Id || !clientId || !clientName || !ya) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Requires CP204 ID, Client ID, Client Name, and YA',
          payload: {},
          preview: { cp204Id: cp204Id || '—', clientName: clientName || '—', ya: ya || '—' },
        };
      }
      const origEst = safeNum(pickRaw(m, ['Original Estimated Tax', 'originalEstimatedTax', 'Original Estimate']), 0);
      const currEst = safeNum(pickRaw(m, ['Current Estimated Tax', 'currentEstimatedTax', 'Current Estimate']), origEst);
      const status = matchEnum<Cp204Status>(pickRaw(m, ['Status', 'CP204 Status']), CP204_STATUSES, 'In Progress');

      const payload: Record<string, unknown> = {
        cp204Id,
        clientId,
        clientName,
        ya,
        fye: normalizeFyeMonth(pickRaw(m, ['FYE', 'FYE Month'])),
        basisPeriodStart: normalizeImportDate(pickRaw(m, ['Basis Period Start', 'basisPeriodStart'])),
        basisPeriodEnd: normalizeImportDate(pickRaw(m, ['Basis Period End', 'basisPeriodEnd'])),
        originalEstimatedTax: origEst,
        originalSubmissionDate: normalizeImportDate(pickRaw(m, ['Original Submission Date', 'originalSubmissionDate'])),
        currentEstimatedTax: currEst,
        statutoryCp204DueDate: normalizeImportDate(
          pickRaw(m, ['Statutory CP204 Due Date', 'Statutory Due Date', 'statutoryCp204DueDate'])
        ),
        pic: pickStr(m, ['PIC', 'Tax PIC'], 120),
        reviewer: pickStr(m, ['Reviewer'], 120),
        status,
        acknowledgementUrl: pickStr(m, ['Acknowledgement URL', 'acknowledgementUrl'], 500),
        remarks: pickStr(m, ['Remarks', 'Notes'], 2000),
      };

      const rawRev = pickRaw(m, ['revisions']);
      if (Array.isArray(rawRev)) {
        payload.revisions = rawRev
          .filter((item): item is Record<string, unknown> => isPlainObject(item))
          .slice(0, 20)
          .map((item) => sanitizeFirestorePayload(item));
      }
      const rawInst = pickRaw(m, ['instalments', 'installments']);
      if (Array.isArray(rawInst)) {
        payload.instalments = rawInst
          .filter((item): item is Record<string, unknown> => isPlainObject(item))
          .slice(0, 36)
          .map((item) => sanitizeFirestorePayload(item));
      }

      return {
        rowNumber,
        docId: sanitizeDocId(cp204Id, 'CP204'),
        valid: true,
        payload,
        preview: {
          cp204Id,
          clientName,
          ya,
          originalEstimatedTax: origEst,
          currentEstimatedTax: currEst,
          status,
        },
      };
    }

    case 'cp204_revisions': {
      const cp204Id = pickStr(m, ['CP204 ID', 'cp204Id', 'Parent CP204 ID'], 40);
      if (!cp204Id) {
        return { rowNumber, docId: '', valid: false, reason: 'Missing parent CP204 ID', payload: {}, preview: {} };
      }
      const rawMonth = pickStr(m, ['Revision Month', 'revisionMonth', 'Month'], 30, '6');
      let revMonth: Cp204RevisionMonth = '6';
      if (rawMonth.includes('11')) revMonth = '11';
      else if (rawMonth.includes('9')) revMonth = '9';
      else revMonth = matchEnum<Cp204RevisionMonth>(rawMonth, CP204_REV_MONTHS, '6');

      const previousEstimatedTax = safeNum(
        pickRaw(m, ['Previous Estimated Tax', 'previousEstimatedTax', 'Previous Estimate']),
        0
      );
      const proposedEstimatedTax = safeNum(
        pickRaw(m, ['Proposed Estimated Tax', 'proposedEstimatedTax', 'Revised Estimate', 'revisedEstimate', 'Revised Tax']),
        0
      );
      const submissionDate = normalizeImportDate(pickRaw(m, ['Submission Date', 'submissionDate']));
      const reviewStatus = matchEnum<Cp204RevisionStatus>(
        pickRaw(m, ['Review Status', 'reviewStatus', 'Status']),
        CP204_REVISION_STATUS_OPTIONS,
        submissionDate ? 'Submitted' : 'In Progress'
      );
      const parentDocId = sanitizeDocId(cp204Id, 'CP204');
      const revisionId =
        pickStr(m, ['Revision ID', 'revisionId'], 40) || `${parentDocId}-R${revMonth}`;
      const revObj: Cp204Revision = {
        revisionId,
        revisionMonth: revMonth,
        previousEstimatedTax,
        proposedEstimatedTax,
        variance: Math.round((proposedEstimatedTax - previousEstimatedTax) * 100) / 100,
        reason: pickStr(m, ['Reason', 'Revision Reason'], 300),
        reviewStatus,
        pic: pickStr(m, ['PIC', 'Tax PIC'], 120),
        reviewer: pickStr(m, ['Reviewer'], 120),
        submissionDeadline: normalizeImportDate(pickRaw(m, ['Submission Deadline', 'submissionDeadline'])),
        submissionDate,
        acknowledgementUrl: pickStr(m, ['Acknowledgement URL', 'acknowledgementUrl'], 500),
        remarks: pickStr(m, ['Remarks', 'Notes'], 500),
      };
      return {
        rowNumber,
        docId: `${parentDocId}_M${revMonth}`,
        parentDocId,
        valid: true,
        payload: { cp204Id, revision: revObj },
        preview: {
          cp204Id,
          revisionMonth: `${revMonth}th Month`,
          proposedEstimatedTax,
          submissionDate: submissionDate || '—',
          reviewStatus,
        },
      };
    }

    case 'cp204_instalments': {
      const cp204Id = pickStr(m, ['CP204 ID', 'cp204Id', 'Parent CP204 ID'], 40);
      if (!cp204Id) {
        return { rowNumber, docId: '', valid: false, reason: 'Missing parent CP204 ID', payload: {}, preview: {} };
      }
      const instalmentNo = Math.max(
        1,
        Math.min(36, Math.round(safeNum(pickRaw(m, ['Instalment No', 'Installment No', 'instalmentNo', 'No']), rowNumber)))
      );
      const dueDate = normalizeImportDate(pickRaw(m, ['Due Date', 'dueDate']));
      const amountDue = Math.max(0, safeNum(pickRaw(m, ['Amount Due', 'amountDue', 'Instalment Amount']), 0));
      const amountPaid = Math.max(0, safeNum(pickRaw(m, ['Amount Paid', 'amountPaid']), 0));
      const outstandingAmount = Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100);
      const paymentDate = normalizeImportDate(pickRaw(m, ['Payment Date', 'paymentDate']));
      const verifiedRaw = pickRaw(m, ['Payment Verified', 'paymentVerified', 'Verified']);
      const paymentVerified: 'Yes' | 'No' = parseBool(verifiedRaw, false) ? 'Yes' : 'No';
      const followUpStatus = pickStr(
        m,
        ['Follow-Up Status', 'Follow Up Status', 'followUpStatus', 'Status'],
        60,
        outstandingAmount === 0 && amountDue > 0
          ? paymentVerified === 'Yes'
            ? 'Verified Paid'
            : 'Paid - Pending Verification'
          : amountPaid > 0
          ? 'Partially Paid'
          : 'Pending'
      );
      const parentDocId = sanitizeDocId(cp204Id, 'CP204');
      const instalmentId =
        pickStr(m, ['Instalment ID', 'instalmentId'], 40) ||
        `${parentDocId}-I${String(instalmentNo).padStart(2, '0')}`;
      const instObj: Cp204Instalment = {
        instalmentId,
        instalmentNo,
        dueDate,
        amountDue,
        amountPaid,
        paymentDate,
        paymentReference: pickStr(m, ['Payment Reference', 'Receipt Ref', 'paymentReference', 'receiptRef'], 80),
        paymentVerified,
        outstandingAmount,
        followUpStatus,
        remarks: pickStr(m, ['Remarks', 'Notes'], 500),
      };
      return {
        rowNumber,
        docId: `${parentDocId}_I${instalmentNo}`,
        parentDocId,
        valid: true,
        payload: { cp204Id, instalment: instObj },
        preview: {
          cp204Id,
          instalmentNo,
          dueDate: dueDate || '—',
          amountDue,
          amountPaid,
          followUpStatus,
        },
      };
    }

    case 'taxPayments': {
      const paymentId = pickStr(m, ['Payment ID', 'paymentId', 'ID'], 40);
      const clientId = pickStr(m, ['Client ID', 'clientId'], 40);
      const clientName = pickStr(m, ['Client Name', 'clientName'], 200);
      if (!paymentId || !clientId || !clientName) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Requires Payment ID, Client ID, and Client Name',
          payload: {},
          preview: { paymentId: paymentId || '—', clientName: clientName || '—' },
        };
      }
      const paymentType = matchEnum<TaxPaymentType>(
        pickRaw(m, ['Payment Type', 'paymentType', 'Type']),
        PAYMENT_TYPES,
        'Other Tax Payment'
      );
      const amountDue = Math.max(0, safeNum(pickRaw(m, ['Amount Due', 'amountDue']), 0));
      const amountPaid = Math.max(0, safeNum(pickRaw(m, ['Amount Paid', 'amountPaid']), 0));
      const outstandingAmount = Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100);
      const verificationStatus = matchEnum<TaxPaymentVerificationStatus>(
        pickRaw(m, ['Verification Status', 'verificationStatus']),
        PAYMENT_VERIFICATIONS,
        'Not Verified'
      );
      const followUpStatus = matchEnum<TaxPaymentFollowUpStatus>(
        pickRaw(m, ['Follow-Up Status', 'Follow Up Status', 'followUpStatus', 'Status']),
        PAYMENT_FOLLOWUPS,
        outstandingAmount === 0 && amountDue > 0 ? 'Paid - Pending Verification' : 'Pending'
      );

      const payload: Record<string, unknown> = {
        paymentId,
        clientId,
        clientName,
        paymentType,
        ya: pickStr(m, ['YA', 'Year of Assessment'], 16),
        referenceCaseNo: pickStr(m, ['Reference / Case No', 'Reference Case No', 'referenceCaseNo'], 80),
        dueDate: normalizeImportDate(pickRaw(m, ['Due Date', 'dueDate'])),
        amountDue,
        amountPaid,
        outstandingAmount,
        paymentDate: normalizeImportDate(pickRaw(m, ['Payment Date', 'paymentDate'])),
        paymentReference: pickStr(m, ['Payment Reference', 'Receipt No', 'paymentReference'], 80),
        verificationStatus,
        followUpStatus,
        remarks: pickStr(m, ['Remarks', 'Notes'], 2000),
      };

      return {
        rowNumber,
        docId: sanitizeDocId(paymentId, 'PAY'),
        valid: true,
        payload,
        preview: {
          paymentId,
          clientName,
          paymentType,
          amountDue,
          amountPaid,
          followUpStatus,
        },
      };
    }

    case 'correspondence': {
      const correspondenceId = pickStr(m, ['Correspondence ID', 'correspondenceId', 'ID'], 40);
      const clientId = pickStr(m, ['Client ID', 'clientId'], 40);
      const clientName = pickStr(m, ['Client Name', 'clientName'], 200);
      const letterSubject = pickStr(m, ['Letter Subject', 'Subject', 'letterSubject'], 200);
      const dateReceived =
        normalizeImportDate(pickRaw(m, ['Date Received', 'dateReceived', 'Letter Date'])) ||
        new Date().toISOString().slice(0, 10);

      if (!correspondenceId || !clientId || !clientName || !letterSubject) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Requires Correspondence ID, Client ID, Client Name, and Letter Subject',
          payload: {},
          preview: { correspondenceId: correspondenceId || '—', clientName: clientName || '—' },
        };
      }

      const methodReceived = matchEnum<CorrespondenceMethod>(
        pickRaw(m, ['Method Received', 'methodReceived']),
        CORR_METHODS,
        'Email'
      );
      const category = matchEnum<CorrespondenceCategory>(
        pickRaw(m, ['Category']),
        CORR_CATEGORIES,
        'LHDN'
      );
      const letterType = matchEnum<CorrespondenceLetterType>(
        pickRaw(m, ['Letter Type', 'letterType', 'Type']),
        CORR_LETTER_TYPES,
        'Notice'
      );
      const actionStatus = matchEnum<CorrespondenceActionStatus>(
        pickRaw(m, ['Action Status', 'actionStatus', 'Status']),
        CORR_STATUSES,
        'Pending'
      );

      const payload: Record<string, unknown> = {
        correspondenceId,
        clientId,
        clientName,
        ya: pickStr(m, ['YA', 'Year of Assessment'], 16),
        jobId: pickStr(m, ['Job ID', 'jobId'], 128),
        dateReceived,
        methodReceived,
        category,
        letterType,
        letterSubject,
        letterReferenceNo: pickStr(m, ['Letter Reference No', 'Ref No', 'letterReferenceNo'], 100),
        detailedInformation: pickStr(m, ['Detailed Information', 'Details', 'detailedInformation'], 3000),
        dueDate: normalizeImportDate(pickRaw(m, ['Due Date', 'Response Due Date', 'dueDate'])),
        actionRequired: pickStr(m, ['Action Required', 'actionRequired'], 500),
        pic: pickStr(m, ['PIC', 'Tax PIC'], 120),
        actionStatus,
        actionDate: normalizeImportDate(pickRaw(m, ['Action Date', 'actionDate'])),
        remarks: pickStr(m, ['Remarks', 'Notes'], 2000),
        attachmentUrl: pickStr(m, ['Attachment URL', 'attachmentUrl'], 500),
      };

      return {
        rowNumber,
        docId: sanitizeDocId(correspondenceId, 'CORR'),
        valid: true,
        payload,
        preview: {
          correspondenceId,
          clientName,
          dateReceived,
          category,
          letterSubject,
          actionStatus,
        },
      };
    }

    case 'workDone': {
      const workDoneId = pickStr(m, ['Work Done ID', 'workDoneId', 'ID'], 40);
      const clientId = pickStr(m, ['Client ID', 'clientId'], 40);
      const clientName = pickStr(m, ['Client Name', 'clientName'], 200);
      if (!workDoneId || !clientId || !clientName) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Requires Work Done ID, Client ID, and Client Name',
          payload: {},
          preview: { workDoneId: workDoneId || '—', clientName: clientName || '—' },
        };
      }

      const pricingMode = matchEnum<WorkDonePricingMode>(
        pickRaw(m, ['Pricing Mode', 'pricingMode']),
        WD_PRICING_MODES,
        'Overall Fee'
      );
      const workDoneStatus = matchEnum<WorkDoneStatus>(
        pickRaw(m, ['Work Done Status', 'workDoneStatus', 'Status']),
        WD_STATUSES,
        'Draft'
      );
      const financeInvoiceStatus = matchEnum<FinanceInvoiceStatus>(
        pickRaw(m, ['Finance Invoice Status', 'financeInvoiceStatus', 'Invoice Status']),
        FIN_STATUSES,
        'Not Submitted'
      );
      const additionalCharges = safeNum(pickRaw(m, ['Additional Charges', 'additionalCharges']), 0);
      const finalPrice = safeNum(pickRaw(m, ['Final Price', 'finalPrice', 'Agreed Fee']), 0);
      const sstAmount = pickOptNum(m, ['SST Amount', 'sstAmount']) ?? 0;
      const totalInvoiceAmount =
        pickOptNum(m, ['Total Invoice Amount', 'totalInvoiceAmount']) ??
        Math.round((finalPrice + additionalCharges + sstAmount) * 100) / 100;

      const payload: Record<string, unknown> = {
        workDoneId,
        jobId: pickStr(m, ['Job ID', 'jobId'], 128),
        clientId,
        clientName,
        ya: pickStr(m, ['YA', 'Year of Assessment'], 16),
        jobType: pickStr(m, ['Job Type', 'jobType'], 60),
        pic: pickStr(m, ['PIC', 'Tax PIC'], 120),
        reviewer: pickStr(m, ['Reviewer'], 120),
        jobStatus: pickStr(m, ['Job Status', 'jobStatus'], 60),
        workDoneDescription: pickStr(m, ['Work Done Description', 'Description', 'workDoneDescription'], 4000),
        pricingMode,
        auditFee: pickOptNum(m, ['Audit Fee', 'auditFee']) ?? null,
        quotationPrice: pickOptNum(m, ['Quotation Price', 'quotationPrice']) ?? null,
        priorYearPrice: pickOptNum(m, ['Prior Year Price', 'priorYearPrice']) ?? null,
        hodPrice: pickOptNum(m, ['HOD Price', 'hodPrice']) ?? null,
        additionalCharges,
        finalPrice,
        sstAmount,
        totalInvoiceAmount,
        workDoneStatus,
        financeInvoiceStatus,
        invoiceNo: pickStr(m, ['Invoice No', 'invoiceNo'], 80),
        issueDate: normalizeImportDate(pickRaw(m, ['Issue Date', 'Invoice Date', 'issueDate'])),
        cancellationDate: normalizeImportDate(pickRaw(m, ['Cancellation Date', 'cancellationDate'])),
        cancellationReason: pickStr(m, ['Cancellation Reason', 'cancellationReason'], 500),
        remarks: pickStr(m, ['Remarks', 'Notes'], 2000),
      };

      const rawAlloc = pickRaw(m, ['feeAllocations']);
      if (Array.isArray(rawAlloc)) {
        payload.feeAllocations = rawAlloc
          .filter((item): item is Record<string, unknown> => isPlainObject(item))
          .slice(0, 50)
          .map((item) => sanitizeFirestorePayload(item));
      }

      return {
        rowNumber,
        docId: sanitizeDocId(workDoneId, 'WD'),
        valid: true,
        payload,
        preview: {
          workDoneId,
          clientName,
          ya: String(payload.ya || '—'),
          finalPrice,
          workDoneStatus,
          financeInvoiceStatus,
        },
      };
    }

    case 'workDone_allocations': {
      const workDoneId = pickStr(m, ['Work Done ID', 'workDoneId', 'Parent Work Done ID'], 40);
      const description = pickStr(m, ['Description', 'Work Description', 'Item Description'], 500);
      if (!workDoneId || !description) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Requires Work Done ID and Description',
          payload: {},
          preview: { workDoneId: workDoneId || '—', description: description || '—' },
        };
      }
      const lineNo = Math.max(1, Math.round(safeNum(pickRaw(m, ['Line No', 'lineNo', 'No']), rowNumber)));
      const fee = safeNum(pickRaw(m, ['Fee', 'Amount', 'Allocated Fee']), 0);
      const allocObj: WorkDoneFeeAllocation = { lineNo, description, fee };
      const parentDocId = sanitizeDocId(workDoneId, 'WD');
      return {
        rowNumber,
        docId: `${parentDocId}_L${lineNo}`,
        parentDocId,
        valid: true,
        payload: { workDoneId, allocation: allocObj },
        preview: { workDoneId, lineNo, description, fee },
      };
    }

    case 'calendarEvents': {
      const title = pickStr(m, ['Title', 'Event Title', 'Summary'], 160);
      const startDate = normalizeImportDate(pickRaw(m, ['Start Date', 'startDate', 'Date']));
      if (!title || !startDate) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Requires Title and valid Start Date',
          payload: {},
          preview: { title: title || '—', startDate: startDate || '—' },
        };
      }
      const endDate = normalizeImportDate(pickRaw(m, ['End Date', 'endDate'])) || startDate;
      const eventType = pickStr(m, ['Event Type', 'eventType', 'Type'], 40, 'Internal Event');
      const assignedTo = pickStr(m, ['Assigned To', 'Staff', 'Staff Name', 'assignedTo'], 120);
      const rawColor = pickStr(m, ['Color', 'Hex Color'], 16);
      const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : '';
      const rawId = pickStr(m, ['Event ID', 'eventId', 'ID'], 100);
      const docId = rawId
        ? sanitizeDocId(rawId, 'EVT')
        : sanitizeDocId(`EVT_${startDate}_${assignedTo || 'ALL'}_${title.slice(0, 28)}`, 'EVT');

      const payload: Record<string, unknown> = {
        title,
        eventType,
        startDate,
        endDate: endDate >= startDate ? endDate : startDate,
        assignedTo,
        clientId: pickStr(m, ['Client ID', 'clientId'], 64),
        clientName: pickStr(m, ['Client Name', 'clientName'], 200),
        timeOffNote: pickStr(m, ['Time-Off Note', 'Hours / Time Note', 'timeOffNote'], 200),
        notes: pickStr(m, ['Notes', 'Remarks', 'Description'], 1000),
      };
      if (color) payload.color = color;

      return {
        rowNumber,
        docId,
        valid: true,
        payload,
        preview: {
          eventType,
          title,
          assignedTo: assignedTo || 'Firm-Wide',
          startDate,
          endDate: String(payload.endDate),
        },
      };
    }

    case 'staff': {
      // Security: NEVER import Password Hash, Password Salt, or password fields.
      const staffId = pickStr(m, ['Staff ID', 'ID', 'Staff Code', 'Code', 'staffId'], 32);
      const staffName = pickStr(m, ['Staff Name', 'Name', 'Full Name', 'staffName'], 120);
      const email = pickStr(
        m,
        ['Email', 'Staff Email', 'Login Email', 'Google Email', 'Email Address', 'Sign-in Email', 'email'],
        160
      ).toLowerCase();

      if (!staffId) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Missing required Staff ID',
          payload: {},
          preview: {
            staffId: '—',
            staffName: staffName || '—',
            email: email || '(Pending Email)',
            role: '—',
            active: '—',
          },
        };
      }
      if (!staffName) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Missing required Staff Name',
          payload: {},
          preview: {
            staffId,
            staffName: '—',
            email: email || '(Pending Email)',
            role: '—',
            active: '—',
          },
        };
      }
      if (email && (email.length < 3 || !email.includes('@'))) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: `Invalid Email format ("${email}") — leave blank if not assigned yet`,
          payload: {},
          preview: {
            staffId,
            staffName,
            email,
            role: '—',
            active: '—',
          },
        };
      }

      const roleRaw = pickStr(m, ['Role', 'User Role', 'Access Role', 'Permission', 'role'], 40, '');
      let role: StaffRole = 'Staff';
      if (roleRaw) {
        const rl = roleRaw.toLowerCase();
        if (rl.includes('admin')) role = 'Admin';
        else if (rl.includes('manager') || rl.includes('hod') || rl.includes('partner')) role = 'Manager-HOD';
        else if (rl.includes('viewer') || rl.includes('read')) role = 'Report Viewer';
        else role = matchEnum<StaffRole>(roleRaw, STAFF_ROLES, 'Staff');
      }

      const active = parseBool(pickRaw(m, ['Active', 'Status', 'Is Active', 'active']), true);
      const payload: Record<string, unknown> = {
        staffId,
        staffName,
        email,
        role,
        active,
        department: pickStr(m, ['Department'], 80),
        designation: pickStr(m, ['Designation', 'Title'], 80),
        phone: pickStr(m, ['Phone', 'Contact No'], 40),
        joinDate: normalizeImportDate(
          pickRaw(m, ['Join Date', 'joinDate', 'Date Joined', 'Start Date', 'Employment Start'])
        ),
        leaveDate: normalizeImportDate(
          pickRaw(m, ['Leave Date', 'leaveDate', 'Resign Date', 'Date Left', 'Date Resigned', 'Last Day'])
        ),
      };

      const docId = `STF_${sanitizeDocId(staffId, 'STAFF')}`;

      return {
        rowNumber,
        docId,
        valid: true,
        payload,
        preview: {
          staffId,
          staffName,
          email: email || '(Pending Email)',
          role,
          active: active ? 'Active' : 'Inactive',
        },
      };
    }

    case 'settings': {
      const group = normalizeSettingGroup(
        pickStr(m, ['Group', 'Setting Group', 'Category'], 64)
      ).slice(0, 64);
      const displayName = pickStr(m, ['Display Name', 'Value', 'Label', 'displayName'], 120);
      const code =
        pickStr(m, ['Code', 'Key'], 64).toUpperCase().replace(/\s+/g, '_') ||
        displayName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 64);
      if (!group || !code || !displayName) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Requires Group, Code (or Display Name)',
          payload: {},
          preview: { group: group || '—', code: code || '—', displayName: displayName || '—' },
        };
      }
      const rawColor = pickStr(m, ['Badge Color', 'Color', 'badgeColor'], 16);
      const badgeColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : '#0F766E';
      const sortOrder = Math.max(0, Math.min(9999, Math.round(safeNum(pickRaw(m, ['Sort Order', 'Order', 'sortOrder']), rowNumber))));
      const active = parseBool(pickRaw(m, ['Active', 'Is Active']), true);
      const moduleVal = pickStr(m, ['Module'], 64);

      const payload: Record<string, unknown> = {
        group,
        code,
        displayName,
        module: moduleVal,
        badgeColor,
        active,
        sortOrder,
      };

      return {
        rowNumber,
        docId: sanitizeDocId(`${group}_${code}`, 'SET'),
        valid: true,
        payload,
        preview: {
          group,
          code,
          displayName,
          module: moduleVal || 'Global',
          badgeColor,
        },
      };
    }

    case 'history': {
      const jobId = pickStr(m, ['Job ID', 'jobId', 'Record ID'], 128);
      const action = pickStr(m, ['Action', 'Event'], 64);
      const user = pickStr(m, ['User', 'Changed By', 'Email', 'Staff'], 160);
      if (!jobId || !action || !user) {
        return {
          rowNumber,
          docId: '',
          valid: false,
          reason: 'Requires Job ID, Action, and User',
          payload: {},
          preview: { jobId: jobId || '—', action: action || '—', user: user || '—' },
        };
      }
      const oldStatus = pickStr(m, ['Old Status', 'oldStatus', 'From Status'], 60);
      const newStatus = pickStr(m, ['New Status', 'newStatus', 'To Status'], 60);
      const remarks = pickStr(m, ['Remarks', 'Notes', 'Details'], 1000);
      const rawId = pickStr(m, ['History ID', 'historyId', 'ID'], 100);
      const docId = rawId
        ? sanitizeDocId(rawId, 'HIS')
        : sanitizeDocId(`HIS_${jobId}_${action}_${rowNumber}`, 'HIS');

      const payload: Record<string, unknown> = {
        jobId,
        action,
        oldStatus,
        newStatus,
        user,
        remarks,
      };

      return {
        rowNumber,
        docId,
        valid: true,
        payload,
        preview: { jobId, action, oldStatus: oldStatus || '—', newStatus: newStatus || '—', user },
      };
    }
  }
}

/**
 * Generates and downloads a clean blank Excel (.xlsx) template with exact headers
 * for the selected collection.
 */
export function downloadBlankTemplate(targetKey: ImportTargetKey): void {
  try {
    const def = getTargetDefinition(targetKey);
    const worksheet = XLSX.utils.aoa_to_sheet([def.templateHeaders]);
    worksheet['!cols'] = def.templateHeaders.map((h) => ({ wch: Math.max(14, h.length + 4) }));
    const workbook = XLSX.utils.book_new();
    const safeSheet = TEMPLATE_SHEET_NAMES[targetKey].slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheet);

    const filename = `TPMS_Import_Template_${def.key}.xlsx`;
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerBlobDownload(blob, filename);
    showToast(`Downloaded ${filename}`, 'success', 3000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Failed to generate template: ${msg}`, 'error');
  }
}

/**
 * Generates and downloads a 1-file multi-sheet blank Excel (.xlsx) workbook
 * containing all 13 TPMS tabs in dependency order.
 */
export function downloadFullCombinedBlankTemplate(): void {
  try {
    const workbook = XLSX.utils.book_new();
    for (const key of FULL_IMPORT_ORDER) {
      const def = getTargetDefinition(key);
      const ws = XLSX.utils.aoa_to_sheet([def.templateHeaders]);
      ws['!cols'] = def.templateHeaders.map((h) => ({ wch: Math.max(14, h.length + 4) }));
      XLSX.utils.book_append_sheet(workbook, ws, TEMPLATE_SHEET_NAMES[key].slice(0, 31));
    }

    const filename = 'TPMS_Full_Combined_Import_Template.xlsx';
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerBlobDownload(blob, filename);
    showToast(`Downloaded ${filename}`, 'success', 3200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Failed to generate combined template: ${msg}`, 'error');
  }
}

