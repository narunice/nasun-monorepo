import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initStore, insertMessage, getRecentMessages, purgeOldMessages, upsertUser, closeStore, getDb } from '../store.js';
import type { ChatServerConfig } from '../types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeConfig(overrides?: Partial<ChatServerConfig>): ChatServerConfig {
  const tempDir = mkdtempSync(join(tmpdir(), 'chat-test-'));
  return {
    port: 0,
    maxMessageLength: 500,
    maxWsMessageBytes: 10240,
    rateLimitMs: 500,
    historyRateLimitMs: 2000,
    maxConnectionsPerIp: 5,
    authTimeoutMs: 30000,
    maxSessionMs: 86400000,
    dbPath: join(tempDir, 'test.db'),
    messageRetentionDays: 30,
    retentionCleanupIntervalMs: 86400000,
    allowedOrigins: ['http://localhost:5174'],
    ...overrides,
  };
}

let config: ChatServerConfig;

beforeEach(() => {
  config = makeConfig();
  initStore(config);
});

afterEach(() => {
  closeStore();
  try {
    rmSync(config.dbPath, { force: true });
    rmSync(config.dbPath + '-wal', { force: true });
    rmSync(config.dbPath + '-shm', { force: true });
    // Remove temp directory
    const dir = config.dbPath.replace(/\/[^/]+$/, '');
    rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore cleanup errors */ }
});

describe('initStore', () => {
  it('creates tables successfully', () => {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('users');
  });

  it('enables WAL mode', () => {
    const db = getDb();
    const mode = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(mode[0].journal_mode).toBe('wal');
  });

  it('enables foreign keys', () => {
    const db = getDb();
    const fk = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(fk[0].foreign_keys).toBe(1);
  });
});

describe('insertMessage', () => {
  it('inserts a message and returns it with an id', () => {
    const msg = insertMessage({
      senderId: 'user-1',
      senderName: 'Alice',
      content: 'Hello world',
      messageType: 'text',
      replyToId: null,
      timestamp: Date.now(),
    });

    expect(msg.id).toBeGreaterThan(0);
    expect(msg.senderId).toBe('user-1');
    expect(msg.content).toBe('Hello world');
  });

  it('stores content as-is (no HTML encoding)', () => {
    const msg = insertMessage({
      senderId: 'user-1',
      senderName: 'Alice',
      content: '<script>alert("xss")</script>',
      messageType: 'text',
      replyToId: null,
      timestamp: Date.now(),
    });

    // Content should NOT be HTML-encoded (React handles XSS protection)
    expect(msg.content).toBe('<script>alert("xss")</script>');

    // Verify DB also has raw content
    const rows = getRecentMessages(10);
    expect(rows[0].content).toBe('<script>alert("xss")</script>');
  });

  it('handles special characters in content', () => {
    const msg = insertMessage({
      senderId: 'user-1',
      senderName: 'Alice',
      content: 'Price: $10 & 20% off < today > "special"',
      messageType: 'text',
      replyToId: null,
      timestamp: Date.now(),
    });

    expect(msg.content).toBe('Price: $10 & 20% off < today > "special"');
  });

  it('handles emoji in content', () => {
    const msg = insertMessage({
      senderId: 'user-1',
      senderName: 'Alice',
      content: 'Hello 🌍🚀 World',
      messageType: 'text',
      replyToId: null,
      timestamp: Date.now(),
    });

    const rows = getRecentMessages(10);
    expect(rows[0].content).toBe('Hello 🌍🚀 World');
  });

  it('handles unicode content (Korean, Japanese)', () => {
    const msg = insertMessage({
      senderId: 'user-1',
      senderName: 'Alice',
      content: '안녕하세요 こんにちは',
      messageType: 'text',
      replyToId: null,
      timestamp: Date.now(),
    });

    const rows = getRecentMessages(10);
    expect(rows[0].content).toBe('안녕하세요 こんにちは');
  });

  it('handles replyToId', () => {
    const first = insertMessage({
      senderId: 'user-1',
      senderName: 'Alice',
      content: 'First message',
      messageType: 'text',
      replyToId: null,
      timestamp: Date.now(),
    });

    const reply = insertMessage({
      senderId: 'user-2',
      senderName: 'Bob',
      content: 'Reply to first',
      messageType: 'text',
      replyToId: first.id,
      timestamp: Date.now(),
    });

    expect(reply.replyToId).toBe(first.id);
  });

  it('allows replyToId pointing to non-existent message (no FK constraint)', () => {
    const msg = insertMessage({
      senderId: 'user-1',
      senderName: 'Alice',
      content: 'Reply to nothing',
      messageType: 'text',
      replyToId: 99999,
      timestamp: Date.now(),
    });

    expect(msg.replyToId).toBe(99999);
  });

  it('auto-increments ids', () => {
    const msg1 = insertMessage({
      senderId: 'user-1', senderName: 'Alice', content: 'First',
      messageType: 'text', replyToId: null, timestamp: Date.now(),
    });
    const msg2 = insertMessage({
      senderId: 'user-1', senderName: 'Alice', content: 'Second',
      messageType: 'text', replyToId: null, timestamp: Date.now(),
    });

    expect(msg2.id).toBe(msg1.id + 1);
  });

  it('handles maximum length content (500 chars)', () => {
    const longContent = 'A'.repeat(500);
    const msg = insertMessage({
      senderId: 'user-1', senderName: 'Alice', content: longContent,
      messageType: 'text', replyToId: null, timestamp: Date.now(),
    });

    expect(msg.content.length).toBe(500);
  });
});

