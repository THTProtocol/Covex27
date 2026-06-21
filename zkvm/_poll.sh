i=0
while [ "$i" -lt 48 ]; do
  if grep -q REAL_DONE /tmp/chess_prove_real.log; then echo DONE_FOUND; break; fi
  i=$((i+1))
  sleep 10
done
echo POLL_END
