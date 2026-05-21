const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = 3001;
const TREASURY = 'kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m';

const COVENANTS = [
  { id:'flipcoin', name:'FlipCoin', category:'Skill Contests', covenant_type:'p2sh-covenant', tier:'PRIORITY', tier_kas:500, amount_kaspa:500.0, amount_sompi:50000000000, tx_id:'70122ad3eb35bc8d7b29a3e8d9f52c7e4a1b6d0f8e3c9a7b5d2f4e6a8c0d3f7b2', script_hash:'3c9a7b5d2f4e6a8c0d3f7b270122ad3eb', creator_addr:'kaspatest:pxf3txjsl2qk98asd7f3h2k1m9d6c0v7b5n4p8z6q', desc:'Provably fair coin flip with winner-takes-all payout. Powered by SilverScript.' },
  { id:'rankedmatch', name:'RankedMatch', category:'Skill Contests', covenant_type:'p2sh-covenant', tier:'ENTERPRISE', tier_kas:1000, amount_kaspa:1500.0, amount_sompi:150000000000, tx_id:'7220235db84ec8a97b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a', script_hash:'5d6e7f8a9b0c1d2e3f4a7220235db84e', creator_addr:'kaspatest:pq2k8asd7f3h2k1m9d6c0v7b5n4p8z6qpxf3txj', desc:'Professional 1v1 competitive matchmaking with crypto stakes.' },
  { id:'reactiongame', name:'ReactionGame', category:'Skill Contests', covenant_type:'spendable-covenant', tier:'CREATOR', tier_kas:100, amount_kaspa:1000.0, amount_sompi:100000000000, tx_id:'14b27e71a1e7f8d9c0b1a2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3', script_hash:'0b1a2d3e4f5a6b7c8d9e0f1a2b3c4d5e', creator_addr:'kaspatest:pk9d6c0v7b5n4p8z6qpxf3txjsl2qk8as', desc:'Speed-based contest where the first valid on-chain click claims the prize pool.' },
  { id:'priceoracle', name:'PriceOracle', category:'Predictive Markets', covenant_type:'p2sh-covenant', tier:'ENTERPRISE', tier_kas:1000, amount_kaspa:2000.0, amount_sompi:200000000000, tx_id:'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a', script_hash:'2e3f4a5b6c7d8e9f0ab2c3d4e5f6a7b', creator_addr:'kaspatest:pq8z6qpxf3txjsl2qk8asd7f3h2k1m9d6c0', desc:'Real-time asset price settlement by cryptographic oracle signatures.' },
  { id:'binarybet', name:'BinaryBet', category:'Predictive Markets', covenant_type:'generic-covenant', tier:'PRIORITY', tier_kas:500, amount_kaspa:750.0, amount_sompi:75000000000, tx_id:'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b', script_hash:'4a5b6c7d8e9f0a1bc3d4e5f6a7b8c9d', creator_addr:'kaspatest:pq1m9d6c0v7b5n4p8z6qpxf3txjsl2qk8', desc:'Simple yes/no binary outcome prediction market.' },
  { id:'multisigescrow', name:'MultiSigEscrow', category:'Escrow & Custody', covenant_type:'multi-sig-covenant', tier:'PRIORITY', tier_kas:500, amount_kaspa:3000.0, amount_sompi:300000000000, tx_id:'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d', script_hash:'6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f', creator_addr:'kaspatest:pq7f3h2k1m9d6c0v7b5n4p8z6qpxf3txj', desc:'M-of-N multisig escrow for secure, trust-minimized trades.' },
  { id:'timelockescrow', name:'TimelockEscrow', category:'Escrow & Custody', covenant_type:'p2sh-covenant', tier:'CREATOR', tier_kas:100, amount_kaspa:0, amount_sompi:0, tx_id:'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f', script_hash:'8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4', creator_addr:'kaspatest:pq5b5n4p8z6qpxf3txjsl2qk8asd7f3h', desc:'Time-based fund release mechanism with block height threshold.' },
  { id:'elimination', name:'EliminationBracket', category:'Tournaments', covenant_type:'p2sh-covenant', tier:'ENTERPRISE', tier_kas:1000, amount_kaspa:5000.0, amount_sompi:500000000000, tx_id:'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a', script_hash:'0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', creator_addr:'kaspatest:pq3txjsl2qk8asd7f3h2k1m9d6c0v7b5', desc:'Single-elimination tournament bracket with automated progression.' },
  { id:'governancevote', name:'GovernanceVote', category:'Governance', covenant_type:'generic-covenant', tier:'PRIORITY', tier_kas:500, amount_kaspa:1000.0, amount_sompi:100000000000, tx_id:'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d', script_hash:'2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a', creator_addr:'kaspatest:pq4p8z6qpxf3txjsl2qk8asd7f3h2k1m', desc:'On-chain governance with delegated voting power and quadratic voting.' },
  { id:'flashloan', name:'FlashLoan', category:'Flash Covenants', covenant_type:'extended-covenant', tier:'ENTERPRISE', tier_kas:1000, amount_kaspa:10000.0, amount_sompi:1000000000000, tx_id:'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f', script_hash:'4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f', creator_addr:'kaspatest:pq6h2k1m9d6c0v7b5n4p8z6qpxf3txjs', desc:'Borrow and repay within a single block execution. Zero-risk arbitrage protocol.' },
  { id:'streampay', name:'StreamPayment', category:'Structured Settlement', covenant_type:'p2sh-covenant', tier:'CREATOR', tier_kas:100, amount_kaspa:2500.0, amount_sompi:250000000000, tx_id:'f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9', script_hash:'6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e', creator_addr:'kaspatest:pq2d7f3h2k1m9d6c0v7b5n4p8z6qpxf3', desc:'Continuous streaming payments with per-block settlement.' },
  { id:'communitypool', name:'CommunityPool', category:'Community Pools', covenant_type:'p2sh-covenant', tier:'PRIORITY', tier_kas:500, amount_kaspa:8000.0, amount_sompi:800000000000, tx_id:'d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3', script_hash:'8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a', creator_addr:'kaspatest:pq8s2qk8asd7f3h2k1m9d6c0v7b5n4p', desc:'Community-governed fund pool with proportional voting power.' },
];

