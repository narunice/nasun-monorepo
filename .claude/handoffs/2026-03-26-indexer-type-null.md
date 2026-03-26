# Handoff: Devnet Fullnode 인덱서 type null 문제 조사 및 해결

**생성**: 2026-03-26 04:30
**브랜치**: main
**이전 핸드오프**: 없음
**대상 프로젝트**: nasun-devnet (fullnode/인덱서 관련이므로 devnet 프로젝트에서 진행 권장)

## 현재 상태 요약

사용자 @ReopaahScrin (지갑 `0x7617...49f4`)이 NFT 3개를 보유하고 있으나 지갑과 Explorer 모두 2개만 표시. 지갑 측 페이지네이션 버그는 `fc15686a` 커밋으로 수정 완료(push됨). 그러나 근본 원인은 **Devnet fullnode의 인덱서가 `getOwnedObjects` 응답에서 type을 null로 반환**하는 문제.

## 완료된 작업

- [x] 지갑 `getOwnedNFTs()` 페이지네이션 fix (모든 페이지 순회, 커밋 `fc15686a`)
- [x] Explorer `getAddressInfo()` 페이지네이션 fix (이전 커밋 `c322d2de`)
- [x] 사용자 지갑 주소 확인 (DynamoDB UserProfiles 조회)
- [x] RPC로 온체인 객체 전수 조사 (58개 객체)
- [x] 인덱서 문제 원인 특정

## 미완료 작업

- [ ] Devnet fullnode 인덱서 DB 리셋 또는 fullnode 재시작
- [ ] 재시작 후 `getOwnedObjects`에서 type이 정상 반환되는지 검증
- [ ] (선택) Explorer에서 type null인 객체를 `multiGetObjects`로 fallback 조회하는 workaround

## 중요 컨텍스트

### 문제 상세

- `suix_getOwnedObjects`에서 `showType: true`를 요청해도 이 주소의 객체 58개 **전부** `type: null`로 반환
- `sui_multiGetObjects`로 개별 조회하면 type이 정상 반환
- 이는 인덱서의 object store 캐시 또는 인덱스가 깨진 상태를 의미

### 사용자 정보

| 항목 | 값 |
|------|-----|
| X 핸들 | @ReopaahScrin |
| 지갑 주소 | `0x761740037cc16689d5d779934574a396e3e7efb969556087ed63d173b59049f4` |
| UserProfiles identityId | `ap-northeast-2:6cb1e654-baaa-c396-654a-cfef2435460a` (Twitter), `ap-northeast-2:6cb1e654-ba67-c82c-937d-443307553d24` (Nasun Wallet) |

### 온체인 객체 현황 (총 58개)

| 타입 | 개수 |
|------|------|
| Coin (NASUN, NETH, NSOL, NBTC, NUSDC) | 53 |
| StakedSui | 2 |
| VoteProofNFT | 2 |
| MultiChoiceVoteProofNFT | 1 |

- NFT 3개 모두 온체인에 존재 (삭제/전송된 것 아님)
- 스크린샷에서 보인 "NFT Nasun G..." = VoteProofNFT, "NFT Should..." = MultiChoiceVoteProofNFT 중 하나

### 안전성 확인

- Fullnode 재시작은 합의에 영향 없음 (Fullnode는 합의 참여 안 함, Validator만 참여)
- RPC 서비스 일시 중단은 발생 (Explorer, 지갑 조회 등)
- 재시작 후 체크포인트 catch-up 필요

### 파일 위치 (이번 세션에서 수정한 파일)

- `packages/wallet/src/sui/nft.ts` - getOwnedNFTs() 페이지네이션 fix
- `packages/wallet/src/hooks/useNFTs.ts` - hook 간소화
- `packages/wallet/src/types/nft.ts` - 불필요 타입 제거
- `packages/wallet-ui/src/nft/NFTGallery.tsx` - limit 제거
- `packages/wallet-ui/src/connect/hooks/useConnectedViewData.ts` - cursor accumulation 제거

### Lambda 미커밋 변경 (별도 작업)

- `apps/nasun-website/cdk/lambda-src/zklogin-salt/src/index.ts` - race condition fix (PutCommand -> conditional + retry)
- `apps/nasun-website/cdk/lambda-src/link-account/index.ts` - zkLoginTableName env 추가

## 즉시 다음 단계

1. nasun-devnet 프로젝트에서 fullnode 프로세스 상태 확인 (`docs/infrastructure.md` 참조)
2. Fullnode 인덱서 DB 리셋 또는 fullnode 재시작
3. 재시작 후 RPC 테스트: `curl -s https://rpc.devnet.nasun.io -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"suix_getOwnedObjects","params":["0x761740037cc16689d5d779934574a396e3e7efb969556087ed63d173b59049f4",{"showType":true},null,5]}' | jq '.result.data[0].data.type'` - null이 아닌 실제 타입이 반환되면 해결
