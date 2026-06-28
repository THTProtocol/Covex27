// onChainZkBadge.test.jsx
//
// Guards the KIP-16 on-chain-ZK tier detection in TrustBadge.trustInfo (item 1): the distinct
// teal on-chain-zk tier must resolve from the zk_game_settle kind string WITHOUT a backend enum,
// and must also honor an explicit enforcement_reality === 'on-chain-zk'. It must NOT leak into the
// off-chain full-zk path, and must stay testnet-scoped in its copy.

import { describe, it, expect } from 'vitest';
import { trustInfo } from '../TrustBadge.jsx';

describe('on-chain-zk tier detection (KIP-16 zk_game_settle)', () => {
  it('resolves from redeem_kind "zk_game_settle" with no enforcement_reality', () => {
    const t = trustInfo({ redeem_kind: 'zk_game_settle:720' });
    expect(t.kind).toBe('onchainzk');
    expect(/on-chain ZK/i.test(t.label)).toBe(true);
    expect(/KIP-16/.test(t.label) || /KIP-16/.test(t.desc)).toBe(true);
  });

  it('resolves from a live game settle_mode === "zk_game_settle"', () => {
    const t = trustInfo({ settle_mode: 'zk_game_settle' });
    expect(t.kind).toBe('onchainzk');
  });

  it('honors an explicit enforcement_reality === "on-chain-zk"', () => {
    const t = trustInfo({}, { reality: 'on-chain-zk' });
    expect(t.kind).toBe('onchainzk');
  });

  it('copy stays testnet-gated (never reads as mainnet-live)', () => {
    const t = trustInfo({ redeem_kind: 'zk_game_settle' });
    expect(/testnet/i.test(t.desc)).toBe(true);
    expect(/no oracle or co-sign/i.test(t.desc)).toBe(true);
  });

  it('a plain off-chain circom covenant still reads full-zk, not on-chain-zk', () => {
    // A covenant declaring a real ZK circuit but not zk_game_settle keeps the off-chain full-zk
    // tier: the on-chain-zk detection must be specific to the KIP-16 kind.
    const t = trustInfo({ enforcement_reality: 'full-zk', custom_ui_config: { circuit: 'range_proof' } });
    expect(t.kind).toBe('fullzk');
  });

  it('a bare on-chain primitive is unaffected', () => {
    const t = trustInfo({ enforcement_reality: 'on-chain' });
    expect(t.kind).toBe('onchain');
  });
});