const TIER_PRICE = { ENTERPRISE: 1000, PRIORITY: 500, CREATOR: 100, EXPLORER: 0, FREE: 0 };

app.get('/api/health', (_req, res) => res.send('OK'));

app.get('/api/status', (_req, res) => res.json({
  connected: true,
  network: 'testnet-12',
  network_id: 1,
  w_rpc_url: 'ws://127.0.0.1:17110',
  tip_daa_score: 3116000,
  tip_hash: '0000000000000000000000000000000000000000000000000000000000000000',
  total_covenants: COVENANTS.length,
  active_covenants: COVENANTS.filter(c => c.amount_kaspa > 0).length,
}));

app.get('/api/utxos', (req, res) => {
  const { category, tier, search, limit, offset } = req.query;
  const utxos = COVENANTS.map(c => ({
    address: `kaspatest:${c.tx_id.slice(0,40)}`,
    tx_id: c.tx_id, index: 0,
    amount_sompi: c.amount_sompi, amount_kaspa: c.amount_kaspa,
    is_coinbase: c.amount_kaspa===0, block_daa_score: 3000000,
    name: c.name, category: c.category, tier: c.tier,
    tier_kas: c.tier_kas, description: c.desc,
    script_hash: c.script_hash, covenant_type: c.covenant_type,
    verified_tier: c.tier, disclosure_level: c.tier === 'FREE' || c.tier === 'EXPLORER' ? 'limited' : 'full',
    custom_ui_enabled: c.tier !== 'FREE' && c.tier !== 'EXPLORER',
    parameters: [{name:'amount',label:'Amount to Lock',param_type:'amount',placeholder:'Enter KAS amount...'}],
    image: null,
  }));
  if (category) utxos = utxos.filter(u => u.category === category);
  if (tier) utxos = utxos.filter(u => u.tier === tier.toUpperCase());
  if (search) {
    const q = search.toLowerCase();
    utxos = utxos.filter(u => u.name.toLowerCase().includes(q) || u.description.toLowerCase().includes(q));
  }
  const off = parseInt(offset) || 0;
  const lim = parseInt(limit) || utxos.length;
  res.json({ count: utxos.length, utxos: utxos.slice(off, off + lim), total_indexed: COVENANTS.length, network: 'testnet-12' });
});

