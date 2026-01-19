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
| Explorer URL | https://explorer.devnet.nasun.io |
| Chain ID | `6681cdfd` (2025-12-25 V3 리셋) |
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
│   │   └── Checkpoint.tsx    # 체크포인트 상세
│   ├── components/
│   │   ├── ui/               # nasun 브랜딩 UI 컴포넌트
│   │   ├── Header.tsx
│   │   ├── InfoRow.tsx
│   │   ├── NFTMedia.tsx      # NFT 미디어 렌더링
│   │   └── NFTCard.tsx       # NFT 카드 (Address 페이지)
│   └── lib/
│       ├── sui-client.ts     # SUI RPC 클라이언트
│       ├── format.ts         # 포맷 유틸리티
│       └── media.ts          # NFT 미디어 유틸리티
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
VITE_SUI_RPC_URL=http://3.38.127.23:9000
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=6681cdfd
VITE_FAUCET_URL=http://3.38.127.23:5003
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

## 지갑 기능

지갑 기능은 모노레포의 공통 패키지를 사용하여 구현되었습니다.

- **로직**: `@nasun/wallet` (Zustand 상태 관리, SUI 클라이언트)
- **UI**: `@nasun/wallet-ui` (연결 버튼, 잔액 표시 등)

상세 내용은 루트 [CLAUDE.md](../../CLAUDE.md)의 패키지 설명을 참조하세요.

## 배포된 스마트 컨트랙트

> **참고**: 2025-12-25 V3 리셋으로 이전 컨트랙트는 무효화되었습니다.
> 새로운 컨트랙트 배포 시 이 섹션을 업데이트하세요.

| 컨트랙트 | Package ID | 설명 |
|---------|------------|------|
| (없음) | - | V3 리셋 후 재배포 필요 |

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

## 배포 정보

| 항목 | 값 |
|------|-----|
| 호스팅 | AWS Amplify |
| AWS 계정 | Nasun Devnet (150674276464) |
| App ID | `dhfb0bozwjtqj` |
| GitHub | https://github.com/narunice/nasun-monorepo |
| 자동 배포 | main 브랜치 push 시 자동 빌드/배포 |

### 배포 명령어

```bash
# main 브랜치에 push하면 자동 배포
git push origin main

# 수동 배포 (AWS CLI)
aws amplify start-job --app-id dhfb0bozwjtqj --branch-name main --job-type RELEASE --profile nasun-dlt
```
