/**
 * Shared SuiClient singleton for Baram frontend
 */

import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';
import { createRetryFetch } from '@nasun/wallet';
import { NETWORK_CONFIG } from './network';

export const suiClient = new SuiClient({
  transport: new SuiHTTPTransport({
    url: NETWORK_CONFIG.rpcUrl,
    fetch: createRetryFetch(),
  }),
});
