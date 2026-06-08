#!/usr/bin/env bash
# Free RAM for chess zkey ceremony; prevent respawns until chess is done.
set -euo pipefail

CHESS_PID="${CHESS_SETUP_PID:-30259}"
LOG="/home/kasparov/Covex27/zk/games/chess/output/ram_guard.log"
ZK="/home/kasparov/Covex27/zk"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

kill_verify_dupes() {
  local pids
  pids=$(ps -eo pid=,args= | awk '/\/home\/kasparov\/Covex27\/zk\/verify_/ && !/awk/ {print $1}')
  if [[ -n "$pids" ]]; then
    log "killing verify_* jobs: $(echo "$pids" | wc -w)"
    echo "$pids" | xargs -r kill 2>/dev/null || true
  fi
}

stop_kaspad() {
  if [[ -f /home/kasparov/kaspa/watchdog.pid ]]; then
    local wd
    wd=$(cat /home/kasparov/kaspa/watchdog.pid 2>/dev/null || true)
    [[ -n "$wd" ]] && kill "$wd" 2>/dev/null || true
  fi
  ps -eo pid=,args= | awk '/\/home\/kasparov\/kaspa\/kaspad/ && !/awk/ {print $1}' | xargs -r kill 2>/dev/null || true
  sleep 2
  ps -eo pid=,args= | awk '/\/home\/kasparov\/kaspa\/kaspad/ && !/awk/ {print $1}' | xargs -r kill -9 2>/dev/null || true
}

cleanup_temp() {
  find "$ZK" -maxdepth 3 \( -name '*.wtns' -o -name '.wtns*' \) -delete 2>/dev/null || true
}

ram_avail_mb() {
  awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo
}

log "=== chess_ram_guard start (chess pid $CHESS_PID) ==="
kill_verify_dupes
stop_kaspad
cleanup_temp
sync 2>/dev/null || true
log "RAM available: $(ram_avail_mb) MiB"