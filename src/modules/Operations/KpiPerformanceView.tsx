import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { ColumnDef, formatCurrencyRM } from '../../types/tpms';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';

const KPI_COLS: ColumnDef[] = [
  { key: 'staffName', label: 'Staff / TAX PIC', defaultVisible: true },
  { key: 'role', label: 'Role', defaultVisible: true },
  { key: 'assignedClients', label: 'Assigned Clients', defaultVisible: true, align: 'right' },
  { key: 'totalJobs', label: 'Total Jobs', defaultVisible: true, align: 'right' },
  { key: 'completedJobs', label: 'Completed', defaultVisible: true, align: 'right' },
  { key: 'overdueJobs', label: 'Overdue', defaultVisible: true, align: 'right' },
  { key: 'completionRate', label: 'Completion %', defaultVisible: true, align: 'right' },
  { key: 'hoursSpent', label: 'Hours Logged', defaultVisible: true, align: 'right' },
  { key: 'totalFees', label: 'Managed Fees (RM)', defaultVisible: true, align: 'right' },
];

export const KpiPerformanceView: React.FC = () => {
  const { staff, clients, jobs } = useData();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const colVis = useColumnVisibility('kpi_performance', KPI_COLS);
  const todayStr = new Date().toISOString().slice(0, 10);

  const kpiRows = useMemo(() => {
    const namesMap = new Map<string, string>();
    for (const s of staff) namesMap.set(s.staffName, s.role);
    for (const c of clients) {
      if (c.taxPic && !namesMap.has(c.taxPic)) namesMap.set(c.taxPic, 'Assigned PIC');
    }
    for (const j of jobs) {
      if (j.taxPic && !namesMap.has(j.taxPic)) namesMap.set(j.taxPic, 'Assigned PIC');
    }

    return Array.from(namesMap.entries())
      .map(([staffName, role]) => {
        const myClients = clients.filter((c) => c.taxPic === staffName);
        const myJobs = jobs.filter((j) => j.taxPic === staffName);
        const completed = myJobs.filter(
          (j) =>
            j.status === 'Completed' ||
            j.status === 'Closed / Resolved' ||
            j.status === 'Paid (FPX / ByrHASiL)'
        );
        const overdue = myJobs.filter(
          (j) => !completed.includes(j) && Boolean(j.dueDate) && j.dueDate! < todayStr
        );
        const completionRate =
          myJobs.length > 0 ? Math.round((completed.length / myJobs.length) * 100) : 0;
        const hoursSpent = myJobs.reduce((s, j) => s + (j.hoursSpent ?? 0), 0);
        const totalFees = myJobs.reduce((s, j) => s + (j.feeAmount ?? 0), 0);

        return {
          staffName,
          role,
          assignedClients: myClients.length,
          totalJobs: myJobs.length,
          completedJobs: completed.length,
          overdueJobs: overdue.length,
          completionRate,
          hoursSpent,
          totalFees,
        };
      })
      .sort((a, b) => b.totalJobs - a.totalJobs);
  }, [staff, clients, jobs, todayStr]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kpiRows.filter((r) => {
      if (roleFilter && r.role !== roleFilter) return false;
      if (q && !r.staffName.toLowerCase().includes(q) && !r.role.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [kpiRows, search, roleFilter]);

  const activeCols = KPI_COLS.filter((c) => colVis.visibleColumns[c.key]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg text-slate-900">
          KPI &amp; Performance Analysis
        </h2>
        <p className="text-xs text-slate-500">
          Staff workload balance, compliance completion rates, overdue monitoring, and fee
          portfolio by TAX PIC
        </p>
      </div>

      {/* Staff Performance Bar Chart */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-display font-semibold text-xs text-slate-900 mb-3">
          Staff Job Completion &amp; Overdue Breakdown
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredRows.slice(0, 12)}
              margin={{ top: 5, right: 12, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="staffName" tick={{ fontSize: 11, fill: '#475569' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
              <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="completedJobs" name="Completed" fill="#15803D" radius={[3, 3, 0, 0]} />
              <Bar dataKey="totalJobs" name="Total Assigned" fill="#0369A1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="overdueJobs" name="Overdue" fill="#B91C1C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search Staff / TAX PIC..."
        hasActiveFilters={Boolean(search || roleFilter)}
        onResetFilters={() => {
          setSearch('');
          setRoleFilter('');
        }}
        columns={KPI_COLS}
        visibleColumns={colVis.visibleColumns}
        onToggleColumn={colVis.toggleColumn}
        onResetColumns={colVis.resetColumns}
        recordCount={filteredRows.length}
        totalCount={kpiRows.length}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_KPI_Performance_${todayStr}.xlsx`,
            'KPI_Performance',
            activeCols,
            filteredRows.map((r) => ({ ...r, completionRate: `${r.completionRate}%` }))
          )
        }
        onPrint={() =>
          printRegisterHtml(
            'KPI & Performance Analysis',
            `Staff compliance metrics as of ${todayStr}`,
            activeCols,
            filteredRows.map((r) => ({ ...r, completionRate: `${r.completionRate}%` })),
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            'KPI & Performance Analysis',
            `Staff compliance metrics as of ${todayStr}`,
            activeCols,
            filteredRows.map((r) => ({ ...r, completionRate: `${r.completionRate}%` })),
            true
          )
        }
        filters={
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Roles</option>
            <option value="Admin">Admin</option>
            <option value="Manager-HOD">Manager-HOD</option>
            <option value="Staff">Staff</option>
            <option value="Report Viewer">Report Viewer</option>
          </select>
        }
      />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-440px)]">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={activeCols.length} className="px-6 py-10 text-center text-slate-500">
                    No staff KPI data available yet.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.staffName} className="hover:bg-slate-50">
                    {colVis.visibleColumns.staffName && (
                      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                        {r.staffName}
                      </td>
                    )}
                    {colVis.visibleColumns.role && (
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.role}</td>
                    )}
                    {colVis.visibleColumns.assignedClients && (
                      <td className="px-3 py-2 font-mono text-right text-slate-800">
                        {r.assignedClients}
                      </td>
                    )}
                    {colVis.visibleColumns.totalJobs && (
                      <td className="px-3 py-2 font-mono text-right text-slate-800">
                        {r.totalJobs}
                      </td>
                    )}
                    {colVis.visibleColumns.completedJobs && (
                      <td className="px-3 py-2 font-mono text-right text-emerald-700 font-medium">
                        {r.completedJobs}
                      </td>
                    )}
                    {colVis.visibleColumns.overdueJobs && (
                      <td
                        className={`px-3 py-2 font-mono text-right font-medium ${
                          r.overdueJobs > 0 ? 'text-rose-700' : 'text-slate-500'
                        }`}
                      >
                        {r.overdueJobs}
                      </td>
                    )}
                    {colVis.visibleColumns.completionRate && (
                      <td className="px-3 py-2 font-mono text-right text-slate-900">
                        {r.completionRate}%
                      </td>
                    )}
                    {colVis.visibleColumns.hoursSpent && (
                      <td className="px-3 py-2 font-mono text-right text-slate-700">
                        {r.hoursSpent.toFixed(1)}
                      </td>
                    )}
                    {colVis.visibleColumns.totalFees && (
                      <td className="px-3 py-2 font-mono text-right text-slate-900">
                        {formatCurrencyRM(r.totalFees)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
