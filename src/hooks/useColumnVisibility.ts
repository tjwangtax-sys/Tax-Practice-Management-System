import { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { ColumnDef } from '../types/tpms';

interface StoredColumnPrefsV2 {
  version: 2;
  visible: Record<string, boolean>;
  pinned: string[];
  order: string[];
}

export interface ColumnManagerState {
  visibleColumns: Record<string, boolean>;
  pinnedColumns: string[];
  columnOrder: string[];
  orderedColumns: ColumnDef[];
  activeColumns: ColumnDef[];
  pinnedActiveKeys: string[];
  toggleColumn: (key: string) => void;
  togglePin: (key: string) => void;
  moveColumn: (key: string, direction: 'up' | 'down') => void;
  reorderColumn: (fromKey: string, toKey: string) => void;
  resetColumns: () => void;
}

function normalizePrefs(
  columns: ColumnDef[],
  defaultPinnedKeys: string[],
  raw: string | null
): { visible: Record<string, boolean>; pinned: string[]; order: string[] } {
  const validKeys = new Set(columns.map((c) => c.key));
  const defaultVisible: Record<string, boolean> = {};
  for (const c of columns) {
    defaultVisible[c.key] = c.defaultVisible;
  }
  const defaultOrder = columns.map((c) => c.key);
  const defaultPinned = defaultPinnedKeys.filter((k) => validKeys.has(k));

  const buildCanonicalOrder = (rawOrder: string[], pinnedList: string[]) => {
    const pinnedSet = new Set(pinnedList.filter((k) => validKeys.has(k)));
    const dedupedOrder: string[] = [];
    const seen = new Set<string>();
    for (const k of rawOrder) {
      if (validKeys.has(k) && !seen.has(k)) {
        seen.add(k);
        dedupedOrder.push(k);
      }
    }
    for (const k of defaultOrder) {
      if (!seen.has(k)) {
        seen.add(k);
        dedupedOrder.push(k);
      }
    }
    const pinnedInOrder = dedupedOrder.filter((k) => pinnedSet.has(k));
    const unpinnedInOrder = dedupedOrder.filter((k) => !pinnedSet.has(k));
    return {
      pinned: pinnedInOrder,
      order: [...pinnedInOrder, ...unpinnedInOrder],
    };
  };

  if (!raw) {
    const canonical = buildCanonicalOrder(defaultOrder, defaultPinned);
    return { visible: defaultVisible, ...canonical };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as StoredColumnPrefsV2).version === 2
    ) {
      const v2 = parsed as StoredColumnPrefsV2;
      const mergedVisible: Record<string, boolean> = { ...defaultVisible };
      if (v2.visible && typeof v2.visible === 'object') {
        for (const [k, v] of Object.entries(v2.visible)) {
          if (validKeys.has(k) && typeof v === 'boolean') {
            mergedVisible[k] = v;
          }
        }
      }
      const rawPinned = Array.isArray(v2.pinned)
        ? v2.pinned.filter((k): k is string => typeof k === 'string')
        : defaultPinned;
      const rawOrder = Array.isArray(v2.order)
        ? v2.order.filter((k): k is string => typeof k === 'string')
        : defaultOrder;
      const canonical = buildCanonicalOrder(rawOrder, rawPinned);
      return { visible: mergedVisible, ...canonical };
    }

    // Legacy v1 format: Record<string, boolean>
    if (parsed && typeof parsed === 'object') {
      const mergedVisible: Record<string, boolean> = { ...defaultVisible };
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (validKeys.has(k) && typeof v === 'boolean') {
          mergedVisible[k] = v;
        }
      }
      const canonical = buildCanonicalOrder(defaultOrder, defaultPinned);
      return { visible: mergedVisible, ...canonical };
    }
  } catch {
    // ignore malformed localStorage
  }

  const canonical = buildCanonicalOrder(defaultOrder, defaultPinned);
  return { visible: defaultVisible, ...canonical };
}

