# Nasun Monorepo Skills Marketplace

이 파일은 Claude Code가 **Nasun Monorepo** 프로젝트 내에서 수행할 수 있는 자동화된 작업(Skills)을 정의합니다.
Claude는 아래 정의된 스킬을 참조하여 사용자의 자연어 요청을 정확한 프로젝트 명령어로 변환하여 실행해야 합니다.

---

## 🩺 System Health & Monitoring

### Skill: `check-system-health`

- **Description**: 개발 및 프로덕션 환경의 리더보드 시스템, 파이프라인, OAuth 토큰 상태를 종합적으로 점검합니다.
- **When to use**:
  - "시스템 상태 점검해줘"
  - "오늘 데이터 수집 잘 되고 있어?"
  - "트위터 토큰 만료됐는지 확인해줘"
- **Prerequisites**: AWS Profile (`default`, `nasun-prod`) 설정 필요.
- **Implementation**:
  ```bash
  /home/naru/my_apps/nasun-monorepo/scripts/daily-health-check.sh
  ```

### Skill: `verify-twitter-token`

- **Description**: X(Twitter) API를 직접 호출하여 현재 저장된 OAuth 2.0 토큰이 유효한지 검증합니다.
- **Parameters**:
  - `env`: `default` (dev) or `prod`
- **When to use**:
  - "트위터 로그인 안 되는데 확인해줘"
  - "프로덕션 트위터 토큰 살아있어?"
- **Implementation**:

  ```bash
  # For Dev
  cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk && npx tsx scripts/verify-oauth-token.ts --env=default

  # For Prod
  cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk && AWS_PROFILE=nasun-prod npx tsx scripts/verify-oauth-token.ts --env=prod
  ```

---

## 🚀 DevOps & Deployment

### Skill: `deploy-backend`

- **Description**: Nasun Website의 백엔드(CDK)를 배포하고, 변경된 API 엔드포인트를 프론트엔드 환경변수와 자동으로 동기화합니다.
- **Parameters**:
  - `target`: `dev` (개발계) or `prod` (운영계)
- **When to use**:
  - "백엔드 개발 서버에 배포해줘"
  - "나선 웹사이트 프로덕션 배포 진행해"
- **Implementation**:

  ```bash
  # Dev Deployment
  cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk && pnpm deploy:dev

  # Prod Deployment
  cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk && pnpm deploy:prod
  ```

### Skill: `sync-api-endpoints`

- **Description**: 최근 백엔드 배포 내역을 바탕으로 프론트엔드의 `.env` 파일 내 API Gateway 주소를 최신화합니다.
- **When to use**:
  - "API 주소가 안 맞는 것 같아, 동기화해줘"
  - "배포는 안 하고 엔드포인트만 업데이트해줘"
- **Implementation**:
  ```bash
  cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk && pnpm sync:endpoints
  ```

---

## ⛓️ Blockchain Operations (SUI/Devnet)

### Skill: `nasun-cli`

- **Description**: Nasun Devnet 전용으로 빌드된 SUI 바이너리를 실행합니다. 일반 `sui` 명령어 대신 이 경로를 사용해야 합니다.
- **When to use**:
  - "Devnet 현재 블록 높이 알려줘"
  - "Sui 클라이언트 버전 확인해줘"
  - "컨트랙트 배포 명령 실행해줘"
- **Implementation**:
  ```bash
  /home/naru/my_apps/nasun-devnet/sui/target/release/sui client
  ```

---

## 🔍 Codebase Navigation

### Skill: `find-assets`

- **Description**: 프로젝트 전역에서 이미지, 비디오 등 미디어 자산의 위치를 검색합니다 (node_modules 제외).
- **When to use**:
  - "로고 파일 어디에 있어?"
  - "NFT 이미지 파일들 찾아줘"
- **Implementation**:
  ```bash
  find . -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.svg" -o -name "*.mp4" -o -name "*.webp" \) -not -path "*/node_modules/*" -not -path "*/dist/*"
  ```
