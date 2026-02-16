---
name: tee
description: Baram-AER TEE spot 인스턴스를 관리합니다. 인스턴스 시작, 상태 확인, nginx 프록시 업데이트, 종료를 수행합니다. "tee 켜줘", "스팟 인스턴스 시작", "tee start", "tee stop", "tee status" 등의 요청에 사용합니다.
---

# TEE: Baram-AER Spot Instance 관리

AWS Nitro Enclave 기반 TEE spot 인스턴스의 전체 라이프사이클을 관리합니다. 시작, 상태 확인, 프록시 업데이트, 종료를 단일 명령으로 수행합니다.

## $ARGUMENTS 처리

| 패턴                | 동작                                                       |
| ------------------- | ---------------------------------------------------------- |
| (없음) / `status`   | 현재 인스턴스 상태 확인 (태그로 탐지 + health check)       |
| `start` / `launch`  | 새 spot 인스턴스 시작 + 전체 setup 워크플로                |
| `stop` / `terminate` | 실행 중인 인스턴스 종료                                    |
| `update [IP]`       | nginx 프록시 + on-chain endpoint 업데이트만 실행           |

## 실행 절차: `start`

### 1단계: Pre-flight 검사

1. **기존 인스턴스 확인**

```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=baram-tee-dev" "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].[InstanceId,PublicIpAddress,LaunchTime]" \
  --output text --region ap-northeast-2
```

이미 실행 중인 인스턴스가 있으면 IP와 health 상태를 보여주고, AskUserQuestion으로 새로 시작할지 확인. 비용 안내: Spot $0.10/hr.

2. **필수 파일 존재 확인** (Bash `test -f`로 검증):

   - `apps/baram-aer/executor-nitro/.env.ami` — AMI/SG/인스턴스 설정
   - `apps/baram-aer/executor-nitro/.env` — executor 런타임 환경변수
   - `~/.ssh/baram-nitro.pem` — EC2 SSH 키
   - `~/.ssh/.awskey/nasun-devnet-key.pem` — nasun-node-1 SSH 키

누락 시 에러 메시지와 해결 방법 안내 후 중단.

3. **`.env` 필수 변수 검증** (Grep으로 키 존재 확인):

   - `SUI_RPC_URL`, `BARAM_PACKAGE_ID`, `BARAM_REGISTRY_ID`, `EXECUTOR_PRIVATE_KEY` — 하나라도 누락 시 경고: "Sui settlement가 비활성화됩니다"
   - `AER_PACKAGE_ID`, `AER_REGISTRY_ID` — 누락 시 경고: "Execution Report(AER)가 생성되지 않습니다"
   - `GROQ_API_KEY` — 누락 시 경고: "Groq proxy 모드가 비활성화됩니다"

4. **`.env.ami` 필수 변수 검증** (Grep으로 키 존재 확인):

   - `BARAM_AMI_ID`, `BARAM_SECURITY_GROUP` — 누락 시 에러, 중단

### 2단계: Spot 인스턴스 시작

```bash
cd /home/naru/my_apps/nasun-monorepo/apps/baram-aer/executor-nitro && bash ./scripts/launch-spot.sh
```

- timeout: 600초 (EIF 빌드 + 엔클레이브 시작 포함)
- 스크립트가 내부적으로 health check polling (30회 x 10초)을 수행
- **출력 파싱**: `Instance ID`와 `Public IP`를 캡처하여 이후 단계에서 사용

### 3단계: Health Check 확인

스크립트의 내장 health check가 실패하거나 타임아웃된 경우, 직접 재시도:

```bash
curl -s --connect-timeout 5 http://<PUBLIC_IP>:3000/health
```

**응답 해석:**

| 응답                              | 상태     | 조치                                        |
| --------------------------------- | -------- | ------------------------------------------- |
| `"host":"healthy","enclave":"healthy"` | 정상   | 다음 단계로 진행                            |
| `"enclave":"unreachable"`         | 빌드 중  | 30초 간격으로 최대 5회 재시도               |
| HTTP 503 + 에러 메시지            | 런타임 에러 | 아래 디버깅 가이드 참조                   |
| Connection refused                | 서비스 미시작 | 1분 대기 후 재시도, 3회 실패 시 SSH 안내 |

### 4단계: .env 배포

EC2에 `.env` 파일이 있는지 확인:

