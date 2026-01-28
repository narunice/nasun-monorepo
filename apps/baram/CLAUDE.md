# CLAUDE.md (Baram App)

> 이 문서는 baram 앱 전용 가이드입니다.
> 공통 원칙은 [루트 CLAUDE.md](../../CLAUDE.md)를 참조하세요.

---

## 개요 (Overview)

**Baram**은 나선 네트워크의 "AI를 위한 Settlement Layer" 비전을 증명하는 프로토타입입니다.

### 핵심 컨셉

| 요소 | 설명 |
|------|------|
| **Privacy** | TEE(AWS Nitro Enclave) 내에서 프롬프트 복호화/처리 |
| **Escrow** | NUSDC 선불 결제, 성공 시 Executor에 자동 지급 |
| **Trustless** | 온체인 증명으로 신뢰 없는 정산 |

### 가치 제안

- **사용자**: 프라이버시 보장 (TEE로 프롬프트가 Executor에게도 노출되지 않음)
- **AI 제공자**: 지불 보장 (에스크로 + 온체인 정산)
- **양측 모두**: 상대방을 신뢰할 필요 없음 (trustless settlement)

---

## 아키텍처 (Architecture)

### 추론 모드

| Mode | Privacy | Speed | Use Case |
|------|---------|-------|----------|
| **Direct** | Low | Fast | MVP 데모 (Lambda + OpenAI) |
| **Proxy** | Medium | Medium | 프롬프트만 보호 (TEE 복호화, Host가 API 호출) |
| **Local** | High | Slow | 완전 프라이버시 (TEE 내 LLaMA 실행) |

### E2E 파이프라인 요약

```
Frontend → [RSA-OAEP 암호화] → Host (EC2) → [vsock] → Enclave (Nitro)
                                                            ↓
                                                    [RSA 복호화 + AI 추론]
                                                            ↓
                                                    결과 반환 + 온체인 정산
```

---

## 디렉토리 구조 (Directory Structure)

```
apps/baram/
├── frontend/                    # React 19 + Vite 7 (포트 5177)
│   └── src/
│       ├── features/request/    # 요청 생성 UI
│       ├── config/              # 네트워크/컨트랙트 설정
│       ├── components/theme/    # 다크/라이트 테마
│       └── utils/crypto.ts      # RSA-OAEP 암호화
│
├── contracts/                   # baram.move (에스크로 + 정산)
│   └── sources/baram.move
│
├── contracts-executor/          # executor.move (Executor 등록)
│   └── sources/executor.move
│
├── executor-nitro/              # TEE Executor
│   ├── src/host/                # Host 서버 (HTTP + vsock client)
│   ├── src/enclave/             # Enclave 코드 (crypto, inference, local-llm)
│   ├── src/shared/              # 공유 프로토콜 (protocol.ts, vsock.ts)
│   ├── scripts/                 # 빌드/배포 스크립트
│   ├── docker/                  # Nitro EIF 빌드용 Dockerfile
│   └── models/                  # LLaMA 모델 파일 (.gitignore)
│
├── cdk/                         # AWS CDK 인프라
│   ├── lib/                     # BaramStack 정의
│   └── lambda-src/executor/     # Lambda 핸들러
│
├── .env.example                 # 환경 변수 템플릿
└── CLAUDE.md                    # 이 파일
```

---

## 개발 명령어 (Development Commands)

### Frontend (포트 5177)

```bash
# 모노레포 루트에서
pnpm dev:baram

# 또는 직접 실행
cd apps/baram/frontend && pnpm dev
```

### Move 컨트랙트

```bash
# baram.move 빌드
cd apps/baram/contracts
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build

# executor.move 빌드
cd apps/baram/contracts-executor
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build

# 배포 (새 패키지)
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish --gas-budget 100000000
```

### executor-nitro (로컬 시뮬레이션)

```bash
cd apps/baram/executor-nitro

# 빌드
npm run build

# Host 서버 (포트 3000)
npm run dev:host

# Enclave 서버 (TCP 5050)
npm run dev:enclave

# Docker 시뮬레이션
docker-compose -f docker/docker-compose.yml up
```

### AWS 배포

```bash
# CDK 배포 (Lambda + API Gateway)
cd apps/baram/cdk && npx cdk deploy
```

### TEE Spot Instance 관리 (Phase C-9)

> **⚠️ 중요**: 개발 종료 후 반드시 `terminate-spot.sh`를 실행하세요!
> 인스턴스를 방치하면 불필요한 비용이 계속 발생합니다.

