# 새 세션 시작 프롬프트

아래 블록을 새 Claude Code 세션의 첫 메시지로 그대로 붙여넣으세요.

---

`apps/nasun-website/doc/plans/wallet-sync-handoff.md`를 읽고 그대로 구현해줘.

요약:
- 신규 등록한 추가 지갑의 활동이 backend points-scanner의 wallet 캐시 miss 윈도우(최대 10분)에 영구 누락되는 문제를 해결.
- Backend에 webhook endpoint(`/internal/wallet-registered`) + 사용자 sync endpoint(`/v1/ecosystem/sync`) 추가.
- `registerWallet` Lambda가 등록 성공 후 webhook 발사.
- Frontend의 TODAY BREAKDOWN 회전 아이콘이 sync API를 호출하도록 확장.

작업 순서는 핸드오프 문서 "작업 단계 + 공수" 섹션의 7단계 그대로. 각 phase 끝나면 검증 후 다음으로 진행.

제약:
- 새 AWS 리소스 생성 금지 (기존 Lambda/API Gateway 재사용).
- `INTERNAL_INVALIDATE_TOKEN`은 기존 Secrets Manager 시크릿 재사용.
- Staging 검증 통과 전까지 production 배포 금지.
- pnpm 모노레포 규칙 준수 (auth-twitter 류 npm 예외 케이스만 npm).

Phase 7 staging 검증 시나리오로 e2e 통과 확인 후 보고. PR 본문은 핸드오프 문서를 요약해서 작성.

---
