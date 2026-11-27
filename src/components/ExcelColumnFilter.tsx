import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowUpZA, Check, Search, X } from 'lucide-react';

export const EXCEL_BLANK_TOKEN = '__TPMS_BLANK__';
export const EXCEL_BLANK_LABEL = '(Blanks)';

export type ExcelSortDirection = 'asc' | 'desc';

export interface ExcelSortState {
  key: string;
  direction: ExcelSortDirection;
}

export type ExcelColumnFilterMap = Record<string, string[] | undefined>;

export function normalizeExcelCellValue(raw: unknown): string {
  if (raw === null || raw === undefined) return EXCEL_BLANK_TOKEN;
  const s = String(raw).trim();
  if (s === '' || s === '—' || s === '-') return EXCEL_BLANK_TOKEN;
  return s;
}

export function formatExcelValueLabel(token: string): string {
  return token === EXCEL_BLANK_TOKEN ? EXCEL_BLANK_LABEL : token;
}

/**
 * Natural comparator supporting blanks (always last on asc), ISO dates, DD/MM/YYYY dates,
 * currency/numbers, and case-insensitive strings.
 */
export function compareExcelValues(aRaw: unknown, bRaw: unknown, direction: ExcelSortDirection): number {
  const a = normalizeExcelCellValue(aRaw);
  const b = normalizeExcelCellValue(bRaw);
  if (a === b) return 0;
  if (a === EXCEL_BLANK_TOKEN) return 1;
  if (b === EXCEL_BLANK_TOKEN) return -1;

  const mult = direction === 'asc' ? 1 : -1;

  // Check DD/MM/YYYY
  const ddmmyyyyA = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(a);
  const ddmmyyyyB = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(b);
  if (ddmmyyyyA && ddmmyyyyB) {
    const isoA = `${ddmmyyyyA[3]}-${ddmmyyyyA[2]}-${ddmmyyyyA[1]}`;
    const isoB = `${ddmmyyyyB[3]}-${ddmmyyyyB[2]}-${ddmmyyyyB[1]}`;
    return isoA.localeCompare(isoB) * mult;
  }

  // Check numeric / RM currency
  const numCleanA = a.replace(/^RM\s*/i, '').replace(/,/g, '').replace(/%$/, '').trim();
  const numCleanB = b.replace(/^RM\s*/i, '').replace(/,/g, '').replace(/%$/, '').trim();
  const numA = Number(numCleanA);
  const numB = Number(numCleanB);
  if (
    numCleanA !== '' &&
    numCleanB !== '' &&
    Number.isFinite(numA) &&
    Number.isFinite(numB) &&
    !/^\d{4}-\d{2}-\d{2}/.test(a)
  ) {
    return (numA - numB) * mult;
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) * mult;
}

export interface ExcelColumnFilterProps {
  columnKey: string;
  title: string;
  values: string[];
  selectedValues: string[] | undefined;
  onChangeSelected: (next: string[] | undefined) => void;
  sortDirection: ExcelSortDirection | null;
  onSort: (direction: ExcelSortDirection) => void;
  align?: 'left' | 'right' | 'center';
}

