# CloudFront WebSocket routing fix for chat (/ws/chat)

**Date**: 2026-04-23
**Priority**: High (9+ user bug reports today, chat broken in prod)
**Estimated scope**: CloudFront distribution config change + verification. No code change expected.
**Related skill**: `.claude/skills/bug-triage/` — 22 chat-bug replies are staged in `drafts/pending.json` gated on this fix completing.

---

## Why this exists

The bug-triage skill ran today and found 22 open chat-related user reports. Investigation showed the chat REST endpoints on `nasun.io` are healthy but the WebSocket upgrade at `wss://nasun.io/ws/chat` is broken:

```bash
curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Version: 13" \
     https://nasun.io/ws/chat
```

Current response:
```
HTTP/2 200
content-type: text/html
content-length: 5080
via: 1.1 ...cloudfront.net
x-cache: Error from cloudfront
```

Expected response:
```
HTTP/1.1 101 Switching Protocols
upgrade: websocket
connection: Upgrade
```

CloudFront is matching `/ws/chat` against the SPA fallback behavior and serving the React app's `index.html` instead of forwarding the Upgrade request to origin. Users see "chat loading", "cant connect chat", chat missions not registering.

Current user-visible impact (sample report IDs from the triage cache):
- Today (n=9): `5101b3b7`, `a820fff8`, `e2beec7f`, `5b017396`, `c2ed0cdd`, `0b60095b`, `479224af`, `4acc4d67`, `b2d8df03`
- 1-5 days old (n=10): `7c23258b`, `fce7a8f5`, `6112b7e4`, `2ceb9a00`, `53235bd0`, `9423c4f2`, `42d27925`, `ba8744b6`, `67c88ffd`, `d36f92fe`
- 10 days old (n=3): `d2fa5c79`, `77ff05a7`, `4a61467c`

REST-backed chat features (history, leaderboard, idea submission) are unaffected: `/chat/health` and `/chat/api/messages` return 200.

---

## The fix

Add (or correct) a dedicated CloudFront cache behavior for `/ws/chat*` that:

1. **Forwards the upgrade**: uses an Origin Request Policy that includes the headers `Upgrade`, `Connection`, `Sec-WebSocket-Key`, `Sec-WebSocket-Version`, `Sec-WebSocket-Extensions`, `Sec-WebSocket-Protocol`, `Sec-WebSocket-Accept`. The AWS-managed policy `AllViewer` works; do NOT use `CORS-S3Origin`-style policies that strip these.
2. **Disables caching**: managed Cache Policy `CachingDisabled`. WS is long-lived and per-connection.
3. **Allows all methods**: GET/HEAD/OPTIONS at minimum; the Upgrade handshake is GET.
4. **Viewer protocol policy**: `redirect-to-https`.
5. **Origin**: the same EC2-backed origin that serves `/chat/*` (nginx on `43.200.67.52` proxying `localhost:3101`).
6. **Precedence**: path pattern `/ws/chat*` must sit ABOVE the default `*` behavior that currently catches it.

Confirm nginx on the EC2 prod origin already proxies `/ws/chat` with `Upgrade` / `Connection upgrade` headers set. If not, nginx also needs:

```nginx
location /ws/chat {
    proxy_pass http://127.0.0.1:3101;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

### Investigation steps (do these first, before changing anything)

1. Identify the CloudFront distribution that fronts `nasun.io`:
   ```bash
   aws cloudfront list-distributions --profile nasun-prod \
     --query 'DistributionList.Items[?Aliases.Items[?contains(@,`nasun.io`)]].{Id:Id,Comment:Comment,Aliases:Aliases.Items}' \
     --output table
   ```
2. Export current behaviors and check whether `/ws/chat*` path pattern exists:
   ```bash
   aws cloudfront get-distribution-config --profile nasun-prod --id <DIST_ID> > /tmp/cf-current.json
   jq '.DistributionConfig.CacheBehaviors.Items[]?.PathPattern' /tmp/cf-current.json
   ```
3. Inspect nginx on origin (requires explicit user authorization for SSH into prod EC2 — do NOT run without asking):
   ```bash
   ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 \
     "sudo nginx -T 2>/dev/null | grep -A 5 'location /ws/chat'"
   ```
4. Decide: is the missing piece in CloudFront, nginx, or both? Based on the `via: cloudfront` header + `x-cache: Error from cloudfront` + HTML response, CloudFront is the most likely culprit, but nginx should be verified too.

### Apply the change

Prefer updating via the console for the first fix (reviewable UI, atomic save) unless the user wants CLI/CDK. If CDK defines the distribution, look under `apps/nasun-website/cdk/` for the stack that owns it and modify there. Otherwise use `aws cloudfront update-distribution` with the modified config JSON.

Do NOT invalidate the whole distribution unless needed — new behavior takes effect on deploy. An invalidation on `/index.html` may help users hitting cached fallback.

---

## Verification (mandatory before telling the bug-triage session it is done)

Run all three and all three must pass:

```bash
# 1. Upgrade handshake returns 101, not 200 HTML
curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Version: 13" \
     https://nasun.io/ws/chat | head -5
# Expect: HTTP/1.1 101 Switching Protocols

# 2. REST still works
curl -s -o /dev/null -w "%{http_code}\n" https://nasun.io/chat/health
# Expect: 200

# 3. End-to-end: open a real chat session from a browser on https://nasun.io,
#    post a message, confirm it arrives, confirm the "chat" daily mission ticks.
```

---

## After the fix

1. Report back to the main session ("/bug-triage" conversation, or start a new one and say "CloudFront WS fixed, proceed with chat apply").
2. The main session will:
   - Flip all 22 entries in `.claude/skills/bug-triage/drafts/pending.json` to `approved: true`.
   - Run `APPLY_DRY_RUN=1 bash .claude/skills/bug-triage/scripts/apply-resolutions.sh` to validate payload.
   - Collect `BUG_ADMIN_FN` (via `aws lambda list-functions | grep bug-report-admin`) and `ADMIN_SUB`.
   - Run `APPLY_DRY_RUN=0 BUG_ADMIN_FN=... ADMIN_SUB=... bash .claude/skills/bug-triage/scripts/apply-resolutions.sh`.
3. Draft copy is already written in past tense ("we shipped a fix", "chat should be working again now"), so DO NOT let the triage session apply before verification step 3 above passes end-to-end from a real browser.

---

## Scope guardrails

- Do NOT touch chat-server code (`apps/nasun-website/chat-server/`). This is a routing issue, not a server bug.
- Do NOT restart pm2 on the prod EC2 (per memory: staging chat-server intentionally off; single-instance invariants apply to other bots, not chat, but still avoid unnecessary restarts).
- Do NOT widen scope to fix unrelated chat complaints (mission logic, slow messages). Those are separate triage buckets (C_daily_calc, B_points).
- Token budget: this handoff is part of the 7% weekly cap agreement on the bug-triage work. Keep the session focused; if CloudFront investigation balloons, pause and report back.

---

## Files this handoff touches / references

- `.claude/skills/bug-triage/drafts/pending.json` — 22 drafts gated on this fix
- `.claude/skills/bug-triage/cache/points_chat_bodies.json` — raw report bodies (for reference if wording needs adjustment)
- CloudFront distribution for `nasun.io` (ID to be discovered)
- `/etc/nginx/` on `43.200.67.52` (prod EC2, if nginx side needs a touch)
