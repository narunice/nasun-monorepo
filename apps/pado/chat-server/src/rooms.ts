import type { RoomInfo } from './types.js';

// Predefined rooms (expandable later via admin API or config)
const rooms: Map<number, RoomInfo> = new Map([
  [0, { id: 0, name: 'Global', description: 'Global chat room' }],
]);

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
