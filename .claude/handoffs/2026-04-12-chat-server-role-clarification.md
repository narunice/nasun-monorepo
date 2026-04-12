# Handoff: nasun/pado chat-server 역할 분석 (다른 세션 인계용)

**생성**: 2026-04-12 KST
**브랜치**: main
**관련 plan (분석 보고서)**: [/home/naru/.claude/plans/flickering-yawning-parnas.md](/home/naru/.claude/plans/flickering-yawning-parnas.md)
**선행 handoff**:
- [2026-04-11-unified-chat-phase2b-complete.md](.claude/handoffs/2026-04-11-unified-chat-phase2b-complete.md) -- Unified Chat hub 설계
- [2026-04-12-points-audit-followup.md](.claude/handoffs/2026-04-12-points-audit-followup.md) -- Ecosystem Points 보강

## 본 세션의 목적

사용자 요청: "파도 챗서버가 잔존하는 역할이 있는지 확인하고 헬스체크/구조를 정리". `/health-check` 실행에서 `pado-chat-server` PM2 stopped를 502로 오인하며 시작.

## 현재 상태 요약

5회 plan 개정(v1~v5) 후 사용자 지시로 **모든 plan 백지화**. plan 파일은 현재 **실행 plan이 아닌 "사실 분석 보고서"** 형태로 보관. 다음 세션이 α/β/γ 방향 선택 후 새 plan 작성부터 이어가면 됨.

## 핵심 발견 (반드시 읽을 것)

### 선행 작업이 로드되지 않아 plan이 계속 뒤집힘

본 세션 plan v1~v5 모두 **2026-04-10~12에 완료된 Unified Chat Phase 2b/2c + Ecosystem Points Audit을 모르고 출발**. 그 결과 이미 완료된 변경을 재제안하거나 설계 의도와 역방향 plan을 수립함.

**Unified Chat Phase 2b/2c 완료 사실 (2026-04-11)**:
- nasun-chat-server를 chat WS + leaderboard REST + indexer + aggregator + market narrator **통합 hub**로 승격 완료
- pado-chat-server는 **의도적으로 PM2 stopped** (Phase 2c)
- leaderboard.db 2.5GB를 pado → nasun으로 **이관 완료** (WAL checkpoint + integrity check)
- pado frontend `VITE_CHAT_HTTP_URL=https://nasun.io/chat` **전환 완료**
- nasun.io CloudFront `/chat/*` behavior 추가, nasun.io nginx `/chat/`, `/ws/chat` 프록시 port 3101 라우팅 추가
- 정책 명시: "pado의 `/var/www/pado-chat-server/data/leaderboard.db`는 삭제하지 않음" (보존)

**Ecosystem Points Audit 완료 사실 (2026-04-12)**:
- explorer-api의 Ecosystem Points 시스템(PostgreSQL, daily missions 7종)은 nasun-chat-server의 `trader_points`(DEX 4-factor)와 **완전 별개**
- 이름 충돌 주의: "points"가 두 시스템에 혼재. 사용자 정책 "point=nasun 통합 point 전용"은 **Ecosystem Points만 지칭**

### 두 chat server 현재 역할

**nasun-chat-server (port 3101, 라이브, 통합 hub)**:
- WS chat (`/ws/chat`) - nasun.io + pado.finance 공용
- Leaderboard REST (`/api/leaderboard/*`, `.../points`, `.../snapshots`, `.../trader/:addr/*`)
- Trade/Order/CostBasis REST (`/api/trades/*`, `/api/orders/*`)
- Competition REST (`/api/competitions[/...]`)
- Activity Feed (`/api/feed`)
- DeepBook indexer, aggregator 60s, daily snapshot KST 09:00, market narrator, price tracker
- `/api/chat-participation` (explorer-api chat-scanner 소비)
- DB: chat.db + leaderboard.db 2.5GB (trader_points 4-factor, points_snapshots, fills, orders)

**pado-chat-server (port 3100, 의도적 stopped)**:
- PM2 stopped, 트래픽 0
- 보존 정책: `/var/www/pado-chat-server/data/` 삭제 금지 (handoff 명시)
- 코드상 nasun-chat-server에 미이식된 것: **Score 시스템** (`trader_scores`, `/api/leaderboard/score`, weekly/alltime scope)

### 식별된 깨진 것 7건 (fact-based)

