import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X, FileText } from 'lucide-react';

export interface RemarksExtraSection {
  label: string;
  content?: string | null;
}

interface RemarksPreviewCellProps {
  text?: string | null;
  recordTitle: string;
  recordId?: string;
  fieldLabel?: string;
  maxWidthClass?: string;
  emptyPlaceholder?: string;
  textClassName?: string;
  extraSections?: RemarksExtraSection[];
}

export const RemarksPreviewCell: React.FC<RemarksPreviewCellProps> = ({
  text,
  recordTitle,
  recordId,
  fieldLabel = 'Remarks',
  maxWidthClass = 'max-w-[200px]',
  emptyPlaceholder = '—',
  textClassName = 'text-slate-600',
  extraSections,
}) => {
  const [open, setOpen] = useState(false);

  const cleanText = (text ?? '').trim();
  const populatedExtras = (extraSections ?? []).filter((s) => Boolean((s.content ?? '').trim()));
  const hasContent = Boolean(cleanText) || populatedExtras.length > 0;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!hasContent) {
    return <span className="text-slate-400">{emptyPlaceholder}</span>;
  }

  const previewLine = (cleanText || populatedExtras[0]?.content?.trim() || '').replace(/\s+/g, ' ');

  return (
    <>
      <div className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
        <span
          className={`block truncate ${maxWidthClass} ${textClassName}`}
          title={previewLine}
        >
          {previewLine}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 bg-teal-50/80 hover:bg-teal-100 border border-teal-200/80 rounded transition-colors shrink-0 no-print"
          title={`View full ${fieldLabel.toLowerCase()}`}
        >
          <Eye className="w-2.5 h-2.5" />
          View
        </button>
      </div>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 no-print"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${fieldLabel} — ${recordTitle}`}
              className="relative z-10 w-full max-w-lg max-h-[85vh] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>{fieldLabel}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-bold text-sm text-slate-900 break-words">
                      {recordTitle || 'Record Details'}
                    </h3>
                    {recordId && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-mono text-[10px] font-semibold">
                        {recordId}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 shrink-0"
                  aria-label="Close popup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                {cleanText && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3.5 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                    {cleanText}
                  </div>
                )}

                {populatedExtras.map((section) => (
                  <div key={section.label} className="space-y-1">
                    <div className="text-[11px] font-semibold text-slate-600">
                      {section.label}
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                      {section.content?.trim()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Modal Footer */}
              <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
