#!/usr/bin/env bash
# Overnight monitor: keep RAM clear, wait for chess_v1.zkey, run finish_phase2, log status.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/games/chess/output"
ZKEY="$OUT/chess_v1.zkey"
CHESS_PID="${CHESS_SETUP_PID:-30259}"
LOG="$OUT/overnight_watch.log"
GUARD="$ROOT/scripts/chess_ram_guard.sh"
FINISH="$ROOT/games/chess/scripts/finish_phase2.sh"
MIN_RAM_MB="${MIN_RAM_MB:-2000}"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

ram_avail_mb() {
  awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo
}

free_ram_if_low() {
  local avail
  avail=$(ram_avail_mb)
  if [[ "$avail" -lt "$MIN_RAM_MB" ]]; then
    log "LOW RAM ${avail}MiB < ${MIN_RAM_MB}MiB — running ram guard"
    bash "$GUARD" >> "$LOG" 2>&1 || true
    avail=$(ram_avail_mb)
    log "RAM after guard: ${avail}MiB"
  fi
}

log "=== overnight watch start ==="
log "chess setup pid=$CHESS_PID target=$ZKEY"

while [[ ! -f "$ZKEY" ]]; do
  if ! kill -0 "$CHESS_PID" 2>/dev/null; then
    log "ERROR: chess setup pid $CHESS_PID died without zkey"
    exit 1
  fi
  free_ram_if_low
  cpu=$(ps -p "$CHESS_PID" -o %cpu= 2>/dev/null | tr -d ' ' || echo "?")
  log "waiting zkey cpu=${cpu}% ram=$(ram_avail_mb)MiB elapsed=$(ps -p "$CHESS_PID" -o etime= 2>/dev/null | tr -d ' ')"
  sleep 300
done

log "ZKEY READY: $(ls -lh "$ZKEY")"
log "Running finish_phase2.sh..."
bash "$FINISH" >> "$LOG" 2>&1
log "finish_phase2 complete"

# Restart kaspad watchdog after chess done
if [[ -x /home/kasparov/kaspa/watchdog.sh ]]; then
  log "Restarting kaspad watchdog..."
  nohup /home/kasparov/kaspa/watchdog.sh >> /home/kasparov/kaspa/logs/watchdog.log 2>&1 &
fi

log "=== overnight watch done ==="