```bash
ssh -i ~/.ssh/baram-nitro.pem -o StrictHostKeyChecking=accept-new \
  ec2-user@<IP> "test -f ~/nasun-monorepo/apps/baram/executor-nitro/.env && echo EXISTS || echo MISSING"
```

**중요**: EC2의 user-data 스크립트는 `apps/baram/executor-nitro/` (legacy 경로)를 사용하므로 .env도 해당 경로에 배포해야 함.

- **MISSING**:

```bash
scp -i ~/.ssh/baram-nitro.pem -o StrictHostKeyChecking=accept-new \
  /home/naru/my_apps/nasun-monorepo/apps/baram-aer/executor-nitro/.env \
  ec2-user@<IP>:~/nasun-monorepo/apps/baram/executor-nitro/.env
```

복사 후 서비스 재시작:

```bash
ssh -i ~/.ssh/baram-nitro.pem ec2-user@<IP> "sudo systemctl restart baram-host"
```

재시작 후 health check 재확인. 로그에서 `Sui settlement enabled` 메시지 확인:

```bash
ssh -i ~/.ssh/baram-nitro.pem ec2-user@<IP> "journalctl -u baram-host -n 20 --no-pager"
```

- **EXISTS**: 건너뜀

### 5단계: Nginx 프록시 + On-chain Endpoint 업데이트

```bash
cd /home/naru/my_apps/nasun-monorepo/apps/baram-aer/executor-nitro && bash ./scripts/update-executor.sh <PUBLIC_IP>
```

스크립트 내부 동작:
- Step 1: SSH로 nasun-node-1 (`ubuntu@3.38.127.23`) nginx upstream 업데이트
- Step 2: Nasun CLI로 on-chain `update_own_endpoint` 호출

**Step 2 실패 시** (RPC 네트워크 에러), 수동 재시도:

```bash
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client call \
  --package 0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd \
  --module executor \
  --function update_own_endpoint \
  --args \
    0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656 \
    '"https://tee.baram.nasun.io"' \
    '[]' \
    0x6 \
  --gas-budget 100000000
```

### 6단계: HTTPS 엔드포인트 검증

```bash
curl -s --connect-timeout 5 https://tee.baram.nasun.io/health
```

- 성공: `{"host":"healthy","enclave":"healthy",...}` 확인
- 실패: nginx 설정 또는 SSL 인증서 문제 안내. nasun-node-1 SSH 접속하여 `sudo nginx -t` 확인 안내.

### 7단계: 완료 요약

테이블 형식으로 결과 출력:

| 항목              | 값                              |
| ----------------- | ------------------------------- |
| Instance ID       | i-0xxx...                       |
| Public IP         | x.x.x.x                        |
| HTTPS Endpoint    | https://tee.baram.nasun.io      |
| Host              | healthy                         |
| Enclave           | healthy                         |
| Sui Settlement    | enabled / disabled              |
| On-chain Endpoint | updated                         |

유용한 명령어 안내:

```
종료: /tee stop
SSH:  ssh -i ~/.ssh/baram-nitro.pem ec2-user@<IP>
로그: ssh -i ~/.ssh/baram-nitro.pem ec2-user@<IP> "journalctl -u baram-host -f"
```

## 실행 절차: `status`

1. AWS CLI로 `baram-tee-dev` 태그 인스턴스 탐지:

```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=baram-tee-dev" "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].[InstanceId,PublicIpAddress,LaunchTime,InstanceType]" \
  --output text --region ap-northeast-2
```

2. running 인스턴스 없으면: "실행 중인 TEE 인스턴스가 없습니다" 출력
3. running 인스턴스 있으면:
   - Instance ID, Public IP, Launch Time, Instance Type 표시
   - **Direct health check**: `curl -s http://<IP>:3000/health`
   - **HTTPS health check**: `curl -s https://tee.baram.nasun.io/health`
   - 두 결과를 비교하여 nginx 프록시 동기화 상태 표시
   - Direct는 성공인데 HTTPS가 실패하면: "nginx 프록시가 다른 IP를 가리키고 있습니다. `/tee update` 실행 필요" 안내

## 실행 절차: `stop`

1. `baram-tee-dev` 태그로 running 인스턴스 자동 탐지
2. Instance ID, IP, Uptime 표시
3. AskUserQuestion으로 종료 확인: "인스턴스를 종료하시겠습니까? (EBS 볼륨도 자동 삭제됩니다)"
4. 승인 시:

