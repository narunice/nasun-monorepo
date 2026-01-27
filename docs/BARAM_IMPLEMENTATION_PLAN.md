# Baram - AI Settlement Layer Prototype

## Overview

**baram**는 나선 네트워크의 "AI를 위한 Settlement Layer" 비전을 증명하는 프로토타입이다.

> **Note:** 2026-01-26 `blind` → `baram`으로 리네이밍 완료

**핵심 가치:**
- 사용자: 프라이버시 보장 (TEE로 프롬프트가 Executor에게도 노출되지 않음)
- AI 제공자: 지불 보장 (에스크로 + 온체인 정산)
- 양측 모두 상대방을 신뢰할 필요 없음 (trustless settlement)

**MVP 목표:** 투자자/파트너에게 "이 팀은 실제로 만들 수 있다"를 증명

---

## 구현 상태 (2026-01-27)

| Phase | Status | 설명 |
|-------|--------|------|
| Phase 1: Move Contract | ✅ 완료 | `baram.move` - 에스크로, 정산 |
| Phase 2: Lambda Backend | ✅ 완료 | AWS Lambda + OpenAI API |
| Phase 3: Frontend | ✅ 완료 | React + @nasun/wallet-ui |
| Phase 4: E2E Test | ✅ 완료 | 통합 테스트 완료 |
| Phase A: MVP 완성 | ✅ 완료 | 전체 E2E 흐름 검증 |
| Phase B: ExecutorRegistry | ✅ 완료 | Executor 등록/선택 기능 |
| Phase C-1: 로컬 시뮬레이션 | ✅ 완료 | Docker 기반 Host + Enclave 통신 |
| Phase C-2: Nitro 부팅 | ✅ 완료 | EC2 Spot + EIF 빌드 + Enclave 부팅 |
| Phase C-3: Local LLM | ✅ 완료 | node-llama-cpp 통합, 프라이버시 보호 |
| Phase C-4: vsock 통신 | ✅ 완료 | node-vsock native binding 통합 |
| Phase C-5: vsock 버그 수정 | ✅ 완료 | Node.js 18, ES Module 호환 |
| Phase C-6: E2E Integration | ✅ 완료 | TEE Executor 등록, E2E 테스트 성공 |
| Phase C-7: Frontend RSA-OAEP | ✅ 완료 | 브라우저 RSA-OAEP 암호화, E2E 완료 |
| Phase C-8: UI 개선 | 🔄 진행중 | Dark/Light 테마 토글, MODEL_PRICING 정리 |

---

## 비용 절감 지침

> **중요**: Baram 개발 시 비용 최소화를 최우선으로 고려합니다.

### EC2 인스턴스 관리 원칙

1. **Spot 인스턴스만 사용**
   - TEE 테스트용 EC2는 반드시 Spot 인스턴스로 생성
   - On-Demand 대비 70-90% 비용 절감
   - Spot 중단 시 재생성하면 됨 (stateless 설계)

2. **세션 종료 시 반드시 Terminate**
   - 개발/테스트 세션이 끝나면 EC2 인스턴스를 **반드시 terminate**
   - Stop이 아닌 **Terminate** (EBS 비용도 절감)
   - 다음 세션 시 새로 생성

3. **인스턴스 생성 명령어**
   ```bash
   # Spot 인스턴스 생성 (r6i.xlarge, 32GB RAM)
   aws ec2 run-instances \
     --image-id ami-0c55b159cbfafe1f0 \
     --instance-type r6i.xlarge \
     --key-name naru_seoul \
     --security-group-ids sg-0123456789abcdef0 \
     --instance-market-options '{"MarketType":"spot","SpotOptions":{"SpotInstanceType":"one-time"}}' \
     --enclave-options 'Enabled=true' \
     --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]' \
     --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=baram-tee-spot}]'
   ```

4. **인스턴스 종료 명령어**
   ```bash
   # 세션 종료 시 반드시 실행
   aws ec2 terminate-instances --instance-ids <INSTANCE_ID>
   ```

### 예상 비용
| 항목 | On-Demand | Spot | 절감율 |
|------|-----------|------|--------|
| r6i.xlarge (시간당) | ~$0.25 | ~$0.05 | 80% |
| 하루 8시간 사용 | $2.00 | $0.40 | 80% |
| 월 20일 사용 | $40.00 | $8.00 | 80% |

---

## E2E Pipeline Architecture (English)

