import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { ArrowRight, Building2, Briefcase, AlertTriangle, Receipt } from 'lucide-react';
import { formatCurrencyRM, FYE_MONTHS, NavRoute } from '../../types/tpms';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatusPill } from '../../components/StatusPill';

interface DashboardViewProps {
  onNavigate: (route: NavRoute) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { clients, jobs, notifications, settings } = useData();
  const { staffProfile, isAdmin } = useAuth();

  const todayStr = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const activeClients = clients.filter((c) => c.clientStatus.toLowerCase() === 'active').length;
    const corpClients = clients.filter((c) => c.category === 'Corporate').length;
    const indivClients = clients.filter((c) => c.category === 'Individual').length;

    const openJobs = jobs.filter(
      (j) =>
        j.status !== 'Completed' &&
        j.status !== 'Closed / Resolved' &&
        j.status !== 'Paid (FPX / ByrHASiL)'
    );
    const overdueJobs = openJobs.filter((j) => Boolean(j.dueDate) && j.dueDate! < todayStr);
    const totalFees = jobs.reduce((sum, j) => sum + (j.feeAmount ?? 0), 0);
    const totalBilled = jobs.reduce((sum, j) => sum + (j.billedAmount ?? 0), 0);

    return {
      totalClients: clients.length,
      activeClients,
      corpClients,
      indivClients,
      totalJobs: jobs.length,
      openJobsCount: openJobs.length,
      overdueCount: overdueJobs.length,
      totalFees,
      totalBilled,
    };
  }, [clients, jobs, todayStr]);

  const fyeChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of FYE_MONTHS) counts[m] = 0;
    for (const c of clients) {
      if (c.fye && counts[c.fye] !== undefined) counts[c.fye] += 1;
    }
    return FYE_MONTHS.map((m) => ({ month: `M${m}`, count: counts[m] }));
  }, [clients]);

  const moduleChartData = useMemo(() => {
    const modules = [
      'CP204',
      'Corporate',
      'Individual',
      'Ad Hoc',
      'Form E',
      'Tax Payment Monitor',
      'Correspondence',
    ];
    return modules.map((m) => ({
      name: m === 'Tax Payment Monitor' ? 'Tax Pay' : m === 'Correspondence' ? 'LHDN Corr' : m,
      open: jobs.filter(
        (j) =>
          j.module === m &&
          j.status !== 'Completed' &&
          j.status !== 'Closed / Resolved' &&
          j.status !== 'Paid (FPX / ByrHASiL)'
      ).length,
      completed: jobs.filter(
        (j) =>
          j.module === m &&
          (j.status === 'Completed' ||
            j.status === 'Closed / Resolved' ||
            j.status === 'Paid (FPX / ByrHASiL)')
      ).length,
    }));
  }, [jobs]);

  const upcomingDeadlines = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            j.dueDate &&
            j.status !== 'Completed' &&
            j.status !== 'Closed / Resolved' &&
            j.status !== 'Paid (FPX / ByrHASiL)'
        )
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
        .slice(0, 8),
    [jobs]
  );

  const recentAnnouncements = useMemo(
    () => notifications.filter((n) => n.type === 'announcement').slice(0, 4),
    [notifications]
  );

  return (
    <div className="space-y-5">
      {/* Greeting & Quick Setup Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">
            Practice Overview
          </h2>
          <p className="text-xs text-slate-500">
            Signed in as {staffProfile?.staffName} · Malaysian LHDN Tax Compliance Workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && settings.length === 0 && (
            <button
              type="button"
              onClick={() => onNavigate('staff-settings')}
              className="px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md transition-colors"
            >
              Seed Malaysian Tax Settings →
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('client-master')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
          >
            Open Client Master <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Clients</span>
            <Building2 className="w-4 h-4 text-teal-700" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {stats.activeClients.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {stats.corpClients} Corporate · {stats.indivClients} Individual · {stats.totalClients}{' '}
            Total
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Open Compliance Jobs</span>
            <Briefcase className="w-4 h-4 text-sky-700" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {stats.openJobsCount.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {stats.totalJobs} total engagements tracked across 7 modules
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Overdue Statutory Deadlines</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div
            className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
              stats.overdueCount > 0 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {stats.overdueCount.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Requires immediate PIC / Manager-HOD review
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Practice Billings (YTD)</span>
            <Receipt className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatCurrencyRM(stats.totalBilled)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Agreed Fee Pool: <span className="font-mono">{formatCurrencyRM(stats.totalFees)}</span>
          </div>
        </div>
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-display font-semibold text-xs text-slate-900 mb-3">
            Jobs Workload by Module (Open vs Completed)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moduleChartData} margin={{ top: 5, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                <Bar dataKey="open" name="Open" fill="#0F766E" radius={[3, 3, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill="#94A3B8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-display font-semibold text-xs text-slate-900 mb-3">
            Client Portfolio Distribution by FYE Month (01–12)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fyeChartData} margin={{ top: 5, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '6px' }} />
                <Bar dataKey="count" name="Clients" fill="#1E40AF" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: Upcoming Deadlines + Recent Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display font-semibold text-xs text-slate-900">
              Upcoming &amp; Overdue Compliance Deadlines
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('all-jobs')}
              className="text-[11px] font-medium text-teal-700 hover:underline"
            >
              View All Jobs
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Due Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Module</th>
                  <th className="px-3 py-2 text-left font-semibold">Client</th>
                  <th className="px-3 py-2 text-left font-semibold">PIC</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcomingDeadlines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No open jobs with due dates scheduled.
                    </td>
                  </tr>
                ) : (
                  upcomingDeadlines.map((j) => {
                    const overdue = (j.dueDate || '') < todayStr;
                    return (
                      <tr key={j.id} className="hover:bg-slate-50">
                        <td
                          className={`px-3 py-2 font-mono whitespace-nowrap ${
                            overdue ? 'text-rose-700 font-semibold' : 'text-slate-700'
                          }`}
                        >
                          {j.dueDate}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{j.module}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 truncate max-w-[200px]">
                          {j.clientName}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {j.taxPic || '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <StatusPill group="JOB_STATUS" value={j.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="font-display font-semibold text-xs text-slate-900">
              Latest Practice Announcements
            </h3>
          </div>
          <div className="p-3.5 space-y-3">
            {recentAnnouncements.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No announcements published yet. Admins and Manager-HODs can post via the
                Notification Bell.
              </p>
            ) : (
              recentAnnouncements.map((n) => (
                <div key={n.id} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="text-xs font-semibold text-slate-900">{n.title}</div>
                  <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">{n.message}</p>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {n.authorName} · {n.authorRole}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
