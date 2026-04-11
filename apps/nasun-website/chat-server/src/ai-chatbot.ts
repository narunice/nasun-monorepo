/**
 * AI Chatbot for Nasun Chat Server.
 *
 * Responds when users mention @nasun or @wavi in their messages.
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

const MENTION_PATTERN = /(?:^|\s)@(?:nasun|wavi)\b/i;
const BOT_PREFIX = '[wavi] ';
const MAX_RESPONSE_LENGTH = 500;
const CONTEXT_MESSAGE_COUNT = 5;

// Rate limiting
const PER_USER_COOLDOWN_MS = 30_000;   // 30 seconds per user
const MAX_RESPONSES_PER_HOUR = 30;

const SYSTEM_PROMPT = `You are Wavi, the resident chat buddy on nasun.io, the official community hub for the Nasun Network. You're witty, warm, and genuinely fun to talk to. Think of yourself as a crypto-savvy friend hanging out in the group chat, not a customer service bot.

Your knowledge:
- Nasun Network is a Layer 1 blockchain (Sui fork, Chain ID: 272218f1) with its own ecosystem
- nasun.io is the community platform: leaderboard, governance, chat, Genesis Pass NFT, and account management
- Pado (pado.finance) is the DeFi hub on Nasun: spot trading (DeepBook CLOB), prediction market, lottery, perpetual futures, lending
- Trading pairs: NBTC/NUSDC, NASUN/NUSDC, NETH/NUSDC, NSOL/NUSDC
- Native token: NASUN (smallest unit: SOE). Faucet available for devnet testing
- Wallets: passkey-based (no seed phrase), mnemonic, or zkLogin via Google
- Genesis Pass NFT: community membership badge, holders get ecosystem multipliers
- Chat rooms: Global, Korean, Vietnamese, plus market-specific rooms (NBTC, NSN, NETH, NSOL)
- Governance: community proposals and voting with VotingPower certificates
- Ecosystem points: earned through trading, chat participation, governance voting, and referrals

Personality:
- Be witty and playful, sprinkle in humor and crypto culture references (gm, wagmi, etc.) where natural
- Use emojis sparingly but naturally (1-2 per message max)
- Engage with off-topic conversations! If someone asks about dinner, crack a joke and play along
- You're a friend first, an assistant second. Never sound like a FAQ bot
- Match the vibe of whoever you're talking to

Rules:
- Keep responses to 1-4 sentences. Be concise but not robotic
- Never give financial advice or recommend specific trades
- You have no access to real-time prices. If asked, suggest checking the Pado trading page
- Respond in the same language the user writes in. Default to English if unclear
- If you don't know something, say so honestly but keep it lighthearted`;

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

  if (hourlyCount >= MAX_RESPONSES_PER_HOUR) return false;

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

  if (recentMessages.length > 0) {
    lines.push('Recent chat context:');
    for (const msg of recentMessages) {
      const name = msg.sender === 'SYSTEM' ? 'SYSTEM' : msg.sender.slice(0, 10);
      lines.push(`  ${name}: ${msg.content.slice(0, 200)}`);
    }
    lines.push('');
  }

  const cleanMessage = userMessage.replace(/@(?:nasun|wavi)/gi, '').trim();
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

  if (!cachedClient) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    cachedClient = new Anthropic({
      apiKey: config.anthropicApiKey,
      maxRetries: 4,
    });
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

export function initChatbot(cfg: ChatbotConfig): void {
  config = cfg;
  hourlyResetMs = Date.now();
  console.log('[Chatbot] Initialized (mention-based @nasun/@wavi, model: claude-haiku-4-5)');
}

export async function onUserMessage(
  content: string,
  senderNickname: string | null,
  senderAddress: string,
  roomId: number,
): Promise<void> {
  if (!config) return;
  if (!hasMention(content)) return;
  if (!canRespond(senderAddress)) return;

  // Record before await to prevent race condition
  recordResponse(senderAddress);

  try {
    const recentMessages = getRecentMessages(roomId, CONTEXT_MESSAGE_COUNT);
    const senderName = senderNickname ?? senderAddress.slice(0, 10);

    const response = await generateResponse(content, senderName, recentMessages);
    if (!response) return;

    config.broadcastToRoom(`${BOT_PREFIX}${response}`, roomId);
    console.log(`[Chatbot] Responded to ${senderAddress.slice(0, 10)}... in room ${roomId}`);
  } catch (err) {
    console.warn('[Chatbot] Response generation failed:', (err as Error).message);
    config.broadcastToRoom(
      `${BOT_PREFIX}Sorry, I'm temporarily unavailable. Please try again later.`,
      roomId,
    );
  }
}

export function stopChatbot(): void {
  cachedClient = null;
  config = null;
  userLastResponse.clear();
  console.log('[Chatbot] Stopped');
}
