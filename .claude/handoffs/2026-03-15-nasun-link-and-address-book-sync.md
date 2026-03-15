# Handoff: Nasun Link Claim + Address Book Wallet-Signature Auth

**생성**: 2026-03-15 21:30 (업데이트: 2026-03-15)
**브랜치**: feat/address-book-wallet-auth
**이전 핸드오프**: 없음

## 현재 상태 요약

Nasun Link(URL 기반 토큰 배포) 기능은 구현 완료 및 main에 커밋/push 됨. 주소록 서버 동기화를 **지갑 서명 기반 세션 토큰 인증**으로 전환하는 작업이 `feat/address-book-wallet-auth` 브랜치에서 코드 구현 완료 상태. 빌드 검증 대기 중.

## 완료된 작업

### Nasun Link (main에 커밋됨)
- [x] encoding.ts, generator.ts, claim.ts, ClaimPage.tsx
- [x] Post-claim CTA, 테스트 83개

### 주소록 sync: 지갑 서명 기반 인증 (feat/address-book-wallet-auth)
- [x] wallet-api Lambda에 @mysten/sui 추가
- [x] 서명 검증 유틸 (signature.ts) - verifySuiPersonalSignature, verifyZkLoginEphemeralSignature
- [x] auth.ts에 issueAddressBookToken + verifyAddressBookToken 추가 (기존 verifyToken 미수정)
- [x] CDK: AddressBooks 테이블 (PK: walletAddress, SK: recordType, TTL) + memorySize 256 + 환경변수
- [x] challenge/verify 엔드포인트 (index.ts) - nonce 생성, 원자적 삭제, 서명 검증, JWT 발급
- [x] addressBook 핸들러를 walletAddress 기반으로 변경 (AddressBooks 테이블 사용)
- [x] AddressBookSessionManager 클래스 (challenge-sign-verify, 토큰 캐시, mutex 패턴)
- [x] useAddressBookSync 훅 identityId -> userId rename
- [x] 패키지 exports 업데이트
- [x] nasun-website App.tsx 세션 토큰 기반으로 전환

## 미완료 작업

- [ ] 전체 빌드 검증 (pnpm build)
- [ ] Secrets Manager에 addressBookJwtKey 필드 수동 추가 (또는 첫 Lambda 실행 시 자동 생성)
- [ ] CDK 배포 (AddressBooks 테이블 + wallet-api Lambda 업데이트)
- [ ] Staging E2E 검증
- [ ] Production 배포
- [ ] 다른 앱(pado, explorer, baram)에 sync 설정 추가 (별도 PR)

## 중요 컨텍스트

### 결정사항
- **verifyToken 미수정**: 기존 register/list/remove 엔드포인트 보호. address-book 전용 verifyAddressBookToken 별도 함수.
- **JWT signing secret 분리**: wallet-proof secret JSON의 `addressBookJwtKey` 필드. cross-protocol attack 방지.
- **AddressBooks 테이블에 nonce 저장**: SuiAuthNonces 공유하지 않음. PK 충돌/IAM 권한 문제 회피.
- **zkLogin walletAddress 바인딩**: challenge 시 walletAddress 저장, verify 시 일치 확인. 사칭 방지.
- **세션 토큰 방식**: 매 요청 서명 대신 1회 서명으로 JWT 획득 (1h TTL). UX 보존.
- **nasun-website만 먼저 전환**: 다른 앱은 별도 PR로 점진적 적용.

### 주의사항
- auth.ts의 getAddressBookJwtKey()는 첫 실행 시 Secrets Manager에 키를 자동 생성. PutSecretValue 권한 필요 (CDK에 추가됨).
- zkLogin 사용자는 signWithEphemeralKey() 사용. SignerAdapter 인터페이스에 없으므로 타입 캐스팅 필요.
- AddressBooks 테이블의 nonce는 TTL로 자동 삭제되지만, DynamoDB TTL 삭제는 최대 48시간 지연될 수 있음. expiresAt 필드로 애플리케이션 레벨에서도 만료 확인.

### 파일 위치

**Backend (wallet-api Lambda):**
- `apps/nasun-website/cdk/lambda-src/wallet-api/src/utils/signature.ts` - 서명 검증
- `apps/nasun-website/cdk/lambda-src/wallet-api/src/utils/auth.ts` - JWT 발급/검증
- `apps/nasun-website/cdk/lambda-src/wallet-api/src/handlers/addressBook.ts` - CRUD + challenge/nonce
- `apps/nasun-website/cdk/lambda-src/wallet-api/src/index.ts` - 라우터
- `apps/nasun-website/cdk/lib/common-stack.ts` - CDK 인프라

**Frontend (wallet package):**
- `packages/wallet/src/core/addressBookSession.ts` - 세션 토큰 매니저
- `packages/wallet/src/core/addressBookSync.ts` - 서버 통신 (변경 없음)
- `packages/wallet/src/hooks/useAddressBookSync.ts` - React 훅 (userId rename)
- `packages/wallet/src/index.ts` - exports

**App Integration:**
- `apps/nasun-website/frontend/src/App.tsx` - AddressBookSyncSetup 컴포넌트

### 플랜 파일
- `~/.claude/plans/clever-jumping-flask.md` - 전체 구현 계획 (v2, 리뷰 2회 거침)

## 즉시 다음 단계

1. 전체 빌드 결과 확인 (pnpm build 실행 중)
2. CDK 배포 준비 (AddressBooks 테이블 + Lambda 업데이트)
3. Staging에서 E2E 검증 (challenge -> sign -> verify -> sync)
