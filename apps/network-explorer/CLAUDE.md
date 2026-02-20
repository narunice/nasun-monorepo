# CLAUDE.md (apps/network-explorer)

> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

## UI 컴포넌트 (nasun 브랜딩)

Explorer는 nasun-website의 디자인 시스템을 기반으로 일관된 UI를 제공합니다.

### 컬러 팔레트

| 이름 | 용도 |
|------|------|
| `nasun-c3` | 성공, 긍정 (청록) |
| `nasun-c4` | 기본 인터랙티브 (파랑) |
| `nasun-c5` | 보조 인터랙티브 (진파랑) |
| `nasun-c6` | 다크 컨테이너 (네이비) |

⚠️ **사용 금지**: `nasun-scarlet`, `nasun-coral` (빨간색 - 오류처럼 보임)

### UI 컴포넌트

```
src/components/ui/
├── Card.tsx        # 카드 컨테이너
├── SectionBox.tsx  # 섹션 박스 (타이틀 + 구분선)
└── index.ts
```

### 스타일 가이드

상세 스타일링 규칙은 `doc/UI_STYLING_GUIDE.md` 참조

### NFT 표시 컴포넌트

| 컴포넌트 | 용도 |
|---------|------|
| `NFTMedia` | 이미지/비디오 렌더링 (IPFS 지원) |
| `NFTCard` | NFT 카드 미리보기 (Address 페이지 그리드) |

#### 미디어 유틸리티 (`src/lib/media.ts`)

| 함수 | 용도 |
|------|------|
| `resolveMediaUrl()` | IPFS URL → HTTP 게이트웨이 변환 |
| `getMediaType()` | URL에서 미디어 타입 감지 (image/video) |
| `getDisplayMediaUrl()` | Display 객체에서 우선순위 기반 URL 선택 |
| `isNFTObject()` | NFT 여부 판단 (image_url/animation_url 존재 확인) |

## Project Overview

**Nasun Explorer**는 Nasun Devnet 블록체인을 위한 블록 탐색기입니다.

### 네트워크 정보

| Spec | Value |
|------|-------|
| Project Name | Nasun Explorer |
| Target Network | Nasun Devnet |
| RPC Endpoint (HTTPS) | https://rpc.devnet.nasun.io |
| RPC Endpoint (HTTP) | http://3.38.127.23:9000 |
| Faucet (HTTPS) | https://faucet.devnet.nasun.io |
| Faucet (HTTP) | http://3.38.127.23:5003 |
| Explorer URL | https://explorer.nasun.io/devnet |
| Chain ID | `272218f1` (2026-02-04 V7 리셋) |
| Fork Source | Sui mainnet v1.63.0 |
| Native Token | NASUN (최소단위: SOE) |
| Epoch Duration | 60초 |
| Validators | 2노드 (nasun-node-1, nasun-node-2) |

## 기술 스택

- **빌드 도구**: Vite 7.x
- **프레임워크**: React 19.x + TypeScript 5.9.x
- **라우팅**: React Router DOM
- **UI**: Tailwind CSS 3.4.x
- **SUI SDK**: @mysten/sui
- **상태 관리**: Zustand (UI) + TanStack Query (서버 상태)
- **Package Manager**: pnpm

## 프로젝트 구조

