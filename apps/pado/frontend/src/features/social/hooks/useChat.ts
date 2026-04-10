import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatSigner, NicknameRateLimit } from '../../../lib/chat-service';
import { useSigner, ZkLoginSigner } from '@nasun/wallet';
import { NETWORK_CONFIG } from '../../../config/network';
import type { ChatMessage, ChatConnectionStatus, RoomInfo } from '../types';

// Module-level: shared across all useChat instances so mode switching
// (docked ↔ floating) doesn't trigger disconnect/reconnect cycles.
let connectedAddress: string | null = null;

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

function getStoredActiveRoom(): number {
  try {
    const stored = localStorage.getItem(ACTIVE_ROOM_KEY);
    return stored ? parseInt(stored, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export interface UseChatResult {
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  loadMore: () => void;
  isConnected: boolean;
  status: ChatConnectionStatus;
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
  activeRoomId: number;
  setActiveRoom: (roomId: number) => void;
  unreadCounts: Record<number, number>;
}

/** Derive HTTP base URL from WebSocket URL (ws:// → http://, wss:// → https://) */
function wsToHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/ws\/?$/, '/chat');
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
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});

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

    // Should disconnect: no signer or no wsUrl
    if (!wsUrl || !signerAddress || !signerType) {
      if (connectedAddress) {
        chatService.disconnect();
        connectedAddress = null;
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
  }, [signerAddress, signerType]);

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
    if (!wsUrl || !signerAddress || !signerType) return;

    const checkInterval = setInterval(() => {
      const chatService = getChatService();
      if (chatService.getStatus() === 'disconnected') {
        chatService.reconnect();
      }
    }, 30_000);

    return () => clearInterval(checkInterval);
  }, [signerAddress, signerType]);

  // Poll chat history via HTTP when not authenticated (e.g. wallet locked)
  // so users can still read messages without a WebSocket connection.
  useEffect(() => {
    const wsUrl = NETWORK_CONFIG.chatWebSocketUrl;
    if (!wsUrl || signerAddress) return;

    const httpBase = wsToHttpUrl(wsUrl);
    const currentRoom = activeRoomIdRef.current;
    const url = `${httpBase}/api/messages?roomId=${currentRoom}&limit=50`;

    const fetchMessages = () => {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: { messages: ChatMessage[]; hasMore: boolean }) => {
          roomMessages.set(currentRoom, data.messages);
          roomHasMore.set(currentRoom, data.hasMore);
          if (activeRoomIdRef.current === currentRoom) {
            setMessages(data.messages);
            setHasMore(data.hasMore);
          }
        })
        .catch(() => {
          // Silent fail — chat is non-critical
        });
    };

    // Initial fetch immediately
    fetchMessages();

    // Poll every 10 seconds for new messages
    const intervalId = setInterval(fetchMessages, 10_000);

    return () => clearInterval(intervalId);
  }, [signerAddress, activeRoomId]);

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
      if (s === 'connected') setError(null);
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
        setActiveRoomId(0);
        activeRoomIdRef.current = 0;
        try { localStorage.setItem(ACTIVE_ROOM_KEY, '0'); } catch { /* ignore */ }
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

  const needsNickname = status === 'connected' && nickname === null;

  return {
    messages,
    sendMessage,
    loadMore,
    isConnected: status === 'connected',
    status,
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
    activeRoomId,
    setActiveRoom,
    unreadCounts,
  };
}
