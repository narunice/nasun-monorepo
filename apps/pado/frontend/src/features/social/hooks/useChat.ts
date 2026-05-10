import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatSigner, NicknameRateLimit } from '../../../lib/chat-service';
import { useSigner, ZkLoginSigner } from '@nasun/wallet';
import { NETWORK_CONFIG } from '../../../config/network';
import type { ChatMessage, ChatConnectionStatus, RoomInfo } from '../types';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

// Module-level: shared across all useChat instances so mode switching
// (docked ↔ floating) doesn't trigger disconnect/reconnect cycles.
let connectedAddress: string | null = null;

// Module-level Turnstile state shared across all useChat instances + the
// pre-warmed widget mounted at the App level. Single source of truth so
// every consumer sees a consistent ready/key/captcha-required value.
let sharedTurnstileReady = !TURNSTILE_SITE_KEY;
let sharedTurnstileKey = 0;
let sharedCaptchaRequired = false;
const turnstileSubscribers = new Set<() => void>();

function notifyTurnstileSubscribers(): void {
  for (const sub of turnstileSubscribers) sub();
}

function markTurnstileSuccess(token: string): void {
  getChatService().setTurnstileToken(token);
  sharedTurnstileReady = true;
  sharedCaptchaRequired = false;
  notifyTurnstileSubscribers();
}

function markCaptchaRequired(): void {
  sharedCaptchaRequired = true;
  sharedTurnstileReady = false;
  sharedTurnstileKey++;
  notifyTurnstileSubscribers();
}

// CF onError/onExpire handler: bump the key to remount the widget. Bounded
// by the natural cadence of CF error events, unlike per-action remounts.
function markTurnstileError(): void {
  sharedTurnstileReady = false;
  sharedTurnstileKey++;
  notifyTurnstileSubscribers();
}

/**
 * Reset Turnstile shared state on logout so the next login starts with a
 * fresh challenge instead of relying on a stale `ready=true` flag whose
 * backing pending token may have already been consumed.
 */
function resetTurnstileShared(): void {
  sharedTurnstileReady = !TURNSTILE_SITE_KEY;
  sharedCaptchaRequired = false;
  sharedTurnstileKey++;
  notifyTurnstileSubscribers();
}

// Ensure the captcha_required event is handled exactly once at module scope
// (rather than in every useChat instance), since the shared state already
// drives all subscribers.
let captchaEventSubscribed = false;
function ensureCaptchaEventSubscription(): void {
  if (captchaEventSubscribed) return;
  captchaEventSubscribed = true;
  getChatService().on('captcha_required', markCaptchaRequired);
}

/**
 * Lightweight hook for pre-warming the Turnstile challenge.
 * Mount the returned widget props at the App root so the challenge completes
 * in the background before the user opens the chat panel.
 */
export function useChatTurnstilePrewarm() {
  const [turnstileKey, setKey] = useState(sharedTurnstileKey);

  useEffect(() => {
    ensureCaptchaEventSubscription();
    const sub = () => setKey(sharedTurnstileKey);
    turnstileSubscribers.add(sub);
    return () => { turnstileSubscribers.delete(sub); };
  }, []);

  const onSuccess = useCallback((token: string) => {
    markTurnstileSuccess(token);
  }, []);

  const onError = useCallback(() => {
    markTurnstileError();
  }, []);

  return { turnstileKey, onSuccess, onError };
}

// Reference count of active useChat instances.
// Only disconnect when the last instance unmounts (e.g. page navigation).
let activeChatInstances = 0;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Multi-room state (module-level, survives docked↔floating transitions)
const roomMessages = new Map<number, ChatMessage[]>();
const roomHasMore = new Map<number, boolean>();
const roomUnread = new Map<number, number>();
let cachedRooms: RoomInfo[] = [];

const MAX_ROOM_MESSAGES = 500;

const ACTIVE_ROOM_KEY = 'pado:chat:activeRoom';
const LANGUAGE_ROOM_KEY = 'pado:chat:languageRoom';

const PADO_DEFAULT_ROOM = 20; // Pado room (trader chat + market alerts)
const VALID_PADO_ROOMS = new Set([0, 10, 20]);

