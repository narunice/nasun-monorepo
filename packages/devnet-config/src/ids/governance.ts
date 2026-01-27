/**
 * Governance Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, GovernanceConfig } from '../types';

export const GOVERNANCE_PACKAGE_ID = config.governance.packageId as ObjectId;
export const GOVERNANCE_DASHBOARD = config.governance.dashboard as ObjectId;
export const GOVERNANCE_ADMIN_CAP = config.governance.adminCap as ObjectId;

export const GOVERNANCE: GovernanceConfig = {
  packageId: GOVERNANCE_PACKAGE_ID,
  dashboard: GOVERNANCE_DASHBOARD,
  adminCap: GOVERNANCE_ADMIN_CAP,
};