### Complete Flow: Frontend Prompt to TEE LLM Response

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           BARAM E2E PIPELINE                                        │
│                     (Privacy-Preserving AI Settlement)                              │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: USER REQUEST                                                               │
│                                                                                      │
│  ┌─────────────┐                                                                     │
│  │   Browser   │                                                                     │
│  │  (React)    │                                                                     │
│  └──────┬──────┘                                                                     │
│         │                                                                            │
│         │ 1. User enters prompt: "What is 2+2?"                                      │
│         │ 2. Clicks "Submit" button                                                  │
│         ▼                                                                            │
│  ┌─────────────────────────────────────────┐                                         │
│  │  Frontend (apps/baram/frontend)         │                                         │
│  │                                         │                                         │
│  │  - Connect wallet (@nasun/wallet-ui)    │                                         │
│  │  - Select Executor from registry        │                                         │
│  │  - Fetch Enclave's RSA public key       │                                         │
│  │  - Encrypt prompt with RSA-OAEP         │                                         │
│  └──────────────┬──────────────────────────┘                                         │
│                 │                                                                    │
│                 │ 3. Encrypted prompt (base64)                                       │
│                 ▼                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  │ HTTPS Request
                  ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: HOST PROCESSING (EC2 Parent Instance)                                      │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐     │
│  │  Host Process (apps/baram/executor-nitro/src/host/main.ts)                  │     │
│  │                                                                             │     │
│  │  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐     │     │
│  │  │  HTTP Server    │───►│  Request Parser  │───►│  Vsock Client      │     │     │
│  │  │  (Express)      │    │  (JSON)          │    │  (CID 19:5050)     │     │     │
│  │  └─────────────────┘    └──────────────────┘    └─────────┬──────────┘     │     │
│  │                                                           │                │     │
│  │  4. Receives encrypted prompt via HTTPS                   │                │     │
│  │  5. Opens vsock connection to Enclave (CID 19)            │                │     │
│  │  6. Forwards encrypted payload to Enclave                 │                │     │
│  │                                                           │                │     │
│  └───────────────────────────────────────────────────────────┼────────────────┘     │
│                                                              │                      │
│                                                              │ vsock (AF_VSOCK)     │
│                                                              │ Port 5050            │
│                                                              ▼                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                                               │
                    ┌──────────────────────────────────────────┘
                    │
                    │  ╔════════════════════════════════════════════════════════════╗
                    │  ║                    TRUST BOUNDARY                          ║
                    │  ║              (AWS Nitro Enclave - TEE)                     ║
                    │  ╚════════════════════════════════════════════════════════════╝
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: ENCLAVE PROCESSING (Isolated TEE - 14GB Memory)                            │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐     │
│  │  Enclave Process (apps/baram/executor-nitro/src/enclave/main.ts)            │     │
│  │                                                                             │     │
│  │  ┌─────────────────┐                                                        │     │
│  │  │  Vsock Server   │  7. Receives encrypted prompt via vsock                │     │
│  │  │  (Port 5050)    │                                                        │     │
│  │  └────────┬────────┘                                                        │     │
│  │           │                                                                 │     │
│  │           ▼                                                                 │     │
│  │  ┌─────────────────┐                                                        │     │
│  │  │  crypto.ts      │  8. Decrypt prompt using RSA private key               │     │
│  │  │  RSA-OAEP       │     (Private key NEVER leaves Enclave)                 │     │
│  │  │  Decryption     │                                                        │     │
│  │  └────────┬────────┘                                                        │     │
│  │           │                                                                 │     │
│  │           │ Plaintext: "What is 2+2?"                                       │     │
│  │           ▼                                                                 │     │
│  │  ┌─────────────────────────────────────────────────────────────────┐        │     │
│  │  │  local-llm.ts + inference.ts                                    │        │     │
│  │  │                                                                 │        │     │
│  │  │  ┌───────────────────────────────────────────────────────────┐  │        │     │
│  │  │  │  Llama 3.2 3B Instruct (Q4_K_M)                           │  │        │     │
│  │  │  │  - node-llama-cpp binding                                 │  │        │     │
│  │  │  │  - llama.cpp inference engine                             │  │        │     │
│  │  │  │  - 2GB model file (GGUF format)                           │  │        │     │
│  │  │  │                                                           │  │        │     │
│  │  │  │  9. Run inference (CPU, ~10-30 seconds)                   │  │        │     │
│  │  │  │                                                           │  │        │     │
│  │  │  │  Input:  "What is 2+2?"                                   │  │        │     │
│  │  │  │  Output: "2+2 equals 4."                                  │  │        │     │
│  │  │  └───────────────────────────────────────────────────────────┘  │        │     │
│  │  │                                                                 │        │     │
│  │  │  10. Compute SHA-256 hash of result                             │        │     │
│  │  │      resultHash = sha256("2+2 equals 4.")                       │        │     │
│  │  └────────────────────────────────────┬────────────────────────────┘        │     │
│  │                                       │                                     │     │
│  │                                       ▼                                     │     │
│  │  ┌─────────────────┐                                                        │     │
│  │  │  Attestation    │  11. Generate attestation document                     │     │
│  │  │  (Simulated)    │      - moduleId: "baram-enclave-v1"                    │     │
│  │  │                 │      - PCR values (code integrity proof)               │     │
│  │  └────────┬────────┘                                                        │     │
│  │           │                                                                 │     │
│  │           │ Response: { result, resultHash, attestation }                   │     │
│  │           ▼                                                                 │     │
│  │  ┌─────────────────┐                                                        │     │
│  │  │  Vsock Response │  12. Send result back via vsock                        │     │
│  │  └─────────────────┘                                                        │     │
│  │                                                                             │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                      │
│  ╔══════════════════════════════════════════════════════════════════════════════╗    │
│  ║  PRIVACY GUARANTEE: Plaintext prompt NEVER leaves this boundary              ║    │
│  ║  - Host cannot see decrypted prompt                                          ║    │
│  ║  - No network access from Enclave                                            ║    │
│  ║  - No persistent storage                                                     ║    │
│  ╚══════════════════════════════════════════════════════════════════════════════╝    │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
                    │
                    │ vsock response
                    ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: RESPONSE DELIVERY                                                          │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐     │
│  │  Host Process                                                               │     │
│  │                                                                             │     │
│  │  13. Receives result from Enclave                                           │     │
│  │  14. Forwards to user via HTTPS                                             │     │
│  │                                                                             │     │
│  └──────────────┬──────────────────────────────────────────────────────────────┘     │
│                 │                                                                    │
│                 │ HTTPS Response                                                     │
│                 ▼                                                                    │
│  ┌─────────────────────────────────────────┐                                         │
│  │  Frontend                               │                                         │
│  │                                         │                                         │
│  │  15. Display result to user             │                                         │
│  │  16. Verify attestation (optional)      │                                         │
│  │                                         │                                         │
│  │  ┌───────────────────────────────────┐  │                                         │
│  │  │  Result: "2+2 equals 4."          │  │                                         │
│  │  │  Hash: 0x7a8f3c...                │  │                                         │
│  │  │  Attestation: Valid               │  │                                         │
│  │  └───────────────────────────────────┘  │                                         │
│  │                                         │                                         │
│  └─────────────────────────────────────────┘                                         │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  │ (Future: On-chain settlement)
                  ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: BLOCKCHAIN SETTLEMENT (Future Implementation)                              │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐     │
│  │  Nasun Devnet (baram.move + baram_executor.move)                            │     │
│  │                                                                             │     │
│  │  17. Submit resultHash to BaramRegistry                                     │     │
│  │  18. Verify attestation on-chain                                            │     │
│  │  19. Release escrow payment to Executor                                     │     │
│  │  20. Emit settlement event                                                  │     │
│  │                                                                             │     │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │     │
│  │  │  BaramRegistry  │───►│  ExecutorReg    │───►│  Payment        │          │     │
│  │  │  (Shared)       │    │  (Shared)       │    │  Settlement     │          │     │
│  │  └─────────────────┘    └─────────────────┘    └─────────────────┘          │     │
│  │                                                                             │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Message Protocol Flow

```
┌─────────────┐          ┌─────────────┐          ┌─────────────────────┐
│   Frontend  │          │    Host     │          │      Enclave        │
│             │          │   (CID 3)   │          │      (CID 16)       │
└──────┬──────┘          └──────┬──────┘          └──────────┬──────────┘
       │                        │                            │
       │  HTTPS: /public-key    │                            │
       │───────────────────────►│                            │
       │                        │  vsock: GET_PUBLIC_KEY     │
       │                        │───────────────────────────►│
       │                        │                            │
       │                        │  vsock: PUBLIC_KEY         │
       │                        │◄───────────────────────────│
       │  JSON: { publicKey,    │                            │
       │         attestation }  │                            │
       │◄───────────────────────│                            │
       │                        │                            │
       │ [Encrypt prompt with   │                            │
       │  RSA public key]       │                            │
       │                        │                            │
       │  HTTPS: /execute       │                            │
       │  { encryptedPrompt }   │                            │
       │───────────────────────►│                            │
       │                        │  vsock: EXECUTE_INFERENCE  │
       │                        │  { encryptedPrompt }       │
       │                        │───────────────────────────►│
       │                        │                            │
       │                        │        [Decrypt]           │
       │                        │        [Run LLM]           │
       │                        │        [Hash result]       │
       │                        │                            │
       │                        │  vsock: INFERENCE_RESULT   │
       │                        │  { result, hash, attest }  │
       │                        │◄───────────────────────────│
       │  JSON: { result,       │                            │
       │         resultHash }   │                            │
       │◄───────────────────────│                            │
       │                        │                            │
       ▼                        ▼                            ▼
```

### Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          AWS ap-northeast-2 (Seoul)                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  EC2: r6i.xlarge (Spot Instance - 필요 시 생성)                                │  │
│  │  - 4 vCPU, 32GB RAM                                                           │  │
│  │  - EBS: 30GB gp3                                                              │  │
│  │  - Public IP: (동적 할당)                                                      │  │
│  │  - Nitro Enclave enabled                                                      │  │
│  │                                                                               │  │
│  │  ┌────────────────────────┐     vsock      ┌──────────────────────────────┐  │  │
│  │  │  Host Process          │◄──────────────►│  Nitro Enclave (CID 16)      │  │  │
│  │  │  - Port 3000 (HTTP)    │    CID 16      │  - 14GB Memory               │  │  │
│  │  │                        │    Port 5050   │  - 2 vCPU                    │  │  │
│  │  │  USE_VSOCK=true        │                │  - Llama 3.2 3B model        │  │  │
│  │  │  ENCLAVE_CID=16        │                │  - node-llama-cpp            │  │  │
│  │  │                        │                │  - RSA keypair               │  │  │
│  │  └────────────────────────┘                └──────────────────────────────┘  │  │
│  │                                                                               │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  Lambda: baram-executor (Legacy - Phase A/B)                                  │  │
│  │  - API Gateway: https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com   │  │
│  │  - OpenAI API integration (non-private mode)                                  │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  Secrets Manager                                                              │  │
│  │  - baram/openai: OpenAI API key                                               │  │
│  │  - baram/executor: Executor wallet private key                                │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          Nasun Devnet (Chain ID: 12bf3808 - V6)                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  baram.move (includes pado_tokens)                                            │  │
│  │  Package: 0x85dcb01f178587080052e9e78fa2a1c73cddaf175f48b2f99730d5c5b7fd08e3  │  │
│  │  BaramRegistry: 0xd263b1eb7d7e06ed0dc1d257c5f387555f9b8d1a0c2d6d5b010078082... │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │  baram_executor.move                                                          │  │
│  │  Package: 0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5  │  │
│  │  ExecutorRegistry: 0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12...  │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Deployed Contracts (Nasun Devnet V6)

> **Chain ID**: `12bf3808` (V6, 2026-01-27 리셋)

### Baram Contract (V6)
| 항목 | 주소 |
|------|------|
| Package ID | `0x85dcb01f178587080052e9e78fa2a1c73cddaf175f48b2f99730d5c5b7fd08e3` |
| BaramRegistry (shared) | `0xd263b1eb7d7e06ed0dc1d257c5f387555f9b8d1a0c2d6d5b0100780821d520b1` |
| UpgradeCap | `0x10b73ef592e65d46e346aa0498b51c4e942b6f2582ab94d1700007e2e08d2c3d` |
| NUSDC Type | `0x85dcb01f178587080052e9e78fa2a1c73cddaf175f48b2f99730d5c5b7fd08e3::nusdc::NUSDC` |

### Baram Executor Registry (V6)
| 항목 | 주소 |
|------|------|
| Package ID | `0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5` |
| ExecutorRegistry (shared) | `0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b` |
| AdminCap | `0x0953696c5e412f6e6af77e2aae381e06afd4d738b6c26e8dc522d48f00412cd7` |
| UpgradeCap | `0x4575e869a94391d4d2cfc888533b6d8fdabc9c70e45232a9236ceadd782cb739` |

---

## Deployed Backend (AWS)

| Resource | Value |
|----------|-------|
| **API Endpoint** | `https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com/prod/` |
| **Lambda ARN** | `baram-executor` |
| **Region** | ap-northeast-2 |

**Secrets Manager:**
- `baram/openai` - OpenAI API key
- `baram/executor` - Executor wallet private key

**Current EC2 (TEE) - Status: Terminated**

> EC2 인스턴스는 비용 절감을 위해 세션 종료 시 terminate됩니다.
> 테스트 필요 시 Spot 인스턴스로 새로 생성하세요.

| Item | 권장 값 |
|------|---------|
| Instance Type | r6i.xlarge (4 vCPU, 32GB) |
| Market | **Spot** (On-Demand 대비 80% 절감) |
| EBS | 30GB gp3 |
| Enclave CID | 16-19 (자동 할당) |
| Enclave Memory | 14GB |
| Host Port | 3000 |
| Key Pair | naru_seoul |

---

