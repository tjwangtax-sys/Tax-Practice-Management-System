import { useCallback, useMemo, useState } from 'react';
import {
  compareExcelValues,
  ExcelColumnFilterMap,
  ExcelSortDirection,
  ExcelSortState,
  normalizeExcelCellValue,
} from '../components/ExcelColumnFilter';

export type ColumnValueGetter<T> = (row: T) => unknown;

/**
 * Reusable hook managing Excel-style per-column multi-select value filters & single-column sort.
 */
export function useExcelTableFilters<T>(
  baseRows: T[],
  valueGetters: Record<string, ColumnValueGetter<T>>
) {
  const [columnFilters, setColumnFilters] = useState<ExcelColumnFilterMap>({});
  const [sortState, setSortState] = useState<ExcelSortState | null>(null);

  const setColumnFilter = useCallback((key: string, selected: string[] | undefined) => {
    setColumnFilters((prev) => {
      if (selected === undefined) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: selected };
    });
  }, []);

  const setColumnSort = useCallback((key: string, direction: ExcelSortDirection) => {
    setSortState((prev) =>
      prev && prev.key === key && prev.direction === direction ? null : { key, direction }
    );
  }, []);

  const resetColumnFilters = useCallback(() => {
    setColumnFilters({});
    setSortState(null);
  }, []);

  const hasActiveColumnFilters = useMemo(
    () => Object.keys(columnFilters).length > 0 || sortState !== null,
    [columnFilters, sortState]
  );

  // Extract unique option tokens per column from baseRows (cascading across other active column filters)
  const getColumnValues = useCallback(
    (columnKey: string): string[] => {
      const getter = valueGetters[columnKey];
      if (!getter) return [];
      const activeOtherKeys = Object.keys(columnFilters).filter(
        (k) => k !== columnKey && columnFilters[k] !== undefined
      );
      const result: string[] = [];
      for (const row of baseRows) {
        let passesOthers = true;
        for (const otherKey of activeOtherKeys) {
          const allowed = columnFilters[otherKey];
          const otherGetter = valueGetters[otherKey];
          if (allowed && otherGetter) {
            const val = normalizeExcelCellValue(otherGetter(row));
            if (!allowed.includes(val)) {
              passesOthers = false;
              break;
            }
          }
        }
        if (passesOthers) {
          result.push(normalizeExcelCellValue(getter(row)));
        }
      }
      return result;
    },
    [baseRows, columnFilters, valueGetters]
  );

  const filteredAndSortedRows = useMemo(() => {
    const activeEntries = Object.entries(columnFilters).filter(
      ([, vals]) => vals !== undefined
    ) as Array<[string, string[]]>;

    let rows =
      activeEntries.length === 0
        ? baseRows
        : baseRows.filter((row) =>
            activeEntries.every(([key, allowed]) => {
              const getter = valueGetters[key];
              if (!getter) return true;
              const val = normalizeExcelCellValue(getter(row));
              return allowed.includes(val);
            })
          );

    if (sortState) {
      const getter = valueGetters[sortState.key];
      if (getter) {
        rows = [...rows].sort((a, b) =>
          compareExcelValues(getter(a), getter(b), sortState.direction)
        );
      }
    }

    return rows;
  }, [baseRows, columnFilters, sortState, valueGetters]);

  return {
    rows: filteredAndSortedRows,
    columnFilters,
    sortState,
    setColumnFilter,
    setColumnSort,
    resetColumnFilters,
    hasActiveColumnFilters,
    getColumnValues,
  };
}
