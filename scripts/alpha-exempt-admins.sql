-- Nasun AI alpha · admin + dev 영구 슬롯 점유
--
-- WHEN: 알파 게이트 ON (ALPHA_GATE_ENABLED=true) 전에 1회 실행.
--       admin@nasun.io 와 hybrida@gmail.com 두 계정이 항상 알파 테스트 가능하도록
--       각자의 agent_keys 행을 slot_exempt=1 + expires_at=NULL 로 표시.
--
-- PREREQ: 두 지갑 모두 agent_keys 행이 존재해야 함.
--   - admin@nasun.io: 지금 staging UI에서 agent 생성 후 실행
--   - hybrida@gmail.com: 이미 santa(0x3f2b...c9ee7bcf) 보유. 별도 개인 agent를
--     추가 생성한 경우 그 행도 자동 포함됨 (wallet_address 기준 UPDATE).
--
-- WHERE: prod EC2 chat-server SQLite
--   ssh ec2-user@43.200.67.52
--   scp scripts/alpha-exempt-admins.sql ec2-user@43.200.67.52:/tmp/
--   sudo sqlite3 /home/ec2-user/nasun-chat-server/data/chat.db < /tmp/alpha-exempt-admins.sql
--
-- IDEMPOTENT: 두 번 실행해도 안전 (이미 1이면 no-op).
-- ROLLBACK: UPDATE agent_keys SET slot_exempt=0, expires_at=<원하는 값> WHERE wallet_address IN (...)

BEGIN;

-- 사전 점검: 두 지갑 행 존재 여부 (결과는 sqlite3 stdout 으로)
SELECT 'PRE-CHECK rows:' AS marker,
       wallet_address, agent_address, slot_exempt, expires_at, paused_at
  FROM agent_keys
 WHERE wallet_address IN (
   '0xb649203f52fddca7194cc85ed14d0bc719ccc4d958393f2f23ee3ee58bec43ed',
   '0x683aaf5da378a8beb292cbb8d8a6f63100e87cafb4f850975aa7efdf416d7d88'
 );

-- admin@nasun.io
UPDATE agent_keys
   SET slot_exempt = 1,
       expires_at  = NULL,
       paused_at   = NULL
 WHERE wallet_address = '0xb649203f52fddca7194cc85ed14d0bc719ccc4d958393f2f23ee3ee58bec43ed';

-- hybrida@gmail.com (santa + 신규 개인 agent 모두 catch)
UPDATE agent_keys
   SET slot_exempt = 1,
       expires_at  = NULL,
       paused_at   = NULL
 WHERE wallet_address = '0x683aaf5da378a8beb292cbb8d8a6f63100e87cafb4f850975aa7efdf416d7d88';

-- 사후 검증: slot_exempt=1 행 전체 (santa + admin + (optionally hybrida personal))
SELECT 'POST-CHECK exempt rows:' AS marker,
       wallet_address, agent_address, slot_exempt, expires_at, paused_at
  FROM agent_keys
 WHERE slot_exempt = 1
 ORDER BY wallet_address;

-- 카운트 검증: 일반 사용자 활성 agent 수 (cap 카운트 대상)
SELECT 'POST-CHECK non-exempt active:' AS marker,
       COUNT(*) AS n
  FROM agent_keys
 WHERE deleted_at IS NULL
   AND slot_exempt = 0
   AND paused_at IS NULL;

COMMIT;
