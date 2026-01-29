/**
 * Baram AI Settlement Layer Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, BaramConfig } from '../types';
import { NUSDC_TYPE } from './tokens';

export const BARAM_PACKAGE_ID = config.baram.packageId as ObjectId;
export const BARAM_REGISTRY = config.baram.registry as ObjectId;
export const BARAM_UPGRADE_CAP = config.baram.upgradeCap as ObjectId;

export const EXECUTOR_PACKAGE_ID = config.baram.executorPackageId as ObjectId;
export const EXECUTOR_REGISTRY = config.baram.executorRegistry as ObjectId;
export const EXECUTOR_ADMIN_CAP = config.baram.executorAdminCap as ObjectId;
export const EXECUTOR_UPGRADE_CAP = config.baram.executorUpgradeCap as ObjectId;

// Staking (Phase D-4)
export const STAKING_CONFIG = config.baram.stakingConfig as ObjectId;
export const STAKING_REGISTRY = config.baram.stakingRegistry as ObjectId;
export const STAKING_ADMIN_CAP = config.baram.stakingAdminCap as ObjectId;

export const ATTESTATION_PACKAGE_ID = config.baram.attestationPackageId as ObjectId;
export const ATTESTATION_REGISTRY = config.baram.attestationRegistry as ObjectId;
export const ATTESTATION_ADMIN_CAP = config.baram.attestationAdminCap as ObjectId;
export const ATTESTATION_UPGRADE_CAP = config.baram.attestationUpgradeCap as ObjectId;

// Compliance (ECR)
export const COMPLIANCE_PACKAGE_ID = config.baram.compliancePackageId as ObjectId;
export const COMPLIANCE_REGISTRY = config.baram.complianceRegistry as ObjectId;
export const COMPLIANCE_ADMIN_CAP = config.baram.complianceAdminCap as ObjectId;
export const COMPLIANCE_UPGRADE_CAP = config.baram.complianceUpgradeCap as ObjectId;

// Baram now uses the unified devnet_tokens NUSDC
// Note: Requires baram contract redeployment to use devnet_tokens::nusdc::NUSDC
export const BARAM: BaramConfig = {
  packageId: BARAM_PACKAGE_ID,
  registry: BARAM_REGISTRY,
  upgradeCap: BARAM_UPGRADE_CAP,
  executorPackageId: EXECUTOR_PACKAGE_ID,
  executorRegistry: EXECUTOR_REGISTRY,
  executorAdminCap: EXECUTOR_ADMIN_CAP,
  executorUpgradeCap: EXECUTOR_UPGRADE_CAP,
  stakingConfig: STAKING_CONFIG,
  stakingRegistry: STAKING_REGISTRY,
  stakingAdminCap: STAKING_ADMIN_CAP,
  attestationPackageId: ATTESTATION_PACKAGE_ID,
  attestationRegistry: ATTESTATION_REGISTRY,
  attestationAdminCap: ATTESTATION_ADMIN_CAP,
  attestationUpgradeCap: ATTESTATION_UPGRADE_CAP,
  compliancePackageId: COMPLIANCE_PACKAGE_ID,
  complianceRegistry: COMPLIANCE_REGISTRY,
  complianceAdminCap: COMPLIANCE_ADMIN_CAP,
  complianceUpgradeCap: COMPLIANCE_UPGRADE_CAP,
  nusdcType: NUSDC_TYPE,
};
