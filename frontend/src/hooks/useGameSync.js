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
  const seenMoves = useRef(-1);
  const onMovesRef = useRef(onMoves);
  onMovesRef.current = onMoves;

  const myColor = useMemo(() => {
    if (!game || !address) return null;
    if (game.player1 === address) return 'white';
    if (game.player2 === address) return 'black';
    return null; // spectator
  }, [game, address]);

  const applyServerGame = useCallback((g) => {
    if (!g) return;
    setGame(g);
    const moves = Array.isArray(g.moves) ? g.moves : [];
    if (moves.length !== seenMoves.current) {
      seenMoves.current = moves.length;
      onMovesRef.current?.(moves, g);
    }
  }, []);

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
      if (d.success) { applyServerGame(d.game); return true; }
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
        body: JSON.stringify({ player: address, move, finished, winner, keep_turn: keepTurn }),
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

  const resign = useCallback(() => {
    if (!myColor || !game || game.status !== 'active') return Promise.resolve(false);
    const winner = myColor === 'white' ? 'black' : 'white';
    return submitMove('resign', { finished: true, winner });
  }, [myColor, game, submitMove]);

  const status = game?.status || 'none';
  const isMyTurn = !!(game && myColor && game.status === 'active' && game.current_turn === myColor);

  return { game, status, myColor, isMyTurn, joining, error, setError, join, submitMove, resign, refresh };
}
