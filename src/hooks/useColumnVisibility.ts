import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { ColumnDef, StoredColumnPrefsV2 } from '../types/tpms';
import { useOptionalData } from '../context/DataContext';

const DEFAULT_PINNED_FALLBACK = ['clientId', 'clientName'];

function getV2StorageKey(moduleKey: string): string {
  return `tpms_cols_${moduleKey}_v2`;
}

function getLegacyStorageKey(moduleKey: string): string {
  return `tpms_cols_${moduleKey}`;
}

function buildDefaultVisible(columns: ColumnDef[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const col of columns) {
    map[col.key] = col.defaultVisible;
  }
  return map;
}

function buildDefaultOrder(columns: ColumnDef[]): string[] {
  return columns.map((c) => c.key);
}

function buildDefaultPinned(columns: ColumnDef[], defaultPinnedKeys?: string[]): string[] {
  const validKeys = new Set(columns.map((c) => c.key));
  const candidates =
    defaultPinnedKeys !== undefined ? defaultPinnedKeys : DEFAULT_PINNED_FALLBACK;
  return candidates.filter((k) => validKeys.has(k));
}

function buildDefaultPrefs(
  columns: ColumnDef[],
  defaultPinnedKeys?: string[]
): StoredColumnPrefsV2 {
  return {
    version: 2,
    visible: buildDefaultVisible(columns),
    pinned: buildDefaultPinned(columns, defaultPinnedKeys),
    order: buildDefaultOrder(columns),
  };
}

/**
 * Merges a raw persisted preference object against the current module's column definitions.
 * Preserves saved visibility, pins, and column order while smoothly appending any newly added
 * columns at their natural schema position (right after their schema predecessor).
 */
function sanitizePrefs(
  raw: unknown,
  columns: ColumnDef[],
  defaultPinnedKeys?: string[],
  isLegacyMigration = false
): StoredColumnPrefsV2 {
  const defaults = buildDefaultPrefs(columns, defaultPinnedKeys);
  if (!raw || typeof raw !== 'object') return defaults;

  const validKeys = new Set(columns.map((c) => c.key));
  const obj = raw as Record<string, unknown>;

  // If migrating legacy CP204 v1 prefs (which used separate clientId/clientName columns instead of
  // the new single-screen combined `client` column), start cleanly with the new v2 compact layout.
  if (
    isLegacyMigration &&
    validKeys.has('client') &&
    !validKeys.has('clientId') &&
    !validKeys.has('clientName')
  ) {
    const rawVis =
      obj.version === 2 && obj.visible && typeof obj.visible === 'object'
        ? (obj.visible as Record<string, unknown>)
        : obj;
    if (!('client' in rawVis) && ('clientId' in rawVis || 'clientName' in rawVis)) {
      return defaults;
    }
  }

  // Detect v2 structured format vs legacy flat Record<string, boolean>
  const isV2 = obj.version === 2 && obj.visible && typeof obj.visible === 'object';

  const rawVisible: Record<string, unknown> = isV2
    ? (obj.visible as Record<string, unknown>)
    : obj;

  const visible: Record<string, boolean> = { ...defaults.visible };
  for (const col of columns) {
    if (typeof rawVisible[col.key] === 'boolean') {
      visible[col.key] = rawVisible[col.key] as boolean;
    }
  }

  // Ensure at least one column remains visible
  if (!Object.values(visible).some(Boolean) && columns.length > 0) {
    visible[columns[0].key] = true;
  }

  let pinned: string[] = defaults.pinned;
  if (isV2 && Array.isArray(obj.pinned)) {
    const seen = new Set<string>();
    const nextPinned: string[] = [];
    for (const k of obj.pinned) {
      if (typeof k === 'string' && validKeys.has(k) && !seen.has(k)) {
        seen.add(k);
        nextPinned.push(k);
      }
    }
    pinned = nextPinned;
  }

  let order: string[] = defaults.order;
  if (isV2 && Array.isArray(obj.order)) {
    const seen = new Set<string>();
    const nextOrder: string[] = [];
    for (const k of obj.order) {
      if (typeof k === 'string' && validKeys.has(k) && !seen.has(k)) {
        seen.add(k);
        nextOrder.push(k);
      }
    }
    // Insert any newly added schema columns at their natural relative position
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      if (!seen.has(col.key)) {
        seen.add(col.key);
        const prevCol = i > 0 ? columns[i - 1] : null;
        const prevIdx = prevCol ? nextOrder.indexOf(prevCol.key) : -1;
        if (prevIdx >= 0) {
          nextOrder.splice(prevIdx + 1, 0, col.key);
        } else {
          nextOrder.push(col.key);
        }
      }
    }
    order = nextOrder;
  }

  const updatedAtMs =
    isV2 && typeof obj.updatedAtMs === 'number' ? obj.updatedAtMs : undefined;

  return {
    version: 2,
    visible,
    pinned,
    order,
    ...(updatedAtMs !== undefined ? { updatedAtMs } : {}),
  };
}

