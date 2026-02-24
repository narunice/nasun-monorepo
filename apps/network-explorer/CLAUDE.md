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

**사용 금지**: `nasun-scarlet`, `nasun-coral` (빨간색 - 오류처럼 보임)

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
| `resolveMediaUrl()` | IPFS URL -> HTTP 게이트웨이 변환 |
| `getMediaType()` | URL에서 미디어 타입 감지 (image/video) |
| `getDisplayMediaUrl()` | Display 객체에서 우선순위 기반 URL 선택 |
| `isNFTObject()` | NFT 여부 판단 (image_url/animation_url 존재 확인) |

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

> 컨트랙트 주소: `packages/devnet-config/devnet-ids.json` 참조

---

## 참조 문서

| 문서 | 설명 |
|------|------|
| [doc/api-server.md](doc/api-server.md) | Explorer API Server (Hono REST, 엔드포인트, 배포) |
| [doc/deployment.md](doc/deployment.md) | 프론트엔드/API 배포 정보, RPC 테스트 명령어 |
| [docs/UI_STYLING_GUIDE.md](docs/UI_STYLING_GUIDE.md) | UI 스타일링 상세 가이드 |
| [docs/EXPLORER_ROADMAP.md](docs/EXPLORER_ROADMAP.md) | 로드맵 및 버전 히스토리 |
