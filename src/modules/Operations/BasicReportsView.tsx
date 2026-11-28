import React, { useEffect, useMemo, useState } from 'react';
import {
  FileBarChart2,
  AlertTriangle,
  CheckCircle2,
  Users,
  Mail,
  Clock,
  FileCheck2,
  ArrowLeftRight,
} from 'lucide-react';
import {
  ClientCategory,
  ColumnDef,
  FYE_MONTHS,
  JOB_TYPES,
  TaxJob,
} from '../../types/tpms';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { extractFyeMonth, formatDateDDMMYYYY, isIsoDateString } from '../../lib/deadlineUtils';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { buildDynamicSelectOptions } from '../../lib/settingsDropdown';

type ReportTab =
  | 'job-status'
  | 'deadline'
  | 'submission-status'
  | 'client-master'
  | 'pic-workload'
  | 'correspondence'
  | 'pic-handover';

const CLOSED_JOB_STATUSES = new Set([
  'completed',
  'submitted',
  'filed',
  'closed',
  'cancelled',
  'billed',
  'paid',
  'not applicable',
  'n/a',
]);

const CLOSED_CORR_STATUSES = new Set(['completed', 'no action required', 'cancelled']);

function isJobOpen(j: TaxJob): boolean {
  return !CLOSED_JOB_STATUSES.has((j.status || '').trim().toLowerCase());
}

function getEffectiveDeadline(j: TaxJob): string {
  for (const d of [j.finalApplicableDeadline, j.dueDate, j.internalDeadline]) {
    if (isIsoDateString(d)) return d!.trim();
  }
  return '';
}

