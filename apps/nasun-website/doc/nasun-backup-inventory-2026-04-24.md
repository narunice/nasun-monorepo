# Nasun Backup Inventory — W0 실측 결과

실측일: 2026-04-24
관련 플랜: [v4](~/.claude/plans/2026-04-24-nasun-data-preservation-v4.md)
실측 주체: Claude (nasun-cli IAM user profile)

---

## Summary

| 항목 | v4 가정 | 실측 결과 | 임팩트 |
|---|---|---|---|
| 백업 주체 | EC2 cron | **로컬 WSL `2026PC` cron** | 플랜 전제 수정: IAM instance role 불필요, 로컬 profile 유지 |
| 백업 경로 | `/home/naru/nasun-backups/dynamodb/*.json.gz` | ✅ 실존, 매일 갱신 | 플랜 그대로 |
| monorepo `_backup/` | legacy | ✅ 2026-04-05 이후 stale | 플랜 그대로 (무시) |
| S3 버킷 Versioning | Enabled | ✅ Enabled | OK |
| S3 Lifecycle | **365일 만료 룰 존재** | ✅ 확인됨 (Filter `{}` 전체 버킷) | **치환 필수**, 안 하면 1년 뒤 삭제 |
| S3 암호화 | SSE-S3 | ✅ AES256 (SSE-S3) | SSE-KMS 격상 작업 대상 |
| Bucket Policy | 없음 | ✅ 없음 | 신규 작성 |
| Object Lock | 없음 | ✅ 없음 (기존 버킷 불가) | Deny Delete policy로 대체 |
| IAM instance role | EC2에 있어야 | **로컬 주체라 해당 없음** | `nasun-cli` IAM user + profile 유지 |
| SQLite WAL | 가정 | ✅ 둘 다 WAL mode | online backup 가능 |
| SQLite 크기 | 가정 | chat.db 20MB, leaderboard.db 2.8GB | 압축 후 ~900MB/일 |
| EC2 `/` 용량 | 가정 | 20GB / 11GB free (53%) | `.backup` 생성 가능, pipe-through 권장 |
| EC2 `/tmp` | 2GB tmpfs | ✅ 1.9GB (leaderboard.db 미수용) | pipe-through 확정 |
| sqlite3 CLI | 있어야 | ✅ 3.40.0 | OK |
| Pado 점수 감소율 | 주 0~1건 가정 | **하루 25건 평균 발생** | G3 필요성 격상 (여전히 백로그이나 재개 신호) |
| adjust-score 호출 | 드물 것 가정 | 주간 ~1440건 | 음수 비율 재조사 필요, G9 백로그 유지 |
| UserProfiles PITR | 미확인 | ✅ **ENABLED** (35일) | A3 보류 정당화 |
| UserWallets PITR | 미활성 가정 | ✅ **ENABLED** (35일) | **A2도 이미 활성화됨, 작업 불필요** |
| ZkLoginUsers PITR | ENABLED | ✅ ENABLED | OK |
| leaderboard-v3-* 5개 PITR | prod=on | ✅ 전부 ENABLED | OK |
| Accounts / SeasonAccounts | 존재 가정 | ❌ **테이블 없음** (오해) | 실제는 `leaderboard-v3-season-accounts`. 플랜 용어 수정 |

---

## W0-1: 실제 백업 cron (로컬 WSL)

**주체**: user `naru` on `2026PC` (WSL)
**Crontab** (`crontab -l`):

| 시간 (UTC) | 작업 | 출력 경로 |
|---|---|---|
| 00:00 daily | AWS key age check | - |
| 01:00 daily | DDB scan: ZkLoginUsers, UserProfiles, UserWallets | `/home/naru/nasun-backups/dynamodb/${table}-${YYYYMMDD}.json.gz` |
| 01:05 daily | DDB scan: ZkLoginUsers salt projection | `zklogin-salts-${YYYYMMDD}.json.gz` |
| 01:10 daily | DDB scan: leaderboard-v3-snapshots | `leaderboard-v3-snapshots-${YYYYMMDD}.json.gz` |
| 02:00 Sunday | DDB create-backup (on-demand) × 15 tables | DDB native backup |
| 03:00 daily | Retention: `_backup/dynamodb/` 30d delete + `monorepo/_backup/` 14d delete | - |
| 04:00 1st of month | DDB create-backup: nasun-nft-ownership | DDB native |
| 12:00 daily | NFT snapshot local backup | `nft-snapshots/backup.log` |
| 22:00 daily | WSL home backup → D:\wsl-mirror | - |

**모든 명령**: `aws ... --profile nasun-prod --region ap-northeast-2` (IAM user `nasun-cli`)

