import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatSigner } from '../../../lib/chat-service';
import { useSigner, ZkLoginSigner } from '@nasun/wallet';
import { NETWORK_CONFIG } from '../../../config/network';
import type { ChatMessage, ChatConnectionStatus } from '../types';

export interface UseChatResult {
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  loadMore: () => void;
  isConnected: boolean;
  status: ChatConnectionStatus;
  onlineCount: number;
  hasMore: boolean;
  error: string | null;
}

export function useChat(roomId: number = 0): UseChatResult {
  const { signer, address: signerAddress } = useSigner();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatConnectionStatus>('disconnected');
  const [onlineCount, setOnlineCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref to the signer so async callbacks always read the latest
  const signerRef = useRef(signer);
  signerRef.current = signer;

  // Track which address we're currently connected with
  const connectedAddressRef = useRef<string | null>(null);

  // Connect/disconnect — runs every render but only acts on state changes
  useEffect(() => {
    const chatService = getChatService();
    const wsUrl = NETWORK_CONFIG.chatWebSocketUrl;

    // Should disconnect: no signer or no wsUrl
    if (!wsUrl || !signerAddress || !signer) {
      if (connectedAddressRef.current) {
        chatService.disconnect();
        connectedAddressRef.current = null;
      }
      return;
    }

    // Already connected with this address — nothing to do
    if (connectedAddressRef.current === signerAddress) return;

    // Different address or first connect — disconnect old, connect new
    if (connectedAddressRef.current) {
      chatService.disconnect();
    }

    // Build ChatSigner based on signer type
    const chatSigner: ChatSigner = signer.type === 'zklogin'
      ? {
          address: signerAddress,
          signPersonal: async () => { throw new Error('zkLogin: use ephemeral key'); },
          authMethod: 'ephemeral',
          ephemeralPubKey: (signer as ZkLoginSigner).getEphemeralPublicKey(),
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
    connectedAddressRef.current = signerAddress;
  });

  // Disconnect on unmount
  useEffect(() => {
    return () => {
      getChatService().disconnect();
      connectedAddressRef.current = null;
    };
  }, []);

  // Subscribe to events
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
    });
    const unsubOnline = chatService.on('online_count', setOnlineCount);
    const unsubError = chatService.on('error', (err) => {
      if (err.code === 'SIGN_FAILED') {
        setError(err.message);
      }
    });

    return () => {
      unsubMessage();
      unsubHistory();
      unsubStatus();
      unsubOnline();
      unsubError();
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    getChatService().sendMessage(trimmed, roomId);
  }, [roomId]);

  const loadMore = useCallback(() => {
    if (!hasMore || messages.length === 0) return;
    const oldestId = messages[0]?.id;
    getChatService().loadHistory(roomId, oldestId);
  }, [roomId, hasMore, messages]);

  return {
    messages,
    sendMessage,
    loadMore,
    isConnected: status === 'connected',
    status,
    onlineCount,
    hasMore,
    error,
  };
}
