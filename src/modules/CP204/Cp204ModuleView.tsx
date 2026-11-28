import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  FilePlus2,
  SlidersHorizontal,
  RefreshCw,
  MessageSquareText,
  CalendarRange,
  Trash2,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  CLIENT_STATUS_OPTIONS,
  ClientRecord,
  ColumnDef,
  Cp204Record,
  Cp204Revision,
  formatCurrencyRM,
  FYE_MONTHS,
  NavigationFilterPreset,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { RemarksPreviewCell } from '../../components/RemarksPreviewCell';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { useColumnVisibility, usePinnedColumnOffsets } from '../../hooks/useColumnVisibility';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { extractFyeMonth, formatDateDDMMYYYY } from '../../lib/deadlineUtils';
import {
  ACTIVE_COMPLIANCE_STATUS_FILTER,
  findClientRecordForRow,
  isExcludedComplianceClientStatus,
  matchesClientStatusFilterValue,
  normalizeClientIdKey,
} from '../../lib/jobUtils';
import { showToast } from '../../lib/toast';
import { ClientModal } from '../ClientMaster/ClientModal';
import {
  classifyCp204SubmissionStatus,
  CP204_SUBMISSION_FILTERS,
  Cp204SubmissionFilter,
  getRevisionForMonth,
} from './cp204Utils';
import { Cp204InitialQuickModal, Cp204RevisionQuickModal } from './Cp204QuickModals';
import { Cp204AdvancedModal, Cp204AdvancedTab } from './Cp204AdvancedModal';

// Compact 10-column default layout (9 data columns + Action) designed to fit 1280px–1440px without horizontal scroll
const CP204_COLUMNS: ColumnDef[] = [
  { key: 'client', label: 'Client ID / Company', defaultVisible: true },
  { key: 'fye', label: 'FYE', defaultVisible: true, align: 'center' },
  { key: 'ya', label: 'YA', defaultVisible: true, align: 'center' },
  { key: 'initialEstimate', label: 'CP204 Initial', defaultVisible: true, align: 'right' },
  { key: 'rev6', label: 'CP204A 6th', defaultVisible: true, align: 'right' },
  { key: 'rev9', label: 'CP204A 9th', defaultVisible: true, align: 'right' },
  { key: 'rev11', label: 'CP204A 11th', defaultVisible: true, align: 'right' },
  { key: 'followUpStatus', label: 'Follow-Up', defaultVisible: true },
  { key: 'pic', label: 'PIC', defaultVisible: true },
  { key: 'currentEstimatedTax', label: 'Current Est. Tax', defaultVisible: false, align: 'right', optional: true },
  { key: 'instalmentsSummary', label: 'Instalments', defaultVisible: false, optional: true },
  { key: 'reviewer', label: 'Reviewer', defaultVisible: false, optional: true },
  { key: 'statutoryDueDate', label: 'Statutory Due Date', defaultVisible: false, optional: true },
  { key: 'remarks', label: 'Remarks', defaultVisible: false, optional: true },
];

const CP204_COL_WIDTHS: Record<string, string> = {
  client: 'w-[210px] min-w-[185px] max-w-[235px]',
  fye: 'w-[50px] min-w-[46px]',
  ya: 'w-[56px] min-w-[52px]',
  initialEstimate: 'w-[122px] min-w-[112px]',
  rev6: 'w-[108px] min-w-[98px]',
  rev9: 'w-[108px] min-w-[98px]',
  rev11: 'w-[108px] min-w-[98px]',
  followUpStatus: 'w-[126px] min-w-[112px]',
  pic: 'w-[86px] min-w-[74px]',
  currentEstimatedTax: 'w-[128px] min-w-[118px]',
  instalmentsSummary: 'w-[108px] min-w-[100px]',
  reviewer: 'w-[96px] min-w-[88px]',
  statutoryDueDate: 'w-[112px] min-w-[104px]',
  remarks: 'w-[180px] min-w-[160px]',
};

const CP204_COL_FALLBACK_WIDTHS: Record<string, number> = {
  client: 210,
  fye: 50,
  ya: 56,
  initialEstimate: 122,
  rev6: 108,
  rev9: 108,
  rev11: 108,
  followUpStatus: 126,
  pic: 86,
  currentEstimatedTax: 128,
  instalmentsSummary: 108,
  reviewer: 96,
  statutoryDueDate: 112,
  remarks: 180,
};

function getFollowUpStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Follow-up required':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Up to date':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'CP204 submitted; revisions not recorded':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'On hold':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function getCompactFollowUpLabel(status: string): string {
  if (status === 'CP204 submitted; revisions not recorded') return 'CP204 Submitted';
  return status;
}

