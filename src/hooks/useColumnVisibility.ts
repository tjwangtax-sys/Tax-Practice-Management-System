import { useState, useCallback, useEffect } from 'react';
import { ColumnDef } from '../types/tpms';

export function useColumnVisibility(moduleKey: string, columns: ColumnDef[]) {
  const storageKey = `tpms_cols_${moduleKey}`;

  const getDefaults = useCallback(() => {
    const map: Record<string, boolean> = {};
    for (const c of columns) {
      map[c.key] = c.defaultVisible;
    }
    return map;
  }, [columns]);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const defaults = getDefaults();
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  // Sync when switching between job sub-modules that share a component
  useEffect(() => {
    const defaults = getDefaults();
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setVisibleColumns(defaults);
      } else {
        setVisibleColumns({ ...defaults, ...(JSON.parse(raw) as Record<string, boolean>) });
      }
    } catch {
      setVisibleColumns(defaults);
    }
  }, [storageKey, getDefaults]);

  const toggleColumn = useCallback(
    (key: string) => {
      setVisibleColumns((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey]
  );

  const resetColumns = useCallback(() => {
    const defaults = getDefaults();
    setVisibleColumns(defaults);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [getDefaults, storageKey]);

  return { visibleColumns, toggleColumn, resetColumns };
}
