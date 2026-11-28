import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, emailToStaffKey, handleFirestoreError, OperationType } from '../lib/firebase';
import { DEFAULT_MALAYSIAN_TAX_SETTINGS } from '../lib/defaultSettings';
import { normalizeSettingGroup } from '../lib/settingsDropdown';
import { applyMalaysianJobRules } from '../lib/deadlineUtils';
import { isJobOpenForWork, normalizeClientIdKey } from '../lib/jobUtils';
import {
  computeCp204CurrentEstimatedTax,
  generateNextSequentialId,
  normalizeCp204Instalments,
  normalizeCp204Revisions,
  validateCp204Instalments,
} from '../modules/CP204/cp204Utils';
import {
  CalendarEvent,
  clampStr,
  ClientRecord,
  CorrespondenceRecord,
  Cp204Record,
  JobHistoryEntry,
  NotificationItem,
  PicHistoryEntry,
  safeNum,
  sanitizeDocId,
  SettingValue,
  StaffMember,
  StoredColumnPrefsV2,
  TaxJob,
  TaxPaymentRecord,
  WorkDoneFeeAllocation,
  WorkDoneRecord,
} from '../types/tpms';
import { useAuth } from './AuthContext';

export type JobSavePayload = Omit<
  TaxJob,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

export type Cp204SavePayload = Omit<
  Cp204Record,
  'id' | 'cp204Id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
> & { cp204Id?: string };

export type TaxPaymentSavePayload = Omit<
  TaxPaymentRecord,
  'id' | 'paymentId' | 'outstandingAmount' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
> & { paymentId?: string };

export type CorrespondenceSavePayload = Omit<
  CorrespondenceRecord,
  'id' | 'correspondenceId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
> & { correspondenceId?: string };

export type WorkDoneSavePayload = Omit<
  WorkDoneRecord,
  'id' | 'workDoneId' | 'finalPrice' | 'totalInvoiceAmount' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
> & { workDoneId?: string };

