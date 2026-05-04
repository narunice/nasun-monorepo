# External Monitors

External (out-of-AWS) uptime + content checks for production frontends.
Hosted on BetterStack free tier so the monitor itself is independent of
our AWS infra (catches ap-northeast-2 region outages and same-EC2
cross-app misdeploys).

Provider: https://betterstack.com (Uptime product, free tier)

## Required monitors

Set up via the BetterStack web UI. Free tier covers 10 monitors @ 3-min
interval -- well within budget for the four below.

| # | URL | Type | Match | Why |
|---|---|---|---|---|
| 1 | `https://nasun.io/.app-id` | Keyword | must contain `nasun-website` | Detects nasun web root holding the wrong app's marker (5/3 incident class). |
| 2 | `https://nasun.io/` | Keyword | must contain `<title>Nasun</title>` | Detects HTML body swapped to another app even if marker file is correct. |
| 3 | `https://pado.finance/.app-id` | Keyword | must contain `pado-frontend` | Symmetric protection for pado. |
| 4 | `https://pado.finance/` | Keyword | must contain `<title>Pado</title>` | Symmetric HTML body check. |

Monitor settings:
- Interval: 3 minutes (free tier)
- Request timeout: 10 s
- Regions: any 1+ outside ap-northeast-2 so we observe from a different
  network than our origin.
- Alert on first failure (no debounce). False positive cost = one ignored
  email; false negative cost = another 5/3 incident.
- Recovery notification: enabled.

Notification channels:
- Email: hybrida@gmail.com (or shared ops alias if added later).
- Telegram: same channel as the existing `nasun-monitoring-alerts` SNS
  topic if BetterStack supports webhook -> Telegram. Otherwise just
  email is sufficient at current team size.

## Verification after setup

1. SSH to staging EC2 (`15.165.19.180`, `ubuntu` user, `~/.ssh/.awskey/naru_seoul.pem`).
2. Temporarily corrupt staging.nasun.io's `.app-id` to force a content
   mismatch -- this validates the keyword check end-to-end without
   touching prod.
   - Restore immediately after the test alert fires.
3. Confirm a BetterStack alert email lands within 5 minutes of the change.
4. Restore correct value, confirm "recovered" notification.

NOTE: the verification above uses staging because we never deliberately
break prod for testing. Staging shares the same nginx serving pattern,
so the assertion is representative.

## Account ownership

- BetterStack account email: hybrida@gmail.com (Nasun primary).
- 2FA: enabled.
- Recovery codes: stored in 1Password (or whatever password manager you use).
- Account is single-owner; if onboarding others, add as team member with
  read-only on monitors.

## Related controls

- Local PreToolUse hook in `.claude/settings.json` denies any Bash
  command containing prod IP `43.200.67.52` unless prefixed with the
  canonical deploy script.
- Static linter `scripts/lint-deploy-scripts.sh` validates each
  `deploy-<app>-production.sh` writes to its own web root.
- See `feedback_no_raw_rsync_to_prod.md` (Claude memory) for the
  end-to-end defense plan v2 and the 5/3 incident background.
