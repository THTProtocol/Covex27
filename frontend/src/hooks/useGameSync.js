import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWallet } from '../components/WalletContext';

/**
 * Shared transport for persistent covenant matches (/api/games/:id).
 *
 * The hook owns the match record, seats, turn state, and live sync (WebSocket
 * with a 5s polling fallback). Game rules stay in the component, which
 * rebuilds its board by replaying the server move log in onMoves; rules are
 * deterministic so replay is the single source of truth for board state.
 *
 * Server vocabulary (backend/src/games.rs): player1 always moves on
 * current_turn 'white', player2 on 'black', for every game type. Components
 * map white/black onto their own piece labels (R/Y, X/O, B/W, ...).
 * Winner strings sent to the server are 'white' | 'black' | 'draw'.
 */
export default function useGameSync({ covenantId, gameType, stake = 0, onMoves }) {
  const { address } = useWallet();
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  // Live server-authoritative clocks (ms remaining per side), ticked locally between
  // syncs off the server's snapshot so the countdown is smooth but never client-trusted.
  const [clocks, setClocks] = useState({ whiteMs: 0, blackMs: 0 });
  const seenMoves = useRef(-1);
  const syncedAt = useRef(0);
  const claimedAt = useRef(0);
  // Per-seat secret issued by the server exactly once when this client took its
  // seat. It must accompany every move/resign so the opponent (who knows only
  // the public addresses) cannot act for this side. Persisted so a reload of the
  // same browser keeps the seat; the server never re-issues it on rejoin.
  const seatToken = useRef('');
  const onMovesRef = useRef(onMoves);
  onMovesRef.current = onMoves;

  useEffect(() => {
    if (!covenantId) return;
    try { seatToken.current = localStorage.getItem(`covex_seat_token:${covenantId}`) || ''; } catch { seatToken.current = ''; }
  }, [covenantId]);

  const myColor = useMemo(() => {
    if (!game || !address) return null;
    if (game.player1 === address) return 'white';
    if (game.player2 === address) return 'black';
    return null; // spectator
  }, [game, address]);

  const applyServerGame = useCallback((g) => {
    if (!g) return;
    syncedAt.current = Date.now();
    setGame(g);
    const moves = Array.isArray(g.moves) ? g.moves : [];
    if (moves.length !== seenMoves.current) {
      seenMoves.current = moves.length;
      onMovesRef.current?.(moves, g);
    }
  }, []);

  const claimTimeout = useCallback(() => {
    if (!covenantId) return;
    // throttle: avoid spamming while the server finalises
    if (Date.now() - claimedAt.current < 3000) return;
    claimedAt.current = Date.now();
    fetch(`/api/games/${encodeURIComponent(covenantId)}/claim-timeout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
      .then((r) => r.json())
      .then((d) => { if (d?.success && d.timed_out) applyServerGame(d.game); })
      .catch(() => {});
  }, [covenantId, applyServerGame]);

  // Tick the clocks locally off the latest server snapshot. When the side to move
  // flatlines, ask the server to finalise the timeout (server recomputes and decides).
  useEffect(() => {
    if (!game) return undefined;
    const tick = () => {
      const p1 = Number(game.p1_time_ms) || 0;
      const p2 = Number(game.p2_time_ms) || 0;
      const started = Number(game.turn_started_at) || 0;
      const serverNow = Number(game.server_now) || 0;
      let whiteMs = p1;
      let blackMs = p2;
      if (game.status === 'active' && started > 0) {
        const elapsedMs = (serverNow - started) * 1000 + (Date.now() - syncedAt.current);
        if (game.current_turn === 'white') whiteMs = Math.max(0, p1 - elapsedMs);
        else blackMs = Math.max(0, p2 - elapsedMs);
      }
      setClocks({ whiteMs, blackMs });
      if (game.status === 'active') {
        if (game.current_turn === 'white' && whiteMs <= 0) claimTimeout();
        else if (game.current_turn === 'black' && blackMs <= 0) claimTimeout();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [game, claimTimeout]);

  const refresh = useCallback(() => {
    if (!covenantId) return;
    fetch(`/api/games/${encodeURIComponent(covenantId)}`)
      .then((r) => r.json())
      .then((d) => applyServerGame(d.game))
      .catch(() => {});
  }, [covenantId, applyServerGame]);

  // Initial load + polling fallback
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // Live sync over WebSocket
  useEffect(() => {
    if (!covenantId) return undefined;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if ((msg.type === 'game_move' || msg.type === 'game_update') && msg.data?.covenant_id === covenantId) {
            applyServerGame(msg.data.game);
          }
        } catch { /* non-JSON frame */ }
      };
      return () => ws.close();
    } catch { return undefined; }
  }, [covenantId, applyServerGame]);

  const join = useCallback(async () => {
    if (!address) {
      setError('Connect a wallet to claim a seat. Spectating works without one.');
      return false;
    }
    setJoining(true);
    setError(null);
    try {
      const r = await fetch(`/api/games/${encodeURIComponent(covenantId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: address, game_type: gameType, pot_amount_kas: stake }),
      });
      const d = await r.json();
      if (d.success) {
        if (d.your_token) {
          seatToken.current = d.your_token;
          try { localStorage.setItem(`covex_seat_token:${covenantId}`, d.your_token); } catch { /* storage blocked */ }
        }
        applyServerGame(d.game);
        return true;
      }
      setError(d.error || 'Could not join.');
      return false;
    } catch (e) {
      setError(e?.message || 'Network error.');
      return false;
    } finally {
      setJoining(false);
    }
  }, [covenantId, gameType, stake, address, applyServerGame]);

  const submitMove = useCallback(async (move, { finished = false, winner = null, keepTurn = false } = {}) => {
    try {
      const r = await fetch(`/api/games/${encodeURIComponent(covenantId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: address, move, finished, winner, keep_turn: keepTurn, token: seatToken.current }),
      });
      const d = await r.json();
      if (!d.success) { setError(d.error || 'Move rejected.'); refresh(); return false; }
      applyServerGame(d.game);
      return true;
    } catch (e) {
      setError(e?.message || 'Network error.');
      refresh();
      return false;
    }
  }, [covenantId, address, applyServerGame, refresh]);

  // Quitting = losing. Hits the dedicated server endpoint, which records the win for
  // the opponent (works on OR off your turn). The server decides the winner, not us.
  const resign = useCallback(async () => {
    if (!address || !game || game.status !== 'active') return false;
    try {
      const r = await fetch(`/api/games/${encodeURIComponent(covenantId)}/resign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: address, token: seatToken.current }),
      });
      const d = await r.json();
      if (d?.success) { applyServerGame(d.game); return true; }
      setError(d?.error || 'Could not resign.');
      return false;
    } catch (e) {
      setError(e?.message || 'Network error.');
      return false;
    }
  }, [covenantId, address, game, applyServerGame]);

  const status = game?.status || 'none';
  const isMyTurn = !!(game && myColor && game.status === 'active' && game.current_turn === myColor);

  return { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign, refresh, clocks, claimTimeout };
}
