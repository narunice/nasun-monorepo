// Pool-to-room mapping for DeepBook trading pools.
// Uses nasun's 100+ room ID scheme (Language: 0-99, Market: 100+).
// Does NOT import or redefine RoomInfo -- room definitions live in types.ts.

// Map DeepBook pool object IDs to chat room IDs (set at startup)
const poolRoomMap = new Map<string, number>();

// Room ID -> symbol (derived from pool mappings at startup)
const roomSymbolMap = new Map<number, string>();

// Expected symbol for each market room ID
const ROOM_SYMBOL: Record<number, string> = {
  100: 'NASUN', // Pado room = NASUN/NUSDC pool
  101: 'NBTC',
  103: 'NETH',
  104: 'NSOL',
};

// Base token decimals per symbol (NBTC/NETH=8, NASUN/NSOL=9)
const BASE_DECIMALS: Record<string, number> = {
  NBTC: 8,
  NETH: 8,
  NASUN: 9,
  NSOL: 9,
};

export function setPoolRoomMapping(poolId: string, roomId: number): void {
  poolRoomMap.set(poolId, roomId);
  const symbol = ROOM_SYMBOL[roomId];
  if (symbol) {
    roomSymbolMap.set(roomId, symbol);
  }
  console.log(`[Rooms] Pool ${poolId.slice(0, 10)}... -> room ${roomId} (${symbol || 'unknown'})`);
}

export function getPoolRoom(poolId: string): number | null {
  return poolRoomMap.get(poolId) ?? null;
}

/**
 * Get display symbol for a pool (e.g., "NBTC", "NASUN").
 * Returns the symbol if a mapping exists, otherwise null.
 */
export function getPoolSymbol(poolId: string): string | null {
  const roomId = poolRoomMap.get(poolId);
  if (roomId == null) return null;
  return roomSymbolMap.get(roomId) ?? null;
}

/**
 * Get base token decimals for a pool (default 9 for unknown pools).
 */
export function getPoolBaseDecimals(poolId: string): number {
  const symbol = getPoolSymbol(poolId);
  return symbol ? (BASE_DECIMALS[symbol] ?? 9) : 9;
}
