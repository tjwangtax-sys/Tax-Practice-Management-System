import React, { useMemo, useState } from 'react';
import { ColumnDef, formatCurrencyRM, FYE_MONTHS } from '../../types/tpms';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';

type ReportType = 'client-fye' | 'einvoice-readiness' | 'job-summary' | 'tax-payments';

const REPORT_COLS: Record<ReportType, ColumnDef[]> = {
  'client-fye': [
    { key: 'fye', label: 'FYE Month', defaultVisible: true },
    { key: 'totalClients', label: 'Total Clients', defaultVisible: true, align: 'right' },
    { key: 'activeClients', label: 'Active', defaultVisible: true, align: 'right' },
    { key: 'corporate', label: 'Corporate', defaultVisible: true, align: 'right' },
    { key: 'individual', label: 'Individual', defaultVisible: true, align: 'right' },
    { key: 'sstRegistered', label: 'SST Registered', defaultVisible: true, align: 'right' },
    { key: 'myTaxAppointed', label: 'MyTax Appointed', defaultVisible: true, align: 'right' },
  ],
  'einvoice-readiness': [
    { key: 'phase', label: 'e-Invoice Phase', defaultVisible: true },
    { key: 'clientCount', label: 'Clients', defaultVisible: true, align: 'right' },
    { key: 'activeCount', label: 'Active Only', defaultVisible: true, align: 'right' },
    { key: 'smeCount', label: 'SMEs', defaultVisible: true, align: 'right' },
    { key: 'sstCount', label: 'SST Registered', defaultVisible: true, align: 'right' },
  ],
  'job-summary': [
    { key: 'module', label: 'Module', defaultVisible: true },
    { key: 'totalJobs', label: 'Total Jobs', defaultVisible: true, align: 'right' },
    { key: 'openJobs', label: 'Open / WIP', defaultVisible: true, align: 'right' },
    { key: 'completedJobs', label: 'Completed', defaultVisible: true, align: 'right' },
    { key: 'overdueJobs', label: 'Overdue', defaultVisible: true, align: 'right' },
    { key: 'totalFees', label: 'Total Fees (RM)', defaultVisible: true, align: 'right' },
  ],
  'tax-payments': [
    { key: 'clientId', label: 'Client ID', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'paymentType', label: 'Payment Type', defaultVisible: true },
    { key: 'dueDate', label: 'Due Date', defaultVisible: true },
    { key: 'amountDue', label: 'Amount Due (RM)', defaultVisible: true, align: 'right' },
    { key: 'amountPaid', label: 'Amount Paid (RM)', defaultVisible: true, align: 'right' },
    { key: 'balance', label: 'Outstanding (RM)', defaultVisible: true, align: 'right' },
    { key: 'status', label: 'Status', defaultVisible: true },
  ],
};

