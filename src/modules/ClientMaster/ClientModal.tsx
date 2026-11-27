import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, UserX, UserCheck, Lock, Save } from 'lucide-react';
import {
  BusinessHistoryItem,
  CLIENT_STATUS_OPTIONS,
  ClientCategory,
  ClientRecord,
  FYE_MONTHS,
  PartnershipPartnerItem,
  RelatedPersonItem,
  YaMonitoringItem,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { StatusPill } from '../../components/StatusPill';
import { buildDynamicSelectOptions } from '../../lib/settingsDropdown';

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

type ClientFormState = Omit<
  ClientRecord,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>;

function createEmptyClient(defaultCategory: ClientCategory = 'Corporate'): ClientFormState {
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
    firstYa: String(new Date().getFullYear()),
    firstYaStatus: 'In Progress',
    secondYa: String(new Date().getFullYear() + 1),
    secondYaStatus: 'Pending Docs',
    groupId: '',
    companySecretary: '',
    registeredAddress: '',
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
  const { staff, saveClient, getSettingsByGroup } = useData();

  const [tab, setTab] = useState<ModalTab>('details');
  const [form, setForm] = useState<ClientFormState>(() => createEmptyClient(defaultCategory));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('details');
    setError(null);
    if (client) {
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
        firstYa: client.firstYa ?? '',
        firstYaStatus: client.firstYaStatus ?? '',
        secondYa: client.secondYa ?? '',
        secondYaStatus: client.secondYaStatus ?? '',
        groupId: client.groupId ?? '',
        companySecretary: client.companySecretary ?? '',
        registeredAddress: client.registeredAddress ?? '',
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
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveClient(form, client?.id);
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

  const addYaMonitor = () => {
    const row: YaMonitoringItem = {
      id: makeRowId('ya'),
      ya: String(new Date().getFullYear()),
      formType: form.category === 'Individual' ? 'Form B' : 'Form C',
      filingDueDate: '',
      submissionDate: '',
      yaStatus: 'In Progress',
      taxPayable: '0.00',
      remarks: '',
    };
    setField('yaMonitoring', [...form.yaMonitoring, row]);
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
              { id: 'ya-monitoring', label: `YA Monitoring (${form.yaMonitoring.length})` },
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
              <div className="space-y-6">
                {/* Section 1: Core Identity & Tax Registration */}
                <section>
                  <h3 className="text-xs font-semibold text-slate-900 pb-2 mb-3 border-b border-slate-200">
                    1. Core Identity &amp; LHDN Tax Registration
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                      <label className={labelCls}>Company No. (SSM)</label>
                      <input
                        type="text"
                        maxLength={60}
                        disabled={isReadOnly}
                        value={form.companyNo}
                        onChange={(e) => setField('companyNo', e.target.value)}
                        placeholder="e.g. 201901024512 (1333841-K)"
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
                  </div>
                </section>

                {/* Section 2: Compliance Classification, MyTax, e-Invoice & SST */}
                <section>
                  <h3 className="text-xs font-semibold text-slate-900 pb-2 mb-3 border-b border-slate-200">
                    2. Compliance Profile, MyTax, e-Invoice &amp; SST
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    <div>
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
                    <div>
                      <label className={labelCls}>Account</label>
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
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input
                        type="text"
                        maxLength={60}
                        disabled={isReadOnly}
                        value={form.phone}
                        onChange={(e) => setField('phone', e.target.value)}
                        placeholder="+60 3-XXXX XXXX"
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                  </div>
                </section>

                {/* Section 3: Key Dates & Individual / Business Profile */}
                <section>
                  <h3 className="text-xs font-semibold text-slate-900 pb-2 mb-3 border-b border-slate-200">
                    3. Key Dates, Individual Details &amp; Sole Prop / Business Info
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className={labelCls}>Date of Incorporation</label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={form.dateOfIncorporation}
                        onChange={(e) => setField('dateOfIncorporation', e.target.value)}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Date of commencement business</label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={form.dateOfCommencementBusiness}
                        onChange={(e) => setField('dateOfCommencementBusiness', e.target.value)}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Date of engagement</label>
                      <input
                        type="date"
                        disabled={isReadOnly}
                        value={form.dateOfEngagement}
                        onChange={(e) => setField('dateOfEngagement', e.target.value)}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Date of resigned</label>
                      <input
                        type="date"
                        disabled={isReadOnly || !canEditStatus}
                        value={form.dateOfResigned}
                        onChange={(e) => setField('dateOfResigned', e.target.value)}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Person No. (NRIC / Passport)</label>
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

                {/* Section 4: Initial YA Tracking, Address & Special Remarks */}
                <section>
                  <h3 className="text-xs font-semibold text-slate-900 pb-2 mb-3 border-b border-slate-200">
                    4. 1st &amp; 2nd YA Tracking, Registered Address &amp; Remarks
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className={labelCls}>1st YA</label>
                      <input
                        type="text"
                        maxLength={20}
                        disabled={isReadOnly}
                        value={form.firstYa}
                        onChange={(e) => setField('firstYa', e.target.value)}
                        placeholder="e.g. YA 2025"
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
                        placeholder="e.g. YA 2026"
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
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Registered Address</label>
                      <textarea
                        rows={2}
                        maxLength={500}
                        disabled={isReadOnly}
                        value={form.registeredAddress}
                        onChange={(e) => setField('registeredAddress', e.target.value)}
                        placeholder="Registered office / correspondence address"
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Special Remarks</label>
                      <textarea
                        rows={2}
                        maxLength={2000}
                        disabled={isReadOnly}
                        value={form.specialRemarks}
                        onChange={(e) => setField('specialRemarks', e.target.value)}
                        placeholder="Tax incentives, pioneer status, RA claims, LHDN audit notes..."
                        className={inputCls}
                      />
                    </div>
                  </div>
                </section>
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

            {/* TAB 5: YA Monitoring */}
            {tab === 'ya-monitoring' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900">YA Monitoring Schedule</h3>
                    <p className="text-[11px] text-slate-500">
                      Multi-year LHDN return filing history, statutory deadlines, and tax payable
                      summary.
                    </p>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={addYaMonitor}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add YA Row
                    </button>
                  )}
                </div>

                {form.yaMonitoring.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                    No YA monitoring entries added yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="px-2.5 py-2 text-left font-semibold">YA</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Form Type</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Filing Due Date</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Submission Date</th>
                          <th className="px-2.5 py-2 text-left font-semibold">YA Status</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Tax Payable (RM)</th>
                          <th className="px-2.5 py-2 text-left font-semibold">Remarks</th>
                          {!isReadOnly && <th className="px-2 py-2 w-10" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {form.yaMonitoring.map((item, idx) => (
                          <tr key={item.id}>
                            <td className="p-1.5 w-24">
                              <input
                                disabled={isReadOnly}
                                value={item.ya}
                                onChange={(e) => {
                                  const next = [...form.yaMonitoring];
                                  next[idx] = { ...item, ya: e.target.value };
                                  setField('yaMonitoring', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5 w-28">
                              <select
                                disabled={isReadOnly}
                                value={item.formType}
                                onChange={(e) => {
                                  const next = [...form.yaMonitoring];
                                  next[idx] = { ...item, formType: e.target.value };
                                  setField('yaMonitoring', next);
                                }}
                                className={inputCls}
                              >
                                <option value="Form C">Form C</option>
                                <option value="Form B">Form B</option>
                                <option value="Form BE">Form BE</option>
                                <option value="Form E">Form E</option>
                                <option value="Form P">Form P</option>
                                <option value="Form PT">Form PT</option>
                              </select>
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={item.filingDueDate}
                                onChange={(e) => {
                                  const next = [...form.yaMonitoring];
                                  next[idx] = { ...item, filingDueDate: e.target.value };
                                  setField('yaMonitoring', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="date"
                                disabled={isReadOnly}
                                value={item.submissionDate}
                                onChange={(e) => {
                                  const next = [...form.yaMonitoring];
                                  next[idx] = { ...item, submissionDate: e.target.value };
                                  setField('yaMonitoring', next);
                                }}
                                className={`${inputCls} font-mono`}
                              />
                            </td>
                            <td className="p-1.5">
                              <select
                                disabled={isReadOnly}
                                value={item.yaStatus}
                                onChange={(e) => {
                                  const next = [...form.yaMonitoring];
                                  next[idx] = { ...item, yaStatus: e.target.value };
                                  setField('yaMonitoring', next);
                                }}
                                className={inputCls}
                              >
                                {buildDynamicSelectOptions(
                                  getSettingsByGroup('YA_STATUS'),
                                  ['Filed', 'In Progress', 'Pending Docs', 'Exempt / Not Applicable'],
                                  item.yaStatus
                                ).map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.taxPayable}
                                onChange={(e) => {
                                  const next = [...form.yaMonitoring];
                                  next[idx] = { ...item, taxPayable: e.target.value };
                                  setField('yaMonitoring', next);
                                }}
                                className={`${inputCls} font-mono text-right`}
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                disabled={isReadOnly}
                                value={item.remarks}
                                onChange={(e) => {
                                  const next = [...form.yaMonitoring];
                                  next[idx] = { ...item, remarks: e.target.value };
                                  setField('yaMonitoring', next);
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
                                      'yaMonitoring',
                                      form.yaMonitoring.filter((_, i) => i !== idx)
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
