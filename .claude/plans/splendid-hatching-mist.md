# Passkey 지갑 Faucet 지원 추가

## Context

Passkey 지갑이 connected 상태임에도 Faucet 버튼이 비활성화됨.
`useTokenFaucet` 훅이 self-custody(`useWallet`)와 zkLogin(`useZkLogin`) 주소만 인식하고,
passkey 주소를 인식하지 않기 때문.

## 근본 원인

`packages/wallet/src/hooks/useTokenFaucet.ts:61`:
```typescript
const address = account?.address || zkState?.address;
// ← passkeyAddress 누락!
```

서명 경로(Lines 96-129)도 self-custody keypair와 zkLogin만 처리, passkey 미지원.

## 수정 (1개 파일)

### `packages/wallet/src/hooks/useTokenFaucet.ts`

**1. import 추가:**
```typescript
import { usePasskey } from './usePasskey';
```

**2. passkey 상태 가져오기 (line ~56):**
```typescript
const { keypair: passkeyKeypair, address: passkeyAddress } = usePasskey();
```

**3. address에 passkey 포함 (line 61):**
```typescript
const address = account?.address || zkState?.address || passkeyAddress;
```

**4. 서명 경로 추가 (line 111 뒤, zkLogin 블록 다음):**
```typescript
} else if (passkeyKeypair) {
  // Sign with passkey wallet (Ed25519Keypair, same as self-custody)
  const txResult = await suiClient.signAndExecuteTransaction({
    signer: passkeyKeypair,
    transaction: tx,
    options: { showEffects: true },
  });
  result = txResult.effects?.status?.status === 'success';
  if (result && txResult.digest) {
    await suiClient.waitForTransaction({ digest: txResult.digest });
  }
}
```

**5. useCallback deps 업데이트 (line 158):**
```typescript
[canUseFaucet, address, getKeypair, passkeyKeypair, zkState, zkSignTransaction, refreshBalance]
```

## 동작 흐름 (수정 후)

```
1. Passkey 지갑 연결됨 → passkeyAddress 존재
2. address = passkeyAddress (self-custody/zkLogin 없으므로 fallback)
3. canUseFaucet = true (devnet + address 존재)
4. NSN Faucet: HTTP API → address만 필요 → 정상 동작
5. NBTC/NUSDC Faucet: Move TX → passkeyKeypair로 서명 → 정상 동작
```

## 검증

1. `npx vitest run src/hooks/useTokenFaucet` — 기존 테스트 통과 확인 (테스트 파일이 있으면)
2. `pnpm dev:network-explorer` → passkey 지갑 연결 → NSN Faucet 클릭 → 잔액 증가 확인
3. NBTC/NUSDC Faucet 클릭 → Move TX 서명 → 잔액 증가 확인
