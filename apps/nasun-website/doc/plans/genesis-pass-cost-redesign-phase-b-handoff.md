# Genesis Pass Ownership 재설계 — Phase B 핸드오프

**작성**: 2026-05-03
**현재 상태**: Phase A ship 완료. Phase B 착수 대기.
**전체 플랜**: `/home/naru/.claude/plans/adaptive-hopping-platypus.md`

---

## 0. 배경 한 줄

이더리움 메인넷 Genesis Pass(`0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1`) 소유 추적이 wallet-by-wallet polling이라 Alchemy 청구가 월 16만원 이상. **Phase A**(activate fallback의 leak)는 차단됨. **Phase B**는 daily snapshot 자체를 holder-centric으로 재작성해 비용을 free tier 안으로 떨어뜨린다.

---

## 1. Phase A 완료 내역 (이미 ship됨)

**Commit**: `ca1eca12 perf(nasun-website): cut Alchemy CU per activate fallback by ~95%`
**배포**: 2026-05-03 prod EcosystemStack + NftSnapshotStack UPDATE_COMPLETE
**계정**: prod 466841130170

### 변경 파일

- 신규 [apps/nasun-website/cdk/lambda-src/ecosystem-api/handler/src/eth-rpc.ts](../../cdk/lambda-src/ecosystem-api/handler/src/eth-rpc.ts)
  - `getErc721Balance(wallet, contract)` — eth_call balanceOf, 26 CU
- 수정 [apps/nasun-website/cdk/lambda-src/ecosystem-api/handler/src/index.ts](../../cdk/lambda-src/ecosystem-api/handler/src/index.ts)
  - `fetchAndPersistOwnership`: `getNFTsForOwner` (480 CU) → `getErc721Balance` (26 CU). negative cache 영구화. 기존 row holdings와 merge하여 다른 컬렉션 보존. `lastUpdatedAt` 추가.
  - `isStaleOnDemandMiss(record, contract)`: ondemand cache가 요청 컨트랙트를 포함하지 않고 10분 초과 시 true → activate path가 재조회하여 신규 buyer 차단 방지.
  - `activateEthNft`: `if (!walletRecord || isStaleOnDemandMiss(...))`로 refresh 트리거.
- 수정 [apps/nasun-website/cdk/lambda-src/nft-snapshot/src/eth-collector.ts](../../cdk/lambda-src/nft-snapshot/src/eth-collector.ts)
  - `cleanupStaleLatestRecords`: `source = 'alchemy-ondemand' AND totalNftCount = 0 AND lastUpdatedAt > now-24h`인 행은 보존 (negative cache TTL).

### Phase A의 한계

- **여전히 daily eth-collector가 등록 사용자의 모든 EVM 지갑을 polling.** 이 부분이 비용의 99%. → Phase B의 대상.
- ecosystem-api fallback은 negative cache + freshness window 덕에 거의 호출되지 않음. 실측 모니터링은 Alchemy Dashboard의 일별 CU 추이 (1주 이내 free tier 30M 안으로 떨어져야 함).

---

## 2. Phase B 목표

**daily eth-collector를 holder-centric으로 재작성.** 결과: 비용 16만원/월 → 거의 0원. latency는 그대로 24h(Phase B의 책임 아님).

### 핵심 전환

| 항목 | 현재 (Phase A 후) | Phase B 후 |
|---|---|---|
| 호출 패턴 | N users × `getNFTsForOwner` (480 CU each) | M contracts × `getOwnersForContract` (480 CU each) |
| daily CU | N × 480 ≈ 수천만 | M × 480 ≈ 수천 |
| 출력 schema | `ETH#LATEST` PK, `WALLET#<addr>` SK, `holdings[]`, `totalNftCount`, `source` | **변경 없음** (consumer 무변경) |
| consumer 영향 | 없음 — 동일 `ETH#LATEST` row를 그대로 씀 | 없음 |

### 제약

- ownership-verifier, ecosystem-api activate, genesis-pass/check Lambda, chat-server 모두 **무변경**으로 동작해야 한다 (schema 호환).
- Phase A의 negative cache 보존 로직(`alchemy-ondemand` + totalNftCount=0 + 24h TTL)을 깨지 말 것.

---

## 3. Phase B 구현 가이드

### 3.1 변경 파일

- 수정: [apps/nasun-website/cdk/lambda-src/nft-snapshot/src/eth-collector.ts](../../cdk/lambda-src/nft-snapshot/src/eth-collector.ts) — handler 본체 재작성
- 참조 (재사용 패턴): [apps/nasun-website/cdk/lambda-src/nft-snapshot/scripts/verify-gp-holders.ts](../../cdk/lambda-src/nft-snapshot/scripts/verify-gp-holders.ts) — `getOwnersForContract` 페이지네이션 + Alchemy 호출 패턴
- 그대로 유지: [apps/nasun-website/cdk/lib/nft-snapshot-stack.ts](../../cdk/lib/nft-snapshot-stack.ts) — 메모리/timeout은 holder count가 1만 미만이면 현 256MB/15min로 충분. 검토만.
- 그대로 유지: [apps/nasun-website/cdk/lambda-src/nft-snapshot/src/types.ts](../../cdk/lambda-src/nft-snapshot/src/types.ts) — `EthOwnershipRecord`, `EthNftHolding` 등 schema. 필요 시 `holders` 관련 헬퍼 타입만 추가.
- 그대로 유지: [apps/nasun-website/cdk/lambda-src/nft-snapshot/src/ownership-verifier.ts](../../cdk/lambda-src/nft-snapshot/src/ownership-verifier.ts) — 전혀 손대지 말 것.