function readLocalPrefs(
  moduleKey: string,
  columns: ColumnDef[],
  defaultPinnedKeys?: string[]
): { prefs: StoredColumnPrefsV2; foundInStorage: boolean } {
  try {
    const v2Raw = localStorage.getItem(getV2StorageKey(moduleKey));
    if (v2Raw) {
      return {
        prefs: sanitizePrefs(JSON.parse(v2Raw), columns, defaultPinnedKeys, false),
        foundInStorage: true,
      };
    }
    const legacyRaw = localStorage.getItem(getLegacyStorageKey(moduleKey));
    if (legacyRaw) {
      const migrated = sanitizePrefs(JSON.parse(legacyRaw), columns, defaultPinnedKeys, true);
      return { prefs: migrated, foundInStorage: true };
    }
  } catch {
    // Ignore storage read/parse errors
  }
  return {
    prefs: buildDefaultPrefs(columns, defaultPinnedKeys),
    foundInStorage: false,
  };
}

function writeLocalPrefs(moduleKey: string, prefs: StoredColumnPrefsV2): void {
  try {
    localStorage.setItem(getV2StorageKey(moduleKey), JSON.stringify(prefs));
  } catch {
    // Ignore storage write errors
  }
}

export function useColumnVisibility(
  moduleKey: string,
  columns: ColumnDef[],
  defaultPinnedKeys?: string[]
) {
  const dataCtx = useOptionalData();

  const columnsSignature = useMemo(
    () => columns.map((c) => `${c.key}:${c.defaultVisible ? '1' : '0'}`).join('|'),
    [columns]
  );
  const pinnedSignature = useMemo(
    () => (defaultPinnedKeys ? defaultPinnedKeys.join('|') : '__default__'),
    [defaultPinnedKeys]
  );

  // Synchronous lazy init from localStorage so saved show/hide, pin, and order render immediately
  const [prefs, setPrefs] = useState<StoredColumnPrefsV2>(() => {
    const { prefs: localPrefs } = readLocalPrefs(moduleKey, columns, defaultPinnedKeys);
    return localPrefs;
  });

  const prefsRef = useRef<StoredColumnPrefsV2>(prefs);
  prefsRef.current = prefs;

  const prevModuleKeyRef = useRef<string>(moduleKey);
  const hasLocalMutationRef = useRef<boolean>(false);
  const lastAppliedRemoteTsRef = useRef<number>(-1);

  // If moduleKey changes, reload saved prefs for the new module.
  // If only columns schema changed (e.g. a new column added in code), merge without wiping saved state.
  useEffect(() => {
    if (prevModuleKeyRef.current !== moduleKey) {
      prevModuleKeyRef.current = moduleKey;
      hasLocalMutationRef.current = false;
      lastAppliedRemoteTsRef.current = -1;
      const { prefs: loaded } = readLocalPrefs(moduleKey, columns, defaultPinnedKeys);
      setPrefs(loaded);
      return;
    }

    setPrefs((prev) => sanitizePrefs(prev, columns, defaultPinnedKeys, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey, columnsSignature, pinnedSignature]);

  // Hydrate from Firestore userPreferences once loaded (or if a newer change arrived from another device/session)
  const remotePref = dataCtx?.columnPreferences?.[moduleKey];
  const remoteLoaded = Boolean(dataCtx?.columnPreferencesLoaded);

  useEffect(() => {
    if (!remoteLoaded || !remotePref) return;
    const remoteTs = remotePref.updatedAtMs ?? 0;
    const localTs = prefsRef.current.updatedAtMs ?? 0;

    // Skip if we already applied this exact remote timestamp
    if (remoteTs > 0 && remoteTs === lastAppliedRemoteTsRef.current) return;

    // Apply remote preference if user hasn't mutated locally yet in this mount OR remote is strictly newer
    if (!hasLocalMutationRef.current || remoteTs > localTs) {
      const sanitized = sanitizePrefs(remotePref, columns, defaultPinnedKeys, false);
      lastAppliedRemoteTsRef.current = remoteTs;
      setPrefs(sanitized);
      writeLocalPrefs(moduleKey, sanitized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteLoaded, remotePref, moduleKey, columnsSignature, pinnedSignature]);

  const persist = useCallback(
    (updater: (prev: StoredColumnPrefsV2) => StoredColumnPrefsV2) => {
      hasLocalMutationRef.current = true;
      setPrefs((prev) => {
        const rawNext = updater(prev);
        const next: StoredColumnPrefsV2 = {
          ...rawNext,
          version: 2,
          updatedAtMs: Date.now(),
        };
        writeLocalPrefs(moduleKey, next);
        dataCtx?.saveColumnPreference(moduleKey, next);
        return next;
      });
    },
    [moduleKey, dataCtx]
  );

  const toggleColumn = useCallback(
    (key: string) => {
      persist((prev) => {
        const nextVisible = { ...prev.visible, [key]: !prev.visible[key] };
        const anyVisible = Object.values(nextVisible).some(Boolean);
        if (!anyVisible) return prev;
        return { ...prev, visible: nextVisible };
      });
    },
    [persist]
  );

  const togglePin = useCallback(
    (key: string) => {
      persist((prev) => {
        const isCurrentlyPinned = prev.pinned.includes(key);
        const nextPinned = isCurrentlyPinned
          ? prev.pinned.filter((k) => k !== key)
          : [...prev.pinned, key];
        // When pinning a hidden column, automatically make it visible so the pin takes effect cleanly
        const nextVisible = isCurrentlyPinned ? prev.visible : { ...prev.visible, [key]: true };
        return { ...prev, visible: nextVisible, pinned: nextPinned };
      });
    },
    [persist]
  );

  const moveColumn = useCallback(
    (key: string, direction: 'up' | 'down') => {
      persist((prev) => {
        const idx = prev.order.indexOf(key);
        if (idx === -1) return prev;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= prev.order.length) return prev;
        const nextOrder = [...prev.order];
        const [moved] = nextOrder.splice(idx, 1);
        nextOrder.splice(targetIdx, 0, moved);
        return { ...prev, order: nextOrder };
      });
    },
    [persist]
  );

  const reorderColumn = useCallback(
    (fromKey: string, toKey: string) => {
      if (fromKey === toKey) return;
      persist((prev) => {
        const fromIdx = prev.order.indexOf(fromKey);
        const toIdx = prev.order.indexOf(toKey);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const nextOrder = [...prev.order];
        const [moved] = nextOrder.splice(fromIdx, 1);
        nextOrder.splice(toIdx, 0, moved);
        return { ...prev, order: nextOrder };
      });
    },
    [persist]
  );

  const resetColumns = useCallback(() => {
    persist(() => buildDefaultPrefs(columns, defaultPinnedKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, columnsSignature, pinnedSignature]);

  const colMap = useMemo(() => {
    const map = new Map<string, ColumnDef>();
    for (const c of columns) map.set(c.key, c);
    return map;
  }, [columns]);

  // All columns in the user's configured sequence (used by ColumnManagerPopover)
  const orderedColumns = useMemo(() => {
    const list: ColumnDef[] = [];
    const seen = new Set<string>();
    for (const key of prefs.order) {
      const col = colMap.get(key);
      if (col && !seen.has(key)) {
        seen.add(key);
        list.push(col);
      }
    }
    for (const col of columns) {
      if (!seen.has(col.key)) {
        seen.add(col.key);
        list.push(col);
      }
    }
    return list;
  }, [prefs.order, colMap, columns]);

  const pinnedSet = useMemo(() => new Set(prefs.pinned), [prefs.pinned]);

  // Visible columns rendered in the table:
  // Pinned columns come first (in their relative configured order), followed by unpinned visible columns.
  const activeColumns = useMemo(() => {
    const visibleOrdered = orderedColumns.filter((c) => Boolean(prefs.visible[c.key]));
    const pinnedVisible = visibleOrdered.filter((c) => pinnedSet.has(c.key));
    const unpinnedVisible = visibleOrdered.filter((c) => !pinnedSet.has(c.key));
    return [...pinnedVisible, ...unpinnedVisible];
  }, [orderedColumns, prefs.visible, pinnedSet]);

  const pinnedActiveKeys = useMemo(
    () => activeColumns.filter((c) => pinnedSet.has(c.key)).map((c) => c.key),
    [activeColumns, pinnedSet]
  );

  return {
    visibleColumns: prefs.visible,
    pinnedColumns: prefs.pinned,
    columnOrder: prefs.order,
    orderedColumns,
    activeColumns,
    pinnedActiveKeys,
    toggleColumn,
    togglePin,
    moveColumn,
    reorderColumn,
    resetColumns,
  };
}

/**
 * Dynamically calculates cumulative `left` pixel offsets for pinned sticky table columns
 * by measuring the actual rendered `<th>` widths via ResizeObserver, with immediate fallback
 * widths before first paint.
 */
export function usePinnedColumnOffsets(
  pinnedActiveKeys: string[],
  fallbackWidths: Record<string, number> = {},
  baseOffsetPx = 0
) {
  const headerRowRef = useRef<HTMLTableRowElement | null>(null);
  const [measuredWidths, setMeasuredWidths] = useState<Record<string, number>>({});

  const pinnedKeySignature = pinnedActiveKeys.join('|');

  useLayoutEffect(() => {
    const tr = headerRowRef.current;
    if (!tr || pinnedActiveKeys.length === 0) {
      setMeasuredWidths({});
      return;
    }

    const measure = () => {
      const cells = tr.querySelectorAll<HTMLTableCellElement>('th[data-pinned-col]');
      const next: Record<string, number> = {};
      cells.forEach((cell) => {
        const key = cell.getAttribute('data-pinned-col');
        if (key) {
          next[key] = Math.round(cell.getBoundingClientRect().width);
        }
      });
      setMeasuredWidths((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((k) => prev[k] === next[k])
        ) {
          return prev;
        }
        return next;
      });
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      const cells = tr.querySelectorAll<HTMLTableCellElement>('th[data-pinned-col]');
      cells.forEach((cell) => observer.observe(cell));
      return () => observer.disconnect();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedKeySignature]);

  const offsets = useMemo(() => {
    const map: Record<string, number> = {};
    let left = baseOffsetPx;
    for (const key of pinnedActiveKeys) {
      map[key] = left;
      left += measuredWidths[key] ?? fallbackWidths[key] ?? 130;
    }
    return map;
  }, [pinnedActiveKeys, measuredWidths, fallbackWidths, baseOffsetPx]);

  const lastPinnedKey =
    pinnedActiveKeys.length > 0 ? pinnedActiveKeys[pinnedActiveKeys.length - 1] : null;
  const pinnedSet = useMemo(() => new Set(pinnedActiveKeys), [pinnedActiveKeys]);

  const getHeaderStickyProps = useCallback(
    (key: string): {
      'data-pinned-col'?: string;
      style?: React.CSSProperties;
      className: string;
    } => {
      if (!pinnedSet.has(key)) {
        return { className: 'sticky top-0 z-20 bg-slate-50' };
      }
      const isLast = key === lastPinnedKey;
      return {
        'data-pinned-col': key,
        style: { left: offsets[key] ?? 0 },
        className: isLast
          ? 'sticky top-0 z-30 bg-slate-50 shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
          : 'sticky top-0 z-30 bg-slate-50 shadow-[inset_-1px_0_0_#e2e8f0]',
      };
    },
    [pinnedSet, lastPinnedKey, offsets]
  );

  const getCellStickyProps = useCallback(
    (
      key: string,
      bgClass = 'bg-white group-hover:bg-slate-50'
    ): {
      style?: React.CSSProperties;
      className: string;
    } => {
      if (!pinnedSet.has(key)) {
        return { className: '' };
      }
      const isLast = key === lastPinnedKey;
      return {
        style: { left: offsets[key] ?? 0 },
        className: isLast
          ? `sticky z-10 ${bgClass} shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]`
          : `sticky z-10 ${bgClass} shadow-[inset_-1px_0_0_#e2e8f0]`,
      };
    },
    [pinnedSet, lastPinnedKey, offsets]
  );

  return {
    headerRowRef,
    offsets,
    lastPinnedKey,
    getHeaderStickyProps,
    getCellStickyProps,
  };
}
