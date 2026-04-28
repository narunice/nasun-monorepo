/**
 * Prediction Market Configuration
 */
import config from '../../devnet-ids.json';
import type { ObjectId, PredictionConfig } from '../types';

export const PREDICTION_PACKAGE_ID = config.prediction.packageId as ObjectId;
export const PREDICTION_ADMIN_CAP = config.prediction.adminCap as ObjectId;

export const PREDICTION: PredictionConfig = {
  packageId: PREDICTION_PACKAGE_ID,
  adminCap: PREDICTION_ADMIN_CAP,
};
