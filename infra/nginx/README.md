# nginx Config Baseline

prod EC2 (`43.200.67.52`)의 nginx config가 단일 의존되지 않도록 git에 baseline을 보존한다.

## Source of truth

`snapshots/`(placeholder 포함) + `secrets.env`(gitignore)를 합치면 prod의 `/etc/nginx/` 내용과 동일하다. Deploy 스크립트가 `__PLACEHOLDER__`를 secret 값으로 치환한 후 prod에 push.

```
snapshots/                       (committed, placeholders included)
├── nginx.conf                   → /etc/nginx/nginx.conf
├── conf.d/baram.conf            → /etc/nginx/conf.d/baram.conf
├── conf.d/explorer.conf
├── conf.d/nasun-rate-limit.conf
├── conf.d/nasun.conf            ← __CF_ORIGIN_SECRET_NASUN__
├── conf.d/pado.finance.conf     ← __CF_ORIGIN_SECRET_PADO__
├── conf.d/php-fpm.conf
├── conf.d/rpc-cache.conf
└── conf.d/wordpress.conf

secrets.env                      (gitignored, real values)
secrets.env.example              (committed, template)
```

## 초기 설정

`secrets.env.example`을 복사해서 `secrets.env`를 만들고 실제 값을 채운다. 값은 prod EC2의 `/etc/nginx/conf.d/{nasun,pado.finance}.conf`에서 가져오거나 secure handoff 문서에서 받는다.

```bash
cp infra/nginx/secrets.env.example infra/nginx/secrets.env
# 편집해서 실제 값 입력
```

## Drift 감지 (read-only)

```bash
./scripts/deploy-nginx-config.sh diff
```

prod ↔ baseline 차이를 출력. 차이 있으면 exit code 2.

## 변경 적용

1. `snapshots/`에서 직접 편집
2. `git diff` + commit + PR 리뷰
3. PR merge 후:
   ```bash
   ./scripts/deploy-nginx-config.sh apply
   ```
4. 스크립트가 수행:
   - Pre-flight drift check (prod에 uncommitted change 있으면 abort)
   - rsync `snapshots/*` → prod (자동 `.bak.<timestamp>` 생성)
   - `sudo nginx -t` (syntax 검증)
   - `sudo systemctl reload nginx`
   - health check (nasun.io / pado.finance / explorer.nasun.io)

## 우회 (manual review 후만)

```bash
./scripts/deploy-nginx-config.sh apply --force
```

drift가 의도된 prod 변경(긴급 hotfix)이라면 git에 sync 후 재실행하는 게 정상. `--force`는 prod 상태를 덮어쓰니 신중히.

## 직접 SSH 수정 금지

`feedback_no_raw_rsync_to_prod.md` 정합. prod EC2에 직접 ssh + edit은 baseline drift를 즉시 만든다. 변경은 항상 git → deploy 스크립트 경로로.

## 예외: 긴급 hotfix

prod가 다운 중이고 PR 사이클이 너무 느릴 때만 직접 수정 허용. 반드시:
1. 변경 즉시 직접 변경분을 `snapshots/`에 동기화 + commit
2. weekly drift cron이 알림 보내면 다시 sync 안 된 변경이 있음을 의미

## Weekly drift 알림 (TODO)

`./scripts/deploy-nginx-config.sh diff`를 weekly cron으로 실행하여 drift 발생 시 SNS 알림. 별도 작업 (E3 acceptance).

## Secret rotation

CloudFront origin secret이 노출됐거나 정기 rotation 시:

1. CloudFront distribution의 origin custom header `x-cloudfront-secret` 값을 새 secret으로 update (각 distribution: nasun.io / pado.finance)
2. `infra/nginx/secrets.env`의 해당 변수를 새 값으로 update (commit 안 함)
3. `./scripts/deploy-nginx-config.sh apply` 실행 — nginx config가 새 secret으로 rendered되어 prod에 push
4. CloudFront edge propagation 5-15분 동안은 옛/새 secret 둘 다 통과해야 하므로 nginx vhost를 임시로 둘 다 accept하도록 수정 후 진행 (또는 짧은 downtime 허용)
5. propagation 완료 후 옛 secret 제거

값은 평문 `secrets.env`에 보관되므로 dev machine 권한 관리 필수. 더 강한 보안 필요 시 AWS Secrets Manager 연동으로 별도 마이그레이션.
