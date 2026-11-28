import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { getStaffOptions, StaffDropdownOption } from '../lib/settingsDropdown';

/**
 * Shared React hook returning the unified TPMS staff assignment dropdown options:
 *  - `-` (blank)
 *  - Safe current-value fallback (`[CODE] (Inactive)` if currently assigned to an inactive staff member)
 *  - `TO ASSIGN`
 *  - Active staff from `staffDirectory` (`CODE — Name`)
 */
export function useStaffOptions(
  currentValues?: string | Array<string | undefined | null>
): StaffDropdownOption[] {
  const { staff } = useData();

  const currentKey = Array.isArray(currentValues)
    ? currentValues.map((v) => (v ?? '').trim()).join('\u0000')
    : (currentValues ?? '').trim();

  return useMemo(() => {
    const extras = currentKey ? currentKey.split('\u0000').filter(Boolean) : [];
    return getStaffOptions(staff, undefined, extras);
  }, [staff, currentKey]);
}
