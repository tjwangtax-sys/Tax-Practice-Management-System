import { SettingValue } from '../types/tpms';

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
