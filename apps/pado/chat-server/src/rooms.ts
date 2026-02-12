import type { RoomInfo } from './types.js';

// Predefined rooms
const rooms: Map<number, RoomInfo> = new Map([
  [0, { id: 0, name: 'Global', description: 'Global chat room' }],
  [1, { id: 1, name: 'NBTC', description: 'NBTC/NUSDC trading room' }],
  [2, { id: 2, name: 'NASUN', description: 'NASUN/NUSDC trading room' }],
  [3, { id: 3, name: 'NETH', description: 'NETH/NUSDC trading room' }],
  [4, { id: 4, name: 'NSOL', description: 'NSOL/NUSDC trading room' }],
]);

// Map DeepBook pool object IDs to chat room IDs
const poolRoomMap = new Map<string, number>();

export function setPoolRoomMapping(poolId: string, roomId: number): void {
  poolRoomMap.set(poolId, roomId);
}

export function getPoolRoom(poolId: string): number | null {
  return poolRoomMap.get(poolId) ?? null;
}

/**
 * Get display symbol for a pool (e.g., "NBTC", "NASUN").
 * Returns the room name if a mapping exists, otherwise null.
 */
export function getPoolSymbol(poolId: string): string | null {
  const roomId = poolRoomMap.get(poolId);
  if (roomId == null) return null;
  return rooms.get(roomId)?.name ?? null;
}

export function getRoom(id: number): RoomInfo | undefined {
  return rooms.get(id);
}

export function getAllRooms(): RoomInfo[] {
  return Array.from(rooms.values());
}

export function roomExists(id: number): boolean {
  return rooms.has(id);
}

export function addRoom(room: RoomInfo): void {
  rooms.set(room.id, room);
}