```bash
aws ec2 terminate-instances --instance-ids <INSTANCE_ID> --region ap-northeast-2
```

5. 종료 확인 후 완료 메시지 출력

## 실행 절차: `update`

1. `$ARGUMENTS`에서 IP 추출. IP가 없으면 running 인스턴스에서 자동 탐지
2. Direct health check로 인스턴스 정상 확인 (실패 시 중단)
3. update-executor.sh 실행:

```bash
cd /home/naru/my_apps/nasun-monorepo/apps/baram-aer/executor-nitro && bash ./scripts/update-executor.sh <IP>
```

4. HTTPS health check 검증

## 안티 패턴

| 금지                                    | 이유                         | 대신                                     |
| --------------------------------------- | ---------------------------- | ---------------------------------------- |
| `.env`를 커밋/푸시                      | 비밀키 유출                  | scp로 직접 배포                          |
| health check 없이 update-executor 실행  | 비정상 인스턴스로 트래픽 라우팅 | 반드시 health check 확인 후 update     |
| 기존 인스턴스 확인 없이 새 인스턴스 시작 | 비용 낭비 (Spot $0.10/hr)    | pre-flight에서 기존 인스턴스 확인        |
| terminate-spot.sh를 직접 실행           | interactive prompt 미지원    | `/tee stop` 사용                         |
| EC2에서 직접 git push                   | 로컬 변경사항과 충돌         | 로컬에서 수정 후 EC2에서 git pull        |

## 알려진 이슈 (디버깅 가이드)

| 증상                                         | 원인                                        | 해결                                                                        |
| -------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Health check 503 + `crypto is not defined`   | `protocol.ts`에서 `crypto.randomUUID()` 미import | EC2 SSH 후 `import { randomUUID } from 'node:crypto'` 추가, rebuild       |
| `Sui config not provided, settlement disabled` | EC2에 `.env` 파일 없음                      | 4단계에서 scp로 `.env` 배포                                                 |
| Execution Report 미생성 (응답은 정상)          | `.env`에 `AER_PACKAGE_ID`/`AER_REGISTRY_ID` 누락 | devnet-ids.json에서 ID 복사 후 `.env`에 추가, EC2 재배포                    |
| `No TEE Protection` 항상 표시                | Standard 모드에서 teeType=0 executor 선택    | Private 모드에서만 표시되어야 함. `ChatPage.tsx` 조건 확인                  |
| update-executor.sh Step 2 실패               | RPC 네트워크 에러                            | Nasun CLI로 `update_own_endpoint` 수동 재시도                               |
| Enclave `unreachable`                        | EIF 빌드 중 (C++ 컴파일 3-5분)              | 30초 간격으로 재시도, 최대 5분 대기                                         |
| EC2 경로가 `apps/baram/`                     | launch-spot.sh user-data가 legacy 경로 사용 | `.env`도 `apps/baram/executor-nitro/`에 배포                                |

## 주요 경로/ID 참조

| 항목               | 값                                                                   |
| ------------------ | -------------------------------------------------------------------- |
| 스크립트 디렉토리  | `apps/baram-aer/executor-nitro/scripts/`                             |
| .env.ami           | `apps/baram-aer/executor-nitro/.env.ami`                             |
| .env (런타임)      | `apps/baram-aer/executor-nitro/.env`                                 |
| EC2 SSH 키         | `~/.ssh/baram-nitro.pem`                                            |
| nasun-node-1 SSH 키 | `~/.ssh/.awskey/nasun-devnet-key.pem`                               |
| HTTPS 엔드포인트   | `https://tee.baram.nasun.io`                                        |
| Nasun CLI          | `/home/naru/my_apps/nasun-devnet/sui/target/release/sui`            |
| ExecutorRegistry   | `0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656` |
| ExecutorAdminCap   | `0x5e3dca938ff22ec2445a9de84029924b37a5bc5e2fc815c9547c547235d8c522` |
| Executor Package   | `0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd` |

## 주의사항

- `.env`, 비밀키 파일은 절대 커밋하지 않음
- Spot 인스턴스는 AWS가 언제든 회수할 수 있음 — 장시간 작업 시 인지
- 사용 후 반드시 `/tee stop`으로 종료하여 비용 절감
- on-chain endpoint 업데이트는 활성 Nasun CLI 주소가 executor operator와 일치해야 함
