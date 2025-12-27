# Production Website Hosting Migration Plan

**Version**: 1.0.0
**Created**: 2025-12-12
**Author**: Claude Code
**Status**: Draft

---

## 목차

1. [개요](#1-개요)
2. [현재 상태](#2-현재-상태)
3. [목표 아키텍처](#3-목표-아키텍처)
4. [마이그레이션 단계](#4-마이그레이션-단계)
5. [EC2 인스턴스 설정](#5-ec2-인스턴스-설정)
6. [배포 파이프라인 설정](#6-배포-파이프라인-설정)
7. [DNS 전환](#7-dns-전환)
8. [검증 체크리스트](#8-검증-체크리스트)
9. [롤백 계획](#9-롤백-계획)
10. [비용 분석](#10-비용-분석)

---

## 1. 개요

### 1.1 목적

NASUN 프로덕션 웹사이트(nasun.io) 호스팅을 **Dev AWS 계정**에서 **Prod AWS 계정**으로 마이그레이션하여, 백엔드 인프라(Lambda, API Gateway, DynamoDB)와 동일한 계정에서 관리합니다.

### 1.2 기대 효과

| 항목 | 설명 |
|------|------|
| **보안 강화** | 프로덕션 인프라 완전 격리 (Dev 계정 침해 시 Prod 영향 없음) |
| **IAM 권한 명확화** | Dev 계정 개발자는 Prod EC2 접근 불가 |
| **비용 추적** | 프로덕션 환경 비용 명확히 분리 |
| **네트워크 효율** | 같은 계정 내 API Gateway 호출 (Cross-Account 제거) |
| **감사 용이** | Prod 계정 CloudTrail만 감사하면 됨 |

### 1.3 범위

- **포함**: Production EC2 인스턴스, Security Group, SSH 키, 배포 스크립트
- **제외**: Staging 환경 (Dev 계정에서 계속 관리), DNS 레코드 (Route 53)

---

## 2. 현재 상태

### 2.1 인프라 현황

```
┌─────────────────────────────────────────────────────────────┐
│              Dev Account (135808943968)                     │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  Staging EC2    │    │  Production EC2 │  ← STOPPED     │
│  │  (Running)      │    │  (비용 절감용)   │                │
│  │  staging.nasun  │    │                 │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                             │
│  ⚡ Dev Lambdas                                             │
│  🌐 Dev API Gateway (bb4zdy0rwe)                           │
│  🗄️ Dev DynamoDB                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Prod Account (466841130170)                    │
│                                                             │
│  ⚡ Prod Lambdas                                            │
│  🌐 Prod API Gateway (TBD)                                  │
│  🗄️ Prod DynamoDB                                           │
│                                                             │
│  ❌ EC2 없음 (마이그레이션 대상)                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 현재 문제점

1. **Cross-Account API 호출**: Production EC2 → Prod API Gateway (계정 경계 넘김)
2. **보안 위험**: Dev 계정 침해 시 Prod 웹사이트도 위험
3. **비용 혼재**: Prod EC2 비용이 Dev 계정에 청구
4. **IAM 복잡성**: Dev 계정에서 Prod EC2 권한 관리 필요

---

## 3. 목표 아키텍처

### 3.1 마이그레이션 후 구조

```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│  Dev Account (135808943968) │    │  Prod Account (466841130170)│
│  ───────────────────────────│    │  ───────────────────────────│
│                             │    │                             │
│  📦 Staging EC2             │    │  📦 Production EC2          │
│     staging.nasun.io        │    │     nasun.io                │
│     .env.staging            │    │     .env.production         │
│                             │    │                             │
│  ⚡ Dev Lambdas             │    │  ⚡ Prod Lambdas            │
│  🌐 Dev API Gateway         │    │  🌐 Prod API Gateway        │
│  🗄️ Dev DynamoDB            │    │  🗄️ Prod DynamoDB           │
│  🔐 Dev Secrets             │    │  🔐 Prod Secrets            │
│                             │    │                             │
│  👤 Target: @Naru010110     │    │  👤 Target: @Nasun_io       │
└─────────────────────────────┘    └─────────────────────────────┘
```

### 3.2 네트워크 흐름

```
[사용자] → [CloudFlare/Route53] → [nasun.io]
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  Prod EC2       │
                              │  (Nginx + React)│
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  Prod API GW    │  ← 같은 계정 내 호출
                              │  → Prod Lambda  │
                              │  → Prod DynamoDB│
                              └─────────────────┘
```

---

## 4. 마이그레이션 단계

### Phase 1: Prod 계정 EC2 인프라 준비 (1-2시간)

| 단계 | 작업 | 담당 | 예상 시간 |
|------|------|------|----------|
| 1.1 | VPC 및 Subnet 확인/생성 | DevOps | 15분 |
| 1.2 | Security Group 생성 | DevOps | 10분 |
| 1.3 | SSH Key Pair 생성 | DevOps | 5분 |
| 1.4 | EC2 인스턴스 생성 | DevOps | 15분 |
| 1.5 | Elastic IP 할당 | DevOps | 5분 |
| 1.6 | 기본 소프트웨어 설치 | DevOps | 30분 |

### Phase 2: 애플리케이션 배포 설정 (1-2시간)

| 단계 | 작업 | 담당 | 예상 시간 |
|------|------|------|----------|
| 2.1 | Node.js, pnpm 설치 | DevOps | 15분 |
| 2.2 | Nginx 설치 및 설정 | DevOps | 20분 |
| 2.3 | SSL 인증서 설정 (Let's Encrypt) | DevOps | 15분 |
| 2.4 | 배포 스크립트 작성 | DevOps | 30분 |
| 2.5 | GitHub Actions 또는 수동 배포 테스트 | DevOps | 30분 |

### Phase 3: 애플리케이션 배포 (30분)

| 단계 | 작업 | 담당 | 예상 시간 |
|------|------|------|----------|
| 3.1 | 프로덕션 빌드 (.env.production) | Dev | 10분 |
| 3.2 | 빌드 결과물 EC2 전송 | DevOps | 5분 |
| 3.3 | Nginx 재시작 | DevOps | 5분 |
| 3.4 | 기능 테스트 (IP 직접 접속) | QA | 10분 |

### Phase 4: DNS 전환 및 검증 (30분)

| 단계 | 작업 | 담당 | 예상 시간 |
|------|------|------|----------|
| 4.1 | Route 53 A 레코드 변경 | DevOps | 5분 |
| 4.2 | DNS 전파 대기 | - | 5-15분 |
| 4.3 | 전체 기능 테스트 | QA | 10분 |
| 4.4 | 모니터링 확인 | DevOps | 5분 |

### Phase 5: 정리 (15분)

| 단계 | 작업 | 담당 | 예상 시간 |
|------|------|------|----------|
| 5.1 | Dev 계정 Prod EC2 종료 확인 | DevOps | 5분 |
| 5.2 | 문서 업데이트 | Dev | 10분 |

---

## 5. EC2 인스턴스 설정

### 5.1 인스턴스 사양

| 항목 | 값 | 비고 |
|------|-----|------|
| **Instance Type** | t3.small | 2 vCPU, 2GB RAM (Staging과 동일) |
| **AMI** | Amazon Linux 2023 | 최신 보안 패치 |
| **Root Volume** | 20GB gp3 | SSD, 3000 IOPS |
| **Region** | ap-northeast-2 | 서울 리전 |
| **Availability Zone** | ap-northeast-2a | 단일 AZ (비용 절감) |

### 5.2 Security Group 설정

```
Security Group: nasun-prod-web-sg

Inbound Rules:
┌──────────┬──────────┬─────────────────┬─────────────────────────┐
│ Type     │ Port     │ Source          │ Description             │
├──────────┼──────────┼─────────────────┼─────────────────────────┤
│ SSH      │ 22       │ YOUR_IP/32      │ 관리자 SSH 접속          │
│ HTTP     │ 80       │ 0.0.0.0/0       │ HTTP (HTTPS 리다이렉트)  │
│ HTTPS    │ 443      │ 0.0.0.0/0       │ HTTPS                   │
└──────────┴──────────┴─────────────────┴─────────────────────────┘

Outbound Rules:
┌──────────┬──────────┬─────────────────┬─────────────────────────┐
│ Type     │ Port     │ Destination     │ Description             │
├──────────┼──────────┼─────────────────┼─────────────────────────┤
│ All      │ All      │ 0.0.0.0/0       │ 모든 아웃바운드 허용     │
└──────────┴──────────┴─────────────────┴─────────────────────────┘
```

### 5.3 SSH Key Pair

```bash
# Prod 계정에서 새 Key Pair 생성
aws ec2 create-key-pair \
  --key-name nasun-prod-key \
  --query 'KeyMaterial' \
  --output text \
  --profile nasun-prod \
  --region ap-northeast-2 > ~/.ssh/nasun-prod-key.pem

chmod 400 ~/.ssh/nasun-prod-key.pem
```

### 5.4 EC2 생성 명령어

```bash
# 1. VPC 및 Subnet ID 확인
aws ec2 describe-vpcs --profile nasun-prod --region ap-northeast-2
aws ec2 describe-subnets --profile nasun-prod --region ap-northeast-2

# 2. Security Group 생성
aws ec2 create-security-group \
  --group-name nasun-prod-web-sg \
  --description "NASUN Production Web Server" \
  --vpc-id vpc-XXXXXXXX \
  --profile nasun-prod \
  --region ap-northeast-2

# 3. Security Group 규칙 추가
SG_ID="sg-XXXXXXXX"

# SSH
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32 \
  --profile nasun-prod \
  --region ap-northeast-2

# HTTP
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --profile nasun-prod \
  --region ap-northeast-2

# HTTPS
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --profile nasun-prod \
  --region ap-northeast-2

# 4. EC2 인스턴스 생성
aws ec2 run-instances \
  --image-id ami-0c9c942bd7bf113a2 \
  --instance-type t3.small \
  --key-name nasun-prod-key \
  --security-group-ids $SG_ID \
  --subnet-id subnet-XXXXXXXX \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=nasun-prod-web}]' \
  --profile nasun-prod \
  --region ap-northeast-2

# 5. Elastic IP 할당
aws ec2 allocate-address \
  --domain vpc \
  --profile nasun-prod \
  --region ap-northeast-2

# 6. Elastic IP 연결
aws ec2 associate-address \
  --instance-id i-XXXXXXXX \
  --allocation-id eipalloc-XXXXXXXX \
  --profile nasun-prod \
  --region ap-northeast-2
```

---

## 6. 배포 파이프라인 설정

### 6.1 EC2 초기 설정 스크립트

```bash
#!/bin/bash
# setup-prod-ec2.sh
# Prod EC2 인스턴스 초기 설정

set -e

echo "=== NASUN Prod EC2 Setup ==="

# 1. 시스템 업데이트
sudo dnf update -y

# 2. 필수 패키지 설치
sudo dnf install -y git nginx

# 3. Node.js 20 설치
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# 4. pnpm 설치
sudo npm install -g pnpm

# 5. 배포 디렉토리 생성
sudo mkdir -p /var/www/nasun
sudo chown -R ec2-user:ec2-user /var/www/nasun

# 6. Nginx 설정
sudo tee /etc/nginx/conf.d/nasun.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name nasun.io www.nasun.io;

    # HTTPS 리다이렉트
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nasun.io www.nasun.io;

    # SSL 인증서 (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/nasun.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nasun.io/privkey.pem;

    # SSL 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # 정적 파일 서빙
    root /var/www/nasun/dist;
    index index.html;

    # SPA 라우팅
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 캐싱 설정
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip 압축
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
EOF

# 7. Certbot 설치 (Let's Encrypt)
sudo dnf install -y certbot python3-certbot-nginx

# 8. Nginx 시작
sudo systemctl enable nginx
sudo systemctl start nginx

echo "=== Setup Complete ==="
echo "Next: Run certbot for SSL certificate"
echo "sudo certbot --nginx -d nasun.io -d www.nasun.io"
```

### 6.2 배포 스크립트

```bash
#!/bin/bash
# deploy-prod.sh
# 프로덕션 배포 스크립트 (로컬에서 실행)

set -e

PROD_HOST="ec2-user@PROD_EC2_IP"
PROD_KEY="~/.ssh/nasun-prod-key.pem"
DEPLOY_PATH="/var/www/nasun"

echo "=== NASUN Production Deployment ==="

# 1. 프로덕션 빌드
echo "[1/4] Building production..."
cd /home/naru/my_apps/nasun-apps/nasun-website/frontend
pnpm install
pnpm build

# 2. 빌드 결과물 압축
echo "[2/4] Compressing build..."
tar -czf dist.tar.gz dist/

# 3. EC2로 전송
echo "[3/4] Uploading to production EC2..."
scp -i $PROD_KEY dist.tar.gz $PROD_HOST:/tmp/

# 4. 원격 배포
echo "[4/4] Deploying on EC2..."
ssh -i $PROD_KEY $PROD_HOST << 'ENDSSH'
cd /var/www/nasun
rm -rf dist
tar -xzf /tmp/dist.tar.gz
rm /tmp/dist.tar.gz
sudo systemctl reload nginx
echo "Deployment complete!"
ENDSSH

# 정리
rm dist.tar.gz

echo "=== Deployment Successful ==="
echo "Visit: https://nasun.io"
```

### 6.3 환경 변수 파일 (.env.production)

```bash
# frontend/.env.production
# Prod 계정의 API Gateway 엔드포인트 사용

# ===== Core Settings =====
VITE_APP_ENV=production
VITE_APP_NAME=NASUN

# ===== API Endpoints (Prod Account) =====
# API Gateway ID는 Prod 계정 배포 후 확인 필요
VITE_API_BASE_URL=https://PROD_API_ID.execute-api.ap-northeast-2.amazonaws.com/prod

# Authentication
VITE_TWITTER_AUTH_API=https://PROD_API_ID.execute-api.ap-northeast-2.amazonaws.com/prod/auth/twitter
VITE_METAMASK_AUTH_API=https://PROD_API_ID.execute-api.ap-northeast-2.amazonaws.com/prod/auth/metamask

# Leaderboard
VITE_LEADERBOARD_API=https://PROD_API_ID.execute-api.ap-northeast-2.amazonaws.com/prod/api/leaderboard

# NFT Event
VITE_BATTALION_NFT_API=https://PROD_API_ID.execute-api.ap-northeast-2.amazonaws.com/prod/event

# ... (기타 환경 변수)

# ===== Feature Flags =====
VITE_ENABLE_METAMASK_LOGIN=true
VITE_ENABLE_TWITTER_LOGIN=true

# ===== Ethereum (Mainnet) =====
VITE_ETHEREUM_CHAIN_ID=1
VITE_ETHEREUM_NETWORK_NAME=Ethereum Mainnet

# ===== Target Account =====
VITE_TARGET_TWEET_ACCOUNT=Nasun_io
```

---

## 7. DNS 전환

### 7.1 현재 DNS 설정 확인

```bash
# Route 53 Hosted Zone 확인
aws route53 list-hosted-zones

# 현재 A 레코드 확인
aws route53 list-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --query "ResourceRecordSets[?Name=='nasun.io.']"
```

### 7.2 DNS 레코드 변경

```bash
# change-dns.json
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "nasun.io",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [
          {
            "Value": "NEW_PROD_EC2_ELASTIC_IP"
          }
        ]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "www.nasun.io",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [
          {
            "Value": "NEW_PROD_EC2_ELASTIC_IP"
          }
        ]
      }
    }
  ]
}

# DNS 변경 적용
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch file://change-dns.json
```

### 7.3 DNS 전파 확인

```bash
# DNS 전파 상태 확인
dig nasun.io +short
dig www.nasun.io +short

# 또는 온라인 도구
# https://www.whatsmydns.net/#A/nasun.io
```

---

## 8. 검증 체크리스트

### 8.1 인프라 검증

- [ ] EC2 인스턴스 Running 상태
- [ ] Elastic IP 연결 확인
- [ ] Security Group 규칙 적용 확인
- [ ] SSH 접속 가능
- [ ] Nginx 서비스 Running

### 8.2 애플리케이션 검증

- [ ] HTTPS 접속 가능 (https://nasun.io)
- [ ] HTTP → HTTPS 리다이렉트 작동
- [ ] 모든 페이지 로딩 정상
- [ ] SPA 라우팅 작동 (/leaderboard, /my-account 등)
- [ ] 정적 파일 캐싱 헤더 확인

### 8.3 API 연동 검증

- [ ] Twitter 로그인 작동
- [ ] MetaMask 로그인 작동
- [ ] Google 로그인 작동
- [ ] 리더보드 데이터 로딩
- [ ] My Account 페이지 정상
- [ ] NFT Event 페이지 정상

### 8.4 성능 검증

- [ ] 페이지 로드 시간 < 3초
- [ ] Lighthouse 점수 > 80
- [ ] API 응답 시간 < 500ms

---

## 9. 롤백 계획

### 9.1 DNS 롤백 (5분)

문제 발생 시 DNS를 기존 Dev 계정 EC2로 되돌립니다.

```bash
# rollback-dns.json
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "nasun.io",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [
          {
            "Value": "OLD_DEV_EC2_IP"
          }
        ]
      }
    }
  ]
}

aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch file://rollback-dns.json
```

### 9.2 Dev 계정 EC2 재시작 (비상용)

```bash
# Dev 계정의 Stopped된 Prod EC2 시작
aws ec2 start-instances \
  --instance-ids i-DEV_PROD_EC2_ID \
  --region ap-northeast-2
```

### 9.3 롤백 기준

다음 상황에서 롤백 진행:

1. 전체 사이트 접속 불가 (5분 이상)
2. 핵심 기능 장애 (로그인, 리더보드)
3. API 연동 전면 실패
4. SSL 인증서 문제

---

## 10. 비용 분석

### 10.1 예상 월 비용 (Prod 계정)

| 리소스 | 사양 | 월 비용 (USD) |
|--------|------|--------------|
| EC2 t3.small | 24/7 운영 | ~$15.18 |
| EBS 20GB gp3 | 스토리지 | ~$1.60 |
| Elastic IP | 연결된 상태 | $0 |
| 데이터 전송 | ~50GB/월 | ~$4.50 |
| **합계** | | **~$21.28** |

### 10.2 비용 비교

| 항목 | 현재 (Dev 계정) | 마이그레이션 후 |
|------|----------------|----------------|
| Staging EC2 | Dev 계정 청구 | Dev 계정 청구 |
| Production EC2 | Dev 계정 청구 | **Prod 계정 청구** |
| 총 비용 | 동일 | 동일 |
| 비용 추적 | 혼재 | **명확히 분리** |

### 10.3 비용 최적화 옵션

1. **Reserved Instance**: 1년 약정 시 ~30% 할인
2. **Savings Plans**: 유연한 할인 옵션
3. **Spot Instance**: 비권장 (프로덕션 안정성)

---

## 부록: 유용한 명령어

### EC2 접속

```bash
# Prod EC2 SSH 접속
ssh -i ~/.ssh/nasun-prod-key.pem ec2-user@PROD_EC2_IP

# Staging EC2 SSH 접속 (기존)
ssh -i ~/.ssh/nasun-key.pem ec2-user@STAGING_EC2_IP
```

### 로그 확인

```bash
# Nginx 액세스 로그
sudo tail -f /var/log/nginx/access.log

# Nginx 에러 로그
sudo tail -f /var/log/nginx/error.log

# 시스템 로그
sudo journalctl -u nginx -f
```

### 서비스 관리

```bash
# Nginx 재시작
sudo systemctl restart nginx

# Nginx 설정 테스트
sudo nginx -t

# Nginx 상태 확인
sudo systemctl status nginx
```

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.0.0 | 2025-12-12 | 초안 작성 | Claude Code |

---

## 관련 문서

- [CLAUDE.md](../CLAUDE.md) - 프로젝트 메인 문서
- [cdk/README.md](../cdk/README.md) - CDK 배포 가이드
- [API_ENDPOINT_SYNC_GUIDE.md](API_ENDPOINT_SYNC_GUIDE.md) - API 엔드포인트 동기화 가이드
