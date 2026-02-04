/**
 * Governance Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, GovernanceConfig } from '../types';

export const GOVERNANCE_PACKAGE_ID = config.governance.packageId as ObjectId;
export const GOVERNANCE_DASHBOARD = config.governance.dashboard as ObjectId;
export const GOVERNANCE_ADMIN_CAP = config.governance.adminCap as ObjectId;
export const GOVERNANCE_VOTING_POWER_ORACLE = config.governance.votingPowerOracle as ObjectId;
export const GOVERNANCE_CERTIFICATE_REGISTRY = config.governance.certificateRegistry as ObjectId;
export const GOVERNANCE_PROPOSAL_TYPE_REGISTRY = config.governance.proposalTypeRegistry as ObjectId;

export const GOVERNANCE: GovernanceConfig = {
  packageId: GOVERNANCE_PACKAGE_ID,
  dashboard: GOVERNANCE_DASHBOARD,
  adminCap: GOVERNANCE_ADMIN_CAP,
  votingPowerOracle: GOVERNANCE_VOTING_POWER_ORACLE,
  certificateRegistry: GOVERNANCE_CERTIFICATE_REGISTRY,
  proposalTypeRegistry: GOVERNANCE_PROPOSAL_TYPE_REGISTRY,
};
