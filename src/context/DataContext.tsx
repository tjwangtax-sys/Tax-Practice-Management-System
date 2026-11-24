import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, emailToStaffKey, handleFirestoreError, OperationType } from '../lib/firebase';
import { DEFAULT_MALAYSIAN_TAX_SETTINGS } from '../lib/defaultSettings';
import { applyMalaysianJobRules } from '../lib/deadlineUtils';
import {
  CalendarEvent,
  clampStr,
  ClientRecord,
  JobHistoryEntry,
  NotificationItem,
  safeNum,
  sanitizeDocId,
  SettingValue,
  StaffMember,
  TaxJob,
} from '../types/tpms';
import { useAuth } from './AuthContext';

export type JobSavePayload = Omit<
  TaxJob,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

interface DataContextValue {
  staff: StaffMember[];
  settings: SettingValue[];
  clients: ClientRecord[];
  jobs: TaxJob[];
  history: JobHistoryEntry[];
  calendarEvents: CalendarEvent[];
  notifications: NotificationItem[];
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
    isEdit?: boolean
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
  // Jobs CRUD + Batch Add + Audit History
  saveJob: (job: JobSavePayload, existingId?: string, auditRemarks?: string) => Promise<string>;
  batchCreateJobs: (items: JobSavePayload[]) => Promise<{ createdCount: number; skippedCount: number }>;
  deleteJob: (jobId: string) => Promise<void>;
  // Calendar Events CRUD
  saveCalendarEvent: (
    event: Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<string>;
  deleteCalendarEvent: (eventId: string) => Promise<void>;
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
}

const DataContext = createContext<DataContextValue | null>(null);

const LOCAL_READ_STORAGE_KEY = 'tpms_local_read_notifications_v1';

function buildSanitizedJobDocument(
  rawJob: JobSavePayload,
  actorEmail: string
) {
  const computed = applyMalaysianJobRules(rawJob);

  return {
    computedStatus: clampStr(computed.status || 'Not Started', 60),
    payload: {
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
      reviewer: clampStr(computed.reviewer, 120),
      status: clampStr(computed.status || 'Not Started', 60),
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
    },
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

  useEffect(() => {
    if (accessStatus !== 'authorized' || !user) {
      setStaff([]);
      setSettings([]);
      setClients([]);
      setJobs([]);
      setHistory([]);
      setCalendarEvents([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let settledCount = 0;
    const markSettled = () => {
      settledCount += 1;
      if (settledCount >= 7) {
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
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ClientRecord, 'id'>) }))
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

    return () => {
      unsubStaff();
      unsubSettings();
      unsubClients();
      unsubJobs();
      unsubHistory();
      unsubCalendar();
      unsubNotifications();
    };
  }, [accessStatus, user, refreshNonce]);

  const refreshAll = useCallback(() => {
    setRefreshing(true);
    setRefreshNonce((n) => n + 1);
  }, []);

  const getSettingsByGroup = useCallback(
    (group: string, includeInactive = false) => {
      return settings
        .filter((s) => s.group === group && (includeInactive || s.active))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },
    [settings]
  );

  const settingsIndex = useMemo(() => {
    const map = new Map<string, SettingValue>();
    for (const s of settings) {
      map.set(`${s.group}::${s.displayName.toLowerCase()}`, s);
      map.set(`${s.group}::${s.code.toLowerCase()}`, s);
      map.set(`ANY::${s.displayName.toLowerCase()}`, s);
      map.set(`ANY::${s.code.toLowerCase()}`, s);
    }
    return map;
  }, [settings]);

  const resolveSettingBadge = useCallback(
    (group: string, value: string | undefined | null) => {
      const raw = (value ?? '').trim();
      if (!raw) return { label: '—', color: '#64748B' };
      const key = raw.toLowerCase();
      const matched =
        settingsIndex.get(`${group}::${key}`) ?? settingsIndex.get(`ANY::${key}`);

      if (matched) {
        return { label: matched.displayName, color: matched.badgeColor };
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
    async (member: Omit<StaffMember, 'id' | 'createdAt' | 'updatedAt'>, isEdit = false) => {
      const normalizedEmail = clampStr(member.email.toLowerCase(), 160);
      const docId = emailToStaffKey(normalizedEmail);
      const ref = doc(db, 'staff', docId);
      try {
        if (isEdit) {
          await updateDoc(ref, {
            staffId: clampStr(member.staffId, 32),
            staffName: clampStr(member.staffName, 120),
            email: normalizedEmail,
            role: member.role,
            active: Boolean(member.active),
            department: clampStr(member.department, 80),
            designation: clampStr(member.designation, 80),
            phone: clampStr(member.phone, 40),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            staffId: clampStr(member.staffId, 32),
            staffName: clampStr(member.staffName, 120),
            email: normalizedEmail,
            role: member.role,
            active: Boolean(member.active),
            department: clampStr(member.department, 80),
            designation: clampStr(member.designation, 80),
            phone: clampStr(member.phone, 40),
            uid: clampStr(member.uid, 128),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(
          err,
          isEdit ? OperationType.UPDATE : OperationType.CREATE,
          `staff/${docId}`
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
      const docId = sanitizeDocId(setting.id || `${setting.group}_${setting.code}`);
      const ref = doc(db, 'settings', docId);
      const hex = /^#[0-9a-fA-F]{6}$/.test(setting.badgeColor) ? setting.badgeColor : '#475569';
      const payload = {
        group: clampStr(setting.group.toUpperCase(), 64),
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
    const existingIds = new Set(settings.map((s) => s.id));
    const toCreate = DEFAULT_MALAYSIAN_TAX_SETTINGS.filter((item) => !existingIds.has(item.id));
    if (toCreate.length === 0) return 0;

    try {
      const batch = writeBatch(db);
      for (const item of toCreate) {
        const ref = doc(db, 'settings', item.id);
        batch.set(ref, {
          group: item.group,
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
      await batch.commit();
      return toCreate.length;
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
      const docId = existingId || sanitizeDocId(`CL_${client.clientId}_${Date.now().toString(36)}`);
      const ref = doc(db, 'clients', docId);

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
        firstYa: clampStr(client.firstYa, 20),
        firstYaStatus: clampStr(client.firstYaStatus, 60),
        secondYa: clampStr(client.secondYa, 20),
        secondYaStatus: clampStr(client.secondYaStatus, 60),
        groupId: clampStr(client.groupId, 60),
        companySecretary: clampStr(client.companySecretary, 120),
        registeredAddress: clampStr(client.registeredAddress, 500),
        businessHistory: (client.businessHistory || []).slice(0, 50),
        relatedPersons: (client.relatedPersons || []).slice(0, 50),
        partnershipPartners: (client.partnershipPartners || []).slice(0, 50),
        yaMonitoring: (client.yaMonitoring || []).slice(0, 50),
        updatedBy: actorEmail,
        updatedAt: serverTimestamp(),
      };

      try {
        if (existingId) {
          if (staffProfile?.role === 'Staff') {
            const { clientStatus: _cs, dateOfResigned: _dr, ...staffAllowed } = basePayload;
            await updateDoc(ref, staffAllowed);
          } else {
            await updateDoc(ref, basePayload);
          }
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
          `clients/${docId}`
        );
      }
    },
    [user, staffProfile]
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

      const { payload, computedStatus } = buildSanitizedJobDocument(job, actorEmail);

      const action = !existingId
        ? 'CREATED'
        : oldStatus !== computedStatus
        ? 'STATUS_CHANGED'
        : 'UPDATED';

      const defaultRemark = !existingId
        ? `Created ${payload.jobType || payload.module} job (${payload.jobCode}) for ${payload.clientName}`
        : oldStatus !== computedStatus
        ? `Status updated from "${oldStatus}" to "${computedStatus}"`
        : `Updated job fields for ${payload.jobCode}`;

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

        batch.set(doc(db, 'history', historyDocId), {
          timestamp: serverTimestamp(),
          jobId: docId,
          action,
          oldStatus: clampStr(oldStatus, 60),
          newStatus: clampStr(computedStatus, 60),
          user: actorLabel,
          remarks: clampStr(auditRemarks || defaultRemark, 1000),
        });

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
            const { payload, computedStatus } = buildSanitizedJobDocument(item, actorEmail);

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
                `Batch created ${payload.jobType || payload.module} (${payload.ya || ''}) for ${payload.clientName}`,
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
  const saveCalendarEvent = useCallback(
    async (
      event: Omit<CalendarEvent, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const actorEmail = clampStr(user?.email || '', 160);
      const docId = existingId || sanitizeDocId(`EVT_${Date.now().toString(36)}`);
      const ref = doc(db, 'calendarEvents', docId);
      const basePayload = {
        title: clampStr(event.title, 160),
        eventType: clampStr(event.eventType, 40),
        startDate: clampStr(event.startDate, 20),
        endDate: clampStr(event.endDate || event.startDate, 20),
        assignedTo: clampStr(event.assignedTo, 120),
        clientId: clampStr(event.clientId, 40),
        clientName: clampStr(event.clientName, 200),
        notes: clampStr(event.notes, 1000),
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
          `calendarEvents/${docId}`
        );
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
        saveJob,
        batchCreateJobs,
        deleteJob,
        saveCalendarEvent,
        deleteCalendarEvent,
        publishAnnouncement,
        sendSuggestion,
        markNotificationRead,
        markAllNotificationsRead,
        localReadIds,
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
