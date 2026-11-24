import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  RotateCcw,
  Columns3,
  Download,
  FileSpreadsheet,
  Printer,
  FileText,
  Check,
} from 'lucide-react';
import { ColumnDef } from '../types/tpms';

interface RegisterToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters?: React.ReactNode;
  onResetFilters: () => void;
  hasActiveFilters?: boolean;
  columns: ColumnDef[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (key: string) => void;
  onResetColumns: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
  onSavePdf: () => void;
  primaryAction?: React.ReactNode;
  recordCount: number;
  totalCount: number;
}

export const RegisterToolbar: React.FC<RegisterToolbarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  onResetFilters,
  hasActiveFilters = false,
  columns,
  visibleColumns,
  onToggleColumn,
  onResetColumns,
  onExportExcel,
  onPrint,
  onSavePdf,
  primaryAction,
  recordCount,
  totalCount,
}) => {
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const colRef = useRef<HTMLDivElement>(null);
  const expRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (colRef.current && !colRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
      if (expRef.current && !expRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const visibleCount = columns.filter((c) => visibleColumns[c.key]).length;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 no-print">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 transition-colors"
          />
        </div>

        {/* Utility Actions: Reset Filters, Columns, Export Menu, Primary Action */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onResetFilters}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              hasActiveFilters
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </button>

          {/* Column Visibility Toggle */}
          <div className="relative" ref={colRef}>
            <button
              type="button"
              onClick={() => {
                setColMenuOpen((o) => !o);
                setExportMenuOpen(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Columns3 className="w-3.5 h-3.5 text-slate-500" />
              Columns ({visibleCount}/{columns.length})
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-40 py-2">
                <div className="px-3 pb-2 mb-1 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">Visible Columns</span>
                  <button
                    type="button"
                    onClick={onResetColumns}
                    className="text-[11px] font-medium text-teal-700 hover:text-teal-800"
                  >
                    Reset Default
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto px-1.5 space-y-0.5">
                  {columns.map((col) => {
                    const checked = Boolean(visibleColumns[col.key]);
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => onToggleColumn(col.key)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded transition-colors text-left"
                      >
                        <span className="truncate pr-2">{col.label}</span>
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-teal-700 border-teal-700 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Export Menu: Excel, Print, Save as PDF */}
          <div className="relative" ref={expRef}>
            <button
              type="button"
              onClick={() => {
                setExportMenuOpen((o) => !o);
                setColMenuOpen(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Export
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-40 py-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExportExcel();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  Export Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onPrint();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  Print Register
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onSavePdf();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-700" />
                  Save as PDF
                </button>
              </div>
            )}
          </div>

          {primaryAction}
        </div>
      </div>

      {/* Filters Row + Record Count */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
        <div className="text-[11px] text-slate-500 font-mono tabular-nums whitespace-nowrap">
          Showing {recordCount.toLocaleString()} of {totalCount.toLocaleString()} records
        </div>
      </div>
    </div>
  );
};
