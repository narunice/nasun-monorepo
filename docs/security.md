# Security Reference

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
