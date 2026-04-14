# Handoff: Nasun + Pado Umami Analytics Unification

**생성**: 2026-04-14
**브랜치**: main
**이전 핸드오프**: 없음 (신규)
**플랜**: [/home/naru/.claude/plans/majestic-coalescing-bee.md](/home/naru/.claude/plans/majestic-coalescing-bee.md) (승인됨)

## 현재 상태 요약

Pado(pado.finance)와 Nasun(nasun.io)의 Umami website ID를 단일 ID로 통합하여 생태계 통합 통계 + hostname 필터 기반 사이트별 분리 뷰를 얻는 플랜이 승인된 상태. 2차례 `/review` 통해 v3까지 반복 개선 완료. 코드 변경은 Pado `data-website-id` 1줄 스왑이 전부이며, 대부분의 작업은 Pre-Flight 체크리스트 7단계로 구성. `/dev/stat` 투자자 대시보드는 별도 플랜으로 분리됨 (공개/비공개 결정 보류).

## 완료된 작업

- [x] Pado 현재 배포 구조 파악 (EC2 + nginx + CloudFront)
- [x] 두 사이트 Umami website ID 식별
  - nasun.io: `9fea5a9d-feac-48a7-88e3-e87783f29b5b`
  - pado.finance: `fcf0ce34-acb4-4cee-b1db-f76a9ab28e69`
- [x] 통합 방식 확정: 단일 website ID + hostname 필터 (Option A lambda/DynamoDB 스택 제거)
- [x] 3차례 독립 에이전트 리뷰 통합 후 v3 플랜 최종화
- [x] `cross_app_nav` 커스텀 이벤트 드롭 결정 (referrer로 충분)
- [x] `/dev/stat` 투자자 대시보드 별도 플랜으로 분리

## 미완료 작업

### 내가 바로 실행 가능한 Pre-Flight 항목
- [ ] **#3 CSP 감사**: Pado `index.html` 및 `vite.config.ts`에서 `script-src`, `connect-src`에 `https://analytics.nasun.io` 포함 여부 확인 (staging/prod env override 포함)
- [ ] **#4 Pado 호스트네임 열거**: pado 배포 설정을 grep해서 allowlist에 추가할 전체 hostname 목록 작성 (staging.pado.finance, preview/branch deploy 호스트 등)
- [ ] **#6 이벤트 스키마 목록화**: Pado 커스텀 이벤트 이름 + 속성 타입 전체 나열 (trade, lottery, chat 등). `apps/pado/frontend/src/lib/analytics.ts` 및 `apps/pado/frontend/**/*.ts*` 내 `umami.track()` 호출 전수 조사

### 사용자가 Umami 어드민 UI에서 수행해야 할 것
- [ ] **#1 Umami 버전 확인** (analytics.nasun.io)
- [ ] **#2 Hostname 필터 방식 테스트** (Insights 탭 vs URL `?hostname=` 파라미터)
- [ ] **#4 Umami 어드민 변경**: nasun 웹사이트 "Nasun Ecosystem"으로 rename, `domain` allowlist에 pado 호스트 추가, IP/bot 필터 감사
- [ ] **#5 curl 검증**: pado staging origin에서 `api/send` 호출 → 통합 website에 이벤트 도착 확인 (allowlist 추가 완료 이후에만 의미 있음)
- [ ] **#7 7일 베이스라인 export**: 두 legacy website에서 daily visitors/sessions/bounces/totaltime CSV로 내보내기