```
apps/network-explorer/
├── src/
│   ├── main.tsx              # 엔트리 포인트
│   ├── App.tsx               # 라우터 설정
│   ├── pages/
│   │   ├── Home.tsx          # 홈 (네트워크 상태, 실시간 갱신)
│   │   ├── Transactions.tsx  # 트랜잭션 목록 (페이지네이션)
│   │   ├── Transaction.tsx   # 트랜잭션 상세
│   │   ├── Object.tsx        # 객체 상세
│   │   ├── Address.tsx       # 주소 상세 (TX 히스토리 포함)
│   │   ├── Validators.tsx    # 검증자 목록 (스테이킹 정보)
│   │   ├── Validator.tsx     # 검증자 상세
│   │   ├── Checkpoints.tsx   # 체크포인트 목록 (페이지네이션)
│   │   ├── Checkpoint.tsx    # 체크포인트 상세
│   │   ├── TopAccounts.tsx   # 잔액 상위 주소 (인덱서 API)
│   │   └── Analytics.tsx     # 네트워크 통계 + 인덱서 메트릭스
│   ├── components/
│   │   ├── ui/               # nasun 브랜딩 UI 컴포넌트
│   │   ├── analytics/        # 인덱서 차트 컴포넌트
│   │   ├── Header.tsx
│   │   ├── InfoRow.tsx
│   │   ├── NFTMedia.tsx      # NFT 미디어 렌더링
│   │   └── NFTCard.tsx       # NFT 카드 (Address 페이지)
│   └── lib/
│       ├── sui-client.ts     # SUI RPC 클라이언트
│       ├── explorer-api.ts   # 인덱서 API 클라이언트
│       ├── format.ts         # 포맷 유틸리티
│       └── media.ts          # NFT 미디어 유틸리티
├── api-server/               # Explorer API (Hono REST, 인덱서 데이터 조회)
├── doc/
│   └── UI_STYLING_GUIDE.md   # UI 스타일링 가이드
├── .env                      # 환경변수 (RPC URL)
└── index.html
```

## 개발 명령어

```bash
# 모노레포 루트에서
pnpm dev:network-explorer     # 개발 서버 시작
pnpm build:network-explorer   # 프로덕션 빌드

# 또는 이 폴더에서
pnpm dev
pnpm build
```

## 환경변수

```env
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=272218f1
VITE_FAUCET_URL=https://faucet.devnet.nasun.io
```

## 주요 기능

1. **홈페이지**: 네트워크 상태 (5초 자동 갱신), 최근 TX (10초 자동 갱신)
2. **트랜잭션 목록**: `/transactions` 페이지 (cursor 기반 페이지네이션)
3. **트랜잭션 조회**: TX Digest로 상세 정보 조회
4. **객체 조회**: Object ID로 상세 정보 조회
5. **주소 조회**: 잔액, 소유 객체, **트랜잭션 히스토리** (최근 20개)
6. **검색 기능**: TX, Object, Address 통합 검색
7. **지갑 기능**: 내장 지갑 (생성/백업/복구/전송/Faucet)
8. **검증자 페이지**: 네트워크 스테이킹 요약, 검증자 목록 (APY, Commission, Stake)
9. **체크포인트 페이지**: 체크포인트 목록, 상세 정보 (TX 포함, 가스 비용)

### 라우트 구조

| 경로 | 설명 |
|------|------|
| `/` | 홈 (네트워크 상태, 최근 TX) |
| `/transactions` | TX 목록 (페이지네이션) |
| `/tx/:digest` | TX 상세 |
| `/object/:id` | 객체 상세 |
| `/address/:addr` | 주소 상세 (잔액, 객체, TX 히스토리) |
| `/validators` | 검증자 목록 (스테이킹 요약) |
| `/validator/:address` | 검증자 상세 |
| `/checkpoints` | 체크포인트 목록 (페이지네이션) |
| `/checkpoint/:sequence` | 체크포인트 상세 |
| `/top-accounts` | 잔액 상위 주소 (인덱서 API) |
| `/analytics` | 네트워크 통계 + 인덱서 메트릭스 |

## 지갑 기능

지갑 기능은 모노레포의 공통 패키지를 사용하여 구현되었습니다.

- **로직**: `@nasun/wallet` (Zustand 상태 관리, SUI 클라이언트)
- **UI**: `@nasun/wallet-ui` (연결 버튼, 잔액 표시 등)

상세 내용은 루트 [CLAUDE.md](../../CLAUDE.md)의 패키지 설명을 참조하세요.

## 배포된 스마트 컨트랙트

> **참고**: 2026-01-27 V6 리셋으로 이전 컨트랙트는 무효화되었습니다.
> 컨트랙트 주소는 `packages/devnet-config/devnet-ids.json` 참조

## RPC 테스트 명령어

```bash
# Chain ID 확인
curl -X POST http://3.38.127.23:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getChainIdentifier","params":[]}'

# 최신 체크포인트
curl -X POST http://3.38.127.23:9000 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getLatestCheckpointSequenceNumber","params":[]}'

# Faucet 토큰 요청
curl -X POST http://3.38.127.23:5003/gas \
  -H "Content-Type: application/json" \
  -d '{"FixedAmountRequest":{"recipient":"<YOUR_ADDRESS>"}}'
```