```bash
cd apps/baram/executor-nitro

# 1. Spot 인스턴스 생성 (Custom AMI, 2-3분 소요)
./scripts/launch-spot.sh
# → Instance ID, Public IP 출력

# 2. On-chain Executor endpoint 업데이트 (필요 시)
./scripts/update-executor.sh <PUBLIC_IP>

# 3. SSH 접속 및 개발
ssh -i ~/.ssh/baram-nitro.pem ec2-user@<PUBLIC_IP>

# 4. Health check
curl http://<PUBLIC_IP>:3000/health

# 5. 개발 완료 후 반드시 종료!
./scripts/terminate-spot.sh
```

**스크립트 목록:**

| 스크립트 | 설명 |
|----------|------|
| `launch-spot.sh` | Custom AMI로 Spot 인스턴스 생성 (자동 설정) |
| `terminate-spot.sh` | 인스턴스 종료 (**반드시 실행!**) |
| `update-executor.sh` | On-chain Executor endpoint 업데이트 |
| `create-ami.sh` | 새 AMI 생성 (환경 변경 시만) |
| `setup-ec2.sh` | EC2 초기 설정 (AMI에 포함됨) |
| `build-eif.sh` | Enclave 이미지 빌드 |
| `run-enclave.sh` | Enclave 실행 |
| `download-model.sh` | LLM 모델 다운로드 (~2GB) |

**환경 설정:**

`.env.ami` 파일 생성 (`.env.ami.example` 참조):
```bash
BARAM_AMI_ID=ami-0488cb25dd63317af    # 2026-01-27 생성
BARAM_KEY_NAME=baram-nitro
BARAM_SECURITY_GROUP=sg-0c0b595fb9b4f83ec
BARAM_INSTANCE_TYPE=r6i.xlarge
BARAM_SPOT_PRICE=0.10
```

---

## 스마트컨트랙트 (Smart Contracts)

### baram.move

에스크로 기반 AI 연산 정산 시스템.

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_request` | User | NUSDC 에스크로 + 요청 생성 |
| `cancel_request` | User | 타임아웃 전 취소 + 환불 |
| `claim_timeout_refund` | User | 타임아웃 후 환불 |
| `mark_executing` | Executor | 실행 시작 표시 (선택) |
| `submit_proof` | Executor | 결과 해시 제출 + 지급 |

**상수:**

| 상수 | 값 | 설명 |
|------|-----|------|
| `DEFAULT_TIMEOUT_MS` | 300,000 | 5분 타임아웃 |
| `MIN_PRICE` | 100,000 | 0.1 NUSDC (6 decimals) |
| `PROMPT_HASH_LENGTH` | 32 | SHA-256 |

**상태 코드:**

| 코드 | 상태 |
|------|------|
| 0 | PENDING |
| 1 | EXECUTING |
| 2 | COMPLETED |
| 3 | CANCELLED |
| 4 | REFUNDED |

### executor.move

Executor 등록 및 관리 시스템.

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `register_executor` | Admin | 새 Executor 등록 |
| `update_executor` | Admin | Executor 정보 수정 |
| `deactivate_executor` | Admin | Executor 비활성화 |
| `update_tee_attestation` | Admin | TEE 증명 업데이트 |
| `update_executor_stats` | Admin | 작업 통계 업데이트 |

**TEE 유형:**

| 코드 | 유형 |
|------|------|
| 0 | None |
| 1 | AWS Nitro |
| 2 | Intel SGX |
| 3 | AMD SEV |

**평판 시스템:**
- 초기값: 500
- 성공 시: +10 (최대 1000)
- 실패 시: -20 (최소 0)

---

## 배포된 컨트랙트 (Deployed Contracts - Devnet V6)

> **Chain ID**: `12bf3808` (V6 리셋, 2026-01-27)

### Baram Contract

| 항목 | 주소 |
|------|------|
| Package ID | `0xfbe120e1847ca3ce7968bc7d85504a202639666755d581cfe642df3e57b2bc2f` |
| BaramRegistry | `0x52427e24315a444e9aa07ecb93df5a3392e1cb5d5bec8aba90c4c9eecaf77d3f` |
| UpgradeCap | `0xa9a6ee0412639af01e630ce23d38b246a88bdfd3ee8db5e3634ce45fa1eefe62` |

### Executor Registry

| 항목 | 주소 |
|------|------|
| Package ID | `0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5` |
| ExecutorRegistry | `0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b` |
| AdminCap | `0x0953696c5e412f6e6af77e2aae381e06afd4d738b6c26e8dc522d48f00412cd7` |

### Unified Tokens (devnet_tokens)

| 항목 | 주소 |
|------|------|
| Package ID | `0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017` |
| TokenFaucet | `0x04aa41442a9b812d29bb578aa82358d2b9e678240814368e32d82efa79669e14` |
| ClaimRecord | `0x8b9e854509c950d01ccd37190ba967e2de2197908f5c164f7cc193714faac4a8` |

### Lambda Backend

| 항목 | 값 |
|------|-----|
| API Endpoint | `https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com/prod` |
| Region | ap-northeast-2 |

---

## 환경 변수 (Environment Variables)

### Frontend (.env)

```env
# Network (V6)
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=12bf3808
VITE_FAUCET_URL=https://faucet.devnet.nasun.io

