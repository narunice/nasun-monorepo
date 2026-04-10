import { useEffect, useRef, useCallback } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatMessage, ChatConnectionStatus, RoomInfo } from '../../../lib/chat-service';
import { useChatStore } from '../../../store/chatStore';
import { useUserStore } from '../../../store/userStore';

const WS_URL = import.meta.env.VITE_NASUN_CHAT_WS_URL || 'ws://localhost:3101';

// Short notification beep via Web Audio API (no external file needed)
let audioCtx: AudioContext | null = null;
function playMentionSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch { /* audio not available */ }
}

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

    // Resolve display name using the same priority as useProfileDisplay:
    // customDisplayName > Twitter username > Google email prefix > wallet address
    const tw = user.linkedAccounts?.twitter;
    const gl = user.linkedAccounts?.google;
    const displayName =
      user.customDisplayName ||
      (user.provider === 'Twitter' ? user.username : tw?.username) ||
      ((user.provider === 'Google' ? user.email : gl?.email)?.split('@')[0]) ||
      user.username ||
      'Anonymous';
    const service = getChatService();

    const onMessage = (msg: ChatMessage) => {
      useChatStore.getState().addMessage(msg);

      // Mention detection: check if my displayName is @mentioned
      if (msg.sender !== user.identityId && displayName) {
        const mentionPattern = new RegExp(`@${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (mentionPattern.test(msg.content)) {
          const store = useChatStore.getState();
          store.addMention();
          if (store.mentionSoundEnabled) playMentionSound();
        }
      }
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
  }, [user?.cognitoToken, user?.customDisplayName, user?.username, user?.linkedAccounts, user?.provider, user?.email]);

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
