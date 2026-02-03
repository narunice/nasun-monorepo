export interface ChatMessage {
  id: number;
  roomId: number;
  sender: string;
  content: string;
  messageType: 'text' | 'system' | 'reply';
  replyToId: number | null;
  timestamp: number;
  /** Client-side only: pending confirmation from server */
  pending?: boolean;
}

export type ChatConnectionStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected';

export interface ChatState {
  messages: ChatMessage[];
  status: ChatConnectionStatus;
  onlineCount: number;
  hasMore: boolean;
}
