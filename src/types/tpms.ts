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
  feeAmount?: number;
  billedAmount?: number;
  billingStatus?: string;
  hoursSpent?: number;
  remarks?: string;
  // Corporate / Individual / Form E
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

export interface CalendarEvent {
  id: string;
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  assignedTo?: string;
  clientId?: string;
  clientName?: string;
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

/**
 * Clamp strings strictly to firebase-blueprint.json maxLength limits prior to write.
 */
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
