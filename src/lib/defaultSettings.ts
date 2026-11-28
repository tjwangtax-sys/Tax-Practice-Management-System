import { normalizeSettingGroup } from './settingsDropdown';

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
  'CLIENT STATUS',
  'CLIENT CATEGORY',
  'SME STATUS',
  'MYTAX APPOINTMENT',
  'E INVOICE STATUS',
  'ENGAGEMENT STATUS',
  'BUSINESS STATUS',
  'YA STATUS',
  'TAX AGENT',
  'JOB TYPE',
  'JOB STATUS',
  'AUDIT TYPE',
  'FORM C SUBMISSION STATUS',
  'MITRS SUBMISSION STATUS',
  'CP204 STATUS',
  'CP204 SUBMISSION STATUS',
  'CP204A REVISIONS SUBMISSION STATUS',
  'CORP STATUS',
  'INDIV STATUS',
  'FORM E STATUS',
  'PAYMENT STATUS',
  'CORRESPONDENCE STATUS',
  'CORRESPONDENCE CATEGORY',
  'LETTER TYPE',
  'METHOD RECEIVED',
  'CORRESPONDENCE TYPE',
  'BILLING STATUS',
  'WORK DONE DESCRIPTION',
  'PRIORITY',
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

const RAW_MALAYSIAN_TAX_SETTINGS: SeedSettingTemplate[] = [
  // CLIENT STATUS (Exact 8 statuses required)
  { id: 'CS_ACTIVE', group: 'CLIENT STATUS', code: 'ACTIVE', displayName: 'Active', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'CS_RESIGNED', group: 'CLIENT STATUS', code: 'RESIGNED', displayName: 'Resigned', module: 'Client Master', badgeColor: '#B91C1C', active: true, sortOrder: 2 },
  { id: 'CS_WINDING_UP', group: 'CLIENT STATUS', code: 'WINDING_UP', displayName: 'Winding-Up', module: 'Client Master', badgeColor: '#C2410C', active: true, sortOrder: 3 },
  { id: 'CS_STRIKE_OFF', group: 'CLIENT STATUS', code: 'STRIKE_OFF', displayName: 'Strike-Off', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 4 },
  { id: 'CS_CANCELLED', group: 'CLIENT STATUS', code: 'TAX_FILE_CANCELLED', displayName: 'Tax File Cancelled', module: 'Client Master', badgeColor: '#475569', active: true, sortOrder: 5 },
  { id: 'CS_ONE_OFF', group: 'CLIENT STATUS', code: 'ONE_OFF', displayName: 'One-Off', module: 'Client Master', badgeColor: '#0369A1', active: true, sortOrder: 6 },
  { id: 'CS_REAPPOINT', group: 'CLIENT STATUS', code: 'RE_APPOINT', displayName: 'Re-appoint', module: 'Client Master', badgeColor: '#0F766E', active: true, sortOrder: 7 },
  { id: 'CS_TRANSFER', group: 'CLIENT STATUS', code: 'TRANSFER_TAGENT', displayName: 'Transfer T.Agent', module: 'Client Master', badgeColor: '#7C3AED', active: true, sortOrder: 8 },

  // CLIENT CATEGORY
  { id: 'CAT_CORP', group: 'CLIENT CATEGORY', code: 'CORPORATE', displayName: 'Corporate', module: 'Client Master', badgeColor: '#1E40AF', active: true, sortOrder: 1 },
  { id: 'CAT_INDIV', group: 'CLIENT CATEGORY', code: 'INDIVIDUAL', displayName: 'Individual', module: 'Client Master', badgeColor: '#0F766E', active: true, sortOrder: 2 },
  { id: 'CAT_OTHER', group: 'CLIENT CATEGORY', code: 'OTHER', displayName: 'Other', module: 'Client Master', badgeColor: '#475569', active: true, sortOrder: 3 },

  // SME STATUS
  { id: 'SME_YES', group: 'SME STATUS', code: 'SME', displayName: 'SME', module: 'Client Master', badgeColor: '#047857', active: true, sortOrder: 1 },
  { id: 'SME_NO', group: 'SME STATUS', code: 'NON_SME', displayName: 'Non-SME', module: 'Client Master', badgeColor: '#334155', active: true, sortOrder: 2 },
  { id: 'SME_NA', group: 'SME STATUS', code: 'NA', displayName: 'N/A', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 3 },

  // MYTAX APPOINTMENT
  { id: 'MYTAX_APP', group: 'MYTAX APPOINTMENT', code: 'APPOINTED', displayName: 'Appointed', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'MYTAX_PEND', group: 'MYTAX APPOINTMENT', code: 'PENDING', displayName: 'Pending', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'MYTAX_NONE', group: 'MYTAX APPOINTMENT', code: 'NOT_APPOINTED', displayName: 'Not Appointed', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 3 },
  { id: 'MYTAX_REV', group: 'MYTAX APPOINTMENT', code: 'REVOKED', displayName: 'Revoked', module: 'Client Master', badgeColor: '#B91C1C', active: true, sortOrder: 4 },

  // E INVOICE STATUS (Malaysian LHDN e-Invoice General Guideline v4.8)
  { id: 'EINV_P1', group: 'E INVOICE STATUS', code: 'PHASE_1', displayName: 'Phase 1 (>RM100M)', module: 'Client Master', badgeColor: '#1D4ED8', active: true, sortOrder: 1 },
  { id: 'EINV_P2', group: 'E INVOICE STATUS', code: 'PHASE_2', displayName: 'Phase 2 (RM25M–100M)', module: 'Client Master', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'EINV_P3', group: 'E INVOICE STATUS', code: 'PHASE_3', displayName: 'Phase 3 (RM5M–25M)', module: 'Client Master', badgeColor: '#0F766E', active: true, sortOrder: 3 },
  { id: 'EINV_P4', group: 'E INVOICE STATUS', code: 'PHASE_4', displayName: 'Phase 4 (RM3M–5M)', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 4 },
  { id: 'EINV_EXEMPT', group: 'E INVOICE STATUS', code: 'EXEMPT', displayName: 'Exempt (<RM3M)', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 5 },
  { id: 'EINV_VOLUNTARY', group: 'E INVOICE STATUS', code: 'VOLUNTARY_IMPLEMENTED', displayName: 'Voluntary / Implemented', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 6 },
  { id: 'EINV_NA', group: 'E INVOICE STATUS', code: 'NOT_APPLICABLE', displayName: 'Not Applicable', module: 'Client Master', badgeColor: '#475569', active: true, sortOrder: 7 },

  // ENGAGEMENT STATUS
  { id: 'ENG_SIGNED', group: 'ENGAGEMENT STATUS', code: 'SIGNED', displayName: 'LOE Signed', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'ENG_PENDING', group: 'ENGAGEMENT STATUS', code: 'PENDING_LOE', displayName: 'Pending LOE', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'ENG_RENEWAL', group: 'ENGAGEMENT STATUS', code: 'RENEWAL_DUE', displayName: 'Renewal Due', module: 'Client Master', badgeColor: '#C2410C', active: true, sortOrder: 3 },
  { id: 'ENG_TERMINATED', group: 'ENGAGEMENT STATUS', code: 'TERMINATED', displayName: 'Terminated', module: 'Client Master', badgeColor: '#B91C1C', active: true, sortOrder: 4 },

  // BUSINESS STATUS
  { id: 'BIZ_ACTIVE', group: 'BUSINESS STATUS', code: 'OPERATING', displayName: 'Operating', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'BIZ_DORMANT', group: 'BUSINESS STATUS', code: 'DORMANT', displayName: 'Dormant', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'BIZ_CEASED', group: 'BUSINESS STATUS', code: 'CEASED', displayName: 'Ceased', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 3 },

  // YA STATUS
  { id: 'YA_FILED', group: 'YA STATUS', code: 'FILED', displayName: 'Filed', module: 'Client Master', badgeColor: '#15803D', active: true, sortOrder: 1 },
  { id: 'YA_WIP', group: 'YA STATUS', code: 'IN_PROGRESS', displayName: 'In Progress', module: 'Client Master', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'YA_PENDING', group: 'YA STATUS', code: 'PENDING_DOCS', displayName: 'Pending Docs', module: 'Client Master', badgeColor: '#B45309', active: true, sortOrder: 3 },
  { id: 'YA_EXEMPT', group: 'YA STATUS', code: 'EXEMPT_DORMANT', displayName: 'Exempt / Not Applicable', module: 'Client Master', badgeColor: '#64748B', active: true, sortOrder: 4 },

  // JOB TYPE
  { id: 'JT_FORM_C', group: 'JOB TYPE', code: 'FORM_C', displayName: 'Form C', module: 'Corporate', badgeColor: '#0F766E', active: true, sortOrder: 1 },
  { id: 'JT_FORM_B', group: 'JOB TYPE', code: 'FORM_B', displayName: 'Form B', module: 'Individual', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'JT_FORM_BE', group: 'JOB TYPE', code: 'FORM_BE', displayName: 'Form BE', module: 'Individual', badgeColor: '#0284C7', active: true, sortOrder: 3 },
  { id: 'JT_FORM_M', group: 'JOB TYPE', code: 'FORM_M', displayName: 'Form M', module: 'Individual', badgeColor: '#1D4ED8', active: true, sortOrder: 4 },
  { id: 'JT_FORM_P', group: 'JOB TYPE', code: 'FORM_P', displayName: 'Form P', module: 'Individual', badgeColor: '#4338CA', active: true, sortOrder: 5 },
  { id: 'JT_FORM_E', group: 'JOB TYPE', code: 'FORM_E', displayName: 'Form E', module: 'Form E', badgeColor: '#B45309', active: true, sortOrder: 6 },
  { id: 'JT_CP204', group: 'JOB TYPE', code: 'CP204', displayName: 'CP204', module: 'CP204', badgeColor: '#1E40AF', active: true, sortOrder: 7 },
  { id: 'JT_CP204A', group: 'JOB TYPE', code: 'CP204A', displayName: 'CP204A', module: 'CP204', badgeColor: '#7C3AED', active: true, sortOrder: 8 },
  { id: 'JT_CP204B', group: 'JOB TYPE', code: 'CP204B', displayName: 'CP204B', module: 'CP204', badgeColor: '#6D28D9', active: true, sortOrder: 9 },
  { id: 'JT_MITRS', group: 'JOB TYPE', code: 'MITRS', displayName: 'MITRS', module: 'Corporate', badgeColor: '#047857', active: true, sortOrder: 10 },
  { id: 'JT_TAX_AUDIT', group: 'JOB TYPE', code: 'TAX_AUDIT', displayName: 'Tax Audit', module: 'Ad Hoc', badgeColor: '#C2410C', active: true, sortOrder: 11 },
  { id: 'JT_RPGT', group: 'JOB TYPE', code: 'RPGT_CKHT', displayName: 'RPGT / CKHT', module: 'Ad Hoc', badgeColor: '#9A3412', active: true, sortOrder: 12 },
  { id: 'JT_TAX_APPEAL', group: 'JOB TYPE', code: 'TAX_APPEAL', displayName: 'Tax Appeal', module: 'Ad Hoc', badgeColor: '#B91C1C', active: true, sortOrder: 13 },
  { id: 'JT_TAX_REFUND', group: 'JOB TYPE', code: 'TAX_REFUND', displayName: 'Tax Refund', module: 'Ad Hoc', badgeColor: '#15803D', active: true, sortOrder: 14 },
  { id: 'JT_TAX_RESIDENCY', group: 'JOB TYPE', code: 'TAX_RESIDENCY', displayName: 'Tax Residency', module: 'Ad Hoc', badgeColor: '#0E7490', active: true, sortOrder: 15 },
  { id: 'JT_OTHER', group: 'JOB TYPE', code: 'OTHER', displayName: 'Other', module: 'Ad Hoc', badgeColor: '#64748B', active: true, sortOrder: 16 },

  // JOB STATUS (Global / All Jobs)
  { id: 'JS_NOT_STARTED', group: 'JOB STATUS', code: 'NOT_STARTED', displayName: 'Not Started', module: 'All Jobs', badgeColor: '#64748B', active: true, sortOrder: 1 },
  { id: 'JS_PENDING_DOCS', group: 'JOB STATUS', code: 'PENDING_DOCS', displayName: 'Pending Docs', module: 'All Jobs', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'JS_IN_PROGRESS', group: 'JOB STATUS', code: 'IN_PROGRESS', displayName: 'In Progress', module: 'All Jobs', badgeColor: '#0369A1', active: true, sortOrder: 3 },
  { id: 'JS_REVIEW', group: 'JOB STATUS', code: 'MANAGER_REVIEW', displayName: 'Manager Review', module: 'All Jobs', badgeColor: '#7C3AED', active: true, sortOrder: 4 },
  { id: 'JS_CLIENT_APP', group: 'JOB STATUS', code: 'CLIENT_APPROVAL', displayName: 'Client Approval', module: 'All Jobs', badgeColor: '#C2410C', active: true, sortOrder: 5 },
  { id: 'JS_PENDING_MITRS', group: 'JOB STATUS', code: 'PENDING_MITRS', displayName: 'Pending MITRS', module: 'All Jobs', badgeColor: '#0284C7', active: true, sortOrder: 6 },
  { id: 'JS_SUBMITTED', group: 'JOB STATUS', code: 'SUBMITTED_LHDN', displayName: 'Submitted to LHDN', module: 'All Jobs', badgeColor: '#0F766E', active: true, sortOrder: 7 },
  { id: 'JS_COMPLETED', group: 'JOB STATUS', code: 'COMPLETED', displayName: 'Completed', module: 'All Jobs', badgeColor: '#CA8A04', active: true, sortOrder: 8 },
  { id: 'JS_ON_HOLD', group: 'JOB STATUS', code: 'ON_HOLD', displayName: 'On Hold', module: 'All Jobs', badgeColor: '#B91C1C', active: true, sortOrder: 9 },

  // AUDIT TYPE
  { id: 'AT_AUDITED', group: 'AUDIT TYPE', code: 'AUDITED', displayName: 'Audited', module: 'Corporate', badgeColor: '#0369A1', active: true, sortOrder: 1 },
  { id: 'AT_UNAUDITED', group: 'AUDIT TYPE', code: 'UNAUDITED', displayName: 'Unaudited', module: 'Corporate', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'AT_EPC', group: 'AUDIT TYPE', code: 'EPC', displayName: 'EPC', module: 'Corporate', badgeColor: '#7C3AED', active: true, sortOrder: 3 },

  // FORM C SUBMISSION STATUS
  { id: 'FC_PENDING', group: 'FORM C SUBMISSION STATUS', code: 'PENDING', displayName: 'Pending', module: 'Corporate', badgeColor: '#64748B', active: true, sortOrder: 1 },
  { id: 'FC_IN_PROGRESS', group: 'FORM C SUBMISSION STATUS', code: 'IN_PROGRESS', displayName: 'In Progress', module: 'Corporate', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'FC_PREPARED', group: 'FORM C SUBMISSION STATUS', code: 'PREPARED', displayName: 'Prepared', module: 'Corporate', badgeColor: '#4338CA', active: true, sortOrder: 3 },
  { id: 'FC_REVIEW', group: 'FORM C SUBMISSION STATUS', code: 'MANAGER_REVIEW', displayName: 'Manager Review', module: 'Corporate', badgeColor: '#B45309', active: true, sortOrder: 4 },
  { id: 'FC_APPROVAL', group: 'FORM C SUBMISSION STATUS', code: 'CLIENT_APPROVAL', displayName: 'Client Approval', module: 'Corporate', badgeColor: '#7C3AED', active: true, sortOrder: 5 },
  { id: 'FC_SUBMITTED', group: 'FORM C SUBMISSION STATUS', code: 'SUBMITTED', displayName: 'Submitted', module: 'Corporate', badgeColor: '#15803D', active: true, sortOrder: 6 },
  { id: 'FC_NA', group: 'FORM C SUBMISSION STATUS', code: 'NOT_APPLICABLE', displayName: 'Not Applicable', module: 'Corporate', badgeColor: '#64748B', active: true, sortOrder: 7 },

  // MITRS SUBMISSION STATUS
  { id: 'MITRS_PENDING', group: 'MITRS SUBMISSION STATUS', code: 'PENDING', displayName: 'Pending', module: 'Corporate', badgeColor: '#64748B', active: true, sortOrder: 1 },
  { id: 'MITRS_SUBMITTED', group: 'MITRS SUBMISSION STATUS', code: 'SUBMITTED', displayName: 'Submitted', module: 'Corporate', badgeColor: '#15803D', active: true, sortOrder: 2 },
  { id: 'MITRS_SELF_SUBMIT', group: 'MITRS SUBMISSION STATUS', code: 'SELF_SUBMIT', displayName: 'Self-Submit', module: 'Corporate', badgeColor: '#0F766E', active: true, sortOrder: 3 },
  { id: 'MITRS_NA', group: 'MITRS SUBMISSION STATUS', code: 'NOT_APPLICABLE', displayName: 'Not Applicable', module: 'Corporate', badgeColor: '#64748B', active: true, sortOrder: 4 },

  // CP204 STATUS
  { id: 'CP_DRAFT', group: 'CP204 STATUS', code: 'ESTIMATE_DRAFT', displayName: 'Estimate Drafted', module: 'CP204', badgeColor: '#0369A1', active: true, sortOrder: 1 },
  { id: 'CP_SUBMITTED', group: 'CP204 STATUS', code: 'CP204_SUBMITTED', displayName: 'CP204 Submitted', module: 'CP204', badgeColor: '#0F766E', active: true, sortOrder: 2 },
  { id: 'CP_REV_6', group: 'CP204 STATUS', code: 'CP204A_6TH', displayName: 'CP204A (6th Mth)', module: 'CP204', badgeColor: '#7C3AED', active: true, sortOrder: 3 },
  { id: 'CP_REV_9', group: 'CP204 STATUS', code: 'CP204A_9TH', displayName: 'CP204A (9th Mth)', module: 'CP204', badgeColor: '#B45309', active: true, sortOrder: 4 },
  { id: 'CP_REV_11', group: 'CP204 STATUS', code: 'CP204A_11TH', displayName: 'CP204A (11th Mth)', module: 'CP204', badgeColor: '#C2410C', active: true, sortOrder: 5 },
  { id: 'CP_SME_EXEMPT', group: 'CP204 STATUS', code: 'SME_EXEMPT', displayName: 'SME 2-Yr Exempt', module: 'CP204', badgeColor: '#15803D', active: true, sortOrder: 6 },

  // PAYMENT STATUS
  { id: 'PAY_UNPAID', group: 'PAYMENT STATUS', code: 'UNPAID', displayName: 'Unpaid', module: 'Tax Payment Monitor', badgeColor: '#B45309', active: true, sortOrder: 1 },
  { id: 'PAY_PARTIAL', group: 'PAYMENT STATUS', code: 'PARTIAL', displayName: 'Partial Paid', module: 'Tax Payment Monitor', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'PAY_PAID', group: 'PAYMENT STATUS', code: 'PAID', displayName: 'Paid (FPX / ByrHASiL)', module: 'Tax Payment Monitor', badgeColor: '#15803D', active: true, sortOrder: 3 },
  { id: 'PAY_OVERDUE', group: 'PAYMENT STATUS', code: 'OVERDUE', displayName: 'Overdue (10% Penalty Risk)', module: 'Tax Payment Monitor', badgeColor: '#B91C1C', active: true, sortOrder: 4 },

  // CORRESPONDENCE STATUS
  { id: 'CORR_OPEN', group: 'CORRESPONDENCE STATUS', code: 'OPEN', displayName: 'Open Query', module: 'Correspondence', badgeColor: '#B45309', active: true, sortOrder: 1 },
  { id: 'CORR_DRAFTING', group: 'CORRESPONDENCE STATUS', code: 'DRAFTING', displayName: 'Drafting Reply', module: 'Correspondence', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'CORR_REPLIED', group: 'CORRESPONDENCE STATUS', code: 'REPLIED', displayName: 'Replied to LHDN', module: 'Correspondence', badgeColor: '#0F766E', active: true, sortOrder: 3 },
  { id: 'CORR_CLOSED', group: 'CORRESPONDENCE STATUS', code: 'CLOSED', displayName: 'Closed / Resolved', module: 'Correspondence', badgeColor: '#15803D', active: true, sortOrder: 4 },
  { id: 'CORR_ESCALATED', group: 'CORRESPONDENCE STATUS', code: 'APPEAL', displayName: 'Form Q / Appeal', module: 'Correspondence', badgeColor: '#B91C1C', active: true, sortOrder: 5 },

  // CORRESPONDENCE CATEGORY
  { id: 'CCAT_LHDN', group: 'CORRESPONDENCE CATEGORY', code: 'LHDN', displayName: 'LHDN', module: 'Correspondence', badgeColor: '#1D4ED8', active: true, sortOrder: 1 },
  { id: 'CCAT_SSM', group: 'CORRESPONDENCE CATEGORY', code: 'SSM', displayName: 'SSM', module: 'Correspondence', badgeColor: '#7C3AED', active: true, sortOrder: 2 },
  { id: 'CCAT_CLIENT', group: 'CORRESPONDENCE CATEGORY', code: 'CLIENT', displayName: 'Client', module: 'Correspondence', badgeColor: '#0F766E', active: true, sortOrder: 3 },
  { id: 'CCAT_AUDITOR', group: 'CORRESPONDENCE CATEGORY', code: 'AUDITOR', displayName: 'Auditor', module: 'Correspondence', badgeColor: '#B45309', active: true, sortOrder: 4 },
  { id: 'CCAT_OTHER', group: 'CORRESPONDENCE CATEGORY', code: 'OTHER', displayName: 'Other', module: 'Correspondence', badgeColor: '#64748B', active: true, sortOrder: 5 },

  // LETTER TYPE
  { id: 'LT_NOTICE', group: 'LETTER TYPE', code: 'NOTICE', displayName: 'Notice', module: 'Correspondence', badgeColor: '#0369A1', active: true, sortOrder: 1 },
  { id: 'LT_QUERY', group: 'LETTER TYPE', code: 'QUERY', displayName: 'Query', module: 'Correspondence', badgeColor: '#B45309', active: true, sortOrder: 2 },
  { id: 'LT_ASSESSMENT', group: 'LETTER TYPE', code: 'ASSESSMENT', displayName: 'Assessment', module: 'Correspondence', badgeColor: '#7C3AED', active: true, sortOrder: 3 },
  { id: 'LT_AUDIT', group: 'LETTER TYPE', code: 'AUDIT', displayName: 'Audit', module: 'Correspondence', badgeColor: '#B91C1C', active: true, sortOrder: 4 },
  { id: 'LT_APPEAL', group: 'LETTER TYPE', code: 'APPEAL', displayName: 'Appeal', module: 'Correspondence', badgeColor: '#C2410C', active: true, sortOrder: 5 },
  { id: 'LT_REMINDER', group: 'LETTER TYPE', code: 'REMINDER', displayName: 'Reminder', module: 'Correspondence', badgeColor: '#0F766E', active: true, sortOrder: 6 },
  { id: 'LT_OTHER', group: 'LETTER TYPE', code: 'OTHER', displayName: 'Other', module: 'Correspondence', badgeColor: '#64748B', active: true, sortOrder: 7 },

  // METHOD RECEIVED
  { id: 'MR_EMAIL', group: 'METHOD RECEIVED', code: 'EMAIL', displayName: 'Email', module: 'Correspondence', badgeColor: '#0369A1', active: true, sortOrder: 1 },
  { id: 'MR_POST', group: 'METHOD RECEIVED', code: 'POST', displayName: 'Post', module: 'Correspondence', badgeColor: '#475569', active: true, sortOrder: 2 },
  { id: 'MR_PORTAL', group: 'METHOD RECEIVED', code: 'PORTAL', displayName: 'Portal', module: 'Correspondence', badgeColor: '#0F766E', active: true, sortOrder: 3 },
  { id: 'MR_HAND', group: 'METHOD RECEIVED', code: 'HAND_DELIVERED', displayName: 'Hand Delivered', module: 'Correspondence', badgeColor: '#B45309', active: true, sortOrder: 4 },
  { id: 'MR_OTHER', group: 'METHOD RECEIVED', code: 'OTHER', displayName: 'Other', module: 'Correspondence', badgeColor: '#64748B', active: true, sortOrder: 5 },

  // CORRESPONDENCE TYPE
  { id: 'CT_DESK', group: 'CORRESPONDENCE TYPE', code: 'DESK_AUDIT', displayName: 'LHDN Desk Audit', module: 'Correspondence', badgeColor: '#B45309', active: true, sortOrder: 1 },
  { id: 'CT_FIELD', group: 'CORRESPONDENCE TYPE', code: 'FIELD_AUDIT', displayName: 'LHDN Field Audit', module: 'Correspondence', badgeColor: '#B91C1C', active: true, sortOrder: 2 },
  { id: 'CT_QUERY', group: 'CORRESPONDENCE TYPE', code: 'TAX_QUERY', displayName: 'Section 78 / 81 Query', module: 'Correspondence', badgeColor: '#0369A1', active: true, sortOrder: 3 },
  { id: 'CT_APPEAL', group: 'CORRESPONDENCE TYPE', code: 'FORM_Q', displayName: 'Form Q Appeal', module: 'Correspondence', badgeColor: '#7C3AED', active: true, sortOrder: 4 },
  { id: 'CT_REFUND', group: 'CORRESPONDENCE TYPE', code: 'REFUND_FOLLOWUP', displayName: 'Tax Refund Follow-up', module: 'Correspondence', badgeColor: '#0F766E', active: true, sortOrder: 5 },

  // BILLING STATUS
  { id: 'BILL_UNBILLED', group: 'BILLING STATUS', code: 'UNBILLED', displayName: 'Unbilled WIP', module: 'Work Done & Finance', badgeColor: '#64748B', active: true, sortOrder: 1 },
  { id: 'BILL_DRAFT', group: 'BILLING STATUS', code: 'BILLING_READY', displayName: 'Ready to Bill', module: 'Work Done & Finance', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'BILL_INVOICED', group: 'BILLING STATUS', code: 'INVOICED', displayName: 'Invoiced', module: 'Work Done & Finance', badgeColor: '#B45309', active: true, sortOrder: 3 },
  { id: 'BILL_COLLECTED', group: 'BILLING STATUS', code: 'COLLECTED', displayName: 'Collected', module: 'Work Done & Finance', badgeColor: '#15803D', active: true, sortOrder: 4 },

  // PRIORITY
  { id: 'PRI_URGENT', group: 'PRIORITY', code: 'URGENT', displayName: 'Urgent', module: 'Global', badgeColor: '#B91C1C', active: true, sortOrder: 1 },
  { id: 'PRI_HIGH', group: 'PRIORITY', code: 'HIGH', displayName: 'High', module: 'Global', badgeColor: '#C2410C', active: true, sortOrder: 2 },
  { id: 'PRI_NORMAL', group: 'PRIORITY', code: 'NORMAL', displayName: 'Normal', module: 'Global', badgeColor: '#0369A1', active: true, sortOrder: 3 },
  { id: 'PRI_LOW', group: 'PRIORITY', code: 'LOW', displayName: 'Low', module: 'Global', badgeColor: '#64748B', active: true, sortOrder: 4 },

  // WORK DONE DESCRIPTION (Catalogue for Work Done & Finance)
  { id: 'WDD_FORMC', group: 'WORK DONE DESCRIPTION', code: 'FORM_C', displayName: 'Preparation & e-Filing of Form C Corporate Income Tax Return', module: 'Work Done & Finance', badgeColor: '#0F766E', active: true, sortOrder: 1 },
  { id: 'WDD_MITRS', group: 'WORK DONE DESCRIPTION', code: 'MITRS', displayName: 'Preparation & Submission of MITRS Working Sheets', module: 'Work Done & Finance', badgeColor: '#0369A1', active: true, sortOrder: 2 },
  { id: 'WDD_CP204', group: 'WORK DONE DESCRIPTION', code: 'CP204', displayName: 'Preparation & Submission of CP204 Initial Tax Estimate', module: 'Work Done & Finance', badgeColor: '#1E40AF', active: true, sortOrder: 3 },
  { id: 'WDD_CP204A', group: 'WORK DONE DESCRIPTION', code: 'CP204A', displayName: 'Preparation & Submission of CP204A Revised Tax Estimate', module: 'Work Done & Finance', badgeColor: '#7C3AED', active: true, sortOrder: 4 },
  { id: 'WDD_FORMB', group: 'WORK DONE DESCRIPTION', code: 'FORM_B', displayName: 'Preparation & e-Filing of Form B / Form BE Personal Tax Return', module: 'Work Done & Finance', badgeColor: '#047857', active: true, sortOrder: 5 },
  { id: 'WDD_FORME', group: 'WORK DONE DESCRIPTION', code: 'FORM_E', displayName: 'Preparation & Submission of Form E, C.P.8D & Form EA', module: 'Work Done & Finance', badgeColor: '#B45309', active: true, sortOrder: 6 },
  { id: 'WDD_AUDIT', group: 'WORK DONE DESCRIPTION', code: 'TAX_AUDIT', displayName: 'LHDN Tax Audit Representation & Query Response', module: 'Work Done & Finance', badgeColor: '#C2410C', active: true, sortOrder: 7 },
  { id: 'WDD_RPGT', group: 'WORK DONE DESCRIPTION', code: 'RPGT', displayName: 'Preparation & Submission of CKHT / RPGT Return', module: 'Work Done & Finance', badgeColor: '#475569', active: true, sortOrder: 8 },
];

export const DEFAULT_MALAYSIAN_TAX_SETTINGS: SeedSettingTemplate[] =
  RAW_MALAYSIAN_TAX_SETTINGS.map((item) => ({
    ...item,
    group: normalizeSettingGroup(item.group),
  }));
