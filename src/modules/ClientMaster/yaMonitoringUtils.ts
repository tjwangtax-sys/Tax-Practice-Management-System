import {
  ClientRecord,
  Cp204Record,
  TaxJob,
  YaMonitoringItem,
  formatCurrencyRM,
  safeNum,
} from '../../types/tpms';
import {
  DeadlineStage,
  analyzeJobDeadlines,
  extractYaYear,
  formatDateDDMMYYYY,
  formatOverdueLabel,
  getDeadlineStageBadge,
  getOverdueDays,
  isIsoDateString,
  normalizeClientIdKey,
} from '../../lib/jobUtils';
import { computeCp204CurrentEstimatedTax, normalizeCp204Revisions } from '../CP204/cp204Utils';
import { printHtml } from '../../lib/exportUtils';

export interface ConsolidatedYaRow {
  rowKey: string;
  ya: string;
  yaSortNum: number;
  yaSequence: string;
  source: 'Linked' | 'Manual / Prior Agent';
  hasLinkedRecords: boolean;
  manualItem?: YaMonitoringItem;
  // Form C / Corporate (or Individual) pillar
  formType: string;
  finalDeadline: string;
  deadlineStage: DeadlineStage | null;
  overdueDays: number;
  formCSubmittedDate: string;
  formCStatus: string;
  mitrsStatus: string;
  jobStatus: string;
  // CP204 / CP204A pillar
  cp204Mode: 'amount' | 'sme-exempt' | 'na';
  cp204Estimate: number | null;
  cp204Label: string; // e.g., "Original CP204", "CP204A (9th Mth)", "Manual"
  cp204Status: string;
  // Balance Tax & Section 107C variance check
  totalTax: number | null;
  cp204Payment: number | null;
  underEstimatePenalty: number | null;
  finalTaxPayable: number | null;
  hasSection107CVariance: boolean;
  variancePct: number | null;
  // Form E pillar
  formEStatus: string;
  formESubmissionDate: string;
  hasFormE: boolean;
  // Combined notes
  remarks: string;
}

export interface ClientPrintSummary {
  clientId: string;
  clientName: string;
  tin: string;
  companyNo: string;
  fye: string;
  smeStatus: string;
  taxPic: string;
  clientStatus: string;
}

export function normalizeYaKey(raw?: string | null): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const yr = extractYaYear(s);
  return yr !== null ? String(yr) : s;
}

function parseOptionalMoney(raw?: string | number | null): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const cleaned = raw.replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function getLatestApprovedRevisionLabel(rec: Cp204Record): string {
  const revs = normalizeCp204Revisions(rec.revisions);
  const effectiveRevs = revs
    .filter((r) => r.reviewStatus === 'Approved' || r.reviewStatus === 'Submitted')
    .sort((a, b) => Number(b.revisionMonth) - Number(a.revisionMonth));
  if (effectiveRevs.length > 0) {
    const m = effectiveRevs[0].revisionMonth;
    const suffix = m === '6' ? '6th' : m === '9' ? '9th' : '11th';
    return `CP204A (${suffix} Mth)`;
  }
  return 'Original CP204';
}

function isSmeExemptText(text: string): boolean {
  const norm = text.toLowerCase();
  return (
    norm.includes('sme exempt') ||
    norm.includes('sme 2-yr exempt') ||
    norm.includes('sme 2 yr exempt') ||
    norm.includes('sme 2-year exempt') ||
    norm.includes('exempt (sme)')
  );
}

function isFormEJob(j: TaxJob): boolean {
  return j.module === 'Form E' || j.jobType === 'Form E';
}

function isPrimaryReturnJob(j: TaxJob, category: ClientRecord['category']): boolean {
  if (j.module === 'Corporate' || j.jobType === 'Form C' || j.jobType === 'MITRS') {
    return true;
  }
  if (
    category === 'Individual' &&
    (j.module === 'Individual' ||
      ['Form B', 'Form BE', 'Form M', 'Form P'].includes(j.jobType || ''))
  ) {
    return true;
  }
  return false;
}