export const ExcelColumnFilter: React.FC<ExcelColumnFilterProps> = ({
  columnKey,
  title,
  values,
  selectedValues,
  onChangeSelected,
  sortDirection,
  onSort,
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  }>({ left: 12, top: 12, maxHeight: 380 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const uniqueValues = useMemo(() => {
    const set = new Set<string>();
    for (const v of values) {
      set.add(normalizeExcelCellValue(v));
    }
    const arr = Array.from(set);
    arr.sort((a, b) => compareExcelValues(a, b, 'asc'));
    return arr;
  }, [values]);

  const isFilterActive = selectedValues !== undefined;
  const isSorted = sortDirection !== null;

  const selectedSet = useMemo(() => {
    if (selectedValues === undefined) {
      return new Set<string>(uniqueValues);
    }
    return new Set<string>(selectedValues);
  }, [selectedValues, uniqueValues]);

  const filteredUniqueValues = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uniqueValues;
    return uniqueValues.filter((token) =>
      formatExcelValueLabel(token).toLowerCase().includes(q)
    );
  }, [uniqueValues, search]);

  const updatePopoverPosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popWidth = 280;
    const margin = 12;

    let left = align === 'right' ? rect.right - popWidth : rect.left;
    if (left + popWidth > window.innerWidth - margin) {
      left = window.innerWidth - popWidth - margin;
    }
    if (left < margin) left = margin;

    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    if (spaceBelow < 340 && spaceAbove > spaceBelow) {
      const bottom = Math.max(margin, window.innerHeight - rect.top + 4);
      const maxHeight = Math.max(200, Math.min(440, spaceAbove - 4));
      setCoords({ left, bottom, maxHeight });
    } else {
      const top = Math.max(margin, rect.bottom + 4);
      const maxHeight = Math.max(200, Math.min(440, spaceBelow - 4));
      setCoords({ left, top, maxHeight });
    }
  };

  useEffect(() => {
    if (!open) return;
    updatePopoverPosition();

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScrollOrResize = () => updatePopoverPosition();

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, align]);

  const toggleValue = (token: string) => {
    const next = new Set(selectedSet);
    if (next.has(token)) {
      next.delete(token);
    } else {
      next.add(token);
    }
    if (next.size === uniqueValues.length && uniqueValues.every((v) => next.has(v))) {
      onChangeSelected(undefined);
    } else {
      onChangeSelected(Array.from(next));
    }
  };

  const handleSelectAll = () => {
    if (search.trim()) {
      const next = new Set(selectedSet);
      for (const v of filteredUniqueValues) next.add(v);
      if (next.size === uniqueValues.length && uniqueValues.every((v) => next.has(v))) {
        onChangeSelected(undefined);
      } else {
        onChangeSelected(Array.from(next));
      }
    } else {
      onChangeSelected(undefined);
    }
  };

  const handleDeselectAll = () => {
    if (search.trim()) {
      const next = new Set(selectedSet);
      for (const v of filteredUniqueValues) next.delete(v);
      onChangeSelected(Array.from(next));
    } else {
      onChangeSelected([]);
    }
  };

  const handleClearFilter = () => {
    setSearch('');
    onChangeSelected(undefined);
    setOpen(false);
  };

  const selectedCount = selectedValues === undefined ? uniqueValues.length : selectedValues.length;

  return (
    <div
      className={`inline-flex items-center gap-1 max-w-full ${
        align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
      }`}
    >
      <span className="truncate">{title}</span>
      <button
        ref={triggerRef}
        type="button"
        data-column-filter={columnKey}
        onClick={(e) => {
          e.stopPropagation();
          setSearch('');
          if (!open) updatePopoverPosition();
          setOpen((prev) => !prev);
        }}
        title={
          isFilterActive
            ? `Filter active on ${title} (${selectedCount} selected)`
            : `Filter & sort ${title}`
        }
        className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] leading-none border transition-colors shrink-0 no-print ${
          isFilterActive
            ? 'bg-teal-700 text-white border-teal-700 font-bold'
            : isSorted
            ? 'bg-teal-50 text-teal-800 border-teal-300 font-bold'
            : 'bg-white/80 text-slate-500 border-slate-300/80 hover:bg-slate-100 hover:text-slate-900'
        }`}
        aria-label={`Filter ${title}`}
        aria-expanded={open}
      >
        ▾
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              left: coords.left,
              ...(coords.top !== undefined ? { top: coords.top } : {}),
              ...(coords.bottom !== undefined ? { bottom: coords.bottom } : {}),
              maxHeight: coords.maxHeight,
            }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[90] w-[280px] bg-white border border-slate-200 rounded-lg shadow-xl text-left font-normal normal-case tracking-normal text-slate-800 select-none flex flex-col overflow-hidden"
          >
            {/* Sticky Header */}
            <div className="shrink-0 px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900 truncate">{title}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
                aria-label="Close filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sort Buttons */}
            <div className="shrink-0 p-2 border-b border-slate-100 space-y-1">
              <button
                type="button"
                onClick={() => onSort('asc')}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  sortDirection === 'asc'
                    ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200'
                    : 'text-slate-700 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <ArrowDownAZ className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>Oldest to newest / A → Z</span>
              </button>
              <button
                type="button"
                onClick={() => onSort('desc')}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  sortDirection === 'desc'
                    ? 'bg-teal-50 text-teal-900 font-semibold border border-teal-200'
                    : 'text-slate-700 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <ArrowUpZA className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                <span>Newest to oldest / Z → A</span>
              </button>
            </div>

            {/* Search + Select All / Uncheck All */}
            <div className="shrink-0 p-2 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search values..."
                  className="w-full pl-7 pr-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="font-medium text-slate-600 hover:text-rose-700 hover:underline"
                >
                  Uncheck All
                </button>
              </div>
            </div>

            {/* Scrollable Unique Value Checkboxes */}
            <div className="flex-1 min-h-0 max-h-60 overflow-y-auto p-1.5 space-y-0.5">
              {filteredUniqueValues.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-slate-400">
                  No matching values
                </div>
              ) : (
                filteredUniqueValues.map((token) => {
                  const checked = selectedSet.has(token);
                  const label = formatExcelValueLabel(token);
                  return (
                    <button
                      key={token}
                      type="button"
                      onClick={() => toggleValue(token)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-slate-700 hover:bg-slate-50 text-left"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-teal-700 border-teal-700 text-white'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        {checked && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span
                        className={`truncate ${
                          token === EXCEL_BLANK_TOKEN ? 'italic text-slate-400' : ''
                        }`}
                        title={label}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Sticky Footer */}
            <div className="shrink-0 px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono tabular-nums text-slate-600">
                {selectedCount} selected
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleClearFilter}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1 text-xs font-semibold text-white bg-teal-700 rounded hover:bg-teal-800"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
