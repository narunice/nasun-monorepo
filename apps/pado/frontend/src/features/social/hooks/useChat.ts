import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatService } from '../../../lib/chat-service';
import { useSigner } from '@nasun/wallet';
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
}

export function useChat(roomId: number = 0): UseChatResult {
  const { signer } = useSigner();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatConnectionStatus>('disconnected');
  const [onlineCount, setOnlineCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const connectedRef = useRef(false);

  // Connect/disconnect based on signer availability
  useEffect(() => {
    const chatService = getChatService();
    const wsUrl = NETWORK_CONFIG.chatWebSocketUrl;

    if (!wsUrl || !signer) {
      if (connectedRef.current) {
        chatService.disconnect();
        connectedRef.current = false;
      }
      return;
    }

    chatService.connect(wsUrl, {
      address: signer.address,
      signPersonal: async (msg: Uint8Array) => signer.signPersonal(msg),
    });
    connectedRef.current = true;

    return () => {
      chatService.disconnect();
      connectedRef.current = false;
    };
  }, [signer]);

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

    const unsubStatus = chatService.on('status', setStatus);
    const unsubOnline = chatService.on('online_count', setOnlineCount);

    return () => {
      unsubMessage();
      unsubHistory();
      unsubStatus();
      unsubOnline();
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
  };
}
