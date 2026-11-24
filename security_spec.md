# TPMS Security Specification (Phase 0)

## 1. Data Invariants
1. **Verified Staff Gate**: Only authenticated users with `email_verified == true` who exist as `active == true` in `/staff/{emailKey}` (or the bootstrapped primary Admin `tjwang.tax@gmail.com`) may access practice data.
2. **Strict Role Separation**:
   - `Admin`: Full CRUD on `staff`, `settings`, `clients`, `jobs`, `calendarEvents`, `notifications`.
   - `Manager-HOD`: Full CRUD on `clients` (including Inactivate/Reactivate), `jobs`, `calendarEvents`, and publishing `announcement` notifications. Cannot write to `staff` or `settings`.
   - `Staff`: Read/Create/Update `clients` (cannot set `clientStatus` to `'Resigned'` via inactivate or delete clients), Read/Create/Update `jobs` and `calendarEvents`, Create `suggestion` notifications. Cannot publish `announcement` notifications or write `staff`/`settings`.
   - `Report Viewer`: Strictly read-only across all collections. Cannot create, update, or delete any document (including notifications/suggestions).
3. **Strict Schema & Bounds**: Every document enforces `hasAll` and `hasOnly`, string `.size()` bounds, hex color regex on `settings.badgeColor`, array `.size() <= 50` (clients) or `<= 100` (notifications.readBy), and server timestamps (`request.time`) on `createdAt`/`updatedAt`.
4. **Immutability**: `createdAt` and `createdBy` (where present) cannot be modified after creation; `authorEmail` on notifications must match `request.auth.token.email`.
5. **Path Hardening**: All single-document operations validate `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read**: `get /clients/C_0001` with `auth == null`.
2. **Email Spoofing (Unverified Admin)**: `write /staff/attacker_com` with `email: "tjwang.tax@gmail.com", email_verified: false`.
3. **Outsider Read**: `get /clients/C_0001` by verified Google user not in `/staff`.
4. **Report Viewer Write Attempt**: `create /clients/C_9999` by active `Report Viewer`.
5. **Report Viewer Suggestion Attempt**: `create /notifications/notif_1` by active `Report Viewer`.
6. **Self-Role Escalation**: `update /staff/staff_a_firm_my` changing `role` from `"Staff"` to `"Admin"`.
7. **Staff Announcement Spoof**: `create /notifications/ann_1` with `type: "announcement"` by role `"Staff"`.
8. **Shadow Ghost Field Injection**: `create /settings/s_1` including extra field `isSuperAdmin: true`.
9. **Resource Exhaustion (1MB String)**: `create /clients/C_0002` with 20,000-character `specialRemarks`.
10. **Path ID Poisoning**: `create /clients/bad..id$with/chars` failing `isValidId`.
11. **Backdated Timestamp Forge**: `create /jobs/J_0001` with client-supplied `createdAt` != `request.time`.
12. **Staff Client Delete / Inactivate Bypass**: `delete /clients/C_0001` by role `"Staff"` or `update /clients/C_0001` by `"Staff"` changing `clientStatus` to `"Resigned"`.
