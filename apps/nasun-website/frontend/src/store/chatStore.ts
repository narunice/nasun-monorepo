import { create } from 'zustand';
import type { ChatMessage, ChatConnectionStatus, RoomInfo } from '../lib/chat-service';

interface RoomState {
  messages: ChatMessage[];
  hasMore: boolean;
  loaded: boolean;
}

interface ChatState {
  rooms: RoomInfo[];
  activeRoomId: number;
  roomStates: Map<number, RoomState>;
  status: ChatConnectionStatus;
  onlineCount: number;
  isOpen: boolean;

  // Mention notifications
  mentionCount: number;
  mentionSoundEnabled: boolean;

  // Widget geometry (persisted feel)
  position: { x: number; y: number } | null; // null = default bottom-right
  size: { width: number; height: number };

  // Actions
  setRooms: (rooms: RoomInfo[]) => void;
  setActiveRoomId: (id: number) => void;
  addMessage: (msg: ChatMessage) => void;
  setHistory: (roomId: number, messages: ChatMessage[], hasMore: boolean) => void;
  prependHistory: (roomId: number, messages: ChatMessage[], hasMore: boolean) => void;
  setStatus: (status: ChatConnectionStatus) => void;
  setOnlineCount: (count: number) => void;
  updateReaction: (roomId: number, messageId: number, reactions: Record<string, number>) => void;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setPosition: (pos: { x: number; y: number } | null) => void;
  setSize: (size: { width: number; height: number }) => void;
  addMention: () => void;
  clearMentions: () => void;
  toggleMentionSound: () => void;

  // Derived
  activeMessages: () => ChatMessage[];
  activeHasMore: () => boolean;
  activeLoaded: () => boolean;
}

const MAX_MESSAGES_PER_ROOM = 500;
const DEFAULT_SIZE = { width: 384, height: 480 };
const MIN_SIZE = { width: 300, height: 320 };
const MAX_SIZE = { width: 600, height: 800 };

export { MIN_SIZE, MAX_SIZE, DEFAULT_SIZE };

function getOrCreateRoomState(map: Map<number, RoomState>, roomId: number): RoomState {
  let state = map.get(roomId);
  if (!state) {
    state = { messages: [], hasMore: false, loaded: false };
    map.set(roomId, state);
  }
  return state;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [{ id: 0, name: 'Global' }, { id: 1, name: 'Korean' }],
  activeRoomId: 0,
  roomStates: new Map(),
  status: 'disconnected',
  onlineCount: 0,
  isOpen: false,
  mentionCount: 0,
  mentionSoundEnabled: true,
  position: null,
  size: DEFAULT_SIZE,

  setRooms: (rooms) => set({ rooms }),

  setActiveRoomId: (id) => set({ activeRoomId: id }),

  addMessage: (msg) =>
    set((state) => {
      const newMap = new Map(state.roomStates);
      const room = { ...getOrCreateRoomState(newMap, msg.roomId) };
      room.messages = [...room.messages, msg];
      if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
        room.messages = room.messages.slice(-MAX_MESSAGES_PER_ROOM);
        room.hasMore = true;
      }
      newMap.set(msg.roomId, room);
      return { roomStates: newMap };
    }),

  setHistory: (roomId, messages, hasMore) =>
    set((state) => {
      const newMap = new Map(state.roomStates);
      newMap.set(roomId, { messages, hasMore, loaded: true });
      return { roomStates: newMap };
    }),

  prependHistory: (roomId, older, hasMore) =>
    set((state) => {
      const newMap = new Map(state.roomStates);
      const room = { ...getOrCreateRoomState(newMap, roomId) };
      room.messages = [...older, ...room.messages];
      room.hasMore = hasMore;
      newMap.set(roomId, room);
      return { roomStates: newMap };
    }),

  updateReaction: (roomId, messageId, reactions) =>
    set((state) => {
      const newMap = new Map(state.roomStates);
      const room = newMap.get(roomId);
      if (!room) return state;
      const updatedMessages = room.messages.map((msg) =>
        msg.id === messageId ? { ...msg, reactions } : msg
      );
      newMap.set(roomId, { ...room, messages: updatedMessages });
      return { roomStates: newMap };
    }),

  setStatus: (status) => set({ status }),
  setOnlineCount: (onlineCount) => set({ onlineCount }),
  setIsOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  addMention: () => set((state) => ({ mentionCount: state.mentionCount + 1 })),
  clearMentions: () => set({ mentionCount: 0 }),
  toggleMentionSound: () => set((state) => ({ mentionSoundEnabled: !state.mentionSoundEnabled })),
  setPosition: (position) => set({ position }),
  setSize: (size) => set({
    size: {
      width: Math.max(MIN_SIZE.width, Math.min(MAX_SIZE.width, size.width)),
      height: Math.max(MIN_SIZE.height, Math.min(MAX_SIZE.height, size.height)),
    },
  }),

  activeMessages: () => {
    const { activeRoomId, roomStates } = get();
    return roomStates.get(activeRoomId)?.messages ?? [];
  },
  activeHasMore: () => {
    const { activeRoomId, roomStates } = get();
    return roomStates.get(activeRoomId)?.hasMore ?? false;
  },
  activeLoaded: () => {
    const { activeRoomId, roomStates } = get();
    return roomStates.get(activeRoomId)?.loaded ?? false;
  },
}));