## Phase C: TEE Integration

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase C-5: Local LLM Mode (Complete Privacy) - CURRENT                 │
│                                                                         │
│  User → [Encrypted Prompt] → Host → Enclave → [Local LLM] → Result     │
│                                        ↑                                │
│                                   Prompt stays                          │
│                                   inside TEE                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Phase C-2: Proxy Mode (Partial Privacy) - Legacy                       │
│                                                                         │
│  User → [Encrypted Prompt] → Host → Enclave → Host → OpenAI → Result   │
│                                        ↑           ↑                    │
│                                   Decryption   Prompt visible           │
│                                                to Host                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase C-1: 로컬 시뮬레이션 ✅ 완료

- [x] `apps/baram/executor-nitro/` 프로젝트 구조 생성
- [x] Enclave ↔ Host 통신 프로토콜 설계 (vsock abstraction)
- [x] RSA-OAEP 암호화/복호화 로직 구현
- [x] Docker 기반 로컬 시뮬레이션
- [x] TCP 서버로 Host-Enclave 통신 테스트

### Phase C-2: Nitro Enclave 부팅 ✅ 완료

- [x] EC2 Spot Instance (c5a.xlarge) 테스트
- [x] EIF 빌드 성공 (PCR0: `0870c4e918...`)
- [x] Enclave 부팅 및 TCP 서버 정상 작동
- [x] `require('net')` → `net.createServer()` ESM 버그 수정
- [x] USE_OPENAI_PROXY=true로 Nitro 모드 동작 확인

### Phase C-3: Local LLM Integration ✅ 완료

**목표:** 프롬프트가 TEE를 절대 벗어나지 않는 완전한 프라이버시 보호

**기술 스택:**
| 구성요소 | 선택 | 이유 |
|----------|------|------|
| LLM Runtime | llama.cpp | C++, 경량, CPU 최적화 |
| Node.js Binding | node-llama-cpp | TypeScript 지원 |
| Model | Llama 3.2 3B Q4_K_M | ~2GB, 4GB 메모리 |

**구현 완료:**
- [x] node-llama-cpp 의존성 추가
- [x] `src/enclave/local-llm.ts` - llama.cpp 래퍼 모듈
- [x] `src/enclave/inference.ts` - 3가지 모드 지원 (direct/proxy/local)
- [x] `src/enclave/main.ts` - USE_LOCAL_LLM 환경변수 처리
- [x] `src/shared/protocol.ts` - 버전 1.3.0, 로컬 모델 설정
- [x] `docker/Dockerfile.nitro` - llama.cpp 빌드 의존성
- [x] `scripts/download-model.sh` - 모델 다운로드 스크립트
- [x] Docker 이미지 빌드 성공 (`baram-enclave:local-llm`)

### Phase C-4: vsock 통신 구현 ✅ 완료

**목표:** TCP 시뮬레이션에서 실제 vsock 통신으로 전환

- [x] `node-vsock` 패키지 통합 (napi-rs 기반 native binding)
- [x] `VsockClientSocket`, `VsockServer` 클래스 업데이트
- [x] `VsockSocketWrapper` - net.Socket 호환 인터페이스
- [x] CID 상수 수정 (HOST=3, GUEST_DEFAULT=16)

### Phase C-5: vsock 버그 수정 ✅ 완료 (2026-01-26)

**발견된 문제:**
1. Node.js 20 호환성 - `writeSync`/`writeTextSync`에서 `InvalidArg` 에러
2. Dockerfile `USE_VSOCK=false` 설정 오류
3. ES Module 환경에서 `require('node-vsock')` 실패

**해결 방법:**
1. Node.js 18로 다운그레이드 (node-vsock 공식 지원 버전)
2. `USE_VSOCK=true`로 환경변수 수정
3. `require()` → `await import()` 동적 임포트로 변경

**수정된 파일:**
| 파일 | 변경 내용 |
|------|----------|
| `docker/Dockerfile.nitro` | `node:20-alpine` → `node:18-alpine`, `USE_VSOCK=true` |
| `src/shared/vsock.ts` | `connectVsock()`, `listenVsock()` 메서드 async + dynamic import |

**테스트 결과:**
```
HEALTH_CHECK: {"status":"healthy","uptime":59571,"version":"1.3.0"}
GET_PUBLIC_KEY: RSA public key + attestation 반환 성공
Local LLM: 2890ms에 모델 로딩 완료
```

**Inference Modes:**

| Mode | 환경변수 | 프라이버시 | 사용 사례 |
|------|----------|-----------|----------|
| Local LLM | `USE_LOCAL_LLM=true` | **완전 보호** | Production (TEE) |
| Proxy | `USE_OPENAI_PROXY=true` | 부분 보호 | Development |
| Direct | Neither | 없음 | Local Testing |

