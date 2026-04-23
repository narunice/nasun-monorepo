#!/bin/bash
# ==============================================================================
# 공통 유틸리티 함수 (배포 스크립트용)
# ==============================================================================

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
  exit 1
}

log_step() {
  local step=$1
  local total=$2
  local msg=$3
  echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}📍 [${step}/${total}] $msg${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 시간 측정
get_elapsed_time() {
  local start=$1
  local end=$(date +%s)
  local elapsed=$((end - start))
  echo "${elapsed}초"
}

# SSH 키 검증
verify_ssh_key() {
  local key_path=$1
  local expanded_path="${key_path/#\~/$HOME}"

  if [ ! -f "$expanded_path" ]; then
    log_error "SSH 키 파일을 찾을 수 없습니다: $key_path"
  fi

  local perm=$(stat -c %a "$expanded_path" 2>/dev/null || stat -f %A "$expanded_path" 2>/dev/null)
  if [ "$perm" != "400" ] && [ "$perm" != "600" ]; then
    log_warning "SSH 키 권한 수정 중 ($perm → 400)"
    chmod 400 "$expanded_path"
  fi

  log_success "SSH 키 확인됨: $key_path" >&2
  echo "$expanded_path"
}

# EC2 연결 테스트
test_ec2_connection() {
  local key_path=$1
  local user=$2
  local host=$3

  log_info "EC2 연결 테스트 중..."
  if ! ssh -i "$key_path" -o ConnectTimeout=10 -o BatchMode=yes "${user}@${host}" "echo 'SSH OK'" > /dev/null 2>&1; then
    log_error "EC2 서버에 연결할 수 없습니다: ${user}@${host}"
  fi
  log_success "EC2 연결 성공"
}

# 헬스 체크
health_check() {
  local url=$1
  local user=${2:-}
  local pass=${3:-}

  log_info "헬스 체크 중: $url"
  sleep 3

  local curl_opts="--max-time 30 -s -o /dev/null -w %{http_code}"
  if [ -n "$user" ] && [ -n "$pass" ]; then
    curl_opts="$curl_opts -u ${user}:${pass}"
  fi

  local status=$(curl $curl_opts "$url" 2>/dev/null || echo "000")

  if [ "$status" -eq 200 ]; then
    log_success "헬스 체크 성공 (HTTP $status)"
    return 0
  elif [ "$status" -eq 000 ]; then
    log_warning "헬스 체크: 연결 실패 (타임아웃)"
    return 1
  else
    log_warning "헬스 체크: HTTP $status"
    return 1
  fi
}

# env-verify: dist 번들에 .env VITE_* 값이 embed 되었는지 검증
# 사용: verify_env_embed <app> [mode]
# - 모두 MATCH: log_success
# - MISSING 발견: log_warning + 상세 출력, $FORCE=true가 아니면 확인 프롬프트
# - setup 에러: log_warning (skip)
# --skip-env-verify 플래그로 건너뛸 수 있음 (SKIP_ENV_VERIFY=true)
verify_env_embed() {
  local app=$1
  local mode=${2:-production}
  local script_path="$(dirname "${BASH_SOURCE[0]}")/env-verify.sh"

  if [ "${SKIP_ENV_VERIFY:-false}" = "true" ]; then
    log_warning "env-verify 건너뜀 (--skip-env-verify)"
    return 0
  fi

  if [ ! -x "$script_path" ]; then
    log_warning "env-verify.sh 없음 — 검증 skip"
    return 0
  fi

  log_info "dist 번들의 VITE_* 값 검증 중 (env-verify)..."
  local out
  local rc=0
  out=$(bash "$script_path" "$app" --mode "$mode" 2>&1) || rc=$?

  if [ "$rc" -eq 0 ]; then
    log_success "env embed 검증 통과"
    return 0
  elif [ "$rc" -eq 2 ]; then
    log_warning "env-verify setup 에러 — skip"
    echo "$out"
    return 0
  else
    log_warning "env embed 미스매치 감지됨:"
    echo "$out"
    echo ""
    if [ "${FORCE:-false}" = "true" ]; then
      log_warning "--force 지정됨 — 경고 무시하고 계속"
      return 0
    fi
    read -p "계속 배포하려면 'continue'를 입력하세요: " confirm
    if [ "$confirm" != "continue" ]; then
      log_error "배포 취소 (env embed 미스매치)"
    fi
    log_warning "사용자가 경고를 무시하고 계속 진행함"
    return 0
  fi
}

# 모노레포 루트 경로
MONOREPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# nvm 로드 (non-interactive shell에서도 올바른 Node 버전 사용)
if [ -z "$NVM_DIR" ]; then
  export NVM_DIR="$HOME/.nvm"
fi
if [ -s "$NVM_DIR/nvm.sh" ]; then
  source "$NVM_DIR/nvm.sh"
  # .nvmrc가 있으면 해당 버전으로 자동 전환
  if [ -f "$MONOREPO_ROOT/.nvmrc" ]; then
    nvm use --silent
  fi
fi

# Deploy credentials (.credentials 파일에서 로드)
_CREDENTIALS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.credentials"
if [ -f "$_CREDENTIALS_FILE" ]; then
  source "$_CREDENTIALS_FILE"
else
  log_warning "credentials 파일 없음: scripts/.credentials (헬스 체크 시 인증 실패 가능)"
fi
