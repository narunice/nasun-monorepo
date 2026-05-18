/**
 * Prediction Market Configuration
 *
 * `packageId` (latest published-at) — used as moveCall target.
 * `originalPackageId` (first publish, Immutable) — used to identify Position /
 *   Market / event types. Sui anchors object types to the original Package ID,
 *   so after an upgrade existing Position NFTs still report the original ID
 *   in their type signature.
 */
import config from '../../devnet-ids.json';
import type { ObjectId, PredictionConfig } from '../types';

export const PREDICTION_PACKAGE_ID = config.prediction.packageId as ObjectId;
export const PREDICTION_ORIGINAL_PACKAGE_ID = (
  config.prediction.originalPackageId ?? config.prediction.packageId
) as ObjectId;
export const PREDICTION_ADMIN_CAP = config.prediction.adminCap as ObjectId;

export const PREDICTION: PredictionConfig = {
  packageId: PREDICTION_PACKAGE_ID,
  originalPackageId: PREDICTION_ORIGINAL_PACKAGE_ID,
  adminCap: PREDICTION_ADMIN_CAP,
};
