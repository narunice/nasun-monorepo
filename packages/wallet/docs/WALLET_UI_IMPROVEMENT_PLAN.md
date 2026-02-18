# Nasun Wallet UI Improvement Plan

**Version**: 2.5
**Date**: 2026-02-18
**Status**: Phase 2-3 Progressing (Signer Abstraction & Multi-chain Integrated)
**Reference**: 2026 Blockchain Wallet Market Analysis Report

---

## Executive Summary

나선 월렛은 2026년 2월 현재 **기술적 선도성(zkLogin, NSA, Passkey, EVM 지원)**을 확보하였으며, 이를 사용자에게 효과적으로 전달하기 위한 UX 개선이 순조롭게 진행 중임. 특히 `viewModeRouter` 도입을 통한 구조적 개선으로 유지보수성이 대폭 향상되었고, 멀티체인 자산 관리 UX가 통합됨.

---

## 1. 개선 현황 및 성과 (2026-02-18 기준)

### 1.1 주요 완료 사항 (Phase 1 & 2)

| 항목 | 상태 | 설명 |
|------|------|------|
| **드롭다운 메뉴 재구조화** | ✅ 완료 | Quick Actions, Portfolio, Account 섹션 분리 및 계층화 |
| **Recovery Readiness 프레이밍** | ✅ 완료 | Trinity Progress를 "Recovery Readiness"로 변경하여 복구 중심 UX 강화 |
| **온보딩 플로우 최적화** | ✅ 완료 | zkLogin(Quick Start) 최상단 배치 및 "No seed phrase needed" 강조 |
| **Passkey 통합** | ✅ 완료 | WebAuthn 기반 생체 인증 지갑 생성 및 잠금 해제 UI 구현 |
| **멀티체인 UI 통합** | ✅ 완료 | Move(Sui)와 EVM 자산을 한 화면에서 관리하는 Portfolio 및 Assets Tab 구현 |
| **Clear Signing** | ✅ 완료 | 트랜잭션 위험 평가 및 시뮬레이션 결과(Safety Score) 표시 기능 통합 |

### 1.2 구조적 개선 (Structural Refactoring)

- **ViewMode 라우팅 분리**: 2,000라인이 넘던 `WalletConnect.tsx`의 렌더링 로직을 `viewModeRouter.tsx`와 `VIEW_RENDERERS` 맵으로 분리하여 모듈화 성공.
- **컴포넌트 파편화**: `wallet-views/` 디렉토리에 각 기능별(Ledger, Nsa, Assets, History 등) 뷰를 독립된 파일로 분리.
- **Signer 추상화 연동**: 다양한 인증 방식(zkLogin, Local, Ledger, Passkey)을 통합 Signer 인터페이스로 UI에 일관되게 적용.

---

## 2. 채택된 개선 사항 (시장 트렌드 반영)

### 2.1 복구 경험 재설계 (Recovery Readiness)

**시장 인사이트**: 65%의 사용자가 복구 불안으로 월렛 이탈.

**개선 완료**:
- 메뉴 상단에 "X/3 Methods Active" 배지 표시.
- 3/3 달성 시 녹색 체크마크와 함께 "Account Fully Protected" 메시지 노출.
- 복구 설정을 "보안"이 아닌 "계정 유지 능력(Readiness)"으로 포지셔닝.

---

### 2.2 트랜잭션 안전성 (Safety Score)

**시장 인사이트**: Web3 방화벽은 2026년 월렛의 필수 기능.

**구현 완료**:
- `clear-signing` 모듈을 통한 트랜잭션 분석.
- 전송 전 "Safety Score: HIGH/MEDIUM/LOW" 표시.
- 알려지지 않은 주소나 대규모 자산 이동 시 경고 팝업 강화.

---

### 2.3 온보딩: Quick Start vs Traditional

**변경 사항**:
- **Quick Start (Recommended)**: zkLogin을 최상단에 배치하여 신규 사용자 진입 장벽 제거.
- **Traditional Wallet**: 시드 구문을 사용하는 방식을 "Advanced" 또는 "Traditional"로 분리하여 숙련자용으로 포지셔닝.

---

## 3. 진행 중인 과제 (Phase 3 & 4)

### 3.1 플로우(Flow)의 완전한 모달화 (In Progress)

- 현재 `viewMode` 기반 화면 전환을 유지하되, `send`, `receive`, `nasun-link` 등 단발성 작업은 메인 화면을 가리지 않는 **모달 오버레이**로 전환 중.
- 구현 방향: `FlowModal` 공통 컴포넌트 도입 및 라우터 연동.

### 3.2 상황 기반 점진 공개 (In Progress)

- 사용자의 자산 상태나 활동 내역에 따라 필요한 기능을 추천하는 시스템.
- 예: 잔액 0일 때 "Request Faucet" 버튼 강조, NSA 미설정 시 "Upgrade to Smart Account" 배너 노출.

### 3.3 WalletConnect.tsx 최종 분할 (Ongoing)

- 메인 파일의 복잡도를 더 낮추고, 상태 관리 로직(`useWalletConnectState`)을 더 작은 단위의 훅으로 쪼개는 작업 진행 중.

---

## 4. 향후 계획 (Phase 4+)

1. **i18n 인프라 구축**: 한국 사용자 특화를 위한 다국어 지원 인프라 및 한글 UI 적용.
2. **Help & Support 확장**: 인앱 헬프센터 고도화 및 FAQ 연동.
3. **애니메이션 고도화**: 드롭다운 및 뷰 전환 시 Framer Motion 등을 활용한 부드러운 트랜지션 적용.

---

## 5. 성공 지표 업데이트

| 지표 | 목표 | 현재 상태 (추정) |
|------|------|------------------|
| **온보딩 완료율** | 80% | 75% (zkLogin 도입 후 급상승) |
| **Recovery 설정율** | 60% | 45% (지속 상승 중) |
| **WalletConnect.tsx 라인 수** | 1,500 이하 | ~1,200 (라우터 분리 완료) |
| **멀티체인 지원** | Move + 10+ EVM | 완료 (11개 체인 지원) |

---

## 6. 참고 자료

- [WALLET-GUIDE.md](./WALLET-GUIDE.md) - 최신 개발자 가이드
- [viewModeRouter.tsx](../../wallet-ui/src/connect/viewModeRouter.tsx) - 개선된 라우팅 엔진
- [clear-signing/](../../wallet/src/core/clear-signing/) - 트랜잭션 분석 엔진