### 실제 코드 변경
- [ ] [apps/pado/frontend/index.html:75](apps/pado/frontend/index.html#L75) — `data-website-id` 교체 (**Pre-Flight 전부 통과 후에만**)
- [ ] Pado **staging** 배포
- [ ] 24시간 스테이징 소크 + verification
- [ ] 프로덕션 배포
- [ ] 24시간 post-cutover 모니터링

## 중요 컨텍스트

### 결정사항 및 이유
- **Option A (람다+DynamoDB+APIGW 프록시) 제거**: website ID는 이미 HTML에 노출되어 있어 "숨길 것이 없음". AWS 신규 리소스 0개.
- **`cross_app_nav` 이벤트 드롭**: referrer tracking이 이미 동일 기능 커버. `rel="noopener noreferrer"` 내부 링크 완화만 하면 referrer로 충분. 커스텀 이벤트는 나중에 referrer 부족 시 재추가.
- **`/dev/stat` 페이지 별도 플랜 분리**: Umami share URL 방식은 공개 API가 되어 누구나 polling 가능 → 통계 공개/비공개 결정이 선행되어야 함. 사용자가 결정 보류.
- **단일 PR로 통합** (v2에서 v3로): PR 분할 시 coordination 오버헤드만 증가, `/dev/stat` 이 빠지면서 1줄 변경이므로 분할 의미 없음.

### 주의사항
- **이벤트 스키마 고정 (first-seen)**: Umami는 속성 타입을 first-seen 기준으로 고정. Pado의 기존 `amount: number`가 nasun 쪽 `amount: string`과 충돌하면 통합 후 silent drop 발생. 반드시 Pre-Flight #6에서 diff.
- **Legacy website 삭제 금지**: Pado의 구 website ID `fcf0ce34-...`는 archive로 영구 보존. 롤백 시 revert 1줄이면 즉시 복구.
- **Bounce rate 기계적 하락**: 통합 즉시 bounce rate가 의미 있게 떨어짐. 의도된 동작(cross-app hop이 non-bounce 처리)이지만 pre/post 공개 비교는 피할 것.
- **70–98% 밴드 검증**: 통합 후 24h 유니크 방문자가 legacy 합산의 70–98% 범위 밖이면 investigate/rollback.

### 핵심 파일
- 플랜: [/home/naru/.claude/plans/majestic-coalescing-bee.md](/home/naru/.claude/plans/majestic-coalescing-bee.md)
- 코드 변경 대상: [apps/pado/frontend/index.html:75](apps/pado/frontend/index.html#L75)
- 기존 CSP 위치: [apps/pado/frontend/index.html:38-39](apps/pado/frontend/index.html#L38-L39)
- Pado analytics 래퍼: [apps/pado/frontend/src/lib/analytics.ts](apps/pado/frontend/src/lib/analytics.ts)
- Nasun analytics 래퍼: [apps/nasun-website/frontend/src/lib/analytics.ts](apps/nasun-website/frontend/src/lib/analytics.ts)

## 최근 변경 파일

현재 커밋되지 않은 변경:
- `M apps/nasun-website/frontend/src/sections/myAccount/EcosystemPointsCard.tsx` (본 작업과 무관, 별도 진행 중)

최근 커밋 (context):
- `203d8455` feat(pado/lottery): show jackpot winners with explorer links
- `9d78205e` feat(pado/analytics): bounce-proof cross-app navigation tracking
- `c2aed00a` feat(nasun-website/analytics): bounce-proof cross-app navigation tracking

## 즉시 다음 단계

1. **Pre-Flight #3 (CSP 감사)** 실행: `apps/pado/frontend/index.html`의 CSP meta 태그 + `apps/pado/frontend/vite.config.ts`의 CSP env override 확인. `connect-src`/`script-src`에 `analytics.nasun.io` 포함 여부 검증. 사용자에게 결과 보고.
2. **Pre-Flight #4 (Pado 호스트네임 열거)**: `apps/pado/` 및 `apps/pado/scripts/` 에서 배포 호스트 grep. staging + preview + branch deploy 호스트 목록 작성.
3. **Pre-Flight #6 (이벤트 스키마 목록화)**: `rg 'umami\.track\(' apps/pado/frontend/src/ apps/nasun-website/frontend/src/` 전수 조사. 이벤트 이름 + 속성 타입 표 작성. 충돌 가능성 식별.
4. 위 3개 항목 결과를 사용자에게 보고 → 사용자가 Umami 어드민에서 수동 작업 진행 (Pre-Flight #1, #2, #4 어드민 부분, #5 curl, #7 baseline export).
5. Pre-Flight 전부 통과 확인 → `data-website-id` 스왑 → Pado staging 배포 → 24h 소크 → 프로덕션.
