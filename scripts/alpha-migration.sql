-- Nasun AI alpha · slot + waitlist 스키마 마이그레이션
--
-- WHEN: PR-2 배포 직전 1회. PR-1은 ALPHA_GATE_ENABLED=false 라 이 마이그레이션 없이도
--       chat-server가 정상 부팅 (defensive code로 schema 부재 처리).
-- WHERE: prod EC2 chat-server SQLite (/home/ec2-user/nasun-chat-server/data/chat.db).
-- HOW:
--   ssh ec2-user@43.200.67.52
--   sudo sqlite3 /home/ec2-user/nasun-chat-server/data/chat.db < /tmp/alpha-migration.sql
--   (scp이 먼저 필요)
--
-- IDEMPOTENT: 이 파일을 두 번 실행해도 안전하도록 모든 ALTER/CREATE는 IF NOT EXISTS
-- 또는 try/catch 패턴. SQLite는 `ALTER TABLE ADD COLUMN`에 IF NOT EXISTS가 없으므로,
-- 두 번 실행 시 "duplicate column name" 에러 발생 가능 — 정상.
--
-- ROLLBACK: SQLite 3.35+는 DROP COLUMN 지원. 운영 정책상 컬럼 drop은 권장 X.
-- 신규 컬럼은 nullable이고 신규 테이블은 잘못 사용해도 영향 없으므로 그대로 둘 것.

BEGIN;

-- 1) agent_keys 칼럼 4개 추가
--    expires_at: ms epoch, NULL = no TTL (santa-exempt)
--    slot_exempt: 1 = system cap에서 제외 (santa, admin)
--    warned_at: ms epoch when T+30h warning sent (NULL = 미발송)
--    paused_at: ms epoch when system pause was applied at T+36h (NULL = 정상)
ALTER TABLE agent_keys ADD COLUMN expires_at  INTEGER;
ALTER TABLE agent_keys ADD COLUMN slot_exempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_keys ADD COLUMN warned_at   INTEGER;
ALTER TABLE agent_keys ADD COLUMN paused_at   INTEGER;

-- 2) santa(0x3f2b...c9ee7bcf)를 slot_exempt 처리 — 시스템 cap 카운트 제외
UPDATE agent_keys
   SET slot_exempt = 1
 WHERE agent_address = '0x3f2b2d2ecd4535cee8bd29bdfc295049737fa455790093462bcbe497c9ee7bcf';

-- 3) alpha_waitlist 신설
CREATE TABLE IF NOT EXISTS alpha_waitlist (
  wallet_address    TEXT PRIMARY KEY,
  joined_at         INTEGER NOT NULL,
  status            TEXT    NOT NULL CHECK(status IN ('waiting','invited','expired')),
  invited_at        INTEGER,
  invite_expires_at INTEGER,
  miss_count        INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);

-- 4) cron_status 신설 — alpha-tick 의 last_run timestamp 저장 (PR-2에서 사용)
CREATE TABLE IF NOT EXISTS cron_status (
  name      TEXT PRIMARY KEY,
  last_run  INTEGER NOT NULL
);

-- 5) 인덱스 (cron 쿼리 + waitlist FIFO 순회용)
CREATE INDEX IF NOT EXISTS idx_agent_keys_expires
  ON agent_keys(expires_at)
 WHERE deleted_at IS NULL AND slot_exempt = 0 AND paused_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_fifo
  ON alpha_waitlist(status, joined_at);

COMMIT;

-- 검증 쿼리 (실행 후 수동 확인):
-- PRAGMA table_info(agent_keys);   -- 13 columns
-- SELECT slot_exempt FROM agent_keys WHERE agent_address='0x3f2b...';  -- 1
-- SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'alpha%';
-- SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';