---

## Folder Structure

```
apps/baram/
├── contracts/                    # Move 스마트컨트랙트
│   ├── sources/
│   │   └── baram.move           # 에스크로 + 정산 로직
│   └── Move.toml
│
├── contracts-executor/           # ExecutorRegistry
│   ├── sources/
│   │   └── executor.move        # Executor 등록/관리
│   └── Move.toml
│
├── cdk/                          # AWS CDK 인프라
│   ├── lib/
│   │   └── baram-stack.ts       # Lambda + API Gateway
│   └── lambda-src/
│       └── executor/            # AI 실행자 Lambda
│
├── frontend/                     # Frontend (React)
│   └── src/
│       └── features/request/    # 요청 관련 컴포넌트
│
└── executor-nitro/               # TEE Executor (Phase C)
    ├── src/
    │   ├── enclave/             # Enclave 내부 코드
    │   │   ├── main.ts          # Enclave 엔트리포인트
    │   │   ├── crypto.ts        # RSA 키 생성/복호화
    │   │   ├── inference.ts     # AI 추론 (3가지 모드)
    │   │   └── local-llm.ts     # node-llama-cpp 래퍼
    │   ├── host/                # Host 프록시
    │   │   └── main.ts          # Host 엔트리포인트
    │   └── shared/              # 공유 코드
    │       ├── protocol.ts      # 메시지 프로토콜
    │       └── vsock.ts         # vsock 추상화
    ├── docker/
    │   ├── Dockerfile.nitro     # Enclave 이미지 (with llama.cpp)
    │   └── Dockerfile.host      # Host 이미지
    ├── scripts/
    │   └── download-model.sh    # LLM 모델 다운로드
    ├── models/                  # GGUF 모델 파일 (.gitignore)
    ├── package.json
    └── tsconfig.json
```

---

## Protocol Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial protocol (TCP simulation) |
| 1.1.0 | OpenAI proxy support for Nitro |
| 1.2.0 | Local LLM support (node-llama-cpp) |
| 1.3.0 | Native vsock support (node-vsock) + Node.js 18 |

---

## Running the TEE Executor

### Prerequisites

```bash
cd apps/baram/executor-nitro

# Download LLM model (~2GB)
./scripts/download-model.sh
```

### Local Testing (Docker)

```bash
# Build Docker image
docker build -f docker/Dockerfile.nitro -t baram-enclave:local-llm .

# Run with Local LLM mode (requires model)
docker run -it --rm -e USE_LOCAL_LLM=true -p 5050:5050 baram-enclave:local-llm

# Run with Proxy mode (no model needed)
docker run -it --rm -e USE_LOCAL_LLM=false -e USE_OPENAI_PROXY=true -p 5050:5050 baram-enclave:local-llm
```

### AWS Nitro Enclave Deployment

```bash
# Build EIF (Enclave Image Format)
nitro-cli build-enclave --docker-uri baram-enclave:local-llm --output-file baram-enclave.eif

# Run Enclave (14GB memory for 3B model)
nitro-cli run-enclave \
  --eif-path baram-enclave.eif \
  --cpu-count 2 \
  --memory 14336 \
  --enclave-cid 19 \
  --debug-mode

# Check console output
nitro-cli console --enclave-id <enclave-id>

# Run Host process with vsock (on parent EC2 instance)
cd apps/baram/executor-nitro
USE_VSOCK=true ENCLAVE_CID=19 node dist/host/main.js
```

**vsock Communication Flow:**
```
Parent EC2 (CID 3)                    Enclave (CID 19)
┌────────────────────┐                ┌────────────────────┐
│  Host Process      │   vsock:5050   │  Enclave Process   │
│  (USE_VSOCK=true)  │ ◄────────────► │  (VsockServer)     │
│                    │                │                    │
│  ENCLAVE_CID=19    │                │  Listens on :5050  │
└────────────────────┘                └────────────────────┘
```

### Instance Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| Instance Type | r6i.large (2 vCPU, 16GB) | r6i.xlarge (4 vCPU, 32GB) |
| Enclave Memory | 6GB | 14GB |
| Enclave vCPU | 2 | 2 |
| EIF Size | ~2.5GB (with model) | - |

**Cost Estimate (Spot):**
- r6i.xlarge Spot: ~$0.05/hr
- Monthly (demo): ~$50-100

---

## Git Commit History

