import { Timestamp } from 'firebase/firestore';

export type StaffRole = 'Admin' | 'Manager-HOD' | 'Staff' | 'Report Viewer';

export type NavRoute =
  | 'dashboard'
  | 'team-calendar'
  | 'client-master'
  | 'all-jobs'
  | 'cp204'
  | 'corporate'
  | 'individual'
  | 'ad-hoc'
  | 'form-e'
  | 'tax-payment-monitor'
  | 'correspondence'
  | 'work-done-finance'
  | 'basic-reports'
  | 'kpi-performance'
  | 'staff-settings';

export type JobModule =
  | 'CP204'
  | 'Corporate'
  | 'Individual'
  | 'Ad Hoc'
  | 'Form E'
  | 'Tax Payment Monitor'
  | 'Correspondence';

export const JOB_TYPES = [
  'Form C',
  'Form B',
  'Form BE',
  'Form M',
  'Form P',
  'Form E',
  'CP204',
  'CP204A',
  'CP204B',
  'MITRS',
  'Tax Audit',
  'RPGT / CKHT',
  'Tax Appeal',
  'Tax Refund',
  'Tax Residency',
  'Other',
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export const INDIVIDUAL_BATCH_JOB_TYPES: JobType[] = [
  'Form B',
  'Form BE',
  'Form M',
  'RPGT / CKHT',
  'Tax Appeal',
  'Tax Refund',
  'Tax Residency',
  'Other',
];

export const CORPORATE_BATCH_JOB_TYPES: JobType[] = [
  'Form C',
  'Form E',
  'Form P',
  'CP204',
  'CP204A',
  'CP204B',
  'MITRS',
  'Tax Audit',
  'RPGT / CKHT',
  'Tax Appeal',
  'Tax Refund',
  'Tax Residency',
  'Other',
];

export const COMPLIANCE_CHECKLIST_STEPS = [
  'Documents Received',
  'Accounts Received',
  'Tax Computation Prepared',
  'Internal Review Completed',
  'Client Approval Obtained',
  'Tax Return Submitted',
  'Submission Acknowledgement Received',
] as const;

export type ChecklistStepStatus = 'Pending' | 'Completed' | 'Not Applicable';

export interface ComplianceChecklistItem {
  step: string;
  status: ChecklistStepStatus;
  completedDate?: string;
  remarks?: string;
}

export interface DocumentFollowupItem {
  id: string;
  documentRequired: string;
  dateRequested: string;
  followUpDate: string;
  dateReceived: string;
  pic: string;
  status: string;
  remarks: string;
}

export interface JobHistoryEntry {
  id: string;
  timestamp?: Timestamp;
  jobId: string;
  action: string;
  oldStatus: string;
  newStatus: string;
  user: string;
  remarks: string;
}

export type ClientCategory = 'Corporate' | 'Individual' | 'Other';

export const CLIENT_STATUS_OPTIONS = [
  'Active',
  'Resigned',
  'Winding-Up',
  'Strike-Off',
  'Tax File Cancelled',
  'One-Off',
  'Re-appoint',
  'Transfer T.Agent',
] as const;

export const FYE_MONTHS = [
  '01', '02', '03', '04', '05', '06',
  '07', '08', '09', '10', '11', '12',
] as const;

export interface StaffMember {
  id: string;
  staffId: string;
  staffName: string;
  email: string;
  role: StaffRole;
  active: boolean;
  noLogin?: boolean;
  department?: string;
  designation?: string;
  phone?: string;
  uid?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SettingValue {
  id: string;
  group: string;
  code: string;
  displayName: string;
  module: string;
  badgeColor: string;
  active: boolean;
  sortOrder: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BusinessHistoryItem {
  id: string;
  businessName: string;
  businessType: string;
  ssmNo: string;
  eNumber: string;
  startDate: string;
  endDate: string;
  status: string;
  remarks: string;
}

export interface RelatedPersonItem {
  id: string;
  personName: string;
  personNo: string;
  tin: string;
  relationship: string;
  role: string;
  phone: string;
  email: string;
  remarks: string;
}

export interface PartnershipPartnerItem {
  id: string;
  partnerName: string;
  icOrCompanyNo: string;
  tin: string;
  profitSharePct: string;
  joinDate: string;
  exitDate: string;
  status: string;
}

export interface YaMonitoringItem {
  id: string;
  ya: string;
  formType: string;
  filingDueDate: string;
  submissionDate: string;
  yaStatus: string;
  taxPayable: string;
  remarks: string;
}

export interface ClientRecord {
  id: string;
  // Core 40 fields
  clientId: string;
  clientName: string;
  companyNo: string;
  tin: string;
  fye: string;
  taxPic: string;
  category: ClientCategory;
  clientStatus: string;
  smeStatus: string;
  taxAgent: string;
  myTaxAppointment: string;
  eInvoiceStatus: string;
  sstRegistered: string;
  sstNo: string;
  email: string;
  phone: string;
  dateOfIncorporation: string;
  dateOfCommencementBusiness: string;
  dateOfEngagement: string;
  dateOfResigned: string;
  auditor: string;
  account: string;
  eNumber: string;
  specialRemarks: string;
  personNo: string;
  relationship: string;
  engagementStatus: string;
  businessName: string;
  businessType: string;
  businessSsmNo: string;
  businessENumber: string;
  businessStartDate: string;
  businessStatus: string;
  firstYa: string;
  firstYaStatus: string;
  secondYa: string;
  secondYaStatus: string;
  groupId: string;
  companySecretary: string;
  registeredAddress: string;
  // Relational schedules
  businessHistory: BusinessHistoryItem[];
  relatedPersons: RelatedPersonItem[];
  partnershipPartners: PartnershipPartnerItem[];
  yaMonitoring: YaMonitoringItem[];
  // Audit
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TaxJob {
  id: string;
  jobCode: string;
  module: JobModule;
  jobType?: JobType;
  clientDocId?: string;
  clientId: string;
  clientName: string;
  groupId?: string;
  fye?: string;
  ya?: string;
  taxPic?: string;
  reviewer?: string;
  status: string;
  priority?: string;
  dueDate?: string;
  completedDate?: string;
  // Deadlines & EOTs
  internalDeadline?: string;
  originalStatutoryDeadline?: string;
  ssmEot1?: string;
  ssmEot2?: string;
  ssmEot3?: string;
  lhdnEot1?: string;
  lhdnEot2?: string;
  lhdnEot3?: string;
  finalApplicableDeadline?: string;
  // Form C & MITRS
  auditBookInDate?: string;
  auditReportReceivedDate?: string;
  formCStatus?: string;
  formCDueDate?: string;
  formCSubmissionDate?: string;
  formCSubmissionReference?: string;
  mitrsStatus?: string;
  mitrsDueDate?: string;
  mitrsSubmissionDate?: string;
  mitrsSubmissionReference?: string;
  // Workflow & Accounts
  dateDocumentsRequested?: string;
  dateDocumentsReceived?: string;
  draftDate?: string;
  reviewDate?: string;
  clientConfirmationDate?: string;
  yaStatus?: string;
  auditor?: string;
  accountsStatus?: string;
  accountBookInDate?: string;
  accountReturnDate?: string;
  accountReturnStatus?: string;
  submissionStatus?: string;
  submissionReference?: string;
  personNo?: string;
  yaSequence?: string;
  finalTaxPayable?: number;
  finalTaxPayableDate?: string;
  // Form E sub-statuses
  formEStatus?: string;
  cp8dStatus?: string;
  formEaStatus?: string;
  // Embedded arrays
  complianceChecklist?: ComplianceChecklistItem[];
  documentFollowups?: DocumentFollowupItem[];
  // Finance / Billing
  feeAmount?: number;
  billedAmount?: number;
  billingStatus?: string;
  hoursSpent?: number;
  remarks?: string;
  // Legacy / Specialized module fields
  formType?: string;
  submissionDate?: string;
  eFilingAckNo?: string;
  taxPayable?: number;
  taxRefundable?: number;
  // CP204
  cp204Estimate?: number;
  cp204Revised6th?: number;
  cp204Revised9th?: number;
  cp204Revised11th?: number;
  cp204InstallmentStart?: string;
  // Tax Payment Monitor
  paymentType?: string;
  installmentNo?: string;
  amountDue?: number;
  amountPaid?: number;
  paymentDate?: string;
  receiptNo?: string;
  // Correspondence
  correspondenceType?: string;
  letterRefNo?: string;
  letterDate?: string;
  responseDueDate?: string;
  responseSentDate?: string;
  // Audit
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// =============================================================================
// CP204 Monitoring (cp204 collection)
// =============================================================================
export const CP204_STATUS_OPTIONS = [
  'In Progress',
  'Pending Review',
  'Submitted',
  'Self-submit by Client',
  'Completed',
  'On Hold',
] as const;

export type Cp204Status = (typeof CP204_STATUS_OPTIONS)[number];

export const CP204_REVISION_MONTHS = ['6', '9', '11'] as const;
export type Cp204RevisionMonth = (typeof CP204_REVISION_MONTHS)[number];

export const CP204_REVISION_STATUS_OPTIONS = [
  'In Progress',
  'Pending Review',
  'Approved',
  'Submitted',
  'Completed',
  'On Hold',
  'Client Self-Submit',
] as const;

export type Cp204RevisionStatus = (typeof CP204_REVISION_STATUS_OPTIONS)[number];

export interface Cp204Revision {
  revisionId: string;
  revisionMonth: Cp204RevisionMonth;
  previousEstimatedTax: number;
  proposedEstimatedTax: number;
  variance: number;
  reason: string;
  reviewStatus: Cp204RevisionStatus;
  pic: string;
  reviewer: string;
  submissionDeadline: string;
  submissionDate: string;
  acknowledgementUrl: string;
  remarks: string;
}

export interface Cp204Instalment {
  instalmentId: string;
  instalmentNo: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  paymentDate: string;
  paymentReference: string;
  paymentVerified: 'Yes' | 'No';
  outstandingAmount: number;
  followUpStatus: string;
  remarks: string;
}

export interface Cp204Record {
  id: string;
  cp204Id: string;
  clientId: string;
  clientName: string;
  ya: string;
  fye: string;
  basisPeriodStart: string;
  basisPeriodEnd: string;
  originalEstimatedTax: number;
  originalSubmissionDate: string;
  currentEstimatedTax: number;
  statutoryCp204DueDate: string;
  pic: string;
  reviewer: string;
  status: Cp204Status;
  acknowledgementUrl: string;
  remarks: string;
  revisions: Cp204Revision[];
  instalments: Cp204Instalment[];
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// =============================================================================
// Tax Payment Monitor (taxPayments collection)
// =============================================================================
export const TAX_PAYMENT_TYPES = [
  'CP204 Instalment',
  'Final Tax',
  'Form C Balance',
  'Tax Audit Settlement',
  'Compound / Penalty',
  'CP500 Instalment',
  'RPGT / CKHT',
  'Withholding Tax',
  'Other Tax Payment',
] as const;

export type TaxPaymentType = (typeof TAX_PAYMENT_TYPES)[number];

export const TAX_PAYMENT_VERIFICATION_STATUSES = [
  'Not Verified',
  'Pending Verification',
  'Verified',
  'Rejected / Mismatch',
] as const;

export type TaxPaymentVerificationStatus = (typeof TAX_PAYMENT_VERIFICATION_STATUSES)[number];

export const TAX_PAYMENT_FOLLOWUP_STATUSES = [
  'Pending',
  'Partially Paid',
  'Paid - Pending Verification',
  'Verified Paid',
  'Overdue',
  'On Hold',
] as const;

export type TaxPaymentFollowUpStatus = (typeof TAX_PAYMENT_FOLLOWUP_STATUSES)[number];

export interface TaxPaymentRecord {
  id: string;
  paymentId: string;
  clientId: string;
  clientName: string;
  paymentType: TaxPaymentType;
  ya: string;
  referenceCaseNo: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  outstandingAmount: number;
  paymentDate: string;
  paymentReference: string;
  verificationStatus: TaxPaymentVerificationStatus;
  followUpStatus: TaxPaymentFollowUpStatus;
  remarks: string;
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// =============================================================================
// Correspondence (correspondence collection)
// =============================================================================
export const CORRESPONDENCE_METHODS = [
  'Email',
  'Post',
  'Portal',
  'Hand Delivered',
  'Other',
] as const;

export type CorrespondenceMethod = (typeof CORRESPONDENCE_METHODS)[number];

export const CORRESPONDENCE_CATEGORIES = [
  'LHDN',
  'SSM',
  'Client',
  'Auditor',
  'Other',
] as const;

export type CorrespondenceCategory = (typeof CORRESPONDENCE_CATEGORIES)[number];

export const CORRESPONDENCE_LETTER_TYPES = [
  'Notice',
  'Query',
  'Assessment',
  'Audit',
  'Appeal',
  'Reminder',
  'Other',
] as const;

export type CorrespondenceLetterType = (typeof CORRESPONDENCE_LETTER_TYPES)[number];

export const CORRESPONDENCE_ACTION_STATUSES = [
  'Pending',
  'In Progress',
  'Completed',
  'No Action Required',
  'Cancelled',
] as const;

export type CorrespondenceActionStatus = (typeof CORRESPONDENCE_ACTION_STATUSES)[number];

export interface CorrespondenceRecord {
  id: string;
  correspondenceId: string;
  clientId: string;
  clientName: string;
  ya: string;
  jobId: string;
  dateReceived: string;
  methodReceived: CorrespondenceMethod;
  category: CorrespondenceCategory;
  letterType: CorrespondenceLetterType;
  letterSubject: string;
  letterReferenceNo: string;
  detailedInformation: string;
  dueDate: string;
  actionRequired: string;
  pic: string;
  actionStatus: CorrespondenceActionStatus;
  actionDate: string;
  remarks: string;
  attachmentUrl: string;
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// =============================================================================
// Work Done & Finance (workDone collection)
// =============================================================================
export const WORK_DONE_PRICING_MODES = ['Overall Fee', 'Individual Allocation'] as const;
export type WorkDonePricingMode = (typeof WORK_DONE_PRICING_MODES)[number];

export const WORK_DONE_STATUSES = [
  'Draft',
  'Quotation Pending Approval',
  'Quotation Issued',
  'In Progress',
  'Completed — Pending Finance',
  'Returned by Finance',
  'Ready for Invoicing',
  'Invoiced',
  'Cancelled',
] as const;
export type WorkDoneStatus = (typeof WORK_DONE_STATUSES)[number];

export const FINANCE_INVOICE_STATUSES = [
  'Not Submitted',
  'Pending Review',
  'Returned',
  'Ready for Invoicing',
  'Invoiced',
  'Cancelled',
] as const;
export type FinanceInvoiceStatus = (typeof FINANCE_INVOICE_STATUSES)[number];

export interface WorkDoneFeeAllocation {
  lineNo: number;
  description: string;
  fee: number;
}

export interface WorkDoneRecord {
  id: string;
  workDoneId: string;
  jobId: string;
  clientId: string;
  clientName: string;
  ya: string;
  jobType: string;
  pic: string;
  reviewer: string;
  jobStatus: string;
  workDoneDescription: string;
  pricingMode: WorkDonePricingMode;
  feeAllocations: WorkDoneFeeAllocation[];
  auditFee: number | null;
  quotationPrice: number | null;
  priorYearPrice: number | null;
  hodPrice: number | null;
  additionalCharges: number;
  finalPrice: number;
  sstAmount: number | null;
  totalInvoiceAmount: number;
  workDoneStatus: WorkDoneStatus;
  financeInvoiceStatus: FinanceInvoiceStatus;
  invoiceNo: string;
  issueDate: string;
  cancellationDate: string;
  cancellationReason: string;
  remarks: string;
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface NavigationFilterPreset {
  fye?: string;
  ya?: string;
  search?: string;
  jobId?: string;
  nonce: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  assignedTo?: string;
  clientId?: string;
  clientName?: string;
  color?: string;
  notes?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface NotificationItem {
  id: string;
  type: 'announcement' | 'suggestion' | 'system';
  title: string;
  message: string;
  authorEmail: string;
  authorName: string;
  authorRole: string;
  targetRole: 'ALL' | 'Admin' | 'Manager-HOD';
  readBy: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  optional?: boolean;
  align?: 'left' | 'right' | 'center';
}

export function clampStr(val: string | undefined | null, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

export function safeNum(val: string | number | undefined | null): number {
  if (val === '' || val === undefined || val === null) return 0;
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-999999999, Math.min(999999999999, n));
}

export function formatCurrencyRM(val: number | undefined | null): string {
  const num = Number(val ?? 0);
  return `RM ${num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sanitizeDocId(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return cleaned || `doc_${Date.now()}`;
}
