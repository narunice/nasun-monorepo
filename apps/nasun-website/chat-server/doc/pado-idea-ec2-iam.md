# Pado Idea Submission — EC2 IAM Policy

The chat-server (PM2 on EC2) now writes Pado idea / feedback submissions directly to the
existing `nasun-bug-reports` DynamoDB table and resolves `walletAddress → identityId` via
the shared `UserWallets` table.

This requires attaching an IAM policy to the EC2 instance profile. Apply the policy to
both staging (`15.165.19.180`) and production (`43.200.67.52`) instance roles.

## Policy document

Replace `<ACCOUNT>` with the AWS account ID of the target environment. Note: **dev and prod
accounts are separate** (dev `135808943968`, prod `466841130170`).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PadoIdeaSubmit",
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem"],
      "Resource": "arn:aws:dynamodb:ap-northeast-2:<ACCOUNT>:table/nasun-bug-reports",
      "Condition": {
        "ForAllValues:StringLike": {
          "dynamodb:LeadingKeys": ["pado-*"]
        }
      }
    },
    {
      "Sid": "PadoIdeaRateLimitQuery",
      "Effect": "Allow",
      "Action": ["dynamodb:Query"],
      "Resource": [
        "arn:aws:dynamodb:ap-northeast-2:<ACCOUNT>:table/nasun-bug-reports",
        "arn:aws:dynamodb:ap-northeast-2:<ACCOUNT>:table/nasun-bug-reports/index/identityId-index"
      ]
    },
    {
      "Sid": "PadoIdeaWalletLookup",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem"],
      "Resource": "arn:aws:dynamodb:ap-northeast-2:<ACCOUNT>:table/UserWallets"
    }
  ]
}
```

Notes:
- `LeadingKeys` restricts `PutItem` so the chat-server can only create records whose
  partition key (`reportId`) begins with `pado-`. Existing nasun bug-report records are
  therefore protected from accidental overwrite by this process.
- `LeadingKeys` does **not** apply to GSI `Query` operations (AWS limitation). The Query
  on `identityId-index` is scoped by application code to the caller's own `identityId`
  (derived from their wallet signature), so there is no practical cross-account read
  surface, but CloudTrail data events on `nasun-bug-reports` are recommended for audit.
- `UserWallets` GetItem uses the `WALLET_OWNER` sentinel partition key with the requester's
  wallet address as the sort key — returns the owner's `identityId`.

## Environment variables (chat-server `.env`)

```
AWS_REGION=ap-northeast-2
PADO_FEEDBACK_TABLE=nasun-bug-reports
USER_WALLETS_TABLE=UserWallets
```

`ALLOWED_ORIGINS` must include:
- Staging: `https://staging.pado.finance`
- Production: `https://pado.finance`
- (Optional dev) `http://localhost:5176`

## Rollout order

1. Attach IAM policy to the target environment's EC2 instance profile.
2. Update `.env` with the variables above and restart chat-server:
   `pm2 reload nasun-chat-server --update-env`.
3. Smoke test: `curl -X POST https://<chat-server-host>/api/pado/idea-submit` with a valid
   session token — expect `401` without body / `400` with empty body.

## Rollback

If the feature must be disabled server-side (beyond the front-end feature flag):
1. Detach the IAM statements above from the instance profile — any `PutItem` will fail
   with `AccessDenied` but chat-server will still handle the error gracefully (returns
   500 to clients).
2. Alternatively, remove the route dispatch in `server.ts` and redeploy.
