import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Eye, UserX, UserCheck, Trash2, Building2 } from 'lucide-react';
import {
  CLIENT_STATUS_OPTIONS,
  ClientCategory,
  ClientRecord,
  ColumnDef,
  FYE_MONTHS,
} from '../../types/tpms';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { ClientModal } from './ClientModal';

const CLIENT_COLUMNS: ColumnDef[] = [
  { key: 'clientId', label: 'Client ID', defaultVisible: true },
  { key: 'clientName', label: 'Client Name', defaultVisible: true },
  { key: 'category', label: 'Category', defaultVisible: true, optional: true },
  { key: 'groupId', label: 'Group ID', defaultVisible: true, optional: true },
  { key: 'fye', label: 'FYE', defaultVisible: true },
  { key: 'taxPic', label: 'TAX PIC', defaultVisible: true },
  { key: 'clientStatus', label: 'Client Status', defaultVisible: true },
  { key: 'taxAgent', label: 'Tax Agent', defaultVisible: false, optional: true },
  { key: 'companyNo', label: 'Company No.', defaultVisible: true, optional: true },
  { key: 'tin', label: 'TIN', defaultVisible: true, optional: true },
  { key: 'eNumber', label: 'E Number', defaultVisible: false, optional: true },
  { key: 'myTaxAppointment', label: 'MyTax Appointment', defaultVisible: true, optional: true },
  {
    key: 'dateOfIncorporation',
    label: 'Date of Incorporation',
    defaultVisible: false,
    optional: true,
  },
  {
    key: 'dateOfCommencementBusiness',
    label: 'Date of commencement business',
    defaultVisible: false,
    optional: true,
  },
  { key: 'companySecretary', label: 'Company Secretary', defaultVisible: false, optional: true },
  { key: 'specialRemarks', label: 'Special Remarks', defaultVisible: false, optional: true },
];

type ClientTab = 'Corporate' | 'Individual' | 'All';

