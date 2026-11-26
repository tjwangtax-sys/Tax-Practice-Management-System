import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Users,
  CalendarDays,
  BarChart3,
  ShieldAlert,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Briefcase,
  Printer,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { TaxJob } from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  addCalendarDays,
  extractFyeMonth,
  formatDateDDMMYYYY,
  isIsoDateString,
  latestIsoDate,
} from '../../lib/deadlineUtils';
import {
  ExportColumn,
  exportTableToPdf,
  exportToExcel,
  printTable,
} from '../../lib/exportUtils';

type PeriodPreset =
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'ytd'
  | 'all'
  | 'custom';

type KpiTab = 'executive' | 'staff' | 'trends';

const CLOSED_STATUSES = new Set([
  'completed',
  'submitted',
  'filed',
  'closed',
  'billed',
  'paid',
]);

const CANCELLED_STATUSES = new Set(['cancelled', 'not applicable', 'n/a']);

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getJobCompletionDate(job: TaxJob): string {
  const s = (job.status || '').trim().toLowerCase();
  if (!CLOSED_STATUSES.has(s)) return '';
  const latest = latestIsoDate([
    job.completedDate,
    job.mitrsSubmissionDate,
    job.formCSubmissionDate,
    job.submissionDate,
  ]);
  if (latest) return latest;
  if (job.updatedAt && typeof job.updatedAt.toDate === 'function') {
    return toIsoLocal(job.updatedAt.toDate());
  }
  return '';
}

function getEffectiveDeadline(job: TaxJob): string {
  for (const d of [job.finalApplicableDeadline, job.dueDate, job.internalDeadline]) {
    if (isIsoDateString(d)) return d!.trim();
  }
  return '';
}

function isJobOpen(job: TaxJob): boolean {
  const s = (job.status || '').trim().toLowerCase();
  return !CLOSED_STATUSES.has(s) && !CANCELLED_STATUSES.has(s);
}

interface PeriodBounds {
  start: string | null;
  end: string | null;
  prevStart: string | null;
  prevEnd: string | null;
  label: string;
}