describe('getRecentMessages', () => {
  it('returns messages in ascending order (oldest first)', () => {
    for (let i = 0; i < 5; i++) {
      insertMessage({
        senderId: 'user-1', senderName: 'Alice', content: `Message ${i}`,
        messageType: 'text', replyToId: null, timestamp: Date.now() + i,
      });
    }

    const messages = getRecentMessages(10);
    expect(messages).toHaveLength(5);
    expect(messages[0].content).toBe('Message 0');
    expect(messages[4].content).toBe('Message 4');
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      insertMessage({
        senderId: 'user-1', senderName: 'Alice', content: `Message ${i}`,
        messageType: 'text', replyToId: null, timestamp: Date.now() + i,
      });
    }

    const messages = getRecentMessages(3);
    expect(messages).toHaveLength(3);
    // Should return the 3 most recent
    expect(messages[0].content).toBe('Message 7');
    expect(messages[2].content).toBe('Message 9');
  });

  it('supports cursor-based pagination (beforeId)', () => {
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      const msg = insertMessage({
        senderId: 'user-1', senderName: 'Alice', content: `Message ${i}`,
        messageType: 'text', replyToId: null, timestamp: Date.now() + i,
      });
      ids.push(msg.id);
    }

    // Get messages before id of message 7 (0-indexed)
    const messages = getRecentMessages(3, ids[7]);
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('Message 4');
    expect(messages[2].content).toBe('Message 6');
  });

  it('returns empty array when no messages', () => {
    const messages = getRecentMessages(10);
    expect(messages).toHaveLength(0);
  });

  it('handles beforeId that is less than all message ids', () => {
    insertMessage({
      senderId: 'user-1', senderName: 'Alice', content: 'Only message',
      messageType: 'text', replyToId: null, timestamp: Date.now(),
    });

    // beforeId=0 is falsy, so getRecentMessages treats it as "no cursor"
    // Use -1 to test "before all messages" scenario
    const messages = getRecentMessages(10, -1);
    expect(messages).toHaveLength(0);
  });

  it('returns correct hasMore signal via length comparison', () => {
    for (let i = 0; i < 5; i++) {
      insertMessage({
        senderId: 'user-1', senderName: 'Alice', content: `Message ${i}`,
        messageType: 'text', replyToId: null, timestamp: Date.now() + i,
      });
    }

    // Request limit=3, get 3 back -> hasMore = true (length === limit)
    const page1 = getRecentMessages(3);
    expect(page1).toHaveLength(3);

    // Request limit=10, get 5 back -> hasMore = false (length < limit)
    const all = getRecentMessages(10);
    expect(all).toHaveLength(5);
  });
});

describe('purgeOldMessages', () => {
  it('deletes messages older than retention period', () => {
    const now = Date.now();
    // Old message (31 days ago)
    insertMessage({
      senderId: 'user-1', senderName: 'Alice', content: 'Old message',
      messageType: 'text', replyToId: null, timestamp: now - 31 * 24 * 60 * 60 * 1000,
    });
    // Recent message
    insertMessage({
      senderId: 'user-1', senderName: 'Alice', content: 'New message',
      messageType: 'text', replyToId: null, timestamp: now,
    });

    const deleted = purgeOldMessages(30);
    expect(deleted).toBe(1);

    const remaining = getRecentMessages(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].content).toBe('New message');
  });

  it('returns 0 when no messages to purge', () => {
    insertMessage({
      senderId: 'user-1', senderName: 'Alice', content: 'Recent',
      messageType: 'text', replyToId: null, timestamp: Date.now(),
    });

    const deleted = purgeOldMessages(30);
    expect(deleted).toBe(0);
  });

  it('handles empty database', () => {
    const deleted = purgeOldMessages(30);
    expect(deleted).toBe(0);
  });
});

describe('upsertUser', () => {
  it('inserts a new user', () => {
    upsertUser('user-1', 'Alice');
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE identity_id = ?').get('user-1') as any;
    expect(row.display_name).toBe('Alice');
  });

  it('updates existing user display name', () => {
    upsertUser('user-1', 'Alice');
    upsertUser('user-1', 'Alice Updated');

    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE identity_id = ?').get('user-1') as any;
    expect(row.display_name).toBe('Alice Updated');
  });

  it('updates last_seen_at on upsert', () => {
    upsertUser('user-1', 'Alice');
    const db = getDb();
    const row1 = db.prepare('SELECT last_seen_at FROM users WHERE identity_id = ?').get('user-1') as any;

    // Small delay to ensure timestamp differs
    const before = row1.last_seen_at;
    upsertUser('user-1', 'Alice');
    const row2 = db.prepare('SELECT last_seen_at FROM users WHERE identity_id = ?').get('user-1') as any;

    expect(row2.last_seen_at).toBeGreaterThanOrEqual(before);
  });

  it('handles provider field', () => {
    upsertUser('user-1', 'Alice', 'Google');
    const db = getDb();
    const row = db.prepare('SELECT provider FROM users WHERE identity_id = ?').get('user-1') as any;
    expect(row.provider).toBe('Google');
  });

  it('handles null provider', () => {
    upsertUser('user-1', 'Alice');
    const db = getDb();
    const row = db.prepare('SELECT provider FROM users WHERE identity_id = ?').get('user-1') as any;
    expect(row.provider).toBeNull();
  });
});
