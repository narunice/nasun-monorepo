import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatSigner, NicknameRateLimit } from '../../../lib/chat-service';
import { useSigner, ZkLoginSigner } from '@nasun/wallet';
import { NETWORK_CONFIG } from '../../../config/network';
import type { ChatMessage, ChatConnectionStatus } from '../types';

// Module-level: shared across all useChat instances so mode switching
// (docked ↔ floating) doesn't trigger disconnect/reconnect cycles.
let connectedAddress: string | null = null;

// Reference count of active useChat instances.
// Only disconnect when the last instance unmounts (e.g. page navigation).
let activeChatInstances = 0;

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
}

/** Derive HTTP base URL from WebSocket URL (ws:// → http://, wss:// → https://) */
function wsToHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://');
}

export function useChat(roomId: number = 0): UseChatResult {
  const { signer, address: signerAddress } = useSigner();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  // Keep a stable ref to the signer so async callbacks always read the latest
  const signerRef = useRef(signer);
  signerRef.current = signer;

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

  // Track active instances — disconnect only when the last one unmounts
  useEffect(() => {
    activeChatInstances++;
    return () => {
      activeChatInstances--;
      if (activeChatInstances === 0) {
        getChatService().disconnect();
        connectedAddress = null;
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
    const url = `${httpBase}/api/messages?roomId=${roomId}&limit=50`;

    const fetchMessages = () => {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: { messages: ChatMessage[]; hasMore: boolean }) => {
          setMessages(data.messages);
          setHasMore(data.hasMore);
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
  }, [signerAddress, roomId]);

  // Subscribe to events.
  // When re-mounting (e.g. docked↔floating switch), request history
  // to populate messages since local state starts empty.
  useEffect(() => {
    const chatService = getChatService();

    const unsubMessage = chatService.on('message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    const unsubHistory = chatService.on('history', ({ messages: historyMsgs, hasMore: more }) => {
      setMessages((prev) => {
        // If we have no messages yet, this is the initial load
        if (prev.length === 0) return historyMsgs;
        // Otherwise prepend (load more)
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = historyMsgs.filter((m) => !existingIds.has(m.id));
        return [...newMsgs, ...prev];
      });
      setHasMore(more);
    });

    const unsubStatus = chatService.on('status', (s) => {
      setStatus(s);
      if (s === 'connected') setError(null);
      if (s === 'disconnected') {
        setNicknameRateLimit(null);
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

    // If already connected (e.g. re-mount after docked↔floating switch),
    // request history to populate the fresh empty messages state.
    if (chatService.getStatus() === 'connected') {
      chatService.loadHistory(roomId);
    }

    return () => {
      unsubMessage();
      unsubHistory();
      unsubStatus();
      unsubOnline();
      unsubError();
      unsubNickname();
    };
  }, [roomId]);

  const sendMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    getChatService().sendMessage(trimmed, roomId);
    // Increment chat message counter for badge tracking
    try {
      const key = 'pado-chat-message-count';
      const count = parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
      localStorage.setItem(key, String(count + 1));
    } catch { /* ignore storage errors */ }
  }, [roomId]);

  const loadMore = useCallback(() => {
    if (!hasMore || messages.length === 0) return;
    const oldestId = messages[0]?.id;
    getChatService().loadHistory(roomId, oldestId);
  }, [roomId, hasMore, messages]);

  const setNickname = useCallback((name: string) => {
    getChatService().setNickname(name);
  }, []);

  const checkNickname = useCallback((name: string) => {
    getChatService().checkNickname(name);
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
  };
}