## Explorer API Server (인덱서 기반)

Explorer API는 sui-indexer가 인덱싱한 PostgreSQL 데이터를 REST API로 제공합니다.
이 인프라는 Explorer 전용이 아닌 **Nasun 프로젝트 공유 인프라**입니다 (상세: 루트 CLAUDE.md 참조).

### API 서버 구조

```
api-server/
├── src/
│   ├── index.ts       # Hono app + CORS + graceful shutdown
│   ├── db.ts          # postgres.js 커넥션 (DATABASE_URL 환경변수)
│   ├── cache.ts       # In-memory TTL 캐시 (thundering herd 방지)
│   └── routes/
│       ├── health.ts  # GET /api/v1/health
│       └── stats.ts   # GET /api/v1/stats/* (top-accounts, daily-transactions, etc.)
├── package.json       # @nasun/explorer-api
└── ecosystem.config.cjs  # PM2 config (PORT=3200)
```

### 엔드포인트

| 메서드 | 경로 | 설명 | 캐시 TTL |
|--------|------|------|---------|
| GET | `/api/v1/health` | DB + 체크포인트 상태 | 없음 |
| GET | `/api/v1/stats/top-accounts?limit=50` | 잔액 상위 주소 | 5분 |
| GET | `/api/v1/stats/daily-transactions?range=7d` | 일별 TX 수 | 5분 |
| GET | `/api/v1/stats/active-addresses?range=7d` | 일별 활성 주소 수 | 5분 |
| GET | `/api/v1/stats/network-summary` | 총 TX/주소/패키지/이벤트 | 30초 |

- `limit` 파라미터: whitelist `[25, 50, 100, 200]`으로 캐시 키 정규화
- `range` 파라미터: `7d`, `14d`, `30d` 지원

### 배포 (EC2 node-2)

```bash
# 1. API 서버 코드 rsync (node_modules, .env 제외)
rsync -avz --exclude node_modules --exclude .env \
  apps/network-explorer/api-server/ \
  -e "ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem" \
  ubuntu@3.38.76.85:~/explorer-api/

# 2. SSH 접속 후 의존성 설치 + PM2 재시작
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@3.38.76.85
cd ~/explorer-api && npm install
set -a && source .env && set +a
pm2 restart explorer-api --update-env

# 3. 헬스체크 확인
curl http://localhost:3200/api/v1/health
```

### 환경 변수 (node-2 .env)

```env
DATABASE_URL=postgresql://sui_indexer:<password>@localhost:5432/sui_indexer
```

> **보안**: `.env` 파일은 `chmod 600`, `ecosystem.config.cjs`에는 DB 자격 증명 미포함

### 프론트엔드 클라이언트

`src/lib/explorer-api.ts`에서 API 호출. base URL은 `VITE_EXPLORER_API_URL` 또는 기본값 `/api/v1`.
Production에서는 nginx가 `/api/v1/*`을 node-2:3200으로 프록시하므로 CORS 없음.

---

## 배포 정보

| 항목 | 값 |
|------|-----|
| 프론트엔드 호스팅 | Production EC2 (43.200.67.52) + nginx |
| API 서버 호스팅 | EC2 node-2 (3.38.76.85) + PM2 |
| Staging | https://staging.explorer.nasun.io/devnet |
| Production | https://explorer.nasun.io/devnet |
| API Production | https://explorer.nasun.io/api/v1 (nginx → node-2:3200) |

### 배포 명령어

```bash
# 프론트엔드 배포 (모노레포 루트에서)
pnpm deploy:network-explorer:staging   # 스테이징 배포
pnpm deploy:network-explorer:prod      # 프로덕션 배포

# 옵션
pnpm deploy:network-explorer:prod -- --dry-run   # 빌드만, 배포 안함
pnpm deploy:network-explorer:prod -- --force     # 확인 프롬프트 건너뛰기
pnpm deploy:network-explorer:prod -- --rollback  # 이전 버전으로 롤백
```