function pickBestPrimaryJob(candidates: TaxJob[]): TaxJob | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    // Prefer Form C over MITRS-only stub
    const aIsFormC = a.jobType === 'Form C' ? 1 : 0;
    const bIsFormC = b.jobType === 'Form C' ? 1 : 0;
    if (aIsFormC !== bIsFormC) return bIsFormC - aIsFormC;
    const aDone = a.status === 'Completed' ? 1 : 0;
    const bDone = b.status === 'Completed' ? 1 : 0;
    if (aDone !== bDone) return bDone - aDone;
    const aSec = a.updatedAt?.seconds ?? a.createdAt?.seconds ?? 0;
    const bSec = b.updatedAt?.seconds ?? b.createdAt?.seconds ?? 0;
    return bSec - aSec;
  })[0];
}

function pickBestFormEJob(candidates: TaxJob[]): TaxJob | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    const aSub =
      (a.formEStatus || a.submissionStatus || a.status || '').toLowerCase().includes('submit') ||
      (a.status || '').toLowerCase() === 'completed'
        ? 1
        : 0;
    const bSub =
      (b.formEStatus || b.submissionStatus || b.status || '').toLowerCase().includes('submit') ||
      (b.status || '').toLowerCase() === 'completed'
        ? 1
        : 0;
    if (aSub !== bSub) return bSub - aSub;
    const aSec = a.updatedAt?.seconds ?? a.createdAt?.seconds ?? 0;
    const bSec = b.updatedAt?.seconds ?? b.createdAt?.seconds ?? 0;
    return bSec - aSec;
  })[0];
}