interface DataContextValue {
  staff: StaffMember[];
  settings: SettingValue[];
  clients: ClientRecord[];
  jobs: TaxJob[];
  history: JobHistoryEntry[];
  calendarEvents: CalendarEvent[];
  notifications: NotificationItem[];
  cp204Records: Cp204Record[];
  taxPayments: TaxPaymentRecord[];
  correspondenceRecords: CorrespondenceRecord[];
  workDoneRecords: WorkDoneRecord[];
  loading: boolean;
  refreshing: boolean;
  lastRefreshedAt: Date | null;
  refreshAll: () => void;
  getSettingsByGroup: (group: string, includeInactive?: boolean) => SettingValue[];
  resolveSettingBadge: (group: string, value: string | undefined | null) => {
    label: string;
    color: string;
  };
  getHistoryForJob: (jobId: string) => JobHistoryEntry[];
  // Staff CRUD (Admin)
  saveStaffMember: (
    member: Omit<StaffMember, 'id' | 'createdAt' | 'updatedAt'>,
    isEdit?: boolean,
    existingDocId?: string
  ) => Promise<void>;
  deleteStaffMember: (id: string) => Promise<void>;
  // Settings CRUD (Admin)
  saveSetting: (setting: Omit<SettingValue, 'createdAt' | 'updatedAt'>, isEdit?: boolean) => Promise<void>;
  deleteSetting: (id: string) => Promise<void>;
  seedDefaultSettings: () => Promise<number>;
  // Clients CRUD
  saveClient: (
    client: Omit<ClientRecord, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<string>;
  inactivateClient: (clientId: string, dateOfResigned: string) => Promise<void>;
  reactivateClient: (clientId: string) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  batchReassignClientPic: (params: {
    fromPic: string;
    toPic: string;
    clientDocIds: string[];
    cascadeToJobsAndCp204: boolean;
    note?: string;
  }) => Promise<{ clientsUpdated: number; jobsUpdated: number; cp204Updated: number }>;
  // Jobs CRUD + Batch Add + Audit History
  saveJob: (job: JobSavePayload, existingId?: string, auditRemarks?: string) => Promise<string>;
  batchCreateJobs: (items: JobSavePayload[]) => Promise<{ createdCount: number; skippedCount: number }>;
  batchUpdateJobs: (
    items: Array<{ id: string; data: JobSavePayload; auditRemark?: string }>
  ) => Promise<{ updatedCount: number }>;
  deleteJob: (jobId: string) => Promise<void>;
  // Calendar Events CRUD + Excluded Public Holidays
  excludedHolidays: string[];
  excludePublicHoliday: (holidayKey: string) => Promise<void>;
  restorePublicHoliday: (holidayKey: string) => Promise<void>;
  restoreAllPublicHolidays: () => Promise<void>;
  saveCalendarEvent: (
    event: Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<string>;
  batchSaveCalendarEvents: (
    events: Array<
      Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
    >
  ) => Promise<string[]>;
  batchUpdateCalendarEvents: (
    updates: Array<{
      id: string;
      data: Partial<
        Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
      >;
    }>
  ) => Promise<void>;
  deleteCalendarEvent: (eventId: string) => Promise<void>;
  batchDeleteCalendarEvents: (eventIds: string[]) => Promise<void>;
  // CP204 Monitoring CRUD
  saveCp204: (record: Cp204SavePayload, existingId?: string) => Promise<string>;
  batchCreateCp204: (
    items: Cp204SavePayload[]
  ) => Promise<{ createdCount: number; skippedCount: number }>;
  deleteCp204: (id: string) => Promise<void>;
  // Tax Payment Monitor CRUD
  saveTaxPayment: (record: TaxPaymentSavePayload, existingId?: string) => Promise<string>;
  deleteTaxPayment: (id: string) => Promise<void>;
  // Correspondence CRUD
  saveCorrespondence: (record: CorrespondenceSavePayload, existingId?: string) => Promise<string>;
  deleteCorrespondence: (id: string) => Promise<void>;
  // Work Done & Finance CRUD
  saveWorkDone: (record: WorkDoneSavePayload, existingId?: string) => Promise<string>;
  deleteWorkDone: (id: string) => Promise<void>;
  // Notifications
  publishAnnouncement: (
    title: string,
    message: string,
    targetRole?: 'ALL' | 'Admin' | 'Manager-HOD'
  ) => Promise<void>;
  sendSuggestion: (title: string, message: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  localReadIds: string[];
  // Per-user persisted UI column preferences
  columnPreferences: Record<string, StoredColumnPrefsV2>;
  columnPreferencesLoaded: boolean;
  saveColumnPreference: (moduleKey: string, pref: StoredColumnPrefsV2) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

const LOCAL_READ_STORAGE_KEY = 'tpms_local_read_notifications_v1';
const EXCLUDED_HOLIDAYS_STORAGE_KEY = 'tpms_excluded_holidays_v1';

const REQUIRED_CLIENT_KEYS = new Set([
  'clientId',
  'clientName',
  'category',
  'clientStatus',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
]);

const REQUIRED_JOB_KEYS = new Set([
  'jobCode',
  'module',
  'clientId',
  'clientName',
  'status',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
]);

/**
 * Omits empty optional strings/zeros/arrays on create (and converts them to
 * deleteField() on update) so Firestore documents stay compact and security
 * rules skip unused field buckets well within the 1,000-expression CEL limit.
 */
function compactOptionalPayload(
  raw: Record<string, unknown>,
  requiredKeys: Set<string>,
  isUpdate: boolean,
  omitZeroNumbers = false
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (requiredKeys.has(key)) {
      result[key] = value;
      continue;
    }
    const isEmptyStr = typeof value === 'string' && value.length === 0;
    const isEmptyArr = Array.isArray(value) && value.length === 0;
    const isZeroNum = omitZeroNumbers && typeof value === 'number' && value === 0;

    if (value === undefined || isEmptyStr || isEmptyArr || isZeroNum) {
      if (isUpdate) {
        result[key] = deleteField();
      }
      continue;
    }
    result[key] = value;
  }
  return result;
}

function hydrateClientRecord(id: string, raw: Partial<ClientRecord>): ClientRecord {
  const resolvedFirstYa = raw.firstYA || raw.firstYa || '';
  return {
    id,
    clientId: raw.clientId ?? '',
    clientName: raw.clientName ?? '',
    companyNo: raw.companyNo ?? '',
    tin: raw.tin ?? '',
    fye: raw.fye ?? '',
    taxPic: raw.taxPic ?? '',
    category: raw.category ?? 'Corporate',
    clientStatus: raw.clientStatus ?? 'Active',
    smeStatus: raw.smeStatus ?? '',
    taxAgent: raw.taxAgent ?? '',
    myTaxAppointment: raw.myTaxAppointment ?? '',
    eInvoiceStatus: raw.eInvoiceStatus ?? '',
    sstRegistered: raw.sstRegistered ?? '',
    sstNo: raw.sstNo ?? '',
    email: raw.email ?? '',
    phone: raw.phone ?? '',
    dateOfIncorporation: raw.dateOfIncorporation ?? '',
    dateOfCommencementBusiness: raw.dateOfCommencementBusiness ?? '',
    dateOfEngagement: raw.dateOfEngagement ?? '',
    dateOfResigned: raw.dateOfResigned ?? '',
    auditor: raw.auditor ?? '',
    account: raw.account ?? '',
    eNumber: raw.eNumber ?? '',
    specialRemarks: raw.specialRemarks ?? '',
    personNo: raw.personNo ?? '',
    relationship: raw.relationship ?? '',
    engagementStatus: raw.engagementStatus ?? '',
    businessName: raw.businessName ?? '',
    businessType: raw.businessType ?? '',
    businessSsmNo: raw.businessSsmNo ?? '',
    businessENumber: raw.businessENumber ?? '',
    businessStartDate: raw.businessStartDate ?? '',
    businessStatus: raw.businessStatus ?? '',
    firstYa: resolvedFirstYa,
    firstYA: resolvedFirstYa,
    firstYaStatus: raw.firstYaStatus ?? '',
    secondYa: raw.secondYa ?? '',
    secondYaStatus: raw.secondYaStatus ?? '',
    groupId: raw.groupId ?? '',
    companySecretary: raw.companySecretary ?? '',
    registeredAddress: raw.registeredAddress ?? '',
    oldRegNo: raw.oldRegNo ?? '',
    principalActivity: raw.principalActivity1 || raw.principalActivity || '',
    principalActivity1: raw.principalActivity1 || raw.principalActivity || '',
    msicCode1: raw.msicCode1 ?? '',
    principalActivity2: raw.principalActivity2 ?? '',
    msicCode2: raw.msicCode2 ?? '',
    principalActivity3: raw.principalActivity3 ?? '',
    msicCode3: raw.msicCode3 ?? '',
    feeBillingNotes: raw.feeBillingNotes ?? '',
    eInvoiceImplDate: raw.eInvoiceImplDate ?? '',
    mitrsStatus: raw.mitrsStatus ?? '',
    cp204Status: raw.cp204Status ?? '',
    maritalStatus: raw.maritalStatus ?? '',
    spouseName: raw.spouseName ?? '',
    spouseTin: raw.spouseTin ?? '',
    employerDetails: raw.employerDetails ?? '',
    contactPerson: raw.contactPerson ?? '',
    correspondenceAddress: raw.correspondenceAddress ?? '',
    businessHistory: Array.isArray(raw.businessHistory) ? raw.businessHistory : [],
    relatedPersons: Array.isArray(raw.relatedPersons) ? raw.relatedPersons : [],
    partnershipPartners: Array.isArray(raw.partnershipPartners) ? raw.partnershipPartners : [],
    yaMonitoring: Array.isArray(raw.yaMonitoring) ? raw.yaMonitoring : [],
    picHistory: Array.isArray(raw.picHistory) ? raw.picHistory : [],
    createdBy: raw.createdBy ?? '',
    updatedBy: raw.updatedBy ?? '',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function buildSanitizedJobDocument(
  rawJob: JobSavePayload,
  actorEmail: string,
  isUpdate: boolean
) {
  const computed = applyMalaysianJobRules(rawJob, { applySubmissionAutoStatus: false });

  const rawPayload: Record<string, unknown> = {
    jobCode: clampStr(computed.jobCode, 40),
    module: computed.module,
    ...(computed.jobType ? { jobType: computed.jobType } : {}),
    clientDocId: clampStr(computed.clientDocId, 128),
    clientId: clampStr(computed.clientId, 40),
    clientName: clampStr(computed.clientName, 200),
    groupId: clampStr(computed.groupId, 60),
    fye: clampStr(computed.fye, 10),
    ya: clampStr(computed.ya, 16),
    taxPic: clampStr(computed.taxPic, 120),
    previousPic: clampStr(computed.previousPic, 120),
    reviewer: clampStr(computed.reviewer, 120),
    status: clampStr(computed.status || 'Not Started', 60),
    statusDate: clampStr(computed.statusDate, 20),
    priority: clampStr(computed.priority || 'Normal', 30),
    dueDate: clampStr(computed.dueDate, 20),
    completedDate: clampStr(computed.completedDate, 20),
    // Deadlines & EOTs
    internalDeadline: clampStr(computed.internalDeadline, 20),
    originalStatutoryDeadline: clampStr(computed.originalStatutoryDeadline, 20),
    ssmEot1: clampStr(computed.ssmEot1, 20),
    ssmEot2: clampStr(computed.ssmEot2, 20),
    ssmEot3: clampStr(computed.ssmEot3, 20),
    lhdnEot1: clampStr(computed.lhdnEot1, 20),
    lhdnEot2: clampStr(computed.lhdnEot2, 20),
    lhdnEot3: clampStr(computed.lhdnEot3, 20),
    finalApplicableDeadline: clampStr(computed.finalApplicableDeadline, 20),
    // Form C & MITRS
    auditType: clampStr(computed.auditType, 40),
    auditBookInDate: clampStr(computed.auditBookInDate, 20),
    auditReportReceivedDate: clampStr(computed.auditReportReceivedDate, 20),
    formCStatus: clampStr(computed.formCStatus, 60),
    formCDueDate: clampStr(computed.formCDueDate, 20),
    formCSubmissionDate: clampStr(computed.formCSubmissionDate, 20),
    formCSubmissionReference: clampStr(computed.formCSubmissionReference, 80),
    mitrsStatus: clampStr(computed.mitrsStatus, 60),
    mitrsDueDate: clampStr(computed.mitrsDueDate, 20),
    mitrsSubmissionDate: clampStr(computed.mitrsSubmissionDate, 20),
    mitrsSubmissionReference: clampStr(computed.mitrsSubmissionReference, 80),
    // Workflow & Accounts
    dateDocumentsRequested: clampStr(computed.dateDocumentsRequested, 20),
    dateDocumentsReceived: clampStr(computed.dateDocumentsReceived, 20),
    draftDate: clampStr(computed.draftDate, 20),
    reviewDate: clampStr(computed.reviewDate, 20),
    clientConfirmationDate: clampStr(computed.clientConfirmationDate, 20),
    yaStatus: clampStr(computed.yaStatus, 60),
    auditor: clampStr(computed.auditor, 120),
    accountsStatus: clampStr(computed.accountsStatus, 60),
    accountBookInDate: clampStr(computed.accountBookInDate, 20),
    accountReturnDate: clampStr(computed.accountReturnDate, 20),
    accountReturnStatus: clampStr(computed.accountReturnStatus, 60),
    submissionStatus: clampStr(computed.submissionStatus, 60),
    submissionReference: clampStr(computed.submissionReference, 80),
    personNo: clampStr(computed.personNo, 60),
    yaSequence: clampStr(computed.yaSequence, 40),
    totalTax: safeNum(computed.totalTax),
    cp204Payment: safeNum(computed.cp204Payment),
    underEstimatePenalty: safeNum(computed.underEstimatePenalty),
    finalTaxPayable: safeNum(computed.finalTaxPayable),
    finalTaxPayableDate: clampStr(computed.finalTaxPayableDate, 20),
    // Form E sub-statuses
    formEStatus: clampStr(computed.formEStatus, 60),
    cp8dStatus: clampStr(computed.cp8dStatus, 60),
    formEaStatus: clampStr(computed.formEaStatus, 60),
    // Embedded arrays
    complianceChecklist: (computed.complianceChecklist || []).slice(0, 20),
    documentFollowups: (computed.documentFollowups || []).slice(0, 50),
    // Finance & Remarks
    feeAmount: safeNum(computed.feeAmount),
    billedAmount: safeNum(computed.billedAmount),
    billingStatus: clampStr(computed.billingStatus || 'Unbilled WIP', 40),
    hoursSpent: safeNum(computed.hoursSpent),
    remarks: clampStr(computed.remarks, 2000),
    // Specialized module fields
    formType: clampStr(computed.formType || computed.jobType || '', 40),
    submissionDate: clampStr(computed.submissionDate, 20),
    eFilingAckNo: clampStr(computed.eFilingAckNo, 80),
    taxPayable: safeNum(computed.taxPayable),
    taxRefundable: safeNum(computed.taxRefundable),
    cp204Estimate: safeNum(computed.cp204Estimate),
    cp204Revised6th: safeNum(computed.cp204Revised6th),
    cp204Revised9th: safeNum(computed.cp204Revised9th),
    cp204Revised11th: safeNum(computed.cp204Revised11th),
    cp204InstallmentStart: clampStr(computed.cp204InstallmentStart, 20),
    paymentType: clampStr(computed.paymentType, 60),
    installmentNo: clampStr(computed.installmentNo, 20),
    amountDue: safeNum(computed.amountDue),
    amountPaid: safeNum(computed.amountPaid),
    paymentDate: clampStr(computed.paymentDate, 20),
    receiptNo: clampStr(computed.receiptNo, 80),
    correspondenceType: clampStr(computed.correspondenceType, 80),
    letterRefNo: clampStr(computed.letterRefNo, 80),
    letterDate: clampStr(computed.letterDate, 20),
    responseDueDate: clampStr(computed.responseDueDate, 20),
    responseSentDate: clampStr(computed.responseSentDate, 20),
    updatedBy: actorEmail,
    updatedAt: serverTimestamp(),
  };

  return {
    computedStatus: clampStr(computed.status || 'Not Started', 60),
    meta: {
      jobCode: clampStr(computed.jobCode, 40),
      jobType: computed.jobType || '',
      module: computed.module,
      ya: clampStr(computed.ya, 16),
      clientName: clampStr(computed.clientName, 200),
    },
    payload: compactOptionalPayload(rawPayload, REQUIRED_JOB_KEYS, isUpdate, true),
  };
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, staffProfile, accessStatus, isReadOnly } = useAuth();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [settings, setSettings] = useState<SettingValue[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [jobs, setJobs] = useState<TaxJob[]>([]);
  const [history, setHistory] = useState<JobHistoryEntry[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [cp204Records, setCp204Records] = useState<Cp204Record[]>([]);
  const [taxPayments, setTaxPayments] = useState<TaxPaymentRecord[]>([]);
  const [correspondenceRecords, setCorrespondenceRecords] = useState<CorrespondenceRecord[]>([]);
  const [workDoneRecords, setWorkDoneRecords] = useState<WorkDoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [localReadIds, setLocalReadIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_READ_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [columnPreferences, setColumnPreferences] = useState<Record<string, StoredColumnPrefsV2>>({});
  const [columnPreferencesLoaded, setColumnPreferencesLoaded] = useState(false);
  const columnPrefsRef = useRef<Record<string, StoredColumnPrefsV2>>({});
  const columnPrefsSaveTimerRef = useRef<number | null>(null);
  const [excludedHolidays, setExcludedHolidays] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(EXCLUDED_HOLIDAYS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  });
  const excludedHolidaysRef = useRef<string[]>(excludedHolidays);
  useEffect(() => {
    excludedHolidaysRef.current = excludedHolidays;
  }, [excludedHolidays]);

  useEffect(() => {
    if (accessStatus !== 'authorized' || !user) return;
    const calSettingsRef = doc(db, 'systemSettings', 'calendar');
    const unsubCalSettings = onSnapshot(
      calSettingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { excludedHolidays?: unknown };
          const list = Array.isArray(data?.excludedHolidays)
            ? Array.from(
                new Set(
                  data.excludedHolidays
                    .filter((x): x is string => typeof x === 'string')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean)
                )
              )
            : [];
          excludedHolidaysRef.current = list;
          setExcludedHolidays(list);
          try {
            localStorage.setItem(EXCLUDED_HOLIDAYS_STORAGE_KEY, JSON.stringify(list));
          } catch {
            // ignore storage errors
          }
        }
      },
      (err) => {
        console.warn('Unable to sync calendar excluded holidays from Firestore:', err);
      }
    );
    return () => unsubCalSettings();
  }, [accessStatus, user]);

  const persistExcludedHolidays = useCallback(
    async (nextList: string[]) => {
      const cleaned = Array.from(
        new Set(nextList.map((s) => s.trim().toLowerCase()).filter(Boolean))
      ).slice(0, 200);
      excludedHolidaysRef.current = cleaned;
      setExcludedHolidays(cleaned);
      try {
        localStorage.setItem(EXCLUDED_HOLIDAYS_STORAGE_KEY, JSON.stringify(cleaned));
      } catch {
        // ignore storage errors
      }
      if (accessStatus !== 'authorized' || !user) return;
      const actor = clampStr(user.email || staffProfile?.email || 'admin', 160);
      try {
        await setDoc(doc(db, 'systemSettings', 'calendar'), {
          excludedHolidays: cleaned,
          updatedBy: actor,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Failed to persist excluded holidays to Firestore (kept in localStorage):', err);
      }
    },
    [accessStatus, user, staffProfile]
  );

  const excludePublicHoliday = useCallback(
    async (holidayKey: string) => {
      const normalized = holidayKey.trim().toLowerCase();
      if (!normalized) return;
      if (excludedHolidaysRef.current.includes(normalized)) return;
      await persistExcludedHolidays([...excludedHolidaysRef.current, normalized]);
    },
    [persistExcludedHolidays]
  );

  const restorePublicHoliday = useCallback(
    async (holidayKey: string) => {
      const normalized = holidayKey.trim().toLowerCase();
      if (!normalized) return;
      await persistExcludedHolidays(
        excludedHolidaysRef.current.filter((k) => k !== normalized)
      );
    },
    [persistExcludedHolidays]
  );

  const restoreAllPublicHolidays = useCallback(async () => {
    await persistExcludedHolidays([]);
  }, [persistExcludedHolidays]);

  useEffect(() => {
    if (accessStatus !== 'authorized' || !user) {
      setColumnPreferences({});
      columnPrefsRef.current = {};
      setColumnPreferencesLoaded(false);
      if (columnPrefsSaveTimerRef.current !== null) {
        window.clearTimeout(columnPrefsSaveTimerRef.current);
        columnPrefsSaveTimerRef.current = null;
      }
      return;
    }

    const prefRef = doc(db, 'userPreferences', user.uid);
    const unsubPrefs = onSnapshot(
      prefRef,
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as { columnPreferences?: Record<string, unknown> };
          const incomingMap: Record<string, StoredColumnPrefsV2> = {};
          if (raw?.columnPreferences && typeof raw.columnPreferences === 'object') {
            for (const [modKey, val] of Object.entries(raw.columnPreferences)) {
              if (!val || typeof val !== 'object') continue;
              const obj = val as Partial<StoredColumnPrefsV2>;
              if (obj.visible && typeof obj.visible === 'object') {
                incomingMap[modKey] = {
                  version: 2,
                  visible: obj.visible as Record<string, boolean>,
                  pinned: Array.isArray(obj.pinned) ? obj.pinned.filter((x): x is string => typeof x === 'string') : [],
                  order: Array.isArray(obj.order) ? obj.order.filter((x): x is string => typeof x === 'string') : [],
                  updatedAtMs: typeof obj.updatedAtMs === 'number' ? obj.updatedAtMs : undefined,
                };
              }
            }
          }
          // Merge remote with any newer local unsaved entries
          const merged: Record<string, StoredColumnPrefsV2> = { ...incomingMap };
          for (const [modKey, localPref] of Object.entries(columnPrefsRef.current)) {
            const remotePref = incomingMap[modKey];
            if (!remotePref || (localPref.updatedAtMs ?? 0) > (remotePref.updatedAtMs ?? 0)) {
              merged[modKey] = localPref;
            }
          }
          columnPrefsRef.current = merged;
          setColumnPreferences(merged);
        } else {
          setColumnPreferences({ ...columnPrefsRef.current });
        }
        setColumnPreferencesLoaded(true);
      },
      (err) => {
        console.warn('Unable to sync user column preferences from Firestore:', err);
        setColumnPreferencesLoaded(true);
      }
    );

    return () => {
      unsubPrefs();
      if (columnPrefsSaveTimerRef.current !== null) {
        window.clearTimeout(columnPrefsSaveTimerRef.current);
        columnPrefsSaveTimerRef.current = null;
      }
    };
  }, [accessStatus, user]);

  const saveColumnPreference = useCallback(
    (moduleKey: string, pref: StoredColumnPrefsV2) => {
      const cleanKey = moduleKey.trim().slice(0, 60);
      if (!cleanKey) return;
      const sanitizedPref: StoredColumnPrefsV2 = {
        version: 2,
        visible: { ...pref.visible },
        pinned: [...pref.pinned],
        order: [...pref.order],
        updatedAtMs: pref.updatedAtMs ?? Date.now(),
      };
      const nextMap: Record<string, StoredColumnPrefsV2> = {
        ...columnPrefsRef.current,
        [cleanKey]: sanitizedPref,
      };
      // Enforce max 30 modules in Firestore map
      const entries = Object.entries(nextMap);
      const boundedMap: Record<string, StoredColumnPrefsV2> =
        entries.length <= 30 ? nextMap : Object.fromEntries(entries.slice(-30));

      columnPrefsRef.current = boundedMap;
      setColumnPreferences(boundedMap);

      if (accessStatus !== 'authorized' || !user) return;

      if (columnPrefsSaveTimerRef.current !== null) {
        window.clearTimeout(columnPrefsSaveTimerRef.current);
      }
      const targetUid = user.uid;
      columnPrefsSaveTimerRef.current = window.setTimeout(() => {
        columnPrefsSaveTimerRef.current = null;
        void setDoc(doc(db, 'userPreferences', targetUid), {
          uid: targetUid,
          columnPreferences: columnPrefsRef.current,
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          console.warn('Failed to persist column preferences to Firestore:', err);
        });
      }, 500);
    },
    [accessStatus, user]
  );

  useEffect(() => {
    if (accessStatus !== 'authorized' || !user) {
      setStaff([]);
      setSettings([]);
      setClients([]);
      setJobs([]);
      setHistory([]);
      setCalendarEvents([]);
      setNotifications([]);
      setCp204Records([]);
      setTaxPayments([]);
      setCorrespondenceRecords([]);
      setWorkDoneRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let settledCount = 0;
    const markSettled = () => {
      settledCount += 1;
      if (settledCount >= 11) {
        setLoading(false);
        setRefreshing(false);
        setLastRefreshedAt(new Date());
      }
    };

    const unsubStaff = onSnapshot(
      collection(db, 'staff'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StaffMember, 'id'>) }))
          .sort((a, b) => (a.staffId || '').localeCompare(b.staffId || ''));
        setStaff(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'staff')
    );

    const unsubSettings = onSnapshot(
      collection(db, 'settings'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<SettingValue, 'id'>) }))
          .sort((a, b) => a.group.localeCompare(b.group) || a.sortOrder - b.sortOrder);
        setSettings(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'settings')
    );

