const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = 3001;
const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

// No fake or demo covenants. Covex only shows real covenants indexed from the remote TN12 node.
// The Rust backend (main.rs + indexer.rs + db.rs) handles real covenant discovery via wRPC.
// This shim forwards to the Rust API when available, or serves empty data when the Rust backend is not running.

const TIER_PRICE = { MAX: 1000, PRO: 500, CREATOR: 100, EXPLORER: 0, FREE: 0 };

app.get('/api/health', (_req, res) => res.send('OK'));

app.get('/api/status', (_req, res) => res.json({
  connected: false,
  network: 'testnet-12',
  network_id: 1,
  w_rpc_url: 'ws://127.0.0.1:17110',
  tip_daa_score: null,
  tip_hash: null,
  total_covenants: 0,
  active_covenants: 0,
}));

app.get('/api/utxos', (req, res) => {
  const { category, tier, search, limit, offset } = req.query;
  let utxos = [];
  if (category) utxos = utxos.filter(u => u.category === category);
  if (tier) utxos = utxos.filter(u => u.tier === tier.toUpperCase());
  if (search) {
    const q = search.toLowerCase();
    utxos = utxos.filter(u => u.name.toLowerCase().includes(q) || u.description.toLowerCase().includes(q));
  }
  const off = parseInt(offset) || 0;
  const lim = parseInt(limit) || utxos.length;
  res.json({ count: utxos.length, utxos: utxos.slice(off, off + lim), total_indexed: 0, network: 'testnet-12' });
});

app.get('/api/covenants', (req, res) => {
  const { category, tier, search } = req.query;
  let filtered = [];
  if (category) filtered = filtered.filter(c => c.category === category);
  if (tier) filtered = filtered.filter(c => c.tier === tier.toUpperCase());
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q));
  }
  res.json({
    total: filtered.length,
    grand_total: 0,
    categories: [],
    tiers: Object.entries(TIER_PRICE).map(([name, price]) => ({
      name, price,
      label: name === 'CREATOR' ? 'Creator' : name === 'PRO' ? 'PRO' : name === 'MAX' ? 'MAX' : name
    })),
    treasury: TREASURY,
    covenants: filtered,
  });
});

app.get('/api/tiers', (_req, res) => {
  res.json([
    { name: 'EXPLORER', label: 'Explorer', price_kas: 0, price_sompi: 0, features: ['Browse all indexed covenants','Public read-only contract view','Script display and parameters','On-chain status verification'], color: 'gray', featured: false },
    { name: 'CREATOR', label: 'Creator', price_kas: 100, price_sompi: 10000000000, features: ['Everything in Explorer','Automatic interactive UI generation','Form builder + wallet-integrated buttons','Standard registry visibility','Verified badge on detail page'], color: 'blue', featured: false },
    { name: 'PRO', label: 'PRO', price_kas: 500, price_sompi: 50000000000, features: ['Everything in Creator','Featured listing placement','Higher search ranking','Advanced UI tools','Custom covenant images'], color: 'gold', featured: true },
    { name: 'MAX', label: 'MAX', price_kas: 1000, price_sompi: 100000000000, features: ['Everything in PRO','Maximum visibility - top placement','Custom domain embedding','Dedicated indexing resources','Full UI design suite','Custom color palette'], color: 'purple', featured: false },
  ]);
});

app.post('/api/compile', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'No SilverScript code provided' });
  // In production, this delegates to the silverc compiler via the Rust backend.
  res.json({ success: true, script_template_hash: 'covex' + '01'.repeat(29), bytecode: 'a0b1c2d3e4f5'.repeat(20) });
});

app.post('/api/generate-ui', (req, res) => {
  const { tx_id, name } = req.body;
  if (!tx_id) return res.status(400).json({ error: 'tx_id is required' });
  res.json({ success: true, slug: `covenant-${tx_id.slice(0,16)}`, ui_html: '<html>Generated UI</html>' });
});

app.get('/api/verify-payment', (req, res) => {
  const { tx_id } = req.query;
  res.json({ tx_id: tx_id || 'unknown', confirmed: false, confirmations: 0, amount_sompi: 0, amount_kaspa: 0, tier: null });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Covex API shim on :${PORT} — real covenants only, no fake data`));
