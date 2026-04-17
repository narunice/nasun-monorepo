#!/bin/bash

# --- [나선 fullnode G: 드라이브 백업 스크립트] ---
# 작성일: 2026-04-17
# 전략: AWS EC2 Snapshot/Live DB -> WSL -> Windows G: Drive (rsync)

EC2_HOST="ubuntu@54.180.61.196"
SSH_KEY="$HOME/.ssh/.awskey/nasun-devnet-key.pem"

# [현재 설정] 초기 전체 백업을 위해 Live DB 경로를 우선 사용합니다.
# 노드가 정지된 상태에서 실행하는 것을 권장합니다.
REMOTE_PATH="/home/ubuntu/full_node_db/full_node_db/86e8774b6dad"

# [추후 변경] EC2에서 snapshots 폴더 생성이 확인되면 아래 경로로 교체하세요.
# REMOTE_PATH="/home/ubuntu/nasun-node/snapshots"

# Windows G: 드라이브 백업 경로 (WSL 마운트 지점)
LOCAL_PATH="/mnt/g/nasun-fullnode-backup/fullnode-db"
LOG_DIR="/mnt/g/nasun-fullnode-backup/logs"
LOG_FILE="$LOG_DIR/backup-$(date +%Y%m%d).log"

# 필요한 로컬 디렉토리 생성
mkdir -p "$LOCAL_PATH"
mkdir -p "$LOG_DIR"

echo "[$(date)] === 나선 백업 시작 (Target: $REMOTE_PATH) ===" >> "$LOG_FILE"
echo "Log file: $LOG_FILE"

# rsync 최적화 옵션 반영 (checksum 제거, inplace 적용, 대역폭 제한)
rsync -avz \
  --delete \
  --exclude='*.lock' \
  --exclude='*.log' \
  --exclude='write_buffer' \
  --inplace \
  --no-whole-file \
  --bwlimit=10000 \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  "$EC2_HOST:$REMOTE_PATH/" \
  "$LOCAL_PATH/" \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date)] === 백업 성공 (G: Drive) ===" >> "$LOG_FILE"
    echo "SUCCESS: Backup completed. Check $LOG_FILE for details."
else
    echo "[$(date)] === 백업 실패 (Exit Code: $EXIT_CODE) ===" >> "$LOG_FILE"
    echo "ERROR: Backup failed! Check $LOG_FILE"
fi

exit $EXIT_CODE
