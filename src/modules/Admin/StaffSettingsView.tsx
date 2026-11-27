import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  Plus,
  Pencil,
  Trash2,
  Database,
  GitMerge,
  X,
  CheckCircle2,
  ShieldAlert,
  Save,
  Upload,
} from 'lucide-react';
import { ColumnDef, SettingValue, StaffMember, StaffRole } from '../../types/tpms';
import { SETTING_GROUPS, SETTING_MODULES } from '../../lib/defaultSettings';
import { normalizeSettingGroup } from '../../lib/settingsDropdown';
import { db } from '../../lib/firebase';
import { showToast } from '../../lib/toast';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { useExcelTableFilters } from '../../hooks/useExcelTableFilters';
import { ExcelColumnFilter } from '../../components/ExcelColumnFilter';
import { RegisterToolbar } from '../../components/RegisterToolbar';
import { StatusPill } from '../../components/StatusPill';
import { exportToExcel, printRegisterHtml } from '../../lib/exportUtils';
import { DataImportTab } from './DataImportTab';

const STAFF_COLUMNS: ColumnDef[] = [
  { key: 'staffId', label: 'Staff ID', defaultVisible: true },
  { key: 'staffName', label: 'Staff Name', defaultVisible: true },
  { key: 'email', label: 'Email', defaultVisible: true },
  { key: 'role', label: 'Role', defaultVisible: true },
  { key: 'department', label: 'Department', defaultVisible: true },
  { key: 'designation', label: 'Designation', defaultVisible: false },
  { key: 'phone', label: 'Phone', defaultVisible: false },
  { key: 'active', label: 'Status', defaultVisible: true },
];

const SETTINGS_COLUMNS: ColumnDef[] = [
  { key: 'group', label: 'Group', defaultVisible: true },
  { key: 'code', label: 'Code', defaultVisible: true },
  { key: 'displayName', label: 'Display Name', defaultVisible: true },
  { key: 'module', label: 'Module', defaultVisible: true },
  { key: 'badgeColor', label: 'Badge Preview & Color', defaultVisible: true },
  { key: 'sortOrder', label: 'Sort Order', defaultVisible: true },
  { key: 'active', label: 'Active', defaultVisible: true },
];