export const BasicReportsView: React.FC = () => {
  const { clients, jobs } = useData();
  const [reportType, setReportType] = useState<ReportType>('client-fye');
  const [search, setSearch] = useState('');

  const columns = REPORT_COLS[reportType];
  const colVis = useColumnVisibility(`basic_report_${reportType}`, columns);
  const todayStr = new Date().toISOString().slice(0, 10);

  const rawRows = useMemo<Record<string, unknown>[]>(() => {
    if (reportType === 'client-fye') {
      return FYE_MONTHS.map((m) => {
        const subset = clients.filter((c) => c.fye === m);
        return {
          fye: `Month ${m}`,
          totalClients: subset.length,
          activeClients: subset.filter((c) => c.clientStatus.toLowerCase() === 'active').length,
          corporate: subset.filter((c) => c.category === 'Corporate').length,
          individual: subset.filter((c) => c.category === 'Individual').length,
          sstRegistered: subset.filter((c) => c.sstRegistered === 'Yes').length,
          myTaxAppointed: subset.filter((c) => c.myTaxAppointment.toLowerCase() === 'appointed')
            .length,
        };
      });
    }

    if (reportType === 'einvoice-readiness') {
      const grouped = new Map<string, typeof clients>();
      for (const c of clients) {
        const phase = c.eInvoiceStatus || 'Unspecified';
        const list = grouped.get(phase) ?? [];
        list.push(c);
        grouped.set(phase, list);
      }
      return Array.from(grouped.entries()).map(([phase, list]) => ({
        phase,
        clientCount: list.length,
        activeCount: list.filter((c) => c.clientStatus.toLowerCase() === 'active').length,
        smeCount: list.filter((c) => c.smeStatus === 'SME').length,
        sstCount: list.filter((c) => c.sstRegistered === 'Yes').length,
      }));
    }

    if (reportType === 'job-summary') {
      const mods = [
        'CP204',
        'Corporate',
        'Individual',
        'Ad Hoc',
        'Form E',
        'Tax Payment Monitor',
        'Correspondence',
      ];
      return mods.map((m) => {
        const subset = jobs.filter((j) => j.module === m);
        const completed = subset.filter(
          (j) =>
            j.status === 'Completed' ||
            j.status === 'Closed / Resolved' ||
            j.status === 'Paid (FPX / ByrHASiL)'
        );
        const open = subset.filter((j) => !completed.includes(j));
        const overdue = open.filter((j) => Boolean(j.dueDate) && j.dueDate! < todayStr);
        return {
          module: m,
          totalJobs: subset.length,
          openJobs: open.length,
          completedJobs: completed.length,
          overdueJobs: overdue.length,
          totalFees: subset.reduce((s, j) => s + (j.feeAmount ?? 0), 0),
        };
      });
    }

    return jobs
      .filter((j) => j.module === 'Tax Payment Monitor')
      .map((j) => ({
        clientId: j.clientId,
        clientName: j.clientName,
        paymentType: j.paymentType || '—',
        dueDate: j.dueDate || '—',
        amountDue: j.amountDue ?? 0,
        amountPaid: j.amountPaid ?? 0,
        balance: Math.max(0, (j.amountDue ?? 0) - (j.amountPaid ?? 0)),
        status: j.status,
      }));
  }, [reportType, clients, jobs, todayStr]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawRows;
    return rawRows.filter((r) => Object.values(r).join(' ').toLowerCase().includes(q));
  }, [rawRows, search]);

  const activeCols = columns.filter((c) => colVis.visibleColumns[c.key]);
  const reportTitles: Record<ReportType, string> = {
    'client-fye': 'Client Portfolio Summary by FYE',
    'einvoice-readiness': 'MyInvois e-Invoice Readiness Report',
    'job-summary': 'Compliance Job Status Summary',
    'tax-payments': 'Outstanding Tax Payments Report',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Basic Reports</h2>
          <p className="text-xs text-slate-500">
            Standard management registers and compliance summaries ready for Excel &amp; PDF export
          </p>
        </div>

        <div className="inline-flex flex-wrap p-1 bg-slate-200/70 rounded-lg no-print">
          {(
            [
              { id: 'client-fye', label: 'Clients by FYE' },
              { id: 'einvoice-readiness', label: 'e-Invoice Readiness' },
              { id: 'job-summary', label: 'Job Compliance Summary' },
              { id: 'tax-payments', label: 'Tax Payment Balances' },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setReportType(r.id);
                setSearch('');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                reportType === r.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Filter ${reportTitles[reportType]}...`}
        hasActiveFilters={Boolean(search)}
        onResetFilters={() => setSearch('')}
        columns={columns}
        visibleColumns={colVis.visibleColumns}
        onToggleColumn={colVis.toggleColumn}
        onResetColumns={colVis.resetColumns}
        recordCount={filteredRows.length}
        totalCount={rawRows.length}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_Report_${reportType}_${todayStr}.xlsx`,
            reportType,
            activeCols,
            filteredRows
          )
        }
        onPrint={() =>
          printRegisterHtml(
            reportTitles[reportType],
            `Generated on ${todayStr}`,
            activeCols,
            filteredRows,
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            reportTitles[reportType],
            `Generated on ${todayStr}`,
            activeCols,
            filteredRows,
            true
          )
        }
      />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
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
                    No report rows available.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {activeCols.map((c) => {
                      const val = row[c.key];
                      const isCurrency = ['totalFees', 'amountDue', 'amountPaid', 'balance'].includes(
                        c.key
                      );
                      return (
                        <td
                          key={c.key}
                          className={`px-3 py-2 whitespace-nowrap ${
                            c.align === 'right'
                              ? 'text-right font-mono text-slate-800'
                              : 'text-left text-slate-800'
                          }`}
                        >
                          {isCurrency ? formatCurrencyRM(Number(val ?? 0)) : String(val ?? '—')}
                        </td>
                      );
                    })}
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