function persistPrefs(
  storageKey: string,
  state: { visible: Record<string, boolean>; pinned: string[]; order: string[] }
) {
  try {
    const payload: StoredColumnPrefsV2 = {
      version: 2,
      visible: state.visible,
      pinned: state.pinned,
      order: state.order,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

export function useColumnVisibility(
  moduleKey: string,
  columns: ColumnDef[],
  defaultPinnedKeys: string[] = []
): ColumnManagerState {
  const storageKey = `tpms_cols_${moduleKey}`;
  const pinnedSignature = defaultPinnedKeys.join('|');
  const columnsSignature = columns.map((c) => `${c.key}:${c.defaultVisible ? 1 : 0}`).join('|');

  const stableDefaultPinned = useMemo(
    () => defaultPinnedKeys,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinnedSignature]
  );

  const [prefs, setPrefs] = useState<{
    visible: Record<string, boolean>;
    pinned: string[];
    order: string[];
  }>(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      raw = null;
    }
    return normalizePrefs(columns, stableDefaultPinned, raw);
  });

  // Sync when switching between job sub-modules that share a component or when column defs change
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      raw = null;
    }
    setPrefs(normalizePrefs(columns, stableDefaultPinned, raw));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, columnsSignature, pinnedSignature]);

  const toggleColumn = useCallback(
    (key: string) => {
      setPrefs((prev) => {
        const nextVisible = { ...prev.visible, [key]: !prev.visible[key] };
        const next = { ...prev, visible: nextVisible };
        persistPrefs(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const togglePin = useCallback(
    (key: string) => {
      setPrefs((prev) => {
        const isCurrentlyPinned = prev.pinned.includes(key);
        let nextPinned: string[];
        let nextOrder: string[];

        if (isCurrentlyPinned) {
          nextPinned = prev.pinned.filter((k) => k !== key);
          const unpinnedOthers = prev.order.filter((k) => !prev.pinned.includes(k) && k !== key);
          // Place newly unpinned column right at the start of the scrollable columns
          nextOrder = [...nextPinned, key, ...unpinnedOthers];
        } else {
          nextPinned = [...prev.pinned, key];
          const unpinnedOthers = prev.order.filter((k) => !nextPinned.includes(k));
          nextOrder = [...nextPinned, ...unpinnedOthers];
        }

        const next = { ...prev, pinned: nextPinned, order: nextOrder };
        persistPrefs(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const moveColumn = useCallback(
    (key: string, direction: 'up' | 'down') => {
      setPrefs((prev) => {
        const isPinned = prev.pinned.includes(key);
        const group = isPinned
          ? [...prev.pinned]
          : prev.order.filter((k) => !prev.pinned.includes(k));
        const idx = group.indexOf(key);
        if (idx === -1) return prev;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= group.length) return prev;

        const swapped = [...group];
        [swapped[idx], swapped[targetIdx]] = [swapped[targetIdx], swapped[idx]];

        const nextPinned = isPinned ? swapped : prev.pinned;
        const nextUnpinned = isPinned
          ? prev.order.filter((k) => !prev.pinned.includes(k))
          : swapped;
        const next = {
          ...prev,
          pinned: nextPinned,
          order: [...nextPinned, ...nextUnpinned],
        };
        persistPrefs(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const reorderColumn = useCallback(
    (fromKey: string, toKey: string) => {
      if (!fromKey || !toKey || fromKey === toKey) return;
      setPrefs((prev) => {
        const fromIdx = prev.order.indexOf(fromKey);
        const toIdx = prev.order.indexOf(toKey);
        if (fromIdx === -1 || toIdx === -1) return prev;

        const targetIsPinned = prev.pinned.includes(toKey);
        const pinnedSet = new Set(prev.pinned);
        if (targetIsPinned) {
          pinnedSet.add(fromKey);
        } else {
          pinnedSet.delete(fromKey);
        }

        const reordered = [...prev.order];
        reordered.splice(fromIdx, 1);
        const insertIdx = reordered.indexOf(toKey);
        const finalIdx = fromIdx < toIdx ? insertIdx + 1 : insertIdx;
        reordered.splice(finalIdx, 0, fromKey);

        const nextPinned = reordered.filter((k) => pinnedSet.has(k));
        const nextUnpinned = reordered.filter((k) => !pinnedSet.has(k));
        const next = {
          ...prev,
          pinned: nextPinned,
          order: [...nextPinned, ...nextUnpinned],
        };
        persistPrefs(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const resetColumns = useCallback(() => {
    const defaults = normalizePrefs(columns, stableDefaultPinned, null);
    setPrefs(defaults);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [columns, stableDefaultPinned, storageKey]);

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const result: ColumnDef[] = [];
    for (const k of prefs.order) {
      const col = byKey.get(k);
      if (col) result.push(col);
    }
    return result;
  }, [columns, prefs.order]);

  const activeColumns = useMemo(
    () => orderedColumns.filter((c) => Boolean(prefs.visible[c.key])),
    [orderedColumns, prefs.visible]
  );

  const pinnedActiveKeys = useMemo(() => {
    const pinnedSet = new Set(prefs.pinned);
    return activeColumns.filter((c) => pinnedSet.has(c.key)).map((c) => c.key);
  }, [activeColumns, prefs.pinned]);

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
 * Dynamically computes exact cumulative left pixel offsets for any combination
 * of pinned columns by measuring rendered <th> widths via ResizeObserver
 * (with instant fallback to configured column pixel widths on first paint).
 */
export function usePinnedColumnOffsets(
  pinnedActiveKeys: string[],
  fallbackWidths: Record<string, number>,
  leadingOffsetPx = 0
) {
  const headerRowRef = useRef<HTMLTableRowElement | null>(null);
  const [measuredWidths, setMeasuredWidths] = useState<Record<string, number>>({});
  const pinnedSig = pinnedActiveKeys.join('|');

  useLayoutEffect(() => {
    const row = headerRowRef.current;
    if (!row || pinnedActiveKeys.length === 0) {
      setMeasuredWidths({});
      return;
    }

    const measure = () => {
      const next: Record<string, number> = {};
      const cells = row.querySelectorAll<HTMLElement>('[data-pinned-col]');
      cells.forEach((cell) => {
        const key = cell.dataset.pinnedCol;
        if (key) {
          const w = Math.round(cell.getBoundingClientRect().width);
          if (w > 0) next[key] = w;
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

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    const cells = row.querySelectorAll<HTMLElement>('[data-pinned-col]');
    cells.forEach((cell) => ro.observe(cell));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedSig]);

  const offsets = useMemo(() => {
    const map: Record<string, number> = {};
    let acc = leadingOffsetPx;
    for (const key of pinnedActiveKeys) {
      map[key] = acc;
      acc += measuredWidths[key] ?? fallbackWidths[key] ?? 130;
    }
    return map;
  }, [pinnedActiveKeys, measuredWidths, fallbackWidths, leadingOffsetPx]);

  const pinnedSet = useMemo(() => new Set(pinnedActiveKeys), [pinnedActiveKeys]);
  const lastPinnedKey =
    pinnedActiveKeys.length > 0 ? pinnedActiveKeys[pinnedActiveKeys.length - 1] : null;

  const getHeaderStickyProps = useCallback(
    (key: string) => {
      if (!pinnedSet.has(key)) {
        return {
          className: 'sticky top-0 z-20 bg-slate-50',
          style: undefined as React.CSSProperties | undefined,
          'data-pinned-col': undefined as string | undefined,
        };
      }
      const isLast = key === lastPinnedKey;
      return {
        className: `sticky top-0 z-30 bg-slate-50 ${
          isLast
            ? 'shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
            : 'shadow-[inset_-1px_0_0_#e2e8f0]'
        }`,
        style: { left: `${offsets[key] ?? 0}px` } as React.CSSProperties,
        'data-pinned-col': key,
      };
    },
    [pinnedSet, lastPinnedKey, offsets]
  );

  const getCellStickyProps = useCallback(
    (key: string, bgClass = 'bg-white group-hover:bg-slate-50') => {
      if (!pinnedSet.has(key)) {
        return {
          className: '',
          style: undefined as React.CSSProperties | undefined,
        };
      }
      const isLast = key === lastPinnedKey;
      return {
        className: `sticky z-10 ${bgClass} ${
          isLast
            ? 'shadow-[inset_-1px_0_0_#e2e8f0,2px_0_4px_-2px_rgba(15,23,42,0.12)]'
            : 'shadow-[inset_-1px_0_0_#e2e8f0]'
        }`,
        style: { left: `${offsets[key] ?? 0}px` } as React.CSSProperties,
      };
    },
    [pinnedSet, lastPinnedKey, offsets]
  );

  return {
    headerRowRef,
    offsets,
    lastPinnedKey,
    pinnedSet,
    getHeaderStickyProps,
    getCellStickyProps,
  };
}
