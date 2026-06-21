#!/usr/bin/env bash
H="$HOME"
echo "r0validate exists: $(ls -d $H/r0validate 2>/dev/null || echo NO)"
echo "=== r0validate tree (top) ==="; ls -la $H/r0validate 2>/dev/null | head
echo "=== ALL artifacts (rlib/rmeta/elf) under r0validate ==="
find $H/r0validate -name "*.rlib" -o -name "*.rmeta" 2>/dev/null | wc -l
echo "=== written last 180s anywhere under r0validate ==="
find $H/r0validate -type f -newermt "-180 seconds" 2>/dev/null | wc -l
echo "=== cargo registry writes last 180s (network/unpack) ==="
find $H/.cargo/registry -type f -newermt "-180 seconds" 2>/dev/null | wc -l
echo "=== rustc/cargo procs ==="
ps -eo pid,etimes,rss,comm | grep -iE "rustc|cargo|r0vm" | grep -v grep | head -10
echo "=== current crate being built (newest .d in deps) ==="
find $H/r0validate -name "*.d" -newermt "-300 seconds" 2>/dev/null | tail -3
echo "=== FULL template log ==="
cat /tmp/r0template.log 2>/dev/null
echo "DIAG_DONE"