    const unsubClients = onSnapshot(
      collection(db, 'clients'),
      (snap) => {
        const list = snap.docs
          .map((d) => hydrateClientRecord(d.id, d.data() as Partial<ClientRecord>))
          .sort((a, b) => (a.clientId || '').localeCompare(b.clientId || ''));
        setClients(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'clients')
    );

    const unsubJobs = onSnapshot(
      collection(db, 'jobs'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<TaxJob, 'id'>) }))
          .sort((a, b) =>
            (a.finalApplicableDeadline || a.dueDate || '9999-12-31').localeCompare(
              b.finalApplicableDeadline || b.dueDate || '9999-12-31'
            )
          );
        setJobs(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'jobs')
    );

    const unsubHistory = onSnapshot(
      collection(db, 'history'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<JobHistoryEntry, 'id'>) }))
          .sort((a, b) => {
            const ta = a.timestamp?.toMillis?.() ?? 0;
            const tb = b.timestamp?.toMillis?.() ?? 0;
            return tb - ta;
          });
        setHistory(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'history')
    );

    const unsubCalendar = onSnapshot(
      collection(db, 'calendarEvents'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CalendarEvent, 'id'>) }))
          .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
        setCalendarEvents(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'calendarEvents')
    );

    const unsubNotifications = onSnapshot(
      collection(db, 'notifications'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? 0;
            const tb = b.createdAt?.toMillis?.() ?? 0;
            return tb - ta;
          });
        setNotifications(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const unsubCp204 = onSnapshot(
      collection(db, 'cp204'),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const raw = d.data() as Partial<Cp204Record>;
            const revisions = normalizeCp204Revisions(raw.revisions);
            const instalments = normalizeCp204Instalments(raw.instalments);
            const originalEstimatedTax = safeNum(raw.originalEstimatedTax);
            const currentEstimatedTax = computeCp204CurrentEstimatedTax(
              originalEstimatedTax,
              revisions
            );
            return {
              id: d.id,
              cp204Id: raw.cp204Id ?? d.id,
              clientId: raw.clientId ?? '',
              clientName: raw.clientName ?? '',
              ya: raw.ya ?? '',
              fye: raw.fye ?? '',
              basisPeriodStart: raw.basisPeriodStart ?? '',
              basisPeriodEnd: raw.basisPeriodEnd ?? '',
              originalEstimatedTax,
              originalSubmissionDate: raw.originalSubmissionDate ?? '',
              currentEstimatedTax,
              statutoryCp204DueDate: raw.statutoryCp204DueDate ?? '',
              pic: raw.pic ?? '',
              reviewer: raw.reviewer ?? '',
              status: raw.status ?? 'In Progress',
              acknowledgementUrl: raw.acknowledgementUrl ?? '',
              remarks: raw.remarks ?? '',
              revisions,
              instalments,
              createdBy: raw.createdBy ?? '',
              updatedBy: raw.updatedBy,
              createdAt: raw.createdAt,
              updatedAt: raw.updatedAt,
            } as Cp204Record;
          })
          .sort(
            (a, b) =>
              (b.ya || '').localeCompare(a.ya || '') ||
              (a.clientName || '').localeCompare(b.clientName || '')
          );
        setCp204Records(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'cp204')
    );

    const unsubTaxPayments = onSnapshot(
      collection(db, 'taxPayments'),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const raw = d.data() as Partial<TaxPaymentRecord>;
            const amountDue = Math.max(0, safeNum(raw.amountDue));
            const amountPaid = Math.max(0, safeNum(raw.amountPaid));
            return {
              id: d.id,
              paymentId: raw.paymentId ?? d.id,
              clientId: raw.clientId ?? '',
              clientName: raw.clientName ?? '',
              paymentType: raw.paymentType ?? 'CP204 Instalment',
              ya: raw.ya ?? '',
              referenceCaseNo: raw.referenceCaseNo ?? '',
              dueDate: raw.dueDate ?? '',
              amountDue,
              amountPaid,
              outstandingAmount: Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100),
              paymentDate: raw.paymentDate ?? '',
              paymentReference: raw.paymentReference ?? '',
              verificationStatus: raw.verificationStatus ?? 'Not Verified',
              followUpStatus: raw.followUpStatus ?? 'Pending',
              remarks: raw.remarks ?? '',
              createdBy: raw.createdBy ?? '',
              updatedBy: raw.updatedBy,
              createdAt: raw.createdAt,
              updatedAt: raw.updatedAt,
            } as TaxPaymentRecord;
          })
          .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
        setTaxPayments(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'taxPayments')
    );

    const unsubCorrespondence = onSnapshot(
      collection(db, 'correspondence'),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const raw = d.data() as Partial<CorrespondenceRecord>;
            return {
              id: d.id,
              correspondenceId: raw.correspondenceId ?? d.id,
              clientId: raw.clientId ?? '',
              clientName: raw.clientName ?? '',
              ya: raw.ya ?? '',
              jobId: raw.jobId ?? '',
              dateReceived: raw.dateReceived ?? '',
              methodReceived: raw.methodReceived ?? 'Email',
              category: raw.category ?? 'LHDN',
              letterType: raw.letterType ?? 'Notice',
              letterSubject: raw.letterSubject ?? '',
              letterReferenceNo: raw.letterReferenceNo ?? '',
              detailedInformation: raw.detailedInformation ?? '',
              dueDate: raw.dueDate ?? '',
              actionRequired: raw.actionRequired ?? '',
              pic: raw.pic ?? '',
              actionStatus: raw.actionStatus ?? 'Pending',
              actionDate: raw.actionDate ?? '',
              remarks: raw.remarks ?? '',
              attachmentUrl: raw.attachmentUrl ?? '',
              createdBy: raw.createdBy ?? '',
              updatedBy: raw.updatedBy,
              createdAt: raw.createdAt,
              updatedAt: raw.updatedAt,
            } as CorrespondenceRecord;
          })
          .sort((a, b) => (b.dateReceived || '').localeCompare(a.dateReceived || ''));
        setCorrespondenceRecords(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'correspondence')
    );

    const unsubWorkDone = onSnapshot(
      collection(db, 'workDone'),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const raw = d.data() as Partial<WorkDoneRecord>;
            const optNum = (v: unknown): number | null =>
              v === null || v === undefined || v === '' ? null : safeNum(v as number);
            const hodPrice = optNum(raw.hodPrice);
            const additionalCharges = safeNum(raw.additionalCharges);
            const finalPrice = Math.round(((hodPrice ?? 0) + additionalCharges) * 100) / 100;
            const sstAmount = optNum(raw.sstAmount);
            const totalInvoiceAmount = Math.round((finalPrice + (sstAmount ?? 0)) * 100) / 100;
            return {
              id: d.id,
              workDoneId: raw.workDoneId ?? d.id,
              jobId: raw.jobId ?? '',
              clientId: raw.clientId ?? '',
              clientName: raw.clientName ?? '',
              ya: raw.ya ?? '',
              jobType: raw.jobType ?? '',
              pic: raw.pic ?? '',
              reviewer: raw.reviewer ?? '',
              jobStatus: raw.jobStatus ?? '',
              workDoneDescription: raw.workDoneDescription ?? '',
              pricingMode: raw.pricingMode === 'Individual Allocation' ? 'Individual Allocation' : 'Overall Fee',
              feeAllocations: Array.isArray(raw.feeAllocations)
                ? raw.feeAllocations.map((a, idx) => ({
                    lineNo: Number(a.lineNo || idx + 1),
                    description: String(a.description || ''),
                    fee: safeNum(a.fee),
                  }))
                : [],
              auditFee: optNum(raw.auditFee),
              quotationPrice: optNum(raw.quotationPrice),
              priorYearPrice: optNum(raw.priorYearPrice),
              hodPrice,
              additionalCharges,
              finalPrice,
              sstAmount,
              totalInvoiceAmount,
              workDoneStatus: raw.workDoneStatus ?? 'Draft',
              financeInvoiceStatus: raw.financeInvoiceStatus ?? 'Not Submitted',
              invoiceNo: raw.invoiceNo ?? '',
              issueDate: raw.issueDate ?? '',
              cancellationDate: raw.cancellationDate ?? '',
              cancellationReason: raw.cancellationReason ?? '',
              remarks: raw.remarks ?? '',
              createdBy: raw.createdBy ?? '',
              updatedBy: raw.updatedBy,
              createdAt: raw.createdAt,
              updatedAt: raw.updatedAt,
            } as WorkDoneRecord;
          })
          .sort((a, b) => (b.workDoneId || '').localeCompare(a.workDoneId || ''));
        setWorkDoneRecords(list);
        markSettled();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'workDone')
    );

    return () => {
      unsubStaff();
      unsubSettings();
      unsubClients();
      unsubJobs();
      unsubHistory();
      unsubCalendar();
      unsubNotifications();
      unsubCp204();
      unsubTaxPayments();
      unsubCorrespondence();
      unsubWorkDone();
    };
  }, [accessStatus, user, refreshNonce]);

  const refreshAll = useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
  }, []);

  const getSettingsByGroup = useCallback(
    (group: string, includeInactive = false) => {
      const normalized = normalizeSettingGroup(group);
      const matched = settings
        .filter(
          (s) =>
            normalizeSettingGroup(s.group) === normalized && (includeInactive || s.active)
        )
        .sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        });

      // Deduplicate by case-insensitive displayName so legacy underscore/space duplicates
      // never render duplicate dropdown entries.
      const seen = new Set<string>();
      const deduped: SettingValue[] = [];
      for (const item of matched) {
        const key = (item.displayName || item.code || '').trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }
      return deduped;
    },
    [settings]
  );

  const settingsIndex = useMemo(() => {
    const map = new Map<string, SettingValue>();
    for (const s of settings) {
      const normGroup = normalizeSettingGroup(s.group);
      const displayKey = (s.displayName || '').trim().toLowerCase();
      const codeKey = (s.code || '').trim().toLowerCase();
      if (displayKey) {
        map.set(`${normGroup}::${displayKey}`, s);
        map.set(`ANY::${displayKey}`, s);
      }
      if (codeKey) {
        map.set(`${normGroup}::${codeKey}`, s);
        map.set(`ANY::${codeKey}`, s);
      }
    }
    return map;
  }, [settings]);

  const resolveSettingBadge = useCallback(
    (group: string, value: string | undefined | null) => {
      const raw = (value ?? '').trim();
      if (!raw) return { label: '—', color: '#64748B' };
      const normGroup = normalizeSettingGroup(group);
      const key = raw.toLowerCase();
      const matched =
        settingsIndex.get(`${normGroup}::${key}`) ?? settingsIndex.get(`ANY::${key}`);

      if (matched) {
        return { label: matched.displayName, color: matched.badgeColor };
      }

      if (key === 'pending mitrs') {
        return { label: raw, color: '#0369A1' };
      }
      if (key === 'completed' && normGroup === 'JOB STATUS') {
        return { label: raw, color: '#CA8A04' };
      }

      if (
        key.includes('active') ||
        key.includes('completed') ||
        key.includes('paid') ||
        key.includes('filed') ||
        key.includes('submitted') ||
        key.includes('appointed') ||
        key.includes('collected') ||
        key.includes('received')
      ) {
        return { label: raw, color: '#15803D' };
      }
      if (
        key.includes('resigned') ||
        key.includes('overdue') ||
        key.includes('urgent') ||
        key.includes('cancel') ||
        key.includes('revoked') ||
        key.includes('hold')
      ) {
        return { label: raw, color: '#B91C1C' };
      }
      if (
        key.includes('pending') ||
        key.includes('winding') ||
        key.includes('unpaid') ||
        key.includes('open') ||
        key.includes('high')
      ) {
        return { label: raw, color: '#B45309' };
      }
      if (key.includes('progress') || key.includes('review') || key.includes('draft')) {
        return { label: raw, color: '#0369A1' };
      }
      return { label: raw, color: '#475569' };
    },
    [settingsIndex]
  );

  const getHistoryForJob = useCallback(
    (jobId: string) => history.filter((h) => h.jobId === jobId),
    [history]
  );

  // ---------------------- STAFF CRUD ----------------------
  const saveStaffMember = useCallback(
    async (
      member: Omit<StaffMember, 'id' | 'createdAt' | 'updatedAt'>,
      isEdit = false,
      existingDocId?: string
    ) => {
      const normalizedEmail = clampStr((member.email || '').toLowerCase(), 160);
      const staffIdClean = clampStr(member.staffId, 32);
      const targetDocId = normalizedEmail
        ? emailToStaffKey(normalizedEmail)
        : existingDocId || `STF_${sanitizeDocId(staffIdClean || 'STAFF')}`;
      const ref = doc(db, 'staff', targetDocId);
      const isMigratingPlaceholder = Boolean(isEdit && existingDocId && existingDocId !== targetDocId);

      try {
        if (isEdit && !isMigratingPlaceholder) {
          await updateDoc(ref, {
            staffId: staffIdClean,
            staffName: clampStr(member.staffName, 120),
            email: normalizedEmail,
            role: member.role,
            active: Boolean(member.active),
            department: clampStr(member.department, 80),
            designation: clampStr(member.designation, 80),
            phone: clampStr(member.phone, 40),
            joinDate: clampStr(member.joinDate, 20),
            leaveDate: clampStr(member.leaveDate, 20),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            staffId: staffIdClean,
            staffName: clampStr(member.staffName, 120),
            email: normalizedEmail,
            role: member.role,
            active: Boolean(member.active),
            department: clampStr(member.department, 80),
            designation: clampStr(member.designation, 80),
            phone: clampStr(member.phone, 40),
            joinDate: clampStr(member.joinDate, 20),
            leaveDate: clampStr(member.leaveDate, 20),
            uid: clampStr(member.uid, 128),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (isMigratingPlaceholder && existingDocId) {
            await deleteDoc(doc(db, 'staff', existingDocId));
          }
        }
      } catch (err) {
        handleFirestoreError(
          err,
          isEdit && !isMigratingPlaceholder ? OperationType.UPDATE : OperationType.CREATE,
          `staff/${targetDocId}`
        );
      }
    },
    []
  );

  const deleteStaffMember = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'staff', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staff/${id}`);
    }
  }, []);

  // ---------------------- SETTINGS CRUD ----------------------
  const saveSetting = useCallback(
    async (setting: Omit<SettingValue, 'createdAt' | 'updatedAt'>, isEdit = false) => {
      const normalizedGroup = normalizeSettingGroup(setting.group);
      const docId = sanitizeDocId(setting.id || `${normalizedGroup}_${setting.code}`);
      const ref = doc(db, 'settings', docId);
      const hex = /^#[0-9a-fA-F]{6}$/.test(setting.badgeColor) ? setting.badgeColor : '#475569';
      const payload = {
        group: clampStr(normalizedGroup, 64),
        code: clampStr(setting.code.toUpperCase(), 64),
        displayName: clampStr(setting.displayName, 120),
        module: clampStr(setting.module, 64), // allows empty ""
        badgeColor: hex,
        active: Boolean(setting.active),
        sortOrder: Math.max(0, Math.min(9999, Math.round(safeNum(setting.sortOrder)))),
        updatedAt: serverTimestamp(),
      };
      try {
        if (isEdit) {
          await updateDoc(ref, payload);
        } else {
          await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          isEdit ? OperationType.UPDATE : OperationType.CREATE,
          `settings/${docId}`
        );
      }
    },
    []
  );

  const deleteSetting = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'settings', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `settings/${id}`);
    }
  }, []);

  const seedDefaultSettings = useCallback(async (): Promise<number> => {
    const existingById = new Map(settings.map((s) => [s.id, s]));
    const existingGroupDisplayKeys = new Set(
      settings.map(
        (s) => `${normalizeSettingGroup(s.group)}::${(s.displayName || '').trim().toLowerCase()}`
      )
    );
    const toCreate = DEFAULT_MALAYSIAN_TAX_SETTINGS.filter((item) => {
      if (existingById.has(item.id)) return false;
      const key = `${normalizeSettingGroup(item.group)}::${item.displayName.trim().toLowerCase()}`;
      return !existingGroupDisplayKeys.has(key);
    });
    // Also upgrade legacy underscore/EINVOICE_STATUS default docs to normalized group names & v4.8 thresholds
    const toUpgrade = DEFAULT_MALAYSIAN_TAX_SETTINGS.filter((item) => {
      const existing = existingById.get(item.id);
      if (!existing) return false;
      const normTarget = normalizeSettingGroup(item.group);
      return Boolean(
        existing.group !== normTarget ||
          (normTarget === 'E INVOICE STATUS' &&
            (existing.displayName === 'Phase 4 (RM1M–5M)' ||
              existing.displayName === 'Exempt (<RM500k)'))
      );
    });

    if (toCreate.length === 0 && toUpgrade.length === 0) return 0;

    try {
      const batch = writeBatch(db);
      for (const item of toCreate) {
        const ref = doc(db, 'settings', item.id);
        batch.set(ref, {
          group: normalizeSettingGroup(item.group),
          code: item.code,
          displayName: item.displayName,
          module: item.module,
          badgeColor: item.badgeColor,
          active: item.active,
          sortOrder: item.sortOrder,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const item of toUpgrade) {
        const ref = doc(db, 'settings', item.id);
        batch.update(ref, {
          group: normalizeSettingGroup(item.group),
          code: item.code,
          displayName: item.displayName,
          module: item.module,
          badgeColor: item.badgeColor,
          active: item.active,
          sortOrder: item.sortOrder,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      return toCreate.length + toUpgrade.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/seed');
    }
  }, [settings]);

  // ---------------------- CLIENTS CRUD ----------------------
  const saveClient = useCallback(
    async (
      client: Omit<ClientRecord, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const actorLabel = clampStr(
        staffProfile ? `${staffProfile.staffName} (${actorEmail})` : actorEmail,
        160
      );
      const docId = existingId || sanitizeDocId(`CL_${client.clientId}_${Date.now().toString(36)}`);
      const ref = doc(db, 'clients', docId);
      const existingClient = existingId ? clients.find((c) => c.id === existingId) : undefined;
      const nextPicHistory: PicHistoryEntry[] = Array.isArray(client.picHistory)
        ? [...client.picHistory]
        : [...(existingClient?.picHistory || [])];

      if (existingClient) {
        const prevPic = (existingClient.taxPic || '').trim();
        const nextPic = clampStr(client.taxPic, 120);
        if (prevPic !== nextPic && (prevPic !== '' || nextPic !== '')) {
          nextPicHistory.push({
            date: new Date().toISOString().slice(0, 10),
            fromPic: prevPic || 'Unassigned',
            toPic: nextPic || 'Unassigned',
            transferredBy: actorLabel || actorEmail || 'system',
            note: 'Updated in Client Profile',
          });
        }
      }

      const normalizedFirstYa = clampStr(client.firstYA ?? client.firstYa, 20);
      const basePayload = {
        clientId: clampStr(client.clientId, 40),
        clientName: clampStr(client.clientName, 200),
        companyNo: clampStr(client.companyNo, 60),
        tin: clampStr(client.tin, 60),
        fye: clampStr(client.fye, 10),
        taxPic: clampStr(client.taxPic, 120),
        category: client.category,
        clientStatus: clampStr(client.clientStatus || 'Active', 60),
        smeStatus: clampStr(client.smeStatus, 40),
        taxAgent: clampStr(client.taxAgent, 120),
        myTaxAppointment: clampStr(client.myTaxAppointment, 60),
        eInvoiceStatus: clampStr(client.eInvoiceStatus, 60),
        sstRegistered: clampStr(client.sstRegistered, 20),
        sstNo: clampStr(client.sstNo, 60),
        email: clampStr(client.email, 160),
        phone: clampStr(client.phone, 60),
        dateOfIncorporation: clampStr(client.dateOfIncorporation, 20),
        dateOfCommencementBusiness: clampStr(client.dateOfCommencementBusiness, 20),
        dateOfEngagement: clampStr(client.dateOfEngagement, 20),
        dateOfResigned: clampStr(client.dateOfResigned, 20),
        auditor: clampStr(client.auditor, 120),
        account: clampStr(client.account, 120),
        eNumber: clampStr(client.eNumber, 60),
        specialRemarks: clampStr(client.specialRemarks, 2000),
        personNo: clampStr(client.personNo, 60),
        relationship: clampStr(client.relationship, 80),
        engagementStatus: clampStr(client.engagementStatus, 60),
        businessName: clampStr(client.businessName, 200),
        businessType: clampStr(client.businessType, 80),
        businessSsmNo: clampStr(client.businessSsmNo, 60),
        businessENumber: clampStr(client.businessENumber, 60),
        businessStartDate: clampStr(client.businessStartDate, 20),
        businessStatus: clampStr(client.businessStatus, 60),
        firstYa: normalizedFirstYa,
        firstYA: normalizedFirstYa,
        firstYaStatus: clampStr(client.firstYaStatus, 60),
        secondYa: clampStr(client.secondYa, 20),
        secondYaStatus: clampStr(client.secondYaStatus, 60),
        groupId: clampStr(client.groupId, 60),
        companySecretary: clampStr(client.companySecretary, 120),
        registeredAddress: clampStr(client.registeredAddress, 500),
        oldRegNo: clampStr(client.oldRegNo, 60),
        principalActivity: clampStr(client.principalActivity1 ?? client.principalActivity, 250),
        principalActivity1: clampStr(client.principalActivity1 ?? client.principalActivity, 250),
        msicCode1: clampStr(client.msicCode1, 20),
        principalActivity2: clampStr(client.principalActivity2, 250),
        msicCode2: clampStr(client.msicCode2, 20),
        principalActivity3: clampStr(client.principalActivity3, 250),
        msicCode3: clampStr(client.msicCode3, 20),
        feeBillingNotes: clampStr(client.feeBillingNotes, 500),
        eInvoiceImplDate: clampStr(client.eInvoiceImplDate, 20),
        mitrsStatus: clampStr(client.mitrsStatus, 60),
        cp204Status: clampStr(client.cp204Status, 60),
        maritalStatus: clampStr(client.maritalStatus, 40),
        spouseName: clampStr(client.spouseName, 160),
        spouseTin: clampStr(client.spouseTin, 60),
        employerDetails: clampStr(client.employerDetails, 250),
        contactPerson: clampStr(client.contactPerson, 120),
        correspondenceAddress: clampStr(client.correspondenceAddress, 500),
        businessHistory: (client.businessHistory || []).slice(0, 50),
        relatedPersons: (client.relatedPersons || []).slice(0, 50),
        partnershipPartners: (client.partnershipPartners || []).slice(0, 50),
        yaMonitoring: (client.yaMonitoring || []).slice(0, 50),
        picHistory: nextPicHistory.slice(-100),
        updatedBy: actorEmail,
        updatedAt: serverTimestamp(),
      };

      try {
        if (existingId) {
          const compacted = compactOptionalPayload(
            basePayload,
            REQUIRED_CLIENT_KEYS,
            true,
            false
          );
          if (staffProfile?.role === 'Staff') {
            const { clientStatus: _cs, dateOfResigned: _dr, ...staffAllowed } = compacted;
            await updateDoc(ref, staffAllowed);
          } else {
            await updateDoc(ref, compacted);
          }
        } else {
          const compacted = compactOptionalPayload(
            {
              ...basePayload,
              createdBy: actorEmail,
              createdAt: serverTimestamp(),
            },
            REQUIRED_CLIENT_KEYS,
            false,
            false
          );
          await setDoc(ref, compacted);
        }
        return docId;
      } catch (err) {
        handleFirestoreError(
          err,
          existingId ? OperationType.UPDATE : OperationType.CREATE,
          `clients/${docId}`
        );
      }
    },
    [user, staffProfile, clients]
  );

  const inactivateClient = useCallback(
    async (clientDocId: string, dateOfResigned: string) => {
      const ref = doc(db, 'clients', clientDocId);
      try {
        await updateDoc(ref, {
          clientStatus: 'Resigned',
          dateOfResigned: clampStr(dateOfResigned, 20),
          updatedBy: clampStr(user?.email || '', 160),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `clients/${clientDocId}`);
      }
    },
    [user]
  );

  const reactivateClient = useCallback(
    async (clientDocId: string) => {
      const ref = doc(db, 'clients', clientDocId);
      try {
        await updateDoc(ref, {
          clientStatus: 'Active',
          dateOfResigned: '',
          updatedBy: clampStr(user?.email || '', 160),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `clients/${clientDocId}`);
      }
    },
    [user]
  );

  const deleteClient = useCallback(async (clientDocId: string) => {
    try {
      await deleteDoc(doc(db, 'clients', clientDocId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `clients/${clientDocId}`);
    }
  }, []);

  // ---------------------- JOBS CRUD + AUDIT HISTORY ----------------------
  const saveJob = useCallback(
    async (job: JobSavePayload, existingId?: string, auditRemarks?: string): Promise<string> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const actorLabel = clampStr(
        staffProfile ? `${staffProfile.staffName} (${actorEmail})` : actorEmail,
        160
      );
      const docId = existingId || sanitizeDocId(`JOB_${job.jobCode}_${Date.now().toString(36)}`);
      const existingJob = existingId ? jobs.find((j) => j.id === existingId) : undefined;
      const oldStatus = existingJob?.status ?? '';
      const prevJobPic = (existingJob?.taxPic || '').trim();
      const nextJobPic = clampStr(job.taxPic, 120);
      const picChanged = Boolean(
        existingJob && prevJobPic !== nextJobPic && (prevJobPic !== '' || nextJobPic !== '')
      );
      const resolvedPreviousPic =
        picChanged && prevJobPic
          ? prevJobPic
          : job.previousPic ?? existingJob?.previousPic ?? '';

      const { payload, computedStatus, meta } = buildSanitizedJobDocument(
        {
          ...job,
          previousPic: resolvedPreviousPic,
        },
        actorEmail,
        Boolean(existingId)
      );

      const action = !existingId
        ? 'CREATED'
        : oldStatus !== computedStatus
        ? 'STATUS_CHANGED'
        : picChanged
        ? 'PIC_HANDOVER'
        : 'UPDATED';

      const handoverRemark = `PIC Handover: ${prevJobPic || 'Unassigned'} → ${
        nextJobPic || 'Unassigned'
      } — Continued by ${nextJobPic || 'Unassigned'}${auditRemarks ? ` · ${auditRemarks}` : ''}`;

      const defaultRemark = !existingId
        ? `Created ${meta.jobType || meta.module} job (${meta.jobCode}) for ${meta.clientName}`
        : oldStatus !== computedStatus
        ? `Status updated from "${oldStatus}" to "${computedStatus}"`
        : picChanged
        ? handoverRemark
        : `Updated job fields for ${meta.jobCode}`;

      const historyDocId = sanitizeDocId(
        `HIST_${docId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`
      );

      try {
        const batch = writeBatch(db);
        const jobRef = doc(db, 'jobs', docId);
        if (existingId) {
          batch.update(jobRef, payload);
        } else {
          batch.set(jobRef, {
            ...payload,
            createdBy: actorEmail,
            createdAt: serverTimestamp(),
          });
        }

        if (picChanged && action === 'PIC_HANDOVER') {
          batch.set(doc(db, 'history', historyDocId), {
            timestamp: serverTimestamp(),
            jobId: docId,
            action: 'PIC_HANDOVER',
            oldStatus: clampStr(prevJobPic || 'Unassigned', 60),
            newStatus: clampStr(nextJobPic || 'Unassigned', 60),
            user: actorLabel,
            remarks: clampStr(handoverRemark, 1000),
          });
        } else {
          batch.set(doc(db, 'history', historyDocId), {
            timestamp: serverTimestamp(),
            jobId: docId,
            action,
            oldStatus: clampStr(oldStatus, 60),
            newStatus: clampStr(computedStatus, 60),
            user: actorLabel,
            remarks: clampStr(auditRemarks || defaultRemark, 1000),
          });

          if (picChanged) {
            const handoverHistId = sanitizeDocId(
              `HIST_PIC_${docId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`
            );
            batch.set(doc(db, 'history', handoverHistId), {
              timestamp: serverTimestamp(),
              jobId: docId,
              action: 'PIC_HANDOVER',
              oldStatus: clampStr(prevJobPic || 'Unassigned', 60),
              newStatus: clampStr(nextJobPic || 'Unassigned', 60),
              user: actorLabel,
              remarks: clampStr(handoverRemark, 1000),
            });
          }
        }

        await batch.commit();
        return docId;
      } catch (err) {
        handleFirestoreError(
          err,
          existingId ? OperationType.UPDATE : OperationType.CREATE,
          `jobs/${docId}`
        );
      }
    },
    [user, staffProfile, jobs]
  );

  const batchCreateJobs = useCallback(
    async (items: JobSavePayload[]): Promise<{ createdCount: number; skippedCount: number }> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const actorLabel = clampStr(
        staffProfile ? `${staffProfile.staffName} (${actorEmail})` : actorEmail,
        160
      );

      // Build existing duplicate signature set: clientId + ya + jobType
      const existingKeys = new Set<string>();
      for (const j of jobs) {
        const key = `${(j.clientId || '').trim().toLowerCase()}::${(j.ya || '')
          .trim()
          .toLowerCase()}::${(j.jobType || j.formType || j.module).trim().toLowerCase()}`;
        existingKeys.add(key);
      }

      const toCreate: JobSavePayload[] = [];
      let skippedCount = 0;

      for (const item of items) {
        const key = `${(item.clientId || '').trim().toLowerCase()}::${(item.ya || '')
          .trim()
          .toLowerCase()}::${(item.jobType || item.formType || item.module).trim().toLowerCase()}`;
        if (existingKeys.has(key)) {
          skippedCount += 1;
          continue;
        }
        existingKeys.add(key);
        toCreate.push(item);
      }

      if (toCreate.length === 0) {
        return { createdCount: 0, skippedCount };
      }

      // Firestore writeBatch supports up to 500 writes; each job = 2 writes (job + history) => chunk by 200
      const CHUNK_SIZE = 200;
      let createdCount = 0;
      try {
        for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
          const slice = toCreate.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          for (let idx = 0; idx < slice.length; idx++) {
            const item = slice[idx];
            const nonce = `${Date.now().toString(36)}_${(i + idx).toString(36)}`;
            const docId = sanitizeDocId(`JOB_${item.jobCode}_${nonce}`);
            const { payload, computedStatus, meta } = buildSanitizedJobDocument(
              item,
              actorEmail,
              false
            );

            batch.set(doc(db, 'jobs', docId), {
              ...payload,
              createdBy: actorEmail,
              createdAt: serverTimestamp(),
            });

            const histId = sanitizeDocId(`HIST_${docId}_${idx}`);
            batch.set(doc(db, 'history', histId), {
              timestamp: serverTimestamp(),
              jobId: docId,
              action: 'BATCH_CREATED',
              oldStatus: '',
              newStatus: clampStr(computedStatus, 60),
              user: actorLabel,
              remarks: clampStr(
                `Batch created ${meta.jobType || meta.module} (${meta.ya || ''}) for ${meta.clientName}`,
                1000
              ),
            });
            createdCount += 1;
          }
          await batch.commit();
        }
        return { createdCount, skippedCount };
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'jobs/batch_create');
      }
    },
    [user, staffProfile, jobs]
  );

  const batchUpdateJobs = useCallback(
    async (
      items: Array<{ id: string; data: JobSavePayload; auditRemark?: string }>
    ): Promise<{ updatedCount: number }> => {
      if (items.length === 0) return { updatedCount: 0 };
      const actorEmail = clampStr(user?.email || '', 160);
      const actorLabel = clampStr(
        staffProfile ? `${staffProfile.staffName} (${actorEmail})` : actorEmail,
        160
      );
      const existingById = new Map(jobs.map((j) => [j.id, j]));

      const CHUNK_SIZE = 200;
      let updatedCount = 0;
      try {
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const slice = items.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          for (let idx = 0; idx < slice.length; idx++) {
            const entry = slice[idx];
            const prevJob = existingById.get(entry.id);
            const oldStatus = prevJob?.status ?? '';
            const { payload, computedStatus } = buildSanitizedJobDocument(
              entry.data,
              actorEmail,
              true
            );
            batch.update(doc(db, 'jobs', entry.id), payload);

            const histId = sanitizeDocId(
              `HIST_${entry.id}_${Date.now().toString(36)}_${(i + idx).toString(36)}`
            );
            batch.set(doc(db, 'history', histId), {
              timestamp: serverTimestamp(),
              jobId: entry.id,
              action: oldStatus !== computedStatus ? 'STATUS_CHANGED' : 'RECOMPUTED',
              oldStatus: clampStr(oldStatus, 60),
              newStatus: clampStr(computedStatus, 60),
              user: actorLabel,
              remarks: clampStr(
                entry.auditRemark || 'Batch Re-compute Deadlines & Status',
                1000
              ),
            });
            updatedCount += 1;
          }
          await batch.commit();
        }
        return { updatedCount };
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'jobs/batch_update');
      }
    },
    [user, staffProfile, jobs]
  );

  const deleteJob = useCallback(
    async (jobId: string) => {
      try {
        await deleteDoc(doc(db, 'jobs', jobId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `jobs/${jobId}`);
      }
    },
    []
  );

  // ---------------------- CALENDAR EVENTS CRUD ----------------------
  const buildCalendarEventPayload = useCallback(
    (
      event: Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
      actorEmail: string
    ) => {
      const payload: Record<string, unknown> = {
        title: clampStr(event.title, 160),
        eventType: clampStr(event.eventType, 40),
        startDate: clampStr(event.startDate, 20),
        endDate: clampStr(event.endDate || event.startDate, 20),
        assignedTo: clampStr(event.assignedTo, 120),
        clientId: clampStr(event.clientId, 64),
        clientName: clampStr(event.clientName, 200),
        color: clampStr(event.color, 16),
        notes: clampStr(event.notes, 1000),
        timeOffNote: clampStr(event.timeOffNote, 200),
        updatedBy: actorEmail,
        updatedAt: serverTimestamp(),
      };
      if (event.batchGroupId !== undefined) {
        payload.batchGroupId = clampStr(event.batchGroupId, 64);
      }
      if (event.recurrenceGroupId !== undefined) {
        payload.recurrenceGroupId = clampStr(event.recurrenceGroupId, 64);
      }
      if (event.recurrenceRule !== undefined) {
        payload.recurrenceRule = clampStr(event.recurrenceRule, 200);
      }
      if (event.recurrenceLabel !== undefined) {
        payload.recurrenceLabel = clampStr(event.recurrenceLabel, 160);
      }
      if (event.recurrenceUntil !== undefined) {
        payload.recurrenceUntil = clampStr(event.recurrenceUntil, 20);
      }
      return payload;
    },
    []
  );

  const saveCalendarEvent = useCallback(
    async (
      event: Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const docId = existingId || sanitizeDocId(`EVT_${Date.now().toString(36)}`);
      const ref = doc(db, 'calendarEvents', docId);
      const basePayload = buildCalendarEventPayload(event, actorEmail);
      try {
        if (existingId) {
          await updateDoc(ref, basePayload);
        } else {
          await setDoc(ref, {
            ...basePayload,
            createdBy: actorEmail,
            createdAt: serverTimestamp(),
          });
        }
        return docId;
      } catch (err) {
        handleFirestoreError(
          err,
          existingId ? OperationType.UPDATE : OperationType.CREATE,
          `calendarEvents/${docId}`
        );
      }
    },
    [user, buildCalendarEventPayload]
  );

  const batchSaveCalendarEvents = useCallback(
    async (
      events: Array<
        Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
      >
    ): Promise<string[]> => {
      if (events.length === 0) return [];
      const actorEmail = clampStr(user?.email || '', 160);
      const createdIds: string[] = [];
      const CHUNK_SIZE = 400;
      const baseNonce = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      try {
        for (let i = 0; i < events.length; i += CHUNK_SIZE) {
          const slice = events.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          for (let idx = 0; idx < slice.length; idx++) {
            const ev = slice[idx];
            const docId = sanitizeDocId(`EVT_${baseNonce}_${String(i + idx + 1).padStart(3, '0')}`);
            const basePayload = buildCalendarEventPayload(ev, actorEmail);
            batch.set(doc(db, 'calendarEvents', docId), {
              ...basePayload,
              createdBy: actorEmail,
              createdAt: serverTimestamp(),
            });
            createdIds.push(docId);
          }
          await batch.commit();
        }
        return createdIds;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'calendarEvents/batch_create');
      }
    },
    [user, buildCalendarEventPayload]
  );

  const batchUpdateCalendarEvents = useCallback(
    async (
      updates: Array<{
        id: string;
        data: Partial<
          Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>
        >;
      }>
    ): Promise<void> => {
      if (updates.length === 0) return;
      const actorEmail = clampStr(user?.email || '', 160);
      const CHUNK_SIZE = 400;
      try {
        for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
          const slice = updates.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          for (const item of slice) {
            const d = item.data;
            const patch: Record<string, unknown> = {
              updatedBy: actorEmail,
              updatedAt: serverTimestamp(),
            };
            if (d.title !== undefined) patch.title = clampStr(d.title, 160);
            if (d.eventType !== undefined) patch.eventType = clampStr(d.eventType, 40);
            if (d.startDate !== undefined) patch.startDate = clampStr(d.startDate, 20);
            if (d.endDate !== undefined) patch.endDate = clampStr(d.endDate, 20);
            if (d.assignedTo !== undefined) patch.assignedTo = clampStr(d.assignedTo, 120);
            if (d.clientId !== undefined) patch.clientId = clampStr(d.clientId, 64);
            if (d.clientName !== undefined) patch.clientName = clampStr(d.clientName, 200);
            if (d.color !== undefined) patch.color = clampStr(d.color, 16);
            if (d.notes !== undefined) patch.notes = clampStr(d.notes, 1000);
            if (d.timeOffNote !== undefined) patch.timeOffNote = clampStr(d.timeOffNote, 200);
            if (d.batchGroupId !== undefined) {
              patch.batchGroupId = clampStr(d.batchGroupId, 64);
            }
            if (d.recurrenceGroupId !== undefined) {
              patch.recurrenceGroupId = clampStr(d.recurrenceGroupId, 64);
            }
            if (d.recurrenceRule !== undefined) {
              patch.recurrenceRule = clampStr(d.recurrenceRule, 200);
            }
            if (d.recurrenceLabel !== undefined) {
              patch.recurrenceLabel = clampStr(d.recurrenceLabel, 160);
            }
            if (d.recurrenceUntil !== undefined) {
              patch.recurrenceUntil = clampStr(d.recurrenceUntil, 20);
            }
            batch.update(doc(db, 'calendarEvents', item.id), patch);
          }
          await batch.commit();
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'calendarEvents/batch_update');
      }
    },
    [user]
  );

  const deleteCalendarEvent = useCallback(async (eventId: string) => {
    try {
      await deleteDoc(doc(db, 'calendarEvents', eventId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `calendarEvents/${eventId}`);
    }
  }, []);

  const batchDeleteCalendarEvents = useCallback(async (eventIds: string[]) => {
    const uniqueIds = Array.from(new Set(eventIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const CHUNK_SIZE = 400;
    try {
      for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        const slice = uniqueIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const id of slice) {
          batch.delete(doc(db, 'calendarEvents', id));
        }
        await batch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'calendarEvents/batch_delete');
    }
  }, []);

  // ---------------------- CP204 MONITORING CRUD ----------------------
  const saveCp204 = useCallback(
    async (record: Cp204SavePayload, existingId?: string): Promise<string> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const normClientId = clampStr(record.clientId, 40);
      const normYa = clampStr(record.ya, 16);

      if (!normClientId || !clampStr(record.clientName, 200)) {
        throw new Error('Client selection is required.');
      }
      if (!normYa) {
        throw new Error('Year of Assessment (YA) is required.');
      }

      // Enforce unique clientId + ya across CP204 master records
      const duplicate = cp204Records.find(
        (r) =>
          r.id !== existingId &&
          r.clientId.trim().toLowerCase() === normClientId.toLowerCase() &&
          r.ya.trim().toLowerCase() === normYa.toLowerCase()
      );
      if (duplicate) {
        throw new Error(
          `A CP204 record already exists for ${duplicate.clientName} (${duplicate.clientId}) for YA ${normYa} (${duplicate.cp204Id}).`
        );
      }

      const normalizedRevisions = normalizeCp204Revisions(record.revisions);
      const normalizedInstalments = normalizeCp204Instalments(record.instalments);
      const instalmentError = validateCp204Instalments(normalizedInstalments);
      if (instalmentError) {
        throw new Error(instalmentError);
      }

      const originalEstimatedTax = safeNum(record.originalEstimatedTax);
      const currentEstimatedTax = computeCp204CurrentEstimatedTax(
        originalEstimatedTax,
        normalizedRevisions
      );

      const existingRec = existingId ? cp204Records.find((r) => r.id === existingId) : undefined;
      const cp204Id =
        clampStr(record.cp204Id || existingRec?.cp204Id, 40) ||
        generateNextSequentialId(
          'CP204',
          cp204Records.map((r) => r.cp204Id || r.id)
        );
      const docId = existingId || sanitizeDocId(cp204Id);
      const ref = doc(db, 'cp204', docId);

      const basePayload = {
        cp204Id,
        clientId: normClientId,
        clientName: clampStr(record.clientName, 200),
        ya: normYa,
        fye: clampStr(record.fye, 10),
        basisPeriodStart: clampStr(record.basisPeriodStart, 20),
        basisPeriodEnd: clampStr(record.basisPeriodEnd, 20),
        originalEstimatedTax,
        originalSubmissionDate: clampStr(record.originalSubmissionDate, 20),
        currentEstimatedTax,
        statutoryCp204DueDate: clampStr(record.statutoryCp204DueDate, 20),
        pic: clampStr(record.pic, 120),
        reviewer: clampStr(record.reviewer, 120),
        status: record.status || 'In Progress',
        acknowledgementUrl: clampStr(record.acknowledgementUrl, 500),
        remarks: clampStr(record.remarks, 2000),
        revisions: normalizedRevisions,
        instalments: normalizedInstalments,
        updatedBy: actorEmail,
        updatedAt: serverTimestamp(),
      };

      try {
        if (existingId) {
          await updateDoc(ref, basePayload);
        } else {
          await setDoc(ref, {
            ...basePayload,
            createdBy: actorEmail,
            createdAt: serverTimestamp(),
          });
        }
        return docId;
      } catch (err) {
        handleFirestoreError(
          err,
          existingId ? OperationType.UPDATE : OperationType.CREATE,
          `cp204/${docId}`
        );
      }
    },
    [user, cp204Records]
  );

  const batchCreateCp204 = useCallback(
    async (items: Cp204SavePayload[]): Promise<{ createdCount: number; skippedCount: number }> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const existingKeys = new Set<string>(
        cp204Records.map(
          (r) => `${r.clientId.trim().toLowerCase()}::${r.ya.trim().toLowerCase()}`
        )
      );
      const existingIds = cp204Records.map((r) => r.cp204Id || r.id);

      const toCreate: Array<{ docId: string; cp204Id: string; item: Cp204SavePayload }> = [];
      let skippedCount = 0;

      for (const item of items) {
        const key = `${clampStr(item.clientId, 40).toLowerCase()}::${clampStr(
          item.ya,
          16
        ).toLowerCase()}`;
        if (!item.clientId || !item.ya || existingKeys.has(key)) {
          skippedCount += 1;
          continue;
        }
        existingKeys.add(key);
        const nextId = generateNextSequentialId('CP204', existingIds);
        existingIds.push(nextId);
        toCreate.push({ docId: sanitizeDocId(nextId), cp204Id: nextId, item });
      }

      if (toCreate.length === 0) {
        return { createdCount: 0, skippedCount };
      }

      const CHUNK = 400;
      let createdCount = 0;
      try {
        for (let i = 0; i < toCreate.length; i += CHUNK) {
          const slice = toCreate.slice(i, i + CHUNK);
          const batch = writeBatch(db);
          for (const entry of slice) {
            const revs = normalizeCp204Revisions(entry.item.revisions);
            const insts = normalizeCp204Instalments(entry.item.instalments);
            const origTax = safeNum(entry.item.originalEstimatedTax);
            const currTax = computeCp204CurrentEstimatedTax(origTax, revs);
            batch.set(doc(db, 'cp204', entry.docId), {
              cp204Id: entry.cp204Id,
              clientId: clampStr(entry.item.clientId, 40),
              clientName: clampStr(entry.item.clientName, 200),
              ya: clampStr(entry.item.ya, 16),
              fye: clampStr(entry.item.fye, 10),
              basisPeriodStart: clampStr(entry.item.basisPeriodStart, 20),
              basisPeriodEnd: clampStr(entry.item.basisPeriodEnd, 20),
              originalEstimatedTax: origTax,
              originalSubmissionDate: clampStr(entry.item.originalSubmissionDate, 20),
              currentEstimatedTax: currTax,
              statutoryCp204DueDate: clampStr(entry.item.statutoryCp204DueDate, 20),
              pic: clampStr(entry.item.pic, 120),
              reviewer: clampStr(entry.item.reviewer, 120),
              status: entry.item.status || 'In Progress',
              acknowledgementUrl: clampStr(entry.item.acknowledgementUrl, 500),
              remarks: clampStr(entry.item.remarks, 2000),
              revisions: revs,
              instalments: insts,
              createdBy: actorEmail,
              updatedBy: actorEmail,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            createdCount += 1;
          }
          await batch.commit();
        }
        return { createdCount, skippedCount };
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'cp204/batch_create');
      }
    },
    [user, cp204Records]
  );

  const deleteCp204 = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'cp204', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `cp204/${id}`);
    }
  }, []);

  // ---------------------- TAX PAYMENT MONITOR CRUD ----------------------
  const saveTaxPayment = useCallback(
    async (record: TaxPaymentSavePayload, existingId?: string): Promise<string> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const amountDue = Math.max(0, safeNum(record.amountDue));
      const amountPaid = Math.max(0, safeNum(record.amountPaid));
      const outstandingAmount = Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100);
      const paymentDate = clampStr(record.paymentDate, 20);
      const paymentReference = clampStr(record.paymentReference, 80);

      if (!clampStr(record.clientId, 40) || !clampStr(record.clientName, 200)) {
        throw new Error('Client selection is required.');
      }
      if (amountPaid > 0 && !paymentDate) {
        throw new Error('Payment Date is required when Amount Paid is greater than 0.');
      }
      if (
        record.verificationStatus === 'Verified' &&
        (amountPaid <= 0 || !paymentDate || !paymentReference)
      ) {
        throw new Error(
          'To mark Verification Status as Verified, Amount Paid (> 0), Payment Date, and Payment Reference are all required.'
        );
      }

      const existingRec = existingId ? taxPayments.find((p) => p.id === existingId) : undefined;
      const paymentId =
        clampStr(record.paymentId || existingRec?.paymentId, 40) ||
        generateNextSequentialId(
          'TAXPAY',
          taxPayments.map((p) => p.paymentId || p.id)
        );
      const docId = existingId || sanitizeDocId(paymentId);
      const ref = doc(db, 'taxPayments', docId);

      const basePayload = {
        paymentId,
        clientId: clampStr(record.clientId, 40),
        clientName: clampStr(record.clientName, 200),
        paymentType: record.paymentType || 'CP204 Instalment',
        ya: clampStr(record.ya, 16),
        referenceCaseNo: clampStr(record.referenceCaseNo, 80),
        dueDate: clampStr(record.dueDate, 20),
        amountDue,
        amountPaid,
        outstandingAmount,
        paymentDate,
        paymentReference,
        verificationStatus: record.verificationStatus || 'Not Verified',
        followUpStatus: record.followUpStatus || 'Pending',
        remarks: clampStr(record.remarks, 2000),
        updatedBy: actorEmail,
        updatedAt: serverTimestamp(),
      };

      try {
        if (existingId) {
          await updateDoc(ref, basePayload);
        } else {
          await setDoc(ref, {
            ...basePayload,
            createdBy: actorEmail,
            createdAt: serverTimestamp(),
          });
        }
        return docId;
      } catch (err) {
        handleFirestoreError(
          err,
          existingId ? OperationType.UPDATE : OperationType.CREATE,
          `taxPayments/${docId}`
        );
      }
    },
    [user, taxPayments]
  );

  const deleteTaxPayment = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'taxPayments', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `taxPayments/${id}`);
    }
  }, []);

  // ---------------------- CORRESPONDENCE CRUD ----------------------
  const saveCorrespondence = useCallback(
    async (record: CorrespondenceSavePayload, existingId?: string): Promise<string> => {
      const actorEmail = clampStr(user?.email || '', 160);
      if (!clampStr(record.clientId, 40) || !clampStr(record.clientName, 200)) {
        throw new Error('Client selection is required.');
      }
      if (!clampStr(record.dateReceived, 20)) {
        throw new Error('Date Received is required.');
      }
      if (!clampStr(record.letterSubject, 200)) {
        throw new Error('Letter Subject is required.');
      }

      const existingRec = existingId
        ? correspondenceRecords.find((c) => c.id === existingId)
        : undefined;
      const correspondenceId =
        clampStr(record.correspondenceId || existingRec?.correspondenceId, 40) ||
        generateNextSequentialId(
          'COR',
          correspondenceRecords.map((c) => c.correspondenceId || c.id)
        );
      const docId = existingId || sanitizeDocId(correspondenceId);
      const ref = doc(db, 'correspondence', docId);

      const basePayload = {
        correspondenceId,
        clientId: clampStr(record.clientId, 40),
        clientName: clampStr(record.clientName, 200),
        ya: clampStr(record.ya, 16),
        jobId: clampStr(record.jobId, 128),
        dateReceived: clampStr(record.dateReceived, 20),
        methodReceived: record.methodReceived || 'Email',
        category: record.category || 'LHDN',
        letterType: record.letterType || 'Notice',
        letterSubject: clampStr(record.letterSubject, 200),
        letterReferenceNo: clampStr(record.letterReferenceNo, 100),
        detailedInformation: clampStr(record.detailedInformation, 3000),
        dueDate: clampStr(record.dueDate, 20),
        actionRequired: clampStr(record.actionRequired, 500),
        pic: clampStr(record.pic, 120),
        actionStatus: record.actionStatus || 'Pending',
        actionDate: clampStr(record.actionDate, 20),
        remarks: clampStr(record.remarks, 2000),
        attachmentUrl: clampStr(record.attachmentUrl, 500),
        updatedBy: actorEmail,
        updatedAt: serverTimestamp(),
      };

      try {
        if (existingId) {
          await updateDoc(ref, basePayload);
        } else {
          await setDoc(ref, {
            ...basePayload,
            createdBy: actorEmail,
            createdAt: serverTimestamp(),
          });
        }
        return docId;
      } catch (err) {
        handleFirestoreError(
          err,
          existingId ? OperationType.UPDATE : OperationType.CREATE,
          `correspondence/${docId}`
        );
      }
    },
    [user, correspondenceRecords]
  );

  const deleteCorrespondence = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'correspondence', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `correspondence/${id}`);
    }
  }, []);

  // ---------------------- WORK DONE & FINANCE CRUD ----------------------
  const saveWorkDone = useCallback(
    async (record: WorkDoneSavePayload, existingId?: string): Promise<string> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const role = staffProfile?.role || (actorEmail.toLowerCase() === 'tjwang.tax@gmail.com' ? 'Admin' : 'Report Viewer');
      const isRoleAdmin = role === 'Admin';
      const isRoleMgrOrAdmin = role === 'Admin' || role === 'Manager-HOD';

      if (role === 'Report Viewer') {
        throw new Error('Report Viewer role is strictly read-only.');
      }
      if (!clampStr(record.clientId, 40) || !clampStr(record.clientName, 200)) {
        throw new Error('Client selection is required.');
      }

      const existingRec = existingId
        ? workDoneRecords.find((w) => w.id === existingId)
        : undefined;

      const ADMIN_ONLY_STATUSES = ['Returned by Finance', 'Ready for Invoicing', 'Invoiced'];

      // Already-invoiced protection: only Admin may modify, and pricing edits require correction reason in remarks
      if (existingRec && existingRec.workDoneStatus === 'Invoiced') {
        if (!isRoleAdmin) {
          throw new Error('Only Admin can modify an already-invoiced Work Done record.');
        }
      }

      if (ADMIN_ONLY_STATUSES.includes(record.workDoneStatus) && !isRoleAdmin) {
        throw new Error(
          `Only Admin can set Work Done Status to "${record.workDoneStatus}".`
        );
      }

      const cleanDesc = clampStr(record.workDoneDescription, 4000);
      const descLines = cleanDesc
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Enforce Manager-HOD / Admin role guard on hodPrice, pricingMode, feeAllocations
      let pricingMode = record.pricingMode || 'Overall Fee';
      let feeAllocations: WorkDoneFeeAllocation[] = [];
      let hodPrice: number | null =
        record.hodPrice === null || record.hodPrice === undefined
          ? null
          : Math.round(safeNum(record.hodPrice) * 100) / 100;

      if (!isRoleMgrOrAdmin) {
        if (existingRec) {
          pricingMode = existingRec.pricingMode;
          feeAllocations = existingRec.feeAllocations;
          hodPrice = existingRec.hodPrice;
        } else {
          pricingMode = 'Overall Fee';
          feeAllocations = [];
          hodPrice = null;
        }
      } else if (pricingMode === 'Individual Allocation') {
        if (descLines.length === 0) {
          throw new Error(
            'Individual Allocation mode requires at least one non-empty line in Work Done Description.'
          );
        }
        const incomingAllocs = (record.feeAllocations || []).slice(0, 50);
        if (incomingAllocs.length !== descLines.length) {
          throw new Error(
            'In Individual Allocation mode, each allocation line must match the newline-delimited Work Done Description items in order.'
          );
        }
        feeAllocations = descLines.map((lineDesc, idx) => {
          const item = incomingAllocs[idx];
          if ((item?.description || '').trim() !== lineDesc) {
            throw new Error(
              `Allocation line ${idx + 1} description must match Work Done Description line ${idx + 1} exactly.`
            );
          }
          return {
            lineNo: idx + 1,
            description: lineDesc.slice(0, 300),
            fee: Math.max(0, Math.round(safeNum(item?.fee) * 100) / 100),
          };
        });
        hodPrice =
          Math.round(feeAllocations.reduce((sum, a) => sum + a.fee, 0) * 100) / 100;
      } else {
        feeAllocations = [];
      }

      const additionalCharges = Math.round(safeNum(record.additionalCharges) * 100) / 100;
      const sstAmount: number | null =
        record.sstAmount === null || record.sstAmount === undefined
          ? null
          : Math.max(0, Math.round(safeNum(record.sstAmount) * 100) / 100);
      const auditFee: number | null =
        record.auditFee === null || record.auditFee === undefined
          ? null
          : Math.max(0, Math.round(safeNum(record.auditFee) * 100) / 100);
      const quotationPrice: number | null =
        record.quotationPrice === null || record.quotationPrice === undefined
          ? null
          : Math.max(0, Math.round(safeNum(record.quotationPrice) * 100) / 100);
      const priorYearPrice: number | null =
        record.priorYearPrice === null || record.priorYearPrice === undefined
          ? null
          : Math.max(0, Math.round(safeNum(record.priorYearPrice) * 100) / 100);

      // Strict pricing formula: finalPrice = hodPrice + additionalCharges; totalInvoiceAmount = finalPrice + sstAmount
      const finalPrice = Math.round(((hodPrice ?? 0) + additionalCharges) * 100) / 100;
      const totalInvoiceAmount = Math.round((finalPrice + (sstAmount ?? 0)) * 100) / 100;

      // Status transition rules
      let financeInvoiceStatus = record.financeInvoiceStatus || 'Not Submitted';
      const invoiceNo = clampStr(record.invoiceNo, 80);
      const issueDate = clampStr(record.issueDate, 20);
      const remarks = clampStr(record.remarks, 2000);

      if (record.workDoneStatus === 'Completed — Pending Finance') {
        if (hodPrice === null) {
          throw new Error(
            'HOD Price must be explicitly entered by a Manager-HOD or Admin before moving to "Completed — Pending Finance" (Quotation Price is never substituted).'
          );
        }
        if (sstAmount === null) {
          throw new Error(
            'SST Amount must be explicitly entered (enter 0 if SST-exempt) before moving to "Completed — Pending Finance".'
          );
        }
        financeInvoiceStatus = 'Pending Review';
      } else if (record.workDoneStatus === 'Returned by Finance') {
        financeInvoiceStatus = 'Returned';
      } else if (record.workDoneStatus === 'Ready for Invoicing') {
        if (hodPrice === null || sstAmount === null) {
          throw new Error('HOD Price and explicit SST Amount are required for Ready for Invoicing.');
        }
        financeInvoiceStatus = 'Ready for Invoicing';
      } else if (record.workDoneStatus === 'Invoiced') {
        if (!invoiceNo || !issueDate) {
          throw new Error('Invoice No. and Issue Date are required to mark a record as Invoiced.');
        }
        if (hodPrice === null || sstAmount === null) {
          throw new Error('HOD Price and explicit SST Amount are required for Invoiced records.');
        }
        financeInvoiceStatus = 'Invoiced';
      } else if (record.workDoneStatus === 'Cancelled') {
        financeInvoiceStatus = 'Cancelled';
      }

      // Admin pricing correction on already-invoiced record requires a correction reason in remarks
      if (existingRec && existingRec.workDoneStatus === 'Invoiced') {
        const pricingChanged =
          existingRec.hodPrice !== hodPrice ||
          existingRec.additionalCharges !== additionalCharges ||
          existingRec.sstAmount !== sstAmount ||
          existingRec.pricingMode !== pricingMode ||
          JSON.stringify(existingRec.feeAllocations) !== JSON.stringify(feeAllocations);
        if (pricingChanged && (!remarks || remarks === (existingRec.remarks || '').trim())) {
          throw new Error(
            'Modifying pricing on an already-invoiced record requires adding a correction reason in Remarks.'
          );
        }
      }

      const workDoneId =
        clampStr(record.workDoneId || existingRec?.workDoneId, 40) ||
        generateNextSequentialId(
          'WD',
          workDoneRecords.map((w) => w.workDoneId || w.id)
        );
      const docId = existingId || sanitizeDocId(workDoneId);
      const ref = doc(db, 'workDone', docId);

      const commonPayload: Record<string, unknown> = {
        workDoneId,
        jobId: clampStr(record.jobId, 128),
        clientId: clampStr(record.clientId, 40),
        clientName: clampStr(record.clientName, 200),
        ya: clampStr(record.ya, 16),
        jobType: clampStr(record.jobType, 60),
        pic: clampStr(record.pic, 120),
        reviewer: clampStr(record.reviewer, 120),
        jobStatus: clampStr(record.jobStatus, 60),
        workDoneDescription: cleanDesc,
        auditFee,
        quotationPrice,
        priorYearPrice,
        additionalCharges,
        finalPrice,
        sstAmount,
        totalInvoiceAmount,
        workDoneStatus: record.workDoneStatus || 'Draft',
        financeInvoiceStatus,
        cancellationDate: clampStr(record.cancellationDate, 20),
        cancellationReason: clampStr(record.cancellationReason, 500),
        remarks,
        updatedBy: actorEmail,
        updatedAt: serverTimestamp(),
      };

      if (isRoleMgrOrAdmin || !existingId) {
        commonPayload.pricingMode = pricingMode;
        commonPayload.feeAllocations = feeAllocations;
        commonPayload.hodPrice = hodPrice;
      }

      if (isRoleAdmin || !existingId) {
        commonPayload.invoiceNo = isRoleAdmin ? invoiceNo : '';
        commonPayload.issueDate = isRoleAdmin ? issueDate : '';
      }

      try {
        if (existingId) {
          await updateDoc(ref, commonPayload);
        } else {
          await setDoc(ref, {
            ...commonPayload,
            createdBy: actorEmail,
            createdAt: serverTimestamp(),
          });
        }
        return docId;
      } catch (err) {
        handleFirestoreError(
          err,
          existingId ? OperationType.UPDATE : OperationType.CREATE,
          `workDone/${docId}`
        );
      }
    },
    [user, staffProfile, workDoneRecords]
  );

  const deleteWorkDone = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'workDone', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `workDone/${id}`);
    }
  }, []);

  // ---------------------- NOTIFICATIONS ----------------------
  const publishAnnouncement = useCallback(
    async (title: string, message: string, targetRole: 'ALL' | 'Admin' | 'Manager-HOD' = 'ALL') => {
      if (!user?.email || !staffProfile) return;
      const docId = sanitizeDocId(`ANN_${Date.now().toString(36)}`);
      const ref = doc(db, 'notifications', docId);
      const authorKey = emailToStaffKey(user.email);
      try {
        await setDoc(ref, {
          type: 'announcement',
          title: clampStr(title, 160),
          message: clampStr(message, 2000),
          authorEmail: clampStr(user.email, 160),
          authorName: clampStr(staffProfile.staffName, 120),
          authorRole: clampStr(staffProfile.role, 40),
          targetRole,
          readBy: [authorKey],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `notifications/${docId}`);
      }
    },
    [user, staffProfile]
  );

  const sendSuggestion = useCallback(
    async (title: string, message: string) => {
      if (!user?.email || !staffProfile) return;
      const docId = sanitizeDocId(`SUG_${Date.now().toString(36)}`);
      const ref = doc(db, 'notifications', docId);
      const authorKey = emailToStaffKey(user.email);
      try {
        await setDoc(ref, {
          type: 'suggestion',
          title: clampStr(title, 160),
          message: clampStr(message, 2000),
          authorEmail: clampStr(user.email, 160),
          authorName: clampStr(staffProfile.staffName, 120),
          authorRole: clampStr(staffProfile.role, 40),
          targetRole: 'Manager-HOD',
          readBy: [authorKey],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `notifications/${docId}`);
      }
    },
    [user, staffProfile]
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!user?.email) return;
      if (isReadOnly) {
        setLocalReadIds((prev) => {
          if (prev.includes(notificationId)) return prev;
          const next = [...prev, notificationId];
          try {
            localStorage.setItem(LOCAL_READ_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });
        return;
      }

      const item = notifications.find((n) => n.id === notificationId);
      if (!item) return;
      const key = emailToStaffKey(user.email);
      if (item.readBy.includes(key)) return;

      const updatedReadBy = [...item.readBy, key].slice(0, 100);
      try {
        await updateDoc(doc(db, 'notifications', notificationId), {
          readBy: updatedReadBy,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
      }
    },
    [user, isReadOnly, notifications]
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!user?.email) return;
    if (isReadOnly) {
      const allIds = notifications.map((n) => n.id);
      setLocalReadIds(allIds);
      try {
        localStorage.setItem(LOCAL_READ_STORAGE_KEY, JSON.stringify(allIds));
      } catch {
        // ignore
      }
      return;
    }

    const key = emailToStaffKey(user.email);
    const unread = notifications.filter((n) => !n.readBy.includes(key));
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      for (const n of unread) {
        batch.update(doc(db, 'notifications', n.id), {
          readBy: [...n.readBy, key].slice(0, 100),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications/batch_read');
    }
  }, [user, isReadOnly, notifications]);

  const batchReassignClientPic = useCallback(
    async ({
      fromPic,
      toPic,
      clientDocIds,
      cascadeToJobsAndCp204,
      note,
    }: {
      fromPic: string;
      toPic: string;
      clientDocIds: string[];
      cascadeToJobsAndCp204: boolean;
      note?: string;
    }): Promise<{ clientsUpdated: number; jobsUpdated: number; cp204Updated: number }> => {
      const actorEmail = clampStr(user?.email || staffProfile?.email || 'system', 160);
      const actorLabel = clampStr(
        staffProfile ? `${staffProfile.staffName} (${actorEmail})` : actorEmail,
        160
      );
      const cleanToPic = clampStr(toPic, 120);
      const cleanFromPic = clampStr(fromPic, 120) || 'Unassigned';
      const cleanNote = clampStr(note, 300);
      const todayIso = new Date().toISOString().slice(0, 10);
      const selectedIdSet = new Set(clientDocIds.filter(Boolean));
      const targetClients = clients.filter((c) => selectedIdSet.has(c.id));
      if (targetClients.length === 0) {
        return { clientsUpdated: 0, jobsUpdated: 0, cp204Updated: 0 };
      }

      const targetNormClientIds = new Set(
        targetClients.map((c) => normalizeClientIdKey(c.clientId)).filter(Boolean)
      );

      const targetJobs = cascadeToJobsAndCp204
        ? jobs.filter(
            (j) =>
              isJobOpenForWork(j) &&
              ((j.clientDocId && selectedIdSet.has(j.clientDocId)) ||
                targetNormClientIds.has(normalizeClientIdKey(j.clientId)))
          )
        : [];

      const targetCp204 = cascadeToJobsAndCp204
        ? cp204Records.filter(
            (rec) =>
              (rec.status || '').trim().toLowerCase() !== 'completed' &&
              targetNormClientIds.has(normalizeClientIdKey(rec.clientId))
          )
        : [];

      type BatchWriteOp =
        | { type: 'update'; collectionName: 'clients' | 'jobs' | 'cp204'; id: string; data: Record<string, unknown> }
        | { type: 'set'; collectionName: 'history'; id: string; data: Record<string, unknown> };

      const ops: BatchWriteOp[] = [];
      const batchNonce = Date.now().toString(36);

      for (const c of targetClients) {
        const clientFromPic = (c.taxPic || '').trim() || cleanFromPic;
        const entry: PicHistoryEntry = {
          date: todayIso,
          fromPic: clientFromPic,
          toPic: cleanToPic || 'Unassigned',
          transferredBy: actorLabel || actorEmail,
          note: cleanNote || 'Batch Portfolio Handover',
        };
        const nextHistory = [...(Array.isArray(c.picHistory) ? c.picHistory : []), entry].slice(-100);
        ops.push({
          type: 'update',
          collectionName: 'clients',
          id: c.id,
          data: {
            taxPic: cleanToPic,
            picHistory: nextHistory,
            updatedBy: actorEmail,
            updatedAt: serverTimestamp(),
          },
        });
      }

      targetJobs.forEach((j, idx) => {
        const priorJobPic = (j.taxPic || '').trim() || cleanFromPic;
        ops.push({
          type: 'update',
          collectionName: 'jobs',
          id: j.id,
          data: {
            taxPic: cleanToPic,
            previousPic: priorJobPic,
            updatedBy: actorEmail,
            updatedAt: serverTimestamp(),
          },
        });

        const jobHistId = sanitizeDocId(`HIST_PIC_${j.id}_${batchNonce}_${idx}`);
        ops.push({
          type: 'set',
          collectionName: 'history',
          id: jobHistId,
          data: {
            timestamp: serverTimestamp(),
            jobId: j.id,
            action: 'PIC_HANDOVER',
            oldStatus: clampStr(priorJobPic, 60),
            newStatus: clampStr(cleanToPic || 'Unassigned', 60),
            user: actorLabel || actorEmail,
            remarks: clampStr(
              `PIC Handover: ${priorJobPic} → ${cleanToPic || 'Unassigned'} — Continued by ${
                cleanToPic || 'Unassigned'
              } (Batch Portfolio Handover${cleanNote ? `: ${cleanNote}` : ''})`,
              1000
            ),
          },
        });
      });

      for (const r of targetCp204) {
        ops.push({
          type: 'update',
          collectionName: 'cp204',
          id: r.id,
          data: {
            pic: cleanToPic,
            updatedBy: actorEmail,
            updatedAt: serverTimestamp(),
          },
        });
      }

      const summaryHistId = sanitizeDocId(
        `HIST_PIC_BATCH_${batchNonce}_${Math.random().toString(36).slice(2, 6)}`
      );
      const extraSummary = cascadeToJobsAndCp204
        ? ` (+ ${targetJobs.length} open job${targetJobs.length === 1 ? '' : 's'}, ${targetCp204.length} active CP204)`
        : '';
      ops.push({
        type: 'set',
        collectionName: 'history',
        id: summaryHistId,
        data: {
          timestamp: serverTimestamp(),
          jobId: 'BATCH_PIC_TRANSFER',
          action: 'Batch PIC Transfer',
          oldStatus: clampStr(cleanFromPic, 60),
          newStatus: clampStr(cleanToPic || 'Unassigned', 60),
          user: actorLabel || actorEmail,
          remarks: clampStr(
            `Batch PIC Transfer: ${cleanFromPic} → ${cleanToPic || 'Unassigned'} (${
              targetClients.length
            } client${targetClients.length === 1 ? '' : 's'})${extraSummary}${
              cleanNote ? ` · Note: ${cleanNote}` : ''
            }`,
            1000
          ),
        },
      });

      const CHUNK_SIZE = 400;
      try {
        for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
          const chunk = ops.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          for (const op of chunk) {
            const targetRef = doc(db, op.collectionName, op.id);
            if (op.type === 'update') {
              batch.update(targetRef, op.data);
            } else {
              batch.set(targetRef, op.data);
            }
          }
          await batch.commit();
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'clients/batch_reassign_pic');
      }

      return {
        clientsUpdated: targetClients.length,
        jobsUpdated: targetJobs.length,
        cp204Updated: targetCp204.length,
      };
    },
    [clients, jobs, cp204Records, user, staffProfile]
  );

  return (
    <DataContext.Provider
      value={{
        staff,
        settings,
        clients,
        jobs,
        history,
        calendarEvents,
        notifications,
        cp204Records,
        taxPayments,
        correspondenceRecords,
        workDoneRecords,
        loading,
        refreshing,
        lastRefreshedAt,
        refreshAll,
        getSettingsByGroup,
        resolveSettingBadge,
        getHistoryForJob,
        saveStaffMember,
        deleteStaffMember,
        saveSetting,
        deleteSetting,
        seedDefaultSettings,
        saveClient,
        inactivateClient,
        reactivateClient,
        deleteClient,
        batchReassignClientPic,
        saveJob,
        batchCreateJobs,
        batchUpdateJobs,
        deleteJob,
        excludedHolidays,
        excludePublicHoliday,
        restorePublicHoliday,
        restoreAllPublicHolidays,
        saveCalendarEvent,
        batchSaveCalendarEvents,
        batchUpdateCalendarEvents,
        deleteCalendarEvent,
        batchDeleteCalendarEvents,
        saveCp204,
        batchCreateCp204,
        deleteCp204,
        saveTaxPayment,
        deleteTaxPayment,
        saveCorrespondence,
        deleteCorrespondence,
        saveWorkDone,
        deleteWorkDone,
        publishAnnouncement,
        sendSuggestion,
        markNotificationRead,
        markAllNotificationsRead,
        localReadIds,
        columnPreferences,
        columnPreferencesLoaded,
        saveColumnPreference,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}

export function useOptionalData(): DataContextValue | null {
  return useContext(DataContext);
}
