import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
  details?: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'An unexpected error occurred.';
    let details: string | undefined;

    try {
      const parsed = JSON.parse(error.message) as {
        error?: string;
        operationType?: string;
        path?: string;
      };
      if (parsed && parsed.error) {
        message = parsed.error;
        details = `Operation: ${parsed.operationType ?? 'unknown'} | Path: ${parsed.path ?? 'n/a'}`;
      }
    } catch {
      // standard Error message
    }

    return { hasError: true, message, details };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('TPMS ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-50 text-red-700 rounded-md shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-900">
                  Unable to complete operation
                </h2>
                <p className="mt-1 text-sm text-slate-600 break-words">
                  {this.state.message}
                </p>
                {this.state.details && (
                  <p className="mt-2 text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 break-all">
                    {this.state.details}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      this.setState({ hasError: false, message: '', details: undefined });
                      window.location.reload();
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reload Workspace
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