app.get('/api/covenants', (req, res) => {
  const { category, tier, search } = req.query;
  let filtered = [...COVENANTS];
  if (category) filtered = filtered.filter(c => c.category === category);
  if (tier) filtered = filtered.filter(c => c.tier === tier.toUpperCase());
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
  }
  const order = { ENTERPRISE: 0, PRIORITY: 1, CREATOR: 2, FREE: 3 };
  filtered.sort((a,b) => (order[a.tier]||9) - (order[b.tier]||9) || a.name.localeCompare(b.name));
  res.json({
    total: filtered.length,
    grand_total: COVENANTS.length,
    categories: [...new Set(COVENANTS.map(c => c.category))],
    tiers: Object.entries(TIER_PRICE).map(([name, price]) => ({
      name, price,
      label: name === 'CREATOR' ? 'Creator' : name === 'PRIORITY' ? 'Priority' : name === 'ENTERPRISE' ? 'Enterprise' : name
    })),
    treasury: TREASURY,
    covenants: filtered.map(c => ({
      ...c,
      description: c.desc,
      address: `kaspatest:${c.tx_id.slice(0,40)}`,
      verified_tier: c.tier,
      disclosure_level: c.tier === 'FREE' || c.tier === 'EXPLORER' ? 'limited' : 'full',
      custom_ui_enabled: c.tier !== 'FREE' && c.tier !== 'EXPLORER',
      verified_payment_tx: c.tier === 'FREE' ? null : `demo_verified_${c.id}`,
      verified_at: c.tier === 'FREE' ? null : Math.floor(Date.now()/1000),
      parameters: c.tier !== 'FREE' && c.tier !== 'EXPLORER' ? [{name:'amount',label:'Amount to Lock',param_type:'amount',placeholder:'Enter KAS amount...'},{name:'recipient',label:'Recipient',param_type:'address',placeholder:'kaspatest:...'},{name:'timeout_daa',label:'Timeout',param_type:'text',placeholder:'DAA score...'}] : [{name:'amount',label:'Amount to Lock',param_type:'amount',placeholder:'Enter KAS amount...'}]
    })),
  });
});

app.get('/api/tiers', (_req, res) => {
  res.json([
    { name: 'EXPLORER', label: 'Explorer', price_kas: 0, price_sompi: 0, features: ['Browse all indexed covenants','Public read-only contract view','Script display and parameters','On-chain status verification'], color: 'gray', featured: false },
    { name: 'CREATOR', label: 'Creator', price_kas: 100, price_sompi: 10000000000, features: ['Everything in Explorer','Custom interactive UI generation','Form builder + Monaco editor','Wallet-integrated interact buttons','Standard registry visibility'], color: 'blue', featured: false },
    { name: 'PRIORITY', label: 'Priority', price_kas: 500, price_sompi: 50000000000, features: ['Everything in Creator','Featured listing placement','Higher search ranking','Priority indexing queue','Custom UI color palette'], color: 'gold', featured: true },
    { name: 'ENTERPRISE', label: 'Enterprise', price_kas: 1000, price_sompi: 100000000000, features: ['Everything in Priority','Maximum visibility - top row','Custom domain embedding','Dedicated indexing resources','Premium branding options'], color: 'purple', featured: false },
  ]);
});

app.post('/api/compile', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'No SilverScript code provided' });
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

app.listen(PORT, '0.0.0.0', () => console.log(`Covex API shim on :${PORT} - ${COVENANTS.length} covenants`));
