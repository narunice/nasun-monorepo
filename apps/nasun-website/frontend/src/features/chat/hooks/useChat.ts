import { useEffect, useRef, useCallback } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatMessage, ChatConnectionStatus, RoomInfo } from '../../../lib/chat-service';
import { useChatStore } from '../../../store/chatStore';
import { useUserStore } from '../../../store/userStore';

const WS_URL = import.meta.env.VITE_NASUN_CHAT_WS_URL || 'ws://localhost:3101';

export function useChat() {
  const user = useUserStore((s) => s.user);
  const status = useChatStore((s) => s.status);
  const onlineCount = useChatStore((s) => s.onlineCount);
  const isOpen = useChatStore((s) => s.isOpen);
  const rooms = useChatStore((s) => s.rooms);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const roomStates = useChatStore((s) => s.roomStates);
  const connectedRef = useRef(false);

  // Derived from roomStates
  const activeRoom = roomStates.get(activeRoomId);
  const messages = activeRoom?.messages ?? [];
  const hasMore = activeRoom?.hasMore ?? false;
  const loaded = activeRoom?.loaded ?? false;

  useEffect(() => {
    const token = user?.cognitoToken;
    if (!token) {
      if (connectedRef.current) {
        getChatService().disconnect();
        connectedRef.current = false;
      }
      return;
    }

    const displayName = user.customDisplayName || user.username || 'Anonymous';
    const service = getChatService();

    const onMessage = (msg: ChatMessage) => {
      useChatStore.getState().addMessage(msg);
    };
    const onHistory = (data: { roomId: number; messages: ChatMessage[]; hasMore: boolean }) => {
      const store = useChatStore.getState();
      const room = store.roomStates.get(data.roomId);
      if (!room || !room.loaded) {
        store.setHistory(data.roomId, data.messages, data.hasMore);
      } else {
        store.prependHistory(data.roomId, data.messages, data.hasMore);
      }
    };
    const onStatus = (s: ChatConnectionStatus) => {
      useChatStore.getState().setStatus(s);
    };
    const onCount = (n: number) => {
      useChatStore.getState().setOnlineCount(n);
    };
    const onRoomsList = (roomsList: RoomInfo[]) => {
      useChatStore.getState().setRooms(roomsList);
    };
    const onReactionUpdate = (data: { messageId: number; roomId: number; reactions: Record<string, number> }) => {
      useChatStore.getState().updateReaction(data.roomId, data.messageId, data.reactions);
    };

    service.on('message', onMessage);
    service.on('history', onHistory);
    service.on('status', onStatus);
    service.on('online_count', onCount);
    service.on('rooms_list', onRoomsList);
    service.on('reaction_update', onReactionUpdate);

    service.connect(WS_URL, token, displayName);
    connectedRef.current = true;

    return () => {
      service.off('message', onMessage);
      service.off('history', onHistory);
      service.off('status', onStatus);
      service.off('online_count', onCount);
      service.off('rooms_list', onRoomsList);
      service.off('reaction_update', onReactionUpdate);
    };
  }, [user?.cognitoToken, user?.customDisplayName, user?.username]);

  // Load history for active room when switching
  useEffect(() => {
    if (status !== 'connected') return;
    const store = useChatStore.getState();
    const room = store.roomStates.get(activeRoomId);
    if (!room || !room.loaded) {
      getChatService().loadHistory(activeRoomId);
    }
  }, [activeRoomId, status]);

  const sendMessage = useCallback((content: string) => {
    const roomId = useChatStore.getState().activeRoomId;
    getChatService().sendMessage(content, roomId);
  }, []);

  const loadMore = useCallback(() => {
    const store = useChatStore.getState();
    const room = store.roomStates.get(store.activeRoomId);
    if (!room?.hasMore || room.messages.length === 0) return;
    const oldestId = room.messages[0]?.id;
    if (oldestId) {
      getChatService().loadHistory(store.activeRoomId, oldestId, 50);
    }
  }, []);

  const toggleReaction = useCallback((messageId: number, emojiCode: string) => {
    getChatService().toggleReaction(messageId, emojiCode);
  }, []);

  const switchRoom = useCallback((roomId: number) => {
    useChatStore.getState().setActiveRoomId(roomId);
  }, []);

  return {
    messages,
    status,
    onlineCount,
    isOpen,
    hasMore,
    loaded,
    rooms,
    activeRoomId,
    sendMessage,
    loadMore,
    switchRoom,
    toggleReaction,
    canChat: !!user?.cognitoToken,
  };
}
