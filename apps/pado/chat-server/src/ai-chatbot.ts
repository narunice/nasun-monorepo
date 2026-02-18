/**
 * AI Chatbot — mention-based conversational AI for Pado chat.
 *
 * Responds when users mention @pado in their messages.
 * Uses Claude Haiku for cost-efficient, fast responses.
 * Gracefully degrades when ANTHROPIC_API_KEY is not set.
 */

import { getRecentMessages } from './store.js';
import type { StoredMessage } from './types.js';

// ===== Configuration =====

export interface ChatbotConfig {
  anthropicApiKey: string;
  broadcastToRoom: (content: string, roomId: number) => void;
}

const MENTION_PATTERN = /(?:^|\s)@(?:pado|wavi)\b/i;
const BOT_PREFIX = '[BOT] ';
const MAX_RESPONSE_LENGTH = 500;
const CONTEXT_MESSAGE_COUNT = 5;

// Rate limiting
const PER_USER_COOLDOWN_MS = 30_000;   // 30 seconds per user
const MAX_RESPONSES_PER_HOUR = 30;

const SYSTEM_PROMPT = `You are Wavi, the resident chat buddy in Pado — a decentralized exchange on the Nasun blockchain. You're witty, warm, and genuinely fun to talk to. Think of yourself as a crypto-savvy friend hanging out in the group chat, not a customer service bot.

Your knowledge:
- Pado offers spot trading via DeepBook CLOB (Central Limit Order Book) with pairs like NBTC/NUSDC, NASUN/NUSDC, NETH/NUSDC, NSOL/NUSDC
- Prediction market: users can bet on outcomes of real-world events
- Lottery: on-chain lottery powered by Sui Random
- Staking: users can stake NASUN tokens to earn rewards
- Portfolio: track token balances, P&L, cost basis, and trade history
- Wallets: passkey-based wallet (no seed phrase needed) or mnemonic wallet, plus zkLogin via Google
- The native token is NASUN (smallest unit: SOE)
- Faucet available for devnet testing tokens (NASUN, NBTC, NUSDC, NETH, NSOL)

Personality:
- Be witty and playful — sprinkle in humor, light banter, and crypto culture references (gm, wagmi, etc.) where natural
- Use emojis sparingly but naturally (1-2 per message max)
- Engage with off-topic conversations! If someone asks about dinner, crack a joke and play along — then casually tie it back to Pado if it fits
- You're a friend first, an assistant second. Never sound like a FAQ bot
- Match the vibe of whoever you're talking to — if they're casual, be casual; if they ask a serious question, be helpful but still warm

Rules:
- Keep responses to 1-4 sentences. Be concise but not robotic
- Never give financial advice or recommend specific trades
- You have no access to real-time prices. If asked, be honest about it and suggest checking a price aggregator
- Respond in the same language the user writes in. Default to English if unclear
- If you don't know something, say so honestly — but keep it lighthearted`;

// ===== State =====

let config: ChatbotConfig | null = null;
let cachedClient: unknown = null;

// Per-user rate limiting
const userLastResponse = new Map<string, number>();

// Global hourly rate limiting
let hourlyCount = 0;
let hourlyResetMs = 0;

// ===== Rate Limiting =====

function maybeResetHourlyCounter(now: number): void {
  if (now - hourlyResetMs >= 3_600_000) {
    hourlyCount = 0;
    hourlyResetMs = now;
  }
}

function canRespond(userAddress: string): boolean {
  const now = Date.now();
  maybeResetHourlyCounter(now);

  // Global cap
  if (hourlyCount >= MAX_RESPONSES_PER_HOUR) return false;

  // Per-user cooldown
  const lastTime = userLastResponse.get(userAddress) || 0;
  if (now - lastTime < PER_USER_COOLDOWN_MS) return false;

  return true;
}

function recordResponse(userAddress: string): void {
  const now = Date.now();
  maybeResetHourlyCounter(now);
  userLastResponse.set(userAddress, now);
  hourlyCount++;
}

// ===== Mention Detection =====

export function hasMention(content: string): boolean {
  return MENTION_PATTERN.test(content);
}

// ===== Prompt Building =====

function buildUserPrompt(
  userMessage: string,
  senderName: string,
  recentMessages: StoredMessage[],
): string {
  const lines: string[] = [];

  // Include recent chat context
  if (recentMessages.length > 0) {
    lines.push('Recent chat context:');
    for (const msg of recentMessages) {
      const name = msg.sender === 'SYSTEM' ? 'SYSTEM' : msg.sender.slice(0, 10);
      lines.push(`  ${name}: ${msg.content.slice(0, 200)}`);
    }
    lines.push('');
  }

  // Strip @pado mention from the user's message for cleaner prompt
  const cleanMessage = userMessage.replace(/@(?:pado|wavi)/gi, '').trim();
  lines.push(`${senderName} asks: ${cleanMessage}`);

  return lines.join('\n');
}

// ===== AI Response Generation =====

async function generateResponse(
  userMessage: string,
  senderName: string,
  recentMessages: StoredMessage[],
): Promise<string | null> {
  if (!config?.anthropicApiKey) return null;

  // Lazy-load and cache Anthropic client
  if (!cachedClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    cachedClient = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = cachedClient as any;

  const prompt = buildUserPrompt(userMessage, senderName, recentMessages);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  const text = block?.type === 'text' ? block.text : null;
  if (!text) return null;

  return text.trim().slice(0, MAX_RESPONSE_LENGTH);
}

// ===== Public API =====

/**
 * Initialize the AI chatbot. Must be called once at server startup.
 */
export function initChatbot(cfg: ChatbotConfig): void {
  config = cfg;
  hourlyResetMs = Date.now();
  console.log('[Chatbot] Initialized (mention-based, model: claude-haiku-4-5)');
}

/**
 * Process a user message. If it contains @pado mention, generate and broadcast an AI response.
 * This function is non-blocking and safe to fire-and-forget.
 */
export async function onUserMessage(
  content: string,
  senderNickname: string | null,
  senderAddress: string,
  roomId: number,
): Promise<void> {
  if (!config) return;
  if (!hasMention(content)) return;
  if (!canRespond(senderAddress)) return;

  try {
    const recentMessages = getRecentMessages(roomId, CONTEXT_MESSAGE_COUNT);
    const senderName = senderNickname ?? senderAddress.slice(0, 10);

    const response = await generateResponse(content, senderName, recentMessages);
    if (!response) return;

    config.broadcastToRoom(`${BOT_PREFIX}${response}`, roomId);
    recordResponse(senderAddress);
    console.log(`[Chatbot] Responded to ${senderAddress.slice(0, 10)}... in room ${roomId}`);
  } catch (err) {
    // AI failure should never crash the server
    console.warn('[Chatbot] Response generation failed:', (err as Error).message);
  }
}

/**
 * Stop the chatbot (cleanup).
 */
export function stopChatbot(): void {
  cachedClient = null;
  config = null;
  userLastResponse.clear();
  console.log('[Chatbot] Stopped');
}