export const StaffSettingsView: React.FC = () => {
  const { isAdmin, isManagerOrAdmin, user } = useAuth();
  const {
    staff,
    settings,
    saveStaffMember,
    deleteStaffMember,
    saveSetting,
    deleteSetting,
    seedDefaultSettings,
  } = useData();

  const [tab, setTab] = useState<'staff' | 'settings' | 'import'>(() =>
    isAdmin ? 'staff' : 'settings'
  );

  // Staff filters & modal
  const [staffSearch, setStaffSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [staffActiveFilter, setStaffActiveFilter] = useState('');
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState({
    staffId: '',
    staffName: '',
    email: '',
    role: 'Staff' as StaffRole,
    active: true,
    department: 'Tax Compliance',
    designation: '',
    phone: '',
  });

  // Settings filters & modal
  const [settingSearch, setSettingSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<SettingValue | null>(null);
  const [settingForm, setSettingForm] = useState({
    id: '',
    group: 'CLIENT STATUS',
    code: '',
    displayName: '',
    module: 'Client Master',
    badgeColor: '#0F766E',
    active: true,
    sortOrder: 1,
  });

  const [busy, setBusy] = useState(false);
  const [mergingDuplicates, setMergingDuplicates] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const staffColVis = useColumnVisibility('admin_staff', STAFF_COLUMNS);
  const settingColVis = useColumnVisibility('admin_settings', SETTINGS_COLUMNS);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return staff.filter((s) => {
      if (roleFilter && s.role !== roleFilter) return false;
      if (staffActiveFilter === 'active' && !s.active) return false;
      if (staffActiveFilter === 'inactive' && s.active) return false;
      if (q) {
        const hay = [s.staffId, s.staffName, s.email, s.department, s.designation]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [staff, staffSearch, roleFilter, staffActiveFilter]);

  const distinctGroups = useMemo(() => {
    const set = new Set<string>(SETTING_GROUPS.map((g) => normalizeSettingGroup(g)));
    for (const s of settings) {
      const norm = normalizeSettingGroup(s.group);
      if (norm) set.add(norm);
    }
    return Array.from(set).sort();
  }, [settings]);

  const filteredSettings = useMemo(() => {
    const q = settingSearch.trim().toLowerCase();
    const normGroupFilter = groupFilter ? normalizeSettingGroup(groupFilter) : '';
    return settings.filter((s) => {
      if (normGroupFilter && normalizeSettingGroup(s.group) !== normGroupFilter) return false;
      if (moduleFilter && s.module !== moduleFilter) return false;
      if (q) {
        const hay = [s.group, normalizeSettingGroup(s.group), s.code, s.displayName, s.module, s.badgeColor]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [settings, settingSearch, groupFilter, moduleFilter]);

  const staffValueGetters = useMemo(
    () => ({
      staffId: (s: StaffMember) => s.staffId,
      staffName: (s: StaffMember) => s.staffName,
      email: (s: StaffMember) => s.email,
      role: (s: StaffMember) => s.role,
      department: (s: StaffMember) => s.department ?? '',
      designation: (s: StaffMember) => s.designation ?? '',
      phone: (s: StaffMember) => s.phone ?? '',
      active: (s: StaffMember) => (s.active ? 'Active' : 'Inactive'),
    }),
    []
  );

  const settingsValueGetters = useMemo(
    () => ({
      group: (s: SettingValue) => s.group,
      code: (s: SettingValue) => s.code,
      displayName: (s: SettingValue) => s.displayName,
      module: (s: SettingValue) => s.module,
      badgeColor: (s: SettingValue) => s.badgeColor,
      sortOrder: (s: SettingValue) => s.sortOrder,
      active: (s: SettingValue) => (s.active ? 'Active' : 'Inactive'),
    }),
    []
  );

  const staffExcel = useExcelTableFilters(filteredStaff, staffValueGetters);
  const settingsExcel = useExcelTableFilters(filteredSettings, settingsValueGetters);
  const displayedStaff = staffExcel.rows;
  const displayedSettings = settingsExcel.rows;

  const activeTab: 'staff' | 'settings' | 'import' = isAdmin ? tab : 'settings';

  if (!isManagerOrAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto mb-2" />
        <h3 className="font-display font-bold text-sm text-slate-900">
          Admin / Manager-HOD Access Required
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Staff &amp; Settings is restricted to users with Admin or Manager-HOD privileges.
        </p>
      </div>
    );
  }

  const openNewStaff = () => {
    const nextNum = String(staff.length + 1).padStart(3, '0');
    setEditingStaff(null);
    setFormError(null);
    setStaffForm({
      staffId: `STF-${nextNum}`,
      staffName: '',
      email: '',
      role: 'Staff',
      active: true,
      department: 'Tax Compliance',
      designation: '',
      phone: '',
    });
    setStaffModalOpen(true);
  };

  const openEditStaff = (s: StaffMember) => {
    setEditingStaff(s);
    setFormError(null);
    setStaffForm({
      staffId: s.staffId,
      staffName: s.staffName,
      email: s.email,
      role: s.role,
      active: s.active,
      department: s.department ?? '',
      designation: s.designation ?? '',
      phone: s.phone ?? '',
    });
    setStaffModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await saveStaffMember(
        {
          ...staffForm,
          uid: editingStaff?.uid ?? '',
        },
        Boolean(editingStaff),
        editingStaff?.id
      );
      setStaffModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save staff member.');
    } finally {
      setBusy(false);
    }
  };

  const openNewSetting = () => {
    const defaultGroup = normalizeSettingGroup(groupFilter || 'CLIENT STATUS');
    setEditingSetting(null);
    setFormError(null);
    setSettingForm({
      id: '',
      group: defaultGroup,
      code: '',
      displayName: '',
      module: moduleFilter || 'Client Master',
      badgeColor: '#0F766E',
      active: true,
      sortOrder: settings.filter((s) => normalizeSettingGroup(s.group) === defaultGroup).length + 1,
    });
    setSettingModalOpen(true);
  };

  const openEditSetting = (s: SettingValue) => {
    setEditingSetting(s);
    setFormError(null);
    setSettingForm({
      id: s.id,
      group: normalizeSettingGroup(s.group),
      code: s.code,
      displayName: s.displayName,
      module: s.module,
      badgeColor: s.badgeColor,
      active: s.active,
      sortOrder: s.sortOrder,
    });
    setSettingModalOpen(true);
  };

  const handleSaveSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await saveSetting(
        {
          ...settingForm,
          group: normalizeSettingGroup(settingForm.group),
        },
        Boolean(editingSetting)
      );
      setSettingModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save setting value.');
    } finally {
      setBusy(false);
    }
  };

  const handleSeedDefaults = async () => {
    setBusy(true);
    setSeedMessage(null);
    try {
      const added = await seedDefaultSettings();
      setSeedMessage(
        added > 0
          ? `Seeded ${added} default Malaysian LHDN tax settings successfully.`
          : 'All default Malaysian tax settings are already present.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleMergeDuplicateGroups = async () => {
    if (!isAdmin || mergingDuplicates || busy) return;
    setMergingDuplicates(true);
    setSeedMessage(null);

    try {
      const buckets = new Map<string, SettingValue[]>();
      for (const s of settings) {
        const normGroup = normalizeSettingGroup(s.group);
        const normDisplay = (s.displayName || s.code || '').trim().toLowerCase();
        const key = `${normGroup}::${normDisplay}`;
        const list = buckets.get(key) ?? [];
        list.push(s);
        buckets.set(key, list);
      }

      const ops: Array<
        | { type: 'update'; id: string; payload: Record<string, unknown> }
        | { type: 'delete'; id: string }
      > = [];

      let normalizedCount = 0;
      let mergedGroupsCount = 0;
      let deletedCount = 0;

      for (const bucket of buckets.values()) {
        const normGroup = normalizeSettingGroup(bucket[0].group);

        // Prefer keeping a document whose stored group is already normalized (no underscores/hyphens),
        // then active rows, then lowest sortOrder — so duplicate underscore documents are deleted.
        const sorted = [...bucket].sort((a, b) => {
          const aCleanGroup = a.group === normGroup ? 0 : 1;
          const bCleanGroup = b.group === normGroup ? 0 : 1;
          if (aCleanGroup !== bCleanGroup) return aCleanGroup - bCleanGroup;

          const aActive = a.active ? 0 : 1;
          const bActive = b.active ? 0 : 1;
          if (aActive !== bActive) return aActive - bActive;

          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.id.localeCompare(b.id);
        });

        const survivor = sorted[0];
        const duplicates = sorted.slice(1);
        const hasDuplicates = duplicates.length > 0;
        const mergedActive = hasDuplicates ? true : survivor.active;
        const mergedModule =
          survivor.module || bucket.find((x) => x.module && x.module !== 'Global')?.module || bucket.find((x) => x.module)?.module || 'Global';
        const validHex = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);
        const mergedColor =
          (validHex(survivor.badgeColor) ? survivor.badgeColor : '') ||
          bucket.find((x) => validHex(x.badgeColor))?.badgeColor ||
          '#0F766E';
        const mergedSortOrder = Math.min(...bucket.map((x) => (Number.isFinite(x.sortOrder) ? x.sortOrder : 1)));
        const mergedCode =
          survivor.code ||
          bucket.find((x) => x.code)?.code ||
          survivor.displayName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 64);

        const needsUpdate =
          survivor.group !== normGroup ||
          survivor.active !== mergedActive ||
          survivor.module !== mergedModule ||
          survivor.badgeColor !== mergedColor ||
          survivor.sortOrder !== mergedSortOrder ||
          survivor.code !== mergedCode;

        if (needsUpdate) {
          ops.push({
            type: 'update',
            id: survivor.id,
            payload: {
              group: normGroup,
              code: mergedCode,
              displayName: survivor.displayName,
              module: mergedModule,
              badgeColor: mergedColor,
              active: mergedActive,
              sortOrder: Math.max(0, Math.min(9999, Math.round(mergedSortOrder))),
              updatedAt: serverTimestamp(),
            },
          });
          normalizedCount += 1;
        }

        if (hasDuplicates) {
          mergedGroupsCount += 1;
          for (const dup of duplicates) {
            ops.push({ type: 'delete', id: dup.id });
            deletedCount += 1;
          }
        }
      }

      if (ops.length === 0) {
        const msg = 'All controlled setting groups are already normalized with zero duplicates.';
        setSeedMessage(msg);
        showToast(msg, 'info');
        return;
      }

      const CHUNK = 400;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const slice = ops.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        for (const op of slice) {
          const ref = doc(db, 'settings', op.id);
          if (op.type === 'update') {
            batch.set(ref, op.payload, { merge: true });
          } else {
            batch.delete(ref);
          }
        }
        await batch.commit();
      }

      if (groupFilter) {
        setGroupFilter(normalizeSettingGroup(groupFilter));
      }

      const summary = `Normalized ${normalizedCount} setting(s), merged ${mergedGroupsCount} duplicate value(s) (kept Active), and deleted ${deletedCount} duplicate document(s).`;
      setSeedMessage(summary);
      showToast(summary, 'success', 4800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to merge duplicate setting groups.';
      setSeedMessage(`Merge failed: ${msg}`);
      showToast(msg, 'error');
    } finally {
      setMergingDuplicates(false);
    }
  };

  const visibleStaffCols = STAFF_COLUMNS.filter((c) => staffColVis.visibleColumns[c.key]);
  const visibleSettingCols = SETTINGS_COLUMNS.filter((c) => settingColVis.visibleColumns[c.key]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Staff &amp; Settings</h2>
          <p className="text-xs text-slate-500">
            Manage practice RBAC staff accounts and controlled status values across all modules
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-200/70 rounded-lg no-print">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab('staff')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'staff'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Staff Directory <span className="ml-1 font-mono text-slate-400">({staff.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('settings')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'settings'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Controlled Values{' '}
            <span className="ml-1 font-mono text-slate-400">({settings.length})</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab('import')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'import'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Data Import
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: STAFF DIRECTORY (Admin Only) */}
      {isAdmin && activeTab === 'staff' && (
        <div className="space-y-3">
          <RegisterToolbar
            searchValue={staffSearch}
            onSearchChange={setStaffSearch}
            searchPlaceholder="Search Staff ID, Name, Email, Department..."
            hasActiveFilters={Boolean(
              staffSearch || roleFilter || staffActiveFilter || staffExcel.hasActiveColumnFilters
            )}
            onResetFilters={() => {
              setStaffSearch('');
              setRoleFilter('');
              setStaffActiveFilter('');
              staffExcel.resetColumnFilters();
            }}
            columns={STAFF_COLUMNS}
            visibleColumns={staffColVis.visibleColumns}
            onToggleColumn={staffColVis.toggleColumn}
            onResetColumns={staffColVis.resetColumns}
            recordCount={displayedStaff.length}
            totalCount={staff.length}
            onExportExcel={() =>
              exportToExcel(
                `TPMS_Staff_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`,
                'Staff',
                visibleStaffCols,
                displayedStaff.map((s) => ({
                  ...s,
                  active: s.active ? 'Active' : 'Inactive',
                }))
              )
            }
            onPrint={() =>
              printRegisterHtml(
                'Staff Directory',
                `Authorized staff & RBAC roles — ${displayedStaff.length} records`,
                visibleStaffCols,
                displayedStaff.map((s) => ({
                  ...s,
                  active: s.active ? 'Active' : 'Inactive',
                })),
                false
              )
            }
            onSavePdf={() =>
              printRegisterHtml(
                'Staff Directory',
                `Authorized staff & RBAC roles — ${displayedStaff.length} records`,
                visibleStaffCols,
                displayedStaff.map((s) => ({
                  ...s,
                  active: s.active ? 'Active' : 'Inactive',
                })),
                true
              )
            }
            filters={
              <>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
                >
                  <option value="">All Roles</option>
                  <option value="Admin">Admin</option>
                  <option value="Manager-HOD">Manager-HOD</option>
                  <option value="Staff">Staff</option>
                  <option value="Report Viewer">Report Viewer</option>
                </select>
                <select
                  value={staffActiveFilter}
                  onChange={(e) => setStaffActiveFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </>
            }
            primaryAction={
              <button
                type="button"
                onClick={openNewStaff}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" /> Add Staff
              </button>
            }
          />

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-300px)]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700">
                  <tr>
                    {visibleStaffCols.map((col) => (
                      <th key={col.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                        <ExcelColumnFilter
                          columnKey={col.key}
                          title={col.label}
                          values={staffExcel.getColumnValues(col.key)}
                          selectedValues={staffExcel.columnFilters[col.key]}
                          onChangeSelected={(next) => staffExcel.setColumnFilter(col.key, next)}
                          sortDirection={
                            staffExcel.sortState?.key === col.key
                              ? staffExcel.sortState.direction
                              : null
                          }
                          onSort={(dir) => staffExcel.setColumnSort(col.key, dir)}
                        />
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap no-print">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedStaff.map((s) => {
                    const isSelf =
                      Boolean(s.email) &&
                      s.email.toLowerCase() === (user?.email || '').toLowerCase();
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/90">
                        {staffColVis.visibleColumns.staffId && (
                          <td className="px-3 py-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                            {s.staffId}
                          </td>
                        )}
                        {staffColVis.visibleColumns.staffName && (
                          <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                            {s.staffName}{' '}
                            {isSelf && <span className="text-[10px] text-teal-700 font-semibold">(You)</span>}
                          </td>
                        )}
                        {staffColVis.visibleColumns.email && (
                          <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                            {s.email ? (
                              s.email
                            ) : (
                              <span className="font-sans italic text-slate-400">Pending email</span>
                            )}
                          </td>
                        )}
                        {staffColVis.visibleColumns.role && (
                          <td className="px-3 py-2 whitespace-nowrap">
                            <StatusPill
                              group="ROLE"
                              value={s.role}
                              customColor={
                                s.role === 'Admin'
                                  ? '#0F766E'
                                  : s.role === 'Manager-HOD'
                                  ? '#4338CA'
                                  : s.role === 'Staff'
                                  ? '#0369A1'
                                  : '#475569'
                              }
                            />
                          </td>
                        )}
                        {staffColVis.visibleColumns.department && (
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                            {s.department || '—'}
                          </td>
                        )}
                        {staffColVis.visibleColumns.designation && (
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                            {s.designation || '—'}
                          </td>
                        )}
                        {staffColVis.visibleColumns.phone && (
                          <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                            {s.phone || '—'}
                          </td>
                        )}
                        {staffColVis.visibleColumns.active && (
                          <td className="px-3 py-2 whitespace-nowrap">
                            <StatusPill
                              group="ACTIVE"
                              value={s.active ? 'Active' : 'Inactive'}
                              customColor={s.active ? '#15803D' : '#B91C1C'}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 text-right whitespace-nowrap no-print">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditStaff(s)}
                              title="Edit staff member"
                              className="p-1.5 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => void deleteStaffMember(s.id)}
                                title="Remove staff member"
                                className="p-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONTROLLED VALUES (SETTINGS) */}
      {activeTab === 'settings' && (
        <div className="space-y-3">
          {seedMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {seedMessage}
              </span>
              <button
                type="button"
                onClick={() => setSeedMessage(null)}
                className="text-emerald-700 hover:text-emerald-900"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <RegisterToolbar
            searchValue={settingSearch}
            onSearchChange={setSettingSearch}
            searchPlaceholder="Search Group, Code, Display Name, Module, Hex..."
            hasActiveFilters={Boolean(
              settingSearch || groupFilter || moduleFilter || settingsExcel.hasActiveColumnFilters
            )}
            onResetFilters={() => {
              setSettingSearch('');
              setGroupFilter('');
              setModuleFilter('');
              settingsExcel.resetColumnFilters();
            }}
            columns={SETTINGS_COLUMNS}
            visibleColumns={settingColVis.visibleColumns}
            onToggleColumn={settingColVis.toggleColumn}
            onResetColumns={settingColVis.resetColumns}
            recordCount={displayedSettings.length}
            totalCount={settings.length}
            onExportExcel={() =>
              exportToExcel(
                `TPMS_Controlled_Settings_${new Date().toISOString().slice(0, 10)}.xlsx`,
                'Settings',
                visibleSettingCols,
                displayedSettings.map((s) => ({
                  ...s,
                  active: s.active ? 'Active' : 'Inactive',
                }))
              )
            }
            onPrint={() =>
              printRegisterHtml(
                'Controlled Values & Status Settings',
                `${displayedSettings.length} settings records`,
                visibleSettingCols,
                displayedSettings.map((s) => ({
                  ...s,
                  active: s.active ? 'Active' : 'Inactive',
                })),
                false
              )
            }
            onSavePdf={() =>
              printRegisterHtml(
                'Controlled Values & Status Settings',
                `${displayedSettings.length} settings records`,
                visibleSettingCols,
                displayedSettings.map((s) => ({
                  ...s,
                  active: s.active ? 'Active' : 'Inactive',
                })),
                true
              )
            }
            filters={
              <>
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-mono"
                >
                  <option value="">All Groups</option>
                  {distinctGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
                >
                  <option value="">All Modules</option>
                  {SETTING_MODULES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </>
            }
            primaryAction={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || mergingDuplicates}
                  onClick={() => void handleSeedDefaults()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md whitespace-nowrap disabled:opacity-50"
                >
                  <Database className="w-3.5 h-3.5" />
                  {busy ? 'Seeding...' : 'Seed Default Malaysian Tax Settings'}
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={busy || mergingDuplicates || settings.length === 0}
                    onClick={() => void handleMergeDuplicateGroups()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md whitespace-nowrap disabled:opacity-50"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    {mergingDuplicates ? 'Merging...' : 'Merge Duplicate Groups'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={openNewSetting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Value
                </button>
              </div>
            }
          />

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-300px)]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700">
                  <tr>
                    {visibleSettingCols.map((col) => (
                      <th key={col.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                        <ExcelColumnFilter
                          columnKey={col.key}
                          title={col.label}
                          values={settingsExcel.getColumnValues(col.key)}
                          selectedValues={settingsExcel.columnFilters[col.key]}
                          onChangeSelected={(next) => settingsExcel.setColumnFilter(col.key, next)}
                          sortDirection={
                            settingsExcel.sortState?.key === col.key
                              ? settingsExcel.sortState.direction
                              : null
                          }
                          onSort={(dir) => settingsExcel.setColumnSort(col.key, dir)}
                        />
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap no-print">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedSettings.length === 0 ? (
                    <tr>
                      <td colSpan={visibleSettingCols.length + 1} className="px-6 py-10 text-center">
                        <p className="text-xs font-semibold text-slate-700">
                          No controlled settings found
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Click &ldquo;Seed Default Malaysian Tax Settings&rdquo; to populate LHDN
                          statuses, e-Invoice phases, CP204, and job workflow badges.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    displayedSettings.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/90">
                        {settingColVis.visibleColumns.group && (
                          <td className="px-3 py-2 font-mono text-[11px] font-medium text-slate-700 whitespace-nowrap">
                            {s.group}
                          </td>
                        )}
                        {settingColVis.visibleColumns.code && (
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {s.code}
                          </td>
                        )}
                        {settingColVis.visibleColumns.displayName && (
                          <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                            {s.displayName}
                          </td>
                        )}
                        {settingColVis.visibleColumns.module && (
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{s.module}</td>
                        )}
                        {settingColVis.visibleColumns.badgeColor && (
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <StatusPill
                                group={s.group}
                                value={s.displayName}
                                customColor={s.badgeColor}
                              />
                              <span className="font-mono text-[11px] text-slate-400">
                                {s.badgeColor}
                              </span>
                            </div>
                          </td>
                        )}
                        {settingColVis.visibleColumns.sortOrder && (
                          <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                            {s.sortOrder}
                          </td>
                        )}
                        {settingColVis.visibleColumns.active && (
                          <td className="px-3 py-2 whitespace-nowrap">
                            <StatusPill
                              group="ACTIVE"
                              value={s.active ? 'Active' : 'Inactive'}
                              customColor={s.active ? '#15803D' : '#64748B'}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 text-right whitespace-nowrap no-print">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditSetting(s)}
                              title="Edit setting"
                              className="p-1.5 rounded text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => void deleteSetting(s.id)}
                                title="Delete setting"
                                className="p-1.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BULK DATA IMPORT (Admin Only) */}
      {isAdmin && activeTab === 'import' && <DataImportTab />}

      {/* Add/Edit Staff Modal */}
      {staffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setStaffModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-display font-bold text-sm text-slate-900">
                {editingStaff ? `Edit Staff — ${editingStaff.staffId}` : 'Add New Staff Member'}
              </h3>
              <button
                type="button"
                onClick={() => setStaffModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveStaff(e)} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Staff ID *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={staffForm.staffId}
                    onChange={(e) => setStaffForm({ ...staffForm, staffId: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Role *
                  </label>
                  <select
                    value={staffForm.role}
                    onChange={(e) =>
                      setStaffForm({ ...staffForm, role: e.target.value as StaffRole })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Manager-HOD">Manager-HOD</option>
                    <option value="Staff">Staff</option>
                    <option value="Report Viewer">Report Viewer (Read-Only)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Staff Full Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={staffForm.staffName}
                  onChange={(e) => setStaffForm({ ...staffForm, staffName: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Sign-in Email{' '}
                  <span className="font-normal text-slate-400">(optional until Google login assigned)</span>
                </label>
                <input
                  type="email"
                  disabled={Boolean(editingStaff && editingStaff.email)}
                  maxLength={160}
                  placeholder="name@firm.com"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md disabled:bg-slate-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={staffForm.department}
                    onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={staffForm.designation}
                    onChange={(e) => setStaffForm({ ...staffForm, designation: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Phone</label>
                  <input
                    type="text"
                    maxLength={40}
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <label className="inline-flex items-center gap-2 pt-4 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={staffForm.active}
                    onChange={(e) => setStaffForm({ ...staffForm, active: e.target.checked })}
                    className="rounded border-slate-300 text-teal-700"
                  />
                  Active Account
                </label>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStaffModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {busy ? 'Saving...' : 'Save Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Controlled Setting Modal */}
      {settingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setSettingModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-display font-bold text-sm text-slate-900">
                {editingSetting ? 'Edit Controlled Value' : 'Add Controlled Value'}
              </h3>
              <button
                type="button"
                onClick={() => setSettingModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveSetting(e)} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Group *
                  </label>
                  <input
                    type="text"
                    list="tpms-setting-groups"
                    required
                    maxLength={64}
                    value={settingForm.group}
                    onChange={(e) =>
                      setSettingForm({ ...settingForm, group: e.target.value.toUpperCase() })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                  <datalist id="tpms-setting-groups">
                    {distinctGroups.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Code *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={64}
                    value={settingForm.code}
                    onChange={(e) =>
                      setSettingForm({
                        ...settingForm,
                        code: e.target.value.toUpperCase().replace(/\s+/g, '_'),
                      })
                    }
                    placeholder="e.g. ACTIVE"
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={settingForm.displayName}
                    onChange={(e) =>
                      setSettingForm({ ...settingForm, displayName: e.target.value })
                    }
                    placeholder="e.g. Active"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Module (Optional)
                  </label>
                  <select
                    value={settingForm.module}
                    onChange={(e) => setSettingForm({ ...settingForm, module: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
                  >
                    <option value="">— None / General —</option>
                    {SETTING_MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 items-end">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Badge Color (Hex Picker) *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(settingForm.badgeColor)
                          ? settingForm.badgeColor
                          : '#0F766E'
                      }
                      onChange={(e) =>
                        setSettingForm({ ...settingForm, badgeColor: e.target.value.toUpperCase() })
                      }
                      className="w-9 h-8 p-0.5 border border-slate-200 rounded cursor-pointer bg-white"
                    />
                    <input
                      type="text"
                      required
                      pattern="^#[0-9a-fA-F]{6}$"
                      maxLength={7}
                      value={settingForm.badgeColor}
                      onChange={(e) =>
                        setSettingForm({ ...settingForm, badgeColor: e.target.value })
                      }
                      className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                    />
                    <StatusPill
                      group={settingForm.group}
                      value={settingForm.displayName || 'Preview'}
                      customColor={settingForm.badgeColor}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={settingForm.sortOrder}
                    onChange={(e) =>
                      setSettingForm({ ...settingForm, sortOrder: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingForm.active}
                  onChange={(e) => setSettingForm({ ...settingForm, active: e.target.checked })}
                  className="rounded border-slate-300 text-teal-700"
                />
                Active
              </label>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettingModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {busy ? 'Saving...' : 'Save Setting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
