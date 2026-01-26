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

## 구현 상태 (2026-01-26)

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

---

## Deployed Contracts (Nasun Devnet)

### Baram Contract
| 항목 | 주소 |
|------|------|
| Package ID | `0x4ad59600a98ca11f9e07b76fce24a7eb98c7201a8700f3930fb7890ca1e3ff0c` |
| BaramRegistry (shared) | `0x9657baf64ea5072f27a337b8040d270d0ceffa33896255d612962876d70840fa` |

### Baram Executor Registry
| 항목 | 주소 |
|------|------|
| Package ID | `0x64558f38eaadf38e43c102d16911f62b7123bc2ec952df2ac0efa0ebcf50a1d6` |
| ExecutorRegistry (shared) | `0x4586f7f1355458d27c660b014b8c549df55384e4534821dd876dcb0490894016` |

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

---

## Phase C: TEE Integration

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase C-3: Local LLM Mode (Complete Privacy)                           │
│                                                                         │
│  User → [Encrypted Prompt] → Host → Enclave → [Local LLM] → Result     │
│                                        ↑                                │
│                                   Prompt stays                          │
│                                   inside TEE                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Phase C-2: Proxy Mode (Partial Privacy)                                │
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
- [x] `src/shared/protocol.ts` - 버전 1.2.0, 로컬 모델 설정
- [x] `docker/Dockerfile.nitro` - llama.cpp 빌드 의존성
- [x] `scripts/download-model.sh` - 모델 다운로드 스크립트
- [x] Docker 이미지 빌드 성공 (`baram-enclave:local-llm`)
- [x] Proxy 모드 테스트 성공 (Protocol 1.2.0, Health Check)

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
| 1.3.0 | Native vsock support (node-vsock) |

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

# Run Enclave (8GB memory for 3B model, CID 16 for vsock)
nitro-cli run-enclave \
  --eif-path baram-enclave.eif \
  --cpu-count 2 \
  --memory 8192 \
  --enclave-cid 16 \
  --debug-mode

# Check console output
nitro-cli console --enclave-id <enclave-id>

# Run Host process with vsock (on parent EC2 instance)
cd apps/baram/executor-nitro
USE_VSOCK=true ENCLAVE_CID=16 node dist/host/main.js
```

**vsock Communication Flow:**
```
Parent EC2 (CID 3)                    Enclave (CID 16)
┌────────────────────┐                ┌────────────────────┐
│  Host Process      │   vsock:5050   │  Enclave Process   │
│  (USE_VSOCK=true)  │ ◄────────────► │  (VsockServer)     │
│                    │                │                    │
│  ENCLAVE_CID=16    │                │  Listens on :5050  │
└────────────────────┘                └────────────────────┘
```

### Instance Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| Instance Type | r6i.large (2 vCPU, 16GB) | r6i.xlarge (4 vCPU, 32GB) |
| Enclave Memory | 6GB | 8GB |
| Enclave vCPU | 2 | 2 |
| EIF Size | ~2.5GB (with model) | - |

**Cost Estimate (Spot):**
- r6i.xlarge Spot: ~$0.05/hr
- Monthly (demo): ~$50-100

---

## Git Commit History

| Commit | Description | Date |
|--------|-------------|------|
| TBD | feat(baram): Phase C-4 - Native vsock support for Nitro | 2026-01-26 |
| `eae29d3` | feat(baram): Phase C-3 - Local LLM integration for privacy | 2026-01-26 |
| `13de257` | feat(baram): Phase C-2 - Nitro Enclave boots successfully on EC2 | 2026-01-26 |
| `52bf68b` | fix(wallet): reset chain to Nasun Devnet on wallet create/import/logout | 2026-01-26 |
| `3d8b72f` | feat(blind): implement Phase 2 - Lambda Backend deployed to AWS | 2026-01-25 |
| `6c43012` | feat(blind): implement Phase 1 - Move contract deployed to devnet | 2026-01-25 |

---

## Future Roadmap

### Phase C-4: vsock 통신 구현 ✅ 완료

**목표:** TCP 시뮬레이션에서 실제 vsock 통신으로 전환

**구현 완료:**
- [x] `node-vsock` 패키지 통합 (napi-rs 기반 native binding)
- [x] `VsockClientSocket`, `VsockServer` 클래스 업데이트
- [x] `VsockSocketWrapper` - net.Socket 호환 인터페이스
- [x] CID 상수 수정 (HOST=3, GUEST_DEFAULT=16)
- [x] TCP 모드 호환성 유지 (USE_VSOCK=false)

**vsock vs TCP 모드:**

| 환경변수 | 모드 | 사용 환경 |
|----------|------|-----------|
| `USE_VSOCK=false` | TCP | 로컬 개발, Docker |
| `USE_VSOCK=true` | vsock | AWS Nitro Enclave |

**CID (Context ID) 값:**

| CID | 의미 |
|-----|------|
| 3 | Host (Parent EC2 instance) |
| 16+ | Enclave (nitro-cli --enclave-cid로 설정) |

### Phase C-5: Attestation 검증 (예정)
- [ ] Attestation document 검증 로직
- [ ] PCR 값 검증

### Phase C-6: 더 큰 모델 지원
- [ ] Llama 3.2 7B 테스트 (r6i.2xlarge, 64GB)
- [ ] Model selection UI 추가

### Phase D: Validator 통합 (장기)
- Nasun Validator와 연동
- Tier 1 (Validator) 자동 자격 부여
- 슬래싱 메커니즘 활성화

### Phase E: Model Marketplace (장기)
- ModelRegistry 컨트랙트
- Model Provider 온보딩
- 수익 분배: Model Creator + Executor + Protocol

---

## Critical Files to Reference

| File | Purpose |
|------|---------|
| [executor-nitro/src/enclave/main.ts](../apps/baram/executor-nitro/src/enclave/main.ts) | Enclave 엔트리포인트 |
| [executor-nitro/src/enclave/inference.ts](../apps/baram/executor-nitro/src/enclave/inference.ts) | 3가지 추론 모드 |
| [executor-nitro/src/enclave/local-llm.ts](../apps/baram/executor-nitro/src/enclave/local-llm.ts) | node-llama-cpp 래퍼 |
| [executor-nitro/src/shared/protocol.ts](../apps/baram/executor-nitro/src/shared/protocol.ts) | 메시지 프로토콜 |
| [executor-nitro/src/shared/vsock.ts](../apps/baram/executor-nitro/src/shared/vsock.ts) | vsock/TCP 추상화 레이어 |
| [executor-nitro/docker/Dockerfile.nitro](../apps/baram/executor-nitro/docker/Dockerfile.nitro) | Enclave 이미지 |
