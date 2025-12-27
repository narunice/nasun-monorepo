# Nasun Devnet (SUI Fork) 구축 계획서

**Version**: 1.0.0
**Created**: 2025-12-12
**Author**: Claude Code
**Status**: Ready for Execution

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [아키텍처](#2-아키텍처)
3. [사전 준비 상태](#3-사전-준비-상태)
4. [Phase 1: AWS DLT 계정 및 인프라 준비](#4-phase-1-aws-dlt-계정-및-인프라-준비)
5. [Phase 2: SUI 포크 및 Nasun 브랜딩](#5-phase-2-sui-포크-및-nasun-브랜딩)
6. [Phase 3: 로컬 빌드 및 테스트](#6-phase-3-로컬-빌드-및-테스트)
7. [Phase 4: Genesis Ceremony (2노드)](#7-phase-4-genesis-ceremony-2노드)
8. [Phase 5: EC2 배포 및 네트워크 시작](#8-phase-5-ec2-배포-및-네트워크-시작)
9. [Phase 6: 검증 및 운영](#9-phase-6-검증-및-운영)
10. [AI 도구 활용 전략](#10-ai-도구-활용-전략)
11. [비용 분석](#11-비용-분석)
12. [트러블슈팅](#12-트러블슈팅)

---

## 1. 프로젝트 개요

### 1.1 목표

SUI 블록체인 코드를 포크하여 **Nasun Devnet**이라는 독립적인 테스트 네트워크를 구축합니다.

### 1.2 핵심 스펙

| 항목 | 값 |
|------|-----|
| **Network Name** | Nasun Devnet |
| **Chain ID** | nasun-devnet-1 |
| **Native Token** | NASUN (또는 NSN) |
| **Consensus** | Narwhal/Bullshark (SUI 기본) |
| **Validator 수** | 2개 (비용 최적화) |
| **Target TPS** | ~1,000 (Devnet 기준) |

### 1.3 AI 도구 역할 분담

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI 도구 역할 분담                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Claude Code                    Gemini CLI                              │
│  ─────────────────             ─────────────────                        │
│  • Rust 코드 심층 분석          • 환경 설정 및 쉘 스크립트              │
│  • Consensus 로직 수정          • 코드 검색 및 파일 위치 찾기           │
│  • Genesis 파라미터 조정        • AWS CLI 명령어 생성                   │
│  • 복잡한 타입 시스템 이해      • 빠른 Q&A 및 트러블슈팅                │
│                                                                         │
│  Antigravity                                                            │
│  ─────────────────                                                      │
│  • 반복 작업 자동화 스크립트                                            │
│  • 모니터링 및 Health Check                                             │
│  • CI/CD 파이프라인 구성                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 아키텍처

### 2.1 네트워크 토폴로지 (2노드)

```
                         ┌─────────────────────┐
                         │   사용자 / dApp     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    RPC Endpoint     │
                         │  (Nginx / ALB)      │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
         ┌─────────────────────┐       ┌─────────────────────┐
         │   nasun-node-1      │       │   nasun-node-2      │
         │   (Validator #1)    │◄─────►│   (Validator #2)    │
         │   EC2 (c6i.xlarge)  │  P2P  │   EC2 (c6i.xlarge)  │
         │                     │ 8080  │                     │
         │   • Narwhal Worker  │       │   • Narwhal Worker  │
         │   • Bullshark       │       │   • Bullshark       │
         │   • RPC Server      │       │   • RPC Server      │
         └─────────────────────┘       └─────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Shared Genesis    │
                         │   genesis.blob      │
                         │   committee.json    │
                         └─────────────────────┘
```

### 2.2 2노드 구성의 특징

**SUI Consensus (Narwhal/Bullshark) 요구사항:**
- 최소 노드 수: `2f + 1` (f = Byzantine fault tolerance)
- **f=0 (Devnet)**: 1노드도 가능하지만, 합의 테스트 불가
- **f=1 (권장)**: 최소 4노드 필요
- **2노드 (현재 선택)**: f=0.5 → 실제로는 f=0과 동일

**2노드로 운영 가능한 이유:**
1. Devnet은 실제 Byzantine fault 방어 불필요
2. 두 노드 모두 정상이면 합의 진행 가능
3. 비용 대비 충분한 테스트 환경 제공

**제한사항:**
- 1개 노드 다운 시 네트워크 중단
- 실제 Fault Tolerance 테스트 불가
- 프로덕션 전 4노드 이상으로 확장 필요

---

## 3. 사전 준비 상태

### 3.1 완료된 작업 (WSL Ubuntu)

```bash
# ✅ Ubuntu 업데이트
sudo apt update && sudo apt upgrade -y

# ✅ Rust 설치
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
rustc --version  # 예: rustc 1.75.0

# ✅ 빌드 도구 설치
sudo apt install -y build-essential pkg-config libssl-dev libclang-dev cmake git
```

### 3.2 버전 확인

```bash
# 현재 환경 확인 명령어
rustc --version      # 1.70+ 필요
cargo --version      # 1.70+ 필요
cmake --version      # 3.16+ 필요
git --version        # 2.0+ 필요
```

### 3.3 추가 필요 패키지 (아직 미설치 시)

```bash
# SUI 빌드에 필요한 추가 패키지
sudo apt install -y \
  libpq-dev \
  libudev-dev \
  librocksdb-dev \
  clang \
  llvm
```

---

## 4. Phase 1: AWS DLT 계정 및 인프라 준비

### 4.1 DLT 전용 AWS 계정 생성

```bash
# 1. AWS 계정 생성 (웹 콘솔에서)
# https://aws.amazon.com/ → Create an AWS Account
# 이메일: dlt@nasun.io (또는 별도 이메일)
# 계정 이름: nasun-dlt

# 2. IAM 사용자 생성
aws iam create-user --user-name nasun-dlt-admin --profile nasun-dlt

# 3. AdministratorAccess 정책 연결
aws iam attach-user-policy \
  --user-name nasun-dlt-admin \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess \
  --profile nasun-dlt

# 4. Access Key 생성
aws iam create-access-key --user-name nasun-dlt-admin --profile nasun-dlt
```

### 4.2 AWS CLI 프로필 설정

```bash
# ~/.aws/credentials 에 추가
cat >> ~/.aws/credentials << 'EOF'

[nasun-dlt]
aws_access_key_id = AKIA_YOUR_KEY_HERE
aws_secret_access_key = YOUR_SECRET_HERE
EOF

# ~/.aws/config 에 추가
cat >> ~/.aws/config << 'EOF'

[profile nasun-dlt]
region = ap-northeast-2
output = json
EOF

# 확인
aws sts get-caller-identity --profile nasun-dlt
```

### 4.3 VPC 및 네트워크 설정

```bash
# VPC 생성 (또는 기본 VPC 사용)
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" \
  --output text \
  --profile nasun-dlt)

echo "VPC ID: $VPC_ID"

# Public Subnet 확인
SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[0].SubnetId" \
  --output text \
  --profile nasun-dlt)

echo "Subnet ID: $SUBNET_ID"
```

### 4.4 Security Group 생성

```bash
# Security Group 생성
SG_ID=$(aws ec2 create-security-group \
  --group-name nasun-devnet-sg \
  --description "Nasun Devnet Validator Nodes" \
  --vpc-id $VPC_ID \
  --query "GroupId" \
  --output text \
  --profile nasun-dlt)

echo "Security Group ID: $SG_ID"

# Inbound 규칙 추가
# SSH (관리용)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32 \
  --profile nasun-dlt

# P2P (Validator 간 통신)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 8080 \
  --cidr 0.0.0.0/0 \
  --profile nasun-dlt

# P2P Discovery
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 8084 \
  --cidr 0.0.0.0/0 \
  --profile nasun-dlt

# JSON-RPC
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 9000 \
  --cidr 0.0.0.0/0 \
  --profile nasun-dlt

# Prometheus Metrics
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 9184 \
  --cidr 0.0.0.0/0 \
  --profile nasun-dlt
```

### 4.5 SSH Key Pair 생성

```bash
# Key Pair 생성
aws ec2 create-key-pair \
  --key-name nasun-devnet-key \
  --query "KeyMaterial" \
  --output text \
  --profile nasun-dlt > ~/.ssh/nasun-devnet-key.pem

chmod 400 ~/.ssh/nasun-devnet-key.pem
```

### 4.6 EC2 인스턴스 2대 생성

```bash
# Ubuntu 22.04 LTS AMI (서울 리전)
AMI_ID="ami-0c9c942bd7bf113a2"

# Node 1 생성
NODE1_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type c6i.xlarge \
  --key-name nasun-devnet-key \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":200,"VolumeType":"gp3","Iops":3000}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=nasun-node-1}]' \
  --query "Instances[0].InstanceId" \
  --output text \
  --profile nasun-dlt)

# Node 2 생성
NODE2_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type c6i.xlarge \
  --key-name nasun-devnet-key \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":200,"VolumeType":"gp3","Iops":3000}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=nasun-node-2}]' \
  --query "Instances[0].InstanceId" \
  --output text \
  --profile nasun-dlt)

echo "Node 1 ID: $NODE1_ID"
echo "Node 2 ID: $NODE2_ID"

# Elastic IP 할당 (고정 IP)
EIP1=$(aws ec2 allocate-address --domain vpc --query "AllocationId" --output text --profile nasun-dlt)
EIP2=$(aws ec2 allocate-address --domain vpc --query "AllocationId" --output text --profile nasun-dlt)

# Elastic IP 연결
aws ec2 associate-address --instance-id $NODE1_ID --allocation-id $EIP1 --profile nasun-dlt
aws ec2 associate-address --instance-id $NODE2_ID --allocation-id $EIP2 --profile nasun-dlt

# IP 주소 확인
NODE1_IP=$(aws ec2 describe-instances --instance-ids $NODE1_ID --query "Reservations[0].Instances[0].PublicIpAddress" --output text --profile nasun-dlt)
NODE2_IP=$(aws ec2 describe-instances --instance-ids $NODE2_ID --query "Reservations[0].Instances[0].PublicIpAddress" --output text --profile nasun-dlt)

echo "Node 1 IP: $NODE1_IP"
echo "Node 2 IP: $NODE2_IP"
```

---

## 5. Phase 2: SUI 포크 및 Nasun 브랜딩

### 5.1 프로젝트 디렉토리 구조

```bash
# 작업 디렉토리 생성 (nasun-website와 분리)
mkdir -p ~/nasun-chain
cd ~/nasun-chain

# 디렉토리 구조
nasun-chain/
├── sui/                    # SUI 포크 코드
├── genesis/                # Genesis 파일들
├── configs/                # 노드 설정 파일들
├── scripts/                # 자동화 스크립트
└── docs/                   # 문서
```

### 5.2 SUI 레포지토리 포크

```bash
# 1. GitHub에서 sui-labs/sui 포크 (웹에서)
# https://github.com/MystenLabs/sui → Fork

# 2. 포크한 레포 클론
cd ~/nasun-chain
git clone https://github.com/YOUR_GITHUB_ID/sui.git
cd sui

# 3. 안정적인 브랜치 체크아웃 (devnet 권장)
git checkout devnet

# 4. 원본 저장소를 upstream으로 추가 (향후 업데이트용)
git remote add upstream https://github.com/MystenLabs/sui.git
git fetch upstream
```

### 5.3 Nasun 브랜딩 변경 (핵심 파일)

**Claude Code에게 요청할 작업:**

```
다음 파일들에서 SUI를 NASUN으로 변경해줘:

1. crates/sui-config/src/genesis_config.rs
   - Chain ID 변경: "sui-devnet" → "nasun-devnet-1"

2. crates/sui-types/src/lib.rs
   - 네트워크 식별자 변경

3. crates/sui/src/sui_commands.rs
   - CLI 명령어 출력 메시지

4. 설정 파일 기본 경로:
   - ~/.sui → ~/.nasun
```

**주요 변경 파일 목록:**

| 파일 경로 | 변경 내용 |
|----------|----------|
| `crates/sui-config/src/genesis_config.rs` | Chain ID, Network Name |
| `crates/sui-types/src/crypto.rs` | 서명 접두사 (선택) |
| `crates/sui-config/src/node.rs` | 기본 경로 ~/.nasun |
| `crates/sui/src/client_commands.rs` | CLI 출력 메시지 |
| `crates/sui-json-rpc/src/lib.rs` | RPC 버전 정보 |

### 5.4 Genesis 파라미터 조정

**Claude Code에게 요청할 작업:**

```rust
// crates/sui-config/src/genesis_config.rs 수정 요청

// 1. Epoch 기간 단축 (Devnet 테스트용)
pub const DEFAULT_EPOCH_DURATION_MS: u64 = 60_000;  // 1분 (기본값: 24시간)

// 2. 초기 토큰 공급량
pub const TOTAL_SUPPLY_NASUN: u64 = 10_000_000_000_000_000_000;  // 10B NASUN

// 3. Validator 최소 스테이크
pub const MIN_VALIDATOR_STAKE: u64 = 1_000_000_000;  // 1 NASUN

// 4. Gas 가격
pub const DEFAULT_GAS_PRICE: u64 = 1000;
```

---

## 6. Phase 3: 로컬 빌드 및 테스트

### 6.1 의존성 확인 및 빌드

```bash
cd ~/nasun-chain/sui

# 의존성 확인
cargo check

# Release 빌드 (시간 소요: 20-40분)
cargo build --release

# 빌드 결과 확인
ls -la target/release/sui*
# 예상 출력:
# sui
# sui-node
# sui-tool
# sui-faucet
```

### 6.2 로컬 단일 노드 테스트

```bash
# Genesis 생성 (로컬 테스트용)
./target/release/sui genesis --force

# 단일 노드 실행
./target/release/sui start --network.config ~/.nasun/network.yaml

# 다른 터미널에서 RPC 테스트
curl -X POST http://localhost:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getChainIdentifier","params":[]}'

# 예상 응답: {"jsonrpc":"2.0","result":"nasun-devnet-1","id":1}
```

### 6.3 빌드 아티팩트 패키징

```bash
# 배포용 바이너리 패키징
mkdir -p ~/nasun-chain/dist
cp target/release/sui ~/nasun-chain/dist/
cp target/release/sui-node ~/nasun-chain/dist/
cp target/release/sui-tool ~/nasun-chain/dist/
cp target/release/sui-faucet ~/nasun-chain/dist/

# 압축
cd ~/nasun-chain
tar -czvf nasun-devnet-binaries.tar.gz dist/

# 크기 확인
ls -lh nasun-devnet-binaries.tar.gz
# 예상: ~200-300MB
```

---

## 7. Phase 4: Genesis Ceremony (2노드)

### 7.1 EC2 노드 초기 설정

```bash
# Node 1에 SSH 접속
ssh -i ~/.ssh/nasun-devnet-key.pem ubuntu@$NODE1_IP

# 기본 패키지 설치 (각 노드에서)
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  build-essential \
  pkg-config \
  libssl-dev \
  libclang-dev \
  cmake \
  git \
  jq

# Rust 설치
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# 작업 디렉토리 생성
mkdir -p ~/nasun-node
```

### 7.2 바이너리 배포

```bash
# 로컬에서 각 노드로 바이너리 전송
scp -i ~/.ssh/nasun-devnet-key.pem \
  ~/nasun-chain/nasun-devnet-binaries.tar.gz \
  ubuntu@$NODE1_IP:~/

scp -i ~/.ssh/nasun-devnet-key.pem \
  ~/nasun-chain/nasun-devnet-binaries.tar.gz \
  ubuntu@$NODE2_IP:~/

# 각 노드에서 압축 해제
# (Node 1, Node 2 각각에서 실행)
cd ~
tar -xzvf nasun-devnet-binaries.tar.gz
mv dist/* ~/nasun-node/
chmod +x ~/nasun-node/*
```

### 7.3 Validator Keypair 생성

```bash
# Node 1에서
cd ~/nasun-node
./sui keytool generate ed25519 --file validator-1.key

# Node 2에서
cd ~/nasun-node
./sui keytool generate ed25519 --file validator-2.key

# 각 노드에서 Validator Info Export
# Node 1
./sui validator-info export \
  --protocol-key-file validator-1.key \
  --network-key-file validator-1.key \
  --worker-key-file validator-1.key \
  --name "Nasun Validator 1" \
  --description "Nasun Devnet Validator Node 1" \
  --image-url "https://nasun.io/validator1.png" \
  --project-url "https://nasun.io" \
  --host-name "$NODE1_IP" \
  --gas-price 1000 \
  --commission-rate 200 \
  --output validator-1-info.json

# Node 2 (동일하게)
./sui validator-info export \
  --protocol-key-file validator-2.key \
  --network-key-file validator-2.key \
  --worker-key-file validator-2.key \
  --name "Nasun Validator 2" \
  --description "Nasun Devnet Validator Node 2" \
  --image-url "https://nasun.io/validator2.png" \
  --project-url "https://nasun.io" \
  --host-name "$NODE2_IP" \
  --gas-price 1000 \
  --commission-rate 200 \
  --output validator-2-info.json
```

### 7.4 Validator Info 취합 (로컬)

```bash
# 각 노드에서 validator info 다운로드
cd ~/nasun-chain/genesis

scp -i ~/.ssh/nasun-devnet-key.pem \
  ubuntu@$NODE1_IP:~/nasun-node/validator-1-info.json .

scp -i ~/.ssh/nasun-devnet-key.pem \
  ubuntu@$NODE2_IP:~/nasun-node/validator-2-info.json .

# Validator 목록 확인
cat validator-1-info.json | jq .
cat validator-2-info.json | jq .
```

### 7.5 Genesis 생성

```bash
cd ~/nasun-chain/sui

# Genesis 생성 (2 Validator)
./target/release/sui genesis-ceremony \
  --validator validator-1-info.json \
  --validator validator-2-info.json \
  --output-dir ~/nasun-chain/genesis/output

# 생성된 파일 확인
ls -la ~/nasun-chain/genesis/output/
# 예상 파일:
# - genesis.blob         (Genesis 블록 데이터)
# - committee.json       (Validator 위원회 정보)
# - sui.keystore         (키스토어)
```

### 7.6 Genesis 파일 배포

```bash
# 각 노드로 Genesis 파일 전송
scp -i ~/.ssh/nasun-devnet-key.pem \
  ~/nasun-chain/genesis/output/* \
  ubuntu@$NODE1_IP:~/nasun-node/

scp -i ~/.ssh/nasun-devnet-key.pem \
  ~/nasun-chain/genesis/output/* \
  ubuntu@$NODE2_IP:~/nasun-node/
```

---

## 8. Phase 5: EC2 배포 및 네트워크 시작

### 8.1 Validator 설정 파일 생성

**Node 1 설정 (validator-1.yaml):**

```yaml
# ~/nasun-node/validator-1.yaml
protocol-key-pair-path: validator-1.key
network-key-pair-path: validator-1.key
worker-key-pair-path: validator-1.key

db-path: /home/ubuntu/nasun-node/db
genesis-file-location: /home/ubuntu/nasun-node/genesis.blob

network-address: /ip4/0.0.0.0/tcp/8080/http
metrics-address: 0.0.0.0:9184
admin-interface-address: 127.0.0.1:1337

json-rpc-address: 0.0.0.0:9000

p2p-config:
  listen-address: 0.0.0.0:8084
  external-address: /ip4/NODE1_IP/udp/8084
  seed-peers:
    - address: /ip4/NODE2_IP/udp/8084
      peer-id: VALIDATOR_2_PEER_ID

consensus-config:
  max-pending-transactions: 100000
  max-submit-position: 5
  submit-delay-ms: 1000

authority-store-pruning-config:
  num-latest-epochs-to-retain: 2
  num-epochs-to-retain-for-checkpoints: 2
```

**Node 2 설정 (validator-2.yaml):**
(동일 구조, IP 주소만 교체)

### 8.2 Systemd 서비스 등록

```bash
# 각 노드에서 실행
sudo tee /etc/systemd/system/nasun-validator.service > /dev/null << 'EOF'
[Unit]
Description=Nasun Devnet Validator Node
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/nasun-node
ExecStart=/home/ubuntu/nasun-node/sui-node --config-path validator.yaml
Restart=on-failure
RestartSec=10
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

# 서비스 활성화 및 시작
sudo systemctl daemon-reload
sudo systemctl enable nasun-validator
sudo systemctl start nasun-validator

# 상태 확인
sudo systemctl status nasun-validator

# 로그 확인
sudo journalctl -u nasun-validator -f
```

### 8.3 네트워크 시작 순서

```bash
# 1. Node 1 먼저 시작
ssh -i ~/.ssh/nasun-devnet-key.pem ubuntu@$NODE1_IP
sudo systemctl start nasun-validator

# 2. Node 1 로그에서 "Ready to accept connections" 확인
sudo journalctl -u nasun-validator -f | grep -i "ready"

# 3. Node 2 시작
ssh -i ~/.ssh/nasun-devnet-key.pem ubuntu@$NODE2_IP
sudo systemctl start nasun-validator

# 4. P2P 연결 확인
# Node 1 로그에서 "Peer connected" 메시지 확인
```

---

## 9. Phase 6: 검증 및 운영

### 9.1 네트워크 상태 확인

```bash
# Chain ID 확인
curl -X POST http://$NODE1_IP:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getChainIdentifier","params":[]}'

# 최신 블록 정보
curl -X POST http://$NODE1_IP:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getLatestCheckpointSequenceNumber","params":[]}'

# Validator 정보
curl -X POST http://$NODE1_IP:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"suix_getValidatorsApy","params":[]}'
```

### 9.2 로컬 CLI 연동

```bash
# Nasun Devnet 환경 추가
./target/release/sui client new-env \
  --alias nasun-devnet \
  --rpc http://$NODE1_IP:9000

# 환경 전환
./target/release/sui client switch --env nasun-devnet

# 현재 환경 확인
./target/release/sui client active-env

# Gas 확인 (Faucet 필요)
./target/release/sui client gas
```

### 9.3 Faucet 서비스 구축

```bash
# Node 1 또는 별도 서버에서 Faucet 실행
./sui-faucet \
  --host 0.0.0.0 \
  --port 5003 \
  --wal-dir /home/ubuntu/nasun-node/faucet-wal

# Faucet 요청 테스트
curl -X POST http://$NODE1_IP:5003/gas \
  -H "Content-Type: application/json" \
  -d '{"FixedAmountRequest":{"recipient":"YOUR_ADDRESS"}}'
```

### 9.4 모니터링 설정

```bash
# Prometheus 메트릭 확인
curl http://$NODE1_IP:9184/metrics

# Grafana 대시보드 구성 (선택)
# - SUI 공식 Grafana 대시보드 import
# - Prometheus → Grafana 연동
```

---

## 10. AI 도구 활용 전략

### 10.1 Claude Code 활용 시점

| 작업 | Claude Code 요청 예시 |
|------|----------------------|
| **Genesis 파라미터 수정** | "crates/sui-config/src/genesis_config.rs에서 Epoch 기간을 1분으로 변경해줘" |
| **Chain ID 변경** | "SUI의 Chain ID를 nasun-devnet-1로 변경하려면 어떤 파일들을 수정해야 해?" |
| **Consensus 로직 이해** | "Narwhal/Bullshark 합의에서 2노드 운영 시 주의점이 뭐야?" |
| **빌드 오류 해결** | "이 Rust 컴파일 오류를 해결해줘: [에러 메시지]" |

### 10.2 Gemini CLI 활용 시점

| 작업 | Gemini CLI 요청 예시 |
|------|---------------------|
| **파일 위치 찾기** | "SUI 코드에서 gas price 기본값이 정의된 파일이 어디야?" |
| **AWS CLI 명령어** | "EC2 인스턴스 2대를 생성하는 AWS CLI 명령어 만들어줘" |
| **쉘 스크립트** | "모든 노드에 바이너리를 배포하는 스크립트 만들어줘" |
| **빠른 Q&A** | "sui-node와 sui 바이너리의 차이점이 뭐야?" |

### 10.3 Antigravity 활용 시점

| 작업 | 설명 |
|------|-----|
| **Health Check 자동화** | 2노드 상태 주기적 점검 스크립트 |
| **배포 파이프라인** | 빌드 → 패키징 → EC2 배포 자동화 |
| **로그 모니터링** | 에러 패턴 감지 및 알림 |
| **백업 자동화** | Genesis, Keystore 주기적 백업 |

---

## 11. 비용 분석

### 11.1 월간 예상 비용

| 리소스 | 사양 | 단가 | 월 비용 (USD) |
|--------|------|------|--------------|
| EC2 x2 | c6i.xlarge (4 vCPU, 8GB) | $0.17/hr | ~$245 |
| EBS x2 | 200GB gp3 각 | $0.08/GB | ~$32 |
| Elastic IP x2 | - | $3.6/월 | ~$7.2 |
| 데이터 전송 | ~200GB/월 | $0.09/GB | ~$18 |
| **합계** | | | **~$302/월** |

### 11.2 비용 절감 옵션

| 옵션 | 절감률 | 비고 |
|------|--------|------|
| **Spot Instance** | ~70% | Devnet에 적합, 중단 위험 있음 |
| **Reserved Instance (1년)** | ~30% | 장기 운영 시 권장 |
| **t3.xlarge 다운그레이드** | ~20% | TPS 저하 가능 |
| **스토리지 100GB로 축소** | ~50% (EBS) | 체인 데이터 주기적 정리 필요 |

### 11.3 Spot Instance 적용 시

```bash
# Spot Instance 요청
aws ec2 request-spot-instances \
  --instance-count 2 \
  --type "persistent" \
  --launch-specification '{
    "ImageId": "ami-0c9c942bd7bf113a2",
    "InstanceType": "c6i.xlarge",
    "KeyName": "nasun-devnet-key",
    "SecurityGroupIds": ["'$SG_ID'"]
  }' \
  --profile nasun-dlt

# 예상 비용: ~$75/월 (70% 절감)
```

---

## 12. 트러블슈팅

### 12.1 빌드 오류

**문제**: `cargo build` 시 메모리 부족

```bash
# 해결: Swap 추가
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 영구 적용
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**문제**: `librocksdb` 관련 오류

```bash
# 해결: RocksDB 수동 설치
sudo apt install -y librocksdb-dev

# 또는 소스에서 빌드
git clone https://github.com/facebook/rocksdb.git
cd rocksdb
make shared_lib
sudo make install
```

### 12.2 노드 시작 오류

**문제**: Genesis 파일 불일치

```bash
# 해결: 모든 노드에 동일한 genesis.blob 배포 확인
md5sum genesis.blob  # 각 노드에서 해시 비교
```

**문제**: P2P 연결 실패

```bash
# 해결 1: Security Group 포트 확인
aws ec2 describe-security-groups --group-ids $SG_ID --profile nasun-dlt

# 해결 2: 방화벽 확인 (EC2 내부)
sudo ufw status
sudo ufw allow 8080/tcp
sudo ufw allow 8084/tcp
```

### 12.3 합의 진행 안됨

**문제**: 2노드 중 1개 다운 시 합의 중단

```bash
# 확인: 두 노드 모두 Running 상태인지 확인
sudo systemctl status nasun-validator

# 재시작
sudo systemctl restart nasun-validator
```

---

## 체크리스트

### Phase 1: AWS 인프라
- [ ] DLT 전용 AWS 계정 생성
- [ ] IAM 사용자 및 Access Key 생성
- [ ] AWS CLI 프로필 설정
- [ ] Security Group 생성 (포트: 22, 8080, 8084, 9000, 9184)
- [ ] SSH Key Pair 생성
- [ ] EC2 2대 생성 (c6i.xlarge)
- [ ] Elastic IP 할당 및 연결

### Phase 2: SUI 포크
- [ ] GitHub에서 SUI 포크
- [ ] 로컬 클론 및 devnet 브랜치 체크아웃
- [ ] Chain ID 변경 (nasun-devnet-1)
- [ ] Network Name 변경 (Nasun Devnet)
- [ ] 기본 경로 변경 (~/.nasun)

### Phase 3: 빌드
- [ ] 추가 의존성 설치
- [ ] cargo build --release 성공
- [ ] 로컬 단일 노드 테스트
- [ ] 바이너리 패키징

### Phase 4: Genesis
- [ ] EC2 노드 초기 설정 (Rust, 패키지)
- [ ] 바이너리 배포
- [ ] Validator Keypair 생성 (2개)
- [ ] Validator Info Export
- [ ] Genesis Ceremony 실행
- [ ] Genesis 파일 배포

### Phase 5: 네트워크 시작
- [ ] Validator 설정 파일 생성
- [ ] Systemd 서비스 등록
- [ ] Node 1 시작 및 확인
- [ ] Node 2 시작 및 P2P 연결 확인

### Phase 6: 검증
- [ ] RPC 엔드포인트 테스트
- [ ] Chain ID 확인
- [ ] 블록 생성 확인
- [ ] CLI 연동 테스트
- [ ] Faucet 구축 (선택)

---

## 다음 단계

1. **Nasun Testnet**: 4노드 이상으로 확장하여 실제 Fault Tolerance 테스트
2. **Nasun Mainnet**: 검증된 설정으로 프로덕션 네트워크 런칭
3. **Explorer**: 블록 탐색기 구축
4. **Bridge**: 다른 체인과의 브릿지 구축

---

## 관련 문서

- [SUI 공식 문서](https://docs.sui.io/)
- [SUI GitHub](https://github.com/MystenLabs/sui)
- [Narwhal/Bullshark 논문](https://arxiv.org/abs/2105.11827)
- [AWS EC2 가격](https://aws.amazon.com/ec2/pricing/)

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.0.0 | 2025-12-12 | 초안 작성 (2노드 최적화) | Claude Code |