export function buildConsolidatedYaSchedule(params: {
  clientDocId?: string;
  clientId: string;
  category: ClientRecord['category'];
  fye: string;
  smeStatus: string;
  firstYa: string;
  secondYa: string;
  manualItems: YaMonitoringItem[];
  jobs: TaxJob[];
  cp204Records: Cp204Record[];
}): ConsolidatedYaRow[] {
  const {
    clientDocId,
    clientId,
    category,
    fye,
    smeStatus,
    firstYa,
    secondYa,
    manualItems,
    jobs,
    cp204Records,
  } = params;

  const normClientId = normalizeClientIdKey(clientId);
  const firstYaKey = normalizeYaKey(firstYa);
  const secondYaKey = normalizeYaKey(secondYa);
  const isSmeClient = (smeStatus || '').trim().toLowerCase() === 'sme';
  const todayIso = new Date().toISOString().slice(0, 10);

  const jobMatchesClient = (j: TaxJob): boolean => {
    if (clientDocId && j.clientDocId && j.clientDocId === clientDocId) return true;
    if (normClientId && normalizeClientIdKey(j.clientId) === normClientId) return true;
    return false;
  };

  const cp204MatchesClient = (r: Cp204Record): boolean => {
    if (!normClientId) return false;
    return normalizeClientIdKey(r.clientId) === normClientId;
  };

  // Group live records by normalized YA
  const primaryJobsByYa = new Map<string, TaxJob[]>();
  const formEJobsByYa = new Map<string, TaxJob[]>();
  const cp204JobsByYa = new Map<string, TaxJob>();
  const cp204RecordsByYa = new Map<string, Cp204Record>();
  const manualByYa = new Map<string, YaMonitoringItem>();
  const blankYaManuals: YaMonitoringItem[] = [];

  for (const j of jobs) {
    if (!jobMatchesClient(j)) continue;
    const yaKey = normalizeYaKey(j.ya);
    if (!yaKey) continue;

    if (isFormEJob(j)) {
      const list = formEJobsByYa.get(yaKey) ?? [];
      list.push(j);
      formEJobsByYa.set(yaKey, list);
    } else if (j.module === 'CP204' || j.jobType === 'CP204' || j.jobType === 'CP204A') {
      if (!cp204JobsByYa.has(yaKey)) cp204JobsByYa.set(yaKey, j);
    } else if (isPrimaryReturnJob(j, category)) {
      const list = primaryJobsByYa.get(yaKey) ?? [];
      list.push(j);
      primaryJobsByYa.set(yaKey, list);
    }
  }

  for (const rec of cp204Records) {
    if (!cp204MatchesClient(rec)) continue;
    const yaKey = normalizeYaKey(rec.ya);
    if (!yaKey) continue;
    const existing = cp204RecordsByYa.get(yaKey);
    if (!existing) {
      cp204RecordsByYa.set(yaKey, rec);
    } else {
      const existingSec = existing.updatedAt?.seconds ?? existing.createdAt?.seconds ?? 0;
      const nextSec = rec.updatedAt?.seconds ?? rec.createdAt?.seconds ?? 0;
      if (nextSec >= existingSec) cp204RecordsByYa.set(yaKey, rec);
    }
  }

  for (const m of manualItems) {
    const yaKey = normalizeYaKey(m.ya);
    if (!yaKey) {
      blankYaManuals.push(m);
    } else if (!manualByYa.has(yaKey)) {
      manualByYa.set(yaKey, m);
    }
  }

  const allYaKeys = new Set<string>([
    ...primaryJobsByYa.keys(),
    ...formEJobsByYa.keys(),
    ...cp204JobsByYa.keys(),
    ...cp204RecordsByYa.keys(),
    ...manualByYa.keys(),
  ]);

  const rows: ConsolidatedYaRow[] = [];

  for (const yaKey of allYaKeys) {
    const primaryJob = pickBestPrimaryJob(primaryJobsByYa.get(yaKey) ?? []);
    const formEJob = pickBestFormEJob(formEJobsByYa.get(yaKey) ?? []);
    const cp204Rec = cp204RecordsByYa.get(yaKey);
    const cp204Job = cp204JobsByYa.get(yaKey);
    const manual = manualByYa.get(yaKey);

    const hasLinkedRecords = Boolean(primaryJob || formEJob || cp204Rec || cp204Job);
    const source: 'Linked' | 'Manual / Prior Agent' = hasLinkedRecords
      ? 'Linked'
      : 'Manual / Prior Agent';

    // YA Sequence
    let yaSequence = (primaryJob?.yaSequence || manual?.yaSequence || '').trim();
    if (!yaSequence) {
      if (firstYaKey && yaKey === firstYaKey) yaSequence = '1st';
      else if (secondYaKey && yaKey === secondYaKey) yaSequence = '2nd';
    }

    // Form C & MITRS
    let finalDeadline = '';
    let deadlineStage: DeadlineStage | null = null;
    let overdueDays = 0;
    let formCSubmittedDate = '';
    let formCStatus = '';
    let mitrsStatus = '';
    let jobStatus = '';
    let formType = category === 'Individual' ? 'Form B' : 'Form C';

    if (primaryJob) {
      const effectiveFye = (primaryJob.fye || primaryJob.companyFye || fye || '').trim();
      const analysis = analyzeJobDeadlines(
        effectiveFye && !primaryJob.fye ? { ...primaryJob, fye: effectiveFye } : primaryJob
      );
      finalDeadline =
        analysis.finalApplicableDeadline ||
        primaryJob.finalApplicableDeadline ||
        primaryJob.dueDate ||
        '';
      deadlineStage = getDeadlineStageBadge(analysis.winningRule);
      overdueDays = getOverdueDays(finalDeadline, primaryJob.status, todayIso);
      formCSubmittedDate =
        primaryJob.formCSubmissionDate || primaryJob.submissionDate || '';
      formCStatus = (primaryJob.formCStatus || primaryJob.submissionStatus || '').trim();
      mitrsStatus = (primaryJob.mitrsStatus || '').trim();
      jobStatus = (primaryJob.status || '').trim();
      formType = primaryJob.jobType || primaryJob.formType || formType;
    } else if (manual) {
      finalDeadline = (manual.filingDueDate || '').trim();
      formCSubmittedDate = (manual.submissionDate || '').trim();
      formCStatus = (manual.yaStatus || '').trim();
      mitrsStatus = (manual.mitrsStatus || '').trim();
      jobStatus = (manual.yaStatus || '').trim();
      formType = manual.formType || formType;
      const statusLower = jobStatus.toLowerCase();
      const isManualClosed =
        statusLower === 'filed' ||
        statusLower === 'submitted' ||
        statusLower === 'completed' ||
        statusLower.includes('exempt');
      if (finalDeadline && !isManualClosed) {
        overdueDays = getOverdueDays(finalDeadline, jobStatus, todayIso);
      }
    }

    // CP204 / CP204A Estimate
    let cp204Mode: 'amount' | 'sme-exempt' | 'na' = 'na';
    let cp204Estimate: number | null = null;
    let cp204Label = '';
    let cp204Status = '';

    const isFirstOrSecondYa =
      yaSequence.toLowerCase().startsWith('1') ||
      yaSequence.toLowerCase().startsWith('2') ||
      (Boolean(firstYaKey) && yaKey === firstYaKey) ||
      (Boolean(secondYaKey) && yaKey === secondYaKey);

    if (cp204Rec) {
      cp204Status = (cp204Rec.status || '').trim();
      const computedLatest = computeCp204CurrentEstimatedTax(
        cp204Rec.originalEstimatedTax,
        cp204Rec.revisions
      );
      const effectiveEst =
        safeNum(cp204Rec.currentEstimatedTax) > 0
          ? safeNum(cp204Rec.currentEstimatedTax)
          : computedLatest;

      if (
        effectiveEst <= 0 &&
        isSmeExemptText(`${cp204Rec.status || ''} ${cp204Rec.remarks || ''}`)
      ) {
        cp204Mode = 'sme-exempt';
        cp204Label = 'SME Exempt';
      } else {
        cp204Mode = 'amount';
        cp204Estimate = effectiveEst;
        cp204Label = getLatestApprovedRevisionLabel(cp204Rec);
      }
    } else if (cp204Job) {
      cp204Status = (cp204Job.status || '').trim();
      const jobEst =
        safeNum(cp204Job.cp204Revised11th) ||
        safeNum(cp204Job.cp204Revised9th) ||
        safeNum(cp204Job.cp204Revised6th) ||
        safeNum(cp204Job.cp204Estimate);
      if (jobEst <= 0 && isSmeExemptText(`${cp204Job.status || ''} ${cp204Job.remarks || ''}`)) {
        cp204Mode = 'sme-exempt';
        cp204Label = 'SME Exempt';
      } else if (jobEst > 0) {
        cp204Mode = 'amount';
        cp204Estimate = jobEst;
        cp204Label = cp204Job.cp204Revised11th
          ? 'CP204A (11th Mth)'
          : cp204Job.cp204Revised9th
          ? 'CP204A (9th Mth)'
          : cp204Job.cp204Revised6th
          ? 'CP204A (6th Mth)'
          : 'Original CP204';
      }
    } else if (manual) {
      if (manual.cp204Exempt) {
        cp204Mode = 'sme-exempt';
        cp204Label = 'SME Exempt';
      } else {
        const parsedManualCp = parseOptionalMoney(manual.cp204Estimate);
        if (parsedManualCp !== null) {
          cp204Mode = 'amount';
          cp204Estimate = parsedManualCp;
          cp204Label = 'Prior Agent';
        } else if (isSmeClient && isFirstOrSecondYa) {
          cp204Mode = 'sme-exempt';
          cp204Label = 'SME 2-Yr Exempt';
        }
      }
    } else if (isSmeClient && isFirstOrSecondYa) {
      cp204Mode = 'sme-exempt';
      cp204Label = 'SME 2-Yr Exempt';
    }

    // Total Tax, Less CP204 Payment, Under Estimate Penalty, Balance Tax Payable & Section 107C(10) >30% Variance Check
    let totalTax: number | null = null;
    let cp204Payment: number | null = null;
    let underEstimatePenalty: number | null = null;
    let finalTaxPayable: number | null = null;

    if (primaryJob) {
      if (
        primaryJob.totalTax !== undefined &&
        primaryJob.totalTax !== null &&
        Number.isFinite(Number(primaryJob.totalTax)) &&
        Number(primaryJob.totalTax) > 0
      ) {
        totalTax = Number(primaryJob.totalTax);
      }
      if (
        primaryJob.cp204Payment !== undefined &&
        primaryJob.cp204Payment !== null &&
        Number.isFinite(Number(primaryJob.cp204Payment)) &&
        Number(primaryJob.cp204Payment) > 0
      ) {
        cp204Payment = Number(primaryJob.cp204Payment);
      }
      if (
        primaryJob.underEstimatePenalty !== undefined &&
        primaryJob.underEstimatePenalty !== null &&
        Number.isFinite(Number(primaryJob.underEstimatePenalty)) &&
        Number(primaryJob.underEstimatePenalty) > 0
      ) {
        underEstimatePenalty = Number(primaryJob.underEstimatePenalty);
      }
      const rawTax = primaryJob.finalTaxPayable ?? primaryJob.taxPayable;
      if (rawTax !== undefined && rawTax !== null && Number.isFinite(Number(rawTax))) {
        finalTaxPayable = Number(rawTax);
      }
    } else if (manual) {
      const parsedTotal = parseOptionalMoney(manual.totalTax);
      if (parsedTotal !== null && parsedTotal > 0) totalTax = parsedTotal;
      const parsedCp204Pay = parseOptionalMoney(manual.cp204Payment);
      if (parsedCp204Pay !== null && parsedCp204Pay > 0) cp204Payment = parsedCp204Pay;
      const parsedPenalty = parseOptionalMoney(manual.underEstimatePenalty);
      if (parsedPenalty !== null && parsedPenalty > 0) underEstimatePenalty = parsedPenalty;
      finalTaxPayable = parseOptionalMoney(manual.taxPayable);
    }

    // Section 107C(10) variance check compares Total Tax (RM) against CP204 / CP204A Estimate
    const hasSection107CVariance = Boolean(
      cp204Mode === 'amount' &&
        cp204Estimate !== null &&
        cp204Estimate > 0 &&
        totalTax !== null &&
        totalTax > 0 &&
        (totalTax - cp204Estimate) / totalTax > 0.3
    );

    const variancePct =
      hasSection107CVariance && cp204Estimate !== null && totalTax !== null && totalTax > 0
        ? Math.round(((totalTax - cp204Estimate) / totalTax) * 1000) / 10
        : null;

    // Form E (Employer Return)
    let formEStatus = '';
    let formESubmissionDate = '';
    let hasFormE = false;

    if (formEJob) {
      hasFormE = true;
      const rawStatus = (
        formEJob.formEStatus ||
        formEJob.submissionStatus ||
        formEJob.status ||
        'Pending'
      ).trim();
      const lower = rawStatus.toLowerCase();
      if (lower === 'completed' || lower === 'submitted to lhdn' || lower === 'submitted') {
        formEStatus = 'Submitted';
      } else {
        formEStatus = rawStatus || 'Pending';
      }
      formESubmissionDate = formEJob.submissionDate || formEJob.completedDate || '';
    } else if (manual && (manual.formEStatus || '').trim()) {
      hasFormE = true;
      formEStatus = (manual.formEStatus || '').trim();
      formESubmissionDate = (manual.formESubmissionDate || '').trim();
    }

    // Combined Remarks
    const remarkParts: string[] = [];
    const pushUnique = (label: string, text?: string) => {
      const t = (text ?? '').trim();
      if (!t) return;
      if (!remarkParts.some((p) => p.toLowerCase().includes(t.toLowerCase()))) {
        remarkParts.push(label ? `${label}: ${t}` : t);
      }
    };

    if (primaryJob?.remarks) pushUnique('', primaryJob.remarks);
    if (cp204Rec?.remarks) pushUnique('CP204', cp204Rec.remarks);
    if (formEJob?.remarks) pushUnique('Form E', formEJob.remarks);
    if (manual?.remarks) pushUnique(hasLinkedRecords ? 'Prior Note' : '', manual.remarks);

    const yaNum = extractYaYear(yaKey) ?? (parseInt(yaKey, 10) || 0);

    rows.push({
      rowKey: `ya_${yaKey}`,
      ya: yaKey,
      yaSortNum: yaNum,
      yaSequence,
      source,
      hasLinkedRecords,
      manualItem: manual,
      formType,
      finalDeadline,
      deadlineStage,
      overdueDays,
      formCSubmittedDate,
      formCStatus,
      mitrsStatus,
      jobStatus,
      cp204Mode,
      cp204Estimate,
      cp204Label,
      cp204Status,
      totalTax,
      cp204Payment,
      underEstimatePenalty,
      finalTaxPayable,
      hasSection107CVariance,
      variancePct,
      formEStatus,
      formESubmissionDate,
      hasFormE,
      remarks: remarkParts.join(' · '),
    });
  }

  // Sort descending by YA (newest year first)
  rows.sort((a, b) => {
    if (b.yaSortNum !== a.yaSortNum) return b.yaSortNum - a.yaSortNum;
    return b.ya.localeCompare(a.ya);
  });

  // Include any brand-new manual rows with blank YA at top so user can fill them in
  for (const m of blankYaManuals) {
    rows.unshift({
      rowKey: `manual_${m.id}`,
      ya: '',
      yaSortNum: 9999,
      yaSequence: m.yaSequence || '',
      source: 'Manual / Prior Agent',
      hasLinkedRecords: false,
      manualItem: m,
      formType: m.formType || 'Form C',
      finalDeadline: m.filingDueDate || '',
      deadlineStage: null,
      overdueDays: 0,
      formCSubmittedDate: m.submissionDate || '',
      formCStatus: m.yaStatus || '',
      mitrsStatus: m.mitrsStatus || '',
      jobStatus: m.yaStatus || '',
      cp204Mode: m.cp204Exempt ? 'sme-exempt' : parseOptionalMoney(m.cp204Estimate) !== null ? 'amount' : 'na',
      cp204Estimate: parseOptionalMoney(m.cp204Estimate),
      cp204Label: m.cp204Exempt ? 'SME Exempt' : 'Prior Agent',
      cp204Status: '',
      totalTax: parseOptionalMoney(m.totalTax),
      cp204Payment: parseOptionalMoney(m.cp204Payment),
      underEstimatePenalty: parseOptionalMoney(m.underEstimatePenalty),
      finalTaxPayable: parseOptionalMoney(m.taxPayable),
      hasSection107CVariance: false,
      variancePct: null,
      formEStatus: m.formEStatus || '',
      formESubmissionDate: m.formESubmissionDate || '',
      hasFormE: Boolean((m.formEStatus || '').trim()),
      remarks: m.remarks || '',
    });
  }

  return rows;
}

