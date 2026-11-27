import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Briefcase,
  Calculator,
  Landmark,
  UserCheck,
  FilePlus2,
  FileSpreadsheet,
  CreditCard,
  MailOpen,
  Receipt,
  FileBarChart2,
  TrendingUp,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { NavRoute } from '../types/tpms';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeRoute: NavRoute;
  onSelectRoute: (route: NavRoute) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title?: string;
  adminOnly?: boolean;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'team-calendar', label: 'Team Calendar', icon: CalendarDays },
    ],
  },
  {
    title: 'Client Management',
    items: [{ id: 'client-master', label: 'Client Master', icon: Building2 }],
  },
  {
    title: 'Job Management',
    items: [
      { id: 'all-jobs', label: 'All Jobs', icon: Briefcase },
      { id: 'cp204', label: 'CP204 Monitoring', icon: Calculator },
      { id: 'corporate', label: 'Corporate', icon: Landmark },
      { id: 'individual', label: 'Individual', icon: UserCheck },
      { id: 'ad-hoc', label: 'Ad Hoc', icon: FilePlus2 },
      { id: 'form-e', label: 'Form E', icon: FileSpreadsheet },
      { id: 'tax-payment-monitor', label: 'Tax Payment Monitor', icon: CreditCard },
      { id: 'correspondence', label: 'Correspondence', icon: MailOpen },
    ],
  },
  {
    title: 'Practice Operations',
    items: [
      { id: 'work-done-finance', label: 'Work Done & Finance', icon: Receipt },
      { id: 'basic-reports', label: 'Basic Reports', icon: FileBarChart2 },
      { id: 'kpi-performance', label: 'KPI & Performance Analysis', icon: TrendingUp },
    ],
  },
  {
    title: 'Administration',
    adminOnly: true,
    items: [{ id: 'staff-settings', label: 'Staff & Settings', icon: ShieldCheck }],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeRoute,
  onSelectRoute,
  collapsed,
  onToggleCollapse,
}) => {
  const { isManagerOrAdmin } = useAuth();

  return (
    <aside
      className={`no-print bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 shrink-0 transition-[width] duration-200 ease-out ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand / Collapse Header */}
      <div className="h-13 px-3 flex items-center justify-between border-b border-slate-800 shrink-0">
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-display font-bold text-sm tracking-tight text-white block truncate">
              TPMS Malaysia
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-auto"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_GROUPS.filter((g) => !g.adminOnly || isManagerOrAdmin).map((group, gi) => (
          <div key={group.title ?? `top-${gi}`}>
            {group.title && !collapsed && (
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-400">
                {group.title}
              </div>
            )}
            {group.title && collapsed && (
              <div className="mx-2 my-1.5 border-t border-slate-800" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeRoute === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectRoute(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                        active
                          ? 'bg-teal-700 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      } ${collapsed ? 'justify-center px-0' : ''}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse Sidebar Footer Toggle */}
      <div className="p-2 border-t border-slate-800 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 shrink-0 text-slate-400" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="truncate">Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