function formatRevisionExport(rev?: Cp204Revision): string {
  if (!rev) return '—';
  return `${formatCurrencyRM(rev.proposedEstimatedTax)} (${rev.reviewStatus})`;
}

interface Cp204ModuleViewProps {
  initialFilter?: NavigationFilterPreset | null;
}

export const Cp204ModuleView: React.FC<Cp204ModuleViewProps> = ({ initialFilter }) => {
  const { isReadOnly, isManagerOrAdmin } = useAuth();
  const { clients, cp204Records, deleteCp204, refreshAll, refreshing } = useData();
  const [profileClient, setProfileClient] = useState<ClientRecord | null>(null);

  const handleOpenClientProfile = (ref: { clientId?: string; clientName?: string }, directClient?: ClientRecord) => {
    const matched = directClient || findClientRecordForRow(clients, ref);
    if (matched) {
      setProfileClient(matched);
    } else {
      showToast('Client profile not found in Client Master.', 'warning', 2500);
    }
  };

  const [search, setSearch] = useState('');
  const [yaFilter, setYaFilter] = useState('');
  const [fyeFilter, setFyeFilter] = useState('');
  const [picFilter, setPicFilter] = useState('');
  const [clientStatusFilter, setClientStatusFilter] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState<'' | Cp204SubmissionFilter>('');
  const [showSpecialRemarks, setShowSpecialRemarks] = useState(false);

  const {
    visibleColumns,
    pinnedColumns,
    orderedColumns,
    activeColumns,
    pinnedActiveKeys,
    toggleColumn,
    togglePin,
    moveColumn,
    reorderColumn,
    resetColumns,
  } = useColumnVisibility('cp204', CP204_COLUMNS, ['client']);
  const { headerRowRef, getHeaderStickyProps, getCellStickyProps } = usePinnedColumnOffsets(
    pinnedActiveKeys,
    CP204_COL_FALLBACK_WIDTHS
  );

  useEffect(() => {
    if (!initialFilter) return;
    setFyeFilter(initialFilter.fye ?? '');
    setYaFilter(initialFilter.ya ?? '');
    setSearch(initialFilter.search ?? '');
    setClientStatusFilter(initialFilter.clientStatus ?? '');
    setPicFilter('');
    setSubmissionFilter('');
  }, [initialFilter?.nonce]);

  // Quick Initial Modal state
  const [initialModalOpen, setInitialModalOpen] = useState(false);
  const [prefillClientId, setPrefillClientId] = useState<string | undefined>(undefined);
  const [prefillYa, setPrefillYa] = useState<string | undefined>(undefined);

  // Quick Revision Modal state
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionParentId, setRevisionParentId] = useState<string | undefined>(undefined);

  // Advanced 4-Tab Modal state
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<Cp204AdvancedTab>('bulk');
  const [advancedRecordId, setAdvancedRecordId] = useState<string | undefined>(undefined);

  // Inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentYearStr = useMemo(() => String(new Date().getFullYear()), []);

  // Normalized Client ID lookup ("C 233" === "C233") for Client Status, FYE/PIC fallback & specialRemarks
  const clientByIdMap = useMemo(() => {
    const map = new Map<string, (typeof clients)[number]>();
    for (const c of clients) {
      if (c.clientId) {
        map.set(c.clientId, c);
        const norm = normalizeClientIdKey(c.clientId);
        if (norm) map.set(norm, c);
      }
    }
    return map;
  }, [clients]);

  const resolveMatchedClient = (rec: Cp204Record) =>
    clientByIdMap.get(normalizeClientIdKey(rec.clientId)) || clientByIdMap.get(rec.clientId);

  const resolveDisplayFye = (rec: Cp204Record) => {
    const client = resolveMatchedClient(rec);
    const raw = (rec.fye || client?.fye || '').trim();
    const num = extractFyeMonth(raw);
    return num !== null ? String(num) : raw;
  };

  const resolveDisplayPic = (rec: Cp204Record) => {
    const own = (rec.pic || '').trim();
    if (own) return own;
    const client = resolveMatchedClient(rec);
    return (client?.taxPic || '').trim();
  };

  const distinctYas = useMemo(() => {
    const set = new Set<string>([currentYearStr]);
    if (yaFilter) set.add(yaFilter);
    for (const r of cp204Records) {
      if (r.ya) set.add(r.ya.trim());
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [cp204Records, currentYearStr, yaFilter]);

  const distinctPics = useMemo(() => {
    const set = new Set<string>();
    for (const r of cp204Records) {
      const pic = resolveDisplayPic(r);
      if (pic) set.add(pic);
    }
    for (const c of clients) {
      if ((c.category === 'Corporate' || c.category === 'Other') && c.taxPic) {
        set.add(c.taxPic.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp204Records, clients, clientByIdMap]);

  const isMissingMode = submissionFilter === 'CP204 record missing';
  const targetMissingYa = yaFilter || currentYearStr;

  // Missing Corporate clients for targetMissingYa
  const missingClients = useMemo(() => {
    if (!isMissingMode) return [];
    const existingSet = new Set(
      cp204Records
        .filter((r) => (r.ya || '').trim() === targetMissingYa)
        .map((r) => normalizeClientIdKey(r.clientId))
        .filter(Boolean)
    );
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (c.category !== 'Corporate') return false;
      if (clientStatusFilter) {
        if (!matchesClientStatusFilterValue(c.clientStatus, clientStatusFilter)) return false;
      } else {
        if (isExcludedComplianceClientStatus(c.clientStatus)) {
          return false;
        }
      }
      if (existingSet.has(normalizeClientIdKey(c.clientId))) return false;
      if (fyeFilter && extractFyeMonth(c.fye) !== extractFyeMonth(fyeFilter)) return false;
      if (picFilter && (c.taxPic || '').trim() !== picFilter) return false;
      if (q) {
        const hay = `${c.clientName} ${c.clientId} ${c.taxPic || ''} ${c.specialRemarks || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    isMissingMode,
    cp204Records,
    targetMissingYa,
    clients,
    clientStatusFilter,
    fyeFilter,
    picFilter,
    search,
  ]);

  // Normal filtered CP204 records
  const filteredRecords = useMemo(() => {
    if (isMissingMode) return [];
    const q = search.trim().toLowerCase();
    return cp204Records.filter((rec) => {
      const client =
        clientByIdMap.get(normalizeClientIdKey(rec.clientId)) || clientByIdMap.get(rec.clientId);
      const effectiveFye = rec.fye || client?.fye || '';
      const effectivePic = (rec.pic || client?.taxPic || '').trim();
      if (yaFilter && (rec.ya || '').trim() !== yaFilter) return false;
      if (fyeFilter && extractFyeMonth(effectiveFye) !== extractFyeMonth(fyeFilter)) return false;
      if (picFilter && effectivePic !== picFilter) return false;
      if (
        clientStatusFilter &&
        !matchesClientStatusFilterValue(client?.clientStatus, clientStatusFilter)
      ) {
        return false;
      }
      if (submissionFilter) {
        const bucket = classifyCp204SubmissionStatus(rec, todayStr);
        if (bucket !== submissionFilter) return false;
      }
      if (q) {
        const hay = `${rec.cp204Id} ${rec.clientName} ${rec.clientId} ${rec.ya} ${effectivePic} ${rec.reviewer} ${rec.status} ${rec.remarks} ${client?.specialRemarks || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    isMissingMode,
    cp204Records,
    yaFilter,
    fyeFilter,
    picFilter,
    clientStatusFilter,
    submissionFilter,
    todayStr,
    search,
    clientByIdMap,
  ]);

  // Status-only column filter values for CP204 Initial, Follow-Up, and 6th/9th/11th Revisions
  const cp204ValueGetters = useMemo(
    () => ({
      client: (rec: Cp204Record) => `${rec.clientName} (${rec.clientId})`,
      fye: (rec: Cp204Record) => {
        const client =
          clientByIdMap.get(normalizeClientIdKey(rec.clientId)) ||
          clientByIdMap.get(rec.clientId);
        const m = extractFyeMonth(rec.fye || client?.fye);
        return m !== null ? String(m) : '';
      },
      ya: (rec: Cp204Record) => rec.ya,
      pic: (rec: Cp204Record) => {
        const client =
          clientByIdMap.get(normalizeClientIdKey(rec.clientId)) ||
          clientByIdMap.get(rec.clientId);
        return (rec.pic || client?.taxPic || '').trim();
      },
      initialEstimate: (rec: Cp204Record) => (rec.status || 'No CP204 record').trim(),
      followUpStatus: (rec: Cp204Record) => classifyCp204SubmissionStatus(rec, todayStr),
      rev6: (rec: Cp204Record) => {
        const rev = getRevisionForMonth(rec, '6');
        return rev ? (rev.reviewStatus || 'Pending Review').trim() : 'No CP204A revision';
      },
      rev9: (rec: Cp204Record) => {
        const rev = getRevisionForMonth(rec, '9');
        return rev ? (rev.reviewStatus || 'Pending Review').trim() : 'No CP204A revision';
      },
      rev11: (rec: Cp204Record) => {
        const rev = getRevisionForMonth(rec, '11');
        return rev ? (rev.reviewStatus || 'Pending Review').trim() : 'No CP204A revision';
      },
      currentEstimatedTax: (rec: Cp204Record) => rec.currentEstimatedTax,
      instalmentsSummary: (rec: Cp204Record) => {
        const paid = rec.instalments.filter(
          (i) => i.outstandingAmount === 0 && i.amountDue > 0
        ).length;
        return rec.instalments.length > 0 ? `${paid}/${rec.instalments.length} settled` : 'Not scheduled';
      },
      reviewer: (rec: Cp204Record) => rec.reviewer || '',
      statutoryDueDate: (rec: Cp204Record) => formatDateDDMMYYYY(rec.statutoryCp204DueDate),
      remarks: (rec: Cp204Record) => rec.remarks || '',
    }),
    [todayStr, clientByIdMap]
  );

  const missingValueGetters = useMemo(
    () => ({
      client: (c: (typeof clients)[number]) => `${c.clientName} (${c.clientId})`,
      fye: (c: (typeof clients)[number]) => {
        const m = extractFyeMonth(c.fye);
        return m !== null ? String(m) : '';
      },
      ya: () => targetMissingYa,
      pic: (c: (typeof clients)[number]) => c.taxPic || '',
      status: () => 'CP204 record missing',
    }),
    [targetMissingYa]
  );

  const excel = useExcelTableFilters(filteredRecords, cp204ValueGetters);
  const excelMissing = useExcelTableFilters(missingClients, missingValueGetters);
  const displayedRecords = excel.rows;
  const displayedMissing = excelMissing.rows;

  const totals = useMemo(() => {
    const initialSum = displayedRecords.reduce((s, r) => s + (r.originalEstimatedTax || 0), 0);
    const currentSum = displayedRecords.reduce((s, r) => s + (r.currentEstimatedTax || 0), 0);
    const followUpCount = cp204Records.filter(
      (r) => classifyCp204SubmissionStatus(r, todayStr) === 'Follow-up required'
    ).length;
    return { initialSum, currentSum, followUpCount };
  }, [displayedRecords, cp204Records, todayStr]);

  const hasActiveFilters = Boolean(
    search.trim() ||
      yaFilter ||
      fyeFilter ||
      picFilter ||
      clientStatusFilter ||
      submissionFilter ||
      excel.hasActiveColumnFilters ||
      excelMissing.hasActiveColumnFilters
  );

  const handleResetFilters = () => {
    setSearch('');
    setYaFilter('');
    setFyeFilter('');
    setPicFilter('');
    setClientStatusFilter('');
    setSubmissionFilter('');
    excel.resetColumnFilters();
    excelMissing.resetColumnFilters();
  };

  const buildExportData = () => {
    if (isMissingMode) {
      const cols = [
        { key: 'clientName', label: 'Company Name' },
        { key: 'clientId', label: 'Client ID' },
        { key: 'fye', label: 'FYE' },
        { key: 'ya', label: 'Missing YA' },
        { key: 'pic', label: 'Default PIC' },
        { key: 'specialRemarks', label: 'Special Remarks' },
      ];
      const rows = displayedMissing.map((c) => ({
        clientName: c.clientName,
        clientId: c.clientId,
        fye: c.fye ? Number(c.fye) : '—',
        ya: targetMissingYa,
        pic: c.taxPic || '—',
        specialRemarks: c.specialRemarks || '',
      }));
      return { cols, rows, subtitle: `Corporate Clients Missing CP204 Record for YA ${targetMissingYa}` };
    }

    const activeCols = activeColumns.map((c) => ({
      key: c.key,
      label: c.label,
    }));
    const rows = displayedRecords.map((rec) => {
      const rev6 = getRevisionForMonth(rec, '6');
      const rev9 = getRevisionForMonth(rec, '9');
      const rev11 = getRevisionForMonth(rec, '11');
      const instPaid = rec.instalments.filter((i) => i.outstandingAmount === 0 && i.amountDue > 0).length;
      const displayFye = resolveDisplayFye(rec);
      const displayPic = resolveDisplayPic(rec);
      const subDate = rec.originalSubmissionDate
        ? ` · ${formatDateDDMMYYYY(rec.originalSubmissionDate)}`
        : '';
      return {
        client: `${rec.clientName} (${rec.clientId})`,
        fye: displayFye || '—',
        ya: rec.ya,
        pic: displayPic || '—',
        initialEstimate: `${formatCurrencyRM(rec.originalEstimatedTax)} (${rec.status}${subDate})`,
        followUpStatus: classifyCp204SubmissionStatus(rec, todayStr),
        rev6: formatRevisionExport(rev6),
        rev9: formatRevisionExport(rev9),
        rev11: formatRevisionExport(rev11),
        currentEstimatedTax: formatCurrencyRM(rec.currentEstimatedTax),
        instalmentsSummary: `${instPaid}/${rec.instalments.length} settled`,
        reviewer: rec.reviewer || '—',
        statutoryDueDate: formatDateDDMMYYYY(rec.statutoryCp204DueDate),
        remarks: rec.remarks || '',
      };
    });
    return {
      cols: activeCols,
      rows,
      subtitle: `CP204 Corporate Tax Estimate Register (${displayedRecords.length} records)`,
    };
  };

  const handleExportExcel = () => {
    const { cols, rows } = buildExportData();
    exportToExcel(`TPMS_CP204_Register_${todayStr}`, 'CP204 Register', cols, rows);
  };

  const handlePrint = () => {
    const { cols, rows, subtitle } = buildExportData();
    printRegisterHtml('CP204 Monitoring', subtitle, cols, rows, false);
  };

  const handleSavePdf = () => {
    const { cols, rows, subtitle } = buildExportData();
    printRegisterHtml('CP204 Monitoring', subtitle, cols, rows, true);
  };

  const openQuickInitial = (cId?: string, y?: string) => {
    setPrefillClientId(cId);
    setPrefillYa(y);
    setInitialModalOpen(true);
  };

  const openQuickRevision = (recordId?: string) => {
    setRevisionParentId(recordId);
    setRevisionModalOpen(true);
  };

  const openAdvanced = (tab: Cp204AdvancedTab, recordId?: string) => {
    setAdvancedTab(tab);
    setAdvancedRecordId(recordId);
    setAdvancedModalOpen(true);
  };

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCp204(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const renderRevisionCell = (rev?: Cp204Revision) => {
    if (!rev) {
      return <span className="text-slate-400 text-[11px]">—</span>;
    }
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono tabular-nums text-[11px] font-medium text-slate-900">
          {formatCurrencyRM(rev.proposedEstimatedTax)}
        </span>
        <StatusPill group="CP204_STATUS" value={rev.reviewStatus} />
      </div>
    );
  };

  return (
    <div className="space-y-3.5">
      {/* Page Header & Top Action Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-lg text-slate-900 tracking-tight">
            CP204 Monitoring
          </h1>
          <p className="text-xs text-slate-500">
            Corporate tax estimates, 6th / 9th / 11th month CP204A revisions, and monthly LHDN instalment tracking
          </p>
        </div>

        {/* Dedicated CP204 Top Action Bar */}
        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => setShowSpecialRemarks((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
              showSpecialRemarks
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            {showSpecialRemarks ? 'Hide Special Remarks' : 'Show Special Remarks'}
          </button>

          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={() => openQuickInitial(undefined, yaFilter || undefined)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add CP204 Initial Estimate
              </button>

              <button
                type="button"
                onClick={() => openQuickRevision(undefined)}
                disabled={cp204Records.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Add CP204A Revision
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => openAdvanced('bulk', filteredRecords[0]?.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            Advanced Data Entry &amp; Detailed Records
          </button>

          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh tracker
          </button>
        </div>
      </div>

      {/* Compact Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Tracked CP204 Records</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-slate-900">
            {cp204Records.length.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Follow-Up Required</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-amber-700">
            {totals.followUpCount.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Filtered Initial Estimates</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-slate-800">
            {formatCurrencyRM(totals.initialSum)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Filtered Current Est. Tax</div>
          <div className="mt-0.5 font-mono tabular-nums text-base font-bold text-teal-800">
            {formatCurrencyRM(totals.currentSum)}
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search company, Client ID, CP204 ID, PIC, or remarks..."
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
        columns={orderedColumns}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        pinnedColumns={pinnedColumns}
        onTogglePin={togglePin}
        onMoveColumn={moveColumn}
        onReorderColumn={reorderColumn}
        onExportExcel={handleExportExcel}
        onPrint={handlePrint}
        onSavePdf={handleSavePdf}
        recordCount={isMissingMode ? displayedMissing.length : displayedRecords.length}
        totalCount={isMissingMode ? missingClients.length : cp204Records.length}
        summaryText={
          isMissingMode
            ? `${displayedMissing.length} corporate client(s) missing CP204 for YA ${targetMissingYa}`
            : `Showing ${displayedRecords.length.toLocaleString()} of ${cp204Records.length.toLocaleString()} CP204 records`
        }
        filters={
          <>
            <select
              value={yaFilter}
              onChange={(e) => setYaFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All YA</option>
              {distinctYas.map((y) => (
                <option key={y} value={y}>
                  YA {y}
                </option>
              ))}
            </select>

            <select
              value={fyeFilter}
              onChange={(e) => setFyeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All FYE</option>
              {FYE_MONTHS.map((m) => (
                <option key={m} value={m}>
                  FYE {Number(m)}
                </option>
              ))}
            </select>

            <select
              value={picFilter}
              onChange={(e) => setPicFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All PIC</option>
              {distinctPics.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={clientStatusFilter}
              onChange={(e) => setClientStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Client Statuses</option>
              <option value={ACTIVE_COMPLIANCE_STATUS_FILTER}>
                Active &amp; WIP (Non-Resigned)
              </option>
              {CLIENT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={submissionFilter}
              onChange={(e) => setSubmissionFilter(e.target.value as '' | Cp204SubmissionFilter)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Submission Statuses</option>
              {CP204_SUBMISSION_FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </>
        }
      />

      {/* Register Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {isMissingMode ? (
          <div>
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Showing active &amp; WIP Corporate clients without a CP204 record for{' '}
                  <strong className="font-mono">YA {targetMissingYa}</strong>
                  {!yaFilter ? ' (select a specific YA filter above to check another year)' : ''}.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSubmissionFilter('')}
                className="text-xs font-semibold text-amber-800 hover:underline"
              >
                Return to CP204 Register
              </button>
            </div>

            <div className="max-h-[calc(100vh-64px)] overflow-auto relative border-t border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm border-b border-slate-200 text-slate-700">
                  <tr>
                    {(
                      [
                        {
                          key: 'client',
                          label: 'Client ID / Company',
                          width:
                            'w-[240px] min-w-[210px] sticky top-0 left-0 z-30 bg-slate-50 shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]',
                        },
                        { key: 'fye', label: 'FYE', width: 'w-[56px] sticky top-0 z-20 bg-slate-50 text-center' },
                        { key: 'ya', label: 'Missing YA', width: 'w-[84px] sticky top-0 z-20 bg-slate-50 text-center' },
                        { key: 'pic', label: 'PIC', width: 'w-[100px] sticky top-0 z-20 bg-slate-50' },
                        { key: 'status', label: 'Status', width: 'w-[155px] sticky top-0 z-20 bg-slate-50' },
                      ] as const
                    ).map((col) => (
                      <th
                        key={col.key}
                        className={`px-2.5 py-2 text-left text-xs font-semibold whitespace-nowrap border-b border-slate-200 ${col.width}`}
                      >
                        <ExcelColumnFilter
                          columnKey={col.key}
                          title={col.label}
                          values={excelMissing.getColumnValues(col.key)}
                          selectedValues={excelMissing.columnFilters[col.key]}
                          onChangeSelected={(next) => excelMissing.setColumnFilter(col.key, next)}
                          sortDirection={
                            excelMissing.sortState?.key === col.key
                              ? excelMissing.sortState.direction
                              : null
                          }
                          onSort={(dir) => excelMissing.setColumnSort(col.key, dir)}
                        />
                      </th>
                    ))}
                    <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-right text-xs font-semibold whitespace-nowrap border-b border-slate-200 w-[110px]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedMissing.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        All in-scope Corporate clients already have a CP204 record for YA{' '}
                        {targetMissingYa}.
                      </td>
                    </tr>
                  ) : (
                    displayedMissing.map((client) => (
                      <tr key={client.id} className="group hover:bg-slate-50">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 w-[240px] min-w-[210px] px-2.5 py-2 shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]">
                          <button
                            type="button"
                            onClick={() => handleOpenClientProfile({}, client)}
                            className="text-left font-medium text-slate-900 leading-snug hover:underline hover:text-teal-700 cursor-pointer block"
                            title={`${client.clientName} — Click to open Client Profile`}
                          >
                            {client.clientName}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenClientProfile({}, client)}
                            className="text-[11px] font-mono text-slate-400 hover:underline hover:text-teal-700 cursor-pointer block"
                          >
                            {client.clientId}
                          </button>
                          {showSpecialRemarks && client.specialRemarks && (
                            <div className="mt-1 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                              <RemarksPreviewCell
                                text={client.specialRemarks}
                                recordTitle={client.clientName}
                                recordId={client.clientId}
                                fieldLabel="Client Special Remarks"
                                maxWidthClass="max-w-[175px]"
                                textClassName="text-amber-900"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-center font-mono text-slate-700 whitespace-nowrap">
                          {client.fye ? Number(client.fye) : '—'}
                        </td>
                        <td className="px-2.5 py-2 text-center font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {targetMissingYa}
                        </td>
                        <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">
                          {client.taxPic || '—'}
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            CP204 record missing
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-right whitespace-nowrap">
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => openQuickInitial(client.clientId, targetMissingYa)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded"
                            >
                              <Plus className="w-3 h-3" />
                              Add CP204
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-64px)] overflow-auto relative">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm border-b border-slate-200 text-slate-700">
                <tr ref={headerRowRef}>
                  {activeColumns.map((col) => {
                    const stickyTh = getHeaderStickyProps(col.key);
                    const alignCls =
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';
                    return (
                      <th
                        key={col.key}
                        data-pinned-col={stickyTh['data-pinned-col']}
                        style={stickyTh.style}
                        className={`px-2.5 py-2 text-xs font-semibold whitespace-nowrap border-b border-slate-200 ${alignCls} ${
                          CP204_COL_WIDTHS[col.key] || 'min-w-[100px]'
                        } ${stickyTh.className}`}
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
                  <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-right text-xs font-semibold whitespace-nowrap border-b border-slate-200 w-[116px] min-w-[108px] no-print">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumns.length + 1} className="px-4 py-12 text-center text-slate-500">
                      {cp204Records.length === 0
                        ? 'No CP204 records yet. Click "+ Add CP204 Initial Estimate" or "Advanced Data Entry & Detailed Records" to bulk-create YA schedules.'
                        : 'No CP204 records match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  displayedRecords.map((rec: Cp204Record) => {
                    const client = resolveMatchedClient(rec);
                    const displayFye = resolveDisplayFye(rec);
                    const displayPic = resolveDisplayPic(rec);
                    const rev6 = getRevisionForMonth(rec, '6');
                    const rev9 = getRevisionForMonth(rec, '9');
                    const rev11 = getRevisionForMonth(rec, '11');
                    const followUpBucket = classifyCp204SubmissionStatus(rec, todayStr);
                    const settledInstCount = rec.instalments.filter(
                      (i) => i.outstandingAmount === 0 && i.amountDue > 0
                    ).length;

                    return (
                      <tr key={rec.id} className="group hover:bg-slate-50 align-top">
                        {activeColumns.map((col) => {
                          const key = col.key;
                          const stickyTd = getCellStickyProps(key);
                          const colWidth = CP204_COL_WIDTHS[key] || 'min-w-[100px]';
                          const wrapTd = (cls: string, content: React.ReactNode) => (
                            <td
                              key={key}
                              style={stickyTd.style}
                              className={`${cls} ${colWidth} ${stickyTd.className}`}
                            >
                              {content}
                            </td>
                          );

                          switch (key) {
                            case 'client':
                              return wrapTd(
                                'px-2.5 py-2',
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenClientProfile(
                                        { clientId: rec.clientId, clientName: rec.clientName },
                                        client
                                      )
                                    }
                                    className="text-left font-medium text-slate-900 leading-snug line-clamp-2 hover:underline hover:text-teal-700 cursor-pointer block"
                                    title={`${rec.clientName} — Click to open Client Profile`}
                                  >
                                    {rec.clientName}
                                  </button>
                                  <div className="text-[11px] text-slate-400 font-mono truncate">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenClientProfile(
                                          { clientId: rec.clientId, clientName: rec.clientName },
                                          client
                                        )
                                      }
                                      className="hover:underline hover:text-teal-700 cursor-pointer"
                                    >
                                      {rec.clientId}
                                    </button>
                                    {rec.cp204Id ? ` · ${rec.cp204Id}` : ''}
                                  </div>
                                  {showSpecialRemarks && client?.specialRemarks && (
                                    <div className="mt-1 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-snug">
                                      <RemarksPreviewCell
                                        text={client.specialRemarks}
                                        recordTitle={rec.clientName}
                                        recordId={rec.clientId}
                                        fieldLabel="Client Special Remarks"
                                        maxWidthClass="max-w-[175px]"
                                        textClassName="text-amber-900"
                                      />
                                    </div>
                                  )}
                                </>
                              );
                            case 'fye':
                              return wrapTd(
                                'px-2.5 py-2 text-center font-mono text-slate-700 whitespace-nowrap',
                                displayFye || '—'
                              );
                            case 'ya':
                              return wrapTd(
                                'px-2.5 py-2 text-center font-mono font-semibold text-slate-900 whitespace-nowrap',
                                rec.ya
                              );
                            case 'initialEstimate':
                              return wrapTd(
                                'px-2.5 py-2 text-right whitespace-nowrap',
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-mono tabular-nums text-[11px] font-medium text-slate-900">
                                    {formatCurrencyRM(rec.originalEstimatedTax)}
                                  </span>
                                  <StatusPill group="CP204_STATUS" value={rec.status} />
                                  {rec.originalSubmissionDate && (
                                    <span className="text-[10px] font-mono text-slate-400 leading-none">
                                      {formatDateDDMMYYYY(rec.originalSubmissionDate)}
                                    </span>
                                  )}
                                </div>
                              );
                            case 'rev6':
                              return wrapTd(
                                'px-2.5 py-2 text-right whitespace-nowrap',
                                renderRevisionCell(rev6)
                              );
                            case 'rev9':
                              return wrapTd(
                                'px-2.5 py-2 text-right whitespace-nowrap',
                                renderRevisionCell(rev9)
                              );
                            case 'rev11':
                              return wrapTd(
                                'px-2.5 py-2 text-right whitespace-nowrap',
                                renderRevisionCell(rev11)
                              );
                            case 'followUpStatus':
                              return wrapTd(
                                'px-2.5 py-2 whitespace-nowrap',
                                <span
                                  title={followUpBucket}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getFollowUpStatusBadgeClass(
                                    followUpBucket
                                  )}`}
                                >
                                  {getCompactFollowUpLabel(followUpBucket)}
                                </span>
                              );
                            case 'pic':
                              return wrapTd(
                                'px-2.5 py-2 text-slate-700 whitespace-nowrap truncate max-w-[96px]',
                                <span title={displayPic || '—'}>{displayPic || '—'}</span>
                              );
                            case 'currentEstimatedTax':
                              return wrapTd(
                                'px-2.5 py-2 text-right whitespace-nowrap',
                                <span className="font-mono tabular-nums font-bold text-teal-900">
                                  {formatCurrencyRM(rec.currentEstimatedTax)}
                                </span>
                              );
                            case 'instalmentsSummary':
                              return wrapTd(
                                'px-2.5 py-2 whitespace-nowrap font-mono text-[11px] text-slate-600',
                                rec.instalments.length > 0
                                  ? `${settledInstCount}/${rec.instalments.length} settled`
                                  : 'Not scheduled'
                              );
                            case 'reviewer':
                              return wrapTd(
                                'px-2.5 py-2 text-slate-700 whitespace-nowrap',
                                rec.reviewer || '—'
                              );
                            case 'statutoryDueDate':
                              return wrapTd(
                                'px-2.5 py-2 font-mono text-slate-700 whitespace-nowrap',
                                formatDateDDMMYYYY(rec.statutoryCp204DueDate)
                              );
                            case 'remarks':
                              return wrapTd(
                                'px-2.5 py-2 whitespace-nowrap',
                                <RemarksPreviewCell
                                  text={rec.remarks}
                                  recordTitle={rec.clientName}
                                  recordId={rec.cp204Id || rec.clientId}
                                  fieldLabel="CP204 Remarks"
                                />
                              );
                            default:
                              return wrapTd('px-2.5 py-2 text-slate-600 whitespace-nowrap', '—');
                          }
                        })}
                        <td className="px-2.5 py-2 text-right whitespace-nowrap no-print">
                          {confirmDeleteId === rec.id ? (
                            <div className="inline-flex items-center gap-1">
                              <span className="text-[11px] text-rose-700 font-medium mr-0.5">
                                Del?
                              </span>
                              <button
                                type="button"
                                disabled={deletingId === rec.id}
                                onClick={() => void handleConfirmDelete(rec.id)}
                                className="p-1 rounded bg-rose-600 text-white hover:bg-rose-700"
                                title="Confirm delete"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300"
                                title="Cancel"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openAdvanced('initial', rec.id)}
                                className="px-2 py-0.5 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded"
                                title="Open CP204 Master & Revisions"
                              >
                                Open
                              </button>
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => openQuickRevision(rec.id)}
                                  className="p-1 text-sky-700 hover:bg-sky-50 rounded"
                                  title="Add CP204A Revision"
                                >
                                  <FilePlus2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openAdvanced('instalments', rec.id)}
                                className="p-1 text-indigo-700 hover:bg-indigo-50 rounded"
                                title="Open Monthly Instalments Tracker"
                              >
                                <CalendarRange className="w-3.5 h-3.5" />
                              </button>
                              {isManagerOrAdmin && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(rec.id)}
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                  title="Delete CP204 record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <Cp204InitialQuickModal
        open={initialModalOpen}
        prefillClientId={prefillClientId}
        prefillYa={prefillYa}
        onClose={() => setInitialModalOpen(false)}
      />

      <Cp204RevisionQuickModal
        open={revisionModalOpen}
        preselectedRecordId={revisionParentId}
        onClose={() => setRevisionModalOpen(false)}
      />

      <Cp204AdvancedModal
        open={advancedModalOpen}
        initialTab={advancedTab}
        initialRecordId={advancedRecordId}
        onClose={() => setAdvancedModalOpen(false)}
      />

      <ClientModal
        open={Boolean(profileClient)}
        client={profileClient}
        onClose={() => setProfileClient(null)}
      />
    </div>
  );
};
