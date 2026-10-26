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

/**
 * Explorer REST base, for reads like Nasun Standing. Defaults to production
 * rather than requiring a new VITE_* key in every gostop env file, matching
 * what pado's NETWORK_CONFIG.explorerApiUrl does; an env override still wins
 * if one is ever set.
 */
export const EXPLORER_API_URL =
  import.meta.env.VITE_EXPLORER_API_URL || 'https://explorer.nasun.io/api/v1'

export function getExplorerTxUrl(digest: string, viewer?: string | null): string {
  const base = `${EXPLORER_BASE}/tx/${digest}`
  return viewer ? `${base}?viewer=${encodeURIComponent(viewer)}` : base
}

export function getExplorerObjectUrl(id: string): string {
  return `${EXPLORER_BASE}/object/${id}`
}
