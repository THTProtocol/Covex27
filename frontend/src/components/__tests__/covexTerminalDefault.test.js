// covexTerminalDefault.test.js
//
// GAP 11 regression guards for CovexTerminal Studio's pure exports.
//
// The deleted chess_v1 circuit used to be the DEFAULT circuit + arena gate and shipped a dead
// "Full FIDE chess ruleset proven" ZK overclaim. These tests pin:
//   1. canonicalGameMetaKey folds every chess variant (and the deleted chess_v1 alias) onto the
//      canonical shipping id chess_blitz, so the script-generator switch resolves the chess
//      covenant shell instead of falling through to the generic custom default.
//   2. generateSilverScriptForConfig() with the chess default emits the chess covenant - proving
//      the default RESOLVES - and carries NO "ZK proves / ZK circuit enforces FIDE" overclaim
//      (chess is resolved by the server-authoritative engine, not a SNARK).

import { describe, it, expect } from 'vitest';
import { canonicalGameMetaKey, generateSilverScriptForConfig } from '../CovexTerminal.jsx';

describe('GAP 11: canonicalGameMetaKey folds chess variants onto the shipping default', () => {
  it('maps the deleted chess_v1 id and every chess variant to chess_blitz', () => {
    expect(canonicalGameMetaKey('chess_v1')).toBe('chess_blitz');
    expect(canonicalGameMetaKey('chess_blitz')).toBe('chess_blitz');
    expect(canonicalGameMetaKey('chess_bullet')).toBe('chess_blitz');
    expect(canonicalGameMetaKey('chess_legal_move')).toBe('chess_blitz');
    expect(canonicalGameMetaKey('chess_checkmate')).toBe('chess_blitz');
  });

  it('passes non-chess circuit ids through unchanged', () => {
    expect(canonicalGameMetaKey('merkle_membership')).toBe('merkle_membership');
    expect(canonicalGameMetaKey('range_proof')).toBe('range_proof');
    expect(canonicalGameMetaKey('')).toBe('');
    expect(canonicalGameMetaKey(undefined)).toBe('');
  });
});

describe('GAP 11: the default circuit resolves to a real chess covenant with no FIDE-ZK overclaim', () => {
  // The component state default + the generator default are both chess_blitz now.
  const script = generateSilverScriptForConfig({ gameType: 'chess_blitz', resolutionMode: 'oracle' });

  it('emits the chess covenant shell (the default RESOLVES, not the custom fallback)', () => {
    expect(script).toContain('ChessDuelCovenant');
    expect(script).not.toContain('CustomCircuitCovenant');
  });

  it('honestly frames chess as the server-authoritative engine, NOT a ZK circuit', () => {
    expect(script).toMatch(/server-authoritative engine/i);
    // The dead overclaim copy must be gone: no "ZK circuit ... ENFORCES ... FIDE" and no claim a
    // ZK proof proves the chess game.
    expect(script).not.toMatch(/ZK CIRCUIT \(chess/i);
    expect(script).not.toMatch(/The ZK proof commits to the full PGN/i);
    expect(script).not.toMatch(/Full FIDE chess ruleset proven/i);
    expect(script).not.toContain('0xCHESSv1_8x8_STANDARD');
  });

  it('the deleted chess_v1 id still resolves to the same chess covenant (back-compat)', () => {
    const legacy = generateSilverScriptForConfig({ gameType: 'chess_v1', resolutionMode: 'oracle' });
    expect(legacy).toContain('ChessDuelCovenant');
    expect(legacy).not.toContain('CustomCircuitCovenant');
  });
});
