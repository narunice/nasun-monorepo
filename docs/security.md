# Security Reference

> Last Updated: 2026-05-18

## 봇 방어 정책 (2026-05-16 영구 변경)

**Cloudflare Turnstile 완전 제거**. nasun/pado/chat-server 모든 endpoint에서 Turnstile 위젯/검증 코드 삭제. 봇 방어는 **`banned_users` shadow-ban 단독** 으로 처리.

- 신규 가입/상호작용 차단 게이트: chat-server cold-start gate (fail-open hole 차단)
- 의심 패턴 탐지: nginx access.log + DynamoDB UserProfiles + 행동 분석 (등록 시각·IP ASN·mission 패턴)
- 적발 후 처리: `ban-users.ts --identity-ids` 또는 `--identity-ids-file`로 batch ban. PG `banned_users` + DDB UserProfiles 동시 갱신 필수

> **Why Turnstile 제거**: 정상 사용자(특히 KT/SKT/LGU+ residential ISP) preflight/challenge 실패가 누적되면서 false positive 비율이 봇 차단 효과를 압도. shadow-ban + 행동 분석이 false positive 0에 가깝게 운영 가능함이 5/12 SpeedyPage 봇팜 적발 사례로 검증됨 (project_2026_05_12_speedypage_bot_ban.md, project_chat_turnstile_removed.md).

> **Why IP-deny는 datacenter ASN만**: residential ISP(KT/SKT/LGU+/SHATEL) IP는 사용자 본인 가능성이 높음. nginx 로그에서 한국 KT IP가 high RPS로 보여도 사용자 본인일 수 있음 (reference_dev_external_ip.md). datacenter ASN(Latitude.sh/Datacamp/OVH/Hetzner/DO/EC2)만 IP-deny 후보, residential은 계정 단위 ban으로 대응.

## WAF (CloudFront)

상세 운영은 [infrastructure.md §WAF](infrastructure.md#aws-waf-ddos-protection) 참조. 핵심만:

- **3-rule**: AllowTrustedIPs, DenyKnownScanners, RateLimit8000Per5Min
- **OPTIONS preflight 제외 필수**: `scopeDownStatement`에 `NOT(method=OPTIONS)`. 누락 시 admin/SPA 페이지가 차단 (feedback_waf_exclude_options_preflight.md)
- **Country blacklist**: KP, CU, SY
- **8000/5min cap의 근거**: 2000은 SPA 다중 endpoint 호출 + CloudFront viewer→edge IP fanout과 충돌해 정상 차단 유발. 5/5 collateral block 사고 후 5000 → 8000 안정화 (project_2026_05_05_waf_collateral_block.md)

## 지갑 암호화

- **암호화**: Web Crypto API (AES-256-GCM + PBKDF2 100,000 iterations)
- **키 저장**: localStorage에 암호화된 상태로 저장
- **메모리 관리**: 개인키 사용 후 메모리에서 제거

## Rate Limiting (비밀번호 brute force 방지)

- 8회 연속 실패 → 30초 lockout
- 12회 연속 실패 → 5분 lockout
- 16회 이상 실패 → 30분 lockout
- 성공 시 카운터 초기화
- localStorage에 저장되어 새로고침해도 유지

## Social Provider Profile Creation Control

### 배경

2026-03-30 발견: `POST /user-profile` API에 provider 제한이 없어, Google OAuth로 Cognito JWT를 취득한 뒤 직접 API를 호출하면 지갑 없이 Google/Twitter-only 프로필을 생성할 수 있었음. 프론트엔드 차단(2026-03-12, 커밋 364eae1a)만으로는 curl/스크립트를 통한 직접 호출을 막을 수 없었음.

### 적용된 방어 (2026-03-30)

1. **`get-user-profile` Lambda POST**: provider blocklist 적용
   - `Google`, `Twitter` provider로 직접 프로필 생성 시 403 반환
   - 대소문자 정규화 (`toLowerCase().trim()`)

2. **`link-account` Lambda**: secondary 프로필 자동 생성
   - Account linking 시 secondary 프로필이 없으면 Lambda 내부에서 직접 DynamoDB에 생성
   - `linkedToPrimaryId`를 PutCommand에 원자적으로 포함하여 고아 프로필 방지
   - `ConditionExpression: 'attribute_not_exists(identityId)'`로 race condition 처리

3. **프론트엔드 AuthProvider**: `ensureUserProfile` guard 제거
   - `ensureUserProfile` 실패해도 `linkAccounts`로 진행 (best-effort 패턴)
   - secondary profile 메타데이터를 `linkAccounts` 요청에 포함

### UserProfiles 프로필 생성 경로 (전수 조사)

| 경로 | 안전 여부 | 이유 |
|------|----------|------|
| auth-metamask (verify) | 안전 | walletAddress 필수 인자 |
| auth-sui (connect-verify) | 안전 | walletAddress 필수 인자 |
| get-user-profile POST | 안전 | Google/Twitter provider blocklist |
| link-account (자동 생성) | 안전 | linkedToPrimaryId 원자적 포함 |
| auth-twitter callback | 안전 | 프로필 미생성 (주석으로 명시적 차단) |

### 고아 프로필 정리 (2026-03-30)

- Google-only 86건 + Twitter-only 32건 = 118건 삭제
- 식별 조건: `provider=Google/Twitter AND attribute_not_exists(walletAddress) AND attribute_not_exists(linkedToPrimaryId) AND (attribute_not_exists(linkedAccounts) OR size(linkedAccounts)=0)`
- 백업: `_tmp/orphan-profiles-2026-03-30.json`, `_tmp/userprofiles-backup-2026-03-30.json`

## zkLogin

Google OAuth 기반 ZK proof 인증:

- Salt 관리 Lambda (AWS)
- Ephemeral keypair 생성
- ZK proof 서명
