import React from 'react';
import { Bell, RefreshCw, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { emailToStaffKey } from '../lib/firebase';
import { StaffRole } from '../types/tpms';

interface HeaderProps {
  onOpenNotifications: () => void;
  onToggleMobileSidebar: () => void;
}

const ROLE_STYLES: Record<StaffRole, string> = {
  Admin: 'bg-teal-50 text-teal-800 border-teal-200',
  'Manager-HOD': 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Staff: 'bg-sky-50 text-sky-800 border-sky-200',
  'Report Viewer': 'bg-slate-100 text-slate-700 border-slate-300',
};

export const Header: React.FC<HeaderProps> = ({
  onOpenNotifications,
  onToggleMobileSidebar,
}) => {
  const { user, staffProfile, role, logout } = useAuth();
  const { notifications, refreshing, refreshAll, localReadIds } = useData();

  const staffKey = user?.email ? emailToStaffKey(user.email) : '';
  const unreadCount = notifications.filter((n) => {
    if (role === 'Report Viewer') {
      return !localReadIds.includes(n.id);
    }
    return !n.readBy.includes(staffKey);
  }).length;

  return (
    <header className="no-print h-13 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-4 shrink-0">
      {/* Left: Mobile toggle + App Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="md:hidden p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="font-display font-bold text-sm sm:text-base tracking-tight text-slate-900 whitespace-nowrap truncate">
          Tax Practice Management System
        </h1>
      </div>

      {/* Right: User + Role Badge, Notification Bell, Refresh, Logout */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {staffProfile && role && (
          <div className="hidden sm:flex items-center gap-2 pr-1">
            <span className="text-xs font-medium text-slate-700 max-w-[160px] truncate">
              {staffProfile.staffName}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${ROLE_STYLES[role]}`}
            >
              {role}
            </span>
          </div>
        )}

        {/* Notification Bell */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Notifications, Suggestions & Announcements"
          aria-label="Open notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold font-mono flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          title="Refresh Firestore registers"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-teal-700' : 'text-slate-500'}`} />
          <span className="hidden md:inline">Refresh</span>
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors whitespace-nowrap shrink-0"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};
