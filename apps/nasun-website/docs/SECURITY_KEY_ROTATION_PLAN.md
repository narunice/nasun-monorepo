# 🔐 보안 키 재설정 종합 가이드 (Security Key Rotation Plan)

**작성일**: 2025-12-15  
**상태**: 🚨 긴급 (Critical)  
**목적**: AI 채팅 등을 통해 유출된 보안 자격 증명을 전면 교체하여 시스템 보안을 복구함.

---

## 📋 대상 자산 요약

### AWS 계정 (3개)
| 계정 ID | 용도 | 프로젝트 | 조치 사항 |
|:---:|:---:|:---:|:---|
| **135808943968** | 개발 (Development) | `nasun-website` | IAM 키 교체, Root MFA 점검 |
| **466841130170** | 프로덕션 (Production) | `nasun-website` | IAM 키 교체, Root MFA 점검 |
| **150674276464** | DevNet | `nasun-devnet`, `nasun-explorer` | IAM 키 교체, Root MFA 점검 |

### 주요 서비스 및 API
- **X (Twitter) API**: `nasun-website` (Login & Leaderboard)
- **Google OAuth**: `nasun-website` (Login)
- **Blockchain APIs**: Alchemy, Etherscan, CoinMarketCap
- **Code Repository**: GitHub (`narunice`)
- **Node Security**: Validator Keys (`nasun-devnet`)

---

## 🚨 1단계: AWS 계정 보안 재설정 (최우선)

**모든 3개 계정(1358..., 4668..., 1506...)에 대해 아래 절차를 반복 수행합니다.**

### 1.1 Root 계정 점검 (Gemini 보완)
1. 각 계정의 **Root 사용자**로 로그인합니다.
2. **MFA(다중 인증)** 가 활성화되어 있는지 확인하고, 재설정합니다.
3. Root 계정 비밀번호를 변경합니다.

### 1.2 IAM 사용자 세션 강제 종료 (Gemini 보완)
1. IAM 콘솔 → **Users** → 사용하는 사용자(예: `nasun-cli`) 선택.
2. **Security credentials** 탭 이동.
3. **Active sessions** 또는 **Console sign-in** 섹션 확인.
4. **"Revoke active sessions"** 버튼을 클릭하여 기존의 모든 활성 세션을 즉시 무효화합니다.

### 1.3 IAM Access Key 교체
1. **Access keys** 섹션 → **Create access key** 클릭 (CLI 선택).
2. 새 Access Key ID와 Secret Access Key를 안전한 곳에 저장.
3. 기존 키(Old)를 **Deactivate(비활성화)** 후 **Delete(삭제)** 합니다.

### 1.4 로컬 자격 증명 업데이트 (`~/.aws/credentials`)
로컬 터미널에서 `aws configure` 명령어를 사용하여 프로필별로 키를 갱신합니다.

```bash
# 계정 1: 135808943968 (개발)
aws configure --profile default
# AWS Access Key ID: [새로운 키]
# AWS Secret Access Key: [새로운 시크릿]

# 계정 2: 466841130170 (프로덕션)
aws configure --profile nasun-prod
# [새로운 키 입력]

# 계정 3: 150674276464 (DevNet)
aws configure --profile nasun-devnet
# [새로운 키 입력]
```

---

## 🐦 2단계: 소셜 및 인증 서비스 키 재설정