**파일 분포**:
- `/home/naru/nasun-backups/dynamodb/`: 최신 2026-04-24, 활성 중
- `/home/naru/my_apps/nasun-monorepo/_backup/`: 2026-04-05 이후 정지 (legacy, 이번 계획에서 제외)

---

## W0-2: S3 버킷 `nasun-leaderboard-backups-466841130170`

**Versioning**: Enabled ✓

**기존 Lifecycle** (단일 룰, Filter `{}` = 전체 버킷):
```json
{
  "ID": "transition-to-glacier-then-delete",
  "Status": "Enabled",
  "Expiration": {"Days": 365},
  "Transitions": [{"Days": 90, "StorageClass": "GLACIER"}],
  "NoncurrentVersionExpiration": {"NoncurrentDays": 90}
}
```
→ 객체 올리면 90일 뒤 Glacier, **365일 뒤 삭제**. 5년 요구와 정면 충돌.

**Encryption**: SSE-S3 (AES256), BucketKey enabled. SSE-KMS 없음.

**Bucket Policy**: 없음

**Object Lock**: 없음 (기존 버킷이라 신규 활성화 불가, Deny Delete policy로 대체 예정)

**기존 prefix**:
- `2026-04-12/` (뭐지?)
- `audit/`
- `node-3-daily/` (devnet 노드 관련 추정)
- `twitter-secondary-cleanup/`

**우리가 쓸 prefix**: `daily/`, `sqlite/` (기존과 충돌 없음)

---

## W0-3: AWS profile 권한

**사용자**: `arn:aws:iam::466841130170:user/nasun-cli`
**승인된 권한**:
- ✅ S3 PutObject / DeleteObject (probe 성공)
- ✅ SNS ListTopics
- ❌ KMS ListKeys (권한 없음)
- ❌ IAM ListAttachedUserPolicies (권한 없음)

**기존 SNS 토픽 재사용 가능**:
- `arn:aws:sns:ap-northeast-2:466841130170:nasun-monitoring-alerts`
- `arn:aws:sns:ap-northeast-2:466841130170:nasun-prod-alerts`

**KMS CMK 작업 불가 문제**:
- `nasun-cli`는 KMS 권한 없음
- CMK 생성·사용은 관리자(root 또는 별도 admin 사용자)가 수행해야 함
- W1-D1에서 사용자에게 CMK 생성 요청 필요 (또는 SSE-S3 유지 결정)

---

## W0-4/5/6: chat-server EC2 (43.200.67.52)

```
/home/ec2-user/nasun-chat-server/data/
├── chat.db           20M   WAL mode
├── chat.db-shm       32K
├── chat.db-wal       4.2M
├── leaderboard.db    2.8G  WAL mode
├── leaderboard.db-shm ...
├── leaderboard.db-wal ...
└── chat.db.backup.*  (수동 백업 이력 있음)
```

**디스크**:
- `/`: 20G total, 11G free (47% used) — 2.8GB `.backup` 작성 가능하나 여유 빠듯
- `/tmp`: 1.9GB tmpfs — **leaderboard.db 수용 불가**

**결론**: **pipe-through 설계 확정** (`sqlite3 .backup /dev/stdout | gzip | aws s3 cp -`). 임시파일 없음.

**sqlite3 CLI**: `/usr/bin/sqlite3 3.40.0` ✓

---

## W0-7: Pado trader_points 감소 발생률 (CRITICAL)

**조사 쿼리**: `points_snapshots`에서 같은 address의 `LAG(total_points)` 비교, 최근 8일

| snapshot_date | 감소한 address 수 |
|---|---|
| 2026-04-18 | 5 |
| 2026-04-17 | 35 |
| 2026-04-16 | 36 |
| 2026-04-15 | 33 |
| 2026-04-14 | 38 |
| 2026-04-13 | 28 |
| 2026-04-12 | 24 |
| 2026-04-11 | 10 |

**평균 ~25건/일**. `trader_points.total_points`가 `trader_points_weekly`와 함께 REPLACE 패턴으로 운영되어 **매일 수십 명의 사용자 점수가 전일 대비 감소**. memory 불변식 (monotonic increase)이 이미 만성적으로 위반.

**영향**:
- G3 (max_total_points) 백로그 재개 시그널 **확인됨**
- 단, 이 감소가 **버그인지 feature인지 사용자 판단 필요**:
  - pnl 편입 시 points_from_pnl 음수 가능 → 총점 감소 (feature?)
  - REPLACE 로직의 의도하지 않은 재계산 (bug?)

**W1 스코프 결정**: 여전히 G3 백로그 (W1은 G1+G5만). 별도 사용자 질문 후 G3 재설계 sprint 진행 권고.

---

## W0-8: adjust-score 호출 빈도

