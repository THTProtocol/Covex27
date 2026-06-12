#!/bin/bash
#
# Weekly restore drill for Covex backups: proves the newest nightly snapshot
# actually restores to a working database, not just that a file exists.
#
# Checks, in order:
#   1. a daily backup exists and is less than 48h old (i.e. the timer is alive)
#   2. no daily snapshot is missing since the oldest retained one (a Mon-Fri
#      outage cannot hide behind one good Saturday backup)
#   3. enough disk headroom exists to decompress it
#   4. it gunzips cleanly
#   5. PRAGMA integrity_check passes on the restored file
#   6. the schema is intact (>= 10 tables) and key tables hold sane row counts
#
# Result goes to $BACKUP_ROOT/last-restore-drill.txt. The file is
# pessimistically initialized to FAIL at the start of every run, so a run
# killed by SIGKILL, OOM, or set -e can never leave a stale PASS behind.
# Exits nonzero on failure so systemd flags the unit (and OnFailure= fires).
#
# Scheduled by covex-restore-drill.timer (Sundays 04:17 UTC); the service
# pulls in covex-backup.service first, so it always drills a fresh snapshot.

set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/covex}"
MIN_COVENANTS="${MIN_COVENANTS:-1000}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

# never let two drill runs overlap
LOCK_FILE="${LOCK_FILE:-/var/lock/covex-restore-drill.lock}"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    log "FATAL: another restore drill holds $LOCK_FILE"
    exit 1
fi

mkdir -p "$BACKUP_ROOT/daily"
STATUS_FILE="$BACKUP_ROOT/last-restore-drill.txt"
fail() {
    log "DRILL FAIL: $*"
    printf 'FAIL %s %s\n' "$(date -u +%FT%TZ)" "$*" > "$STATUS_FILE"
    exit 1
}
# pessimistic init: only the final line of a fully successful run writes PASS
printf 'FAIL %s drill started but did not complete (see journalctl -u covex-restore-drill)\n' \
    "$(date -u +%FT%TZ)" > "$STATUS_FILE"

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 CLI not installed"

# sweep scratch dirs orphaned by runs killed before their EXIT trap could fire
rm -rf "$BACKUP_ROOT"/.restore-drill.*

# scratch lives on the backup disk, NOT /tmp: /tmp is tmpfs (RAM) on current
# Debian, and a 370MB+ restore there would squeeze the live backend
WORK=$(mktemp -d "$BACKUP_ROOT/.restore-drill.XXXXXX") || fail "mktemp failed under $BACKUP_ROOT"
export SQLITE_TMPDIR="$WORK"
trap 'rm -rf "$WORK"' EXIT

latest=$(find "$BACKUP_ROOT/daily" -maxdepth 1 -name 'covex-????-??-??.db.gz' | sort | tail -n 1) \
    || fail "cannot list $BACKUP_ROOT/daily"
[ -n "$latest" ] || fail "no daily backups found in $BACKUP_ROOT/daily"

mtime=$(stat -c %Y "$latest") || fail "cannot stat $latest"
age_hours=$(( ($(date +%s) - mtime) / 3600 ))
[ "$age_hours" -le 48 ] || fail "newest backup is ${age_hours}h old (>48h) - is covex-backup.timer running?"

# continuity: every calendar day since the oldest retained snapshot must have
# one (tolerates the first week after install, when older days never existed)
oldest=$(find "$BACKUP_ROOT/daily" -maxdepth 1 -name 'covex-????-??-??.db.gz' | sort | head -n 1) \
    || fail "cannot list $BACKUP_ROOT/daily"
oldest_date=${oldest##*/covex-}
oldest_date=${oldest_date%.db.gz}
for d in 1 2 3 4 5 6; do
    day=$(date -u -d "-$d day" +%F) || fail "date arithmetic failed"
    [[ "$day" < "$oldest_date" ]] && continue
    [ -f "$BACKUP_ROOT/daily/covex-$day.db.gz" ] || fail "missing daily backup for $day - check journalctl -u covex-backup"
done

# headroom check before decompressing (~uncompressed size + slack)
unc_bytes=$(gzip -l "$latest" | awk 'NR==2{print $2}') || fail "gzip -l failed on $latest"
need_mb=$(( unc_bytes / 1048576 + 512 ))
free_mb=$(df -Pm "$BACKUP_ROOT" | awk 'NR==2{print $4}') || fail "df failed on $BACKUP_ROOT"
[ "$free_mb" -ge "$need_mb" ] || fail "only ${free_mb}MB free under $BACKUP_ROOT (need ~${need_mb}MB to restore)"

gunzip -c "$latest" > "$WORK/restored.db" || fail "gunzip failed for $latest"

check=$(sqlite3 "$WORK/restored.db" "PRAGMA integrity_check;") || fail "sqlite3 could not run integrity_check on restored DB"
[ "$check" = "ok" ] || fail "integrity_check on restored DB: $check"

tables=$(sqlite3 "$WORK/restored.db" "SELECT count(*) FROM sqlite_master WHERE type='table';") || fail "could not count tables in restored DB"
[ "$tables" -ge 10 ] || fail "only $tables tables in restored DB (expected >= 10)"

covenants=$(sqlite3 "$WORK/restored.db" "SELECT count(*) FROM covenants;") || fail "covenants table missing or unreadable"
[ "$covenants" -ge "$MIN_COVENANTS" ] || fail "covenants count suspiciously low: $covenants (expected >= $MIN_COVENANTS)"

payments=$(sqlite3 "$WORK/restored.db" "SELECT count(*) FROM payments;") || fail "payments table missing or unreadable"
custom_uis=$(sqlite3 "$WORK/restored.db" "SELECT count(*) FROM custom_ui_configs;") || fail "custom_ui_configs table missing or unreadable"

log "DRILL PASS: $(basename "$latest") restores cleanly (tables=$tables covenants=$covenants payments=$payments custom_ui_configs=$custom_uis)"
printf 'PASS %s %s covenants=%s\n' "$(date -u +%FT%TZ)" "$(basename "$latest")" "$covenants" > "$STATUS_FILE"