function computePeriodBounds(
  preset: PeriodPreset,
  customStart: string,
  customEnd: string
): PeriodBounds {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0..11

  if (preset === 'this-month') {
    const start = toIsoLocal(new Date(y, m, 1));
    const end = toIsoLocal(new Date(y, m + 1, 0));
    const prevStart = toIsoLocal(new Date(y, m - 1, 1));
    const prevEnd = toIsoLocal(new Date(y, m, 0));
    return { start, end, prevStart, prevEnd, label: `${MONTH_LABELS[m]} ${y}` };
  }

  if (preset === 'last-month') {
    const start = toIsoLocal(new Date(y, m - 1, 1));
    const end = toIsoLocal(new Date(y, m, 0));
    const prevStart = toIsoLocal(new Date(y, m - 2, 1));
    const prevEnd = toIsoLocal(new Date(y, m - 1, 0));
    const d = new Date(y, m - 1, 1);
    return {
      start,
      end,
      prevStart,
      prevEnd,
      label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
    };
  }

  if (preset === 'this-quarter') {
    const qStartM = Math.floor(m / 3) * 3;
    const start = toIsoLocal(new Date(y, qStartM, 1));
    const end = toIsoLocal(new Date(y, qStartM + 3, 0));
    const prevStart = toIsoLocal(new Date(y, qStartM - 3, 1));
    const prevEnd = toIsoLocal(new Date(y, qStartM, 0));
    return { start, end, prevStart, prevEnd, label: `Q${Math.floor(m / 3) + 1} ${y}` };
  }

  if (preset === 'last-quarter') {
    const qStartM = Math.floor(m / 3) * 3 - 3;
    const startDate = new Date(y, qStartM, 1);
    const start = toIsoLocal(startDate);
    const end = toIsoLocal(new Date(y, qStartM + 3, 0));
    const prevStart = toIsoLocal(new Date(y, qStartM - 3, 1));
    const prevEnd = toIsoLocal(new Date(y, qStartM, 0));
    return {
      start,
      end,
      prevStart,
      prevEnd,
      label: `Q${Math.floor(startDate.getMonth() / 3) + 1} ${startDate.getFullYear()}`,
    };
  }

  if (preset === 'ytd') {
    const start = `${y}-01-01`;
    const end = toIsoLocal(now);
    const prevStart = `${y - 1}-01-01`;
    const prevEnd = `${y - 1}-${String(m + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return { start, end, prevStart, prevEnd, label: `YTD ${y}` };
  }

  if (preset === 'custom') {
    const validStart = isIsoDateString(customStart) ? customStart : null;
    const validEnd = isIsoDateString(customEnd) ? customEnd : null;
    let prevStart: string | null = null;
    let prevEnd: string | null = null;
    if (validStart && validEnd && validEnd >= validStart) {
      const ms1 = new Date(`${validStart}T00:00:00Z`).getTime();
      const ms2 = new Date(`${validEnd}T00:00:00Z`).getTime();
      const spanDays = Math.max(1, Math.round((ms2 - ms1) / (1000 * 60 * 60 * 24)) + 1);
      prevEnd = addCalendarDays(validStart, -1);
      prevStart = addCalendarDays(validStart, -spanDays);
    }
    return {
      start: validStart,
      end: validEnd,
      prevStart,
      prevEnd,
      label:
        validStart && validEnd
          ? `${formatDateDDMMYYYY(validStart)} – ${formatDateDDMMYYYY(validEnd)}`
          : 'Custom Range',
    };
  }

  return {
    start: null,
    end: null,
    prevStart: null,
    prevEnd: null,
    label: 'All Available',
  };
}

function inRange(dateStr: string, start: string | null, end: string | null): boolean {
  if (!dateStr) return false;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

const PRESET_OPTIONS: Array<{ id: PeriodPreset; label: string }> = [
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'this-quarter', label: 'This Quarter' },
  { id: 'last-quarter', label: 'Last Quarter' },
  { id: 'ytd', label: 'Year-to-Date' },
  { id: 'all', label: 'All Available' },
  { id: 'custom', label: 'Custom Range' },
];

export const KpiPerformanceView: React.FC = () => {
  const { isManagerOrAdmin, staffProfile } = useAuth();
  const { jobs, staff } = useData();

  const [preset, setPreset] = useState<PeriodPreset>('this-month');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    return toIsoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [customEnd, setCustomEnd] = useState(() => toIsoLocal(new Date()));
  const [activeTab, setActiveTab] = useState<KpiTab>('executive');

  const todayStr = useMemo(() => toIsoLocal(new Date()), []);
  const in30DaysStr = useMemo(() => addCalendarDays(todayStr, 30), [todayStr]);
  const myStaffNameLower = (staffProfile?.staffName || '').trim().toLowerCase();

  const period = useMemo(
    () => computePeriodBounds(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const activeStaffCount = useMemo(
    () => Math.max(1, staff.filter((s) => s.active).length),
    [staff]
  );

  // Executive Summary metrics (always firm-wide aggregate)
  const executiveMetrics = useMemo(() => {
    let completedInPeriod = 0;
    let completedInPrior = 0;
    let activeWorkload = 0;
    let overdueCount = 0;
    let upcoming30Days = 0;

    const moduleCounts = new Map<string, { open: number; completed: number }>();

    for (const j of jobs) {
      const mod = j.module || 'Other';
      if (!moduleCounts.has(mod)) moduleCounts.set(mod, { open: 0, completed: 0 });
      const bucket = moduleCounts.get(mod)!;

      const open = isJobOpen(j);
      const dl = getEffectiveDeadline(j);
      const compDate = getJobCompletionDate(j);

      if (open) {
        activeWorkload += 1;
        bucket.open += 1;
        if (dl && dl < todayStr) overdueCount += 1;
        if (dl && dl >= todayStr && dl <= in30DaysStr) upcoming30Days += 1;
      } else if (compDate) {
        const matchCurr =
          period.start === null && period.end === null
            ? true
            : inRange(compDate, period.start, period.end);
        if (matchCurr) {
          completedInPeriod += 1;
          bucket.completed += 1;
        }
        if (period.prevStart && period.prevEnd && inRange(compDate, period.prevStart, period.prevEnd)) {
          completedInPrior += 1;
        }
      }
    }

    const avgJobsPerStaff = Number((activeWorkload / activeStaffCount).toFixed(1));
    const delta = completedInPeriod - completedInPrior;
    const pctChange =
      completedInPrior > 0 ? Math.round((delta / completedInPrior) * 100) : null;

    const moduleChartData = Array.from(moduleCounts.entries()).map(([module, counts]) => ({
      module,
      Open: counts.open,
      Completed: counts.completed,
    }));

    return {
      completedInPeriod,
      completedInPrior,
      delta,
      pctChange,
      activeWorkload,
      overdueCount,
      upcoming30Days,
      avgJobsPerStaff,
      moduleChartData,
    };
  }, [jobs, period, todayStr, in30DaysStr, activeStaffCount]);

  // Staff Performance (PIC & Reviewer tables — strictly role-scoped)
  const { picRows, reviewerRows } = useMemo(() => {
    interface StaffAgg {
      name: string;
      activeOpen: number;
      completedPeriod: number;
      onTimeCompleted: number;
      overdueOpen: number;
      totalAssigned: number;
    }

    const buildTable = (roleField: 'taxPic' | 'reviewer'): StaffAgg[] => {
      const map = new Map<string, StaffAgg>();
      const ensure = (name: string) => {
        const clean = name.trim();
        if (!clean) return null;
        if (!map.has(clean)) {
          map.set(clean, {
            name: clean,
            activeOpen: 0,
            completedPeriod: 0,
            onTimeCompleted: 0,
            overdueOpen: 0,
            totalAssigned: 0,
          });
        }
        return map.get(clean)!;
      };

      for (const j of jobs) {
        const person = j[roleField] || '';
        const agg = ensure(person);
        if (!agg) continue;

        agg.totalAssigned += 1;
        const open = isJobOpen(j);
        const dl = getEffectiveDeadline(j);
        const compDate = getJobCompletionDate(j);

        if (open) {
          agg.activeOpen += 1;
          if (dl && dl < todayStr) agg.overdueOpen += 1;
        } else if (compDate) {
          const matchCurr =
            period.start === null && period.end === null
              ? true
              : inRange(compDate, period.start, period.end);
          if (matchCurr) {
            agg.completedPeriod += 1;
            if (!dl || compDate <= dl) agg.onTimeCompleted += 1;
          }
        }
      }

      let rows = Array.from(map.values());
      // Role Scoping: Staff & Report Viewer see ONLY their own rows
      if (!isManagerOrAdmin) {
        rows = rows.filter((r) => r.name.toLowerCase() === myStaffNameLower);
      }

      return rows.sort(
        (a, b) => b.completedPeriod - a.completedPeriod || b.activeOpen - a.activeOpen
      );
    };

    return {
      picRows: buildTable('taxPic'),
      reviewerRows: buildTable('reviewer'),
    };
  }, [jobs, period, todayStr, isManagerOrAdmin, myStaffNameLower]);

  // Filing & FYE Trends (Firm-wide aggregate)
  const { monthlyTrendData, fyeDistribution, yaDistribution } = useMemo(() => {
    // Build last 12 months timeline (or months covering selected period)
    const now = new Date();
    const monthsMap = new Map<string, { ym: string; label: string; completed: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsMap.set(ym, {
        ym,
        label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        completed: 0,
      });
    }

    const fyeMap = new Map<number, { fyeMonth: number; label: string; open: number; completed: number }>();
    for (let m = 1; m <= 12; m++) {
      fyeMap.set(m, {
        fyeMonth: m,
        label: `M${m} (${MONTH_LABELS[m - 1]})`,
        open: 0,
        completed: 0,
      });
    }

    const yaMap = new Map<string, { ya: string; total: number; open: number; completed: number }>();

    for (const j of jobs) {
      const open = isJobOpen(j);
      const compDate = getJobCompletionDate(j);

      if (compDate) {
        const ym = compDate.slice(0, 7);
        const bucket = monthsMap.get(ym);
        if (bucket) bucket.completed += 1;
      }

      const fyeNum = extractFyeMonth(j.fye);
      if (fyeNum && fyeMap.has(fyeNum)) {
        const fb = fyeMap.get(fyeNum)!;
        if (open) fb.open += 1;
        else if (compDate) fb.completed += 1;
      }

      const yaKey = (j.ya || '').trim() || 'Unspecified';
      if (!yaMap.has(yaKey)) yaMap.set(yaKey, { ya: yaKey, total: 0, open: 0, completed: 0 });
      const yb = yaMap.get(yaKey)!;
      yb.total += 1;
      if (open) yb.open += 1;
      else if (compDate) yb.completed += 1;
    }

    return {
      monthlyTrendData: Array.from(monthsMap.values()),
      fyeDistribution: Array.from(fyeMap.values()),
      yaDistribution: Array.from(yaMap.values()).sort((a, b) => b.ya.localeCompare(a.ya)),
    };
  }, [jobs]);

  const buildActiveKpiExport = (): {
    title: string;
    subtitle: string;
    columns: ExportColumn[];
    rows: Record<string, unknown>[];
  } => {
    const scopeNote = isManagerOrAdmin
      ? 'Scope: Firm-Wide'
      : `Scope: ${staffProfile?.staffName || 'Current User'} (Role-Scoped)`;

    if (activeTab === 'executive') {
      const columns: ExportColumn[] = [
        { key: 'section', label: 'Category' },
        { key: 'metric', label: 'KPI / Module' },
        { key: 'primaryValue', label: 'Current / Open', align: 'right' },
        { key: 'secondaryValue', label: 'Prior / Completed', align: 'right' },
      ];
      const rows: Record<string, unknown>[] = [
        {
          section: 'Executive KPI',
          metric: `Completed Jobs (${period.label})`,
          primaryValue: executiveMetrics.completedInPeriod,
          secondaryValue: period.prevStart ? executiveMetrics.completedInPrior : '—',
        },
        {
          section: 'Executive KPI',
          metric: 'Active Open Workload',
          primaryValue: executiveMetrics.activeWorkload,
          secondaryValue: '—',
        },
        {
          section: 'Executive KPI',
          metric: 'Overdue Open Jobs',
          primaryValue: executiveMetrics.overdueCount,
          secondaryValue: '—',
        },
        {
          section: 'Executive KPI',
          metric: 'Upcoming 30-Day Deadlines',
          primaryValue: executiveMetrics.upcoming30Days,
          secondaryValue: '—',
        },
        {
          section: 'Executive KPI',
          metric: `Average Open Jobs / Active Staff (${activeStaffCount})`,
          primaryValue: executiveMetrics.avgJobsPerStaff,
          secondaryValue: '—',
        },
        ...executiveMetrics.moduleChartData.map((m) => ({
          section: 'Module Breakdown',
          metric: m.module,
          primaryValue: m.Open,
          secondaryValue: m.Completed,
        })),
      ];
      return {
        title: 'KPI Executive Summary',
        subtitle: `Period: ${period.label} • ${scopeNote}`,
        columns,
        rows,
      };
    }

    if (activeTab === 'staff') {
      const columns: ExportColumn[] = [
        { key: 'role', label: 'Role' },
        { key: 'name', label: 'Staff Name' },
        { key: 'completedPeriod', label: 'Completed (Period)', align: 'right' },
        { key: 'onTimePct', label: 'On-Time %', align: 'right' },
        { key: 'activeOpen', label: 'Active Open', align: 'right' },
        { key: 'overdueOpen', label: 'Overdue Open', align: 'right' },
        { key: 'totalAssigned', label: 'Total Assigned', align: 'right' },
      ];
      const rows: Record<string, unknown>[] = [
        ...picRows.map((r) => ({
          role: 'PIC',
          name: r.name,
          completedPeriod: r.completedPeriod,
          onTimePct:
            r.completedPeriod > 0
              ? `${Math.round((r.onTimeCompleted / r.completedPeriod) * 100)}%`
              : '—',
          activeOpen: r.activeOpen,
          overdueOpen: r.overdueOpen,
          totalAssigned: r.totalAssigned,
        })),
        ...reviewerRows.map((r) => ({
          role: 'Reviewer',
          name: r.name,
          completedPeriod: r.completedPeriod,
          onTimePct:
            r.completedPeriod > 0
              ? `${Math.round((r.onTimeCompleted / r.completedPeriod) * 100)}%`
              : '—',
          activeOpen: r.activeOpen,
          overdueOpen: r.overdueOpen,
          totalAssigned: r.totalAssigned,
        })),
      ];
      return {
        title: 'KPI Staff Performance',
        subtitle: `Period: ${period.label} • ${scopeNote}`,
        columns,
        rows,
      };
    }

    const columns: ExportColumn[] = [
      { key: 'dimension', label: 'Dimension' },
      { key: 'bucket', label: 'Period / FYE / YA' },
      { key: 'open', label: 'Open Jobs', align: 'right' },
      { key: 'completed', label: 'Completed Jobs', align: 'right' },
      { key: 'total', label: 'Total', align: 'right' },
    ];
    const rows: Record<string, unknown>[] = [
      ...monthlyTrendData.map((m) => ({
        dimension: 'Monthly Completion',
        bucket: m.label,
        open: '—',
        completed: m.completed,
        total: m.completed,
      })),
      ...fyeDistribution.map((f) => ({
        dimension: 'FYE Distribution',
        bucket: f.label,
        open: f.open,
        completed: f.completed,
        total: f.open + f.completed,
      })),
      ...yaDistribution.map((y) => ({
        dimension: 'YA Distribution',
        bucket: y.ya,
        open: y.open,
        completed: y.completed,
        total: y.total,
      })),
    ];
    return {
      title: 'KPI Filing & FYE Trends',
      subtitle: `Period: ${period.label} • Firm-Wide Aggregate`,
      columns,
      rows,
    };
  };

  const handlePrintKpi = () => {
    const exp = buildActiveKpiExport();
    printTable(exp.title, exp.subtitle, exp.columns, exp.rows);
  };

  const handleExportKpiPdf = () => {
    const exp = buildActiveKpiExport();
    exportTableToPdf(exp.title, exp.subtitle, exp.columns, exp.rows);
  };

  const handleExportKpiExcel = () => {
    const exp = buildActiveKpiExport();
    exportToExcel(
      `TPMS_${exp.title.replace(/\s+/g, '_')}_${todayStr}.xlsx`,
      exp.title,
      exp.columns,
      exp.rows
    );
  };

  return (
    <div className="space-y-4">
      {/* Header + Period Preset Selector */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">KPI & Performance Analysis</h1>
          <p className="text-xs text-slate-500">
            Practice throughput, staff completion metrics, and statutory FYE filing distribution ({period.label}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPreset(opt.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                preset === opt.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range Inputs */}
      {preset === 'custom' && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <label className="font-medium text-slate-600">From:</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 text-xs font-mono border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="font-medium text-slate-600">To:</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 text-xs font-mono border border-slate-200 rounded-md"
            />
          </div>
        </div>
      )}

      {/* 3 Sub-Tabs + Export / Print Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('executive')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap ${
              activeTab === 'executive'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Executive Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap ${
              activeTab === 'staff'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Staff Performance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trends')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap ${
              activeTab === 'trends'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Filing & FYE Trends
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 no-print">
          <button
            type="button"
            onClick={handleExportKpiExcel}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Excel
          </button>
          <button
            type="button"
            onClick={handlePrintKpi}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExportKpiPdf}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-rose-700" />
            Export PDF
          </button>
        </div>
      </div>

      {/* TAB 1: EXECUTIVE SUMMARY */}
      {activeTab === 'executive' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-lg p-3.5">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Completed ({period.label})</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {executiveMetrics.completedInPeriod}
              </div>
              <div className="mt-1 text-[11px] flex items-center gap-1">
                {period.prevStart ? (
                  <>
                    {executiveMetrics.delta >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                    )}
                    <span
                      className={
                        executiveMetrics.delta >= 0
                          ? 'text-emerald-700 font-medium'
                          : 'text-rose-700 font-medium'
                      }
                    >
                      {executiveMetrics.delta >= 0 ? '+' : ''}
                      {executiveMetrics.delta}
                      {executiveMetrics.pctChange !== null
                        ? ` (${executiveMetrics.pctChange >= 0 ? '+' : ''}${executiveMetrics.pctChange}%)`
                        : ''}
                    </span>
                    <span className="text-slate-400">vs prior ({executiveMetrics.completedInPrior})</span>
                  </>
                ) : (
                  <span className="text-slate-400">All recorded completions</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3.5">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Active Workload</span>
                <Briefcase className="w-4 h-4 text-teal-700" />
              </div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {executiveMetrics.activeWorkload}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Open jobs across all modules</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3.5">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Overdue Jobs</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-rose-700">
                {executiveMetrics.overdueCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Past Final Applicable Deadline</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3.5">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Upcoming 30-Day</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-700">
                {executiveMetrics.upcoming30Days}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Deadlines within next 30 days</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3.5">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Avg Jobs / Staff</span>
                <Users className="w-4 h-4 text-slate-600" />
              </div>
              <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {executiveMetrics.avgJobsPerStaff}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Across {activeStaffCount} active staff
              </div>
            </div>
          </div>

          {/* Module Distribution Bar Chart */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Open Workload vs. Completed Jobs by Module
            </h2>
            <p className="text-[11px] text-slate-500 mb-4">
              Firm-wide aggregate breakdown ({period.label}).
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={executiveMetrics.moduleChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="module" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '8px',
                      borderColor: '#cbd5e1',
                    }}
                  />
                  <Bar dataKey="Open" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STAFF PERFORMANCE (Role-Scoped) */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {!isManagerOrAdmin && (
            <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-sky-700 shrink-0" />
              <span>
                Role-scoped view: showing only your own PIC and Reviewer performance rows (
                <strong>{staffProfile?.staffName}</strong>). Firm-wide aggregate trends remain
                available under Executive Summary and Filing &amp; FYE Trends.
              </span>
            </div>
          )}

          {/* PIC Completion Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                PIC Completion Performance ({period.label})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/70 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">PIC Staff</th>
                    <th className="py-2.5 px-4 text-right">Completed (Period)</th>
                    <th className="py-2.5 px-4 text-right">On-Time %</th>
                    <th className="py-2.5 px-4 text-right">Active Open</th>
                    <th className="py-2.5 px-4 text-right">Overdue Open</th>
                    <th className="py-2.5 px-4 text-right">Total Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {picRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No PIC job records found for your scope.
                      </td>
                    </tr>
                  ) : (
                    picRows.map((row) => {
                      const onTimePct =
                        row.completedPeriod > 0
                          ? `${Math.round((row.onTimeCompleted / row.completedPeriod) * 100)}%`
                          : '—';
                      return (
                        <tr key={row.name} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-medium text-slate-900">{row.name}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                            {row.completedPeriod}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                            {onTimePct}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800">
                            {row.activeOpen}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-700 font-medium">
                            {row.overdueOpen}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                            {row.totalAssigned}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reviewer Completion Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                Reviewer Completion Performance ({period.label})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/70 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Reviewer</th>
                    <th className="py-2.5 px-4 text-right">Completed (Period)</th>
                    <th className="py-2.5 px-4 text-right">On-Time %</th>
                    <th className="py-2.5 px-4 text-right">Active Open</th>
                    <th className="py-2.5 px-4 text-right">Overdue Open</th>
                    <th className="py-2.5 px-4 text-right">Total Reviewed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {reviewerRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No Reviewer job records found for your scope.
                      </td>
                    </tr>
                  ) : (
                    reviewerRows.map((row) => {
                      const onTimePct =
                        row.completedPeriod > 0
                          ? `${Math.round((row.onTimeCompleted / row.completedPeriod) * 100)}%`
                          : '—';
                      return (
                        <tr key={row.name} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-medium text-slate-900">{row.name}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                            {row.completedPeriod}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                            {onTimePct}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800">
                            {row.activeOpen}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-700 font-medium">
                            {row.overdueOpen}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                            {row.totalAssigned}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FILING & FYE TRENDS */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          {/* Monthly Completion Trend */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Monthly Completion Trend (Rolling 12 Months)
            </h2>
            <p className="text-[11px] text-slate-500 mb-4">
              Firm-wide completed jobs per calendar month.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '8px',
                      borderColor: '#cbd5e1',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="Completed Jobs"
                    stroke="#0f766e"
                    fill="#ccfbf1"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* FYE Distribution Chart */}
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">
                FYE Month Distribution (Months 1–12)
              </h2>
              <p className="text-[11px] text-slate-500 mb-4">
                Open vs. completed tax jobs grouped by financial year end month.
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fyeDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        fontSize: '12px',
                        borderRadius: '8px',
                        borderColor: '#cbd5e1',
                      }}
                    />
                    <Bar dataKey="open" name="Open" stackId="a" fill="#0f766e" />
                    <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* YA Distribution Table */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">YA Distribution Summary</h2>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-2 px-4">YA</th>
                      <th className="py-2 px-4 text-right">Total Jobs</th>
                      <th className="py-2 px-4 text-right">Open</th>
                      <th className="py-2 px-4 text-right">Completed</th>
                      <th className="py-2 px-4 text-right">Completion %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {yaDistribution.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No job data available.
                        </td>
                      </tr>
                    ) : (
                      yaDistribution.map((row) => (
                        <tr key={row.ya} className="hover:bg-slate-50/70">
                          <td className="py-2 px-4 font-mono font-semibold text-slate-900">
                            {row.ya}
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-700">
                            {row.total}
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums text-amber-700">
                            {row.open}
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                            {row.completed}
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-700">
                            {row.total > 0
                              ? `${Math.round((row.completed / row.total) * 100)}%`
                              : '0%'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
