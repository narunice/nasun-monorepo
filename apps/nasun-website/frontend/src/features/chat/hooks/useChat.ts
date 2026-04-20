import { useEffect, useRef, useCallback, useState } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatMessage, ChatConnectionStatus, RoomInfo, ChatSignFn, NicknameRateLimit } from '../../../lib/chat-service';
import { useChatStore } from '../../../store/chatStore';
import { useUserStore } from '../../../store/userStore';
import { SignerManager, ZkLoginSigner, NsaSigner } from '@nasun/wallet';

const WS_URL = import.meta.env.VITE_NASUN_CHAT_WS_URL || 'ws://localhost:3101';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

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
  // Subscribe only to the active room's state to avoid re-renders when other rooms receive messages
  const activeRoomState = useChatStore((s) => s.roomStates.get(s.activeRoomId));
  const connectedRef = useRef(false);

  const [nickname, setNicknameState] = useState<string | null>(null);
  const [nicknameRateLimit, setNicknameRateLimit] = useState<NicknameRateLimit | null>(null);
  // If Turnstile is configured, wait for token before connecting
  const [turnstileReady, setTurnstileReady] = useState(!TURNSTILE_SITE_KEY);

  const messages = activeRoomState?.messages ?? [];
  const hasMore = activeRoomState?.hasMore ?? false;
  const loaded = activeRoomState?.loaded ?? false;

  useEffect(() => {
    const walletAddress = user?.walletAddress;
    if (!walletAddress || !turnstileReady) {
      if (!walletAddress && connectedRef.current) {
        getChatService().disconnect();
        connectedRef.current = false;
      }
      return;
    }

    // Display name priority: custom > X display name > primary username > wallet address
    const xDisplayName = user.provider === 'Twitter' ? user.username : user.linkedAccounts?.twitter?.username;
    const userDisplayName = user.customDisplayName || xDisplayName || user.username || walletAddress;

    const signFn: ChatSignFn = async (challenge: string) => {
      const signer = SignerManager.getCurrent();
      if (!signer) throw new Error('No wallet signer available');
      const messageBytes = new TextEncoder().encode(challenge);

      // Unwrap NsaSigner to access the underlying signing implementation
      const effectiveSigner = signer instanceof NsaSigner
        ? signer.getUnderlyingSigner()
        : signer;

      if (effectiveSigner instanceof ZkLoginSigner) {
        // zkLogin cannot sign personal messages; use ephemeral key instead
        const { signature } = await effectiveSigner.signWithEphemeralKey(messageBytes);
        return {
          signature,
          address: walletAddress,
          authMethod: 'ephemeral' as const,
          ephemeralPubKey: effectiveSigner.getEphemeralPublicKey(),
          displayName: userDisplayName,
        };
      }

      const { signature } = await effectiveSigner.signPersonal(messageBytes);
      return { signature, address: walletAddress, displayName: userDisplayName };
    };
    const service = getChatService();

    const onMessage = (msg: ChatMessage) => {
      useChatStore.getState().addMessage(msg);

      // Mention detection: check if my displayName is @mentioned
      if (msg.sender !== walletAddress && userDisplayName) {
        const escaped = userDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mentionPattern = new RegExp(`@(?:\\[${escaped}\\]|${escaped})(?:\\b|\\s|$)`, 'i');
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
    const onReactionUpdate = (data: { messageId: number; roomId: number; reactions: Record<string, number>; myReaction: string | null }) => {
      useChatStore.getState().updateReaction(data.roomId, data.messageId, data.reactions, data.myReaction);
    };

    const onNickname = (data: { ok: boolean; nickname?: string; rateLimit?: NicknameRateLimit }) => {
      if (data.ok) setNicknameState(data.nickname ?? null);
      if (data.rateLimit) setNicknameRateLimit(data.rateLimit);
    };

    const onError = (data: { code: string; message: string }) => {
      const authCodes = new Set(['AUTH_ERROR', 'SIGN_ERROR', 'NO_SIGNER']);
      if (authCodes.has(data.code)) {
        useChatStore.getState().setAuthError(data.message);
      }
    };

    service.on('message', onMessage);
    service.on('history', onHistory);
    service.on('status', onStatus);
    service.on('online_count', onCount);
    service.on('rooms_list', onRoomsList);
    service.on('reaction_update', onReactionUpdate);
    service.on('nickname', onNickname);
    service.on('error', onError);

    service.connect(WS_URL, signFn);
    connectedRef.current = true;

    // Initialize from cached values (in case of HMR / re-render)
    const cachedNickname = service.getNickname();
    if (cachedNickname) setNicknameState(cachedNickname);
    const cachedRateLimit = service.getRateLimit();
    if (cachedRateLimit) setNicknameRateLimit(cachedRateLimit);

    return () => {
      service.off('message', onMessage);
      service.off('history', onHistory);
      service.off('status', onStatus);
      service.off('online_count', onCount);
      service.off('rooms_list', onRoomsList);
      service.off('reaction_update', onReactionUpdate);
      service.off('nickname', onNickname);
      service.off('error', onError);
    };
  }, [user?.walletAddress, user?.customDisplayName, user?.twitterHandle, user?.username, turnstileReady]);

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
    // Optimistic update: set myReaction immediately so pill style reflects it
    const store = useChatStore.getState();
    const roomId = store.activeRoomId;
    const room = store.roomStates.get(roomId);
    const msg = room?.messages.find((m) => m.id === messageId);
    if (msg) {
      const wasMyReaction = msg.myReaction === emojiCode;
      const newMyReaction = wasMyReaction ? null : emojiCode;
      const newReactions = { ...(msg.reactions ?? {}) };

      // Decrement old reaction if switching
      if (msg.myReaction && msg.myReaction !== emojiCode && newReactions[msg.myReaction]) {
        newReactions[msg.myReaction] = Math.max(0, newReactions[msg.myReaction] - 1);
        if (newReactions[msg.myReaction] === 0) delete newReactions[msg.myReaction];
      }
      // Toggle current
      if (wasMyReaction) {
        newReactions[emojiCode] = Math.max(0, (newReactions[emojiCode] ?? 0) - 1);
        if (newReactions[emojiCode] === 0) delete newReactions[emojiCode];
      } else {
        newReactions[emojiCode] = (newReactions[emojiCode] ?? 0) + 1;
      }

      store.updateReaction(roomId, messageId, newReactions, newMyReaction);
    }
    getChatService().toggleReaction(messageId, emojiCode);
  }, []);

  const switchRoom = useCallback((roomId: number) => {
    useChatStore.getState().setActiveRoomId(roomId);
  }, []);

  const needsNickname = status === 'connected' && nickname === null;

  const setTurnstileToken = useCallback((token: string) => {
    getChatService().setTurnstileToken(token);
    if (!turnstileReady) setTurnstileReady(true);
  }, [turnstileReady]);

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
    canChat: !!user?.walletAddress,
    nickname,
    needsNickname,
    nicknameRateLimit,
    setTurnstileToken,
  };
}
