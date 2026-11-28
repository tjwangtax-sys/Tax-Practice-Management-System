import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  RotateCcw,
  Download,
  FileSpreadsheet,
  Printer,
  FileText,
} from 'lucide-react';
import { ColumnDef } from '../types/tpms';
import { ColumnManagerPopover } from './ColumnManagerPopover';

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
  pinnedColumns?: string[];
  onTogglePin?: (key: string) => void;
  onMoveColumn?: (key: string, direction: 'up' | 'down') => void;
  onReorderColumn?: (fromKey: string, toKey: string) => void;
  onExportExcel: () => void;
  onPrint: () => void;
  onSavePdf: () => void;
  primaryAction?: React.ReactNode;
  recordCount: number;
  totalCount: number;
  summaryText?: string;
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
  pinnedColumns,
  onTogglePin,
  onMoveColumn,
  onReorderColumn,
  onExportExcel,
  onPrint,
  onSavePdf,
  primaryAction,
  recordCount,
  totalCount,
  summaryText,
}) => {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const expRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (expRef.current && !expRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

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

          {/* Column Visibility, Pinning & Reorder Popover */}
          <ColumnManagerPopover
            columns={columns}
            visibleColumns={visibleColumns}
            onToggleColumn={onToggleColumn}
            onResetColumns={onResetColumns}
            pinnedColumns={pinnedColumns}
            onTogglePin={onTogglePin}
            onMoveColumn={onMoveColumn}
            onReorderColumn={onReorderColumn}
            onOpenChange={(isOpen) => {
              if (isOpen) setExportMenuOpen(false);
            }}
          />

          {/* Export Menu: Excel, Print, Save as PDF */}
          <div className="relative" ref={expRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((o) => !o)}
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
          {summaryText ??
            `Showing ${recordCount.toLocaleString()} of ${totalCount.toLocaleString()} records`}
        </div>
      </div>
    </div>
  );
};
