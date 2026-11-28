import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Columns3,
  GripVertical,
  Pin,
  RotateCcw,
} from 'lucide-react';
import { ColumnDef } from '../types/tpms';

interface ColumnManagerPopoverProps {
  columns: ColumnDef[];
  visibleColumns: Record<string, boolean>;
  onToggleColumn: (key: string) => void;
  onResetColumns: () => void;
  pinnedColumns?: string[];
  onTogglePin?: (key: string) => void;
  onMoveColumn?: (key: string, direction: 'up' | 'down') => void;
  onReorderColumn?: (fromKey: string, toKey: string) => void;
  onOpenChange?: (open: boolean) => void;
}

export const ColumnManagerPopover: React.FC<ColumnManagerPopoverProps> = ({
  columns,
  visibleColumns,
  onToggleColumn,
  onResetColumns,
  pinnedColumns = [],
  onTogglePin,
  onMoveColumn,
  onReorderColumn,
  onOpenChange,
}) => {
  const [open, setOpen] = useState(false);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const supportsAdvanced = Boolean(onTogglePin || onMoveColumn || onReorderColumn);
  const pinnedSet = new Set(pinnedColumns);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      onOpenChange?.(next);
      return next;
    });
  };

  const visibleCount = columns.filter((c) => Boolean(visibleColumns[c.key])).length;
  const pinnedCols = columns.filter((c) => pinnedSet.has(c.key));
  const unpinnedCols = columns.filter((c) => !pinnedSet.has(c.key));

  const renderRow = (col: ColumnDef, indexInGroup: number, groupLength: number, isPinned: boolean) => {
    const checked = Boolean(visibleColumns[col.key]);
    const isDragging = draggedKey === col.key;
    const isDragTarget = dragOverKey === col.key && draggedKey !== col.key;

    return (
      <div
        key={col.key}
        draggable={Boolean(onReorderColumn)}
        onDragStart={(e) => {
          if (!onReorderColumn) return;
          setDraggedKey(col.key);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', col.key);
        }}
        onDragOver={(e) => {
          if (!onReorderColumn || !draggedKey || draggedKey === col.key) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragOverKey !== col.key) setDragOverKey(col.key);
        }}
        onDragLeave={() => {
          if (dragOverKey === col.key) setDragOverKey(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!onReorderColumn) return;
          const sourceKey = draggedKey || e.dataTransfer.getData('text/plain');
          if (sourceKey && sourceKey !== col.key) {
            onReorderColumn(sourceKey, col.key);
          }
          setDraggedKey(null);
          setDragOverKey(null);
        }}
        onDragEnd={() => {
          setDraggedKey(null);
          setDragOverKey(null);
        }}
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-colors ${
          isDragging
            ? 'opacity-45 bg-slate-100'
            : isDragTarget
            ? 'bg-teal-50/80 ring-1 ring-teal-500'
            : isPinned
            ? 'bg-teal-50/35 hover:bg-teal-50/70'
            : 'hover:bg-slate-50'
        }`}
      >
        {/* Drag Handle */}
        {onReorderColumn && (
          <span
            className="text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0"
            title="Drag to reorder"
            aria-hidden="true"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}

        {/* Visibility Checkbox + Label */}
        <button
          type="button"
          onClick={() => onToggleColumn(col.key)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
          title={checked ? `Hide ${col.label}` : `Show ${col.label}`}
        >
          <span
            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
              checked
                ? 'bg-teal-700 border-teal-700 text-white'
                : 'border-slate-300 bg-white'
            }`}
          >
            {checked && <Check className="w-3 h-3" />}
          </span>
          <span
            className={`text-xs truncate ${
              checked ? 'text-slate-800 font-medium' : 'text-slate-400'
            }`}
          >
            {col.label}
          </span>
        </button>

        {/* Pin / Fix Left Toggle */}
        {onTogglePin && (
          <button
            type="button"
            onClick={() => onTogglePin(col.key)}
            title={isPinned ? 'Unpin column from left' : 'Pin (fix) column to left'}
            aria-label={isPinned ? `Unpin ${col.label}` : `Pin ${col.label} to left`}
            className={`p-1 rounded transition-colors shrink-0 ${
              isPinned
                ? 'text-teal-700 bg-teal-100/80 hover:bg-teal-200/70'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-teal-700/20' : ''}`} />
          </button>
        )}

        {/* Up / Down Reorder Buttons */}
        {onMoveColumn && (
          <div className="inline-flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              disabled={indexInGroup === 0}
              onClick={() => onMoveColumn(col.key, 'up')}
              title={`Move ${col.label} left / up`}
              aria-label={`Move ${col.label} up`}
              className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              disabled={indexInGroup === groupLength - 1}
              onClick={() => onMoveColumn(col.key, 'down')}
              title={`Move ${col.label} right / down`}
              aria-label={`Move ${col.label} down`}
              className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
          open
            ? 'border-teal-600 bg-teal-50/60 text-teal-900'
            : 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50'
        }`}
      >
        <Columns3 className="w-3.5 h-3.5 text-slate-500" />
        Columns ({visibleCount}/{columns.length})
      </button>

      {open && (
        <div
          className={`absolute right-0 mt-1.5 ${
            supportsAdvanced ? 'w-80' : 'w-64'
          } bg-white border border-slate-200 rounded-lg shadow-lg z-40 py-2`}
        >
          {/* Popover Header */}
          <div className="px-3 pb-2 mb-1.5 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                {supportsAdvanced ? 'Manage Columns' : 'Visible Columns'}
              </span>
              {supportsAdvanced && pinnedCols.length > 0 && (
                <span className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
                  · {pinnedCols.length} pinned
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onResetColumns}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Default
            </button>
          </div>

          {supportsAdvanced && (
            <div className="px-3 pb-1.5 flex items-center justify-between text-[10px] text-slate-400">
              <span>Show/hide, pin left, or drag/arrow to reorder</span>
            </div>
          )}

          {/* Scrollable Column List */}
          <div className="max-h-80 overflow-y-auto px-1.5 space-y-0.5">
            {supportsAdvanced && pinnedCols.length > 0 && (
              <>
                <div className="px-2 pt-0.5 pb-1 flex items-center justify-between text-[10px] font-semibold text-teal-700">
                  <span>Pinned Left ({pinnedCols.length})</span>
                </div>
                {pinnedCols.map((col, idx) => renderRow(col, idx, pinnedCols.length, true))}
                {unpinnedCols.length > 0 && (
                  <div className="my-1.5 mx-2 border-t border-slate-100 pt-1.5 text-[10px] font-semibold text-slate-400">
                    Scrollable Columns ({unpinnedCols.length})
                  </div>
                )}
              </>
            )}

            {supportsAdvanced
              ? unpinnedCols.map((col, idx) => renderRow(col, idx, unpinnedCols.length, false))
              : columns.map((col, idx) => renderRow(col, idx, columns.length, false))}
          </div>
        </div>
      )}
    </div>
  );
};
