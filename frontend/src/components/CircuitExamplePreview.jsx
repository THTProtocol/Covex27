import { useMemo } from 'react';
import { Render as PuckRender } from '@measured/puck';
import '@measured/puck/puck.css';
import puckConfig, { STARTER_TEMPLATES, matchTemplate } from '../lib/puckConfig';

// CircuitExamplePreview: a READ-ONLY, scaled-down render of the covenant WEBSITE a
// given circuit lands in. It reuses the SAME PuckRender + puckConfig the Studio
// canvas and the public page use, so this is a real layout, never a mock. It is
// lazy-loaded (see SandboxGallery's React.lazy) so the heavy Puck bundle is pulled
// only when a visitor actually opens "See an example", keeping the Sandbox initial
// load lean.
//
// The starter page is chosen by matchTemplate() against the circuit id / category /
// name, the same matcher the Studio first-run picker uses. Honesty: this previews
// the marketing/website layout only; how funds actually resolve is shown by the
// SandboxCircuitPreview "how it resolves" flow, not here.

// Synthetic live tokens so {{amount_kaspa}}, {{status}} etc. resolve to plausible
// example values in the preview instead of leaving raw {{token}} text on screen.
const EXAMPLE_LIVE = {
  name: 'Example covenant',
  status: 'Active',
  network: 'mainnet',
  amount_kaspa: 1250,
  total_locked: '1,250 KAS',
  tx_count: 18,
  fee_pct: 2,
  rebate_pct: 0,
  creator: 'kaspa:qexam',
  daa_score: 0,
  verified_tier: 'FREE',
  pool: { total: 1250, yes: 700, no: 550 },
  odds: { yes: 1.72, no: 2.18, basis: 'gross-before-fees' },
  pool_total: 1250,
  pool_yes: 700,
  pool_no: 550,
  odds_yes: '1.72',
  odds_no: '2.18',
  kickoff: '',
  settle_at: '',
  timelock: '',
  enforcement_reality: '',
};

export default function CircuitExamplePreview({ circuit, scale = 0.42, height = 420 }) {
  const tpl = useMemo(() => {
    const hay = `${circuit?.id || ''} ${circuit?.category || ''} ${circuit?.name || ''}`;
    const id = matchTemplate(hay);
    return STARTER_TEMPLATES.find((t) => t.id === id) || STARTER_TEMPLATES[STARTER_TEMPLATES.length - 1];
  }, [circuit]);

  if (!tpl) return null;
  // Fixed-height clipped window onto the top of the scaled page (hero + badge +
  // first sections), the same technique as the Studio thumbnails. Shows a real
  // layout, not a blank box; the user opens the live Studio for the full canvas.
  return (
    <div className="cvx-puck-thumb-clip rounded-xl border border-white/10 light:border-slate-200" style={{ height }} aria-hidden="true">
      <div className="cvx-puck-thumb-page" style={{ '--cvx-thumb-scale': scale }}>
        <PuckRender config={puckConfig} data={tpl.data} metadata={{ live: EXAMPLE_LIVE }} />
      </div>
    </div>
  );
}
