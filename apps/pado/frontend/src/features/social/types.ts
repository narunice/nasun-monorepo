export const REACTION_CODES = ['thumbsup', 'fire', 'rocket', 'gem', 'chart_down', 'laugh'] as const;
export type ReactionCode = typeof REACTION_CODES[number];

export const REACTION_EMOJI: Record<ReactionCode, string> = {
  thumbsup: '\u{1F44D}', fire: '\u{1F525}', rocket: '\u{1F680}',
  gem: '\u{1F48E}', chart_down: '\u{1F4C9}', laugh: '\u{1F602}',
};

export interface ChatMessage {
  id: number;
  roomId: number;
  sender: string;
  senderNickname?: string;
  content: string;
  messageType: 'text' | 'system' | 'reply';
  replyToId: number | null;
  timestamp: number;
  reactions?: Record<string, number>;
  myReaction?: string | null;
  /** Client-side only: pending confirmation from server */
  pending?: boolean;
}

export type ChatConnectionStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected';

export interface RoomInfo {
  id: number;
  name: string;
  description: string;
}

export interface ChatState {
  messages: ChatMessage[];
  status: ChatConnectionStatus;
  onlineCount: number;
  hasMore: boolean;
}

/** Structured data embedded in chat messages via [TRADE] prefix */
export interface TradeShareData {
  pair: string;        // e.g. "NBTC/NUSDC"
  side: 'BUY' | 'SELL';
  price: number;
  qty: number;
  total: number;       // price * qty
  pnl?: number;
  pnlPct?: number;
  tx: string;          // shortened txDigest (first8...last4)
}

// ===== Activity Feed Types =====

export interface FeedActivity {
  type: 'trade';
  traderAddress: string;
  traderNickname: string | null;
  timestamp: number;
  data: {
    poolId: string;
    pair: string;
    side: 'buy' | 'sell';
    price: string;
    baseQuantity: string;
    quoteQuantity: string;
    txDigest: string;
  };
}

export interface FeedResponse {
  activities: FeedActivity[];
  hasMore: boolean;
  followCount?: number;
}

const TRADE_SHARE_PREFIX = '[TRADE]';

/** Check if a chat message contains a trade share */
export function isTradeShare(content: string): boolean {
  return content.startsWith(TRADE_SHARE_PREFIX);
}

/** Parse trade share data from chat message content. Returns null if invalid. */
export function parseTradeShare(content: string): TradeShareData | null {
  if (!content.startsWith(TRADE_SHARE_PREFIX)) return null;
  try {
    const json = content.slice(TRADE_SHARE_PREFIX.length);
    const data = JSON.parse(json);
    // Validate required fields
    if (
      typeof data.pair !== 'string' || data.pair.length > 30 ||
      (data.side !== 'BUY' && data.side !== 'SELL') ||
      typeof data.price !== 'number' || !isFinite(data.price) || data.price < 0 ||
      typeof data.qty !== 'number' || !isFinite(data.qty) || data.qty < 0 ||
      typeof data.total !== 'number' || !isFinite(data.total) || data.total < 0 ||
      typeof data.tx !== 'string' || data.tx.length > 64 ||
      !/^[a-zA-Z0-9+/=.-]+$/.test(data.tx)
    ) {
      return null;
    }
    // Validate optional fields if present
    if (data.pnl !== undefined && (typeof data.pnl !== 'number' || !isFinite(data.pnl))) return null;
    if (data.pnlPct !== undefined && (typeof data.pnlPct !== 'number' || !isFinite(data.pnlPct))) return null;
    return data as TradeShareData;
  } catch {
    return null;
  }
}