1. **pado.finance Leaderboard "Score" 탭 404 → 빈 화면**. frontend([useLeaderboard.ts:73](apps/pado/frontend/src/features/leaderboard/hooks/useLeaderboard.ts#L73))는 있지만 nasun-chat-server에 `/api/leaderboard/score` 미이식
2. **[settle-pado.ts:34](apps/network-explorer/api-server/src/scripts/settle-pado.ts#L34) `PADO_POINTS_URL` = `https://pado.finance/chat/api/leaderboard/points`** → pado.finance nginx가 port 3100(stopped)로 라우팅 → **502**. Unified Chat 전환이 이 스크립트에 미반영. `nasun.io/chat`으로 변경 필요
3. **explorer-api `CHAT_SERVER_URLS` env에 pado-chat-server URL 포함 시** `/api/chat-participation` 빈 응답. nasun-chat-server URL만 남기면 해결 (Unified Chat 후속 작업)
4. **pado.finance nginx `/chat/`, `/ws` 블록이 port 3100(stopped) 가리킴**. 실트래픽 0(frontend는 nasun.io 호출)이지만 port 3100 재기동 시 외부 WS chat 노출 잠재 위험
5. **모노레포 [apps/pado/chat-server/](apps/pado/chat-server/) 소스 정리 미결정** (Unified Chat Phase 2b에서 nasun으로 이식된 원본)
6. **헬스체크 SKILL.md**: 이전 세션에서 "pado-chat-server stopped = 정상" 문구 추가됨. pado-chat-server 최종 정리 시 PM2 체크 자체 제거 필요. 본 세션 수정분이 이미 적용되어 있음
7. **Score의 weekly scope**: pado-chat-server에만 구현된 weekly window를 nasun-chat-server로 이식하려면 aggregator에 별도 window 계산 추가 필요. trader_points는 cumulative만

### 사용자 의도의 역사

세션 내 사용자가 제시한 방향이 여러 번 전환됨. plan이 복잡해진 주원인:

| # | 요지 | 특이점 |
|---|------|------|
| 1 | 헬스체크 고쳐 | 초기 소범위 |
| 2 | 파도 챗서버 잔존 역할 확인 | Score 404 발견 |
| 3 | 근본 해결, 임시처방 금지 | 구조 해결 지향 |
| 4 | Pado Points 계속 운영, pado-only는 pado에서, rename | **Unified Chat 설계와 반대** |
| 5 | 전부 분리, 가장 깨끗 | 빅뱅 |
| 6 | 안전 최우선, 데이터 손상 금지 | 위험 회피 |
| 7 | 공통=nasun, pado-only=pado | #4 재확인 |
| 8 | 최근 보강 작업 확인 | Ecosystem Points 맥락 노출 |
| 9 | 백지화, 역할 분석부터 다시 | **현재 단계** |

**해석**: #4, #7은 Unified Chat 설계(nasun=hub)와 정반대. 사용자가 Unified Chat 작업을 기억 못 하거나 방향 전환 의도. 다른 세션이 이걸 확실히 할 필요.

## 미완료 작업 / 다음 세션 결정 포인트

### 결정 1: 방향 선택 (plan 파일에 비교표)

- **α**: Unified Chat 수용 + 깨진 7건 수선 (소규모, 낮은 위험, 설계 정합)
- **β**: Unified Chat 부분 되돌림 — pado-only를 pado-data-server로 역이관 (대규모, 높은 위험, 역행)
- **γ**: β를 단계적으로 (수개월, 중간 위험, 부분 역행)

사용자에게 명시적 confirm 필요. α라면 plan 간단, β/γ라면 leaderboard.db 재분리/dual indexer/CloudFront 재설정 등 Critical 위험 누적.

### 결정 2: 범위

방향 선택 후 이번 세션(다른 세션) 범위로 깨진 1~7 중 어디까지. 권장은:
- 1 (Score 부활) + 2 (settle-pado URL) + 3 (CHAT_SERVER_URLS 정리): 한 PR 묶어서
- 4 (nginx 정리) + 5 (소스 정리) + 6 (SKILL.md): 별도 cleanup PR
- 7 (weekly scope): future work

### 결정 3: Score 탭 weekly scope 처리

- (a) frontend에서 weekly 임시 비활성화 ("Coming Soon")
- (b) nasun에 weekly window 정식 구현
- (c) Score 탭 자체 제거

## 중요 컨텍스트

### 결정사항
- **plan v1~v5 모두 백지화**. [flickering-yawning-parnas.md](/home/naru/.claude/plans/flickering-yawning-parnas.md)는 현재 "사실 분석 보고서"
- **Unified Chat 설계 실재함**: 2026-04-11 handoff에 상세. 다음 세션은 **반드시 이 handoff부터 읽고 시작**
- **Ecosystem Points와 trader_points는 별개 시스템**: 이름이 겹쳐 혼동 위험. 사용자 "point=nasun 전용" 정책은 **Ecosystem Points만** 지칭

### 주의사항
- **leaderboard.db 이관 완료 상태**: 다시 분리하면 dual indexer 중복, DB schema drift, auth 분리 등 Critical 위험 누적(이전 plan review에서 13건 Critical 지적)
- **pado-chat-server `/var/www/pado-chat-server/data/` 삭제 절대 금지** (Unified Chat handoff 명시적 정책)
- **pado frontend는 이미 nasun.io/chat 호출**. baseUrl 재전환은 Unified Chat 되돌림에 해당
- **nginx pado.finance.conf의 /chat/, /ws는 dead 라우팅**. 제거 전 외부 caller access log 30일 확인 필수
- **본 세션 내 수정된 파일은 plan 파일 하나뿐**. 코드 변경 없음 (plan mode 유지)

### 파일 위치

**분석 결과**:
- [/home/naru/.claude/plans/flickering-yawning-parnas.md](/home/naru/.claude/plans/flickering-yawning-parnas.md) -- 역할 분석 보고서 (plan 아님)

**선행 작업 handoffs (필독)**:
- [2026-04-11-unified-chat-phase2b-complete.md](.claude/handoffs/2026-04-11-unified-chat-phase2b-complete.md) -- Unified Chat 완료
- [2026-04-12-points-audit-followup.md](.claude/handoffs/2026-04-12-points-audit-followup.md) -- Ecosystem Points 보강

**코드 참조**:
- nasun-chat-server 소스: [apps/nasun-website/chat-server/](apps/nasun-website/chat-server/)
- pado-chat-server 소스 (stopped, 정리 미결정): [apps/pado/chat-server/](apps/pado/chat-server/)
- pado frontend Leaderboard: [apps/pado/frontend/src/pages/LeaderboardPage.tsx](apps/pado/frontend/src/pages/LeaderboardPage.tsx), [features/leaderboard/](apps/pado/frontend/src/features/leaderboard/)
- explorer-api settle-pado: [apps/network-explorer/api-server/src/scripts/settle-pado.ts:34](apps/network-explorer/api-server/src/scripts/settle-pado.ts#L34)
- explorer-api chat-scanner: [apps/network-explorer/api-server/src/scanner/chat-scanner.ts](apps/network-explorer/api-server/src/scanner/chat-scanner.ts)
- 헬스체크 스킬: [.claude/skills/health-check/SKILL.md](.claude/skills/health-check/SKILL.md)

**pado frontend Score 관련 (방향 선택 후 손볼 수 있음)**:
- [useLeaderboard.ts:67-95](apps/pado/frontend/src/features/leaderboard/hooks/useLeaderboard.ts#L67) `fetchScoreLeaderboard`, `useScoreLeaderboard`
- [components/ScopeSelector.tsx](apps/pado/frontend/src/features/leaderboard/components/ScopeSelector.tsx) -- weekly/alltime 토글
- [components/ModeSelector.tsx](apps/pado/frontend/src/features/leaderboard/components/ModeSelector.tsx) -- 4탭 (Activity/Volume/PnL/Score)
- [types.ts:57-89](apps/pado/frontend/src/features/leaderboard/types.ts#L57) `ScoreLeaderboardTrader`, `TraderScoreResponse`, `ScoreLeaderboardResponse`

## 최근 변경 파일 (본 세션)

- `/home/naru/.claude/plans/flickering-yawning-parnas.md` -- plan v1~v5 거쳐 최종 "역할 분석 보고서"로 백지화
- 이 handoff 파일

**commit 없음**. 본 세션은 plan mode 유지, 코드/인프라 변경 0.

**working tree에 남은 무관 변경** (2026-04-12-points-audit-followup handoff가 언급한 별도 작업 in-progress):
- nasun-website/frontend: Cross-app analytics + Creators Appreciation Bonus
- pado/frontend: App.tsx, Footer.tsx, analytics
- network-explorer/api-server: auth/, data/, routes/creators-appreciation, scripts/grant-creators-appreciation-bonus

이들은 다른 작업자의 in-progress. 본 handoff와 무관.

## 즉시 다음 단계

1. **[2026-04-11-unified-chat-phase2b-complete.md](.claude/handoffs/2026-04-11-unified-chat-phase2b-complete.md) 전문 읽기** -- 이걸 모르면 또 같은 실수 반복
2. **[2026-04-12-points-audit-followup.md](.claude/handoffs/2026-04-12-points-audit-followup.md) 읽기** -- Ecosystem Points와 trader_points의 구분 이해
3. **plan 파일 [flickering-yawning-parnas.md](/home/naru/.claude/plans/flickering-yawning-parnas.md) "역할 분석" 섹션 읽기** -- 현재 상태, 깨진 7건, α/β/γ 비교
4. **사용자에게 방향(α/β/γ) 명시 confirm 요청**. 특히 사용자 #4/#7 의도("공통=nasun, pado-only=pado")가 **Unified Chat 설계와 정반대**임을 명확히 하고 재확인
5. 방향 확정 후 새 plan 작성 (이번엔 처음부터 간단하게, 이전 v1~v5 형태 참조 금지)

## 함정 회피 가이드

다음 실수 **하지 말 것** (본 세션에서 반복됨):

- ❌ "pado-chat-server가 stopped니까 레거시" 가정 → Unified Chat Phase 2c의 의도된 결과임
- ❌ "Score를 nasun에 추가 vs pado로 옮김" 이분법 → 이미 nasun이 통합 hub이므로 추가가 자연스러움
- ❌ "pado 기능은 pado에서" 일반화 → Unified Chat 설계와 정반대. 사용자 의도 재확인 전 전제 금지
- ❌ leaderboard.db 분리 제안 → 이미 nasun으로 이관 완료. 되돌리면 Critical 위험 다수
- ❌ pado-chat-server data 디렉토리 삭제 → handoff 명시 보존 정책 위반
- ❌ plan을 크게 시작 → 6회 review 결과 매번 "단순화 필요" 결론. 처음부터 **최소 범위**로 시작