function escapeHtml(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pillHtml(
  label: string,
  bg: string,
  border: string,
  color: string
): string {
  return `<span style="display:inline-block;padding:1.5px 5px;border-radius:9999px;font-size:8px;font-weight:700;line-height:1.25;background:${bg};border:0.75px solid ${border};color:${color};white-space:nowrap;">${escapeHtml(
    label
  )}</span>`;
}

function statusPillHtml(status: string): string {
  const norm = status.trim().toLowerCase();
  if (!norm) return '';
  if (
    norm === 'completed' ||
    norm === 'filed' ||
    norm === 'submitted' ||
    norm === 'submitted to lhdn' ||
    norm === 'self-submit' ||
    norm === 'self submit'
  ) {
    return pillHtml(status, '#d1fae5', '#6ee7b7', '#047857');
  }
  if (norm === 'pending mitrs' || norm === 'in progress') {
    return pillHtml(status, '#e0f2fe', '#7dd3fc', '#0369a1');
  }
  if (norm === 'manager review' || norm === 'pending docs') {
    return pillHtml(status, '#fef3c7', '#fcd34d', '#b45309');
  }
  if (norm === 'client approval') {
    return pillHtml(status, '#ede9fe', '#c4b5fd', '#6d28d9');
  }
  return pillHtml(status, '#f1f5f9', '#cbd5e1', '#475569');
}

/**
 * Opens a clean printable A4 Landscape Client Multi-Year Compliance History schedule
 * via iframe-safe printHtml (no window.open).
 */
export function printClientComplianceHistory(
  clientInfo: ClientPrintSummary,
  rows: ConsolidatedYaRow[]
): void {
  const generatedAt = new Date().toLocaleString('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const rowsHtml =
    rows.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:18px;color:#64748b;">No YA compliance history recorded for this client.</td></tr>`
      : rows
          .map((row) => {
            // Col 1: YA & Sequence + Source
            const yaCol = `
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;font-size:10.5px;color:#0f172a;">
                YA ${escapeHtml(row.ya || '—')}
                ${
                  row.yaSequence
                    ? ` ${pillHtml(row.yaSequence, '#e0f2fe', '#bae6fd', '#0369a1')}`
                    : ''
                }
              </div>
              <div style="margin-top:3px;">
                ${
                  row.source === 'Linked'
                    ? pillHtml('Linked', '#f0fdfa', '#99f6e4', '#0f766e')
                    : pillHtml('Manual / Prior Agent', '#fef3c7', '#fde68a', '#92400e')
                }
              </div>
            `;

            // Col 2: Form C & MITRS
            const dueStr = row.finalDeadline ? formatDateDDMMYYYY(row.finalDeadline) : '—';
            const subStr = row.formCSubmittedDate
              ? formatDateDDMMYYYY(row.formCSubmittedDate)
              : '—';
            const formCCol = `
              <div><strong>Due:</strong> <span class="mono">${escapeHtml(dueStr)}</span>${
                row.deadlineStage
                  ? ` ${pillHtml(row.deadlineStage, '#f0fdfa', '#99f6e4', '#115e59')}`
                  : ''
              }${
                row.overdueDays > 0
                  ? ` ${pillHtml(formatOverdueLabel(row.overdueDays), '#fee2e2', '#fca5a5', '#b91c1c')}`
                  : ''
              }</div>
              <div style="margin-top:2px;"><strong>Submitted:</strong> <span class="mono">${escapeHtml(
                subStr
              )}</span></div>
              <div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px;align-items:center;">
                ${row.jobStatus ? statusPillHtml(row.jobStatus) : ''}
                ${
                  row.mitrsStatus
                    ? pillHtml(
                        `MITRS: ${row.mitrsStatus}`,
                        row.mitrsStatus.toLowerCase().includes('submit') ? '#d1fae5' : '#f1f5f9',
                        row.mitrsStatus.toLowerCase().includes('submit') ? '#6ee7b7' : '#cbd5e1',
                        row.mitrsStatus.toLowerCase().includes('submit') ? '#047857' : '#475569'
                      )
                    : ''
                }
              </div>
            `;

            // Col 3: CP204 / CP204A Estimate
            let cp204Col = '<span style="color:#94a3b8;">—</span>';
            if (row.cp204Mode === 'amount' && row.cp204Estimate !== null) {
              cp204Col = `
                <div class="mono" style="font-weight:700;color:#0f172a;">${escapeHtml(
                  formatCurrencyRM(row.cp204Estimate)
                )}</div>
                ${
                  row.cp204Label
                    ? `<div style="font-size:8px;color:#64748b;margin-top:2px;">${escapeHtml(
                        row.cp204Label
                      )}</div>`
                    : ''
                }
              `;
            } else if (row.cp204Mode === 'sme-exempt') {
              cp204Col = pillHtml(row.cp204Label || 'SME Exempt', '#ecfdf5', '#a7f3d0', '#065f46');
            } else {
              cp204Col = pillHtml('N/A', '#f1f5f9', '#cbd5e1', '#64748b');
            }

            // Col 4: Balance Tax & s.107C Check
            const hasAnyTax =
              row.finalTaxPayable !== null ||
              (row.totalTax !== null && row.totalTax > 0) ||
              (row.cp204Payment !== null && row.cp204Payment > 0) ||
              (row.underEstimatePenalty !== null && row.underEstimatePenalty > 0);
            const finalTaxCol = hasAnyTax
              ? `
                <div class="mono" style="font-weight:700;color:#0f172a;">${escapeHtml(
                  row.finalTaxPayable !== null ? formatCurrencyRM(row.finalTaxPayable) : '—'
                )}</div>
                ${
                  row.totalTax !== null && row.totalTax > 0
                    ? `<div class="mono" style="font-size:8px;color:#475569;margin-top:2px;">Total Tax: ${escapeHtml(
                        formatCurrencyRM(row.totalTax)
                      )}</div>`
                    : ''
                }
                ${
                  row.cp204Payment !== null && row.cp204Payment > 0
                    ? `<div class="mono" style="font-size:8px;color:#0f766e;margin-top:1px;">Less CP204: ${escapeHtml(
                        formatCurrencyRM(row.cp204Payment)
                      )}</div>`
                    : ''
                }
                ${
                  row.underEstimatePenalty !== null && row.underEstimatePenalty > 0
                    ? `<div class="mono" style="font-size:8px;color:#b45309;margin-top:1px;">+ Penalty: ${escapeHtml(
                        formatCurrencyRM(row.underEstimatePenalty)
                      )}</div>`
                    : ''
                }
                ${
                  row.hasSection107CVariance
                    ? `<div style="margin-top:3px;">${pillHtml(
                        `>30% Var${row.variancePct ? ` (${row.variancePct}%)` : ''}`,
                        '#fef3c7',
                        '#f59e0b',
                        '#92400e'
                      )}</div>`
                    : ''
                }
              `
              : '<span style="color:#94a3b8;">—</span>';

            // Col 5: Form E
            let formECol = '<span style="color:#94a3b8;">—</span>';
            if (row.hasFormE) {
              const datePart =
                row.formESubmissionDate && isIsoDateString(row.formESubmissionDate)
                  ? ` (${formatDateDDMMYYYY(row.formESubmissionDate)})`
                  : row.formESubmissionDate
                  ? ` (${row.formESubmissionDate})`
                  : '';
              const label =
                row.formEStatus.toLowerCase() === 'submitted'
                  ? `Submitted${datePart}`
                  : `${row.formEStatus}${datePart}`;
              formECol = statusPillHtml(label);
            }

            // Col 6: Remarks
            const remarksCol = row.remarks
              ? escapeHtml(row.remarks)
              : '<span style="color:#94a3b8;">—</span>';

            return `
              <tr>
                <td>${yaCol}</td>
                <td>${formCCol}</td>
                <td style="text-align:right;">${cp204Col}</td>
                <td style="text-align:right;">${finalTaxCol}</td>
                <td>${formECol}</td>
                <td>${remarksCol}</td>
              </tr>
            `;
          })
          .join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Client Compliance History — ${escapeHtml(clientInfo.clientName || clientInfo.clientId)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 9.5px;
      line-height: 1.35;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 7px;
      margin-bottom: 10px;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .subtitle {
      font-size: 9.5px;
      color: #475569;
      margin-top: 2px;
    }
    .meta {
      text-align: right;
      font-size: 8.5px;
      color: #475569;
    }
    .profile-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      padding: 8px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .profile-item-label {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    .profile-item-val {
      font-size: 10px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 2px;
      word-break: break-word;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-variant-numeric: tabular-nums;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: left;
      padding: 6px 7px;
      border: 1px solid #cbd5e1;
    }
    td {
      padding: 6px 7px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      font-size: 9px;
    }
    tr:nth-child(even) td {
      background: #fcfdfe;
    }
    .footer-note {
      margin-top: 10px;
      font-size: 8px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Client Multi-Year Tax Compliance History</h1>
      <div class="subtitle">Consolidated Form C / MITRS, CP204 / CP204A Estimate &amp; Section 107C Variance, and Form E Schedule</div>
    </div>
    <div class="meta">
      <div><strong>TJW Group · TPMS</strong></div>
      <div>Printed: ${escapeHtml(generatedAt)} · ${rows.length} YA Record(s)</div>
    </div>
  </div>

  <div class="profile-grid">
    <div style="grid-column: span 2;">
      <div class="profile-item-label">Client Name</div>
      <div class="profile-item-val">${escapeHtml(clientInfo.clientName || '—')} <span class="mono" style="color:#475569;font-weight:500;">(${escapeHtml(clientInfo.clientId || '—')})</span></div>
    </div>
    <div>
      <div class="profile-item-label">TIN</div>
      <div class="profile-item-val mono">${escapeHtml(clientInfo.tin || '—')}</div>
    </div>
    <div>
      <div class="profile-item-label">SSM / Company No.</div>
      <div class="profile-item-val mono">${escapeHtml(clientInfo.companyNo || '—')}</div>
    </div>
    <div>
      <div class="profile-item-label">FYE</div>
      <div class="profile-item-val mono">${escapeHtml(clientInfo.fye ? `Month ${clientInfo.fye}` : '—')}</div>
    </div>
    <div>
      <div class="profile-item-label">Status / PIC</div>
      <div class="profile-item-val">${escapeHtml(clientInfo.clientStatus || '—')}${clientInfo.taxPic ? ` · ${escapeHtml(clientInfo.taxPic)}` : ''}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:12%;">YA &amp; Source</th>
        <th style="width:27%;">Form C &amp; MITRS</th>
        <th style="width:15%;text-align:right;">CP204 / CP204A Est.</th>
        <th style="width:15%;text-align:right;">Balance Tax &amp; s.107C</th>
        <th style="width:13%;">Form E</th>
        <th style="width:18%;">Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer-note">
    <span>Section 107C(10) Variance Check flags YAs where (Total Tax − CP204 Estimate) / Total Tax &gt; 30%.</span>
    <span>Confidential — For Partner Review &amp; Client Compliance Meetings</span>
  </div>
</body>
</html>`;

  printHtml(html);
}
