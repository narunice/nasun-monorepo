import { getSuiClient } from '../../lib/sui-client'
import { MINES_GRID_SIZE, MINES_SESSION_TYPE } from '../../lib/gostop-config'
import { MINES_SESSION_STATUS } from './mines-config'

export interface MinesSession {
  id: string
  player: string
  betAmount: bigint
  mineCount: number
  revealed: boolean[]
  safeReveals: number
  status: number
  /** DEVNET ONLY: readable via RPC. Kept here so the UI can render the
   * final explosion animation. Do NOT use to short-circuit gameplay. */
  minePositions: number[]
  createdAt: number
}

/**
 * Find the caller's single active Mines session, if any. Contract enforces
 * 1-session-per-address so at most one should match.
 */
export async function getMyActiveSession(
  owner: string,
): Promise<MinesSession | null> {
  const client = getSuiClient()
  const res = await client.getOwnedObjects({
    owner,
    filter: { StructType: MINES_SESSION_TYPE },
    options: { showContent: true },
  })
  for (const entry of res.data) {
    if (entry.data?.content?.dataType !== 'moveObject') continue
    const fields = (entry.data.content as unknown as { fields: Record<string, unknown> }).fields
    const parsed = parseSession(entry.data.objectId, fields)
    if (parsed.status === MINES_SESSION_STATUS.ACTIVE) return parsed
  }
  return null
}

export async function fetchSession(sessionId: string): Promise<MinesSession | null> {
  const client = getSuiClient()
  const res = await client.getObject({
    id: sessionId,
    options: { showContent: true },
  })
  if (res.data?.content?.dataType !== 'moveObject') return null
  const fields = (res.data.content as unknown as { fields: Record<string, unknown> }).fields
  return parseSession(sessionId, fields)
}

function parseSession(id: string, fields: Record<string, unknown>): MinesSession {
  const revealedRaw = fields.revealed as boolean[] | undefined
  const revealed: boolean[] = Array.isArray(revealedRaw)
    ? revealedRaw.map(Boolean)
    : new Array(MINES_GRID_SIZE).fill(false)
  const minePosRaw = fields.mine_positions as Array<number | string> | undefined
  const minePositions: number[] = Array.isArray(minePosRaw)
    ? minePosRaw.map((v) => Number(v))
    : []
  return {
    id,
    player: String(fields.player ?? ''),
    betAmount: BigInt(String(fields.bet_amount ?? '0')),
    mineCount: Number(fields.mine_count ?? 0),
    revealed,
    safeReveals: Number(fields.safe_reveals ?? 0),
    status: Number(fields.status ?? 0),
    minePositions,
    createdAt: Number(fields.created_at ?? 0),
  }
}
