import { useEffect, useRef, useCallback, useState } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatMessage, ChatConnectionStatus, RoomInfo, ChatSignFn } from '../../../lib/chat-service';
import { CHAT_SESSION_EXPIRED_ERROR } from '../../../lib/chat-service';
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

  // If Turnstile is configured, wait for token before connecting
  const [turnstileReady, setTurnstileReady] = useState(!TURNSTILE_SITE_KEY);
  // Incremented to force Turnstile widget remount when a new token is needed
  const [turnstileKey, setTurnstileKey] = useState(0);
  // True after captcha_required fires (mid-session re-verification), false once token arrives
  const [captchaRequired, setCaptchaRequired] = useState(false);
  // Permanent Turnstile failure (after MAX_TURNSTILE_RETRIES) — stops showing "Connecting..." forever
  const [turnstilePermanentlyFailed, setTurnstilePermanentlyFailed] = useState(false);
  // Retry counter for invisible Turnstile errors (privacy browsers, script blockers, etc.)
  const turnstileRetryRef = useRef(0);
  // Latched when ChatService emits session_expired. Cleared by an explicit
  // "Re-login" action (handled via the global nasun:open-login flow). Gates
  // the 30s periodic reconnect so we don't churn against a known-bad signer.
  const [sessionExpired, setSessionExpired] = useState(false);

  // Keep display name in a ref so changes don't trigger reconnection
  const userDisplayNameRef = useRef<string>('');
  const xDisplayName = user?.provider === 'Twitter' ? user?.username : user?.linkedAccounts?.twitter?.username;
  userDisplayNameRef.current = user?.customDisplayName || xDisplayName || user?.username || user?.walletAddress || '';

  const messages = activeRoomState?.messages ?? [];
  const hasMore = activeRoomState?.hasMore ?? false;
  const loaded = activeRoomState?.loaded ?? false;

  // Keep signFn in a ref so the periodic reconnect always uses the latest signer
  // without needing to be included in dependency arrays.
  const signFnRef = useRef<ChatSignFn | null>(null);
  // Track the last signer type used so session_expired UX can route only
  // zkLogin users (whose remediation is OAuth re-login) to the global login
  // modal. Local/passkey wallets keep their key material across sessions, so
  // the modal is irrelevant and would mislead them.
  const lastSignerTypeRef = useRef<'zklogin' | 'other' | null>(null);

  useEffect(() => {
    const walletAddress = user?.walletAddress;
    if (!walletAddress || !turnstileReady) {
      signFnRef.current = null;
      if (!walletAddress && connectedRef.current) {
        getChatService().disconnect();
        connectedRef.current = false;
      }
      return;
    }

    const signFn: ChatSignFn = async (challenge: string) => {
      const signer = SignerManager.getCurrent();
      if (!signer) throw new Error('No wallet signer available');
      const messageBytes = new TextEncoder().encode(challenge);

      // Unwrap NsaSigner to access the underlying signing implementation
      const effectiveSigner = signer instanceof NsaSigner
        ? signer.getUnderlyingSigner()
        : signer;

      lastSignerTypeRef.current = effectiveSigner instanceof ZkLoginSigner ? 'zklogin' : 'other';

      if (effectiveSigner instanceof ZkLoginSigner) {
        // 30s grace: refuse to sign once expiry is imminent so we never produce
        // a signature that the server might accept now but reject seconds later
        // (or vice versa under clock skew). ChatService converts this rejection
        // into a session_expired event without a SIGN_ERROR/reconnect loop.
        const remainMs = effectiveSigner.getExpiresAt() - Date.now();
        if (remainMs < 30_000) {
          const err = new Error('zkLogin session expired or about to expire');
          err.name = CHAT_SESSION_EXPIRED_ERROR;
          throw err;
        }
        const { signature } = await effectiveSigner.signWithEphemeralKey(messageBytes);
        return {
          signature,
          address: walletAddress,
          authMethod: 'ephemeral' as const,
          ephemeralPubKey: effectiveSigner.getEphemeralPublicKey(),
          displayName: userDisplayNameRef.current,
        };
      }

      const { signature } = await effectiveSigner.signPersonal(messageBytes);
      return { signature, address: walletAddress, displayName: userDisplayNameRef.current };
    };
    signFnRef.current = signFn;
    const service = getChatService();

    const onMessage = (msg: ChatMessage) => {
      useChatStore.getState().addMessage(msg);

      // Mention detection: check if my displayName is @mentioned
      const currentDisplayName = userDisplayNameRef.current;
      if (msg.sender !== walletAddress && currentDisplayName) {
        const escaped = currentDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    const onError = (data: { code: string; message: string }) => {
      const authCodes = new Set(['AUTH_ERROR', 'SIGN_ERROR', 'NO_SIGNER']);
      if (authCodes.has(data.code)) {
        useChatStore.getState().setAuthError(data.message);
      }
    };

    const onCaptchaRequired = () => {
      setCaptchaRequired(true);
      setTurnstileReady(false);
      setTurnstileKey((k) => k + 1);
    };

    const onSessionExpired = () => {
      setSessionExpired(true);
      useChatStore.getState().setAuthError('Chat session expired. Please re-authenticate to continue.');
      // Only zkLogin users have an OAuth re-login flow that the global modal
      // can drive. Local/passkey wallets don't expire and dispatching the
      // login modal would mislead them — they need to investigate why the
      // server rejected their signature (key import issue, etc.), not log in.
      if (lastSignerTypeRef.current === 'zklogin') {
        try {
          window.dispatchEvent(new CustomEvent('nasun:open-login'));
        } catch { /* SSR / non-window env */ }
      }
    };

    service.on('message', onMessage);
    service.on('history', onHistory);
    service.on('status', onStatus);
    service.on('online_count', onCount);
    service.on('rooms_list', onRoomsList);
    service.on('reaction_update', onReactionUpdate);
    service.on('error', onError);
    service.on('captcha_required', onCaptchaRequired);
    service.on('session_expired', onSessionExpired);

    service.connect(WS_URL, signFn);
    connectedRef.current = true;

    return () => {
      service.off('message', onMessage);
      service.off('history', onHistory);
      service.off('status', onStatus);
      service.off('online_count', onCount);
      service.off('rooms_list', onRoomsList);
      service.off('reaction_update', onReactionUpdate);
      service.off('error', onError);
      service.off('captcha_required', onCaptchaRequired);
      service.off('session_expired', onSessionExpired);
    };
  }, [user?.walletAddress, turnstileReady]);

  // Clear the session_expired latch only when the user genuinely re-authenticates
  // (wallet address change). Re-running the main effect for unrelated reasons —
  // turnstile remount, StrictMode double-mount, ref churn — must NOT clear the
  // latch, otherwise the silent reconnect loop this latch prevents would resume.
  useEffect(() => {
    if (!user?.walletAddress) return;
    setSessionExpired(false);
    getChatService().resetSessionLatch();
  }, [user?.walletAddress]);

  // Periodic reconnect: if we should be connected but aren't, retry every 30s.
  // Handles transient auth failures, network blips, and server restarts.
  // Skipped when sessionExpired is latched — re-login flips the wallet effect
  // which re-creates the signer and re-runs this effect from a clean state.
  useEffect(() => {
    if (!user?.walletAddress || !turnstileReady || sessionExpired) return;

    const checkInterval = setInterval(() => {
      const fn = signFnRef.current;
      if (!fn) return;
      const service = getChatService();
      if (service.getStatus() === 'disconnected') {
        service.connect(WS_URL, fn);
      }
    }, 30_000);

    return () => clearInterval(checkInterval);
  }, [user?.walletAddress, turnstileReady, sessionExpired]);

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

  const setTurnstileToken = useCallback((token: string) => {
    getChatService().setTurnstileToken(token);
    turnstileRetryRef.current = 0;
    if (turnstilePermanentlyFailed) setTurnstilePermanentlyFailed(false);
    if (!turnstileReady) setTurnstileReady(true);
    if (captchaRequired) setCaptchaRequired(false);
  }, [turnstileReady, captchaRequired, turnstilePermanentlyFailed]);

  const onTurnstileError = useCallback(() => {
    const MAX_TURNSTILE_RETRIES = 3;
    const RELOAD_FLAG = 'chat_turnstile_reloaded';
    turnstileRetryRef.current += 1;
    if (turnstileRetryRef.current < MAX_TURNSTILE_RETRIES) {
      // Auto-retry with remount after a short delay
      setTurnstileReady(false);
      setTimeout(() => {
        setTurnstileKey((k) => k + 1);
      }, 500);
      return;
    }
    // Cap exceeded — try a silent page reload once per session (fixes SES timing race)
    if (!sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return;
    }
    // Already reloaded and still failing — surface error
    useChatStore.getState().setAuthError(
      'Security check failed. Reload the page or disable tracker-blocking extensions to use chat.'
    );
    setTurnstileReady(false);
    setTurnstilePermanentlyFailed(true);
  }, []);

  const onTurnstileExpire = useCallback(() => {
    // Token expired before auth completed — remount widget to get a fresh one
    if (status !== 'connected') {
      setTurnstileKey((k) => k + 1);
      setTurnstileReady(false);
    }
  }, [status]);

  const displayStatus: ChatConnectionStatus =
    turnstilePermanentlyFailed ? 'disconnected'
      : (!!user?.walletAddress && !turnstileReady) ? 'connecting'
      : status;

  return {
    messages,
    status,
    displayStatus,
    captchaRequired,
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
    setTurnstileToken,
    onTurnstileError,
    onTurnstileExpire,
    turnstileKey,
  };
}