**로그 그룹**: `/aws/lambda/nasun-leaderboard-v3-adjust-score`
**최근 30일 invocations**:
- 2026-04-01 ~ 04-07: 2541회
- 2026-04-08 ~ 04-14: 338회

**음수 amount 비율**: `@message like /amount/` 쿼리 0건 — 로그 포맷 불일치. 페이로드 분석 추가 필요.

**결론**: 호출 빈도는 유의미(주 수백~수천 건)하나 음수 비율 미확인. **G9 백로그 유지**, 추가 조사는 G3 재설계 시 함께 진행.

---

## W0-9: UserProfiles CDK 원본 + PITR 상태

**UserProfiles CDK 정의 검색 결과**:
- `grep "new dynamodb.Table" | grep -i userprofile` → **0건**
- 모든 CDK stack은 `fromTableName`으로 import만
- **결론**: 테이블은 CDK 외부(수동/legacy CloudFormation)에서 생성

**PITR 상태 (prod 실측)**:

| 테이블 | PITR | Earliest restorable |
|---|---|---|
| `ZkLoginUsers` | ✅ ENABLED | - |
| `UserProfiles` | ✅ ENABLED | 2026-04-05 (35일 창) |
| `UserWallets` | ✅ ENABLED | - |
| `leaderboard-v3-snapshots` | ✅ ENABLED | - |
| `leaderboard-v3-accounts` | ✅ ENABLED | - |
| `leaderboard-v3-seasons` | ✅ ENABLED | - |
| `leaderboard-v3-posts` | ✅ ENABLED | - |
| `leaderboard-v3-season-accounts` | ✅ ENABLED | - |
| `Accounts` | ❌ **Table not found** | N/A |
| `SeasonAccounts` | ❌ **Table not found** | N/A |

**중대 교정**:
1. **A2/A3 작업 불필요** — UserWallets/UserProfiles PITR 이미 활성화됨. v4의 "보류" 결정이 오히려 **의미 없음**. 이미 커버됨
2. **`Accounts`/`SeasonAccounts` 테이블 존재하지 않음** — 플랜 여러 곳에서 가정했던 이름 틀림. 실제 ecosystem points 관련 테이블은 `leaderboard-v3-season-accounts` (PK `SEASON#...#ACCOUNT#...`, SK `SCORE`)

---

## v4 플랜 필수 수정 사항

| 항목 | v4 원안 | W0 결과 반영 |
|---|---|---|
| 백업 주체 | EC2 crontab | **로컬 WSL crontab** (기존 그대로 활용) |
| AWS credential | EC2 IAM instance role | **로컬 `nasun-cli` IAM user profile** (기존) |
| G5 SQLite 백업 방식 | EC2 cron에서 직접 S3 업로드 | **로컬에서 SSH pull + gzip + S3 업로드** (로컬 허브와 통일) |
| SNS 신규 생성 (A8) | `nasun-backup-alarm` 신규 | **기존 `nasun-monitoring-alerts` 재사용** |
| KMS CMK (A6) | `nasun-cli`가 생성 | **`nasun-cli`에 KMS 권한 없음** → 관리자 작업 필요 또는 SSE-S3 유지 결정 |
| A2 UserWallets PITR | 승인 후 보류 | **이미 활성화됨**, 작업 항목 자체 제거 |
| A3 UserProfiles PITR | 승인 후 보류 | **이미 활성화됨**, 작업 항목 자체 제거 |
| G3 Pado monotonic | 백로그 (W0-7로 판단) | **감소 25건/일 확인**, 백로그 유지하나 재개 신호 강함 |
| G9 adjust-score | 백로그 | 호출은 활발(주 수천), 음수 비율 미확인, 백로그 유지 |

---

## 다음 단계

**W0 GO/NO-GO 판단**:
- ✅ 핵심 실측 완료, W1 착수 가능
- ⚠ **KMS CMK 권한 문제**가 단 하나 남은 블로커. 두 가지 선택:
  1. 사용자가 관리자 세션에서 CMK 생성 + `nasun-cli` 사용 권한 부여
  2. SSE-S3 유지 (AES256 기본 암호화, 기존 버킷과 동일). PII 보호는 충분 (AWS 관리형 키)

**권고**: **SSE-S3 유지**. 이유:
- 기존 버킷 기본 암호화가 이미 SSE-S3로 전체 객체 커버
- KMS CMK는 per-request 비용($0.03/10K) + CMK 월 $1 추가
- PII 보호 수준은 SSE-S3로 충분 (AWS KMS 관리형 키가 내부적으로 사용됨)
- SSE-KMS 강제 정책은 KMS 권한 없는 `nasun-cli`가 PutObject 자체 불가로 이어져 백업 중단

W1-D1 수정판: **KMS CMK 생성 생략, 기존 SSE-S3 유지, bucket policy는 Deny Delete만 추가**.