function getStoredActiveRoom(): number {
  try {
    const stored = localStorage.getItem(ACTIVE_ROOM_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return (!isNaN(parsed) && VALID_PADO_ROOMS.has(parsed)) ? parsed : PADO_DEFAULT_ROOM;
  } catch {
    return PADO_DEFAULT_ROOM;
  }
}

const LANGUAGE_ROOM_IDS = new Set([0, 10]);

function getStoredLanguageRoom(): number {
  try {
    const stored = localStorage.getItem(LANGUAGE_ROOM_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (!isNaN(parsed) && LANGUAGE_ROOM_IDS.has(parsed)) return parsed;
    const active = getStoredActiveRoom();
    return LANGUAGE_ROOM_IDS.has(active) ? active : 0;
  } catch {
    return 0;
  }
}

function isLanguageRoom(roomId: number): boolean {
  return roomId < 100;
}

let selectedLanguageRoomId = getStoredLanguageRoom();

export interface UseChatResult {
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  loadMore: () => void;
  isConnected: boolean;
  status: ChatConnectionStatus;
  displayStatus: ChatConnectionStatus;
  captchaRequired: boolean;
  onlineCount: number;
  hasMore: boolean;
  error: string | null;
  nickname: string | null;
  needsNickname: boolean;
  nicknameRateLimit: NicknameRateLimit | null;
  setNickname: (name: string) => void;
  checkNickname: (name: string) => void;
  toggleReaction: (messageId: number, emojiCode: string) => void;
  rooms: RoomInfo[];
  marketRooms: RoomInfo[];
  languageRooms: RoomInfo[];
  activeRoomId: number;
  setActiveRoom: (roomId: number) => void;
  selectedLanguageRoomId: number;
  setLanguageRoom: (roomId: number) => void;
  unreadCounts: Record<number, number>;
  setTurnstileToken: (token: string) => void;
  turnstileKey: number;
}


export function useChat(): UseChatResult {
  const { signer, address: signerAddress } = useSigner();

  const [activeRoomId, setActiveRoomId] = useState(getStoredActiveRoom);
  const [messages, setMessages] = useState<ChatMessage[]>(() => roomMessages.get(getStoredActiveRoom()) ?? []);
  // Initialize status and nickname from ChatService so re-mounts see current state
  const [status, setStatus] = useState<ChatConnectionStatus>(
    () => getChatService().getStatus()
  );
  const [onlineCount, setOnlineCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNicknameState] = useState<string | null>(
    () => getChatService().getNickname()
  );
  const [nicknameRateLimit, setNicknameRateLimit] = useState<NicknameRateLimit | null>(null);
  const [rooms, setRooms] = useState<RoomInfo[]>(cachedRooms);
  const [languageRoomId, setLanguageRoomIdState] = useState(selectedLanguageRoomId);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  // Turnstile state is module-shared so every useChat instance and the
  // pre-warmed widget see the same ready/key/captcha-required values.
  const [turnstileReady, setTurnstileReady] = useState(sharedTurnstileReady);
  const [turnstileKey, setTurnstileKey] = useState(sharedTurnstileKey);
  const [captchaRequired, setCaptchaRequired] = useState(sharedCaptchaRequired);

  useEffect(() => {
    ensureCaptchaEventSubscription();
    const sub = () => {
      setTurnstileReady(sharedTurnstileReady);
      setTurnstileKey(sharedTurnstileKey);
      setCaptchaRequired(sharedCaptchaRequired);
    };
    turnstileSubscribers.add(sub);
    // Sync immediately in case module state changed between initial render and subscription
    sub();
    return () => { turnstileSubscribers.delete(sub); };
  }, []);

  const marketRooms = useMemo(() => rooms.filter((r) => r.id === 20), [rooms]);
  const languageRooms = useMemo(() => rooms.filter((r) => r.id === 0 || r.id === 10), [rooms]);

  // Keep a stable ref to the signer so async callbacks always read the latest
  const signerRef = useRef(signer);
  signerRef.current = signer;

  // Track active room in a ref so event handlers always read the latest
  const activeRoomIdRef = useRef(activeRoomId);
  activeRoomIdRef.current = activeRoomId;

  // Memoize signer type to avoid re-triggering on object identity changes
  const signerType = signer?.type ?? null;

  // Connect/disconnect — only run when signerAddress or signer type changes.
  // Uses module-level connectedAddress so docked↔floating transitions
  // don't trigger disconnect/reconnect.
  useEffect(() => {
    const chatService = getChatService();
    const wsUrl = NETWORK_CONFIG.chatWebSocketUrl;

    // Should disconnect: no signer, no wsUrl, or Turnstile not yet ready
    if (!wsUrl || !signerAddress || !signerType || !turnstileReady) {
      if (connectedAddress) {
        chatService.disconnect();
        connectedAddress = null;
        // On logout (signer cleared), reset shared Turnstile state so the
        // next login gets a fresh challenge rather than reusing a flag whose
        // token may have already been consumed.
        if (!signerAddress) resetTurnstileShared();
      }
      return;
    }

    // Already connected with this address — nothing to do
    if (connectedAddress === signerAddress) return;

    // Different address or first connect — disconnect old, connect new
    if (connectedAddress) {
      chatService.disconnect();
    }

    // Get signer from ref (guaranteed to be current due to effect dependencies)
    const currentSigner = signerRef.current;
    if (!currentSigner) return;

    // Build ChatSigner based on signer type
    const chatSigner: ChatSigner = currentSigner.type === 'zklogin'
      ? {
          address: signerAddress,
          signPersonal: async () => { throw new Error('zkLogin: use ephemeral key'); },
          authMethod: 'ephemeral',
          ephemeralPubKey: (currentSigner as ZkLoginSigner).getEphemeralPublicKey(),
          signWithEphemeralKey: async (msg: Uint8Array) => {
            const s = signerRef.current;
            if (!s || s.type !== 'zklogin') throw new Error('Signer unavailable');
            return (s as ZkLoginSigner).signWithEphemeralKey(msg);
          },
        }
      : {
          address: signerAddress,
          signPersonal: async (msg: Uint8Array) => {
            const s = signerRef.current;
            if (!s) throw new Error('Signer unavailable');
            return s.signPersonal(msg);
          },
        };

    chatService.connect(wsUrl, chatSigner);
    connectedAddress = signerAddress;
  }, [signerAddress, signerType, turnstileReady]);

  // Track active useChat instances. Debounced disconnect prevents brief
  // WebSocket drop during page transitions (old ChatPanel unmounts before
  // new one mounts). 300ms covers lazy-loaded route transitions.
  useEffect(() => {
    if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
    activeChatInstances++;
    return () => {
      activeChatInstances--;
      if (activeChatInstances === 0) {
        disconnectTimer = setTimeout(() => {
          if (activeChatInstances === 0) {
            getChatService().disconnect();
            connectedAddress = null;
          }
          disconnectTimer = null;
        }, 300);
      }
    };
  }, []);

  // Periodic reconnection check: if we should be connected but aren't,
  // nudge the ChatService to retry. Handles dev server restarts, transient
  // network failures, and race conditions during page load.
  useEffect(() => {
    const wsUrl = NETWORK_CONFIG.chatWebSocketUrl;
    if (!wsUrl || !signerAddress || !signerType || !turnstileReady) return;

    const checkInterval = setInterval(() => {
      const chatService = getChatService();
      if (chatService.getStatus() === 'disconnected') {
        chatService.reconnect();
      }
    }, 30_000);

    return () => clearInterval(checkInterval);
  }, [signerAddress, signerType, turnstileReady]);

  // HTTP polling for unauthenticated users is disabled.
  // Chat uses nasun-chat-server (WebSocket only), which does not expose a REST /api/messages endpoint.
  // Unauthenticated users see an empty chat with "Connect wallet to chat" prompt.

  // Subscribe to events.
  // When re-mounting (e.g. docked↔floating switch), request history
  // to populate messages since local state starts empty.
  useEffect(() => {
    const chatService = getChatService();

    const unsubMessage = chatService.on('message', (msg) => {
      const rid = msg.roomId;
      const existing = roomMessages.get(rid) ?? [];

      // Dedup: multiple useChat instances share roomMessages —
      // a prior instance may have already appended this message.
      if (existing.some((m) => m.id === msg.id)) {
        // Still sync React state for this instance
        if (rid === activeRoomIdRef.current) {
          setMessages([...existing]);
        }
        return;
      }

      const updated = [...existing, msg];
      // Cap per-room message buffer to prevent unbounded memory growth
      if (updated.length > MAX_ROOM_MESSAGES) {
        updated.splice(0, updated.length - MAX_ROOM_MESSAGES);
      }
      roomMessages.set(rid, updated);

      if (rid === activeRoomIdRef.current) {
        setMessages([...roomMessages.get(rid)!]);
      } else {
        // Increment unread for non-active rooms
        roomUnread.set(rid, (roomUnread.get(rid) ?? 0) + 1);
        setUnreadCounts(Object.fromEntries(roomUnread));
      }
    });

    const unsubHistory = chatService.on('history', ({ roomId: rid, messages: historyMsgs, hasMore: more }) => {
      // Always dedup-merge to avoid race conditions on rapid room switches
      const existing = roomMessages.get(rid) ?? [];
      const existingIds = new Set(existing.map((m) => m.id));
      const newMsgs = historyMsgs.filter((m) => !existingIds.has(m.id));
      const merged = [...newMsgs, ...existing];
      // Cap per-room history to prevent unbounded memory growth
      if (merged.length > MAX_ROOM_MESSAGES) {
        merged.splice(0, merged.length - MAX_ROOM_MESSAGES);
      }
      roomMessages.set(rid, merged);
      roomHasMore.set(rid, more);

      if (rid === activeRoomIdRef.current) {
        setMessages([...roomMessages.get(rid)!]);
        setHasMore(more);
      }
    });

    const unsubStatus = chatService.on('status', (s) => {
      setStatus(s);
      if (s === 'connected') {
        setError(null);
        // Load history for the active room on (re)connect
        chatService.loadHistory(activeRoomIdRef.current);
      }
      if (s === 'disconnected') {
        setNicknameRateLimit(null);
        // Clear all room state on disconnect to prevent stale data
        roomMessages.clear();
        roomHasMore.clear();
        roomUnread.clear();
        setMessages([]);
        setHasMore(false);
        setUnreadCounts({});
      }
    });
    const unsubOnline = chatService.on('online_count', setOnlineCount);
    const unsubError = chatService.on('error', (err) => {
      if (err.code === 'SIGN_FAILED') {
        setError(err.message);
      }
    });

    const unsubNickname = chatService.on('nickname', (data) => {
      if (data.ok) {
        setNicknameState(data.nickname ?? null);
      }
      if (data.rateLimit) {
        setNicknameRateLimit(data.rateLimit);
      }
    });

    const unsubRoomsList = chatService.on('rooms_list', (serverRooms) => {
      cachedRooms = serverRooms;
      setRooms(serverRooms);
      // Validate stored active room against server rooms
      const validIds = new Set(serverRooms.map((r) => r.id));
      if (!validIds.has(activeRoomIdRef.current)) {
        setActiveRoomId(PADO_DEFAULT_ROOM);
        activeRoomIdRef.current = PADO_DEFAULT_ROOM;
        try { localStorage.setItem(ACTIVE_ROOM_KEY, String(PADO_DEFAULT_ROOM)); } catch { /* ignore */ }
      }
    });

    const unsubReaction = chatService.on('reaction_update', (data) => {
      // Update reaction counts and myReaction on the matching message in all rooms
      for (const [rid, msgs] of roomMessages) {
        const idx = msgs.findIndex((m) => m.id === data.messageId);
        if (idx !== -1) {
          const updated = [...msgs];
          updated[idx] = {
            ...updated[idx],
            reactions: data.reactions,
            ...(data.myReaction !== undefined && { myReaction: data.myReaction }),
          };
          roomMessages.set(rid, updated);
          if (rid === activeRoomIdRef.current) {
            setMessages(updated);
          }
        }
      }
    });

    // captcha_required is handled once at module scope via
    // ensureCaptchaEventSubscription(); subscribers are notified via
    // turnstileSubscribers, so we don't subscribe per-instance here.

    // If already connected (e.g. re-mount after docked↔floating switch),
    // request history to populate the fresh empty messages state.
    if (chatService.getStatus() === 'connected') {
      chatService.loadHistory(activeRoomIdRef.current);
    }

    return () => {
      unsubMessage();
      unsubHistory();
      unsubStatus();
      unsubOnline();
      unsubError();
      unsubNickname();
      unsubRoomsList();
      unsubReaction();
    };
  }, []);

  const setActiveRoom = useCallback((roomId: number) => {
    // Validate against known rooms (cachedRooms is module-level, updated by server)
    if (cachedRooms.length > 0 && !cachedRooms.some((r) => r.id === roomId)) return;
    setActiveRoomId(roomId);
    activeRoomIdRef.current = roomId;
    try { localStorage.setItem(ACTIVE_ROOM_KEY, String(roomId)); } catch { /* ignore */ }

    // Load cached messages for this room
    setMessages(roomMessages.get(roomId) ?? []);
    setHasMore(roomHasMore.get(roomId) ?? false);

    // Clear unread for the newly active room
    roomUnread.set(roomId, 0);
    setUnreadCounts(Object.fromEntries(roomUnread));

    // If no cached messages, request from server
    if (!roomMessages.has(roomId) || roomMessages.get(roomId)!.length === 0) {
      getChatService().loadHistory(roomId);
    }
  }, []);

  const setLanguageRoom = useCallback((roomId: number) => {
    if (!languageRooms.some((r) => r.id === roomId)) return;
    selectedLanguageRoomId = roomId;
    setLanguageRoomIdState(roomId);
    try { localStorage.setItem(LANGUAGE_ROOM_KEY, String(roomId)); } catch { /* ignore */ }
    // If currently viewing a language room, switch to the new one
    if (isLanguageRoom(activeRoomIdRef.current)) {
      setActiveRoom(roomId);
    }
  }, [languageRooms, setActiveRoom]);

  const sendMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    getChatService().sendMessage(trimmed, activeRoomIdRef.current);
    // Increment chat message counter for badge tracking
    try {
      const key = 'pado-chat-message-count';
      const count = parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
      localStorage.setItem(key, String(count + 1));
    } catch { /* ignore storage errors */ }
  }, []);

  const loadMore = useCallback(() => {
    const currentRoom = activeRoomIdRef.current;
    const currentMessages = roomMessages.get(currentRoom) ?? [];
    const currentHasMore = roomHasMore.get(currentRoom) ?? false;
    if (!currentHasMore || currentMessages.length === 0) return;
    const oldestId = currentMessages[0]?.id;
    getChatService().loadHistory(currentRoom, oldestId);
  }, []);

  const setNickname = useCallback((name: string) => {
    getChatService().setNickname(name);
  }, []);

  const checkNickname = useCallback((name: string) => {
    getChatService().checkNickname(name);
  }, []);

  const toggleReaction = useCallback((messageId: number, emojiCode: string) => {
    const chatService = getChatService();
    if (chatService.getStatus() !== 'connected') return;

    // Optimistic update: toggle myReaction locally
    const rid = activeRoomIdRef.current;
    const msgs = roomMessages.get(rid) ?? [];
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      const msg = msgs[idx];
      const oldReaction = msg.myReaction;
      const newReaction = oldReaction === emojiCode ? null : emojiCode;
      const newReactions = { ...(msg.reactions ?? {}) };

      // Decrement old reaction count
      if (oldReaction && newReactions[oldReaction]) {
        newReactions[oldReaction]--;
        if (newReactions[oldReaction] <= 0) delete newReactions[oldReaction];
      }
      // Increment new reaction count
      if (newReaction) {
        newReactions[newReaction] = (newReactions[newReaction] ?? 0) + 1;
      }

      const updated = [...msgs];
      updated[idx] = { ...msg, myReaction: newReaction, reactions: newReactions };
      roomMessages.set(rid, updated);
      setMessages(updated);
    }

    // Send to server
    chatService.toggleReaction(messageId, emojiCode);
  }, []);

  const needsNickname = false;

  const setTurnstileToken = useCallback((token: string) => {
    markTurnstileSuccess(token);
  }, []);


  const displayStatus: ChatConnectionStatus =
    (!!signerAddress && (!turnstileReady || !signerType)) ? 'connecting' : status;

  return {
    messages,
    sendMessage,
    loadMore,
    isConnected: status === 'connected',
    status,
    displayStatus,
    captchaRequired,
    onlineCount,
    hasMore,
    error,
    nickname,
    needsNickname,
    nicknameRateLimit,
    setNickname,
    checkNickname,
    toggleReaction,
    rooms,
    marketRooms,
    languageRooms,
    activeRoomId,
    setActiveRoom,
    selectedLanguageRoomId: languageRoomId,
    setLanguageRoom,
    unreadCounts,
    setTurnstileToken,
    turnstileKey,
  };
}
