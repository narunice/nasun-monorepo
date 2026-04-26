/**
 * Explorer URL helpers.
 *
 * `devnetIds.network` is the Move client network alias (e.g. `nasun-devnet`),
 * which does NOT match the URL segment expected by the public explorer
 * (`devnet`). Map locally so a future devnet alias rename can't 404 history Tx
 * links.
 */

import { GOSTOP_NETWORK } from './gostop-config'

const NETWORK_SEGMENT_MAP: Record<string, string> = {
  'nasun-devnet': 'devnet',
  devnet: 'devnet',
  testnet: 'testnet',
  mainnet: 'mainnet',
}

const segment = NETWORK_SEGMENT_MAP[GOSTOP_NETWORK ?? ''] ?? 'devnet'
const EXPLORER_BASE = `https://explorer.nasun.io/${segment}`

export function getExplorerTxUrl(digest: string): string {
  return `${EXPLORER_BASE}/tx/${digest}`
}

export function getExplorerObjectUrl(id: string): string {
  return `${EXPLORER_BASE}/object/${id}`
}
