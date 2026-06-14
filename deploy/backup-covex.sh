#!/bin/bash
#
# Nightly crash-consistent snapshot of the Covex SQLite database.
#
# Uses `VACUUM INTO`, which holds a single WAL read snapshot for the whole
# copy: safe against the live backend writer and, unlike the sqlite3 CLI's
# .backup (which restarts from page 0 whenever another connection commits),
# it cannot livelock under continuous write load. The snapshot is integrity-
# checked BEFORE it is compressed and rotated, so a corrupt snapshot can never
# silently replace a good one. A small tarball of the service/nginx config
# (including the oracle key drop-in) rides along so a bare-metal rebuild has
# everything it needs.
#
# The live covex.db was relocated to /opt (root disk / sda1) during the 2026-06-13
# disk crisis, so backups now land on the DATA VOLUME (/mnt/HC_Volume_105579109/
# covex-backups by default) - deliberately a different device from the root disk
# that holds the live DB. The covex-backup.service paths.conf drop-in pins both.
#
# Outcome goes to $BACKUP_ROOT/last-backup.txt. The file is pessimistically
# initialized to FAIL at the start of every run, so a run killed by SIGKILL,
# OOM, or set -e can never leave a stale PASS behind.
#
# Scheduled by covex-backup.timer (nightly 03:17 UTC). Run manually with:
#   systemctl start covex-backup.service        # or just: backup-covex.sh
# Verified weekly by restore-drill-covex.sh / covex-restore-drill.timer.

set -euo pipefail

DB_PATH="${DB_PATH:-/opt/covex-db/covex.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/mnt/HC_Volume_105579109/covex-backups}"
DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="${WEEKLY_KEEP:-8}"
MIN_FREE_MB="${MIN_FREE_MB:-5000}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

# never let two backup runs overlap
LOCK_FILE="${LOCK_FILE:-/var/lock/covex-backup.lock}"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    log "FATAL: another backup run holds $LOCK_FILE"
    exit 1
fi

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly"
chmod 700 "$BACKUP_ROOT"

STATUS_FILE="$BACKUP_ROOT/last-backup.txt"
fail() {
    log "FATAL: $*"
    printf 'FAIL %s %s\n' "$(date -u +%FT%TZ)" "$*" > "$STATUS_FILE"
    exit 1
}
# pessimistic init: only the final line of a fully successful run writes PASS
printf 'FAIL %s backup started but did not complete (see journalctl -u covex-backup)\n' \
    "$(date -u +%FT%TZ)" > "$STATUS_FILE"

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 CLI not installed (apt-get install -y sqlite3)"
[ -f "$DB_PATH" ] || fail "database not found at $DB_PATH"

# sweep orphans from runs killed before their EXIT trap could fire (safe: the
# flock guarantees no live run owns these; unmatched globs are no-ops to rm -f)
rm -f "$BACKUP_ROOT"/daily/.covex-*.db.tmp "$BACKUP_ROOT"/daily/*.partial

free_mb=$(df -Pm "$BACKUP_ROOT" | awk 'NR==2{print $4}') || fail "df failed on $BACKUP_ROOT"
[ "$free_mb" -ge "$MIN_FREE_MB" ] || fail "only ${free_mb}MB free on backup filesystem (need ${MIN_FREE_MB}MB) - prune or grow the disk"

stamp=$(date -u +%F)
tmp="$BACKUP_ROOT/daily/.covex-$stamp.db.tmp"
out="$BACKUP_ROOT/daily/covex-$stamp.db.gz"
conf_out="$BACKUP_ROOT/daily/covex-config-$stamp.tar.gz"
trap 'rm -f "$tmp" "$out.partial" "$conf_out.partial"' EXIT

log "snapshotting $DB_PATH ($(du -h "$DB_PATH" | cut -f1)) via VACUUM INTO"
rm -f "$tmp"   # VACUUM INTO refuses to overwrite an existing file
sqlite3 "$DB_PATH" ".timeout 30000" "VACUUM INTO '$tmp'" || fail "VACUUM INTO failed"

check=$(sqlite3 "$tmp" "PRAGMA integrity_check;") || fail "integrity_check could not run on snapshot"
[ "$check" = "ok" ] || fail "snapshot failed integrity_check: $check"
covenants=$(sqlite3 "$tmp" "SELECT count(*) FROM covenants;") || fail "covenants table unreadable in snapshot"
log "snapshot verified: integrity_check=ok covenants=$covenants"

gzip -c "$tmp" > "$out.partial"
mv "$out.partial" "$out"
chmod 600 "$out"
rm -f "$tmp"

# config snapshot: tiny, but a volume-failure rebuild needs the oracle key
# drop-in and nginx site. Missing paths warn rather than abort.
conf_paths=()
for p in /etc/systemd/system/covex-backend.service \
         /etc/systemd/system/covex-backend.service.d \
         /etc/nginx/sites-enabled/hightable.pro; do
    if [ -e "$p" ]; then
        conf_paths+=("$p")
    else
        log "WARN: config path missing, not in snapshot: $p"
    fi
done
if [ "${#conf_paths[@]}" -gt 0 ]; then
    tar czf "$conf_out.partial" "${conf_paths[@]}" 2>/dev/null || fail "config tarball failed"
    mv "$conf_out.partial" "$conf_out"
    chmod 600 "$conf_out"
fi

# Sunday's snapshot is also retained on the weekly schedule
if [ "$(date -u +%u)" = "7" ]; then
    cp "$out" "$BACKUP_ROOT/weekly/covex-$stamp.db.gz"
    chmod 600 "$BACKUP_ROOT/weekly/covex-$stamp.db.gz"
fi

# rotation: filenames sort chronologically, keep the newest N of each kind
prune() {
    local dir=$1 glob=$2 keep=$3
    find "$dir" -maxdepth 1 -name "$glob" | sort | head -n -"$keep" | xargs -r rm -f
}
prune "$BACKUP_ROOT/daily"  "covex-????-??-??.db.gz"      "$DAILY_KEEP"
prune "$BACKUP_ROOT/daily"  "covex-config-*.tar.gz"       "$DAILY_KEEP"
prune "$BACKUP_ROOT/weekly" "covex-????-??-??.db.gz"      "$WEEKLY_KEEP"

log "backup complete: $out ($(du -h "$out" | cut -f1)); daily=$(find "$BACKUP_ROOT/daily" -name 'covex-????-??-??.db.gz' | wc -l) weekly=$(find "$BACKUP_ROOT/weekly" -name 'covex-????-??-??.db.gz' | wc -l); ${free_mb}MB free before run"
printf 'PASS %s %s covenants=%s\n' "$(date -u +%FT%TZ)" "$(basename "$out")" "$covenants" > "$STATUS_FILE"
