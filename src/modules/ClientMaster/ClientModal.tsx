import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  UserX,
  UserCheck,
  Lock,
  Save,
  Printer,
  AlertTriangle,
  Pencil,
  Check,
  Link2,
  History,
} from 'lucide-react';
import {
  BusinessHistoryItem,
  CLIENT_STATUS_OPTIONS,
  ClientCategory,
  ClientRecord,
  FYE_MONTHS,
  PartnershipPartnerItem,
  RelatedPersonItem,
  YaMonitoringItem,
  formatCurrencyRM,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { StatusPill } from '../../components/StatusPill';
import { buildDynamicSelectOptions } from '../../lib/settingsDropdown';
import {
  formatDateDDMMYYYY,
  formatOverdueLabel,
  getStagePillClasses,
  getSubmissionStatusPillClasses,
  getYaSequencePillClasses,
  isIsoDateString,
} from '../../lib/jobUtils';
import {
  buildConsolidatedYaSchedule,
  normalizeYaKey,
  printClientComplianceHistory,
} from './yaMonitoringUtils';

interface ClientModalProps {
  open: boolean;
  client: ClientRecord | null;
  defaultCategory?: ClientCategory;
  onClose: () => void;
  onRequestInactivate?: (client: ClientRecord) => void;
  onRequestReactivate?: (client: ClientRecord) => void;
}

type ModalTab =
  | 'details'
  | 'business-history'
  | 'related-persons'
  | 'partnership-partners'
  | 'ya-monitoring';

type DetailsSubTab =
  | 'basic'
  | 'corporate-dates'
  | 'tax-setup'
  | 'compliance'
  | 'business-individual'
  | 'contact-other';

const DETAILS_SUB_TABS: Array<{ id: DetailsSubTab; label: string; shortLabel: string }> = [
  { id: 'basic', label: 'Basic Info', shortLabel: '1. Basic Info' },
  {
    id: 'corporate-dates',
    label: 'Corporate Dates & Operational',
    shortLabel: '2. Corporate Dates & Operational',
  },
  { id: 'tax-setup', label: 'Tax & Engagement Setup', shortLabel: '3. Tax & Engagement Setup' },
  { id: 'compliance', label: 'Compliance & Portals', shortLabel: '4. Compliance & Portals' },
  {
    id: 'business-individual',
    label: 'Business / Individual Details',
    shortLabel: '5. Business / Individual',
  },
  { id: 'contact-other', label: 'Contact & Other Info', shortLabel: '6. Contact & Other Info' },
];

type ClientFormState = Omit<
  ClientRecord,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

function createEmptyClient(defaultCategory: ClientCategory = 'Corporate'): ClientFormState {
  const defaultFirstYa = String(new Date().getFullYear());
  return {
    clientId: '',
    clientName: '',
    companyNo: '',
    tin: '',
    fye: '12',
    taxPic: '',
    category: defaultCategory,
    clientStatus: 'Active',
    smeStatus: 'SME',
    taxAgent: '',
    myTaxAppointment: 'Pending',
    eInvoiceStatus: 'Phase 3 (RM5M–25M)',
    sstRegistered: 'No',
    sstNo: '',
    email: '',
    phone: '',
    dateOfIncorporation: '',
    dateOfCommencementBusiness: '',
    dateOfEngagement: new Date().toISOString().slice(0, 10),
    dateOfResigned: '',
    auditor: '',
    account: '',
    eNumber: '',
    specialRemarks: '',
    personNo: '',
    relationship: '',
    engagementStatus: 'LOE Signed',
    businessName: '',
    businessType: '',
    businessSsmNo: '',
    businessENumber: '',
    businessStartDate: '',
    businessStatus: 'Operating',
    firstYa: defaultFirstYa,
    firstYA: defaultFirstYa,
    firstYaStatus: 'In Progress',
    secondYa: String(new Date().getFullYear() + 1),
    secondYaStatus: 'Pending Docs',
    groupId: '',
    companySecretary: '',
    registeredAddress: '',
    oldRegNo: '',
    principalActivity: '',
    principalActivity1: '',
    msicCode1: '',
    principalActivity2: '',
    msicCode2: '',
    principalActivity3: '',
    msicCode3: '',
    feeBillingNotes: '',
    eInvoiceImplDate: '',
    maritalStatus: '',
    spouseName: '',
    spouseTin: '',
    employerDetails: '',
    contactPerson: '',
    correspondenceAddress: '',
    businessHistory: [],
    relatedPersons: [],
    partnershipPartners: [],
    yaMonitoring: [],
  };
}

function makeRowId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const ClientModal: React.FC<ClientModalProps> = ({
  open,
  client,
  defaultCategory = 'Corporate',
  onClose,
  onRequestInactivate,
  onRequestReactivate,
}) => {
  const { isReadOnly, isManagerOrAdmin, role } = useAuth();
  const { staff, jobs, cp204Records, saveClient, getSettingsByGroup } = useData();

  const [tab, setTab] = useState<ModalTab>('details');
  const [detailsSubTab, setDetailsSubTab] = useState<DetailsSubTab>('basic');
  const [form, setForm] = useState<ClientFormState>(() => createEmptyClient(defaultCategory));
  const [editingManualYaId, setEditingManualYaId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('details');
    setDetailsSubTab('basic');
    setEditingManualYaId(null);
    setError(null);
    if (client) {
      const resolvedFirstYa = client.firstYA || client.firstYa || '';
      const resolvedActivity1 = client.principalActivity1 || client.principalActivity || '';
      setForm({
        clientId: client.clientId ?? '',
        clientName: client.clientName ?? '',
        companyNo: client.companyNo ?? '',
        tin: client.tin ?? '',
        fye: client.fye ?? '12',
        taxPic: client.taxPic ?? '',
        category: client.category ?? 'Corporate',
        clientStatus: client.clientStatus ?? 'Active',
        smeStatus: client.smeStatus ?? '',
        taxAgent: client.taxAgent ?? '',
        myTaxAppointment: client.myTaxAppointment ?? '',
        eInvoiceStatus: client.eInvoiceStatus ?? '',
        sstRegistered: client.sstRegistered ?? 'No',
        sstNo: client.sstNo ?? '',
        email: client.email ?? '',
        phone: client.phone ?? '',
        dateOfIncorporation: client.dateOfIncorporation ?? '',
        dateOfCommencementBusiness: client.dateOfCommencementBusiness ?? '',
        dateOfEngagement: client.dateOfEngagement ?? '',
        dateOfResigned: client.dateOfResigned ?? '',
        auditor: client.auditor ?? '',
        account: client.account ?? '',
        eNumber: client.eNumber ?? '',
        specialRemarks: client.specialRemarks ?? '',
        personNo: client.personNo ?? '',
        relationship: client.relationship ?? '',
        engagementStatus: client.engagementStatus ?? '',
        businessName: client.businessName ?? '',
        businessType: client.businessType ?? '',
        businessSsmNo: client.businessSsmNo ?? '',
        businessENumber: client.businessENumber ?? '',
        businessStartDate: client.businessStartDate ?? '',
        businessStatus: client.businessStatus ?? '',
        firstYa: resolvedFirstYa,
        firstYA: resolvedFirstYa,
        firstYaStatus: client.firstYaStatus ?? '',
        secondYa: client.secondYa ?? '',
        secondYaStatus: client.secondYaStatus ?? '',
        groupId: client.groupId ?? '',
        companySecretary: client.companySecretary ?? '',
        registeredAddress: client.registeredAddress ?? '',
        oldRegNo: client.oldRegNo ?? '',
        principalActivity: resolvedActivity1,
        principalActivity1: resolvedActivity1,
        msicCode1: client.msicCode1 ?? '',
        principalActivity2: client.principalActivity2 ?? '',
        msicCode2: client.msicCode2 ?? '',
        principalActivity3: client.principalActivity3 ?? '',
        msicCode3: client.msicCode3 ?? '',
        feeBillingNotes: client.feeBillingNotes ?? '',
        eInvoiceImplDate: client.eInvoiceImplDate ?? '',
        maritalStatus: client.maritalStatus ?? '',
        spouseName: client.spouseName ?? '',
        spouseTin: client.spouseTin ?? '',
        employerDetails: client.employerDetails ?? '',
        contactPerson: client.contactPerson ?? '',
        correspondenceAddress: client.correspondenceAddress ?? '',
        businessHistory: Array.isArray(client.businessHistory) ? client.businessHistory : [],
        relatedPersons: Array.isArray(client.relatedPersons) ? client.relatedPersons : [],
        partnershipPartners: Array.isArray(client.partnershipPartners)
          ? client.partnershipPartners
          : [],
        yaMonitoring: Array.isArray(client.yaMonitoring) ? client.yaMonitoring : [],
      });
    } else {
      setForm(createEmptyClient(defaultCategory));
    }
  }, [open, client, defaultCategory]);

  const consolidatedYaRows = useMemo(
    () =>
      buildConsolidatedYaSchedule({
        clientDocId: client?.id,
        clientId: form.clientId || client?.clientId || '',
        category: form.category,
        fye: form.fye,
        smeStatus: form.smeStatus,
        firstYa: form.firstYA || form.firstYa || '',
        secondYa: form.secondYa || '',
        manualItems: form.yaMonitoring,
        jobs,
        cp204Records,
      }),
    [
      client?.id,
      client?.clientId,
      form.clientId,
      form.category,
      form.fye,
      form.smeStatus,
      form.firstYA,
      form.firstYa,
      form.secondYa,
      form.yaMonitoring,
      jobs,
      cp204Records,
    ]
  );

  if (!open) return null;

  const isEdit = Boolean(client);
  const statusOptions = buildDynamicSelectOptions(
    getSettingsByGroup('CLIENT_STATUS'),
    CLIENT_STATUS_OPTIONS,
    form.clientStatus
  );
  const smeOptions = buildDynamicSelectOptions(
    getSettingsByGroup('SME_STATUS'),
    ['SME', 'Non-SME', 'N/A'],
    form.smeStatus
  );
  const myTaxOptions = buildDynamicSelectOptions(
    getSettingsByGroup('MYTAX_APPOINTMENT'),
    ['Appointed', 'Pending', 'Not Appointed', 'Revoked'],
    form.myTaxAppointment
  );
  const eInvoiceOptions = buildDynamicSelectOptions(
    getSettingsByGroup('E_INVOICE_STATUS'),
    [
      'Phase 1 (>RM100M)',
      'Phase 2 (RM25M–100M)',
      'Phase 3 (RM5M–25M)',
      'Phase 4 (RM3M–5M)',
      'Exempt (<RM3M)',
      'Voluntary / Implemented',
      'Not Applicable',
    ],
    form.eInvoiceStatus
  );
  const engagementOptions = buildDynamicSelectOptions(
    getSettingsByGroup('ENGAGEMENT_STATUS'),
    ['LOE Signed', 'Pending LOE', 'Renewal Due', 'Terminated'],
    form.engagementStatus
  );
  const businessStatusOptions = buildDynamicSelectOptions(
    getSettingsByGroup('BUSINESS_STATUS'),
    ['Operating', 'Dormant', 'Ceased'],
    form.businessStatus
  );
  const firstYaStatusOptions = buildDynamicSelectOptions(
    getSettingsByGroup('YA_STATUS'),
    ['Filed', 'In Progress', 'Pending Docs', 'Exempt / Not Applicable'],
    form.firstYaStatus
  );
  const secondYaStatusOptions = buildDynamicSelectOptions(
    getSettingsByGroup('YA_STATUS'),
    ['Filed', 'In Progress', 'Pending Docs', 'Exempt / Not Applicable'],
    form.secondYaStatus
  );

  const activeStaffNames = Array.from(
    new Set(staff.filter((s) => s.active).map((s) => s.staffName.trim()).filter(Boolean))
  );

  const setField = <K extends keyof ClientFormState>(key: K, val: ClientFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const canEditStatus = !isEdit || isManagerOrAdmin;
  const inputCls =
    'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 disabled:bg-slate-50 disabled:text-slate-500';
  const labelCls = 'block text-[11px] font-medium text-slate-600 mb-1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!form.clientId.trim() || !form.clientName.trim()) {
      setError('Client ID and Client Name are required.');
      setTab('details');
      setDetailsSubTab('basic');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const syncedFirstYa = form.firstYA ?? form.firstYa ?? '';
      const syncedActivity1 = form.principalActivity1 ?? form.principalActivity ?? '';
      await saveClient(
        {
          ...form,
          firstYa: syncedFirstYa,
          firstYA: syncedFirstYa,
          principalActivity: syncedActivity1,
          principalActivity1: syncedActivity1,
        },
        client?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save client record.');
    } finally {
      setSaving(false);
    }
  };

  // Sub-tab array helpers
  const addBusinessHistory = () => {
    const row: BusinessHistoryItem = {
      id: makeRowId('bh'),
      businessName: '',
      businessType: 'Sole Proprietorship',
      ssmNo: '',
      eNumber: '',
      startDate: '',
      endDate: '',
      status: 'Operating',
      remarks: '',
    };
    setField('businessHistory', [...form.businessHistory, row]);
  };

  const addRelatedPerson = () => {
    const row: RelatedPersonItem = {
      id: makeRowId('rp'),
      personName: '',
      personNo: '',
      tin: '',
      relationship: 'Director',
      role: 'Key Contact',
      phone: '',
      email: '',
      remarks: '',
    };
    setField('relatedPersons', [...form.relatedPersons, row]);
  };

  const addPartner = () => {
    const row: PartnershipPartnerItem = {
      id: makeRowId('pp'),
      partnerName: '',
      icOrCompanyNo: '',
      tin: '',
      profitSharePct: '50',
      joinDate: '',
      exitDate: '',
      status: 'Active',
    };
    setField('partnershipPartners', [...form.partnershipPartners, row]);
  };

  const addHistoricalYaRow = () => {
    // Pick the next earlier year before the oldest existing YA (or last year if empty)
    const numericYears = consolidatedYaRows
      .map((r) => r.yaSortNum)
      .filter((n) => n >= 1990 && n <= 2100);
    const defaultYa =
      numericYears.length > 0
        ? String(Math.min(...numericYears) - 1)
        : String(new Date().getFullYear() - 1);

    const newId = makeRowId('ya');
    const row: YaMonitoringItem = {
      id: newId,
      ya: defaultYa,
      formType: form.category === 'Individual' ? 'Form B' : 'Form C',
      filingDueDate: '',
      submissionDate: '',
      yaStatus: 'Filed',
      taxPayable: '',
      remarks: '',
      source: 'Manual / Prior Agent',
      yaSequence: '',
      mitrsStatus: '',
      cp204Estimate: '',
      cp204Exempt: false,
      totalTax: '',
      underEstimatePenalty: '',
      formEStatus: '',
      formESubmissionDate: '',
    };
    setField('yaMonitoring', [...form.yaMonitoring, row]);
    setEditingManualYaId(newId);
  };

  const updateManualYaItem = (itemId: string, patch: Partial<YaMonitoringItem>) => {
    setField(
      'yaMonitoring',
      form.yaMonitoring.map((m) => (m.id === itemId ? { ...m, ...patch } : m))
    );
  };

  const removeManualYaItem = (itemId: string) => {
    setField(
      'yaMonitoring',
      form.yaMonitoring.filter((m) => m.id !== itemId)
    );
    if (editingManualYaId === itemId) {
      setEditingManualYaId(null);
    }
  };

  const handlePrintComplianceHistory = () => {
    printClientComplianceHistory(
      {
        clientId: form.clientId || client?.clientId || '',
        clientName: form.clientName || client?.clientName || '',
        tin: form.tin,
        companyNo: form.companyNo,
        fye: form.fye,
        smeStatus: form.smeStatus,
        taxPic: form.taxPic,
        clientStatus: form.clientStatus,
      },
      consolidatedYaRows
    );
  };

  const isResigned = (client?.clientStatus || '').toLowerCase() === 'resigned';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 no-print">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-6xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base text-slate-900 truncate">
                  {isReadOnly
                    ? `Client Profile — ${client?.clientName || ''}`
                    : isEdit
                    ? `Edit Client — ${client?.clientId}`
                    : 'Add New Client'}
                </h2>
                {isEdit && <StatusPill group="CLIENT_STATUS" value={form.clientStatus} />}
                {isReadOnly && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <Lock className="w-3 h-3" /> Read-Only
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Malaysian Tax Client Master · 40 Core Fields &amp; 4 Relational Schedules
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isEdit && client && isManagerOrAdmin && !isResigned && onRequestInactivate && (
              <button
                type="button"
                onClick={() => onRequestInactivate(client)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-md transition-colors"
              >
                <UserX className="w-3.5 h-3.5" />
                Inactivate (Resigned)
              </button>
            )}
            {isEdit && client && isManagerOrAdmin && isResigned && onRequestReactivate && (
              <button
                type="button"
                onClick={() => onRequestReactivate(client)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Reactivate Client
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Tabs */}
        <div className="px-5 pt-2.5 border-b border-slate-200 bg-white flex items-center gap-1 overflow-x-auto shrink-0">
          {(
            [
              { id: 'details', label: 'Client Details (40 Fields)' },
              { id: 'business-history', label: `Business History (${form.businessHistory.length})` },
              { id: 'related-persons', label: `Related Persons (${form.relatedPersons.length})` },
              {
                id: 'partnership-partners',
                label: `Partnership Partners (${form.partnershipPartners.length})`,
              },
              { id: 'ya-monitoring', label: `YA Monitoring (${consolidatedYaRows.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'border-teal-700 text-teal-800 bg-teal-50/40'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {error}
              </div>
            )}

            {tab === 'details' && (
              <div className="space-y-4">
                {/* 6 Organized Core Sub-Tabs */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex items-center gap-1 overflow-x-auto">
                  {DETAILS_SUB_TABS.map((sub) => {
                    const isActive = detailsSubTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setDetailsSubTab(sub.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-teal-700 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                        }`}
                      >
                        {sub.shortLabel}
                      </button>
                    );
                  })}
                </div>

                {/* Sub-Tab 1: Basic Info */}
                {detailsSubTab === 'basic' && (
                  <section className="space-y-3">
                    <div className="pb-2 border-b border-slate-200">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Basic Info &amp; Core Registration
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Primary client identity, SSM registration numbers, LHDN TIN/E-number, and active status.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      <div>
                        <label className={labelCls}>Client ID *</label>
                        <input
                          type="text"
                          required
                          maxLength={40}
                          disabled={isReadOnly}
                          value={form.clientId}
                          onChange={(e) => setField('clientId', e.target.value)}
                          placeholder="e.g. C-0001"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Category *</label>
                        <select
                          disabled={isReadOnly}
                          value={form.category}
                          onChange={(e) => setField('category', e.target.value as ClientCategory)}
                          className={inputCls}
                        >
                          <option value="Corporate">Corporate</option>
                          <option value="Individual">Individual</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>
                          Client Status{' '}
                          {!canEditStatus && role === 'Staff' && (
                            <span className="text-[10px] text-slate-400">(Admin/Manager-HOD)</span>
                          )}
                        </label>
                        <select
                          disabled={isReadOnly || !canEditStatus}
                          value={form.clientStatus}
                          onChange={(e) => setField('clientStatus', e.target.value)}
                          className={inputCls}
                        >
                          {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Client Name *</label>
                        <input
                          type="text"
                          required
                          maxLength={200}
                          disabled={isReadOnly}
                          value={form.clientName}
                          onChange={(e) => setField('clientName', e.target.value)}
                          placeholder="e.g. Meranti Precision Engineering Sdn Bhd"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Group ID</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.groupId}
                          onChange={(e) => setField('groupId', e.target.value)}
                          placeholder="e.g. GRP-MERANTI"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Company / SSM No.</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.companyNo}
                          onChange={(e) => setField('companyNo', e.target.value)}
                          placeholder="e.g. 201901024512"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Old Reg. No.</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.oldRegNo ?? ''}
                          onChange={(e) => setField('oldRegNo', e.target.value)}
                          placeholder="e.g. 1333841-K"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>TIN (Tax Identification No.)</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.tin}
                          onChange={(e) => setField('tin', e.target.value)}
                          placeholder="e.g. C 25849102030"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>E Number (Employer No.)</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.eNumber}
                          onChange={(e) => setField('eNumber', e.target.value)}
                          placeholder="e.g. E 9012345601"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>SST Registered</label>
                        <select
                          disabled={isReadOnly}
                          value={form.sstRegistered}
                          onChange={(e) => setField('sstRegistered', e.target.value)}
                          className={inputCls}
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                          <option value="Exempt">Exempt</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>SST No.</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.sstNo}
                          onChange={(e) => setField('sstNo', e.target.value)}
                          placeholder="e.g. W10-1904-32001234"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* Sub-Tab 2: Corporate Dates & Operational */}
                {detailsSubTab === 'corporate-dates' && (
                  <section className="space-y-3">
                    <div className="pb-2 border-b border-slate-200">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Corporate Dates &amp; Operational Parties
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Key incorporation and engagement milestones along with external auditor, accountant, and company secretary.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                      <div>
                        <label className={labelCls}>Incorporation Date</label>
                        <input
                          type="date"
                          disabled={isReadOnly}
                          value={form.dateOfIncorporation}
                          onChange={(e) => setField('dateOfIncorporation', e.target.value)}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Commencement Date</label>
                        <input
                          type="date"
                          disabled={isReadOnly}
                          value={form.dateOfCommencementBusiness}
                          onChange={(e) => setField('dateOfCommencementBusiness', e.target.value)}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Date of Engagement</label>
                        <input
                          type="date"
                          disabled={isReadOnly}
                          value={form.dateOfEngagement}
                          onChange={(e) => setField('dateOfEngagement', e.target.value)}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Date of Resigned</label>
                        <input
                          type="date"
                          disabled={isReadOnly || !canEditStatus}
                          value={form.dateOfResigned}
                          onChange={(e) => setField('dateOfResigned', e.target.value)}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Account (Accounting PIC / Firm)</label>
                        <input
                          type="text"
                          maxLength={120}
                          disabled={isReadOnly}
                          value={form.account}
                          onChange={(e) => setField('account', e.target.value)}
                          placeholder="Accounting PIC / Firm"
                          className={inputCls}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Auditor</label>
                        <input
                          type="text"
                          maxLength={120}
                          disabled={isReadOnly}
                          value={form.auditor}
                          onChange={(e) => setField('auditor', e.target.value)}
                          placeholder="External Audit Firm"
                          className={inputCls}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Company Secretary</label>
                        <input
                          type="text"
                          maxLength={120}
                          disabled={isReadOnly}
                          value={form.companySecretary}
                          onChange={(e) => setField('companySecretary', e.target.value)}
                          placeholder="Company Secretary Name / Firm"
                          className={inputCls}
                        />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4 pt-1">
                        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-700">
                              SSM Principal Business Activities &amp; MSIC Codes (up to 3)
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Paired SSM nature of business &amp; 5-digit MSIC code
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                            <div className="sm:col-span-3">
                              <label className={labelCls}>Principal Activity 1</label>
                              <input
                                type="text"
                                maxLength={250}
                                disabled={isReadOnly}
                                value={form.principalActivity1 ?? form.principalActivity ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setForm((prev) => ({
                                    ...prev,
                                    principalActivity: val,
                                    principalActivity1: val,
                                  }));
                                }}
                                placeholder="e.g. Precision metal fabrication & engineering services"
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>MSIC Code 1</label>
                              <input
                                type="text"
                                maxLength={20}
                                disabled={isReadOnly}
                                value={form.msicCode1 ?? ''}
                                onChange={(e) => setField('msicCode1', e.target.value)}
                                placeholder="e.g. 25920"
                                className={`${inputCls} font-mono`}
                              />
                            </div>

                            <div className="sm:col-span-3">
                              <label className={labelCls}>Activity 2</label>
                              <input
                                type="text"
                                maxLength={250}
                                disabled={isReadOnly}
                                value={form.principalActivity2 ?? ''}
                                onChange={(e) => setField('principalActivity2', e.target.value)}
                                placeholder="Secondary SSM business activity (optional)"
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>MSIC Code 2</label>
                              <input
                                type="text"
                                maxLength={20}
                                disabled={isReadOnly}
                                value={form.msicCode2 ?? ''}
                                onChange={(e) => setField('msicCode2', e.target.value)}
                                placeholder="e.g. 46909"
                                className={`${inputCls} font-mono`}
                              />
                            </div>

                            <div className="sm:col-span-3">
                              <label className={labelCls}>Activity 3</label>
                              <input
                                type="text"
                                maxLength={250}
                                disabled={isReadOnly}
                                value={form.principalActivity3 ?? ''}
                                onChange={(e) => setField('principalActivity3', e.target.value)}
                                placeholder="Tertiary SSM business activity (optional)"
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>MSIC Code 3</label>
                              <input
                                type="text"
                                maxLength={20}
                                disabled={isReadOnly}
                                value={form.msicCode3 ?? ''}
                                onChange={(e) => setField('msicCode3', e.target.value)}
                                placeholder="e.g. 68109"
                                className={`${inputCls} font-mono`}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Sub-Tab 3: Tax & Engagement Setup */}
                {detailsSubTab === 'tax-setup' && (
                  <section className="space-y-3">
                    <div className="pb-2 border-b border-slate-200">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Tax &amp; Engagement Setup
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Financial year end, 1st &amp; 2nd basis period YA tracking, assigned Tax PIC, and SME profile.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                      <div>
                        <label className={labelCls}>FYE [01–12]</label>
                        <select
                          disabled={isReadOnly}
                          value={form.fye}
                          onChange={(e) => setField('fye', e.target.value)}
                          className={`${inputCls} font-mono`}
                        >
                          <option value="">Select FYE Month</option>
                          {FYE_MONTHS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>1st YA</label>
                        <input
                          type="text"
                          maxLength={20}
                          disabled={isReadOnly}
                          value={form.firstYA ?? form.firstYa}
                          onChange={(e) => {
                            const val = e.target.value;
                            setForm((prev) => ({ ...prev, firstYa: val, firstYA: val }));
                          }}
                          placeholder="e.g. 2026, 2027"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>1st YA Status</label>
                        <select
                          disabled={isReadOnly}
                          value={form.firstYaStatus}
                          onChange={(e) => setField('firstYaStatus', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select YA Status</option>
                          {firstYaStatusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>2nd YA</label>
                        <input
                          type="text"
                          maxLength={20}
                          disabled={isReadOnly}
                          value={form.secondYa}
                          onChange={(e) => setField('secondYa', e.target.value)}
                          placeholder="e.g. 2027, 2028"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>2nd YA Status</label>
                        <select
                          disabled={isReadOnly}
                          value={form.secondYaStatus}
                          onChange={(e) => setField('secondYaStatus', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select YA Status</option>
                          {secondYaStatusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>TAX PIC</label>
                        <input
                          type="text"
                          list="tpms-staff-pic-list"
                          maxLength={120}
                          disabled={isReadOnly}
                          value={form.taxPic}
                          onChange={(e) => setField('taxPic', e.target.value)}
                          placeholder="Assign Tax PIC"
                          className={inputCls}
                        />
                        <datalist id="tpms-staff-pic-list">
                          {activeStaffNames.map((n) => (
                            <option key={n} value={n} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className={labelCls}>Tax Agent</label>
                        <input
                          type="text"
                          maxLength={120}
                          disabled={isReadOnly}
                          value={form.taxAgent}
                          onChange={(e) => setField('taxAgent', e.target.value)}
                          placeholder="Appointed Tax Agent Name / TA No."
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>SME Status</label>
                        <select
                          disabled={isReadOnly}
                          value={form.smeStatus}
                          onChange={(e) => setField('smeStatus', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select SME Status</option>
                          {smeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Engagement Status</label>
                        <select
                          disabled={isReadOnly}
                          value={form.engagementStatus}
                          onChange={(e) => setField('engagementStatus', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select Engagement Status</option>
                          {engagementOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4">
                        <label className={labelCls}>Fee / Billing Notes</label>
                        <textarea
                          rows={2}
                          maxLength={500}
                          disabled={isReadOnly}
                          value={form.feeBillingNotes ?? ''}
                          onChange={(e) => setField('feeBillingNotes', e.target.value)}
                          placeholder="Agreed annual tax fee, billing schedule, or special disbursement arrangements..."
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* Sub-Tab 4: Compliance & Portals */}
                {detailsSubTab === 'compliance' && (
                  <section className="space-y-3">
                    <div className="pb-2 border-b border-slate-200">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Compliance &amp; Statutory Portals
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        LHDN MyTax agent appointment and e-Invoice implementation phase.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      <div>
                        <label className={labelCls}>MyTax Appointment</label>
                        <select
                          disabled={isReadOnly}
                          value={form.myTaxAppointment}
                          onChange={(e) => setField('myTaxAppointment', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select Status</option>
                          {myTaxOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>e-Invoice Status</label>
                        <select
                          disabled={isReadOnly}
                          value={form.eInvoiceStatus}
                          onChange={(e) => setField('eInvoiceStatus', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select Phase</option>
                          {eInvoiceOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>e-Invoice Implementation Date</label>
                        <input
                          type="date"
                          disabled={isReadOnly}
                          value={form.eInvoiceImplDate ?? ''}
                          onChange={(e) => setField('eInvoiceImplDate', e.target.value)}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* Sub-Tab 5: Business / Individual Details */}
                {detailsSubTab === 'business-individual' && (
                  <section className="space-y-4">
                    <div className="pb-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900">
                          Business &amp; Individual Profile Details
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          NRIC/Passport, spouse &amp; employer info for individuals, and sole prop / trade business registration.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span>Need multiple records? Use top tabs:</span>
                        <button
                          type="button"
                          onClick={() => setTab('business-history')}
                          className="text-teal-700 font-medium hover:underline"
                        >
                          Business History
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => setTab('related-persons')}
                          className="text-teal-700 font-medium hover:underline"
                        >
                          Related Persons
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      <div>
                        <label className={labelCls}>IC / Passport No. (Person No.)</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.personNo}
                          onChange={(e) => setField('personNo', e.target.value)}
                          placeholder="e.g. 820415-14-5123"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Relationship</label>
                        <input
                          type="text"
                          maxLength={80}
                          disabled={isReadOnly}
                          value={form.relationship}
                          onChange={(e) => setField('relationship', e.target.value)}
                          placeholder="e.g. Director / Shareholder / Spouse"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Marital Status</label>
                        <select
                          disabled={isReadOnly}
                          value={form.maritalStatus ?? ''}
                          onChange={(e) => setField('maritalStatus', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select Marital Status</option>
                          <option value="Single">Single</option>
                          <option value="Married — Separate Assessment">Married — Separate Assessment</option>
                          <option value="Married — Joint Assessment">Married — Joint Assessment</option>
                          <option value="Divorced / Widowed">Divorced / Widowed</option>
                          <option value="Not Applicable">Not Applicable</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Spouse Name</label>
                        <input
                          type="text"
                          maxLength={160}
                          disabled={isReadOnly}
                          value={form.spouseName ?? ''}
                          onChange={(e) => setField('spouseName', e.target.value)}
                          placeholder="Full name of spouse"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Spouse TIN</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.spouseTin ?? ''}
                          onChange={(e) => setField('spouseTin', e.target.value)}
                          placeholder="e.g. IG 12345678010"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Employer Details</label>
                        <input
                          type="text"
                          maxLength={250}
                          disabled={isReadOnly}
                          value={form.employerDetails ?? ''}
                          onChange={(e) => setField('employerDetails', e.target.value)}
                          placeholder="Employer Name / E-No."
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      <div>
                        <label className={labelCls}>Business Name</label>
                        <input
                          type="text"
                          maxLength={200}
                          disabled={isReadOnly}
                          value={form.businessName}
                          onChange={(e) => setField('businessName', e.target.value)}
                          placeholder="Trade / Enterprise Name"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Business Type</label>
                        <input
                          type="text"
                          maxLength={80}
                          disabled={isReadOnly}
                          value={form.businessType}
                          onChange={(e) => setField('businessType', e.target.value)}
                          placeholder="e.g. Sdn Bhd / Sole Prop / Partnership / LLP"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Business SSM No.</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.businessSsmNo}
                          onChange={(e) => setField('businessSsmNo', e.target.value)}
                          placeholder="SSM Registration No."
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Business E Number</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.businessENumber}
                          onChange={(e) => setField('businessENumber', e.target.value)}
                          placeholder="Business Employer E No."
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Business Start Date</label>
                        <input
                          type="date"
                          disabled={isReadOnly}
                          value={form.businessStartDate}
                          onChange={(e) => setField('businessStartDate', e.target.value)}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Business Status</label>
                        <select
                          disabled={isReadOnly}
                          value={form.businessStatus}
                          onChange={(e) => setField('businessStatus', e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select Business Status</option>
                          {businessStatusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </section>
                )}

                {/* Sub-Tab 6: Contact & Other Info */}
                {detailsSubTab === 'contact-other' && (
                  <section className="space-y-3">
                    <div className="pb-2 border-b border-slate-200">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Contact Details, Addresses &amp; Special Remarks
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Primary contact person, phone/WhatsApp, email, registered/correspondence addresses, and permanent remarks.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      <div>
                        <label className={labelCls}>Contact Person</label>
                        <input
                          type="text"
                          maxLength={120}
                          disabled={isReadOnly}
                          value={form.contactPerson ?? ''}
                          onChange={(e) => setField('contactPerson', e.target.value)}
                          placeholder="e.g. Ms. Lim Mei Ling (Finance Manager)"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Phone / WhatsApp</label>
                        <input
                          type="text"
                          maxLength={60}
                          disabled={isReadOnly}
                          value={form.phone}
                          onChange={(e) => setField('phone', e.target.value)}
                          placeholder="+60 12-XXX XXXX / +60 3-XXXX XXXX"
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Email</label>
                        <input
                          type="email"
                          maxLength={160}
                          disabled={isReadOnly}
                          value={form.email}
                          onChange={(e) => setField('email', e.target.value)}
                          placeholder="finance@client.com.my"
                          className={inputCls}
                        />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className={labelCls}>Registered Address</label>
                          <textarea
                            rows={3}
                            maxLength={500}
                            disabled={isReadOnly}
                            value={form.registeredAddress}
                            onChange={(e) => setField('registeredAddress', e.target.value)}
                            placeholder="Registered office address (per SSM)"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Correspondence Address</label>
                          <textarea
                            rows={3}
                            maxLength={500}
                            disabled={isReadOnly}
                            value={form.correspondenceAddress ?? ''}
                            onChange={(e) => setField('correspondenceAddress', e.target.value)}
                            placeholder="Mailing / business operating address (if different)"
                            className={inputCls}
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className={labelCls}>Special Remarks</label>
                        <textarea
                          rows={3}
                          maxLength={2000}
                          disabled={isReadOnly}
                          value={form.specialRemarks}
                          onChange={(e) => setField('specialRemarks', e.target.value)}
                          placeholder="Tax incentives, pioneer status, RA claims, LHDN audit notes, standing instructions..."
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </section>
                )}

                {/* Quick Sub-Tab Stepper Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  {(() => {
                    const idx = DETAILS_SUB_TABS.findIndex((s) => s.id === detailsSubTab);
                    const prev = idx > 0 ? DETAILS_SUB_TABS[idx - 1] : null;
                    const next = idx < DETAILS_SUB_TABS.length - 1 ? DETAILS_SUB_TABS[idx + 1] : null;
                    return (
                      <>
                        <div>
                          {prev && (
                            <button
                              type="button"
                              onClick={() => setDetailsSubTab(prev.id)}
                              className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                            >
                              ← {prev.label}
                            </button>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          Section {idx + 1} of {DETAILS_SUB_TABS.length}
                        </span>
                        <div>
                          {next && (
                            <button
                              type="button"
                              onClick={() => setDetailsSubTab(next.id)}
                              className="px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:text-teal-900 hover:bg-teal-50 rounded border border-teal-200 transition-colors"
                            >
                              {next.label} →
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* TAB 2: Business History */}
            {tab === 'business-history' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900">Business History</h3>
                    <p className="text-[11px] text-slate-500">
                      Track historical and concurrent sole proprietorships or businesses linked to
                      this client.
                    </p>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={addBusinessHistory}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Business Row
                    </button>
                  )}
                </div>

                {form.businessHistory.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                    No business history entries recorded.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-2.5 py-2 text-left font-semibold">Business Name</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Type</th>
                          <th className="px-2.5 py-2 text-left font-semibold">SSM No.</th>
                          <th className="px-2.5 py-2 text-left font-semibold">E Number</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Start Date</th>
                          <th className="px-2.5 py-2 text-left font-semibold">End Date</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Status</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Remarks</th>
                          {!isReadOnly && <th className="px-2 py-2 w-10" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {form.businessHistory.map((item, idx) => (
                          <tr key={item.id}>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.businessName}
                                onChange={(e) => {
                                  const next = [...form.businessHistory];
                                  next[idx] = { ...item, businessName: e.target.value };
                                  setField('businessHistory', next);
                                }}
                                className={inputCls}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.businessType}
                                onChange={(e) => {
                                  const next = [...form.businessHistory];
                                  next[idx] = { ...item, businessType: e.target.value };
                                  setField('businessHistory', next);
                                }}
                                className={inputCls}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.ssmNo}
                                onChange={(e) => {
                                  const next = [...form.businessHistory];
                                  next[idx] = { ...item, ssmNo: e.target.value };
                                  setField('businessHistory', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.eNumber}
                                onChange={(e) => {
                                  const next = [...form.businessHistory];
                                  next[idx] = { ...item, eNumber: e.target.value };
                                  setField('businessHistory', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={item.startDate}
                                onChange={(e) => {
                                  const next = [...form.businessHistory];
                                  next[idx] = { ...item, startDate: e.target.value };
                                  setField('businessHistory', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={item.endDate}
                                onChange={(e) => {
                                  const next = [...form.businessHistory];
                                  next[idx] = { ...item, endDate: e.target.value };
                                  setField('businessHistory', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <select
                                disabled={isReadOnly}
                                value={item.status}
                                onChange={(e) => {
                                  const next = [...form.businessHistory];
                                  next[idx] = { ...item, status: e.target.value };
                                  setField('businessHistory', next);
                                }}
                                className={inputCls}
                              >
                                <option value="Operating">Operating</option>
                                <option value="Dormant">Dormant</option>
                                <option value="Ceased">Ceased</option>
                              </select>
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.remarks}
                                onChange={(e) => {
                                  const next = [...form.businessHistory];
                                  next[idx] = { ...item, remarks: e.target.value };
                                  setField('businessHistory', next);
                                }}
                                className={inputCls}
                              />
                            </td>
                            {!isReadOnly && (
                              <td className="p-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setField(
                                      'businessHistory',
                                      form.businessHistory.filter((_, i) => i !== idx)
                                    )
                                  }
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Related Persons */}
            {tab === 'related-persons' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900">Related Persons</h3>
                    <p className="text-[11px] text-slate-500">
                      Directors, major shareholders, spouses, or key finance contacts.
                    </p>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={addRelatedPerson}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Related Person
                    </button>
                  )}
                </div>

                {form.relatedPersons.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                    No related persons linked yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-2.5 py-2 text-left font-semibold">Full Name</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Person No. (IC)</th>
                          <th className="px-2.5 py-2 text-left font-semibold">TIN</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Relationship</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Role</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Phone</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Email</th>
                          {!isReadOnly && <th className="px-2 py-2 w-10" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {form.relatedPersons.map((item, idx) => (
                          <tr key={item.id}>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.personName}
                                onChange={(e) => {
                                  const next = [...form.relatedPersons];
                                  next[idx] = { ...item, personName: e.target.value };
                                  setField('relatedPersons', next);
                                }}
                                className={inputCls}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.personNo}
                                onChange={(e) => {
                                  const next = [...form.relatedPersons];
                                  next[idx] = { ...item, personNo: e.target.value };
                                  setField('relatedPersons', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.tin}
                                onChange={(e) => {
                                  const next = [...form.relatedPersons];
                                  next[idx] = { ...item, tin: e.target.value };
                                  setField('relatedPersons', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.relationship}
                                onChange={(e) => {
                                  const next = [...form.relatedPersons];
                                  next[idx] = { ...item, relationship: e.target.value };
                                  setField('relatedPersons', next);
                                }}
                                className={inputCls}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.role}
                                onChange={(e) => {
                                  const next = [...form.relatedPersons];
                                  next[idx] = { ...item, role: e.target.value };
                                  setField('relatedPersons', next);
                                }}
                                className={inputCls}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.phone}
                                onChange={(e) => {
                                  const next = [...form.relatedPersons];
                                  next[idx] = { ...item, phone: e.target.value };
                                  setField('relatedPersons', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.email}
                                onChange={(e) => {
                                  const next = [...form.relatedPersons];
                                  next[idx] = { ...item, email: e.target.value };
                                  setField('relatedPersons', next);
                                }}
                                className={inputCls}
                              />
                            </td>
                            {!isReadOnly && (
                              <td className="p-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setField(
                                      'relatedPersons',
                                      form.relatedPersons.filter((_, i) => i !== idx)
                                    )
                                  }
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Partnership Partners */}
            {tab === 'partnership-partners' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900">Partnership Partners</h3>
                    <p className="text-[11px] text-slate-500">
                      Form P / LLP partner profit-sharing ratios, TINs, and admission/exit dates.
                    </p>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={addPartner}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Partner
                    </button>
                  )}
                </div>

                {form.partnershipPartners.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                    No partnership partners recorded.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-2.5 py-2 text-left font-semibold">Partner Name</th>
                          <th className="px-2.5 py-2 text-left font-semibold">IC / Company No.</th>
                          <th className="px-2.5 py-2 text-left font-semibold">TIN</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Profit Share (%)</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Join Date</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Exit Date</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Status</th>
                          {!isReadOnly && <th className="px-2 py-2 w-10" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {form.partnershipPartners.map((item, idx) => (
                          <tr key={item.id}>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.partnerName}
                                onChange={(e) => {
                                  const next = [...form.partnershipPartners];
                                  next[idx] = { ...item, partnerName: e.target.value };
                                  setField('partnershipPartners', next);
                                }}
                                className={inputCls}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.icOrCompanyNo}
                                onChange={(e) => {
                                  const next = [...form.partnershipPartners];
                                  next[idx] = { ...item, icOrCompanyNo: e.target.value };
                                  setField('partnershipPartners', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.tin}
                                onChange={(e) => {
                                  const next = [...form.partnershipPartners];
                                  next[idx] = { ...item, tin: e.target.value };
                                  setField('partnershipPartners', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.profitSharePct}
                                onChange={(e) => {
                                  const next = [...form.partnershipPartners];
                                  next[idx] = { ...item, profitSharePct: e.target.value };
                                  setField('partnershipPartners', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={item.joinDate}
                                onChange={(e) => {
                                  const next = [...form.partnershipPartners];
                                  next[idx] = { ...item, joinDate: e.target.value };
                                  setField('partnershipPartners', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={item.exitDate}
                                onChange={(e) => {
                                  const next = [...form.partnershipPartners];
                                  next[idx] = { ...item, exitDate: e.target.value };
                                  setField('partnershipPartners', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <select
                                disabled={isReadOnly}
                                value={item.status}
                                onChange={(e) => {
                                  const next = [...form.partnershipPartners];
                                  next[idx] = { ...item, status: e.target.value };
                                  setField('partnershipPartners', next);
                                }}
                                className={inputCls}
                              >
                                <option value="Active">Active</option>
                                <option value="Retired">Retired</option>
                              </select>
                            </td>
                            {!isReadOnly && (
                              <td className="p-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setField(
                                      'partnershipPartners',
                                      form.partnershipPartners.filter((_, i) => i !== idx)
                                    )
                                  }
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: YA Monitoring (Consolidated Multi-Pillar Compliance Schedule) */}
            {tab === 'ya-monitoring' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900">
                      Multi-Year Compliance Schedule (Form C · CP204 · Form E)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Auto-linked by Client ID across Corporate Jobs, CP204 Monitoring, and Form E,
                      with manual historical rows for prior tax agent transfer years.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrintComplianceHistory}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      Print History
                    </button>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={addHistoricalYaRow}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Historical YA
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Editor Panel for Active Manual / Prior Agent Row */}
                {!isReadOnly &&
                  editingManualYaId &&
                  (() => {
                    const editingItem = form.yaMonitoring.find((m) => m.id === editingManualYaId);
                    if (!editingItem) return null;
                    const linkedYaSet = new Set(
                      consolidatedYaRows.filter((r) => r.hasLinkedRecords).map((r) => r.ya)
                    );
                    const editingNormYa = normalizeYaKey(editingItem.ya);
                    const overlapsLinked = Boolean(editingNormYa && linkedYaSet.has(editingNormYa));

                    return (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              <History className="w-3 h-3" /> Manual / Prior Agent Entry
                            </span>
                            <span className="text-xs font-semibold text-slate-800">
                              {editingItem.ya ? `Editing YA ${editingItem.ya}` : 'New Historical YA'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingManualYaId(null)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                            >
                              <Check className="w-3.5 h-3.5" /> Done
                            </button>
                            <button
                              type="button"
                              onClick={() => removeManualYaItem(editingItem.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </div>

                        {overlapsLinked && (
                          <div className="px-2.5 py-1.5 rounded bg-sky-50 border border-sky-200 text-[11px] text-sky-800">
                            YA {editingNormYa} already has live linked records — live figures take
                            precedence while your prior agent remarks are merged into the row.
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div>
                            <label className={labelCls}>YA *</label>
                            <input
                              type="text"
                              maxLength={10}
                              value={editingItem.ya}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, { ya: e.target.value })
                              }
                              placeholder="e.g. 2023"
                              className={`${inputCls} font-mono`}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>Form C Due Date</label>
                            <input
                              type="date"
                              value={editingItem.filingDueDate}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, {
                                  filingDueDate: e.target.value,
                                })
                              }
                              className={`${inputCls} font-mono`}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>Form C Submitted Date</label>
                            <input
                              type="date"
                              value={editingItem.submissionDate}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, {
                                  submissionDate: e.target.value,
                                })
                              }
                              className={`${inputCls} font-mono`}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>Form C Status</label>
                            <select
                              value={editingItem.yaStatus}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, { yaStatus: e.target.value })
                              }
                              className={inputCls}
                            >
                              {buildDynamicSelectOptions(
                                getSettingsByGroup('YA_STATUS'),
                                ['Filed', 'Submitted', 'Completed', 'In Progress', 'Pending Docs', 'Exempt / Not Applicable'],
                                editingItem.yaStatus
                              ).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-medium text-slate-600">
                                CP204 Estimate (RM)
                              </label>
                              <label className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(editingItem.cp204Exempt)}
                                  onChange={(e) =>
                                    updateManualYaItem(editingItem.id, {
                                      cp204Exempt: e.target.checked,
                                      cp204Estimate: e.target.checked ? '' : editingItem.cp204Estimate,
                                    })
                                  }
                                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                                />
                                SME Exempt
                              </label>
                            </div>
                            <input
                              type="text"
                              disabled={Boolean(editingItem.cp204Exempt)}
                              value={editingItem.cp204Exempt ? 'SME Exempt' : editingItem.cp204Estimate ?? ''}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, {
                                  cp204Estimate: e.target.value,
                                })
                              }
                              placeholder="0.00"
                              className={`${inputCls} font-mono text-right`}
                            />
                          </div>

                          <div>
                            <label className={labelCls}>Total Tax (RM)</label>
                            <input
                              type="text"
                              value={editingItem.totalTax ?? ''}
                              onChange={(e) => {
                                const nextTotalStr = e.target.value;
                                const t = Number(nextTotalStr.replace(/[^0-9.-]/g, '')) || 0;
                                const c = Number((editingItem.cp204Payment ?? '').replace(/[^0-9.-]/g, '')) || 0;
                                const p = Number((editingItem.underEstimatePenalty ?? '').replace(/[^0-9.-]/g, '')) || 0;
                                updateManualYaItem(editingItem.id, {
                                  totalTax: nextTotalStr,
                                  taxPayable: String(Number((t - c + p).toFixed(2))),
                                });
                              }}
                              placeholder="0.00"
                              className={`${inputCls} font-mono text-right`}
                            />
                          </div>

                          <div>
                            <label className={labelCls}>Less: CP204 Payment (RM)</label>
                            <input
                              type="text"
                              value={editingItem.cp204Payment ?? ''}
                              onChange={(e) => {
                                const nextCpStr = e.target.value;
                                const t = Number((editingItem.totalTax ?? '').replace(/[^0-9.-]/g, '')) || 0;
                                const c = Number(nextCpStr.replace(/[^0-9.-]/g, '')) || 0;
                                const p = Number((editingItem.underEstimatePenalty ?? '').replace(/[^0-9.-]/g, '')) || 0;
                                updateManualYaItem(editingItem.id, {
                                  cp204Payment: nextCpStr,
                                  taxPayable: String(Number((t - c + p).toFixed(2))),
                                });
                              }}
                              placeholder="0.00"
                              className={`${inputCls} font-mono text-right`}
                            />
                          </div>

                          <div>
                            <label className={labelCls}>Add: Under Estimate Penalty (RM)</label>
                            <input
                              type="text"
                              value={editingItem.underEstimatePenalty ?? ''}
                              onChange={(e) => {
                                const nextPenStr = e.target.value;
                                const t = Number((editingItem.totalTax ?? '').replace(/[^0-9.-]/g, '')) || 0;
                                const c = Number((editingItem.cp204Payment ?? '').replace(/[^0-9.-]/g, '')) || 0;
                                const p = Number(nextPenStr.replace(/[^0-9.-]/g, '')) || 0;
                                updateManualYaItem(editingItem.id, {
                                  underEstimatePenalty: nextPenStr,
                                  taxPayable: String(Number((t - c + p).toFixed(2))),
                                });
                              }}
                              placeholder="0.00"
                              className={`${inputCls} font-mono text-right`}
                            />
                          </div>

                          <div>
                            <label className={labelCls}>Balance Tax Payable (RM)</label>
                            <input
                              type="text"
                              value={editingItem.taxPayable}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, { taxPayable: e.target.value })
                              }
                              placeholder="0.00"
                              className={`${inputCls} font-mono text-right font-semibold`}
                            />
                          </div>

                          <div>
                            <label className={labelCls}>Form E Status</label>
                            <select
                              value={editingItem.formEStatus ?? ''}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, { formEStatus: e.target.value })
                              }
                              className={inputCls}
                            >
                              <option value="">— None / N/A —</option>
                              <option value="Submitted">Submitted</option>
                              <option value="Pending">Pending</option>
                              <option value="Not Applicable">Not Applicable</option>
                            </select>
                          </div>

                          <div>
                            <label className={labelCls}>MITRS Status (Optional)</label>
                            <select
                              value={editingItem.mitrsStatus ?? ''}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, { mitrsStatus: e.target.value })
                              }
                              className={inputCls}
                            >
                              <option value="">— None —</option>
                              <option value="Submitted">Submitted</option>
                              <option value="Self-Submit">Self-Submit</option>
                              <option value="Pending">Pending</option>
                              <option value="Not Applicable">Not Applicable</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2 lg:col-span-4">
                            <label className={labelCls}>
                              Remarks / Prior Tax Agent Handover Notes
                            </label>
                            <input
                              type="text"
                              maxLength={400}
                              value={editingItem.remarks}
                              onChange={(e) =>
                                updateManualYaItem(editingItem.id, { remarks: e.target.value })
                              }
                              placeholder="e.g. Filed by previous tax agent ABC Tax Services; CP204 revised in 9th month"
                              className={inputCls}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                {consolidatedYaRows.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                    No linked Form C, CP204, Form E, or manual historical YA records found for this
                    client yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                            YA &amp; Sequence
                          </th>
                          <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                            Form C &amp; MITRS
                          </th>
                          <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            CP204 / CP204A Est.
                          </th>
                          <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            Balance Tax &amp; s.107C
                          </th>
                          <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                            Form E (Employer)
                          </th>
                          <th className="px-3 py-2 text-left font-semibold">Remarks</th>
                          {!isReadOnly && (
                            <th className="px-2.5 py-2 text-right font-semibold w-16">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {consolidatedYaRows.map((row) => {
                          const isEditingThis =
                            Boolean(row.manualItem) && editingManualYaId === row.manualItem?.id;
                          return (
                            <tr
                              key={row.rowKey}
                              className={`align-top transition-colors ${
                                isEditingThis ? 'bg-amber-50/60' : 'hover:bg-slate-50/70'
                              }`}
                            >
                              {/* 1. YA & Sequence + Source Badge */}
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-slate-900">
                                    {row.ya ? `YA ${row.ya}` : 'New YA'}
                                  </span>
                                  {row.yaSequence && (
                                    <span
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${getYaSequencePillClasses(
                                        row.yaSequence
                                      )}`}
                                    >
                                      {row.yaSequence}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1">
                                  {row.source === 'Linked' ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 leading-none">
                                      <Link2 className="w-2.5 h-2.5" /> Linked
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 leading-none">
                                      <History className="w-2.5 h-2.5" /> Manual / Prior Agent
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. Form C & MITRS */}
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] text-slate-500">Due:</span>
                                    <span
                                      className={`font-mono tabular-nums text-[11px] font-medium ${
                                        row.overdueDays > 0 ? 'text-rose-700 font-semibold' : 'text-slate-800'
                                      }`}
                                    >
                                      {row.finalDeadline ? formatDateDDMMYYYY(row.finalDeadline) : '—'}
                                    </span>
                                    {row.deadlineStage && row.finalDeadline && (
                                      <span
                                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${getStagePillClasses(
                                          row.deadlineStage
                                        )}`}
                                      >
                                        {row.deadlineStage}
                                      </span>
                                    )}
                                    {row.overdueDays > 0 && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold leading-none">
                                        {formatOverdueLabel(row.overdueDays)}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-slate-500">Form C Sub:</span>
                                    <span className="font-mono tabular-nums text-[11px] text-slate-700">
                                      {row.formCSubmittedDate
                                        ? formatDateDDMMYYYY(row.formCSubmittedDate)
                                        : '—'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    {row.jobStatus && (
                                      <StatusPill group="JOB_STATUS" value={row.jobStatus} />
                                    )}
                                    {row.mitrsStatus && (
                                      <span
                                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${getSubmissionStatusPillClasses(
                                          row.mitrsStatus
                                        )}`}
                                      >
                                        MITRS: {row.mitrsStatus}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* 3. CP204 / CP204A Estimate */}
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                {row.cp204Mode === 'amount' && row.cp204Estimate !== null ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                                      {formatCurrencyRM(row.cp204Estimate)}
                                    </span>
                                    {row.cp204Label && (
                                      <span className="text-[10px] text-slate-500">
                                        {row.cp204Label}
                                      </span>
                                    )}
                                  </div>
                                ) : row.cp204Mode === 'sme-exempt' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 leading-none">
                                    {row.cp204Label || 'SME Exempt'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 leading-none">
                                    N/A
                                  </span>
                                )}
                              </td>

                              {/* 4. Balance Tax & Section 107C Variance Check */}
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                {row.finalTaxPayable !== null ||
                                (row.totalTax !== null && row.totalTax > 0) ||
                                (row.cp204Payment !== null && row.cp204Payment > 0) ||
                                (row.underEstimatePenalty !== null &&
                                  row.underEstimatePenalty > 0) ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                                      {row.finalTaxPayable !== null
                                        ? formatCurrencyRM(row.finalTaxPayable)
                                        : '—'}
                                    </span>
                                    {row.totalTax !== null && row.totalTax > 0 && (
                                      <span className="font-mono tabular-nums text-[10px] text-slate-500">
                                        Total Tax: {formatCurrencyRM(row.totalTax)}
                                      </span>
                                    )}
                                    {row.cp204Payment !== null && row.cp204Payment > 0 && (
                                      <span className="font-mono tabular-nums text-[10px] text-teal-700">
                                        Less CP204: {formatCurrencyRM(row.cp204Payment)}
                                      </span>
                                    )}
                                    {row.underEstimatePenalty !== null &&
                                      row.underEstimatePenalty > 0 && (
                                        <span className="font-mono tabular-nums text-[10px] font-medium text-amber-700">
                                          + Penalty: {formatCurrencyRM(row.underEstimatePenalty)}
                                        </span>
                                      )}
                                    {row.hasSection107CVariance && (
                                      <span
                                        title={`Section 107C(10) Underestimation Risk: CP204 Estimate ${formatCurrencyRM(
                                          row.cp204Estimate ?? 0
                                        )} vs Total Tax ${formatCurrencyRM(
                                          row.totalTax ?? 0
                                        )} (${row.variancePct ?? '>30'}% variance)`}
                                        className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 leading-none"
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                        &gt;30% Var
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              {/* 5. Form E (Employer Return) */}
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {row.hasFormE ? (
                                  <div className="flex flex-col items-start gap-1">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none ${getSubmissionStatusPillClasses(
                                        row.formEStatus
                                      )}`}
                                    >
                                      {row.formEStatus === 'Submitted' && row.formESubmissionDate
                                        ? `Submitted (${
                                            isIsoDateString(row.formESubmissionDate)
                                              ? formatDateDDMMYYYY(row.formESubmissionDate)
                                              : row.formESubmissionDate
                                          })`
                                        : row.formEStatus}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* 6. Remarks */}
                              <td className="px-3 py-2.5 text-slate-700 min-w-[170px] max-w-[260px]">
                                <p className="text-[11px] leading-snug break-words">
                                  {row.remarks || <span className="text-slate-400">—</span>}
                                </p>
                              </td>

                              {/* 7. Action (for Manual / Prior Agent rows) */}
                              {!isReadOnly && (
                                <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                                  {row.manualItem ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        title="Edit manual historical YA entry"
                                        onClick={() =>
                                          setEditingManualYaId((curr) =>
                                            curr === row.manualItem?.id ? null : row.manualItem!.id
                                          )
                                        }
                                        className="p-1 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        title="Delete manual historical YA entry"
                                        onClick={() => removeManualYaItem(row.manualItem!.id)}
                                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span
                                      className="text-[10px] text-slate-400"
                                      title="Synced automatically from Jobs & CP204 modules"
                                    >
                                      Auto
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 px-0.5">
                  <span>
                    Section 107C(10) check flags amber <strong className="text-amber-700">&gt;30% Var</strong>{' '}
                    when (Total Tax − CP204 Estimate) / Total Tax exceeds 30%.
                  </span>
                  <span className="font-mono">
                    {consolidatedYaRows.filter((r) => r.source === 'Linked').length} linked ·{' '}
                    {consolidatedYaRows.filter((r) => r.source === 'Manual / Prior Agent').length}{' '}
                    manual
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {isEdit && client?.updatedBy ? `Last updated by ${client.updatedBy}` : 'All changes sync immediately to Cloud Firestore'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md"
              >
                {isReadOnly ? 'Close' : 'Cancel'}
              </button>
              {!isReadOnly && (
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Client'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
