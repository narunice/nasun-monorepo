import { useEffect, useRef, useCallback } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatMessage, ChatConnectionStatus } from '../../../lib/chat-service';
import { useChatStore } from '../../../store/chatStore';
import { useUserStore } from '../../../store/userStore';

const WS_URL = import.meta.env.VITE_NASUN_CHAT_WS_URL || 'ws://localhost:3101';

export function useChat() {
  const user = useUserStore((s) => s.user);
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const onlineCount = useChatStore((s) => s.onlineCount);
  const isOpen = useChatStore((s) => s.isOpen);
  const hasMore = useChatStore((s) => s.hasMore);
  const connectedRef = useRef(false);

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

    // Use getState() inside callbacks to avoid stale closures
    const onMessage = (msg: ChatMessage) => {
      useChatStore.getState().addMessage(msg);
    };
    const onHistory = (data: { messages: ChatMessage[]; hasMore: boolean }) => {
      const store = useChatStore.getState();
      if (store.messages.length === 0) {
        store.setHistory(data.messages, data.hasMore);
      } else {
        store.prependHistory(data.messages, data.hasMore);
      }
    };
    const onStatus = (s: ChatConnectionStatus) => {
      useChatStore.getState().setStatus(s);
    };
    const onCount = (n: number) => {
      useChatStore.getState().setOnlineCount(n);
    };

    service.on('message', onMessage);
    service.on('history', onHistory);
    service.on('status', onStatus);
    service.on('online_count', onCount);

    service.connect(WS_URL, token, displayName);
    connectedRef.current = true;

    return () => {
      service.off('message', onMessage);
      service.off('history', onHistory);
      service.off('status', onStatus);
      service.off('online_count', onCount);
    };
  }, [user?.cognitoToken, user?.customDisplayName, user?.username]);

  const sendMessage = useCallback((content: string) => {
    getChatService().sendMessage(content);
  }, []);

  const loadMore = useCallback(() => {
    const store = useChatStore.getState();
    if (!store.hasMore || store.messages.length === 0) return;
    const oldestId = store.messages[0]?.id;
    if (oldestId) {
      getChatService().loadHistory(oldestId, 50);
    }
  }, []);

  return {
    messages,
    status,
    onlineCount,
    isOpen,
    hasMore,
    sendMessage,
    loadMore,
    canChat: !!user?.cognitoToken,
  };
}
