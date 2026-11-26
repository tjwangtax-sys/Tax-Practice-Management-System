export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

type ToastListener = (toast: ToastMessage) => void;

const listeners = new Set<ToastListener>();

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showToast(
  message: string,
  variant: ToastVariant = 'info',
  durationMs = 5500
): void {
  const payload: ToastMessage = {
    id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    message,
    variant,
    durationMs,
  };
  listeners.forEach((fn) => fn(payload));
}