| Commit | Description | Date |
|--------|-------------|------|
| TBD | feat(baram): Phase C-5 - Vsock bug fix (Node.js 18, ES Module) | 2026-01-26 |
| TBD | feat(baram): Phase C-4 - Native vsock support for Nitro | 2026-01-26 |
| `eae29d3` | feat(baram): Phase C-3 - Local LLM integration for privacy | 2026-01-26 |
| `13de257` | feat(baram): Phase C-2 - Nitro Enclave boots successfully on EC2 | 2026-01-26 |
| `52bf68b` | fix(wallet): reset chain to Nasun Devnet on wallet create/import/logout | 2026-01-26 |
| `3d8b72f` | feat(blind): implement Phase 2 - Lambda Backend deployed to AWS | 2026-01-25 |
| `6c43012` | feat(blind): implement Phase 1 - Move contract deployed to devnet | 2026-01-25 |

---

## Future Roadmap

### Phase C-6: E2E Integration ✅ 완료 (2026-01-27)

**목표:** 브라우저에서 TEE LLM 응답까지 완전한 E2E 플로우 구현

**완료 항목:**
- [x] EC2 인스턴스 재생성 (r6i.xlarge, `i-0c443bb8e82ffa890`)
- [x] Enclave EIF 빌드 및 실행 (CID 16, 14GB memory)
- [x] Host HTTP 서버 배포 및 실행 (port 3000)
- [x] baram_executor 컨트랙트 재배포 (Devnet 리셋 후)
- [x] TEE Executor on-chain 등록 (ExecutorRegistry)
- [x] Frontend config 업데이트 (새 컨트랙트 주소)
- [x] E2E 테스트 성공 (암호화 → 복호화 → LLM 추론 → 응답)
- [x] systemd 서비스 파일 생성 (`scripts/baram-host.service`)

**등록된 TEE Executor (V6):**

> V6 리셋 후 TEE Executor 미등록 상태. EC2 Spot 인스턴스 생성 후 등록 필요.

| 항목 | 예시 값 |
|------|---------|
| Operator | `0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90` |
| Name | Nasun TEE Executor |
| Endpoint | `http://<SPOT_INSTANCE_IP>:3000` |
| TEE Type | 1 (AWS Nitro) |
| Supported Models | `["llama-3.2-3b-local"]` |

**E2E 테스트 결과 (V5 기준 - V6에서 재테스트 필요):**
```bash
# Health Check
curl http://<SPOT_IP>:3000/health
→ {"host":"healthy","enclave":"healthy","uptime":2097101,"version":"1.3.0"}

# Public Key
curl http://<SPOT_IP>:3000/public-key
→ {"success":true,"publicKey":"MIIBIj...","attestation":{...}}

# Execute (RSA-OAEP encrypted prompt)
POST /execute { encryptedPrompt, model: "llama-3.2-3b-local", requestId: 12345 }
→ {
    "success": true,
    "result": "2 + 2 = 4.",
    "resultHash": "4eeeaa2b74ff4fd8be484d19f321ea7289550af2ec3887782543f6d8edc579cd",
    "executionTimeMs": 5835,
    "attestation": {...}
  }
```

**남은 작업 (Optional):**
- [x] systemd 서비스 설치 완료 (baram-enclave.service, baram-host.service)
- [ ] HTTPS/도메인 설정 (Production)

### Phase C-7: Frontend RSA-OAEP 암호화 ✅ 완료 (2026-01-27)

**목표:** 브라우저에서 TEE executor로 RSA-OAEP 암호화된 프롬프트 전송

**완료 항목:**
- [x] `apps/baram/frontend/src/utils/crypto.ts` 생성 (RSA-OAEP 유틸리티)
- [x] `useCreateRequest.ts` 수정 (TEE executor 감지 시 RSA-OAEP 사용)
- [x] 공개키 캐싱 구현 (중복 fetch 방지)
- [x] E2E 테스트 성공 (브라우저 → TEE Host → Enclave → LLM 응답)

**구현 상세:**

| 파일 | 설명 |
|------|------|
| `frontend/src/utils/crypto.ts` | `importPublicKey()`, `encryptWithRSA()` |
| `frontend/src/features/request/hooks/useCreateRequest.ts` | TEE executor 자동 감지, RSA-OAEP 암호화 |

**암호화 흐름:**
```
1. TEE Executor 선택 (teeType > 0)
2. GET /public-key → RSA 공개키 fetch
3. Web Crypto API로 RSA-OAEP 암호화
4. POST /execute { encryptedPrompt (Base64) }
5. Enclave에서 복호화 → LLM 추론 → 응답
```

**E2E 테스트 결과 (V5 기준):**
```bash
Prompt: What is 2+2? Answer briefly.
Model: llama-3.2-3b-local
Result: 2 + 2 = 4.
Execution Time: 5540ms
```

