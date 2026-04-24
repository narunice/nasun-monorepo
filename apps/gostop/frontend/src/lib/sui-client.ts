import { SuiClient } from '@mysten/sui/client';
import { GOSTOP_RPC_URL } from './gostop-config';

let cached: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!cached) {
    cached = new SuiClient({ url: GOSTOP_RPC_URL });
  }
  return cached;
}
