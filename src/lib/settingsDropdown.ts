import { SettingValue } from '../types/tpms';

export interface DynamicOption {
  value: string;
  label: string;
  isLegacy?: boolean;
}

/**
 * Builds dropdown options dynamically from active Firestore settings (falling back to
 * default options if the group hasn't been seeded yet), while preserving any legacy
 * or inactive value already saved on an existing record.
 */
export function buildDynamicSelectOptions(
  activeSettings: SettingValue[],
  fallbackDefaults: readonly string[],
  currentValue?: string | null
): DynamicOption[] {
  const baseValues =
    activeSettings.length > 0
      ? activeSettings.map((s) => s.displayName)
      : Array.from(fallbackDefaults);

  const seen = new Set<string>();
  const options: DynamicOption[] = [];

  for (const val of baseValues) {
    const clean = (val || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ value: clean, label: clean });
  }

  const cur = (currentValue || '').trim();
  if (cur && !seen.has(cur.toLowerCase())) {
    options.push({
      value: cur,
      label: `${cur} (Legacy / Inactive)`,
      isLegacy: true,
    });
  }

  return options;
}
