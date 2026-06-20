module.exports = {
  apps: [
    {
      name: 'nasun-chat-server',
      script: 'dist/server.js',
      max_memory_restart: '1024M',
      // 2026-05-19: pnl phase eventually balloons 14s → 45s on long-running
      // processes (see slow-cycle phase analysis after the 12:18 UTC incident).
      // The spike cycles push native fetch I/O callbacks past 60s, which trips
      // banned-loader / identity-resolver timeouts and silently drops Telegram
      // sendMessage. Daily 18:00 UTC (03:00 KST) restart caps accumulated
      // workload growth. Distance from weekly-settlement window (Mon 00:15 UTC)
      // is wide enough that they cannot interleave.
      //
      // 2026-05-22: pnl is no longer a slow-cycle outlier — it is the steady
      // state. Every cycle now measures pnl 53-80s, volume 36-92s,
      // weeklySync 21-25s, total 118-185s. With AGGREGATION_INTERVAL_MS=60000
      // the worker ran back-to-back continuously, holding a SQLite write/read
      // lock on leaderboard.db long enough for main-thread heartbeat handlers
      // to hit better-sqlite3 busy_timeout (30s) and exceed the 15s client
      // timeout — surfaced as 4 agents simultaneously failing wake-registration
      // POSTs. Bumped to 240000 to force an idle gap (~60-120s) per cycle so
      // main-thread queries get a contention-free window. Steady-state data
      // freshness drops from ~2-3 min (effective due to overlap) to ~4-5 min.
      cron_restart: '0 18 * * *',
      node_args: '--max-old-space-size=700',  // 2026-05-14: bumped from 450M after aggregator moved to worker_threads. Main + worker each respect this V8 cap; combined RSS ~530MB observed, 1024M RSS ceiling leaves headroom.
      kill_timeout: 105000,                   // crash drain budget 90s + parent grace 95s + 10s margin (see crash/constants.ts)
      wait_ready: false,
      max_restarts: 15,
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      autorestart: true,
      env: {
        // Force IPv4 first in Node's DNS resolver. The prod EC2 has no IPv6
        // default route, so undici's dual-stack fetch was trying the AAAA
        // record first, hanging on the IPv6 connect, and surfacing it as an
        // AggregateError with cause_code=ETIMEDOUT. 2026-05-20 incident: every
        // baram-tg sendMessage / banned-loader / identity-resolver refresh
        // failed this way while shell curl on the same host worked because
        // curl falls back aggressively to IPv4. ipv4first reorders dns.lookup
        // so undici reaches the working A record first.
        NODE_OPTIONS: '--dns-result-order=ipv4first',
        PORT: '3101',
        ALLOWED_ORIGINS: 'https://nasun.io,https://www.nasun.io,https://staging.nasun.io,https://pado.finance,https://www.pado.finance,https://staging.pado.finance,https://gostop.app,https://www.gostop.app,https://staging.gostop.app',
        TRUST_PROXY: 'true',
        CHAT_DB_PATH: './data/chat.db',
        LEADERBOARD_DB_PATH: './data/leaderboard.db',
        CRASH_HISTORY_DB_PATH: './data/crash-history.db',
        RPC_URL: 'http://127.0.0.1:9000',
        INDEXER_POLL_INTERVAL_MS: '5000',
        AGGREGATION_INTERVAL_MS: '240000',
        NASUN_PROFILE_API_URL: 'https://api.nasun.io/profile',
        GENESIS_PASS_API_URL: 'https://api.nasun.io',
        DEEPBOOK_PACKAGE: '0xf0dce6bfc71db3f20be146e65a70cc721dd82d6bc1a1be84febfa58a1018ea00',
        POOL_NBTC_NUSDC: '0x1addff570f17f0e12fa14c5f986806ce21bd5cc0542c4548ebf011a56eb26ec9',
        POOL_NASUN_NUSDC: '0x91f5e123cd1211347dd8dc8a92bfde99a2153844d795c2ccfe6ad43d4a26ec03',
        POOL_NETH_NUSDC: '0x2fb410e4505fabc13b2791e801969cd9691ad2dc47173fb1b3d7e7811cc37209',
        POOL_NSOL_NUSDC: '0xbdcaa69717ffcc5ce67a983903c0d77adabe944ad8d478e618345f66ee7e01c6',
        // Nasun AI alpha (flipped ON 2026-05-22 after alpha-migration SQL
        // applied + PR-2 deployed + admin/hybrida slot_exempt provisioned).
        // System cap reduced 8 → 6 so admin/hybrida exempt slots (santa +
        // admin agent + hybrida personal agents) bring total active to ~8
        // while public users rotate within 6.
        ALPHA_GATE_ENABLED: 'true',
        // PAUSED 2026-05-23 → DOGFOOD 2026-05-24 → RESUME 2026-05-24:
        // original '6', lowered to '4' to halt waitlist handoff during UX
        // rework, bumped to '5' for admin dogfood, now restored to '6' as
        // public alpha resumes. Held at '6' (not '8') because the EC2
        // instance (3.7 GiB RAM, swap 100% utilized) cannot safely host
        // 8 concurrent agents without risking the 2026-05-13/22 chat-
        // server saturation incident class. Bumping above 6 requires
        // EC2 upsize first.
        NASUN_AI_ALPHA_SYSTEM_CAP: '6',
        // 2026-05-24: lowered from 129600000 (36h) to 86400000 (24h) so the
        // alpha slot rotation reaches more waitlisted users per day. Existing
        // agents keep whatever expires_at they were stamped with; only new
        // activations land on the 24h TTL.
        NASUN_AI_ALPHA_AGENT_TTL_MS: '86400000',       // 24h
        // 2026-05-24: bumped from 21600000 (6h) to 36000000 (10h) after
        // sunominq incident. 6h was too tight: ~8 alpha testers who missed
        // the Telegram invite within their work day got auto-requeued at the
        // back of the line on a single missed claim.
        // 2026-05-30: bumped 10h -> 12h. Outbound invite DMs were promising a
        // 12h window while the gate enforced 10h; users who acted within the
        // promised window (hour 10-12) found the slot already gone (zzangddoru).
        // 2026-06-01: bumped 12h -> 16h. A tester (lavanyalakshma2) received an
        // invite but could not activate within 12h and got auto-requeued; a
        // wider window better tolerates timezone gaps for international testers.
        NASUN_AI_ALPHA_CLAIM_WINDOW_MS: '57600000',    // 16h
        // INDEXER_EXCLUDED_ADDRESSES intentionally NOT listed here so the value
        // sourced from .env (via `set -a && source .env && set +a` before
        // `pm2 startOrRestart`) reaches the process. Listing it with a
        // placeholder previously shadowed the .env value and silently no-op'd
        // bot exclusion (2026-05-05 — discovered when prediction-market LP bot
        // pair kept appearing on the weekly leaderboard despite .env update).
        // Secrets (INTERNAL_API_KEY, ANTHROPIC_API_KEY): set in .env on server
      },
    },
  ],
};
