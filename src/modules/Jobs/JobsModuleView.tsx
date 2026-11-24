import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Eye, Trash2, Briefcase } from 'lucide-react';
import { ColumnDef, formatCurrencyRM, FYE_MONTHS, JobModule, TaxJob } from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { JobModal } from './JobModal';

interface JobsModuleViewProps {
  mode: 'ALL' | JobModule;
}

function getColumnsForMode(mode: 'ALL' | JobModule): ColumnDef[] {
  const base: ColumnDef[] = [
    { key: 'jobCode', label: 'Job Code', defaultVisible: true },
    ...(mode === 'ALL' ? [{ key: 'module', label: 'Module', defaultVisible: true }] : []),
    { key: 'clientId', label: 'Client ID', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'groupId', label: 'Group ID', defaultVisible: false, optional: true },
    { key: 'ya', label: 'YA', defaultVisible: true },
    { key: 'fye', label: 'FYE', defaultVisible: true },
    { key: 'taxPic', label: 'TAX PIC', defaultVisible: true },
    { key: 'reviewer', label: 'Reviewer', defaultVisible: false, optional: true },
    { key: 'status', label: 'Status', defaultVisible: true },
    { key: 'priority', label: 'Priority', defaultVisible: true, optional: true },
    { key: 'dueDate', label: 'Due Date', defaultVisible: true },
  ];

  if (mode === 'CP204') {
    return [
      ...base,
      { key: 'cp204Estimate', label: 'Initial CP204', defaultVisible: true, align: 'right' },
      { key: 'cp204Revised6th', label: '6th Mth Rev', defaultVisible: true, align: 'right' },
      { key: 'cp204Revised9th', label: '9th Mth Rev', defaultVisible: true, align: 'right' },
      { key: 'cp204Revised11th', label: '11th Mth Rev', defaultVisible: false, align: 'right' },
      { key: 'cp204InstallmentStart', label: 'Installment Start', defaultVisible: false },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  if (mode === 'Tax Payment Monitor') {
    return [
      ...base,
      { key: 'paymentType', label: 'Payment Type', defaultVisible: true },
      { key: 'installmentNo', label: 'Inst. No.', defaultVisible: true },
      { key: 'amountDue', label: 'Amount Due', defaultVisible: true, align: 'right' },
      { key: 'amountPaid', label: 'Amount Paid', defaultVisible: true, align: 'right' },
      { key: 'paymentDate', label: 'Payment Date', defaultVisible: true },
      { key: 'receiptNo', label: 'Receipt No.', defaultVisible: false },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  if (mode === 'Correspondence') {
    return [
      ...base,
      { key: 'correspondenceType', label: 'Type', defaultVisible: true },
      { key: 'letterRefNo', label: 'LHDN Ref No.', defaultVisible: true },
      { key: 'letterDate', label: 'Letter Date', defaultVisible: true },
      { key: 'responseDueDate', label: 'Response Due', defaultVisible: true },
      { key: 'responseSentDate', label: 'Response Sent', defaultVisible: false },
      { key: 'remarks', label: 'Remarks', defaultVisible: false },
    ];
  }

  return [
    ...base,
    { key: 'formType', label: 'Form Type', defaultVisible: true },
    { key: 'submissionDate', label: 'Submission Date', defaultVisible: true },
    { key: 'eFilingAckNo', label: 'e-Filing Ack No.', defaultVisible: false },
    { key: 'taxPayable', label: 'Tax Payable', defaultVisible: true, align: 'right' },
    { key: 'feeAmount', label: 'Fee (RM)', defaultVisible: false, align: 'right' },
    { key: 'billingStatus', label: 'Billing Status', defaultVisible: false },
    { key: 'remarks', label: 'Remarks', defaultVisible: false },
  ];
}

const MODULE_DESCRIPTIONS: Record<'ALL' | JobModule, string> = {
  ALL: 'Unified register across all Malaysian tax compliance engagements',
  CP204: 'Corporate tax estimate filings (CP204) and 6th / 9th / 11th month revisions (CP204A)',
  Corporate: 'Form C corporate income tax returns, tax computations, and LHDN e-Filing',
  Individual: 'Form B / Form BE / Form P individual and partnership income tax filings',
  'Ad Hoc': 'Tax advisory, RPGT, withholding tax, tax clearance, and special assignments',
  'Form E': 'Annual employer return of remuneration (Form E & EA) statutory register',
  'Tax Payment Monitor': 'CP204 / CP500 installments, balance tax, and ByrHASiL payment tracking',
  Correspondence: 'LHDN desk/field audits, Section 78/81 queries, and Form Q appeals',
};

export const JobsModuleView: React.FC<JobsModuleViewProps> = ({ mode }) => {
  const { isReadOnly, isManagerOrAdmin } = useAuth();
  const { jobs, loading, deleteJob } = useData();

  const columns = useMemo(() => getColumnsForMode(mode), [mode]);
  const colKey = `jobs_${mode.toLowerCase().replace(/\s+/g, '_')}`;
  const { visibleColumns, toggleColumn, resetColumns } = useColumnVisibility(colKey, columns);

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [yaFilter, setYaFilter] = useState('');
  const [fyeFilter, setFyeFilter] = useState('');
  const [picFilter, setPicFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<TaxJob | null>(null);

  const scopedJobs = useMemo(() => {
    if (mode === 'ALL') return jobs;
    return jobs.filter((j) => j.module === mode);
  }, [jobs, mode]);

  const distinctYAs = useMemo(
    () => Array.from(new Set(scopedJobs.map((j) => j.ya).filter(Boolean) as string[])).sort().reverse(),
    [scopedJobs]
  );
  const distinctPics = useMemo(
    () => Array.from(new Set(scopedJobs.map((j) => j.taxPic).filter(Boolean) as string[])).sort(),
    [scopedJobs]
  );
  const distinctStatuses = useMemo(
    () => Array.from(new Set(scopedJobs.map((j) => j.status).filter(Boolean))).sort(),
    [scopedJobs]
  );

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedJobs.filter((j) => {
      if (mode === 'ALL' && moduleFilter && j.module !== moduleFilter) return false;
      if (yaFilter && j.ya !== yaFilter) return false;
      if (fyeFilter && j.fye !== fyeFilter) return false;
      if (picFilter && j.taxPic !== picFilter) return false;
      if (statusFilter && j.status !== statusFilter) return false;
      if (q) {
        const hay = [
          j.jobCode,
          j.clientId,
          j.clientName,
          j.groupId,
          j.taxPic,
          j.formType,
          j.letterRefNo,
          j.receiptNo,
          j.eFilingAckNo,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedJobs, mode, moduleFilter, yaFilter, fyeFilter, picFilter, statusFilter, search]);

  const activeCols = columns.filter((c) => visibleColumns[c.key]);
  const hasActiveFilters = Boolean(
    search || moduleFilter || yaFilter || fyeFilter || picFilter || statusFilter
  );

  const statusBadgeGroup =
    mode === 'CP204'
      ? 'CP204_STATUS'
      : mode === 'Tax Payment Monitor'
      ? 'PAYMENT_STATUS'
      : mode === 'Correspondence'
      ? 'CORRESPONDENCE_STATUS'
      : 'JOB_STATUS';

  const exportRows = () =>
    filteredJobs.map((j) => ({
      jobCode: j.jobCode,
      module: j.module,
      clientId: j.clientId,
      clientName: j.clientName,
      groupId: j.groupId ?? '',
      ya: j.ya ?? '',
      fye: j.fye ?? '',
      taxPic: j.taxPic ?? '',
      reviewer: j.reviewer ?? '',
      status: j.status,
      priority: j.priority ?? '',
      dueDate: j.dueDate ?? '',
      formType: j.formType ?? '',
      submissionDate: j.submissionDate ?? '',
      eFilingAckNo: j.eFilingAckNo ?? '',
      taxPayable: j.taxPayable ?? 0,
      feeAmount: j.feeAmount ?? 0,
      billingStatus: j.billingStatus ?? '',
      cp204Estimate: j.cp204Estimate ?? 0,
      cp204Revised6th: j.cp204Revised6th ?? 0,
      cp204Revised9th: j.cp204Revised9th ?? 0,
      cp204Revised11th: j.cp204Revised11th ?? 0,
      cp204InstallmentStart: j.cp204InstallmentStart ?? '',
      paymentType: j.paymentType ?? '',
      installmentNo: j.installmentNo ?? '',
      amountDue: j.amountDue ?? 0,
      amountPaid: j.amountPaid ?? 0,
      paymentDate: j.paymentDate ?? '',
      receiptNo: j.receiptNo ?? '',
      correspondenceType: j.correspondenceType ?? '',
      letterRefNo: j.letterRefNo ?? '',
      letterDate: j.letterDate ?? '',
      responseDueDate: j.responseDueDate ?? '',
      responseSentDate: j.responseSentDate ?? '',
      remarks: j.remarks ?? '',
    }));

  const title = mode === 'ALL' ? 'All Jobs' : mode;
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{MODULE_DESCRIPTIONS[mode]}</p>
      </div>

      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${title} by Job Code, Client ID, Name, PIC, Ref No...`}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={() => {
          setSearch('');
          setModuleFilter('');
          setYaFilter('');
          setFyeFilter('');
          setPicFilter('');
          setStatusFilter('');
        }}
        columns={columns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        recordCount={filteredJobs.length}
        totalCount={scopedJobs.length}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_${title.replace(/\s+/g, '_')}_${todayStr}.xlsx`,
            title,
            activeCols,
            exportRows()
          )
        }
        onPrint={() =>
          printRegisterHtml(
            title,
            `${filteredJobs.length} compliance jobs`,
            activeCols,
            exportRows(),
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            title,
            `${filteredJobs.length} compliance jobs`,
            activeCols,
            exportRows(),
            true
          )
        }
        filters={
          <>
            {mode === 'ALL' && (
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Modules</option>
                <option value="CP204">CP204</option>
                <option value="Corporate">Corporate</option>
                <option value="Individual">Individual</option>
                <option value="Ad Hoc">Ad Hoc</option>
                <option value="Form E">Form E</option>
                <option value="Tax Payment Monitor">Tax Payment Monitor</option>
                <option value="Correspondence">Correspondence</option>
              </select>
            )}
            <select
              value={yaFilter}
              onChange={(e) => setYaFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-mono"
            >
              <option value="">All YAs</option>
              {distinctYAs.map((y) => (
                <option key={y} value={y}>
                  YA {y}
                </option>
              ))}
            </select>
            <select
              value={fyeFilter}
              onChange={(e) => setFyeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-mono"
            >
              <option value="">All FYE</option>
              {FYE_MONTHS.map((m) => (
                <option key={m} value={m}>
                  FYE {m}
                </option>
              ))}
            </select>
            <select
              value={picFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All TAX PICs</option>
              {distinctPics.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Statuses</option>
              {distinctStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        }
        primaryAction={
          !isReadOnly ? (
            <button
              type="button"
              onClick={() => {
                setEditingJob(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add {mode === 'ALL' ? 'Job' : mode}
            </button>
          ) : undefined
        }
      />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-275px)]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700">
              <tr>
                {activeCols.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 font-semibold whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap no-print">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={activeCols.length + 1} className="px-3 py-2.5">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={activeCols.length + 1} className="px-6 py-12 text-center">
                    <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No {title} records found</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {scopedJobs.length === 0
                        ? `Create your first ${title} record to track LHDN deadlines and billings.`
                        : 'Clear active filters to view all records.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredJobs.map((j) => {
                  const isOverdue =
                    Boolean(j.dueDate) &&
                    j.dueDate! < todayStr &&
                    j.status !== 'Completed' &&
                    j.status !== 'Paid (FPX / ByrHASiL)' &&
                    j.status !== 'Closed / Resolved';

                  return (
                    <tr key={j.id} className="hover:bg-slate-50/90 transition-colors">
                      {activeCols.map((col) => {
                        const key = col.key;
                        if (key === 'jobCode') {
                          return (
                            <td key={key} className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                              {j.jobCode}
                            </td>
                          );
                        }
                        if (key === 'clientName') {
                          return (
                            <td key={key} className="px-3 py-2 font-medium text-slate-900 min-w-[180px]">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingJob(j);
                                  setModalOpen(true);
                                }}
                                className="text-left hover:text-teal-700 hover:underline"
                              >
                                {j.clientName}
                              </button>
                            </td>
                          );
                        }
                        if (key === 'status') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <StatusPill group={statusBadgeGroup} value={j.status} />
                            </td>
                          );
                        }
                        if (key === 'priority') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <StatusPill group="PRIORITY" value={j.priority} />
                            </td>
                          );
                        }
                        if (key === 'billingStatus') {
                          return (
                            <td key={key} className="px-3 py-2 whitespace-nowrap">
                              <StatusPill group="BILLING_STATUS" value={j.billingStatus} />
                            </td>
                          );
                        }
                        if (key === 'dueDate') {
                          return (
                            <td
                              key={key}
                              className={`px-3 py-2 font-mono whitespace-nowrap ${
                                isOverdue ? 'text-rose-700 font-semibold' : 'text-slate-700'
                              }`}
                            >
                              {j.dueDate || '—'}
                              {isOverdue && <span className="ml-1 text-[10px]">(Overdue)</span>}
                            </td>
                          );
                        }
                        if (
                          key === 'cp204Estimate' ||
                          key === 'cp204Revised6th' ||
                          key === 'cp204Revised9th' ||
                          key === 'cp204Revised11th' ||
                          key === 'taxPayable' ||
                          key === 'feeAmount' ||
                          key === 'amountDue' ||
                          key === 'amountPaid'
                        ) {
                          return (
                            <td
                              key={key}
                              className="px-3 py-2 font-mono text-right text-slate-800 whitespace-nowrap"
                            >
                              {formatCurrencyRM(j[key])}
                            </td>
                          );
                        }
                        const rawVal = j[key as keyof TaxJob];
                        const isMono = [
                          'clientId',
                          'groupId',
                          'ya',
                          'fye',
                          'submissionDate',
                          'eFilingAckNo',
                          'cp204InstallmentStart',
                          'installmentNo',
                          'paymentDate',
                          'receiptNo',
                          'letterRefNo',
                          'letterDate',
                          'responseDueDate',
                          'responseSentDate',
                        ].includes(key);
                        return (
                          <td
                            key={key}
                            className={`px-3 py-2 whitespace-nowrap text-slate-700 ${
                              isMono ? 'font-mono' : ''
                            } ${key === 'remarks' ? 'max-w-[220px] truncate' : ''}`}
                          >
                            {rawVal !== undefined && rawVal !== null && rawVal !== ''
                              ? String(rawVal)
                              : '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right whitespace-nowrap no-print">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingJob(j);
                              setModalOpen(true);
                            }}
                            title={isReadOnly ? 'View job' : 'Edit job'}
                            className="p-1.5 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                          >
                            {isReadOnly ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <Pencil className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isManagerOrAdmin && (
                            <button
                              type="button"
                              onClick={() => void deleteJob(j.id)}
                              title="Delete job"
                              className="p-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <JobModal
        open={modalOpen}
        job={editingJob}
        defaultModule={mode === 'ALL' ? 'Corporate' : mode}
        lockModule={mode !== 'ALL'}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};
