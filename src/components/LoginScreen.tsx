import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, AlertCircle, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const {
    user,
    accessStatus,
    authError,
    signInWithGoogle,
    signInWithEmail,
    resendVerificationEmail,
    reloadProfile,
    logout,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch {
      // handled in AuthContext
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // handled in AuthContext
    } finally {
      setBusy(false);
    }
  };

  if (accessStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-600">Verifying practice credentials...</p>
        </div>
      </div>
    );
  }

  // Gate screens for authenticated users who are unverified / unauthorized / inactive
  if (
    accessStatus === 'unverified_email' ||
    accessStatus === 'unauthorized_staff' ||
    accessStatus === 'inactive_staff'
  ) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-slate-900">
                {accessStatus === 'unverified_email'
                  ? 'Email Verification Required'
                  : accessStatus === 'inactive_staff'
                  ? 'Staff Account Inactive'
                  : 'Access Not Provisioned'}
              </h2>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {accessStatus === 'unverified_email' && (
                  <>
                    Your account <span className="font-mono font-medium">{user?.email}</span> has
                    not been verified yet. Please verify your email address before accessing client
                    tax files.
                  </>
                )}
                {accessStatus === 'inactive_staff' && (
                  <>
                    The staff record for{' '}
                    <span className="font-mono font-medium">{user?.email}</span> is currently marked
                    as inactive. Contact your Practice Administrator to reactivate access.
                  </>
                )}
                {accessStatus === 'unauthorized_staff' && (
                  <>
                    The email <span className="font-mono font-medium">{user?.email}</span> is not
                    registered in the firm&apos;s <span className="font-mono">staff</span> directory.
                    Ask an Admin to add your email under Administration → Staff &amp; Settings.
                  </>
                )}
              </p>
            </div>
          </div>

          {verificationSent && (
            <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Verification email sent. Check your inbox and click Refresh Status.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {accessStatus === 'unverified_email' && (
              <button
                type="button"
                onClick={async () => {
                  await resendVerificationEmail();
                  setVerificationSent(true);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
              >
                Resend Verification Email
              </button>
            )}
            <button
              type="button"
              onClick={() => void reloadProfile()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Status
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors ml-auto"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 grid lg:grid-cols-2">
      {/* Left Institutional Panel */}
      <div className="hidden lg:flex flex-col justify-between bg-slate-900 text-white p-12">
        <div>
          <div className="inline-flex items-center gap-2 text-teal-400 text-xs font-semibold tracking-wide">
            <ShieldCheck className="w-4 h-4" />
            Malaysian Chartered Tax Practice Suite
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight leading-tight max-w-md">
            Tax Practice Management System
          </h1>
          <p className="mt-4 text-sm text-slate-300 max-w-md leading-relaxed">
            Centralized LHDN compliance operations, 40-field Client Master governance, CP204 and
            Form C/B/BE/E registers, tax payment monitoring, and role-based practice analytics.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 pt-8 border-t border-slate-800 max-w-md">
          <div>
            <div className="text-xs font-semibold text-white">Role-Based Governance</div>
            <p className="mt-1 text-xs text-slate-400">
              Admin, Manager-HOD, Staff, and strictly read-only Report Viewer controls.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-white">LHDN &amp; MyInvois Ready</div>
            <p className="mt-1 text-xs text-slate-400">
              TIN, E Number, MyTax Appointment, SME status, SST, and phased e-Invoice tracking.
            </p>
          </div>
        </div>
      </div>

      {/* Right Sign-In Form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-7 shadow-xs">
          <div className="mb-6">
            <h2 className="font-display text-xl font-bold text-slate-900">Staff Sign In</h2>
            <p className="mt-1 text-xs text-slate-500">
              Authenticate with your registered firm account to continue.
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Google Sign-In */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGoogleLogin()}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-[11px] font-medium text-slate-400">or Email &amp; Password</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <form onSubmit={(e) => void handleEmailLogin(e)} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Work Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@taxfirm.com.my"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {busy ? 'Signing in...' : 'Sign In with Email'}
            </button>
          </form>

          <p className="mt-5 text-[11px] text-slate-400 text-center leading-relaxed">
            Authorized staff only. Access is matched against the firm&apos;s Cloud Firestore staff
            directory.
          </p>
        </div>
      </div>
    </div>
  );
};
