import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { subscribeToasts, ToastMessage, ToastVariant } from '../lib/toast';

function getVariantStyle(variant: ToastVariant): {
  container: string;
  icon: React.ReactNode;
} {
  switch (variant) {
    case 'success':
      return {
        container: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
      };
    case 'warning':
      return {
        container: 'bg-amber-50 border-amber-300 text-amber-950',
        icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
      };
    case 'error':
      return {
        container: 'bg-rose-50 border-rose-300 text-rose-950',
        icon: <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />,
      };
    default:
      return {
        container: 'bg-slate-900 border-slate-700 text-white',
        icon: <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />,
      };
  }
}

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const timers = new Map<string, number>();

    const unsubscribe = subscribeToasts((toast) => {
      setToasts((prev) => [...prev.slice(-4), toast]);
      const timerId = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        timers.delete(toast.id);
      }, toast.durationMs);
      timers.set(toast.id, timerId);
    });

    return () => {
      unsubscribe();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-md w-[calc(100vw-2rem)] pointer-events-none no-print"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const { container, icon } = getVariantStyle(toast.variant);
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-lg text-xs leading-relaxed ${container}`}
          >
            {icon}
            <div className="flex-1 break-words font-medium">{toast.message}</div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="p-0.5 rounded opacity-70 hover:opacity-100 shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
