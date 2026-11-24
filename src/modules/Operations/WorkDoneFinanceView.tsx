import React, { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { ColumnDef, formatCurrencyRM, TaxJob } from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { JobModal } from '../Jobs/JobModal';

const FINANCE_COLS: ColumnDef[] = [
  { key: 'jobCode', label: 'Job Code', defaultVisible: true },
  { key: 'module', label: 'Module', defaultVisible: true },
  { key: 'clientId', label: 'Client ID', defaultVisible: true },
  { key: 'clientName', label: 'Client Name', defaultVisible: true },
  { key: 'ya', label: 'YA', defaultVisible: true },
  { key: 'taxPic', label: 'TAX PIC', defaultVisible: true },
  { key: 'status', label: 'Job Status', defaultVisible: true },
  { key: 'hoursSpent', label: 'Hours', defaultVisible: true, align: 'right' },
  { key: 'feeAmount', label: 'Agreed Fee', defaultVisible: true, align: 'right' },
  { key: 'billedAmount', label: 'Billed', defaultVisible: true, align: 'right' },
  { key: 'unbilledWip', label: 'Unbilled WIP', defaultVisible: true, align: 'right' },
  { key: 'billingStatus', label: 'Billing Status', defaultVisible: true },
];

export const WorkDoneFinanceView: React.FC = () => {
  const { isReadOnly } = useAuth();
  const { jobs } = useData();
  const colVis = useColumnVisibility('work_done_finance', FINANCE_COLS);

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [billingFilter, setBillingFilter] = useState('');
  const [picFilter, setPicFilter] = useState('');
  const [editingJob, setEditingJob] = useState<TaxJob | null>(null);

  const pics = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.taxPic).filter(Boolean) as string[])).sort(),
    [jobs]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs
      .filter((j) => {
        if (moduleFilter && j.module !== moduleFilter) return false;
        if (billingFilter && (j.billingStatus || 'Unbilled WIP') !== billingFilter) return false;
        if (picFilter && j.taxPic !== picFilter) return false;
        if (q) {
          const hay = [j.jobCode, j.clientId, j.clientName, j.taxPic, j.module]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((j) => ({
        ...j,
        unbilledWip: Math.max(0, (j.feeAmount ?? 0) - (j.billedAmount ?? 0)),
      }));
  }, [jobs, search, moduleFilter, billingFilter, picFilter]);

  const totals = useMemo(() => {
    const fee = rows.reduce((s, r) => s + (r.feeAmount ?? 0), 0);
    const billed = rows.reduce((s, r) => s + (r.billedAmount ?? 0), 0);
    const wip = rows.reduce((s, r) => s + r.unbilledWip, 0);
    const hours = rows.reduce((s, r) => s + (r.hoursSpent ?? 0), 0);
    return { fee, billed, wip, hours, effectiveRate: hours > 0 ? fee / hours : 0 };
  }, [rows]);

  const activeCols = FINANCE_COLS.filter((c) => colVis.visibleColumns[c.key]);

  const exportData = () =>
    rows.map((r) => ({
      jobCode: r.jobCode,
      module: r.module,
      clientId: r.clientId,
      clientName: r.clientName,
      ya: r.ya ?? '',
      taxPic: r.taxPic ?? '',
      status: r.status,
      hoursSpent: r.hoursSpent ?? 0,
      feeAmount: r.feeAmount ?? 0,
      billedAmount: r.billedAmount ?? 0,
      unbilledWip: r.unbilledWip,
      billingStatus: r.billingStatus ?? 'Unbilled WIP',
    }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-slate-900">Work Done &amp; Finance</h2>
        <p className="text-xs text-slate-500">
          Engagement fee realization, unbilled WIP, billable hours, and collection status
        </p>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] text-slate-500">Total Agreed Fees</div>
          <div className="mt-1 font-mono text-base font-bold text-slate-900">
            {formatCurrencyRM(totals.fee)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] text-slate-500">Total Billed</div>
          <div className="mt-1 font-mono text-base font-bold text-emerald-700">
            {formatCurrencyRM(totals.billed)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] text-slate-500">Unbilled WIP</div>
          <div className="mt-1 font-mono text-base font-bold text-amber-700">
            {formatCurrencyRM(totals.wip)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] text-slate-500">Total Hours Logged</div>
          <div className="mt-1 font-mono text-base font-bold text-slate-900">
            {totals.hours.toFixed(1)} hrs
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <div className="text-[11px] text-slate-500">Avg Recovery Rate</div>
          <div className="mt-1 font-mono text-base font-bold text-teal-800">
            {formatCurrencyRM(totals.effectiveRate)}/hr
          </div>
        </div>
      </div>

      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by Job Code, Client ID, Client Name, PIC..."
        hasActiveFilters={Boolean(search || moduleFilter || billingFilter || picFilter)}
        onResetFilters={() => {
          setSearch('');
          setModuleFilter('');
          setBillingFilter('');
          setPicFilter('');
        }}
        columns={FINANCE_COLS}
        visibleColumns={colVis.visibleColumns}
        onToggleColumn={colVis.toggleColumn}
        onResetColumns={colVis.resetColumns}
        recordCount={rows.length}
        totalCount={jobs.length}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_WorkDone_Finance_${new Date().toISOString().slice(0, 10)}.xlsx`,
            'Work_Done_Finance',
            activeCols,
            exportData()
          )
        }
        onPrint={() =>
          printRegisterHtml(
            'Work Done & Finance Register',
            `Total Fees: ${formatCurrencyRM(totals.fee)} | Billed: ${formatCurrencyRM(totals.billed)}`,
            activeCols,
            exportData(),
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            'Work Done & Finance Register',
            `Total Fees: ${formatCurrencyRM(totals.fee)} | Billed: ${formatCurrencyRM(totals.billed)}`,
            activeCols,
            exportData(),
            true
          )
        }
        filters={
          <>
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
            <select
              value={billingFilter}
              onChange={(e) => setBillingFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Billing Statuses</option>
              <option value="Unbilled WIP">Unbilled WIP</option>
              <option value="Ready to Bill">Ready to Bill</option>
              <option value="Invoiced">Invoiced</option>
              <option value="Collected">Collected</option>
            </select>
            <select
              value={picFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All TAX PICs</option>
              {pics.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </>
        }
      />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-340px)]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700">
              <tr>
                {activeCols.map((c) => (
                  <th
                    key={c.key}
                    className={`px-3 py-2 font-semibold whitespace-nowrap ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
                {!isReadOnly && (
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap no-print">
                    Edit
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={activeCols.length + 1} className="px-6 py-10 text-center text-slate-500">
                    No billable jobs match current filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/90">
                    {colVis.visibleColumns.jobCode && (
                      <td className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {r.jobCode}
                      </td>
                    )}
                    {colVis.visibleColumns.module && (
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.module}</td>
                    )}
                    {colVis.visibleColumns.clientId && (
                      <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                        {r.clientId}
                      </td>
                    )}
                    {colVis.visibleColumns.clientName && (
                      <td className="px-3 py-2 font-medium text-slate-900 min-w-[180px]">
                        {r.clientName}
                      </td>
                    )}
                    {colVis.visibleColumns.ya && (
                      <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                        {r.ya || '—'}
                      </td>
                    )}
                    {colVis.visibleColumns.taxPic && (
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {r.taxPic || '—'}
                      </td>
                    )}
                    {colVis.visibleColumns.status && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusPill group="JOB_STATUS" value={r.status} />
                      </td>
                    )}
                    {colVis.visibleColumns.hoursSpent && (
                      <td className="px-3 py-2 font-mono text-right text-slate-700 whitespace-nowrap">
                        {(r.hoursSpent ?? 0).toFixed(2)}
                      </td>
                    )}
                    {colVis.visibleColumns.feeAmount && (
                      <td className="px-3 py-2 font-mono text-right text-slate-900 whitespace-nowrap">
                        {formatCurrencyRM(r.feeAmount)}
                      </td>
                    )}
                    {colVis.visibleColumns.billedAmount && (
                      <td className="px-3 py-2 font-mono text-right text-emerald-700 whitespace-nowrap">
                        {formatCurrencyRM(r.billedAmount)}
                      </td>
                    )}
                    {colVis.visibleColumns.unbilledWip && (
                      <td className="px-3 py-2 font-mono text-right text-amber-700 whitespace-nowrap">
                        {formatCurrencyRM(r.unbilledWip)}
                      </td>
                    )}
                    {colVis.visibleColumns.billingStatus && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusPill group="BILLING_STATUS" value={r.billingStatus || 'Unbilled WIP'} />
                      </td>
                    )}
                    {!isReadOnly && (
                      <td className="px-3 py-2 text-right no-print">
                        <button
                          type="button"
                          onClick={() => setEditingJob(r)}
                          className="p-1.5 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                          title="Update fee/billing"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <JobModal
        open={Boolean(editingJob)}
        job={editingJob}
        defaultModule={editingJob?.module || 'Corporate'}
        onClose={() => setEditingJob(null)}
      />
    </div>
  );
};
