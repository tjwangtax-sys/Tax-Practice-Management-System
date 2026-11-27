import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { NotificationDrawer } from './components/NotificationDrawer';
import { ToastHost } from './components/ToastHost';
import { DashboardView } from './modules/Dashboard/DashboardView';
import { TeamCalendarView } from './modules/Calendar/TeamCalendarView';
import { ClientMasterView } from './modules/ClientMaster/ClientMasterView';
import { JobsModuleView } from './modules/Jobs/JobsModuleView';
import { Cp204ModuleView } from './modules/CP204/Cp204ModuleView';
import { TaxPaymentMonitorView } from './modules/Payments/TaxPaymentMonitorView';
import { CorrespondenceView } from './modules/Correspondence/CorrespondenceView';
import { WorkDoneFinanceView } from './modules/Operations/WorkDoneFinanceView';
import { BasicReportsView } from './modules/Operations/BasicReportsView';
import { KpiPerformanceView } from './modules/Operations/KpiPerformanceView';
import { StaffSettingsView } from './modules/Admin/StaffSettingsView';
import { NavigationFilterPreset, NavRoute } from './types/tpms';

const AppWorkspace: React.FC = () => {
  const { accessStatus, isManagerOrAdmin } = useAuth();
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');
  const [navPreset, setNavPreset] = useState<NavigationFilterPreset | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  if (accessStatus !== 'authorized') {
    return <LoginScreen />;
  }

  const handleSelectRoute = (route: NavRoute, preset?: Omit<NavigationFilterPreset, 'nonce'>) => {
    if (route === 'staff-settings' && !isManagerOrAdmin) return;
    if (preset) {
      setNavPreset({ ...preset, nonce: Date.now() });
    } else {
      setNavPreset(null);
    }
    setActiveRoute(route);
    setMobileNavOpen(false);
  };

  const renderContent = () => {
    switch (activeRoute) {
      case 'dashboard':
        return <DashboardView onNavigate={handleSelectRoute} />;
      case 'team-calendar':
        return <TeamCalendarView onNavigate={handleSelectRoute} />;
      case 'client-master':
        return <ClientMasterView initialFilter={navPreset} />;
      case 'all-jobs':
        return <JobsModuleView mode="ALL" initialFilter={navPreset} />;
      case 'cp204':
        return <Cp204ModuleView initialFilter={navPreset} />;
      case 'corporate':
        return <JobsModuleView mode="Corporate" initialFilter={navPreset} />;
      case 'individual':
        return <JobsModuleView mode="Individual" initialFilter={navPreset} />;
      case 'ad-hoc':
        return <JobsModuleView mode="Ad Hoc" initialFilter={navPreset} />;
      case 'form-e':
        return <JobsModuleView mode="Form E" initialFilter={navPreset} />;
      case 'tax-payment-monitor':
        return <TaxPaymentMonitorView />;
      case 'correspondence':
        return <CorrespondenceView />;
      case 'work-done-finance':
        return <WorkDoneFinanceView />;
      case 'basic-reports':
        return <BasicReportsView />;
      case 'kpi-performance':
        return <KpiPerformanceView />;
      case 'staff-settings':
        return <StaffSettingsView />;
      default:
        return <DashboardView onNavigate={handleSelectRoute} />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full">
        <Sidebar
          activeRoute={activeRoute}
          onSelectRoute={handleSelectRoute}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden no-print">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative z-10 h-full flex">
            <Sidebar
              activeRoute={activeRoute}
              onSelectRoute={handleSelectRoute}
              collapsed={false}
              onToggleCollapse={() => setMobileNavOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          onOpenNotifications={() => setNotificationsOpen(true)}
          onToggleMobileSidebar={() => setMobileNavOpen((o) => !o)}
        />

        <main className="flex-1 overflow-y-auto py-4 sm:py-5">
          <div className="w-full max-w-none px-4">{renderContent()}</div>
        </main>
      </div>

      {/* Notification Slide-Over Panel */}
      <NotificationDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <AppWorkspace />
          <ToastHost />
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
