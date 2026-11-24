/**
 * Phase 0 Security Rules Specification & Verification Matrix
 * Verifies the "Dirty Dozen" adversarial payloads against firestore.rules invariants.
 * Run with Firebase Emulator Suite when testing locally against the Rules Engine.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  actor: {
    uid: string | null;
    email?: string;
    email_verified?: boolean;
    role?: 'Admin' | 'Manager-HOD' | 'Staff' | 'Report Viewer' | 'Outsider';
  };
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  enforcedByPillar: string;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Client Read',
    actor: { uid: null },
    operation: 'get',
    path: '/clients/C_0001',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 1 & 6: Verified Active Staff Gate & PII Isolation',
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoof',
    actor: { uid: 'spoof-1', email: 'tjwang.tax@gmail.com', email_verified: false },
    operation: 'create',
    path: '/staff/spoof_user_com',
    payload: { staffId: 'STF-999', staffName: 'Spoof', email: 'spoof@user.com', role: 'Admin', active: true },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Email Verification Enforcement (email_verified == true)',
  },
  {
    id: 3,
    name: 'Verified Non-Staff Outsider Read',
    actor: { uid: 'outsider-1', email: 'outsider@gmail.com', email_verified: true, role: 'Outsider' },
    operation: 'get',
    path: '/clients/C_0001',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 6: PII Isolation (Active Staff Lookup)',
  },
  {
    id: 4,
    name: 'Report Viewer Client Create Attempt',
    actor: { uid: 'rv-1', email: 'viewer@firm.my', email_verified: true, role: 'Report Viewer' },
    operation: 'create',
    path: '/clients/C_9999',
    payload: { clientId: 'C-9999', clientName: 'Injected Sdn Bhd', category: 'Corporate', clientStatus: 'Active' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4: Tiered Identity Logic (Report Viewer Read-Only)',
  },
  {
    id: 5,
    name: 'Report Viewer Suggestion Attempt',
    actor: { uid: 'rv-1', email: 'viewer@firm.my', email_verified: true, role: 'Report Viewer' },
    operation: 'create',
    path: '/notifications/notif_rv',
    payload: { type: 'suggestion', title: 'Test', message: 'Blocked', authorEmail: 'viewer@firm.my' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4: Strict Report Viewer Read-Only Enforcement',
  },
  {
    id: 6,
    name: 'Staff Self-Role Escalation to Admin',
    actor: { uid: 'stf-1', email: 'staff@firm.my', email_verified: true, role: 'Staff' },
    operation: 'update',
    path: '/staff/staff_firm_my',
    payload: { role: 'Admin' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4: Admin-Only Staff Role Mutation',
  },
  {
    id: 7,
    name: 'Staff Publishing Announcement Spoof',
    actor: { uid: 'stf-1', email: 'staff@firm.my', email_verified: true, role: 'Staff' },
    operation: 'create',
    path: '/notifications/ann_spoof',
    payload: { type: 'announcement', title: 'Fake Notice', message: 'Spoofed', authorEmail: 'staff@firm.my' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4: Admin/Manager-HOD Only Announcements',
  },
  {
    id: 8,
    name: 'Shadow Ghost Field Injection on Settings',
    actor: { uid: 'adm-1', email: 'tjwang.tax@gmail.com', email_verified: true, role: 'Admin' },
    operation: 'create',
    path: '/settings/set_ghost',
    payload: {
      group: 'CLIENT_STATUS',
      code: 'ACTIVE',
      displayName: 'Active',
      module: 'Client Master',
      badgeColor: '#16A34A',
      active: true,
      sortOrder: 1,
      ghostAdminFlag: true,
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2: Strict hasOnly() Validation Blueprint',
  },
  {
    id: 9,
    name: 'Resource Exhaustion (Oversized Special Remarks)',
    actor: { uid: 'adm-1', email: 'tjwang.tax@gmail.com', email_verified: true, role: 'Admin' },
    operation: 'create',
    path: '/clients/C_BIG',
    payload: { clientId: 'C-BIG', clientName: 'Big Corp', specialRemarks: 'A'.repeat(25000) },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2 & 3: Mandatory String Size Bounds (<= 2000)',
  },
  {
    id: 10,
    name: 'Path ID Poisoning',
    actor: { uid: 'adm-1', email: 'tjwang.tax@gmail.com', email_verified: true, role: 'Admin' },
    operation: 'create',
    path: '/clients/invalid$id..poison',
    payload: { clientId: 'C-1', clientName: 'Poison' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 3: Path Variable Hardening isValidId()',
  },
  {
    id: 11,
    name: 'Backdated Client Timestamp Forge',
    actor: { uid: 'stf-1', email: 'staff@firm.my', email_verified: true, role: 'Staff' },
    operation: 'create',
    path: '/jobs/JOB_FORGED',
    payload: { jobCode: 'J-001', module: 'CP204', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Temporal Integrity (createdAt == request.time)',
  },
  {
    id: 12,
    name: 'Staff Attempting Client Delete or Inactivation',
    actor: { uid: 'stf-1', email: 'staff@firm.my', email_verified: true, role: 'Staff' },
    operation: 'delete',
    path: '/clients/C_0001',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4: Admin/Manager-HOD Only Client Inactivate/Delete',
  },
];
