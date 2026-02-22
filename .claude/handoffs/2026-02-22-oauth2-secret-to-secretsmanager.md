# Handoff: OAuth2 Client Secret을 Secrets Manager 런타임 읽기로 전환

**생성**: 2026-02-22 15:30
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

FollowerStack의 OAuth2 Token Refresh Lambda (`nasun-follower-token-refresh`)가 `OAUTH2_CLIENT_ID`와 `OAUTH2_CLIENT_SECRET`을 Lambda 환경변수에 평문으로 저장하고 있다. 보안 리뷰에서 HIGH로 분류됨. 이미 Secrets Manager에서 토큰을 읽고/쓰는 패턴이 있으므로, client credentials도 같은 secret에 저장하고 런타임에 읽도록 전환해야 한다.

## 완료된 작업

- [x] 보안 리뷰 완료 (HIGH 이슈로 식별)
- [x] 현재 코드 구조 분석 완료
- [x] 10개 커밋 push 완료 (현재 코드가 main에 반영됨)

## 미완료 작업

- [ ] Secrets Manager에 oauth2ClientId/oauth2ClientSecret 필드 추가
- [ ] Lambda 코드에서 환경변수 대신 Secrets Manager에서 client credentials 읽기
- [ ] CDK에서 OAUTH2_CLIENT_ID, OAUTH2_CLIENT_SECRET 환경변수 제거
- [ ] CDK에서 oauth2ClientId, oauth2ClientSecret props 제거
- [ ] cdk.ts에서 해당 props 제거
- [ ] 로그에서 refresh token 부분 노출 축소 (20자 -> 8자)
- [ ] 배포 및 검증

## 중요 컨텍스트

### 현재 아키텍처

Lambda는 이미 Secrets Manager secret `nasun-twitter-tokens`에서 `oauth2.refreshToken`, `oauth2.userAccessToken` 등을 읽고 업데이트한다. Client credentials만 환경변수에 있는 비일관적 상태.

### Secret 구조 (현재)

```json
{
  "oauth2": {
    "userAccessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890,
    "lastRefreshed": "2026-02-22T...",
    "scope": "..."
  }
}
```

### Secret 구조 (목표)

```json
{
  "oauth2": {
    "clientId": "...",
    "clientSecret": "...",
    "userAccessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890,
    "lastRefreshed": "2026-02-22T...",
    "scope": "..."
  }
}
```

### 변경 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `apps/nasun-website/cdk/lambda-src/refresh-oauth2-token/src/index.ts` | L86-93: `process.env.OAUTH2_CLIENT_ID/SECRET` 대신 Secrets Manager에서 `oauth2.clientId/clientSecret` 읽기. 이미 L97-103에서 secret을 읽고 있으므로 거기서 추출. |
| `apps/nasun-website/cdk/lambda-src/refresh-oauth2-token/src/index.ts` | L144: `oldRefreshToken.substring(0, 20)` -> `substring(0, 8)` |
| `apps/nasun-website/cdk/lib/follower-stack.ts` | L123-125: `environment`에서 `OAUTH2_CLIENT_ID`, `OAUTH2_CLIENT_SECRET` 제거 |
| `apps/nasun-website/cdk/lib/follower-stack.ts` | FollowerStackProps에서 `oauth2ClientId`, `oauth2ClientSecret` 제거 |
| `apps/nasun-website/cdk/bin/cdk.ts` | L61-62: `oauth2ClientId`, `oauth2ClientSecret` props 제거 |

### 주의사항

- **배포 순서가 중요**: 먼저 Secrets Manager에 `oauth2.clientId`/`oauth2.clientSecret` 필드를 수동 추가한 후, Lambda를 배포해야 한다. 순서가 바뀌면 Lambda가 credentials를 찾지 못해 토큰 갱신 실패.
- **dev/prod 두 환경**: dev 환경은 `nasun-twitter-tokens`, prod 환경은 `nasun-twitter-tokens-prod`. 둘 다 업데이트 필요.
- **CDK 배포**: `cdk deploy FollowerStack` (dev), `AWS_PROFILE=nasun-prod cdk deploy FollowerStack` (prod)
- **비용 영향**: Secrets Manager 추가 읽기 1회/70분 = ~$0.05/월. 무시 가능.
- **stale .js/.d.ts**: CDK 배포 전 `cdk/lib/`와 `cdk/bin/`의 stale compiled 파일 삭제 필요 (`/deploy` skill이 자동 처리).

## 즉시 다음 단계

1. **Secrets Manager에 client credentials 추가** (AWS Console 또는 CLI):
   ```bash
   # dev 환경
   aws secretsmanager get-secret-value --secret-id nasun-twitter-tokens \
     --query SecretString --output text | python3 -c "
   import sys, json
   d = json.load(sys.stdin)
   d['oauth2']['clientId'] = '<OAUTH2_CLIENT_ID 값>'
   d['oauth2']['clientSecret'] = '<OAUTH2_CLIENT_SECRET 값>'
   print(json.dumps(d, indent=2))
   " | aws secretsmanager update-secret --secret-id nasun-twitter-tokens --secret-string file:///dev/stdin
   ```

2. **Lambda 코드 수정** (`index.ts` L86-93):
   ```typescript
   // Before:
   const clientId = process.env.OAUTH2_CLIENT_ID;
   const clientSecret = process.env.OAUTH2_CLIENT_SECRET;

   // After:
   const clientId = oauth2.clientId;
   const clientSecret = oauth2.clientSecret;
   if (!clientId || !clientSecret) {
     throw new Error('Missing oauth2.clientId or oauth2.clientSecret in Secrets Manager');
   }
   ```
   주의: `oauth2` 변수는 L104에서 추출되므로, credentials 체크를 L104 이후로 이동해야 함.

3. **로그 축소** (`index.ts` L144):
   ```typescript
   // substring(0, 20) -> substring(0, 8)
   ```

4. **CDK 정리**: follower-stack.ts에서 props/environment 제거, cdk.ts에서 props 제거

5. **배포 + 검증**: `/deploy` skill 사용, 이후 Lambda 수동 invoke로 토큰 갱신 성공 확인
