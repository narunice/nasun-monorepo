/**
 * Shared SuiClient singleton for Baram frontend
 */

import { SuiClient } from '@mysten/sui/client';
import { NETWORK_CONFIG } from './network';

export const suiClient = new SuiClient({ url: NETWORK_CONFIG.rpcUrl });
