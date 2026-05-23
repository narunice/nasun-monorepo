/**
 * In-memory per-session chat history for multi-turn context.
 *
 * Why this exists:
 *   The chat preset was originally stateless — each user_message wake
 *   called the LLM with persona + the single current message. Users
 *   noticed turn-2 onward looked context-blind ("home" -> "Just hanging
 *   out at home?" instead of continuing a lunch convo). The LLM had
 *   zero memory of prior turns because we never gave it any.
 *
 * Why in-memory (not chat-server SQLite):
 *   Chat is intentionally an AER-free path. Persisting every casual
 *   turn would muddy the data model (chat-server's chat-wake tables
 *   are scoped to trading wakes + their outcomes). Per-process memory
 *   is good enough for the prototype: the chat preset runs inside the
 *   agent's long-lived runtime process, so history survives across
 *   minutes of conversation. A daily 18:00 UTC chat-server restart
 *   would clear it, which matches user expectations for casual chat.
 *
 * Trim policy:
 *   - At most MAX_TURNS user+agent pairs (so 2 * MAX_TURNS messages)
 *     are retained per session. Oldest pairs drop first.
 *   - Sessions idle longer than IDLE_TTL_MS are reset on next access.
 *     Without this, a user returning hours later would get answers
 *     stitched to a stale conversation thread.
 *
 * Out of scope (v1):
 *   - Cross-restart persistence
 *   - Cross-agent sharing
 *   - Summarisation for very long sessions (TTL + trim makes this
 *     unnecessary at chat traffic volumes)
 */

export type ChatRole = 'user' | 'agent';

export interface ChatTurn {
  role: ChatRole;
  content: string;
  ts: number;
}

const MAX_TURNS = 6;
const IDLE_TTL_MS = 30 * 60 * 1000;

interface Session {
  turns: ChatTurn[];
  lastTouchedMs: number;
}

export class ChatHistoryStore {
  private readonly sessions = new Map<string, Session>();

  /**
   * Return the live turn list for `sid`, applying TTL eviction.
   * The caller mutates this list by appending; we do not copy.
   */
  load(sid: string, now: number = Date.now()): ChatTurn[] {
    const s = this.sessions.get(sid);
    if (!s) return [];
    if (now - s.lastTouchedMs > IDLE_TTL_MS) {
      this.sessions.delete(sid);
      return [];
    }
    return s.turns;
  }

  /**
   * Append a turn, then trim to MAX_TURNS user+agent pairs. Trimming
   * drops oldest pairs first so the conversation always begins on a
   * user turn from the model's perspective.
   */
  append(sid: string, role: ChatRole, content: string, now: number = Date.now()): void {
    let s = this.sessions.get(sid);
    // TTL gate also runs on append so a long-idle session starts fresh.
    if (s && now - s.lastTouchedMs > IDLE_TTL_MS) {
      this.sessions.delete(sid);
      s = undefined;
    }
    if (!s) {
      s = { turns: [], lastTouchedMs: now };
      this.sessions.set(sid, s);
    }
    s.turns.push({ role, content, ts: now });
    s.lastTouchedMs = now;

    // Pairs cap. We keep MAX_TURNS user messages + their agent replies
    // (so at most 2 * MAX_TURNS items, give or take an unmatched
    // trailing user msg waiting for a reply).
    const cap = MAX_TURNS * 2;
    if (s.turns.length > cap) {
      // Drop from the start in pairs to avoid leaving an orphan agent
      // line as the first item -- the LLM prompt template expects
      // alternating User/Agent and a leading orphan agent confuses
      // smaller models.
      const drop = s.turns.length - cap;
      let dropFrom = drop;
      // If after the cut the first remaining turn is an agent, drop
      // one more so the conversation starts on a user turn.
      if (s.turns[dropFrom]?.role === 'agent') dropFrom += 1;
      s.turns = s.turns.slice(dropFrom);
    }
  }

  /** Drop a session entirely. Useful for tests + explicit `/reset` style commands. */
  clear(sid: string): void {
    this.sessions.delete(sid);
  }

  /** Diagnostics only. */
  size(): number {
    return this.sessions.size;
  }
}

/**
 * Render the conversation history + current user message into the
 * single-string prompt shape that callLLM / the provider pool expects.
 * Keeping this as a separate function so the chat preset stays focused
 * on policy and we can unit-test the wire format directly.
 */
export function renderChatPrompt(
  persona: string,
  history: ChatTurn[],
  currentUserMessage: string,
): string {
  const lines: string[] = [persona, ''];
  for (const t of history) {
    const tag = t.role === 'user' ? 'User' : 'Agent';
    lines.push(`${tag}: ${t.content}`);
  }
  lines.push(`User: ${currentUserMessage}`);
  lines.push('Agent:');
  return lines.join('\n');
}