### 2.1 X (Twitter) API 재설정
**URL**: [X Developer Portal](https://developer.x.com/en/portal/dashboard)

1. **개발 앱(@Naru010110) & 프로덕션 앱(@Nasun_io)** 각각 접속.
2. **Keys and tokens** 탭에서 아래 항목 **모두 Regenerate**:
   - API Key and Secret
   - Bearer Token
   - Access Token and Secret
   - OAuth 2.0 Client ID and Secret
3. **AWS Secrets Manager 업데이트**:
   - `nasun-twitter-tokens` (Dev) 및 `nasun-twitter-tokens-prod` (Prod) 시크릿 값을 갱신된 키로 업데이트합니다.

### 2.2 Google OAuth 재설정 (Gemini 보완)
**URL**: [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)

1. `nasun-website` 프로젝트 선택.
2. **OAuth 2.0 Client IDs** → 해당 클라이언트 클릭.
3. 상단의 **"RESET SECRET"** 버튼 클릭하여 Client Secret 교체.
4. AWS Cognito Identity Pool 설정(Authentication providers) 및 `.env` 파일에 새 Secret 반영.

---

## 🔗 3단계: 외부 API 및 알림 설정 갱신

### 3.1 블록체인 데이터 API
각 서비스 대시보드에서 기존 키 삭제 후 재생성:
1. **Alchemy**: [Dashboard](https://dashboard.alchemy.com) → App Settings → Rotate Key.
2. **Etherscan**: [API Keys](https://etherscan.io/myapikey) → Delete & Add New.
3. **CoinMarketCap**: [API Dashboard](https://coinmarketcap.com/api/) → Generate New Key.

### 3.2 Webhook URLs (Gemini 보완)
프로젝트 내 모니터링/알림에 사용되는 Webhook이 있다면 교체합니다.
- **Discord/Slack**: 채널 통합 설정에서 기존 Webhook URL 삭제 후 재생성.
- **적용**: `cdk/lib/monitoring-stack.ts` 또는 `.env` 파일 수정.

---

## 🔑 4단계: GitHub 및 코드 저장소 보안

### 4.1 자격 증명 교체
1. **PAT (Personal Access Token)**:
   - Settings → Developer settings → Tokens (classic/fine-grained).
   - 기존 토큰 모두 삭제 후 재생성.
2. **SSH Key (선택 권장)**:
   - 로컬에서 `ssh-keygen -t ed25519`로 새 키 생성.
   - GitHub Settings → SSH and GPG keys에 새 공개키 등록 및 기존 키 삭제.

### 4.2 Git 히스토리 정리 (Gemini 보완: git-filter-repo)
유출된 키가 커밋 기록에 남아있지 않도록 정리합니다. (주의: 팀원들과 협의 필요)

```bash
# 1. 도구 설치 (Python 필요)
pip install git-filter-repo

# 2. 작업용 클론 생성
git clone git@github.com:narunice/nasun-website.git nasun-website-clean
cd nasun-website-clean

# 3. 민감 파일 히스토리 삭제 (.env 파일들)
git filter-repo --path .env --path .env.development --path .env.production --invert-paths

# 4. 강제 푸시
git remote add origin git@github.com:narunice/nasun-website.git
git push --force --all
git push --force --tags
```

---

## ⛓️ 5단계: 프로젝트별 특수 조치

### 5.1 nasun-devnet (블록체인 노드)
1. **검증자 키(Validator Key)** 재생성: `sui keytool generate` 사용.
2. **Genesis** 파일 재생성 및 네트워크 노드 전체 재시작.
   *(기존 키가 유출되었다면 해당 키로 서명된 블록이나 자산은 안전하지 않습니다.)*

### 5.2 WordPress (nasun-website)
1. 관리자 대시보드 접속 → Users → 비밀번호 강제 변경.
2. `frontend/.env.production`의 `VITE_WORDPRESS_PASSWORD` 업데이트.

---

## 📦 6단계: 환경 변수 업데이트 및 배포

### 6.1 로컬 .env 파일 일괄 수정
아래 경로의 파일들을 열어 위에서 재발급받은 모든 키 값으로 교체합니다.
- `/nasun-website/cdk/.env`
- `/nasun-website/frontend/.env.development`
- `/nasun-website/frontend/.env.production`
- `/nasun-website/frontend/.env.staging`

### 6.2 백엔드/인프라 재배포 (필수)
AWS Lambda 및 인프라에 변경된 환경 변수와 Secrets Manager 값을 적용합니다.

```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/cdk

# 개발 환경 배포
pnpm deploy:dev

# 프로덕션 환경 배포
pnpm deploy:prod
```

### 6.3 프론트엔드 빌드 및 배포
```bash
cd /home/naru/my_apps/nasun-apps/nasun-website/frontend

# 빌드
npm run build
# (호스팅 서비스에 배포)
```

---

## 🛡️ 7단계: 재발 방지 (Prevention)

### 7.1 .gitignore 점검
`.env` 관련 파일이 실수로 커밋되지 않도록 확실하게 제외합니다.
```gitignore
# .gitignore
.env
.env.*
!.env.example
*.pem
*.key
```

### 7.2 Pre-commit Hook 설정
커밋 시 환경 변수 파일 포함 여부를 검사하는 스크립트를 `.git/hooks/pre-commit`에 추가합니다.

```bash
#!/bin/bash
if git diff --cached --name-only | grep -E '\.env($|\.)' | grep -v '\.example$'; then
    echo "❌ ERROR: Security Risk! Do not commit .env files."
    exit 1
fi
```