# Tokens (devnet_tokens - unified)
VITE_NUSDC_TYPE=0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017::nusdc::NUSDC
VITE_TOKENS_PACKAGE_ID=0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017
VITE_TOKEN_FAUCET_ID=0x04aa41442a9b812d29bb578aa82358d2b9e678240814368e32d82efa79669e14

# Baram Contract
VITE_BARAM_PACKAGE_ID=0xfbe120e1...
VITE_BARAM_REGISTRY_ID=0x52427e24...

# Executor
VITE_EXECUTOR_PACKAGE_ID=0xbc29ac03...
VITE_EXECUTOR_REGISTRY_ID=0xeaac7390...

# Backend
VITE_BACKEND_URL=https://ncn10xkbfh.execute-api.../prod
```

### executor-nitro (.env)

```env
# 추론 모드
USE_LOCAL_LLM=true          # Local LLaMA (완전 프라이버시)
USE_OPENAI_PROXY=false      # OpenAI Proxy (부분 프라이버시)

# OpenAI (Proxy 모드에서 사용)
OPENAI_API_KEY=sk-...

# vsock (Nitro 전용)
USE_VSOCK=true
ENCLAVE_CID=16

# 포트
HOST_PORT=3000
ENCLAVE_PORT=5050
```

### AWS Secrets Manager

| Secret | 내용 |
|--------|------|
| `baram/openai` | `{ "apiKey": "sk-..." }` |
| `baram/executor` | `{ "privateKey": "hex-32-bytes" }` |

---

## TEE/Nitro 가이드라인

### 보안 원칙

1. **Private Key Never Leaves Enclave**
   - RSA 키쌍은 Enclave 시작 시 생성
   - 종료 시 메모리에서 파괴
   - 디스크 저장 금지

2. **vsock Only Communication**
   - Host-Enclave 간 vsock만 허용
   - 네트워크 접근 없음 (Enclave)

3. **No Logging of Secrets**
   - 개인키, 복호화된 프롬프트 로깅 금지
   - 결과 해시만 로깅 가능

### vsock 통신

```
Host (EC2, CID 3)           Enclave (Nitro, CID 16-19)
┌────────────────┐          ┌────────────────┐
│ Port 3000 HTTP │◄─vsock──►│ Port 5050      │
│ vsock client   │          │ vsock server   │
└────────────────┘          └────────────────┘
```

### 암호화 흐름

```
1. Frontend: prompt → RSA-OAEP(공개키) → encryptedPrompt (Base64)
2. Host: encryptedPrompt 전달 (복호화 불가)
3. Enclave: RSA-OAEP(개인키) → prompt → AI 추론 → 결과
4. 결과는 평문으로 반환 (향후 암호화 옵션)
```

### 인스턴스 요구사항

| 항목 | Proxy Mode | Local LLM Mode |
|------|------------|----------------|
| Instance Type | r6i.large | r6i.xlarge |
| RAM | 16GB | 32GB |
| Enclave Memory | 6GB | 14GB |
| EIF Size | ~1GB | ~2.5GB |

---

## 비용 관리 (Cost Management)

> **중요**: Baram 개발 시 비용 최소화를 최우선으로 고려합니다.

### ⚠️ 세션 종료 시 반드시 인스턴스 종료!

```bash
# 개발 완료 후 반드시 실행 - 잊으면 불필요한 비용 발생!
cd apps/baram/executor-nitro
./scripts/terminate-spot.sh
```

> **경고**: 인스턴스를 terminate하지 않으면 시간당 ~$0.05씩 계속 과금됩니다.
> - 하루 방치: ~$1.20
> - 일주일 방치: ~$8.40

### Spot Instance 정책

1. **Custom AMI 사용 (Phase C-9)**
   - 사전 구성된 AMI로 2-3분 내 개발 환경 구축
   - AMI ID: `ami-0488cb25dd63317af`

2. **TEE 테스트는 Spot 인스턴스만 사용**
   - On-Demand 대비 70-90% 비용 절감
   - Spot 중단 시 재생성 (stateless 설계)

3. **세션 종료 시 반드시 Terminate**
   - Stop이 아닌 **Terminate** (EBS 비용도 절감)
   - 다음 세션 시 새로 생성

### 예상 비용

| 항목 | On-Demand | Spot | 절감율 |
|------|-----------|------|--------|
| r6i.xlarge (시간당) | ~$0.25 | ~$0.05 | 80% |
| 하루 4시간 사용 | $1.00 | $0.20 | 80% |
| 월 20일 사용 | $20.00 | $4.00 | 80% |
| AMI 스토리지 | - | ~$2.50/월 | - |
| **월 총 예상** | - | **~$6.50** | - |

---

## 보안 고려사항 (Security)

### 암호화

| 항목 | 값 |
|------|-----|
| 알고리즘 | RSA-OAEP with SHA-256 |
| 키 길이 | 2048 bits |
| 저장 | Enclave 메모리 only |

### 에스크로 보안

- 5분 타임아웃 (`DEFAULT_TIMEOUT_MS = 300,000`)
- 최소 가격 0.1 NUSDC (`MIN_PRICE = 100,000`)
- 지정된 Executor만 정산 가능

### 주의사항

```
CRITICAL:
- Lambda의 executorPrivateKey는 정산 전용 (OpenAI 호출용 아님)
- Enclave의 RSA 개인키는 로그에 절대 출력하지 않음
- OPENAI_API_KEY는 Host/Lambda에서만 사용 (Enclave에 전달 금지)
```

---

## 주요 파일 참조

| 파일 | 설명 |
|------|------|
| [baram.move](contracts/sources/baram.move) | 에스크로 + 정산 로직 |
| [executor.move](contracts-executor/sources/executor.move) | Executor 등록 시스템 |
| [crypto.ts](executor-nitro/src/enclave/crypto.ts) | RSA 키 관리 |
| [attestation.ts](executor-nitro/src/enclave/attestation.ts) | NSM Attestation (COSE_Sign1 파싱) |
| [inference.ts](executor-nitro/src/enclave/inference.ts) | 3가지 추론 모드 |
| [local-llm.ts](executor-nitro/src/enclave/local-llm.ts) | node-llama-cpp 래퍼 |
| [vsock.ts](executor-nitro/src/shared/vsock.ts) | vsock/TCP 추상화 |
| [protocol.ts](executor-nitro/src/shared/protocol.ts) | 메시지 프로토콜 (v1.3.0) |
| [frontend/src/utils/crypto.ts](frontend/src/utils/crypto.ts) | 브라우저 RSA-OAEP |
| [launch-spot.sh](executor-nitro/scripts/launch-spot.sh) | Spot 인스턴스 생성 |
| [terminate-spot.sh](executor-nitro/scripts/terminate-spot.sh) | 인스턴스 종료 (**필수!**) |
| [create-ami.sh](executor-nitro/scripts/create-ami.sh) | AMI 생성 |
| [update-executor.sh](executor-nitro/scripts/update-executor.sh) | On-chain endpoint 업데이트 |
| [.env.ami.example](executor-nitro/.env.ami.example) | Spot 설정 템플릿 |
| [attestation.ts](frontend/src/config/attestation.ts) | PCR0 검증 설정 |

---

## PCR0 검증 (Attestation Verification)

| 환경 | VITE_EXPECTED_PCR0 | 동작 |
|------|-------------------|------|
| 개발 | 비어있음 | "Verification skipped" 경고, 정상 작동 |
| 프로덕션 | EIF PCR0 값 | PCR0 검증 활성화 |

**개발 중**: `VITE_EXPECTED_PCR0`를 비워두고 개발 (검증 skip)
**프로덕션**: EIF 빌드 시 출력되는 PCR0 값을 `.env.production`에 설정

자세한 워크플로우는 [BARAM_IMPLEMENTATION_PLAN.md](../../docs/BARAM_IMPLEMENTATION_PLAN.md) Phase C-10 참조.

---

## 향후 계획 (Roadmap)

| Phase | 기능 | 상태 |
|-------|------|------|
| A (MVP) | Lambda Direct Mode | 완료 |
| B | ExecutorRegistry | 완료 |
| C-1~C-7 | TEE Integration (vsock, Local LLM) | 완료 |
| C-8 | UI 개선 (테마 토글) | 완료 |
| C-9 | Custom AMI + Spot 자동화 | 완료 |
| C-10 | Real NSM Attestation | 완료 |
| D | Stake/Slashing 메커니즘 | 계획 |
| E | Model Marketplace | 계획 |

자세한 구현 상태는 [BARAM_IMPLEMENTATION_PLAN.md](../../docs/BARAM_IMPLEMENTATION_PLAN.md) 참조.
