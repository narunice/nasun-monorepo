# Nasun Creator Posts System - Technical Specification & Analysis

**상태**: 운영 중 (Production)
**최근 업데이트**: 2026-04-15
**핵심 경로**:
- API (User): `POST /v1/creator-posts`, `GET /v1/creator-posts/my`
- API (Admin): `GET/PATCH/POST /admin/creator-posts/*`
- Backend: `apps/nasun-website/cdk/lambda-src/bug-report/` (User), `apps/nasun-website/cdk/lambda-src/bug-report-admin/` (Admin)

---

## 1. 시스템 개요 (System Overview)
Creator Posts 시스템은 크리에이터가 나선 생태계와 관련된 콘텐츠(SNS 게시물, 블로그, 영상 등)의 URL을 제출하면, 어드민이 이를 검토하고 정량적인 에코시스템 포인트를 지급하는 보상 시스템입니다.

## 2. 아키텍처 및 파이프라인 (Architecture & Pipeline)

### 2.1 제출 단계 (Submission Phase)
1. **제출**: 사용자가 웹 UI를 통해 URL과 카테고리 정보를 전송합니다.
2. **저장**: DynamoDB `nasun-creator-posts` 테이블에 `PENDING` 상태로 레코드가 생성됩니다.
3. **상태 관리**: 제출된 포스트는 즉시 `identityId`와 연결되어 사용자의 'My Posts' 목록에 노출됩니다.

### 2.2 관리자 검토 단계 (Admin Review Phase)
1. **목록화**: 관리자가 `CreatorPostsAdmin` 대시보드에서 `PENDING` 상태의 포스트를 확인합니다.
2. **점수 부여 (`PATCH /admin/creator-posts/{postId}/score`)**: 콘텐츠의 질에 따라 1~30점 사이의 점수를 부여하고 `SCORED` 상태로 전환합니다.
3. **거절 (`PATCH /admin/creator-posts/{postId}/reject`)**: 부적절한 콘텐츠는 사유와 함께 거절 처리합니다.
4. **지급 (`POST /admin/creator-posts/{postId}/grant`)**: 최종적으로 점수가 부여된 포스트에 대해 포인트를 승인합니다. 이 단계가 완료되면 포인트는 시스템상 되돌릴 수 없게 확정됩니다.

## 3. 핵심 데이터 파이프라인
*   **원장 관리**: Explorer API의 `/api/v1/points/creator-post-reward` 엔드포인트를 호출하여 `activity_points` 테이블에 포인트를 기록합니다.
*   **카테고리**: 포인트는 `ecosystem-bonus-creator-posts` 카테고리로 귀속되어 관리됩니다.

## 4. 기술적 무결성 및 보안
*   **멱등성 보장**: `grantTxDigest` 필드를 통해 지급 시점에 트랜잭션 식별자를 기록합니다. 관리자가 동일 포스트에 대해 보상을 재시도하더라도 시스템이 이를 식별하여 중복 지급을 원천 차단합니다.
*   **관리자 인증**: Cognito JWT와 `UserProfiles` 테이블의 어드민 역할(role === 'ADMIN')을 검증하여 어드민 API에 대한 접근을 제어합니다.
*   **분산 구조**: 사용자 제출용 API 람다와 관리자용 API 람다를 분리하여 운영하므로 트래픽 급증 시에도 관리자 검토 환경의 안정성을 유지합니다.

---

*본 보고서는 시스템의 기술적 파이프라인과 코드베이스 분석을 기반으로 작성되었습니다.*
