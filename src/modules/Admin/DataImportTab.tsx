import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import {
  Upload,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Play,
  RotateCcw,
  ShieldAlert,
  Layers,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
} from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { showToast } from '../../lib/toast';
import {
  Cp204Instalment,
  Cp204Revision,
  StaffMember,
  StaffRole,
  WorkDoneFeeAllocation,
} from '../../types/tpms';
import {
  detectImportTargetFromFilename,
  downloadBlankTemplate,
  downloadFullCombinedBlankTemplate,
  FULL_IMPORT_ORDER,
  getTargetDefinition,
  IMPORT_TARGETS,
  ImportModeKey,
  ImportTargetKey,
  parseAndValidateRow,
  ParsedImportRow,
  sanitizeDocId,
  sanitizeFirestorePayload,
} from './importSchemas';

const BATCH_CHUNK_SIZE = 400;
const FALLBACK_SUB_CHUNK_SIZE = 25;

interface WriteOp {
  docId: string;
  rowNumber: number;
  isUpdate: boolean;
  data: Record<string, unknown>;
}

function describePayloadDiagnostics(data: Record<string, unknown>): string {
  const keys = Object.keys(data);
  const notes: string[] = [];
  for (const k of keys) {
    const v = data[k];
    if (v === undefined) {
      notes.push(`${k}=undefined`);
    } else if (typeof v === 'number' && !Number.isFinite(v)) {
      notes.push(`${k}=${String(v)}`);
    } else if (Array.isArray(v)) {
      notes.push(`${k}=array(${v.length})`);
    } else if (typeof v === 'string' && v.length > 200) {
      notes.push(`${k}=str(${v.length})`);
    }
  }
  const keySummary = keys.length > 12 ? `${keys.slice(0, 12).join(', ')} (+${keys.length - 12} more)` : keys.join(', ');
  return notes.length > 0 ? `Keys: ${keySummary} | Notable: ${notes.slice(0, 6).join(', ')}` : `Keys: ${keySummary}`;
}

interface UploadedSheetEntry {
  sourceName: string;
  rows: Record<string, unknown>[];
  detectedTarget: ImportTargetKey | null;
}

interface ValidatedSheetPlan {
  sourceName: string;
  target: ImportTargetKey | null;
  orderIndex: number;
  totalRows: number;
  validRows: ParsedImportRow[];
  invalidRows: ParsedImportRow[];
  validatedRows: ParsedImportRow[];
  newCount: number;
  updateCount: number;
}