### 3.2 새 흐름

```
1. handler():
   a. getEnabledCollections() → ETH 체인 컬렉션만 필터
   b. getUserEthWallets() → 등록된 사용자 EVM 지갑 Set (소문자)
   c. 각 컬렉션에 대해:
      i. getOwnersForContract(contract, withTokenBalances=true) 페이지네이션 수집
         → Map<wallet, tokenIds[]>
      ii. 등록 사용자 지갑 Set과 교집합
   d. wallet → holdings[] 로 reshape (한 wallet이 여러 컬렉션 보유 시 holdings 배열에 entry 추가)
   e. totalNftCount > 0인 wallet만 ETH#LATEST에 BatchWriteItem
   f. cleanupStaleLatestRecords(currentWalletSks) — Phase A 보존 로직 그대로
   g. META#ETH#<date> snapshot 메타 기록 (기존 패턴)
2. 또한 pk = ETH#<today> 일별 백업 record도 기존처럼 작성 (ownership-verifier가 이걸 기준으로 검증)
```

### 3.3 Alchemy 호출 헬퍼

`verify-gp-holders.ts`의 `getAllOnChainHolders` 패턴을 거의 그대로 차용:
```ts
// pseudocode
async function getContractOwners(contract: string): Promise<Map<string, string[]>> {
  const owners = new Map<string, string[]>();
  let pageKey: string | undefined;
  do {
    const url = `${ALCHEMY_BASE_URL}/${ALCHEMY_API_KEY}/getOwnersForContract?` +
      new URLSearchParams({
        contractAddress: contract,
        withTokenBalances: 'true',
        ...(pageKey && { pageKey }),
      });
    const res = await fetch(url, { signal: AbortSignal.timeout(ALCHEMY_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
    const data = await res.json() as {
      owners: Array<{ ownerAddress: string; tokenBalances: Array<{ tokenId: string; balance: string }> }>;
      pageKey?: string;
    };
    for (const o of data.owners) {
      const addr = o.ownerAddress.toLowerCase();
      const tokenIds = o.tokenBalances.map(tb => tb.tokenId);
      const existing = owners.get(addr) ?? [];
      owners.set(addr, [...existing, ...tokenIds]);
    }
    pageKey = data.pageKey;
  } while (pageKey);
  return owners;
}
```

3회 retry + exponential backoff (현재 eth-collector 패턴 동일).

### 3.4 위험 요소

1. **Phase A negative cache와의 상호작용**: holder-centric 결과에 nasun 사용자 X가 없으면 (=GP 미보유), Phase A가 만든 `alchemy-ondemand` zero row를 cleanup이 24h 보존 → 의도대로. holder X가 GP 보유 후 등록만 안 되어 있으면 holders ∩ users 교집합에서 빠짐 → 영향 없음.
2. **getOwnersForContract `withTokenBalances=true`의 CU 비용**: spike 단계에서 실측 권장. plan 가정은 480 CU/call.
3. **ownership-verifier가 ETH#<date> 또는 ETH#LATEST 둘 다 사용**: holder-centric도 두 PK 패턴 모두 작성해야 함 ([eth-collector.ts:85](../../cdk/lambda-src/nft-snapshot/src/eth-collector.ts:85) `pk: ETH#<today>` 참조).
4. **Concurrency 줄여도 됨**: 컬렉션 단위 처리라 `CONCURRENCY = 50` 불필요. 기본 sequential로 충분.

### 3.5 검증 절차

1. **Unit test**: holder set ∩ user wallets 교집합 로직, BatchWriteItem 25개 chunking, cleanup이 negative cache 보존하는지.
2. **Staging dry-run** (dev account 135808943968):
   - `--customDate` 파라미터로 실행 (기존 handler 시그니처 참조)
   - 결과 `ETH#<date>` row를 prod의 `ETH#<date>`와 diff (drift 0이어야 함)
3. **Production rollout**:
   - prod CDK deploy → 다음 daily run (01:00 UTC) 모니터링
   - CloudWatch ethErrorAlarm watch
   - ownership-verifier (01:45 UTC) 정상 deactivate 동작 확인 (false positive 0)
4. **Cost validation**:
   - Alchemy Dashboard 일별 CU 추이
   - 1주 후 daily CU가 free tier 30M의 1% 미만으로 떨어졌는지 확인

### 3.6 Rollback

- revert PR. 기존 wallet-by-wallet polling으로 복귀 (비용 다시 증가하지만 정확성 유지).
- Phase A는 그대로 두어도 안전 (Phase A revert 불필요).

---

## 4. Phase C에 대한 메모 (Phase B와 무관)

Phase C(webhook 도입)는 latency 24h → 수 초가 비즈니스 문제로 입증된 후에만 진행. Phase B 배포 1개월 후 재평가. 본 핸드오프의 범위 밖.

---

## 5. 핵심 참조

- 전체 phased plan: `/home/naru/.claude/plans/adaptive-hopping-platypus.md`
- 코드 review가 발견했던 4 High 이슈와 Phase A의 fix는 [git log -p ca1eca12](file:///home/naru/my_apps/nasun-monorepo) 참조
- Genesis Pass 컨트랙트: `0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1` (ETH mainnet ERC-721)
- Alchemy API key 위치: `apps/nasun-website/cdk/.env.production` `VITE_ALCHEMY_API_KEY`
- 재사용 가능한 holder query: `apps/nasun-website/cdk/lambda-src/nft-snapshot/scripts/verify-gp-holders.ts`
