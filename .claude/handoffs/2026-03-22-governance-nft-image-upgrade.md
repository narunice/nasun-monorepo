# Handoff: Governance Vote Proof NFT 이미지 커스터마이징

**생성**: 2026-03-22 18:00
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

Governance poll 투표 UI 개선 작업이 완료되었고, Lambda PACKAGE_ID 불일치 버그를 수정했습니다.
다음 단계로 Vote Proof NFT 이미지를 투표(프로포절)마다 다르게 설정할 수 있도록 Move 컨트랙트를 업그레이드해야 합니다.
**현재 진행중인 투표가 2026-03-25 17:07 (수요일)에 종료되므로, 그 이후에 컨트랙트를 업그레이드해야 합니다.**

## 완료된 작업

- [x] Lambda GOVERNANCE_PACKAGE_ID 수정 (dev + prod 모두 `0xc561...`로 업데이트)
- [x] common-stack.ts fallback 값도 `0xc561...`로 수정 (아직 커밋 안 됨)
- [x] Governance poll tweet card UX 전체 개선
- [x] useTwitterDisplayNames 훅 확장 (profiles Map + profileImageUrl)
- [x] Vote Results, VoteModal, ProposalItem에 프로필 이미지 + displayName 표시

## 미완료 작업 (투표 종료 후 진행)

- [ ] Move 컨트랙트 업그레이드: per-proposal NFT 이미지 지원
- [ ] common-stack.ts 변경 커밋 + CDK 배포
- [ ] 스테이징에서 투표 테스트 (Lambda 수정 후)

## 중요 컨텍스트

### 1. 왜 투표가 실패했는가

프론트엔드의 `VITE_GOVERNANCE_PACKAGE_ID`와 Lambda의 `GOVERNANCE_PACKAGE_ID`가 불일치했습니다.

| 구분 | 프론트엔드 | Lambda (수정 전) | Lambda (수정 후) |
|------|-----------|-----------------|-----------------|
| Package ID | `0xc561bf870182857c9b2c0ae7c0ad6366029efccafd31ef1e914260e4e24d5483` | `0x40a6c8b671ecea57cad48bc546b014c52e2753caa3f4d07aeb3c348b6c907353` | `0xc561...` (수정 완료) |

Lambda 환경변수는 `aws lambda update-function-configuration` 명령으로 직접 수정 완료.
CDK의 fallback 값은 `apps/nasun-website/cdk/lib/common-stack.ts:302`에서 수정했으나 아직 커밋/배포 안 됨.

### 2. NFT 이미지 변경 방법 (컨트랙트 업그레이드 필요)

**현재 상태**: NFT 이미지 URL이 Move 컨트랙트에 하드코딩됨

```
apps/nasun-website/contracts/governance/sources/multi_choice_proposal.move:244
```

```move
let url = new_unsafe_from_bytes(
    b"https://red-active-guanaco-484.mypinata.cloud/ipfs/bafkreidvwd65472yxlhr4vhoqxqugccpy6xgsat2mdb6vjznltodkxw4tu"
);
```

**목표**: 투표(프로포절)마다 다른 NFT 이미지를 사용

**접근 방법**: Sui Move에서는 기존 struct에 필드를 추가할 수 없으므로, 별도의 설정 객체를 만들어야 합니다.

**추천 아키텍처**:

```
NftImageConfig (shared object)
  - default_url: Url
  - overrides: Table<ID, Url>  // proposal_id -> custom image url
  - admin: address
```

- `set_nft_image(config, proposal_id, url, admin_cap)` - 관리자가 프로포절별 이미지 설정
- `vote_with_certificate` 함수에서 config를 참조하여 이미지 결정:
  - overrides에 해당 proposal_id가 있으면 해당 URL 사용
  - 없으면 default_url 사용

**이번 contest에 사용할 새 이미지**:
```
https://red-active-guanaco-484.mypinata.cloud/ipfs/bafybeidzf2ov7ymmnwgz4homflsz56ceze5lelybrqb35hcp3bnzf2ge5y
```

### 3. 진행중인 투표 정보

- **Proposal ID**: `0xe93387f6ed701c95ff3559b8ce30dbc8c31ba6d75867253fba0c531c05cf4742`
- **Title**: [contest] pick your favorite!
- **Expiration**: 2026-03-25 17:07:53 (수요일)
- **Network**: Nasun Devnet

### 4. 주의사항

- 컨트랙트 업그레이드 시 `vote_with_certificate` 함수 시그니처가 변경되면 기존 투표에 영향을 줄 수 있음
- NftImageConfig를 새 인자로 추가하면 함수 시그니처가 변경됨 -> 반드시 투표 종료 후 진행
- 업그레이드 후 PACKAGE_ID가 변경되면 프론트엔드 `.env` + Lambda 환경변수 모두 업데이트 필요
- AWS 계정 분리: dev(default profile), prod(nasun-prod profile)

## 핵심 파일 위치

| 파일 | 역할 |
|------|------|
| `apps/nasun-website/contracts/governance/sources/multi_choice_proposal.move` | NFT 이미지 URL 하드코딩 위치 (line 244) |
| `apps/nasun-website/cdk/lib/common-stack.ts` | Lambda 환경변수 설정 (line 302) |
| `apps/nasun-website/cdk/lambda-src/governance-api/src/index.ts` | Sponsor Lambda (ALLOWED_TARGETS, validateTxKind) |
| `apps/nasun-website/frontend/.env.staging` | 프론트엔드 PACKAGE_ID |
| `apps/nasun-website/frontend/.env.production` | 프론트엔드 PACKAGE_ID |
| `apps/nasun-website/frontend/src/features/governance/hooks/useMultiChoiceSponsoredVote.ts` | 프론트엔드 투표 트랜잭션 빌드 |
| `docs/smart-contracts.md` | Move CLI, 컨트랙트 배포 방법 참조 |

## 미커밋 변경 파일

- `apps/nasun-website/cdk/lib/common-stack.ts` - GOVERNANCE_PACKAGE_ID fallback 값 수정
- `apps/nasun-website/frontend/src/features/governance/components/MultiChoiceVoteModal.tsx` - linter 포맷 변경
- `apps/nasun-website/frontend/src/pages/protocol/ProposalDetailPage.tsx` - 스티키 바 제거, Vote 버튼 인라인으로 이동

## 즉시 다음 단계 (2026-03-25 17:07 이후)

1. 미커밋 변경 커밋 + push (`/ship`)
2. `nasun-website` 프론트엔드 스테이징 배포
3. 스테이징에서 투표 테스트 (Lambda PACKAGE_ID 수정이 적용되었는지 확인)
4. Move 컨트랙트 업그레이드 설계 (NftImageConfig shared object)
5. 컨트랙트 빌드 + devnet 배포
6. 새 PACKAGE_ID로 프론트엔드 `.env` + Lambda 환경변수 업데이트
7. CDK 재배포 (common-stack.ts 반영)
8. 프로덕션 프론트엔드 배포