interface CollectionRunResult {
  sourceName: string;
  target: ImportTargetKey;
  label: string;
  collection: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'skipped';
  done: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

interface RuntimeParentCp204 {
  id: string;
  revisions: Cp204Revision[];
  instalments: Cp204Instalment[];
}

interface RuntimeParentWorkDone {
  id: string;
  feeAllocations: WorkDoneFeeAllocation[];
}

function getOrderIndex(target: ImportTargetKey | null): number {
  if (!target) return 999;
  const idx = FULL_IMPORT_ORDER.indexOf(target);
  return idx === -1 ? 999 : idx;
}

export const DataImportTab: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const {
    clients,
    jobs,
    cp204Records,
    taxPayments,
    correspondenceRecords,
    workDoneRecords,
    calendarEvents,
    staff,
    settings,
    history,
  } = useData();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<ImportModeKey>('full_combined');
  const [fileName, setFileName] = useState('');
  const [uploadedSheets, setUploadedSheets] = useState<UploadedSheetEntry[]>([]);
  const [targetOverrides, setTargetOverrides] = useState<Record<string, ImportTargetKey | ''>>({});
  const [previewSheetName, setPreviewSheetName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [showInvalidDetails, setShowInvalidDetails] = useState(false);

  // Execution state
  const [committing, setCommitting] = useState(false);
  const [activeStepInfo, setActiveStepInfo] = useState<{
    stepIndex: number;
    totalSteps: number;
    label: string;
    done: number;
    total: number;
  } | null>(null);
  const [runResults, setRunResults] = useState<CollectionRunResult[]>([]);

  // Existing document IDs per collection (from live DataContext state)
  const existingDocIdsByCollection = useMemo(() => {
    return {
      clients: new Set(clients.map((c) => c.id)),
      jobs: new Set(jobs.map((j) => j.id)),
      cp204: new Set(cp204Records.map((c) => c.id)),
      taxPayments: new Set(taxPayments.map((p) => p.id)),
      correspondence: new Set(correspondenceRecords.map((c) => c.id)),
      workDone: new Set(workDoneRecords.map((w) => w.id)),
      calendarEvents: new Set(calendarEvents.map((e) => e.id)),
      staff: new Set(staff.map((s) => s.id)),
      settings: new Set(settings.map((s) => s.id)),
      history: new Set(history.map((h) => h.id)),
    } as Record<string, Set<string>>;
  }, [
    clients,
    jobs,
    cp204Records,
    taxPayments,
    correspondenceRecords,
    workDoneRecords,
    calendarEvents,
    staff,
    settings,
    history,
  ]);

  // Existing parent maps for child-merge validation
  const existingCp204Ids = useMemo(() => {
    const set = new Set<string>();
    for (const rec of cp204Records) {
      set.add(rec.id);
      set.add(sanitizeDocId(rec.cp204Id, 'CP204'));
    }
    return set;
  }, [cp204Records]);

  const existingWorkDoneIds = useMemo(() => {
    const set = new Set<string>();
    for (const rec of workDoneRecords) {
      set.add(rec.id);
      set.add(sanitizeDocId(rec.workDoneId, 'WD'));
    }
    return set;
  }, [workDoneRecords]);

  // Existing Staff lookup maps so imports merge into existing Firestore docs by staffId/email
  const { existingStaffByStaffId, existingStaffByEmail } = useMemo(() => {
    const byStaffId = new Map<string, StaffMember>();
    const byEmail = new Map<string, StaffMember>();
    for (const s of staff) {
      const code = (s.staffId || '').trim().toUpperCase();
      if (code && !byStaffId.has(code)) byStaffId.set(code, s);
      const em = (s.email || '').trim().toLowerCase();
      if (em && !byEmail.has(em)) byEmail.set(em, s);
    }
    return { existingStaffByStaffId: byStaffId, existingStaffByEmail: byEmail };
  }, [staff]);

  const reconcileStaffRow = useMemo(() => {
    return (parsed: ParsedImportRow): ParsedImportRow => {
      if (!parsed.valid) return parsed;
      const staffId = String(parsed.payload.staffId ?? '').trim();
      const upperId = staffId.toUpperCase();
      const importedEmail = String(parsed.payload.email ?? '').trim().toLowerCase();
      const existing =
        existingStaffByStaffId.get(upperId) ??
        (importedEmail ? existingStaffByEmail.get(importedEmail) : undefined);

      if (!existing) {
        return {
          ...parsed,
          note: importedEmail ? undefined : 'Pending Google email (can be added later)',
        };
      }

      const existingEmailLower = (existing.email || '').trim().toLowerCase();
      const isProtectedAdmin =
        existing.role === 'Admin' &&
        (upperId === 'ADM' || upperId === 'EC' || existingEmailLower === 'tjwang.tax@gmail.com');

      const finalEmail = importedEmail || existingEmailLower;
      const finalRole: StaffRole = isProtectedAdmin
        ? 'Admin'
        : ((parsed.payload.role as StaffRole) || 'Staff');
      const finalActive =
        existingEmailLower === 'tjwang.tax@gmail.com' ? true : Boolean(parsed.payload.active);

      const noteParts = [`Merges existing doc (${existing.id})`];
      if (!importedEmail && existingEmailLower) {
        noteParts.push(`keeps ${existingEmailLower}`);
      }
      if (isProtectedAdmin) {
        noteParts.push('Admin role preserved');
      }

      return {
        ...parsed,
        docId: existing.id,
        note: noteParts.join(' · '),
        payload: {
          ...parsed.payload,
          email: finalEmail,
          role: finalRole,
          active: finalActive,
        },
        preview: {
          ...parsed.preview,
          email: finalEmail || '(Pending Email)',
          role: finalRole,
          active: finalActive ? 'Active' : 'Inactive',
        },
      };
    };
  }, [existingStaffByStaffId, existingStaffByEmail]);

  // Resolve effective target for each uploaded sheet
  const resolvedSheets = useMemo(() => {
    return uploadedSheets.map((sheet) => {
      let target: ImportTargetKey | null;
      if (mode !== 'full_combined') {
        target = sheet.detectedTarget;
      } else if (Object.prototype.hasOwnProperty.call(targetOverrides, sheet.sourceName)) {
        const ov = targetOverrides[sheet.sourceName];
        target = ov === '' ? null : ov;
      } else {
        target = sheet.detectedTarget;
      }
      return { ...sheet, target };
    });
  }, [uploadedSheets, mode, targetOverrides]);

  // In single-collection mode, select the matching sheet from a combined upload (or fallback to explicit/only sheet)
  const activeSingleSheet = useMemo<UploadedSheetEntry | null>(() => {
    if (mode === 'full_combined' || uploadedSheets.length === 0) return null;
    if (uploadedSheets.length === 1) return uploadedSheets[0];
    const explicit = uploadedSheets.find((s) => s.sourceName === previewSheetName);
    if (explicit) return explicit;
    const exactMatch = uploadedSheets.find((s) => s.detectedTarget === mode);
    return exactMatch ?? uploadedSheets[0];
  }, [mode, uploadedSheets, previewSheetName]);

  // Build validated plans for Full Combined mode (with cross-sheet parent awareness!)
  const combinedPlans = useMemo<ValidatedSheetPlan[]>(() => {
    if (mode !== 'full_combined' || resolvedSheets.length === 0) return [];

    // First pass: collect pending parent docIds from cp204 & workDone sheets in the SAME upload
    const pendingCp204Ids = new Set<string>(existingCp204Ids);
    const pendingWorkDoneIds = new Set<string>(existingWorkDoneIds);

    for (const s of resolvedSheets) {
      if (s.target === 'cp204') {
        s.rows.forEach((raw, idx) => {
          const parsed = parseAndValidateRow('cp204', raw, idx + 1);
          if (parsed.valid && parsed.docId) pendingCp204Ids.add(parsed.docId);
        });
      } else if (s.target === 'workDone') {
        s.rows.forEach((raw, idx) => {
          const parsed = parseAndValidateRow('workDone', raw, idx + 1);
          if (parsed.valid && parsed.docId) pendingWorkDoneIds.add(parsed.docId);
        });
      }
    }

    // Second pass: validate every sheet in strict dependency order
    const plans: ValidatedSheetPlan[] = resolvedSheets.map((sheet) => {
      if (!sheet.target) {
        return {
          sourceName: sheet.sourceName,
          target: null,
          orderIndex: 999,
          totalRows: sheet.rows.length,
          validRows: [],
          invalidRows: [],
          validatedRows: [],
          newCount: 0,
          updateCount: 0,
        };
      }

      const targetKey = sheet.target;
      const def = getTargetDefinition(targetKey);
      const existingSet = existingDocIdsByCollection[def.collection] ?? new Set<string>();

      const validatedRows = sheet.rows.map((raw, idx) => {
        let parsed = parseAndValidateRow(targetKey, raw, idx + 1);
        if (!parsed.valid) return parsed;

        if (targetKey === 'staff') {
          parsed = reconcileStaffRow(parsed);
        } else if (targetKey === 'cp204_revisions' || targetKey === 'cp204_instalments') {
          if (!parsed.parentDocId || !pendingCp204Ids.has(parsed.parentDocId)) {
            return {
              ...parsed,
              valid: false,
              reason: `Parent CP204 record "${String(parsed.payload.cp204Id || '')}" not found in Firestore or in this file`,
            };
          }
        } else if (targetKey === 'workDone_allocations') {
          if (!parsed.parentDocId || !pendingWorkDoneIds.has(parsed.parentDocId)) {
            return {
              ...parsed,
              valid: false,
              reason: `Parent Work Done record "${String(parsed.payload.workDoneId || '')}" not found in Firestore or in this file`,
            };
          }
        } else if (targetKey === 'history' && existingSet.has(parsed.docId)) {
          return {
            ...parsed,
            valid: false,
            reason: `History ID "${parsed.docId}" already exists (immutable audit log)`,
          };
        }

        return parsed;
      });

      const validRows = validatedRows.filter((r) => r.valid);
      const invalidRows = validatedRows.filter((r) => !r.valid);

      let newCount = 0;
      let updateCount = 0;
      if (def.isChildMerge) {
        updateCount = new Set(validRows.map((r) => r.parentDocId).filter(Boolean)).size;
      } else {
        const seen = new Set<string>();
        for (const r of validRows) {
          if (seen.has(r.docId)) continue;
          seen.add(r.docId);
          if (existingSet.has(r.docId)) updateCount += 1;
          else newCount += 1;
        }
      }

      return {
        sourceName: sheet.sourceName,
        target: targetKey,
        orderIndex: getOrderIndex(targetKey),
        totalRows: sheet.rows.length,
        validRows,
        invalidRows,
        validatedRows,
        newCount,
        updateCount,
      };
    });

    return plans.sort((a, b) => a.orderIndex - b.orderIndex);
  }, [
    mode,
    resolvedSheets,
    existingCp204Ids,
    existingWorkDoneIds,
    existingDocIdsByCollection,
    reconcileStaffRow,
  ]);

  // Build validated plan for Single-Collection mode
  const singlePlan = useMemo<ValidatedSheetPlan | null>(() => {
    if (mode === 'full_combined' || !activeSingleSheet) return null;
    const targetKey = mode;
    const def = getTargetDefinition(targetKey);
    const existingSet = existingDocIdsByCollection[def.collection] ?? new Set<string>();

    const validatedRows = activeSingleSheet.rows.map((raw, idx) => {
      let parsed = parseAndValidateRow(targetKey, raw, idx + 1);
      if (!parsed.valid) return parsed;

      if (targetKey === 'staff') {
        parsed = reconcileStaffRow(parsed);
      } else if (targetKey === 'cp204_revisions' || targetKey === 'cp204_instalments') {
        if (!parsed.parentDocId || !existingCp204Ids.has(parsed.parentDocId)) {
          return {
            ...parsed,
            valid: false,
            reason: `Parent CP204 record "${String(parsed.payload.cp204Id || '')}" not found — import CP204 Master first`,
          };
        }
      } else if (targetKey === 'workDone_allocations') {
        if (!parsed.parentDocId || !existingWorkDoneIds.has(parsed.parentDocId)) {
          return {
            ...parsed,
            valid: false,
            reason: `Parent Work Done record "${String(parsed.payload.workDoneId || '')}" not found — import Work Done first`,
          };
        }
      } else if (targetKey === 'history' && existingSet.has(parsed.docId)) {
        return {
          ...parsed,
          valid: false,
          reason: `History ID "${parsed.docId}" already exists (immutable audit log)`,
        };
      }

      return parsed;
    });

    const validRows = validatedRows.filter((r) => r.valid);
    const invalidRows = validatedRows.filter((r) => !r.valid);

    let newCount = 0;
    let updateCount = 0;
    if (def.isChildMerge) {
      updateCount = new Set(validRows.map((r) => r.parentDocId).filter(Boolean)).size;
    } else {
      const seen = new Set<string>();
      for (const r of validRows) {
        if (seen.has(r.docId)) continue;
        seen.add(r.docId);
        if (existingSet.has(r.docId)) updateCount += 1;
        else newCount += 1;
      }
    }

    return {
      sourceName: activeSingleSheet.sourceName,
      target: targetKey,
      orderIndex: getOrderIndex(targetKey),
      totalRows: activeSingleSheet.rows.length,
      validRows,
      invalidRows,
      validatedRows,
      newCount,
      updateCount,
    };
  }, [
    mode,
    activeSingleSheet,
    existingCp204Ids,
    existingWorkDoneIds,
    existingDocIdsByCollection,
    reconcileStaffRow,
  ]);

  // Combined totals across all active mapped sheets
  const combinedTotals = useMemo(() => {
    const mapped = combinedPlans.filter((p) => p.target !== null);
    const totalRows = mapped.reduce((s, p) => s + p.totalRows, 0);
    const validRows = mapped.reduce((s, p) => s + p.validRows.length, 0);
    const invalidRows = mapped.reduce((s, p) => s + p.invalidRows.length, 0);
    const runnableSheets = mapped.filter((p) => p.validRows.length > 0).length;
    return {
      detectedSheets: mapped.length,
      unmatchedSheets: combinedPlans.length - mapped.length,
      totalRows,
      validRows,
      invalidRows,
      runnableSheets,
    };
  }, [combinedPlans]);

  // Active preview plan (either selected sheet in combined mode or the single plan)
  const activePreviewPlan = useMemo<ValidatedSheetPlan | null>(() => {
    if (mode !== 'full_combined') return singlePlan;
    if (combinedPlans.length === 0) return null;
    const matched = combinedPlans.find((p) => p.sourceName === previewSheetName);
    return matched ?? combinedPlans.find((p) => p.target !== null) ?? combinedPlans[0];
  }, [mode, singlePlan, combinedPlans, previewSheetName]);

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto mb-2" />
        <h3 className="font-display font-bold text-sm text-slate-900">
          Administrator Privileges Required
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Bulk Data Import is strictly restricted to Admin users.
        </p>
      </div>
    );
  }

  const resetFile = () => {
    setFileName('');
    setUploadedSheets([]);
    setTargetOverrides({});
    setPreviewSheetName('');
    setParseError(null);
    setRunResults([]);
    setActiveStepInfo(null);
    setShowInvalidDetails(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Multi-sheet .xlsx, combined .json ({ sheets: {...} } or { Clients: [...], Jobs: [...] }), single array .json, and .csv parser
  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setParseError(null);
    setRunResults([]);
    setActiveStepInfo(null);
    setTargetOverrides({});
    setFileName(file.name);

    const fileTargetHint = detectImportTargetFromFilename(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    try {
      const extracted: UploadedSheetEntry[] = [];

      if (ext === 'json') {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        if (Array.isArray(parsed)) {
          const rows = parsed.filter(
            (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')
          );
          extracted.push({
            sourceName: file.name.replace(/\.json$/i, ''),
            rows,
            detectedTarget: fileTargetHint,
          });
        } else if (parsed && typeof parsed === 'object') {
          const root = parsed as Record<string, unknown>;

          // Support nested container like { sheets: { Clients: [...], Jobs: [...] } } or { data: { ... } }
          let container: Record<string, unknown> = root;
          for (const nestedKey of ['sheets', 'tables', 'collections', 'data']) {
            const candidate = root[nestedKey];
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
              const subEntries = Object.values(candidate as Record<string, unknown>);
              if (subEntries.some((v) => Array.isArray(v))) {
                container = candidate as Record<string, unknown>;
                break;
              }
            }
          }

          // Check for single-table wrapper { rows: [...] } / { data: [...] } / { records: [...] }
          const singleWrapperKeys = ['rows', 'data', 'records', 'items'];
          const topLevelArrayKeys = Object.keys(container).filter((k) => Array.isArray(container[k]));

          if (
            topLevelArrayKeys.length === 1 &&
            singleWrapperKeys.includes(topLevelArrayKeys[0].toLowerCase())
          ) {
            const arr = container[topLevelArrayKeys[0]] as unknown[];
            const rows = arr.filter(
              (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')
            );
            extracted.push({
              sourceName: file.name.replace(/\.json$/i, ''),
              rows,
              detectedTarget: fileTargetHint,
            });
          } else {
            // Combined JSON object: extract every array property
            for (const key of topLevelArrayKeys) {
              const arr = container[key] as unknown[];
              const rows = arr.filter(
                (item): item is Record<string, unknown> =>
                  Boolean(item && typeof item === 'object')
              );
              extracted.push({
                sourceName: key,
                rows,
                detectedTarget: detectImportTargetFromFilename(key) ?? (topLevelArrayKeys.length === 1 ? fileTargetHint : null),
              });
            }
          }
        }

        if (extracted.length === 0) {
          setParseError(
            'JSON file did not contain any recognizable array of records or sheet objects.'
          );
          setUploadedSheets([]);
          return;
        }
      } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(buf, { type: 'array', cellDates: true });
        if (!workbook.SheetNames.length) {
          setParseError('Workbook contains no sheets.');
          setUploadedSheets([]);
          return;
        }

        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          const detected =
            detectImportTargetFromFilename(sheetName) ??
            (workbook.SheetNames.length === 1 ? fileTargetHint : null);
          extracted.push({
            sourceName: sheetName,
            rows,
            detectedTarget: detected,
          });
        }
      } else {
        setParseError('Unsupported file type. Please upload a .json, .xlsx, .xls, or .csv file.');
        setUploadedSheets([]);
        return;
      }

      setUploadedSheets(extracted);

      // Pick sensible initial preview sheet
      const firstDetected = extracted.find((e) => e.detectedTarget !== null) ?? extracted[0];
      setPreviewSheetName(firstDetected?.sourceName ?? '');

      // Auto-select target if single sheet uploaded while in a mismatched single-collection mode
      if (extracted.length === 1 && extracted[0].detectedTarget && mode !== 'full_combined') {
        setMode(extracted[0].detectedTarget);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(`Failed to parse file: ${msg}`);
      setUploadedSheets([]);
    }
  };

  // Core reusable executor for a list of ValidatedSheetPlans in strict dependency order
  const executePlans = async (plansToRun: ValidatedSheetPlan[]) => {
    if (!isAdmin || committing) return;
    const runnable = plansToRun
      .filter((p): p is ValidatedSheetPlan & { target: ImportTargetKey } => p.target !== null)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (runnable.length === 0) {
      showToast('No mapped collections ready to import.', 'warning');
      return;
    }

    const actorEmail = (auth.currentUser?.email || user?.email || '').trim();
    const collectionsWithoutCreatedBy = new Set(['staff', 'settings', 'history']);

    // Clone live state maps so parent records committed in earlier steps are immediately visible to child steps
    const runtimeExisting: Record<string, Set<string>> = {};
    for (const [k, s] of Object.entries(existingDocIdsByCollection)) {
      runtimeExisting[k] = new Set(s);
    }

    const runtimeCp204 = new Map<string, RuntimeParentCp204>();
    for (const rec of cp204Records) {
      const entry: RuntimeParentCp204 = {
        id: rec.id,
        revisions: [...(rec.revisions ?? [])],
        instalments: [...(rec.instalments ?? [])],
      };
      runtimeCp204.set(rec.id, entry);
      runtimeCp204.set(sanitizeDocId(rec.cp204Id, 'CP204'), entry);
    }

    const runtimeWorkDone = new Map<string, RuntimeParentWorkDone>();
    for (const rec of workDoneRecords) {
      const entry: RuntimeParentWorkDone = {
        id: rec.id,
        feeAllocations: [...(rec.feeAllocations ?? [])],
      };
      runtimeWorkDone.set(rec.id, entry);
      runtimeWorkDone.set(sanitizeDocId(rec.workDoneId, 'WD'), entry);
    }

    // Initialize results list
    const initialResults: CollectionRunResult[] = runnable.map((p) => {
      const def = getTargetDefinition(p.target);
      return {
        sourceName: p.sourceName,
        target: p.target,
        label: def.label,
        collection: def.collection,
        status: p.validRows.length === 0 ? 'skipped' : 'queued',
        done: 0,
        total: p.validRows.length,
        created: 0,
        updated: 0,
        skipped: p.invalidRows.length,
        errors: [],
      };
    });

    setCommitting(true);
    setRunResults(initialResults);

    const workingResults = initialResults.map((r) => ({ ...r, errors: [...r.errors] }));
    const syncResults = () => setRunResults(workingResults.map((r) => ({ ...r, errors: [...r.errors] })));

    for (let stepIdx = 0; stepIdx < runnable.length; stepIdx++) {
      const plan = runnable[stepIdx];
      const def = getTargetDefinition(plan.target);
      const colName = def.collection;
      const res = workingResults[stepIdx];

      if (plan.validRows.length === 0) {
        res.status = 'skipped';
        syncResults();
        continue;
      }

      res.status = 'running';
      syncResults();

      const ops: WriteOp[] = [];

      if (plan.target === 'cp204_revisions') {
        const grouped = new Map<string, Cp204Revision[]>();
        const firstRowByParent = new Map<string, number>();
        for (const r of plan.validRows) {
          const parent = r.parentDocId ? runtimeCp204.get(r.parentDocId) : undefined;
          if (!parent) {
            res.skipped += 1;
            continue;
          }
          if (!firstRowByParent.has(parent.id)) firstRowByParent.set(parent.id, r.rowNumber);
          const arr = grouped.get(parent.id) ?? [];
          arr.push(r.payload.revision as Cp204Revision);
          grouped.set(parent.id, arr);
        }

        for (const [parentId, newRevs] of grouped.entries()) {
          const parent = runtimeCp204.get(parentId);
          if (!parent) continue;
          const byMonth = new Map<string, Cp204Revision>();
          for (const existing of parent.revisions) byMonth.set(existing.revisionMonth, existing);
          for (const rev of newRevs) byMonth.set(rev.revisionMonth, rev);

          const order = ['6', '9', '11'];
          const merged = Array.from(byMonth.values())
            .sort((a, b) => order.indexOf(a.revisionMonth) - order.indexOf(b.revisionMonth))
            .slice(0, 20);
          parent.revisions = merged;
          const latestRev = [...merged].reverse().find((r) => r.proposedEstimatedTax > 0);
          ops.push({
            docId: parentId,
            rowNumber: firstRowByParent.get(parentId) ?? 0,
            isUpdate: true,
            data: sanitizeFirestorePayload({
              revisions: merged,
              ...(latestRev ? { currentEstimatedTax: latestRev.proposedEstimatedTax } : {}),
              updatedBy: actorEmail,
              updatedAt: serverTimestamp(),
            }),
          });
        }
      } else if (plan.target === 'cp204_instalments') {
        const grouped = new Map<string, Cp204Instalment[]>();
        const firstRowByParent = new Map<string, number>();
        for (const r of plan.validRows) {
          const parent = r.parentDocId ? runtimeCp204.get(r.parentDocId) : undefined;
          if (!parent) {
            res.skipped += 1;
            continue;
          }
          if (!firstRowByParent.has(parent.id)) firstRowByParent.set(parent.id, r.rowNumber);
          const arr = grouped.get(parent.id) ?? [];
          arr.push(r.payload.instalment as Cp204Instalment);
          grouped.set(parent.id, arr);
        }

        for (const [parentId, newInsts] of grouped.entries()) {
          const parent = runtimeCp204.get(parentId);
          if (!parent) continue;
          const byNo = new Map<number, Cp204Instalment>();
          for (const existing of parent.instalments) byNo.set(existing.instalmentNo, existing);
          for (const inst of newInsts) byNo.set(inst.instalmentNo, inst);

          const merged = Array.from(byNo.values())
            .sort((a, b) => a.instalmentNo - b.instalmentNo)
            .slice(0, 36);
          parent.instalments = merged;
          ops.push({
            docId: parentId,
            rowNumber: firstRowByParent.get(parentId) ?? 0,
            isUpdate: true,
            data: sanitizeFirestorePayload({
              instalments: merged,
              updatedBy: actorEmail,
              updatedAt: serverTimestamp(),
            }),
          });
        }
      } else if (plan.target === 'workDone_allocations') {
        const grouped = new Map<string, WorkDoneFeeAllocation[]>();
        const firstRowByParent = new Map<string, number>();
        for (const r of plan.validRows) {
          const parent = r.parentDocId ? runtimeWorkDone.get(r.parentDocId) : undefined;
          if (!parent) {
            res.skipped += 1;
            continue;
          }
          if (!firstRowByParent.has(parent.id)) firstRowByParent.set(parent.id, r.rowNumber);
          const arr = grouped.get(parent.id) ?? [];
          arr.push(r.payload.allocation as WorkDoneFeeAllocation);
          grouped.set(parent.id, arr);
        }

        for (const [parentId, newAllocs] of grouped.entries()) {
          const parent = runtimeWorkDone.get(parentId);
          if (!parent) continue;
          const byLine = new Map<number, WorkDoneFeeAllocation>();
          for (const existing of parent.feeAllocations) byLine.set(existing.lineNo, existing);
          for (const a of newAllocs) byLine.set(a.lineNo, a);

          const merged = Array.from(byLine.values())
            .sort((a, b) => a.lineNo - b.lineNo)
            .slice(0, 50);
          parent.feeAllocations = merged;
          ops.push({
            docId: parentId,
            rowNumber: firstRowByParent.get(parentId) ?? 0,
            isUpdate: true,
            data: sanitizeFirestorePayload({
              feeAllocations: merged,
              pricingMode: 'Individual Allocation',
              updatedBy: actorEmail,
              updatedAt: serverTimestamp(),
            }),
          });
        }
      } else {
        const deduped = new Map<string, ParsedImportRow>();
        for (const r of plan.validRows) deduped.set(r.docId, r);

        const existingSet = runtimeExisting[colName] ?? new Set<string>();

        for (const [docId, r] of deduped.entries()) {
          const isUpdate = existingSet.has(docId);

          if (plan.target === 'history') {
            if (isUpdate) {
              res.skipped += 1;
              continue;
            }
            ops.push({
              docId,
              rowNumber: r.rowNumber,
              isUpdate: false,
              data: sanitizeFirestorePayload({
                ...r.payload,
                timestamp: serverTimestamp(),
              }),
            });
            continue;
          }

          const basePayload: Record<string, unknown> = {
            ...r.payload,
            updatedAt: serverTimestamp(),
          };
          if (!collectionsWithoutCreatedBy.has(colName)) {
            basePayload.updatedBy = actorEmail;
            if (!isUpdate) basePayload.createdBy = actorEmail;
          }
          if (!isUpdate) {
            basePayload.createdAt = serverTimestamp();
          }

          ops.push({
            docId,
            rowNumber: r.rowNumber,
            isUpdate,
            data: sanitizeFirestorePayload(basePayload),
          });
        }
      }

      const recordOpSuccess = (op: WriteOp, effectiveIsUpdate: boolean) => {
        if (effectiveIsUpdate) res.updated += 1;
        else res.created += 1;

        runtimeExisting[colName]?.add(op.docId);
        if (plan.target === 'cp204' && !runtimeCp204.has(op.docId)) {
          const newParent: RuntimeParentCp204 = {
            id: op.docId,
            revisions: Array.isArray(op.data.revisions)
              ? (op.data.revisions as Cp204Revision[])
              : [],
            instalments: Array.isArray(op.data.instalments)
              ? (op.data.instalments as Cp204Instalment[])
              : [],
          };
          runtimeCp204.set(op.docId, newParent);
        } else if (plan.target === 'workDone' && !runtimeWorkDone.has(op.docId)) {
          const newParent: RuntimeParentWorkDone = {
            id: op.docId,
            feeAllocations: Array.isArray(op.data.feeAllocations)
              ? (op.data.feeAllocations as WorkDoneFeeAllocation[])
              : [],
          };
          runtimeWorkDone.set(op.docId, newParent);
        }
      };

      res.total = ops.length;
      res.done = 0;
      setActiveStepInfo({
        stepIndex: stepIdx + 1,
        totalSteps: runnable.length,
        label: def.label,
        done: 0,
        total: ops.length,
      });
      syncResults();

      for (let i = 0; i < ops.length; i += BATCH_CHUNK_SIZE) {
        const chunk = ops.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const op of chunk) {
          batch.set(doc(db, colName, op.docId), op.data, { merge: true });
        }

        try {
          await batch.commit();
          for (const op of chunk) {
            recordOpSuccess(op, op.isUpdate);
          }
        } catch {
          // Automatic fallback: split failed 400-doc batch into 25-doc sub-chunks,
          // then auto-heal and diagnose any individual failing document via getDoc + setDoc.
          for (let j = 0; j < chunk.length; j += FALLBACK_SUB_CHUNK_SIZE) {
            const subChunk = chunk.slice(j, j + FALLBACK_SUB_CHUNK_SIZE);
            const subBatch = writeBatch(db);
            for (const op of subChunk) {
              subBatch.set(doc(db, colName, op.docId), op.data, { merge: true });
            }

            try {
              await subBatch.commit();
              for (const op of subChunk) {
                recordOpSuccess(op, op.isUpdate);
              }
            } catch {
              // Single-document auto-heal & exact row-level failure diagnosis
              for (const op of subChunk) {
                const docRef = doc(db, colName, op.docId);
                let effectiveIsUpdate = op.isUpdate;
                let adjusted: Record<string, unknown> = sanitizeFirestorePayload({ ...op.data });

                try {
                  const snap = await getDoc(docRef);
                  effectiveIsUpdate = snap.exists();

                  if (plan.target === 'history' && effectiveIsUpdate) {
                    res.skipped += 1;
                    runtimeExisting[colName]?.add(op.docId);
                    continue;
                  }

                  if (effectiveIsUpdate) {
                    delete adjusted.createdAt;
                    delete adjusted.createdBy;
                    if (plan.target !== 'history') {
                      adjusted.updatedAt = serverTimestamp();
                      if (!collectionsWithoutCreatedBy.has(colName)) {
                        adjusted.updatedBy = actorEmail;
                      }
                    }
                  } else if (plan.target === 'history') {
                    adjusted.timestamp = serverTimestamp();
                  } else {
                    adjusted.createdAt = serverTimestamp();
                    adjusted.updatedAt = serverTimestamp();
                    if (!collectionsWithoutCreatedBy.has(colName)) {
                      adjusted.createdBy = actorEmail;
                      adjusted.updatedBy = actorEmail;
                    }
                  }

                  adjusted = sanitizeFirestorePayload(adjusted);
                  await setDoc(docRef, adjusted, { merge: true });
                  recordOpSuccess(op, effectiveIsUpdate);
                } catch (singleErr) {
                  const errMsg = singleErr instanceof Error ? singleErr.message : String(singleErr);
                  const diag = describePayloadDiagnostics(adjusted);
                  res.errors.push(
                    `Row #${op.rowNumber || '?'} · Doc "${op.docId}" (${
                      effectiveIsUpdate ? 'update' : 'create'
                    }): ${errMsg} | ${diag}`
                  );
                }
              }
            }

            res.done = Math.min(i + j + subChunk.length, ops.length);
            setActiveStepInfo({
              stepIndex: stepIdx + 1,
              totalSteps: runnable.length,
              label: def.label,
              done: res.done,
              total: ops.length,
            });
            syncResults();
          }
        }

        res.done = Math.min(i + chunk.length, ops.length);
        setActiveStepInfo({
          stepIndex: stepIdx + 1,
          totalSteps: runnable.length,
          label: def.label,
          done: res.done,
          total: ops.length,
        });
        syncResults();
      }

      res.status = res.errors.length > 0 ? 'error' : 'done';
      syncResults();
    }

    setCommitting(false);
    setActiveStepInfo(null);

    const totalCreated = workingResults.reduce((s, r) => s + r.created, 0);
    const totalUpdated = workingResults.reduce((s, r) => s + r.updated, 0);
    const totalErrors = workingResults.reduce((s, r) => s + r.errors.length, 0);

    if (totalErrors === 0) {
      showToast(
        `Import complete: ${totalCreated} new, ${totalUpdated} updated across ${runnable.length} collection(s).`,
        'success',
        4800
      );
    } else {
      showToast(
        `Import finished with ${totalErrors} row error(s). Review the exact failing rows in the summary below.`,
        'warning',
        5500
      );
    }
  };

  const isFullMode = mode === 'full_combined';
  const activeTargetDef = !isFullMode ? getTargetDefinition(mode) : null;
  const previewDef = activePreviewPlan?.target ? getTargetDefinition(activePreviewPlan.target) : null;
  const previewRows = activePreviewPlan ? activePreviewPlan.validatedRows.slice(0, 10) : [];

  const activePct =
    activeStepInfo && activeStepInfo.total > 0
      ? Math.round((activeStepInfo.done / activeStepInfo.total) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Top Config Card: Mode Selector + File Dropzone + Template Download */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700" />
              Admin Bulk Data Importer (1-File Combined &amp; Single-Collection)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload a 1-file multi-sheet Excel backup (.xlsx) or combined JSON export (or any
              single-sheet Excel/JSON/CSV) to import into Firestore in dependency-ordered 400-doc
              batches.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              isFullMode ? downloadFullCombinedBlankTemplate() : downloadBlankTemplate(mode)
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            {isFullMode
              ? 'Download Full Combined Excel Template (13 Tabs)'
              : 'Download Blank Excel Template'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Target Firestore Collection / Import Mode
            </label>
            <select
              value={mode}
              disabled={committing}
              onChange={(e) => {
                const nextMode = e.target.value as ImportModeKey;
                setMode(nextMode);
                setRunResults([]);
                if (nextMode !== 'full_combined' && uploadedSheets.length > 0) {
                  const matched = uploadedSheets.find((s) => s.detectedTarget === nextMode);
                  if (matched) setPreviewSheetName(matched.sourceName);
                }
              }}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 font-medium"
            >
              <option value="full_combined">
                Full Combined Backup — Auto-Import All (1 File)
              </option>
              <optgroup label="Single Collection / Child Sheet Import">
                {IMPORT_TARGETS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            </select>
            {isFullMode ? (
              <p className="text-[11px] text-slate-500 mt-1.5">
                Auto-detects all sheets/keys in one multi-sheet <code className="font-mono">.xlsx</code> or
                combined <code className="font-mono">.json</code> file and imports in strict parent-before-child
                order (Staff → Settings → Clients → Jobs → CP204 → Payments → Correspondence → Work
                Done → Calendar → History).
              </p>
            ) : (
              <>
                <p className="text-[11px] text-slate-500 mt-1.5">{activeTargetDef?.description}</p>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                  Auto-detect names: {activeTargetDef?.sampleFilenames.join(', ')}
                </p>
              </>
            )}
          </div>

          {/* File Dropzone */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Upload Source File (.xlsx, .xls, .json, .csv)
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (committing) return;
                void handleFileSelected(e.dataTransfer.files?.[0]);
              }}
              onClick={() => !committing && fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-teal-600 hover:bg-teal-50/30 rounded-lg px-4 py-4 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => void handleFileSelected(e.target.files?.[0])}
              />
              <div className="flex items-center justify-center gap-2 text-slate-500 mb-1">
                <Upload className="w-4 h-4 text-teal-700" />
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <FileJson className="w-4 h-4 text-amber-600" />
              </div>
              {fileName ? (
                <div className="text-xs font-semibold text-slate-900">
                  {fileName}{' '}
                  <span className="font-normal text-slate-500">
                    ({uploadedSheets.length} sheet{uploadedSheets.length === 1 ? '' : 's'} detected)
                  </span>
                </div>
              ) : (
                <div className="text-xs font-medium text-slate-700">
                  Click to choose file or drag &amp; drop here
                </div>
              )}
              <div className="text-[10px] text-slate-400 mt-0.5">
                Supports 1-file multi-sheet .xlsx, combined Apps Script .json ({'{ Clients: [...], Jobs: [...] }'}), or single-sheet .csv/.json/.xlsx
              </div>
            </div>
          </div>
        </div>

        {/* Single-collection mode selector when uploading a multi-sheet file */}
        {!isFullMode && uploadedSheets.length > 1 && (
          <div className="p-3 rounded-md bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">
              Combined File Detected — Source Sheet for {activeTargetDef?.label}:
            </span>
            {uploadedSheets.map((sh) => {
              const selected = activeSingleSheet?.sourceName === sh.sourceName;
              return (
                <button
                  key={sh.sourceName}
                  type="button"
                  onClick={() => setPreviewSheetName(sh.sourceName)}
                  className={`px-2.5 py-1 text-xs rounded-md border font-medium ${
                    selected
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {sh.sourceName} <span className="opacity-75 font-mono">({sh.rows.length})</span>
                </button>
              );
            })}
          </div>
        )}

        {(isFullMode || mode === 'staff') && (
          <div className="p-2.5 rounded-md bg-sky-50 border border-sky-200 text-xs text-sky-900">
            <strong>Staff Import Policy:</strong> Password Hash, Password Salt, and legacy password
            columns are automatically stripped. Staff rows only require <strong>Staff ID</strong>{' '}
            and <strong>Staff Name</strong> (email may be blank until assigned). Existing staff
            records matching the same Staff ID (such as EC / ADM) are merged into their existing
            document ID so active Admin profiles are preserved without duplication.
          </div>
        )}

        {parseError && (
          <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            {parseError}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* FULL COMBINED BACKUP MODE — DETECTED SHEETS SUMMARY & AUTO-EXECUTION  */}
      {/* ===================================================================== */}
      {isFullMode && uploadedSheets.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-[280px]">
              <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-200">
                <div className="text-[10px] uppercase font-semibold text-slate-500">
                  Detected Sheets
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {combinedTotals.detectedSheets}
                  {combinedTotals.unmatchedSheets > 0 && (
                    <span className="text-xs font-normal text-amber-700 ml-1">
                      (+{combinedTotals.unmatchedSheets} unmapped)
                    </span>
                  )}
                </div>
              </div>
              <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-200">
                <div className="text-[10px] uppercase font-semibold text-slate-500">Total Rows</div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {combinedTotals.totalRows}
                </div>
              </div>
              <div className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] uppercase font-semibold text-emerald-700">
                  Valid Ready
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-900">
                  {combinedTotals.validRows}
                </div>
              </div>
              <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
                <div className="text-[10px] uppercase font-semibold text-amber-800">
                  Skipped / Invalid
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-amber-900">
                  {combinedTotals.invalidRows}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={committing}
                onClick={resetFile}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>
              <button
                type="button"
                disabled={committing || combinedTotals.validRows === 0}
                onClick={() => void executePlans(combinedPlans)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50 whitespace-nowrap"
              >
                {committing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {committing
                  ? `Running Full Import...`
                  : `Run Full Import (${combinedTotals.validRows} Rows across ${combinedTotals.runnableSheets} Sheet${
                      combinedTotals.runnableSheets === 1 ? '' : 's'
                    })`}
              </button>
            </div>
          </div>

          {/* Step-by-Step Progress Bar */}
          {activeStepInfo && (
            <div className="p-3 rounded-lg bg-teal-50/70 border border-teal-200 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-teal-900">
                <span>
                  Step {activeStepInfo.stepIndex} of {activeStepInfo.totalSteps}:{' '}
                  {activeStepInfo.label}
                </span>
                <span className="font-mono tabular-nums">
                  {activeStepInfo.done} / {activeStepInfo.total} docs ({activePct}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-teal-100 overflow-hidden">
                <div
                  className="h-full bg-teal-700 transition-all duration-200"
                  style={{ width: `${activePct}%` }}
                />
              </div>
            </div>
          )}

          {/* Detected Sheets Summary Table (Strict Dependency Order) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-800">
                Detected Sheets Summary (Parent-Before-Child Execution Order)
              </h4>
              <span className="text-[11px] text-slate-500">
                Click &ldquo;Preview&rdquo; on any sheet to inspect its first 10 rows below
              </span>
            </div>
            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">Order</th>
                    <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">
                      Sheet / JSON Key
                    </th>
                    <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">
                      Target Firestore Collection
                    </th>
                    <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">Total</th>
                    <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">Valid</th>
                    <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">
                      Skipped
                    </th>
                    <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">Status</th>
                    <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">
                      Inspect
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {combinedPlans.map((plan, idx) => {
                    const result = runResults.find(
                      (r) => r.sourceName === plan.sourceName && r.target === plan.target
                    );
                    const isSelectedPreview = activePreviewPlan?.sourceName === plan.sourceName;

                    return (
                      <tr
                        key={plan.sourceName}
                        className={`${
                          isSelectedPreview ? 'bg-teal-50/50' : 'hover:bg-slate-50'
                        } ${plan.target === null ? 'opacity-70' : ''}`}
                      >
                        <td className="px-2.5 py-2 font-mono text-slate-500 whitespace-nowrap">
                          {plan.target ? `#${idx + 1}` : '—'}
                        </td>
                        <td className="px-2.5 py-2 font-semibold text-slate-900 whitespace-nowrap">
                          {plan.sourceName}
                        </td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <select
                            disabled={committing}
                            value={plan.target ?? ''}
                            onChange={(e) => {
                              const val = e.target.value as ImportTargetKey | '';
                              setTargetOverrides((prev) => ({ ...prev, [plan.sourceName]: val }));
                            }}
                            className="px-2 py-1 text-xs bg-white border border-slate-200 rounded text-slate-800"
                          >
                            <option value="">— Skip / Ignore Sheet —</option>
                            {IMPORT_TARGETS.map((t) => (
                              <option key={t.key} value={t.key}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {plan.totalRows}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                          {plan.validRows.length}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums text-amber-700 whitespace-nowrap">
                          {plan.invalidRows.length}
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          {result ? (
                            result.status === 'running' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[11px] font-semibold">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {result.done}/{result.total}
                              </span>
                            ) : result.status === 'done' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                                <CheckCircle2 className="w-3 h-3" />+{result.created} new · ~
                                {result.updated} upd
                              </span>
                            ) : result.status === 'error' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-semibold">
                                <XCircle className="w-3 h-3" />
                                {result.errors.length} err
                              </span>
                            ) : result.status === 'skipped' ? (
                              <span className="text-[11px] text-slate-400">Skipped (0 valid)</span>
                            ) : (
                              <span className="text-[11px] text-slate-500">Queued</span>
                            )
                          ) : plan.target === null ? (
                            <span className="text-[11px] text-amber-700">Unmapped (Skipped)</span>
                          ) : plan.validRows.length > 0 ? (
                            <span className="text-[11px] text-emerald-700 font-medium">
                              Ready ({plan.newCount} new / {plan.updateCount} upd)
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Empty / No valid rows</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewSheetName(plan.sourceName);
                              setShowInvalidDetails(false);
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border ${
                              isSelectedPreview
                                ? 'bg-teal-700 text-white border-teal-700'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final Per-Collection Summary Panel (after execution) */}
          {runResults.length > 0 && !committing && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Final Per-Collection Import Summary
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {runResults.map((r) => (
                  <div
                    key={`${r.sourceName}-${r.target}`}
                    className={`p-2.5 rounded border text-xs ${
                      r.errors.length > 0
                        ? 'bg-rose-50 border-rose-200 md:col-span-2 lg:col-span-3'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900 truncate">{r.label}</div>
                      {r.errors.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-semibold shrink-0">
                          {r.errors.length} failed row{r.errors.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                      New: <strong className="text-emerald-700">{r.created}</strong> · Updated:{' '}
                      <strong className="text-teal-700">{r.updated}</strong> · Skipped:{' '}
                      <strong className="text-amber-700">{r.skipped}</strong>
                    </div>
                    {r.errors.length > 0 && (
                      <ul className="mt-1.5 max-h-44 overflow-y-auto list-disc pl-4 space-y-1 text-[10px] font-mono text-rose-800 bg-white/80 border border-rose-200 rounded p-2">
                        {r.errors.slice(0, 50).map((errLine, errIdx) => (
                          <li key={errIdx} className="break-words">
                            {errLine}
                          </li>
                        ))}
                        {r.errors.length > 50 && (
                          <li className="italic text-rose-600 list-none">
                            ...and {r.errors.length - 50} more row error(s).
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SINGLE-COLLECTION MODE — SUMMARY & COMMIT BAR                         */}
      {/* ===================================================================== */}
      {!isFullMode && singlePlan && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-[280px]">
              <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-200">
                <div className="text-[10px] uppercase font-semibold text-slate-500">Total Parsed</div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {singlePlan.totalRows}
                </div>
              </div>
              <div className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] uppercase font-semibold text-emerald-700">
                  Valid Ready
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-900">
                  {singlePlan.validRows.length}
                </div>
              </div>
              <div className="px-3 py-2 rounded-md bg-teal-50 border border-teal-200">
                <div className="text-[10px] uppercase font-semibold text-teal-700">
                  {activeTargetDef?.isChildMerge ? 'Parents Updated' : 'New / Update'}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-teal-900">
                  {activeTargetDef?.isChildMerge
                    ? singlePlan.updateCount
                    : `${singlePlan.newCount} / ${singlePlan.updateCount}`}
                </div>
              </div>
              <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
                <div className="text-[10px] uppercase font-semibold text-amber-800">
                  Skipped / Invalid
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-amber-900">
                  {singlePlan.invalidRows.length}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={committing}
                onClick={resetFile}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>
              <button
                type="button"
                disabled={committing || singlePlan.validRows.length === 0}
                onClick={() => void executePlans([singlePlan])}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50 whitespace-nowrap"
              >
                {committing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {committing
                  ? `Importing (${activePct}%)...`
                  : `Commit ${singlePlan.validRows.length} Valid Row${
                      singlePlan.validRows.length === 1 ? '' : 's'
                    }`}
              </button>
            </div>
          </div>

          {activeStepInfo && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-600">
                <span>Writing Firestore batches (400 docs/batch)...</span>
                <span className="font-mono tabular-nums">
                  {activeStepInfo.done} / {activeStepInfo.total} ({activePct}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-teal-600 transition-all duration-200"
                  style={{ width: `${activePct}%` }}
                />
              </div>
            </div>
          )}

          {runResults.length > 0 && !committing && (
            <div
              className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                runResults[0].errors.length === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="font-semibold flex items-center gap-1.5">
                {runResults[0].errors.length === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
                Import Summary — {runResults[0].created} imported new, {runResults[0].updated}{' '}
                updated, {runResults[0].skipped} skipped, {runResults[0].errors.length} row
                error(s)
              </div>
              {runResults[0].errors.length > 0 && (
                <ul className="max-h-56 overflow-y-auto list-disc pl-5 text-[11px] font-mono text-rose-800 space-y-1 bg-white/80 border border-rose-200 rounded p-2">
                  {runResults[0].errors.slice(0, 50).map((e, idx) => (
                    <li key={idx} className="break-words">
                      {e}
                    </li>
                  ))}
                  {runResults[0].errors.length > 50 && (
                    <li className="italic text-rose-600 list-none">
                      ...and {runResults[0].errors.length - 50} more row error(s).
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SHARED 10-ROW PRE-IMPORT PREVIEW & INVALID REASONS FOR ACTIVE SHEET   */}
      {/* ===================================================================== */}
      {activePreviewPlan && previewDef && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          {activePreviewPlan.invalidRows.length > 0 && (
            <div className="border border-amber-200 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setShowInvalidDetails((v) => !v)}
                className="w-full px-3 py-2 bg-amber-50 text-amber-900 text-xs font-semibold flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  {activePreviewPlan.sourceName}: {activePreviewPlan.invalidRows.length} row(s)
                  skipped due to validation rules
                </span>
                {showInvalidDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {showInvalidDetails && (
                <div className="max-h-44 overflow-y-auto divide-y divide-amber-100 bg-white text-[11px]">
                  {activePreviewPlan.invalidRows.slice(0, 50).map((r) => (
                    <div key={r.rowNumber} className="px-3 py-1.5 flex items-center gap-3">
                      <span className="font-mono text-slate-500 w-16 shrink-0">
                        Row #{r.rowNumber}
                      </span>
                      <span className="text-rose-700">{r.reason}</span>
                    </div>
                  ))}
                  {activePreviewPlan.invalidRows.length > 50 && (
                    <div className="px-3 py-1.5 text-slate-500 italic">
                      ...and {activePreviewPlan.invalidRows.length - 50} more skipped row(s).
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-800">
                10-Row Pre-Import Preview — {activePreviewPlan.sourceName} ({previewDef.label})
              </h4>
              <span className="text-[11px] text-slate-500">
                Showing first {previewRows.length} of {activePreviewPlan.validatedRows.length} rows
              </span>
            </div>
            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">Row</th>
                    <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">
                      Validation
                    </th>
                    <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">
                      Reason / Note
                    </th>
                    <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">
                      Doc ID
                    </th>
                    {previewDef.previewColumns.map((col) => (
                      <th
                        key={col.key}
                        className="px-2.5 py-2 text-left font-semibold whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4 + previewDef.previewColumns.length}
                        className="px-4 py-6 text-center text-slate-400"
                      >
                        Sheet contains no data rows.
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={row.valid ? 'hover:bg-slate-50' : 'bg-rose-50/50'}
                      >
                        <td className="px-2.5 py-1.5 font-mono text-slate-500 whitespace-nowrap">
                          #{row.rowNumber}
                        </td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          {row.valid ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Valid
                            </span>
                          ) : (
                            <span
                              title={row.reason}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-semibold"
                            >
                              <XCircle className="w-3 h-3" /> Skip
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-[11px] min-w-[180px] max-w-[320px]">
                          {!row.valid ? (
                            <span className="font-medium text-rose-700 leading-snug block">
                              {row.reason || 'Validation failed'}
                            </span>
                          ) : row.note ? (
                            <span className="text-teal-700 leading-snug block">{row.note}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {row.docId || '—'}
                        </td>
                        {previewDef.previewColumns.map((col) => (
                          <td
                            key={col.key}
                            className="px-2.5 py-1.5 text-slate-800 whitespace-nowrap max-w-[200px] truncate"
                          >
                            {String(row.preview[col.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
