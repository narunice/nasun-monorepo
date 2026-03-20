/**
 * Governance Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, GovernanceConfig } from '../types';

export const GOVERNANCE_PACKAGE_ID = config.governance.packageId as ObjectId;
export const GOVERNANCE_ORIGINAL_PACKAGE_ID = config.governance.originalPackageId as ObjectId | undefined;
export const GOVERNANCE_MULTI_CHOICE_PACKAGE_ID = config.governance.multiChoicePackageId as ObjectId | undefined;
export const GOVERNANCE_UPGRADE_CAP = config.governance.upgradeCap as ObjectId | undefined;
export const GOVERNANCE_DASHBOARD = config.governance.dashboard as ObjectId;
export const GOVERNANCE_ADMIN_CAP = config.governance.adminCap as ObjectId;
export const GOVERNANCE_VOTING_POWER_ORACLE = config.governance.votingPowerOracle as ObjectId;
export const GOVERNANCE_CERTIFICATE_REGISTRY = config.governance.certificateRegistry as ObjectId;
export const GOVERNANCE_PROPOSAL_TYPE_REGISTRY = config.governance.proposalTypeRegistry as ObjectId;

export const GOVERNANCE: GovernanceConfig = {
  packageId: GOVERNANCE_PACKAGE_ID,
  originalPackageId: GOVERNANCE_ORIGINAL_PACKAGE_ID,
  multiChoicePackageId: GOVERNANCE_MULTI_CHOICE_PACKAGE_ID,
  upgradeCap: GOVERNANCE_UPGRADE_CAP,
  dashboard: GOVERNANCE_DASHBOARD,
  adminCap: GOVERNANCE_ADMIN_CAP,
  votingPowerOracle: GOVERNANCE_VOTING_POWER_ORACLE,
  certificateRegistry: GOVERNANCE_CERTIFICATE_REGISTRY,
  proposalTypeRegistry: GOVERNANCE_PROPOSAL_TYPE_REGISTRY,
};
