/**
 * Wake job idempotency store (sqlite-backed).
 *
 * `~/.nasun-ai-runtime/processed_jobs.db` survives PM2 restarts.
 * chat-server is the system of record for `job_id` (ULID per Plan D §A4);
 * this store is the agent-runner's local memo so duplicate `/wake` calls
 * echo the prior outcome instead of re-running the LLM cycle and emitting
 * a second AER.
 */
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_DIR = join(homedir(), '.nasun-ai-runtime');

export interface ProcessedJob {
  jobId: string;
  agent: string;
  processedAt: number;
  outcome: unknown;
}

export class IdempotencyStore {
  private readonly db: Database.Database;

  constructor(dbPath?: string) {
    const resolved = dbPath ?? join(DEFAULT_DIR, 'processed_jobs.db');
    if (!dbPath) mkdirSync(DEFAULT_DIR, { recursive: true });
    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_jobs (
        job_id TEXT PRIMARY KEY,
        agent TEXT NOT NULL,
        processed_at INTEGER NOT NULL,
        outcome_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_processed_jobs_agent
        ON processed_jobs(agent, processed_at);
    `);
  }

  get(jobId: string): ProcessedJob | null {
    const row = this.db
      .prepare('SELECT job_id, agent, processed_at, outcome_json FROM processed_jobs WHERE job_id = ?')
      .get(jobId) as
      | { job_id: string; agent: string; processed_at: number; outcome_json: string }
      | undefined;
    if (!row) return null;
    let outcome: unknown;
    try {
      outcome = JSON.parse(row.outcome_json);
    } catch {
      outcome = null;
    }
    return {
      jobId: row.job_id,
      agent: row.agent,
      processedAt: row.processed_at,
      outcome,
    };
  }

  /**
   * Insert-only. Subsequent calls with the same jobId are silently ignored,
   * matching the "echo prior outcome" semantics in §A3'.
   */
  put(jobId: string, agent: string, outcome: unknown): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO processed_jobs (job_id, agent, processed_at, outcome_json) VALUES (?, ?, ?, ?)',
      )
      .run(jobId, agent, Date.now(), JSON.stringify(outcome));
  }

  close(): void {
    this.db.close();
  }
}
