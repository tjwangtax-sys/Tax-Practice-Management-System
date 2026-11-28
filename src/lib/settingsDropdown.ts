import { SettingValue, StaffMember } from '../types/tpms';

export interface DynamicOption {
  value: string;
  label: string;
  isLegacy?: boolean;
}

/**
 * Normalizes a Controlled Setting group name to a single canonical uppercase space-separated form
 * (e.g. `SME_STATUS` → `SME STATUS`, `ENGAGEMENT_STATUS` → `ENGAGEMENT STATUS`,
 * `JOB_STATUS` → `JOB STATUS`, `E-INVOICE_STATUS` → `E INVOICE STATUS`).
 */
export function normalizeSettingGroup(group: string | null | undefined): string {
  const cleaned = String(group ?? '')
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (cleaned === 'EINVOICE STATUS') return 'E INVOICE STATUS';
  return cleaned;
}

function normalizeToken(val: string | null | undefined): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Builds dropdown options dynamically from active Firestore settings (falling back to
 * default options if the group hasn't been seeded yet).
 * Matches stored field values case-insensitively against both `item.displayName` and
 * `item.code` (including space/underscore/hyphen variants) without appending
 * `(Legacy / Inactive)` when a valid active setting matches.
 */
export function buildDynamicSelectOptions(
  activeSettings: SettingValue[],
  fallbackDefaults: readonly string[],
  currentValue?: string | null
): DynamicOption[] {
  const options: DynamicOption[] = [];
  const seenDisplay = new Set<string>();
  const lookupToIndex = new Map<string, number>();

  const registerLookupKeys = (rawValue: string, idx: number) => {
    const lower = rawValue.trim().toLowerCase();
    if (lower && !lookupToIndex.has(lower)) lookupToIndex.set(lower, idx);
    const norm = normalizeToken(rawValue);
    if (norm && !lookupToIndex.has(norm)) lookupToIndex.set(norm, idx);
  };

  if (activeSettings.length > 0) {
    for (const item of activeSettings) {
      const display = (item.displayName || '').trim();
      const code = (item.code || '').trim();
      const label = display || code;
      if (!label) continue;

      const dedupeKey = label.toLowerCase();
      let idx = seenDisplay.has(dedupeKey) ? lookupToIndex.get(dedupeKey) : undefined;
      if (idx === undefined) {
        seenDisplay.add(dedupeKey);
        idx = options.length;
        options.push({ value: label, label });
      }
      if (display) registerLookupKeys(display, idx);
      if (code) registerLookupKeys(code, idx);
    }
  } else {
    for (const val of fallbackDefaults) {
      const clean = (val || '').trim();
      if (!clean) continue;
      const dedupeKey = clean.toLowerCase();
      if (seenDisplay.has(dedupeKey)) continue;
      seenDisplay.add(dedupeKey);
      const idx = options.length;
      options.push({ value: clean, label: clean });
      registerLookupKeys(clean, idx);
    }
  }

  const cur = (currentValue || '').trim();
  if (cur) {
    const exactMatch = options.find((o) => o.value === cur);
    if (!exactMatch) {
      const matchedIdx =
        lookupToIndex.get(cur.toLowerCase()) ?? lookupToIndex.get(normalizeToken(cur));
      if (matchedIdx !== undefined) {
        // Bind matched option's value to the stored string so <select value={cur}> selects it
        // cleanly with the canonical label and without appending "(Legacy / Inactive)".
        options[matchedIdx] = {
          ...options[matchedIdx],
          value: cur,
        };
      } else {
        options.push({
          value: cur,
          label: `${cur} (Legacy / Inactive)`,
          isLegacy: true,
        });
      }
    }
  }

  return options;
}

export interface StaffDropdownOption {
  value: string;
  label: string;
}

export interface StaffExistingRecords {
  clients?: Array<{ taxPic?: string }>;
  jobs?: Array<{ taxPic?: string; reviewer?: string }>;
  cp204Records?: Array<{
    pic?: string;
    reviewer?: string;
    revisions?: Array<{ pic?: string; reviewer?: string }>;
  }>;
  correspondenceRecords?: Array<{ pic?: string }>;
  workDoneRecords?: Array<{ pic?: string; reviewer?: string }>;
}

/**
 * Shared staff dropdown builder across all TPMS assignment dropdowns.
 * Strictly populates from:
 *  - `-` (blank)
 *  - Safe current-value fallback (only if the edited record currently holds an Inactive or legacy code,
 *    labeled `[CODE] (Inactive)` when matching an Inactive staff record)
 *  - `TO ASSIGN`
 *  - Active staff in `staffDirectory` (formatted `CODE — Name` when both exist)
 *
 * Inactive staff (e.g. AINA, KYC, TQL) and historical codes from other records are never shown
 * in assignment dropdowns.
 */
export function getStaffOptions(
  staffDirectory: StaffMember[],
  _existingRecords?: StaffExistingRecords,
  currentValues?: string | Array<string | undefined | null>
): StaffDropdownOption[] {
  const seenActiveValues = new Set<string>();
  const activeStaffOpts: StaffDropdownOption[] = [];
  const activeNameToStaff = new Map<string, { code: string; name: string }>();
  const inactiveTokens = new Set<string>();

  for (const s of staffDirectory) {
    const code = (s.staffId ?? '').trim();
    const name = (s.staffName ?? '').trim();

    if (!s.active) {
      if (code) inactiveTokens.add(code.toLowerCase());
      if (name) inactiveTokens.add(name.toLowerCase());
      if (code && name) {
        inactiveTokens.add(`${code} — ${name}`.toLowerCase());
        inactiveTokens.add(`${code} - ${name}`.toLowerCase());
      }
      continue;
    }

    const value = code || name;
    if (!value) continue;
    const key = value.toLowerCase();
    if (key === '-' || key === 'to assign' || seenActiveValues.has(key)) continue;
    seenActiveValues.add(key);

    const label =
      code && name && code.toLowerCase() !== name.toLowerCase()
        ? `${code} — ${name}`
        : value;
    activeStaffOpts.push({ value, label });

    if (name) {
      activeNameToStaff.set(name.toLowerCase(), { code, name });
    }
  }
  activeStaffOpts.sort((a, b) => a.label.localeCompare(b.label));

  // Safe Current-Value Fallback (scoped strictly to the record currently being edited)
  const fallbackOpts: StaffDropdownOption[] = [];
  const seenFallback = new Set<string>();
  const currentList =
    typeof currentValues === 'string'
      ? [currentValues]
      : Array.isArray(currentValues)
      ? currentValues
      : [];

  for (const raw of currentList) {
    const val = (raw ?? '').trim();
    if (!val) continue;
    const key = val.toLowerCase();
    if (key === '-' || key === 'to assign') continue;
    if (seenActiveValues.has(key) || seenFallback.has(key)) continue;

    seenFallback.add(key);

    const matchedActiveByName = activeNameToStaff.get(key);
    if (matchedActiveByName) {
      // Stored value is an active staff member's full name instead of staffId — preserve selectable value
      const label =
        matchedActiveByName.code &&
        matchedActiveByName.code.toLowerCase() !== key
          ? `${matchedActiveByName.code} — ${matchedActiveByName.name}`
          : val;
      fallbackOpts.push({ value: val, label });
      continue;
    }

    const isInactiveMatch =
      inactiveTokens.has(key) ||
      val
        .split(/\s*[—–-]\s*/)
        .map((p) => p.trim().toLowerCase())
        .some((p) => p && inactiveTokens.has(p));

    fallbackOpts.push({
      value: val,
      label: isInactiveMatch ? `${val} (Inactive)` : val,
    });
  }

  return [
    { value: '', label: '-' },
    ...fallbackOpts,
    { value: 'TO ASSIGN', label: 'TO ASSIGN' },
    ...activeStaffOpts,
  ];
}
