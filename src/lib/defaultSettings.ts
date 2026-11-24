export interface SeedSettingTemplate {
  id: string;
  group: string;
  code: string;
  displayName: string;
  module: string;
  badgeColor: string;
  active: boolean;
  sortOrder: number;
}

export const SETTING_GROUPS = [
  'CLIENT_STATUS',
  'CLIENT_CATEGORY',
  'SME_STATUS',
  'MYTAX_APPOINTMENT',
  'EINVOICE_STATUS',
  'ENGAGEMENT_STATUS',
  'BUSINESS_STATUS',
  'YA_STATUS',
  'TAX_AGENT',
  'JOB_STATUS',
  'CP204_STATUS',
  'CORP_STATUS',
  'INDIV_STATUS',
  'FORM_E_STATUS',
  'PAYMENT_STATUS',
  'CORRESPONDENCE_STATUS',
  'BILLING_STATUS',
  'PRIORITY',
  'CORRESPONDENCE_TYPE',
] as const;

export const SETTING_MODULES = [
  'Global',
  'Client Master',
  'All Jobs',
  'CP204',
  'Corporate',
  'Individual',
  'Ad Hoc',
  'Form E',
  'Tax Payment Monitor',
  'Correspondence',
  'Work Done & Finance',
] as const;

export const DEFAULT_MALAYSIAN_TAX_SETTINGS: SeedSettingTemplate[] = [
  // CLIENT_STATUS (Exact 8 statuses required)
  { id: 'CS_ACTIVE', group: 'CLIENT_STATUS', code: 'ACTIVE', displayName: 'Active', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'CS_RESIGNED', group: 'CLIENT_STATUS', code: 'RESIGNED', displayName: 'Resigned', module: 'Client Master', badgeColor: '#B91C1C', active: true, sortOrder: 2 },
  { id: 'CS_WINDING_UP', group: 'CLIENT_STATUS', code: 'WINDING_UP', displayName: 'Winding-Up', module: 'Client Master', badgeColor: '#C2410C', active: true, sortOrder: 3 },
  { id: 'CS_STRIKE_OFF', group: 'CLIENT_STATUS', code: 'STRIKE_OFF', displayName: 'Strike-Off', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 4 },
  { id: 'CS_CANCELLED', group: 'CLIENT_STATUS', code: 'TAX_FILE_CANCELLED', displayName: 'Tax File Cancelled', module: 'Client Master', badgeColor: '#475569', active: true, sortOrder: 5 },
  { id: 'CS_ONE_OFF', group: 'CLIENT_STATUS', code: 'ONE_OFF', displayName: 'One-Off', module: 'Client Master', badgeColor: '#0369A1', active: true, sortOrder: 6 },
  { id: 'CS_REAPPOINT', group: 'CLIENT_STATUS', code: 'RE_APPOINT', displayName: 'Re-appoint', module: 'Client Master', badgeColor: '#0F766E', active: true, sortOrder: 7 },
  { id: 'CS_TRANSFER', group: 'CLIENT_STATUS', code: 'TRANSFER_TAGENT', displayName: 'Transfer T.Agent', module: 'Client Master', badgeColor: '#7C3AED', active: true, sortOrder: 8 },

  // CLIENT_CATEGORY
  { id: 'CAT_CORP', group: 'CLIENT_CATEGORY', code: 'CORPORATE', displayName: 'Corporate', module: 'Client Master', badgeColor: '#1E40AF', active: true, sortOrder: 1 },
  { id: 'CAT_INDIV', group: 'CLIENT_CATEGORY', code: 'INDIVIDUAL', displayName: 'Individual', module: 'Client Master', badgeColor: '#0F766E', active: true, sortOrder: 2 },
  { id: 'CAT_OTHER', group: 'CLIENT_CATEGORY', code: 'OTHER', displayName: 'Other', module: 'Client Master', badgeColor: '#475569', active: true, sortOrder: 3 },

  // SME_STATUS
  { id: 'SME_YES', group: 'SME_STATUS', code: 'SME', displayName: 'SME', module: 'Client Master', badgeColor: '#047857', active: true, sortOrder: 1 },
  { id: 'SME_NO', group: 'SME_STATUS', code: 'NON_SME', displayName: 'Non-SME', module: 'Client Master', badgeColor: '#334155', active: true, sortOrder: 2 },
  { id: 'SME_NA', group: 'SME_STATUS', code: 'NA', displayName: 'N/A', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 3 },

  // MYTAX_APPOINTMENT
  { id: 'MYTAX_APP', group: 'MYTAX_APPOINTMENT', code: 'APPOINTED', displayName: 'Appointed', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'MYTAX_PEND', group: 'MYTAX_APPOINTMENT', code: 'PENDING', displayName: 'Pending', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'MYTAX_NONE', group: 'MYTAX_APPOINTMENT', code: 'NOT_APPOINTED', displayName: 'Not Appointed', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 3 },
  { id: 'MYTAX_REV', group: 'MYTAX_APPOINTMENT', code: 'REVOKED', displayName: 'Revoked', module: 'Client Master', badgeColor: '#B91C1C', active: true, sortOrder: 4 },

  // EINVOICE_STATUS (Malaysian LHDN MyInvois Phased Rollout)
  { id: 'EINV_P1', group: 'EINVOICE_STATUS', code: 'PHASE_1', displayName: 'Phase 1 (>RM100M)', module: 'Client Master', badgeColor: '#1D4ED8', active: true, sortOrder: 1 },
  { id: 'EINV_P2', group: 'EINVOICE_STATUS', code: 'PHASE_2', displayName: 'Phase 2 (RM25M–100M)', module: 'Client Master', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'EINV_P3', group: 'EINVOICE_STATUS', code: 'PHASE_3', displayName: 'Phase 3 (RM5M–25M)', module: 'Client Master', badgeColor: '#0F766E', active: true, sortOrder: 3 },
  { id: 'EINV_P4', group: 'EINVOICE_STATUS', code: 'PHASE_4', displayName: 'Phase 4 (RM1M–5M)', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 4 },
  { id: 'EINV_EXEMPT', group: 'EINVOICE_STATUS', code: 'EXEMPT', displayName: 'Exempt (<RM500k)', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 5 },

  // ENGAGEMENT_STATUS
  { id: 'ENG_SIGNED', group: 'ENGAGEMENT_STATUS', code: 'SIGNED', displayName: 'LOE Signed', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'ENG_PENDING', group: 'ENGAGEMENT_STATUS', code: 'PENDING_LOE', displayName: 'Pending LOE', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'ENG_RENEWAL', group: 'ENGAGEMENT_STATUS', code: 'RENEWAL_DUE', displayName: 'Renewal Due', module: 'Client Master', badgeColor: '#C2410C', active: true, sortOrder: 3 },
  { id: 'ENG_TERMINATED', group: 'ENGAGEMENT_STATUS', code: 'TERMINATED', displayName: 'Terminated', module: 'Client Master', badgeColor: '#B91C1C', active: true, sortOrder: 4 },

  // BUSINESS_STATUS
  { id: 'BIZ_ACTIVE', group: 'BUSINESS_STATUS', code: 'OPERATING', displayName: 'Operating', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'BIZ_DORMANT', group: 'BUSINESS_STATUS', code: 'DORMANT', displayName: 'Dormant', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'BIZ_CEASED', group: 'BUSINESS_STATUS', code: 'CEASED', displayName: 'Ceased', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 3 },

  // YA_STATUS
  { id: 'YA_FILED', group: 'YA_STATUS', code: 'FILED', displayName: 'Filed', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'YA_WIP', group: 'YA_STATUS', code: 'IN_PROGRESS', displayName: 'In Progress', module: 'Client Master', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'YA_PENDING', group: 'YA_STATUS', code: 'PENDING_DOCS', displayName: 'Pending Docs', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 3 },
  { id: 'YA_EXEMPT', group: 'YA_STATUS', code: 'EXEMPT_DORMANT', displayName: 'Exempt / Not Applicable', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 4 },

  // JOB_STATUS (Global / All Jobs)
  { id: 'JS_NOT_STARTED', group: 'JOB_STATUS', code: 'NOT_STARTED', displayName: 'Not Started', module: 'All Jobs', badgeColor: '#64748B', active: true, sortOrder: 1 },
  { id: 'JS_PENDING_DOCS', group: 'JOB_STATUS', code: 'PENDING_DOCS', displayName: 'Pending Docs', module: 'All Jobs', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'JS_IN_PROGRESS', group: 'JOB_STATUS', code: 'IN_PROGRESS', displayName: 'In Progress', module: 'All Jobs', badgeColor: '#0369A1', active: true, sortOrder: 3 },
  { id: 'JS_REVIEW', group: 'JOB_STATUS', code: 'MANAGER_REVIEW', displayName: 'Manager Review', module: 'All Jobs', badgeColor: '#7C3AED', active: true, sortOrder: 4 },
  { id: 'JS_CLIENT_APP', group: 'JOB_STATUS', code: 'CLIENT_APPROVAL', displayName: 'Client Approval', module: 'All Jobs', badgeColor: '#C2410C', active: true, sortOrder: 5 },
  { id: 'JS_SUBMITTED', group: 'JOB_STATUS', code: 'SUBMITTED_LHDN', displayName: 'Submitted to LHDN', module: 'All Jobs', badgeColor: '#0F766E', active: true, sortOrder: 6 },
  { id: 'JS_COMPLETED', group: 'JOB_STATUS', code: 'COMPLETED', displayName: 'Completed', module: 'All Jobs', badgeColor: '#15803D', active: true, sortOrder: 7 },
  { id: 'JS_ON_HOLD', group: 'JOB_STATUS', code: 'ON_HOLD', displayName: 'On Hold', module: 'All Jobs', badgeColor: '#B91C1C', active: true, sortOrder: 8 },

  // CP204_STATUS
  { id: 'CP_DRAFT', group: 'CP204_STATUS', code: 'ESTIMATE_DRAFT', displayName: 'Estimate Drafted', module: 'CP204', badgeColor: '#0369A1', active: true, sortOrder: 1 },
  { id: 'CP_SUBMITTED', group: 'CP204_STATUS', code: 'CP204_SUBMITTED', displayName: 'CP204 Submitted', module: 'CP204', badgeColor: '#0F766E', active: true, sortOrder: 2 },
  { id: 'CP_REV_6', group: 'CP204_STATUS', code: 'CP204A_6TH', displayName: 'CP204A (6th Mth)', module: 'CP204', badgeColor: '#7C3AED', active: true, sortOrder: 3 },
  { id: 'CP_REV_9', group: 'CP204_STATUS', code: 'CP204A_9TH', displayName: 'CP204A (9th Mth)', module: 'CP204', badgeColor: '#B45309', active: true, sortOrder: 4 },
  { id: 'CP_REV_11', group: 'CP204_STATUS', code: 'CP204A_11TH', displayName: 'CP204A (11th Mth)', module: 'CP204', badgeColor: '#C2410C', active: true, sortOrder: 5 },
  { id: 'CP_SME_EXEMPT', group: 'CP204_STATUS', code: 'SME_EXEMPT', displayName: 'SME 2-Yr Exempt', module: 'CP204', badgeColor: '#15803D', active: true, sortOrder: 6 },

  // PAYMENT_STATUS
  { id: 'PAY_UNPAID', group: 'PAYMENT_STATUS', code: 'UNPAID', displayName: 'Unpaid', module: 'Tax Payment Monitor', badgeColor: '#B45309', active: true, sortOrder: 1 },
  { id: 'PAY_PARTIAL', group: 'PAYMENT_STATUS', code: 'PARTIAL', displayName: 'Partial Paid', module: 'Tax Payment Monitor', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'PAY_PAID', group: 'PAYMENT_STATUS', code: 'PAID', displayName: 'Paid (FPX / ByrHASiL)', module: 'Tax Payment Monitor', badgeColor: '#15803D', active: true, sortOrder: 3 },
  { id: 'PAY_OVERDUE', group: 'PAYMENT_STATUS', code: 'OVERDUE', displayName: 'Overdue (10% Penalty Risk)', module: 'Tax Payment Monitor', badgeColor: '#B91C1C', active: true, sortOrder: 4 },

  // CORRESPONDENCE_STATUS
  { id: 'CORR_OPEN', group: 'CORRESPONDENCE_STATUS', code: 'OPEN', displayName: 'Open Query', module: 'Correspondence', badgeColor: '#B45309', active: true, sortOrder: 1 },
  { id: 'CORR_DRAFTING', group: 'CORRESPONDENCE_STATUS', code: 'DRAFTING', displayName: 'Drafting Reply', module: 'Correspondence', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'CORR_REPLIED', group: 'CORRESPONDENCE_STATUS', code: 'REPLIED', displayName: 'Replied to LHDN', module: 'Correspondence', badgeColor: '#0F766E', active: true, sortOrder: 3 },
  { id: 'CORR_CLOSED', group: 'CORRESPONDENCE_STATUS', code: 'CLOSED', displayName: 'Closed / Resolved', module: 'Correspondence', badgeColor: '#15803D', active: true, sortOrder: 4 },
  { id: 'CORR_ESCALATED', group: 'CORRESPONDENCE_STATUS', code: 'APPEAL', displayName: 'Form Q / Appeal', module: 'Correspondence', badgeColor: '#B91C1C', active: true, sortOrder: 5 },

  // CORRESPONDENCE_TYPE
  { id: 'CT_DESK', group: 'CORRESPONDENCE_TYPE', code: 'DESK_AUDIT', displayName: 'LHDN Desk Audit', module: 'Correspondence', badgeColor: '#B45309', active: true, sortOrder: 1 },
  { id: 'CT_FIELD', group: 'CORRESPONDENCE_TYPE', code: 'FIELD_AUDIT', displayName: 'LHDN Field Audit', module: 'Correspondence', badgeColor: '#B91C1C', active: true, sortOrder: 2 },
  { id: 'CT_QUERY', group: 'CORRESPONDENCE_TYPE', code: 'TAX_QUERY', displayName: 'Section 78 / 81 Query', module: 'Correspondence', badgeColor: '#0369A1', active: true, sortOrder: 3 },
  { id: 'CT_APPEAL', group: 'CORRESPONDENCE_TYPE', code: 'FORM_Q', displayName: 'Form Q Appeal', module: 'Correspondence', badgeColor: '#7C3AED', active: true, sortOrder: 4 },
  { id: 'CT_REFUND', group: 'CORRESPONDENCE_TYPE', code: 'REFUND_FOLLOWUP', displayName: 'Tax Refund Follow-up', module: 'Correspondence', badgeColor: '#0F766E', active: true, sortOrder: 5 },

  // BILLING_STATUS
  { id: 'BILL_UNBILLED', group: 'BILLING_STATUS', code: 'UNBILLED', displayName: 'Unbilled WIP', module: 'Work Done & Finance', badgeColor: '#64748B', active: true, sortOrder: 1 },
  { id: 'BILL_DRAFT', group: 'BILLING_STATUS', code: 'BILLING_READY', displayName: 'Ready to Bill', module: 'Work Done & Finance', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'BILL_INVOICED', group: 'BILLING_STATUS', code: 'INVOICED', displayName: 'Invoiced', module: 'Work Done & Finance', badgeColor: '#B45309', active: true, sortOrder: 3 },
  { id: 'BILL_COLLECTED', group: 'BILLING_STATUS', code: 'COLLECTED', displayName: 'Collected', module: 'Work Done & Finance', badgeColor: '#15803D', active: true, sortOrder: 4 },

  // PRIORITY
  { id: 'PRI_URGENT', group: 'PRIORITY', code: 'URGENT', displayName: 'Urgent', module: 'Global', badgeColor: '#B91C1C', active: true, sortOrder: 1 },
  { id: 'PRI_HIGH', group: 'PRIORITY', code: 'HIGH', displayName: 'High', module: 'Global', badgeColor: '#C2410C', active: true, sortOrder: 2 },
  { id: 'PRI_NORMAL', group: 'PRIORITY', code: 'NORMAL', displayName: 'Normal', module: 'Global', badgeColor: '#0369A1', active: true, sortOrder: 3 },
  { id: 'PRI_LOW', group: 'PRIORITY', code: 'LOW', displayName: 'Low', module: 'Global', badgeColor: '#64748B', active: true, sortOrder: 4 },
];