export const ClientMasterView: React.FC = () => {
  const { isAdmin, isManagerOrAdmin, isReadOnly } = useAuth();
  const { clients, loading, getSettingsByGroup, inactivateClient, reactivateClient, deleteClient } =
    useData();

  const [activeTab, setActiveTab] = useState<ClientTab>('Corporate');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fyeFilter, setFyeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);

  // Inactivate confirmation dialog state
  const [inactivatingClient, setInactivatingClient] = useState<ClientRecord | null>(null);
  const [resignDate, setResignDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actionBusy, setActionBusy] = useState(false);

  // Delete confirmation dialog state
  const [deletingClient, setDeletingClient] = useState<ClientRecord | null>(null);

  const { visibleColumns, toggleColumn, resetColumns } = useColumnVisibility(
    'client_master',
    CLIENT_COLUMNS
  );

  const groupIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      if (c.groupId) set.add(c.groupId);
    }
    return Array.from(set).sort();
  }, [clients]);

  const statusOptions = useMemo(() => {
    const seeded = getSettingsByGroup('CLIENT_STATUS').map((s) => s.displayName);
    return seeded.length > 0 ? seeded : [...CLIENT_STATUS_OPTIONS];
  }, [getSettingsByGroup]);

  const tabCounts = useMemo(() => {
    let corp = 0;
    let indiv = 0;
    for (const c of clients) {
      if (c.category === 'Corporate') corp += 1;
      if (c.category === 'Individual') indiv += 1;
    }
    return { Corporate: corp, Individual: indiv, All: clients.length };
  }, [clients]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (activeTab === 'Corporate' && c.category !== 'Corporate') return false;
      if (activeTab === 'Individual' && c.category !== 'Individual') return false;
      if (groupFilter && c.groupId !== groupFilter) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (fyeFilter && c.fye !== fyeFilter) return false;
      if (statusFilter && c.clientStatus.toLowerCase() !== statusFilter.toLowerCase()) return false;

      if (q) {
        const haystack = [c.clientId, c.clientName, c.companyNo, c.tin, c.eNumber]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [clients, activeTab, search, groupFilter, categoryFilter, fyeFilter, statusFilter]);

  const clientValueGetters = useMemo(
    () => ({
      clientId: (c: ClientRecord) => c.clientId,
      clientName: (c: ClientRecord) => c.clientName,
      category: (c: ClientRecord) => c.category,
      groupId: (c: ClientRecord) => c.groupId,
      fye: (c: ClientRecord) => c.fye,
      taxPic: (c: ClientRecord) => c.taxPic,
      clientStatus: (c: ClientRecord) => c.clientStatus,
      taxAgent: (c: ClientRecord) => c.taxAgent,
      companyNo: (c: ClientRecord) => c.companyNo,
      tin: (c: ClientRecord) => c.tin,
      eNumber: (c: ClientRecord) => c.eNumber,
      myTaxAppointment: (c: ClientRecord) => c.myTaxAppointment,
      dateOfIncorporation: (c: ClientRecord) => c.dateOfIncorporation,
      dateOfCommencementBusiness: (c: ClientRecord) => c.dateOfCommencementBusiness,
      companySecretary: (c: ClientRecord) => c.companySecretary,
      specialRemarks: (c: ClientRecord) => c.specialRemarks,
    }),
    []
  );

  const excel = useExcelTableFilters(filteredClients, clientValueGetters);
  const displayedClients = excel.rows;

  const hasActiveFilters = Boolean(
    search ||
      groupFilter ||
      categoryFilter ||
      fyeFilter ||
      statusFilter ||
      excel.hasActiveColumnFilters
  );

  const handleResetFilters = () => {
    setSearch('');
    setGroupFilter('');
    setCategoryFilter('');
    setFyeFilter('');
    setStatusFilter('');
    excel.resetColumnFilters();
  };

  const activeExportCols = CLIENT_COLUMNS.filter((c) => visibleColumns[c.key]);

  const buildExportRows = () =>
    displayedClients.map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      category: c.category,
      groupId: c.groupId,
      fye: c.fye,
      taxPic: c.taxPic,
      clientStatus: c.clientStatus,
      taxAgent: c.taxAgent,
      companyNo: c.companyNo,
      tin: c.tin,
      eNumber: c.eNumber,
      myTaxAppointment: c.myTaxAppointment,
      dateOfIncorporation: c.dateOfIncorporation,
      dateOfCommencementBusiness: c.dateOfCommencementBusiness,
      companySecretary: c.companySecretary,
      specialRemarks: c.specialRemarks,
    }));

  const handleConfirmInactivate = async () => {
    if (!inactivatingClient) return;
    setActionBusy(true);
    try {
      await inactivateClient(inactivatingClient.id, resignDate);
      setInactivatingClient(null);
      setModalOpen(false);
    } finally {
      setActionBusy(false);
    }
  };

  const handleReactivate = async (c: ClientRecord) => {
    setActionBusy(true);
    try {
      await reactivateClient(c.id);
      setModalOpen(false);
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingClient) return;
    setActionBusy(true);
    try {
      await deleteClient(deletingClient.id);
      setDeletingClient(null);
    } finally {
      setActionBusy(false);
    }
  };

  const defaultModalCategory: ClientCategory =
    activeTab === 'Individual' ? 'Individual' : 'Corporate';

  return (
    <div className="space-y-4">
      {/* Module Header + Tabs */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Client Master</h2>
          <p className="text-xs text-slate-500">
            Central Malaysian corporate, individual, and group tax client register
          </p>
        </div>

        {/* Category Tabs: Corporate, Individual, All Clients */}
        <div className="inline-flex p-1 bg-slate-200/70 rounded-lg no-print">
          {(
            [
              { id: 'Corporate', label: 'Corporate', count: tabCounts.Corporate },
              { id: 'Individual', label: 'Individual', count: tabCounts.Individual },
              { id: 'All', label: 'All Clients', count: tabCounts.All },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}{' '}
              <span className="ml-1 font-mono text-[11px] text-slate-400">({t.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Standardized Toolbar */}
      <RegisterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search Client ID, Name, Company No., TIN, E Number..."
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
        columns={CLIENT_COLUMNS}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        onResetColumns={resetColumns}
        recordCount={displayedClients.length}
        totalCount={clients.length}
        onExportExcel={() =>
          exportToExcel(
            `TPMS_Client_Master_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            `Clients_${activeTab}`,
            activeExportCols,
            buildExportRows()
          )
        }
        onPrint={() =>
          printRegisterHtml(
            `Client Master (${activeTab})`,
            `Filtered client register — ${displayedClients.length} records`,
            activeExportCols,
            buildExportRows(),
            false
          )
        }
        onSavePdf={() =>
          printRegisterHtml(
            `Client Master (${activeTab})`,
            `Filtered client register — ${displayedClients.length} records`,
            activeExportCols,
            buildExportRows(),
            true
          )
        }
        filters={
          <>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Group IDs</option>
              {groupIds.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Categories</option>
              <option value="Corporate">Corporate</option>
              <option value="Individual">Individual</option>
              <option value="Other">Other</option>
            </select>

            <select
              value={fyeFilter}
              onChange={(e) => setFyeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-mono"
            >
              <option value="">All FYE (01–12)</option>
              {FYE_MONTHS.map((m) => (
                <option key={m} value={m}>
                  FYE {m}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Client Statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        }
        primaryAction={
          !isReadOnly ? (
            <button
              type="button"
              onClick={() => {
                setEditingClient(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Client
            </button>
          ) : undefined
        }
      />

      {/* High-Density Sticky Header Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-290px)]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700">
              <tr>
                {activeExportCols.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left font-semibold whitespace-nowrap border-b border-slate-200"
                  >
                    <ExcelColumnFilter
                      columnKey={col.key}
                      title={col.label}
                      values={excel.getColumnValues(col.key)}
                      selectedValues={excel.columnFilters[col.key]}
                      onChangeSelected={(next) => excel.setColumnFilter(col.key, next)}
                      sortDirection={
                        excel.sortState?.key === col.key ? excel.sortState.direction : null
                      }
                      onSort={(dir) => excel.setColumnSort(col.key, dir)}
                    />
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap border-b border-slate-200 no-print">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={activeExportCols.length + 1} className="px-3 py-2.5">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : displayedClients.length === 0 ? (
                <tr>
                  <td colSpan={activeExportCols.length + 1} className="px-6 py-12 text-center">
                    <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No clients found</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {clients.length === 0
                        ? 'Add your first Malaysian tax client to start managing LHDN compliance.'
                        : 'Try clearing or adjusting your active filters.'}
                    </p>
                    {!isReadOnly && clients.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingClient(null);
                          setModalOpen(true);
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add First Client
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                displayedClients.map((c) => {
                  const isResigned = c.clientStatus.toLowerCase() === 'resigned';
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/90 transition-colors">
                      {visibleColumns.clientId && (
                        <td className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                          {c.clientId}
                        </td>
                      )}
                      {visibleColumns.clientName && (
                        <td className="px-3 py-2 font-medium text-slate-900 min-w-[200px]">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClient(c);
                              setModalOpen(true);
                            }}
                            className="text-left hover:text-teal-700 hover:underline"
                          >
                            {c.clientName}
                          </button>
                        </td>
                      )}
                      {visibleColumns.category && (
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{c.category}</td>
                      )}
                      {visibleColumns.groupId && (
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                          {c.groupId || '—'}
                        </td>
                      )}
                      {visibleColumns.fye && (
                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                          {c.fye || '—'}
                        </td>
                      )}
                      {visibleColumns.taxPic && (
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {c.taxPic || '—'}
                        </td>
                      )}
                      {visibleColumns.clientStatus && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <StatusPill group="CLIENT_STATUS" value={c.clientStatus} />
                        </td>
                      )}
                      {visibleColumns.taxAgent && (
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {c.taxAgent || '—'}
                        </td>
                      )}
                      {visibleColumns.companyNo && (
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                          {c.companyNo || '—'}
                        </td>
                      )}
                      {visibleColumns.tin && (
                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                          {c.tin || '—'}
                        </td>
                      )}
                      {visibleColumns.eNumber && (
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                          {c.eNumber || '—'}
                        </td>
                      )}
                      {visibleColumns.myTaxAppointment && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <StatusPill group="MYTAX_APPOINTMENT" value={c.myTaxAppointment} />
                        </td>
                      )}
                      {visibleColumns.dateOfIncorporation && (
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                          {c.dateOfIncorporation || '—'}
                        </td>
                      )}
                      {visibleColumns.dateOfCommencementBusiness && (
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                          {c.dateOfCommencementBusiness || '—'}
                        </td>
                      )}
                      {visibleColumns.companySecretary && (
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {c.companySecretary || '—'}
                        </td>
                      )}
                      {visibleColumns.specialRemarks && (
                        <td
                          className="px-3 py-2 text-slate-600 max-w-[240px] truncate"
                          title={c.specialRemarks}
                        >
                          {c.specialRemarks || '—'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right whitespace-nowrap no-print">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClient(c);
                              setModalOpen(true);
                            }}
                            title={isReadOnly ? 'View client details' : 'Edit client'}
                            className="p-1.5 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                          >
                            {isReadOnly ? (
                              <Eye className="w-3.5 h-3.5" />
                            ) : (
                              <Pencil className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {isManagerOrAdmin && !isResigned && (
                            <button
                              type="button"
                              onClick={() => {
                                setResignDate(new Date().toISOString().slice(0, 10));
                                setInactivatingClient(c);
                              }}
                              title="Inactivate (Resigned)"
                              className="p-1.5 rounded text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isManagerOrAdmin && isResigned && (
                            <button
                              type="button"
                              onClick={() => void handleReactivate(c)}
                              title="Reactivate client"
                              className="p-1.5 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeletingClient(c)}
                              title="Delete client permanently"
                              className="p-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Client Modal */}
      <ClientModal
        open={modalOpen}
        client={editingClient}
        defaultCategory={defaultModalCategory}
        onClose={() => setModalOpen(false)}
        onRequestInactivate={(c) => {
          setResignDate(new Date().toISOString().slice(0, 10));
          setInactivatingClient(c);
        }}
        onRequestReactivate={(c) => void handleReactivate(c)}
      />

      {/* Inactivate Confirmation Modal */}
      {inactivatingClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 no-print">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setInactivatingClient(null)}
          />
          <div className="relative z-10 max-w-md w-full bg-white border border-slate-200 rounded-xl p-5 shadow-xl space-y-4">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900">
                Inactivate Client (Mark as RESIGNED)
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Set <span className="font-semibold">{inactivatingClient.clientName}</span> (
                <span className="font-mono">{inactivatingClient.clientId}</span>) status to{' '}
                <span className="font-semibold text-rose-700">Resigned</span> and record the
                resignation date.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Date of Resigned *
              </label>
              <input
                type="date"
                required
                value={resignDate}
                onChange={(e) => setResignDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:border-teal-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInactivatingClient(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy || !resignDate}
                onClick={() => void handleConfirmInactivate()}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md disabled:opacity-50"
              >
                {actionBusy ? 'Updating...' : 'Confirm Inactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Delete Confirmation Modal */}
      {deletingClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 no-print">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setDeletingClient(null)} />
          <div className="relative z-10 max-w-md w-full bg-white border border-slate-200 rounded-xl p-5 shadow-xl space-y-4">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900">Delete Client Record</h3>
              <p className="mt-1 text-xs text-slate-600">
                Permanently delete{' '}
                <span className="font-semibold">{deletingClient.clientName}</span> (
                <span className="font-mono">{deletingClient.clientId}</span>)? Consider using
                Inactivate instead if you need historical audit trail retention.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingClient(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleConfirmDelete()}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md disabled:opacity-50"
              >
                {actionBusy ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
