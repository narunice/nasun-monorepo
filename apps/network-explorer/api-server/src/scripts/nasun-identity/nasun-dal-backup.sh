#!/usr/bin/env bash
# AWS-exit DAL SoT-flip prerequisite 3a: daily logical backup of the box identity DB.
#
# nasun_dal carries BOTH the `public` identity mirror AND the `issuer` schema
# (identity_map / zklogin), which is ALREADY the source of truth for auth (Cognito was
# replaced at the 2026-06-08 issuer cutover) and has no other backup. Once DynamoDB is
# removed the public mirror also loses its DDB-derived recovery path, so this dump becomes
# the durable copy for everything identity.
#
# -Fc custom archive (compressed, pg_restore-able, captures all schemas + GRANTs) plus the
# cluster globals (roles), so a restore to a rebuilt box is self-contained. 14-day rolling
# local retention; ~/bin/pull-box-identity-offaws.sh pulls the newest off-box to the
# external drives (D/G), mirroring pull-points-offaws.sh. Runs as the postgres OS user
# (peer auth) via the nasun-dal-backup.timer systemd timer.
set -euo pipefail

BACKUP_DIR=/srv/nasun/backups
DB=nasun_dal
RETAIN_DAYS=14

mkdir -p "$BACKUP_DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/${DB}-${TS}.dump"
GLOBALS="$BACKUP_DIR/globals-${TS}.sql"

# Data + schema + grants. pg_dump takes a consistent snapshot, so it is safe to run
# concurrently with the 10-min dal-reload swap (it never observes a half-built table).
pg_dump -Fc "$DB" -f "$OUT.partial"
# Integrity gate: the archive TOC must parse before we publish the file under its final name.
pg_restore --list "$OUT.partial" >/dev/null
mv -f "$OUT.partial" "$OUT"

# Cluster roles (least-privilege isolation: nasun_identity / nasun_chat_ro / issuer-app-keeper / ...).
pg_dumpall --globals-only -f "$GLOBALS.partial"
mv -f "$GLOBALS.partial" "$GLOBALS"

# Rolling retention (matches node-3's 14-day points dump window).
find "$BACKUP_DIR" -maxdepth 1 \( -name "${DB}-*.dump" -o -name "globals-*.sql" \) -mtime "+${RETAIN_DAYS}" -delete

echo "nasun-dal-backup OK: $OUT ($(du -h "$OUT" | cut -f1)) + $(basename "$GLOBALS")"