function daysBetweenIso(earlier: string, later: string): number {
  const a = new Date(`${earlier}T00:00:00Z`).getTime();
  const b = new Date(`${later}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function inferSubmissionAnalysis(j: TaxJob): {
  submissionBucket: 'Submitted' | 'Pending' | 'Missing Date';
  displaySubmissionDate: string;
  flagText: string;
} {
  const statusLower = (j.status || '').trim().toLowerCase();
  const subStatusLower = (j.submissionStatus || '').trim().toLowerCase();
  const formCSub = (j.formCStatus || '').trim().toLowerCase() === 'submitted';
  const mitrsSub = (j.mitrsStatus || '').trim().toLowerCase() === 'submitted';

  const isMarkedComplete =
    statusLower === 'completed' ||
    statusLower === 'submitted' ||
    statusLower === 'filed' ||
    subStatusLower === 'submitted' ||
    subStatusLower === 'filed' ||
    subStatusLower === 'completed' ||
    formCSub ||
    mitrsSub;

  const hasFormCDate = isIsoDateString(j.formCSubmissionDate);
  const hasMitrsDate = isIsoDateString(j.mitrsSubmissionDate);
  const hasGeneralDate = isIsoDateString(j.submissionDate) || isIsoDateString(j.completedDate);

  const missingFormCDate = formCSub && !hasFormCDate;
  const missingMitrsDate = mitrsSub && !hasMitrsDate;
  const missingGeneralDate =
    !formCSub && !mitrsSub && isMarkedComplete && !hasGeneralDate;

  const displayDate =
    (hasFormCDate ? j.formCSubmissionDate : '') ||
    (hasMitrsDate ? j.mitrsSubmissionDate : '') ||
    (isIsoDateString(j.submissionDate) ? j.submissionDate : '') ||
    (isIsoDateString(j.completedDate) ? j.completedDate : '') ||
    '';

  if (missingFormCDate || missingMitrsDate || missingGeneralDate) {
    return {
      submissionBucket: 'Missing Date',
      displaySubmissionDate: displayDate,
      flagText: 'Submission marked complete — date missing',
    };
  }

  if (isMarkedComplete) {
    return {
      submissionBucket: 'Submitted',
      displaySubmissionDate: displayDate,
      flagText: '',
    };
  }

  return {
    submissionBucket: 'Pending',
    displaySubmissionDate: displayDate,
    flagText: '',
  };
}

const REPORT_TABS: Array<{ id: ReportTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'job-status', label: 'Job Status', icon: FileBarChart2 },
  { id: 'deadline', label: 'Deadline', icon: Clock },
  { id: 'submission-status', label: 'Submission Status', icon: FileCheck2 },
  { id: 'client-master', label: 'Client Master', icon: Users },
  { id: 'pic-workload', label: 'PIC Workload', icon: CheckCircle2 },
  { id: 'correspondence', label: 'Correspondence', icon: Mail },
  { id: 'pic-handover', label: 'PIC Handover Log', icon: ArrowLeftRight },
];

const COLUMNS_BY_REPORT: Record<ReportTab, ColumnDef[]> = {
  'job-status': [
    { key: 'jobCode', label: 'Job Code', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'category', label: 'Category', defaultVisible: true },
    { key: 'jobType', label: 'Job Type', defaultVisible: true },
    { key: 'ya', label: 'YA', defaultVisible: true },
    { key: 'fye', label: 'FYE', defaultVisible: true },
    { key: 'pic', label: 'PIC', defaultVisible: true },
    { key: 'reviewer', label: 'Reviewer', defaultVisible: false, optional: true },
    { key: 'deadline', label: 'Final Deadline', defaultVisible: true },
    { key: 'status', label: 'Status', defaultVisible: true },
    { key: 'remarks', label: 'Remarks', defaultVisible: false, optional: true },
  ],
  deadline: [
    { key: 'jobCode', label: 'Job Code', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'category', label: 'Category', defaultVisible: true },
    { key: 'jobType', label: 'Job Type', defaultVisible: true },
    { key: 'ya', label: 'YA', defaultVisible: true },
    { key: 'fye', label: 'FYE', defaultVisible: true },
    { key: 'pic', label: 'PIC', defaultVisible: true },
    { key: 'deadline', label: 'Final Deadline', defaultVisible: true },
    { key: 'daysOverdue', label: 'Days Overdue', defaultVisible: true, align: 'right' },
    { key: 'status', label: 'Status', defaultVisible: true },
  ],
  'submission-status': [
    { key: 'jobCode', label: 'Job Code', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'jobType', label: 'Job Type', defaultVisible: true },
    { key: 'ya', label: 'YA', defaultVisible: true },
    { key: 'fye', label: 'FYE', defaultVisible: true },
    { key: 'pic', label: 'PIC', defaultVisible: true },
    { key: 'status', label: 'Job Status', defaultVisible: true },
    { key: 'formCStatus', label: 'Form C', defaultVisible: true },
    { key: 'mitrsStatus', label: 'MITRS', defaultVisible: true },
    { key: 'submissionDate', label: 'Submission Date', defaultVisible: true },
    { key: 'auditFlag', label: 'Submission Audit Flag', defaultVisible: true },
  ],
  'client-master': [
    { key: 'clientId', label: 'Client ID', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'category', label: 'Category', defaultVisible: true },
    { key: 'companyNo', label: 'Company / IC No.', defaultVisible: true },
    { key: 'tin', label: 'TIN', defaultVisible: true },
    { key: 'fye', label: 'FYE', defaultVisible: true },
    { key: 'taxPic', label: 'Tax PIC', defaultVisible: true },
    { key: 'clientStatus', label: 'Status', defaultVisible: true },
    { key: 'taxAgent', label: 'Tax Agent', defaultVisible: false, optional: true },
    { key: 'eInvoiceStatus', label: 'E-Invoice', defaultVisible: false, optional: true },
    { key: 'sstRegistered', label: 'SST', defaultVisible: false, optional: true },
  ],
  'pic-workload': [
    { key: 'pic', label: 'PIC Name', defaultVisible: true },
    { key: 'totalJobs', label: 'Total Jobs', defaultVisible: true, align: 'right' },
    { key: 'openJobs', label: 'Open Jobs', defaultVisible: true, align: 'right' },
    { key: 'overdueJobs', label: 'Overdue Jobs', defaultVisible: true, align: 'right' },
    { key: 'pendingMitrs', label: 'Pending MITRS', defaultVisible: true, align: 'right' },
    { key: 'completedJobs', label: 'Completed', defaultVisible: true, align: 'right' },
    { key: 'openCorr', label: 'Open Corr.', defaultVisible: true, align: 'right' },
    { key: 'completionRate', label: 'Completion %', defaultVisible: true, align: 'right' },
  ],
  correspondence: [
    { key: 'correspondenceId', label: 'Ref ID', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'ya', label: 'YA', defaultVisible: true },
    { key: 'category', label: 'Authority / Category', defaultVisible: true },
    { key: 'letterType', label: 'Letter Type', defaultVisible: true },
    { key: 'letterSubject', label: 'Subject', defaultVisible: true },
    { key: 'dateReceived', label: 'Received', defaultVisible: true },
    { key: 'dueDate', label: 'Due Date', defaultVisible: true },
    { key: 'pic', label: 'PIC', defaultVisible: true },
    { key: 'actionStatus', label: 'Action Status', defaultVisible: true },
    { key: 'overdueFlag', label: 'Overdue', defaultVisible: true },
  ],
  'pic-handover': [
    { key: 'date', label: 'Date', defaultVisible: true },
    { key: 'scope', label: 'Scope', defaultVisible: true },
    { key: 'recordId', label: 'Client / Job ID', defaultVisible: true },
    { key: 'clientName', label: 'Client Name', defaultVisible: true },
    { key: 'jobInfo', label: 'Job / YA', defaultVisible: true },
    { key: 'fromPic', label: 'Departing PIC', defaultVisible: true },
    { key: 'toPic', label: 'Incoming PIC / Continued By', defaultVisible: true },
    { key: 'transferredBy', label: 'Transferred By', defaultVisible: true },
    { key: 'note', label: 'Notes', defaultVisible: true },
  ],
};

export const BasicReportsView: React.FC = () => {
  const { jobs, clients, correspondenceRecords, history, getSettingsByGroup } = useData();
  const [activeTab, setActiveTab] = useState<ReportTab>('job-status');

  // Shared Operational Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'' | ClientCategory>('');
  const [fyeFilter, setFyeFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [yaFilter, setYaFilter] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState<
    '' | 'Submitted' | 'Pending' | 'Missing Date'
  >('');

  // PIC Handover Log Filters
  const [handoverDateFrom, setHandoverDateFrom] = useState('');
  const [handoverDateTo, setHandoverDateTo] = useState('');
  const [departingPicFilter, setDepartingPicFilter] = useState('');
  const [incomingPicFilter, setIncomingPicFilter] = useState('');
  const [handoverScopeFilter, setHandoverScopeFilter] = useState<'' | 'Client' | 'Job'>('');

  const columns = COLUMNS_BY_REPORT[activeTab];
  const { visibleColumns, toggleColumn, resetColumns } = useColumnVisibility(
    `basic_reports_v2_${activeTab}`,
    columns
  );

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Client lookup map to resolve client category/FYE on jobs & correspondence
  const clientMap = useMemo(() => {
    const byId = new Map<string, (typeof clients)[number]>();
    for (const c of clients) {
      if (c.clientId) byId.set(c.clientId.trim().toLowerCase(), c);
    }
    return byId;
  }, [clients]);

  const distinctYas = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) if (j.ya) set.add(j.ya.trim());
    for (const c of correspondenceRecords) if (c.ya) set.add(c.ya.trim());
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [jobs, correspondenceRecords]);

  // Consolidated PIC Handover Events (Client picHistory + Job PIC_HANDOVER audit entries + previousPic fallback)
  const allHandoverEvents = useMemo(() => {
    const events: Array<{
      _id: string;
      _isoDate: string;
      date: string;
      scope: 'Client' | 'Job';
      recordId: string;
      clientName: string;
      jobInfo: string;
      fromPic: string;
      toPic: string;
      transferredBy: string;
      note: string;
    }> = [];

    const jobById = new Map<string, TaxJob>();
    for (const j of jobs) jobById.set(j.id, j);

    // 1. Client-level PIC handover history
    for (const c of clients) {
      const entries = Array.isArray(c.picHistory) ? c.picHistory : [];
      entries.forEach((entry, idx) => {
        const rawIso = isIsoDateString(entry.date)
          ? entry.date.trim()
          : (entry.date || '').slice(0, 10);
        events.push({
          _id: `client_${c.id}_${idx}_${rawIso}`,
          _isoDate: rawIso,
          date: rawIso ? formatDateDDMMYYYY(rawIso) : '—',
          scope: 'Client',
          recordId: c.clientId || '—',
          clientName: c.clientName || '—',
          jobInfo: `Client Portfolio (${c.category || 'Corporate'})`,
          fromPic: (entry.fromPic || '').trim() || 'Unassigned',
          toPic: (entry.toPic || '').trim() || 'Unassigned',
          transferredBy: (entry.transferredBy || '').trim() || 'System',
          note: (entry.note || '').trim() || '—',
        });
      });
    }

    // 2. Job-level immutable PIC_HANDOVER audit trail entries
    const jobsWithLoggedHandover = new Set<string>();
    for (const h of history) {
      if (h.action !== 'PIC_HANDOVER') continue;
      if (h.jobId) jobsWithLoggedHandover.add(h.jobId);
      const linkedJob = h.jobId ? jobById.get(h.jobId) : undefined;
      let rawIso = '';
      if (h.timestamp?.toDate) {
        try {
          rawIso = h.timestamp.toDate().toISOString().slice(0, 10);
        } catch {
          rawIso = '';
        }
      }
      const jobTypeText = linkedJob ? linkedJob.jobType || linkedJob.module : '';
      const yaText = linkedJob?.ya ? `YA ${linkedJob.ya}` : '';
      const jobInfo = [jobTypeText, yaText].filter(Boolean).join(' · ') || 'Tax Job';

      events.push({
        _id: `hist_${h.id}`,
        _isoDate: rawIso,
        date: rawIso ? formatDateDDMMYYYY(rawIso) : 'Just now',
        scope: 'Job',
        recordId: linkedJob?.jobCode || linkedJob?.clientId || h.jobId || '—',
        clientName: linkedJob?.clientName || '—',
        jobInfo,
        fromPic: (h.oldStatus || '').trim() || 'Unassigned',
        toPic: (h.newStatus || '').trim() || 'Unassigned',
        transferredBy: (h.user || '').trim() || 'System',
        note: (h.remarks || '').trim() || '—',
      });
    }

    // 3. Fallback for jobs with previousPic set but without a logged PIC_HANDOVER history entry
    for (const j of jobs) {
      if (!j.previousPic || !j.previousPic.trim()) continue;
      if (jobsWithLoggedHandover.has(j.id)) continue;
      const rawIso = isIsoDateString(j.statusDate) ? j.statusDate!.trim() : '';
      const jobInfo = [j.jobType || j.module, j.ya ? `YA ${j.ya}` : ''].filter(Boolean).join(' · ');
      events.push({
        _id: `job_fallback_${j.id}`,
        _isoDate: rawIso,
        date: rawIso ? formatDateDDMMYYYY(rawIso) : '—',
        scope: 'Job',
        recordId: j.jobCode || j.clientId || '—',
        clientName: j.clientName || '—',
        jobInfo: jobInfo || 'Tax Job',
        fromPic: j.previousPic.trim(),
        toPic: (j.taxPic || '').trim() || 'Unassigned',
        transferredBy: 'Recorded on Job',
        note: `Continued by ${(j.taxPic || '').trim() || 'Unassigned'}`,
      });
    }

    return events.sort((a, b) => b._isoDate.localeCompare(a._isoDate));
  }, [clients, jobs, history]);

  const distinctDepartingPics = useMemo(() => {
    const set = new Set<string>();
    for (const e of allHandoverEvents) if (e.fromPic) set.add(e.fromPic);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allHandoverEvents]);

  const distinctIncomingPics = useMemo(() => {
    const set = new Set<string>();
    for (const e of allHandoverEvents) if (e.toPic) set.add(e.toPic);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allHandoverEvents]);

  // Filtered Jobs (used by Job Status, Deadline, Submission Status, PIC Workload)
  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      const client = clientMap.get((j.clientId || '').trim().toLowerCase());
      const resolvedCategory: ClientCategory =
        client?.category ||
        (j.module === 'Individual'
          ? 'Individual'
          : j.module === 'Corporate' || j.module === 'CP204' || j.module === 'Form E'
          ? 'Corporate'
          : 'Other');

      if (categoryFilter && resolvedCategory !== categoryFilter) return false;
      if (fyeFilter) {
        const m = extractFyeMonth(j.fye || client?.fye);
        if (m !== Number(fyeFilter)) return false;
      }
      if (jobTypeFilter && (j.jobType || j.formType || '') !== jobTypeFilter) return false;
      if (yaFilter && (j.ya || '').trim() !== yaFilter) return false;

      if (submissionFilter) {
        const analysis = inferSubmissionAnalysis(j);
        if (analysis.submissionBucket !== submissionFilter) return false;
      }

      if (q) {
        const hay = [
          j.jobCode,
          j.clientId,
          j.clientName,
          j.jobType,
          j.module,
          j.ya,
          j.taxPic,
          j.reviewer,
          j.status,
          j.remarks,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, clientMap, search, categoryFilter, fyeFilter, jobTypeFilter, yaFilter, submissionFilter]);

  // Build rows for the currently active report
  const reportRows = useMemo<Array<Record<string, string | number>>>(() => {
    const q = search.trim().toLowerCase();

    if (activeTab === 'job-status') {
      return filteredJobs.map((j) => {
        const client = clientMap.get((j.clientId || '').trim().toLowerCase());
        const dl = getEffectiveDeadline(j);
        const fyeNum = extractFyeMonth(j.fye || client?.fye);
        return {
          _id: j.id,
          jobCode: j.jobCode,
          clientName: j.clientName,
          category: client?.category || (j.module === 'Individual' ? 'Individual' : 'Corporate'),
          jobType: j.jobType || j.module,
          ya: j.ya || '—',
          fye: fyeNum ? String(fyeNum) : '—',
          pic: j.taxPic || '—',
          reviewer: j.reviewer || '—',
          deadline: dl ? formatDateDDMMYYYY(dl) : '—',
          status: j.status,
          remarks: j.remarks || '',
        };
      });
    }

    if (activeTab === 'deadline') {
      return filteredJobs
        .filter((j) => {
          if (!isJobOpen(j)) return false;
          const dl = getEffectiveDeadline(j);
          return Boolean(dl && dl < todayStr);
        })
        .map((j) => {
          const client = clientMap.get((j.clientId || '').trim().toLowerCase());
          const dl = getEffectiveDeadline(j);
          const fyeNum = extractFyeMonth(j.fye || client?.fye);
          return {
            _id: j.id,
            _sortDl: dl,
            jobCode: j.jobCode,
            clientName: j.clientName,
            category: client?.category || (j.module === 'Individual' ? 'Individual' : 'Corporate'),
            jobType: j.jobType || j.module,
            ya: j.ya || '—',
            fye: fyeNum ? String(fyeNum) : '—',
            pic: j.taxPic || '—',
            deadline: formatDateDDMMYYYY(dl),
            daysOverdue: daysBetweenIso(dl, todayStr),
            status: j.status,
          };
        })
        .sort((a, b) => Number(b.daysOverdue) - Number(a.daysOverdue));
    }

    if (activeTab === 'submission-status') {
      return filteredJobs.map((j) => {
        const client = clientMap.get((j.clientId || '').trim().toLowerCase());
        const fyeNum = extractFyeMonth(j.fye || client?.fye);
        const analysis = inferSubmissionAnalysis(j);
        return {
          _id: j.id,
          jobCode: j.jobCode,
          clientName: j.clientName,
          jobType: j.jobType || j.module,
          ya: j.ya || '—',
          fye: fyeNum ? String(fyeNum) : '—',
          pic: j.taxPic || '—',
          status: j.status,
          formCStatus: j.formCStatus || '—',
          mitrsStatus: j.mitrsStatus || '—',
          submissionDate: analysis.displaySubmissionDate
            ? formatDateDDMMYYYY(analysis.displaySubmissionDate)
            : '—',
          auditFlag: analysis.flagText || 'OK',
        };
      });
    }

    if (activeTab === 'client-master') {
      return clients
        .filter((c) => {
          if (categoryFilter && c.category !== categoryFilter) return false;
          if (fyeFilter && extractFyeMonth(c.fye) !== Number(fyeFilter)) return false;
          if (q) {
            const hay = [
              c.clientId,
              c.clientName,
              c.companyNo,
              c.tin,
              c.taxPic,
              c.clientStatus,
              c.taxAgent,
            ]
              .join(' ')
              .toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .map((c) => {
          const fyeNum = extractFyeMonth(c.fye);
          return {
            _id: c.id,
            clientId: c.clientId,
            clientName: c.clientName,
            category: c.category,
            companyNo: c.companyNo || '—',
            tin: c.tin || '—',
            fye: fyeNum ? String(fyeNum) : '—',
            taxPic: c.taxPic || '—',
            clientStatus: c.clientStatus,
            taxAgent: c.taxAgent || '—',
            eInvoiceStatus: c.eInvoiceStatus || '—',
            sstRegistered: c.sstRegistered || '—',
          };
        });
    }

    if (activeTab === 'pic-workload') {
      const grouped = new Map<
        string,
        {
          total: number;
          open: number;
          overdue: number;
          pendingMitrs: number;
          completed: number;
          openCorr: number;
        }
      >();
      const ensure = (name: string) => {
        const key = name.trim() || 'Unassigned';
        if (!grouped.has(key)) {
          grouped.set(key, {
            total: 0,
            open: 0,
            overdue: 0,
            pendingMitrs: 0,
            completed: 0,
            openCorr: 0,
          });
        }
        return grouped.get(key)!;
      };

      for (const j of filteredJobs) {
        const g = ensure(j.taxPic || 'Unassigned');
        g.total += 1;
        const open = isJobOpen(j);
        if (open) {
          g.open += 1;
          const dl = getEffectiveDeadline(j);
          if (dl && dl < todayStr) g.overdue += 1;
        } else {
          g.completed += 1;
        }
        if ((j.status || '').trim().toLowerCase() === 'pending mitrs') {
          g.pendingMitrs += 1;
        }
      }

      for (const c of correspondenceRecords) {
        const open = !CLOSED_CORR_STATUSES.has((c.actionStatus || '').trim().toLowerCase());
        if (!open) continue;
        if (yaFilter && (c.ya || '').trim() !== yaFilter) continue;
        const g = ensure(c.pic || 'Unassigned');
        g.openCorr += 1;
      }

      return Array.from(grouped.entries())
        .map(([pic, stats]) => ({
          _id: pic,
          pic,
          totalJobs: stats.total,
          openJobs: stats.open,
          overdueJobs: stats.overdue,
          pendingMitrs: stats.pendingMitrs,
          completedJobs: stats.completed,
          openCorr: stats.openCorr,
          completionRate:
            stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}%` : '0%',
        }))
        .sort((a, b) => Number(b.openJobs) - Number(a.openJobs));
    }

    if (activeTab === 'pic-handover') {
      return allHandoverEvents.filter((ev) => {
        if (handoverScopeFilter && ev.scope !== handoverScopeFilter) return false;
        if (departingPicFilter && ev.fromPic !== departingPicFilter) return false;
        if (incomingPicFilter && ev.toPic !== incomingPicFilter) return false;
        if (handoverDateFrom && ev._isoDate && ev._isoDate < handoverDateFrom) return false;
        if (handoverDateFrom && !ev._isoDate) return false;
        if (handoverDateTo && ev._isoDate && ev._isoDate > handoverDateTo) return false;
        if (handoverDateTo && !ev._isoDate) return false;
        if (q) {
          const hay = [
            ev.date,
            ev.scope,
            ev.recordId,
            ev.clientName,
            ev.jobInfo,
            ev.fromPic,
            ev.toPic,
            ev.transferredBy,
            ev.note,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }

    // Correspondence report
    return correspondenceRecords
      .filter((c) => {
        const client = clientMap.get((c.clientId || '').trim().toLowerCase());
        if (categoryFilter && client && client.category !== categoryFilter) return false;
        if (fyeFilter && client && extractFyeMonth(client.fye) !== Number(fyeFilter)) return false;
        if (yaFilter && (c.ya || '').trim() !== yaFilter) return false;
        if (q) {
          const hay = [
            c.correspondenceId,
            c.clientName,
            c.category,
            c.letterType,
            c.letterSubject,
            c.pic,
            c.actionStatus,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((c) => {
        const isOpen = !CLOSED_CORR_STATUSES.has((c.actionStatus || '').trim().toLowerCase());
        const isOverdue = isOpen && isIsoDateString(c.dueDate) && c.dueDate < todayStr;
        return {
          _id: c.id,
          correspondenceId: c.correspondenceId,
          clientName: c.clientName,
          ya: c.ya || '—',
          category: c.category,
          letterType: c.letterType,
          letterSubject: c.letterSubject || '—',
          dateReceived: c.dateReceived ? formatDateDDMMYYYY(c.dateReceived) : '—',
          dueDate: c.dueDate ? formatDateDDMMYYYY(c.dueDate) : '—',
          pic: c.pic || '—',
          actionStatus: c.actionStatus,
          overdueFlag: isOverdue ? `${daysBetweenIso(c.dueDate, todayStr)}d Overdue` : 'On Track',
        };
      });
  }, [
    activeTab,
    filteredJobs,
    clients,
    correspondenceRecords,
    allHandoverEvents,
    clientMap,
    categoryFilter,
    fyeFilter,
    yaFilter,
    handoverDateFrom,
    handoverDateTo,
    departingPicFilter,
    incomingPicFilter,
    handoverScopeFilter,
    search,
    todayStr,
  ]);

  const reportColumnGetters = useMemo(() => {
    const getters: Record<string, (row: Record<string, string | number>) => unknown> = {};
    for (const col of columns) {
      getters[col.key] = (row) => row[col.key];
    }
    return getters;
  }, [columns]);

  const excel = useExcelTableFilters(reportRows, reportColumnGetters);

  useEffect(() => {
    excel.resetColumnFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const jobTypeFilterOptions = useMemo(
    () => buildDynamicSelectOptions(getSettingsByGroup('JOB_TYPE'), JOB_TYPES, jobTypeFilter),
    [getSettingsByGroup, jobTypeFilter]
  );

  const missingDateCount = useMemo(() => {
    if (activeTab !== 'submission-status') return 0;
    return excel.rows.filter((r) => r.auditFlag === 'Submission marked complete — date missing')
      .length;
  }, [activeTab, excel.rows]);

  const handoverKpis = useMemo(() => {
    if (activeTab !== 'pic-handover') {
      return { total: 0, clientTransfers: 0, jobContinuations: 0, activeIncoming: 0 };
    }
    let clientTransfers = 0;
    let jobContinuations = 0;
    const incomingSet = new Set<string>();
    for (const r of excel.rows) {
      if (r.scope === 'Client') clientTransfers += 1;
      if (r.scope === 'Job') jobContinuations += 1;
      const to = String(r.toPic || '').trim();
      if (to && to !== 'Unassigned') incomingSet.add(to);
    }
    return {
      total: excel.rows.length,
      clientTransfers,
      jobContinuations,
      activeIncoming: incomingSet.size,
    };
  }, [activeTab, excel.rows]);

  const hasActiveFilters = Boolean(
    search ||
      categoryFilter ||
      fyeFilter ||
      jobTypeFilter ||
      yaFilter ||
      submissionFilter ||
      handoverDateFrom ||
      handoverDateTo ||
      departingPicFilter ||
      incomingPicFilter ||
      handoverScopeFilter ||
      excel.hasActiveColumnFilters
  );

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setFyeFilter('');
    setJobTypeFilter('');
    setYaFilter('');
    setSubmissionFilter('');
    setHandoverDateFrom('');
    setHandoverDateTo('');
    setDepartingPicFilter('');
    setIncomingPicFilter('');
    setHandoverScopeFilter('');
    excel.resetColumnFilters();
  };

  const activeTabLabel = REPORT_TABS.find((t) => t.id === activeTab)?.label || 'Report';
  const visibleCols = useMemo(
    () => columns.filter((c) => visibleColumns[c.key]),
    [columns, visibleColumns]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Basic Reports</h1>
        <p className="text-xs text-slate-500">
          Operational compliance registers with cross-module filtering, submission date audits, and Excel / PDF export.
        </p>
      </div>

      {/* 6 Report Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                active
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Submission Date Audit Callout */}
      {activeTab === 'submission-status' && missingDateCount > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong className="font-mono tabular-nums">{missingDateCount}</strong> record
            {missingDateCount === 1 ? '' : 's'} flagged:{' '}
            <strong>Submission marked complete — date missing</strong>. Use the Submission Status
            filter to isolate them.
          </span>
        </div>
      )}

      {/* PIC Handover Summary Strip */}
      {activeTab === 'pic-handover' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-500">Total Handover Events</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {handoverKpis.total}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-500">Client Portfolio Transfers</div>
            <div className="text-lg font-bold font-mono tabular-nums text-teal-700 mt-0.5">
              {handoverKpis.clientTransfers}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-500">Job Continuations</div>
            <div className="text-lg font-bold font-mono tabular-nums text-indigo-700 mt-0.5">
              {handoverKpis.jobContinuations}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-slate-500">Incoming PICs Involved</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {handoverKpis.activeIncoming}
            </div>
          </div>
        </div>
      )}

      {/* Register Toolbar with Required Filters */}
      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${activeTabLabel} report...`}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        columns={columns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_Report_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            activeTabLabel,
            visibleCols,
            excel.rows
          )
        }
        onPrint={() =>
          printRegisterHtml(
            `Basic Report — ${activeTabLabel}`,
            `Generated ${formatDateDDMMYYYY(todayStr)} • ${excel.rows.length} rows`,
            visibleCols,
            excel.rows,
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            `Basic Report — ${activeTabLabel}`,
            `Generated ${formatDateDDMMYYYY(todayStr)} • ${excel.rows.length} rows`,
            visibleCols,
            excel.rows,
            true
          )
        }
        recordCount={excel.rows.length}
        totalCount={reportRows.length}
        filters={
          activeTab === 'pic-handover' ? (
            <>
              <div className="inline-flex items-center gap-1 text-xs text-slate-600">
                <span className="text-[11px] font-medium text-slate-500">From</span>
                <input
                  type="date"
                  value={handoverDateFrom}
                  onChange={(e) => setHandoverDateFrom(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700 font-mono"
                />
              </div>
              <div className="inline-flex items-center gap-1 text-xs text-slate-600">
                <span className="text-[11px] font-medium text-slate-500">To</span>
                <input
                  type="date"
                  value={handoverDateTo}
                  onChange={(e) => setHandoverDateTo(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700 font-mono"
                />
              </div>

              <select
                value={departingPicFilter}
                onChange={(e) => setDepartingPicFilter(e.target.value)}
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Departing PICs</option>
                {distinctDepartingPics.map((p) => (
                  <option key={p} value={p}>
                    From: {p}
                  </option>
                ))}
              </select>

              <select
                value={incomingPicFilter}
                onChange={(e) => setIncomingPicFilter(e.target.value)}
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Incoming PICs</option>
                {distinctIncomingPics.map((p) => (
                  <option key={p} value={p}>
                    To: {p}
                  </option>
                ))}
              </select>

              <select
                value={handoverScopeFilter}
                onChange={(e) => setHandoverScopeFilter(e.target.value as '' | 'Client' | 'Job')}
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Scopes (Client &amp; Job)</option>
                <option value="Client">Client Portfolio</option>
                <option value="Job">Job Continuation</option>
              </select>
            </>
          ) : (
            <>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as '' | ClientCategory)}
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Categories</option>
                <option value="Corporate">Corporate</option>
                <option value="Individual">Individual</option>
                <option value="Other">Other</option>
              </select>

              <select
                value={fyeFilter}
                onChange={(e) => setFyeFilter(e.target.value)}
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All FYE</option>
                {FYE_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    FYE Month {Number(m)}
                  </option>
                ))}
              </select>

              <select
                value={jobTypeFilter}
                onChange={(e) => setJobTypeFilter(e.target.value)}
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Job Types</option>
                {jobTypeFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <select
                value={yaFilter}
                onChange={(e) => setYaFilter(e.target.value)}
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All YA</option>
                {distinctYas.map((y) => (
                  <option key={y} value={y}>
                    YA {y}
                  </option>
                ))}
              </select>

              <select
                value={submissionFilter}
                onChange={(e) =>
                  setSubmissionFilter(
                    e.target.value as '' | 'Submitted' | 'Pending' | 'Missing Date'
                  )
                }
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
              >
                <option value="">All Submission Status</option>
                <option value="Submitted">Submitted (Date Recorded)</option>
                <option value="Pending">Pending Submission</option>
                <option value="Missing Date">Missing Date Flag</option>
              </select>
            </>
          )
        }
      />

      {/* High-Density Report Table */}
      <div className="max-h-[calc(100vh-64px)] overflow-auto relative bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm border-b border-slate-200 text-slate-700">
            <tr>
              {visibleCols.map((col, colIdx) => {
                const firstKey = visibleCols[0]?.key;
                const isFirstId =
                  colIdx === 0 &&
                  (col.key === 'jobCode' ||
                    col.key === 'clientId' ||
                    col.key === 'correspondenceId' ||
                    col.key === 'pic');
                const isSecondClient =
                  col.key === 'clientName' &&
                  (firstKey === 'jobCode' ||
                    firstKey === 'clientId' ||
                    firstKey === 'correspondenceId');
                const hasSecondClient = visibleCols.some((c) => c.key === 'clientName');

                const stickyThCls = isFirstId
                  ? `sticky top-0 left-0 z-30 bg-slate-50 ${
                      col.key === 'pic' ? 'w-[165px] min-w-[165px]' : 'w-[125px] min-w-[125px]'
                    } ${
                      !hasSecondClient || col.key === 'pic'
                        ? 'shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
                        : 'shadow-[inset_-1px_0_0_#e2e8f0]'
                    }`
                  : isSecondClient
                  ? 'sticky top-0 left-[125px] z-30 bg-slate-50 min-w-[205px] shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
                  : colIdx === 0 && col.key === 'clientName'
                  ? 'sticky top-0 left-0 z-30 bg-slate-50 min-w-[205px] shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
                  : 'sticky top-0 z-20 bg-slate-50';

                return (
                  <th
                    key={col.key}
                    className={`py-2 px-3 text-xs font-semibold whitespace-nowrap border-b border-slate-200 ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${stickyThCls}`}
                  >
                    <ExcelColumnFilter
                      columnKey={col.key}
                      title={col.label}
                      values={excel.getColumnValues(col.key)}
                      selectedValues={excel.columnFilters[col.key]}
                      onChangeSelected={(next) => excel.setColumnFilter(col.key, next)}
                      sortDirection={
                        excel.sortState?.key === col.key ? excel.sortState.direction : null
                      }
                      onSort={(dir) => excel.setColumnSort(col.key, dir)}
                      align={col.align === 'right' ? 'right' : 'left'}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {excel.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(visibleCols.length, 1)}
                  className="py-12 text-center text-slate-400"
                >
                  No matching records for the selected report and filters.
                </td>
              </tr>
            ) : (
              excel.rows.map((row) => (
                <tr key={String(row._id)} className="group hover:bg-slate-50 transition-colors">
                  {visibleCols.map((col, colIdx) => {
                    const val = row[col.key];
                    const strVal = val === undefined || val === null ? '—' : String(val);

                    const firstKey = visibleCols[0]?.key;
                    const isFirstId =
                      colIdx === 0 &&
                      (col.key === 'jobCode' ||
                        col.key === 'clientId' ||
                        col.key === 'correspondenceId' ||
                        col.key === 'pic');
                    const isSecondClient =
                      col.key === 'clientName' &&
                      (firstKey === 'jobCode' ||
                        firstKey === 'clientId' ||
                        firstKey === 'correspondenceId');
                    const hasSecondClient = visibleCols.some((c) => c.key === 'clientName');

                    const stickyTdCls = isFirstId
                      ? `sticky left-0 z-10 bg-white group-hover:bg-slate-50 ${
                          col.key === 'pic' ? 'w-[165px] min-w-[165px]' : 'w-[125px] min-w-[125px]'
                        } ${
                          !hasSecondClient || col.key === 'pic'
                            ? 'shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
                            : 'shadow-[inset_-1px_0_0_#e2e8f0]'
                        }`
                      : isSecondClient
                      ? 'sticky left-[125px] z-10 bg-white group-hover:bg-slate-50 min-w-[205px] shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
                      : colIdx === 0 && col.key === 'clientName'
                      ? 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 min-w-[205px] shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
                      : '';

                    if (col.key === 'auditFlag') {
                      const isFlagged = strVal === 'Submission marked complete — date missing';
                      return (
                        <td key={col.key} className="py-2 px-3 whitespace-nowrap">
                          {isFlagged ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-medium">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {strVal}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium">
                              OK
                            </span>
                          )}
                        </td>
                      );
                    }

                    if (col.key === 'daysOverdue') {
                      return (
                        <td
                          key={col.key}
                          className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-rose-700 whitespace-nowrap"
                        >
                          {strVal}d
                        </td>
                      );
                    }

                    if (col.key === 'overdueFlag') {
                      const isOverdue = strVal.includes('Overdue');
                      return (
                        <td key={col.key} className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${
                              isOverdue
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {strVal}
                          </span>
                        </td>
                      );
                    }

                    if (col.key === 'scope') {
                      const isClient = strVal === 'Client';
                      return (
                        <td key={col.key} className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${
                              isClient
                                ? 'bg-teal-50 text-teal-800 border-teal-200'
                                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            }`}
                          >
                            {isClient ? 'Client Portfolio' : 'Job'}
                          </span>
                        </td>
                      );
                    }

                    if (col.key === 'fromPic') {
                      return (
                        <td key={col.key} className="py-2 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium">
                            {strVal}
                          </span>
                        </td>
                      );
                    }

                    if (col.key === 'toPic') {
                      return (
                        <td key={col.key} className="py-2 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-semibold">
                            {strVal}
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={col.key}
                        className={`py-2 px-3 whitespace-nowrap ${
                          col.align === 'right'
                            ? 'text-right font-mono tabular-nums text-slate-800'
                            : col.key === 'clientName' || col.key === 'pic'
                            ? 'font-medium text-slate-900'
                            : isFirstId || col.key === 'recordId' || col.key === 'date'
                            ? 'font-mono text-slate-700'
                            : 'text-slate-700'
                        } ${stickyTdCls}`}
                      >
                        {strVal}
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
  );
};
