# gostop.app CDK

S3 + CloudFront + Route53 + ACM. **No WAF in Phase 1** — see
[handoff: nasun WAF expansion](../../../.claude/handoffs/2026-04-24-nasun-waf-expansion.md)
for the strategy when gostop adds backend APIs.

---

## ⚠️ REGION: us-east-1 (NOT ap-northeast-2)

**이 스택은 us-east-1(N. Virginia)에 배포합니다.** 다른 Nasun 인프라는 대부분
ap-northeast-2(서울)이지만, gostop 사이트 스택은 예외입니다.

**이유**: CloudFront에 attach할 ACM 인증서는 **반드시 us-east-1**에 있어야 함
(AWS 하드 제약, 우회 불가). CF + ACM + Route53 + S3를 하나의 스택에 묶으려면
스택 전체를 us-east-1에 배포하는 게 가장 깔끔합니다.

### 리전 매핑 (향후 혼란 방지)

| 컴포넌트 | 리전 | 왜 |
|---|---|---|
| **gostop site (이 스택)** | **us-east-1** | ACM for CloudFront |
| nasun-website backend (Lambda + DDB + API GW) | ap-northeast-2 | 한국 유저 지연 최소화 |
| pado backend | ap-northeast-2 | 동일 |
| gostop backend (Phase 2, leaderboard API 등) | ap-northeast-2 | 동일 |
| Route53 hosted zone | 글로벌 | 리전 무관 |

### 실수 방지 체크리스트

- [ ] `cdk bootstrap` 실행 시 `aws://__AWS_PROD_ACCOUNT__/us-east-1` 명시
- [ ] `cdk deploy` 실행 시 us-east-1 프로필/환경 확인
- [ ] 콘솔에서 이 스택을 찾을 땐 **우상단 리전을 us-east-1로 전환** 후 CloudFormation 열기
- [ ] CloudWatch 메트릭/경보 만들 때도 us-east-1에서 생성 (CF 메트릭 연동)
- [ ] S3 bucket은 us-east-1에 있음. 서울 리전에서 `aws s3 ls` 하면 안 보임 — 반드시 `--region us-east-1`

**성능 영향 없음**: S3 origin이 us-east-1에 있어도 한국 사용자는 **CloudFront 서울 엣지**에서 캐시 서빙받으므로 지연 증가 없음.

---

## First-time deploy (one-time)

```bash
# 1. Install CDK deps
cd apps/gostop/cdk
npm install

# 2. Bootstrap CDK in us-east-1 (admin credentials needed one time)
#    nasun-cli 사용자는 ecr:CreateRepository 권한이 없어서 bootstrap 불가.
#    AWS CloudShell에서 root/admin으로 로그인 후 아래 실행:
#      npx cdk bootstrap aws://__AWS_PROD_ACCOUNT__/us-east-1
#    이후 deploy는 nasun-cli profile로 가능 (bootstrap roles AssumeRole).

# 3. Provision the stack (bootstrap 완료 후)
npx cdk deploy --profile nasun-prod
```

Deploy outputs (CFN outputs) include:

| Output | Purpose |
|---|---|
| `BucketName` | S3 bucket for SPA assets |
| `DistributionId` | CloudFront distribution id (used for invalidations) |
| `DistributionDomain` | CF default domain (e.g. d1234.cloudfront.net) |
| `HostedZoneId` | Route53 zone id |
| **`HostedZoneNameServers`** | **4 NS records to set at Porkbun** |
| `SiteUrl` | https://gostop.app |

## Porkbun NS delegation

After first `cdk deploy`, copy the 4 nameservers from the
`HostedZoneNameServers` output and set them at Porkbun:

1. Log into Porkbun
2. Domain Management → `gostop.app` → DNS
3. Replace **NS records** (or change nameservers in the domain's "Authoritative
   Nameservers" panel) with the 4 from the CDK output:
   ```
   ns-XXX.awsdns-XX.com
   ns-XXX.awsdns-XX.net
   ns-XXX.awsdns-XX.org
   ns-XXX.awsdns-XX.co.uk
   ```
4. Wait 5-30 minutes for DNS propagation
5. Verify: `dig +short gostop.app NS`

**Important**: ACM certificate validation needs Route53 to be authoritative,
so DNS delegation must complete BEFORE the cert validates. CDK will wait
on the cert in the same `cdk deploy` run; if it hangs >15 min, NS delegation
hasn't propagated yet.

## Frontend deploys (every release)

```bash
cd apps/gostop/cdk
./scripts/deploy-frontend.sh
```

This script:
1. Reads CFN outputs to find bucket + distribution
2. Builds `apps/gostop/frontend` (`pnpm --filter @nasun/gostop build`)
3. Syncs hashed assets with `Cache-Control: max-age=31536000, immutable`
4. Syncs `index.html` with `no-cache`
5. Invalidates `/`, `/index.html`, `/*.html` on CloudFront

## Cost (estimated, prototype scale)

| Component | Monthly |
|---|---|
| Route53 hosted zone | $0.50 |
| Route53 DNS queries (~100K) | $0.04 |
| S3 storage (~10MB) | <$0.01 |
| CloudFront data (300 DAU, ~14GB) | ~$1.60 |
| ACM | free |
| **Total Phase 1** | **~$2-3/mo** |

First 12 months: CloudFront free tier (1TB out + 10M req) covers virtually
all prototype traffic, so realistic month 1-12 bill is ~$0.55 (zone only).

## When WAF is added

See [.claude/handoffs/2026-04-24-nasun-waf-expansion.md](../../../.claude/handoffs/2026-04-24-nasun-waf-expansion.md)
for the shared WebACL strategy. Phase 2 (gostop adds backend leaderboard
API) — attach the existing `nasun-genesis-pass-waf` WebACL to the new
gostop API Gateway stage. Marginal cost: ~$0 (WebACL is already paid).

## Stack architecture diagram

```
[Porkbun NS] --delegates--> [Route53 hosted zone]
                                  |
                            (gostop.app + www)
                                  |
                            ALIAS A/AAAA
                                  v
                    [CloudFront distribution]
                       | TLS (ACM us-east-1)
                       | OAC (Origin Access Control)
                       v
                    [S3 private bucket]
                       (SPA build artifacts)
```

## Troubleshooting

**Deploy hangs at `Certificate validation`**:
NS delegation hasn't propagated. Check Porkbun → `dig +short gostop.app NS`
should return the 4 AWS nameservers. Wait + retry.

**`Invalid argument: web acl is in different region`**:
Don't apply REGIONAL WebACL to CloudFront. CloudFront needs CLOUDFRONT-scope
(us-east-1) WebACL. Phase 1 has no WAF anyway.

**SPA route returns 403 from S3**:
CloudFront `errorResponses` should map 403/404 → `/index.html`. Confirm in
distribution settings; this is wired up in `gostop-site-stack.ts`.