> V6 리셋 후 EC2 Spot 인스턴스 생성 및 TEE Executor 등록 후 재테스트 필요

### Phase C-8: UI 개선 🔄 진행중 (2026-01-27)

**목표:** 사용자 경험 개선 및 프라이버시 모델 정리

**완료 항목:**
- [x] Dark/Light 테마 토글 구현 (`ThemeProvider`, `ThemeToggle`)
- [x] MODEL_PRICING에서 GPT 모델 제거 (TEE 모델만 유지)
- [x] `llama-3.2-3b-local` 테스트 가격 설정 (0.01 NUSDC)

**진행 중:**
- [ ] Executor 선택 UI 개선 (TEE 여부 표시)
- [ ] 요청 결과 페이지 디자인 개선

**관련 파일:**
| 파일 | 설명 |
|------|------|
| `frontend/src/components/theme/ThemeProvider.tsx` | 테마 Context |
| `frontend/src/components/theme/ThemeToggle.tsx` | 테마 토글 버튼 |
| `frontend/src/config/network.ts` | MODEL_PRICING 설정 |

### Phase C-9: Attestation 검증

**목표:** 실제 Nitro Attestation 문서 생성 및 검증

- [ ] `/dev/attestation/attestation_doc` 읽기
- [ ] Attestation document 파싱 (CBOR/COSE)
- [ ] PCR 값 검증 로직
- [ ] Frontend에서 attestation 표시

### Phase C-10: 더 큰 모델 지원

**목표:** 더 높은 품질의 LLM 사용

| Model | Size | Memory | Instance |
|-------|------|--------|----------|
| Llama 3.2 3B | 2GB | 4GB | r6i.xlarge |
| Llama 3.2 7B | 4GB | 8GB | r6i.2xlarge |
| Llama 3.1 13B | 8GB | 16GB | r6i.4xlarge |

- [ ] r6i.2xlarge (64GB) 테스트
- [ ] Model selection UI 추가
- [ ] 자동 메모리 할당 로직

### Phase D: Validator 통합 (장기)

**목표:** Nasun Validator와 TEE Executor 연동

- [ ] Validator 노드에 Enclave 배포
- [ ] Tier 1 (Validator) 자동 자격 부여
- [ ] Staking 기반 슬래싱 메커니즘
- [ ] 분산 Executor 네트워크

### Phase E: Model Marketplace (장기)

**목표:** AI 모델 제공자 생태계 구축

- [ ] ModelRegistry 컨트랙트
- [ ] Model Provider 온보딩 플로우
- [ ] 수익 분배: Model Creator + Executor + Protocol
- [ ] 모델 품질 평가 시스템

### Phase F: Production Deployment (장기)

**목표:** 메인넷 출시 준비

- [ ] Reserved Instance 전환 (비용 최적화)
- [ ] Auto Scaling Group 구성
- [ ] 모니터링/알림 시스템 (CloudWatch, PagerDuty)
- [ ] 보안 감사 (Attestation, Key Management)
- [ ] 문서화 및 개발자 가이드

---

## Critical Files to Reference

| File | Purpose |
|------|---------|
| [executor-nitro/src/host/server.ts](../apps/baram/executor-nitro/src/host/server.ts) | Host HTTP 서버 |
| [executor-nitro/src/host/vsock-client.ts](../apps/baram/executor-nitro/src/host/vsock-client.ts) | Enclave vsock 클라이언트 |
| [executor-nitro/src/enclave/main.ts](../apps/baram/executor-nitro/src/enclave/main.ts) | Enclave 엔트리포인트 |
| [executor-nitro/src/enclave/inference.ts](../apps/baram/executor-nitro/src/enclave/inference.ts) | 3가지 추론 모드 |
| [executor-nitro/src/enclave/local-llm.ts](../apps/baram/executor-nitro/src/enclave/local-llm.ts) | node-llama-cpp 래퍼 |
| [executor-nitro/src/shared/protocol.ts](../apps/baram/executor-nitro/src/shared/protocol.ts) | 메시지 프로토콜 |
| [executor-nitro/src/shared/vsock.ts](../apps/baram/executor-nitro/src/shared/vsock.ts) | vsock/TCP 추상화 레이어 |
| [executor-nitro/docker/Dockerfile.nitro](../apps/baram/executor-nitro/docker/Dockerfile.nitro) | Enclave 이미지 |
| [frontend/src/utils/crypto.ts](../apps/baram/frontend/src/utils/crypto.ts) | RSA-OAEP 암호화 유틸리티 |
| [frontend/src/features/request/hooks/useCreateRequest.ts](../apps/baram/frontend/src/features/request/hooks/useCreateRequest.ts) | 요청 생성 + TEE 암호화 |
