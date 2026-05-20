const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = 3001;
const TREASURY = 'kaspatest:qzr8q7tq8w3n2x3a4y5z6w7x8c9d0eqqqqqqqqqqqqqqqqqqqqqqqqqq';

const COVENANTS = [
  { id:'flipcoin', name:'FlipCoin', category:'Skill', tier:'PRO', tier_kas:500, amount_kaspa:500.0, amount_sompi:50000000000, image:'https://images.unsplash.com/photo-1639322537228-f710d846310a?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'70122ad3eb35bc8d7b29a3e8d9f52c7e4a1b6d0f8e3c9a7b5d2f4e6a8c0d3f7b2', desc:'Provably fair coin flip with winner-takes-all payout. Powered by SilverScript. Fully interactive UI included.' },
  { id:'rankedmatch', name:'RankedMatch', category:'Skill', tier:'ELITE', tier_kas:1000, amount_kaspa:1500.0, amount_sompi:150000000000, image:'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'7220235db84ec8a97b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a', desc:'Professional 1v1 competitive matchmaking with crypto stakes. Ranked ladder integration and oracle-settled dispute resolution.' },
  { id:'reactiongame', name:'ReactionGame', category:'Skill', tier:'BASIC', tier_kas:100, amount_kaspa:1000.0, amount_sompi:100000000000, image:'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'14b27e71a1e7f8d9c0b1a2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3', desc:'Speed-based contest where the first valid on-chain click claims the entire prize pool. Zero latency oracle verification.' },

  { id:'priceoracle', name:'PriceOracle', category:'Predict', tier:'ELITE', tier_kas:1000, amount_kaspa:2000.0, amount_sompi:200000000000, image:'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a', desc:'Wager on real-time asset prices settled by cryptographic oracle signatures. Multi-source price feeds with timelock safety.' },
  { id:'binarybet', name:'BinaryBet', category:'Predict', tier:'PRO', tier_kas:500, amount_kaspa:750.0, amount_sompi:75000000000, image:'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b', desc:'Simple yes/no binary outcome prediction market. Instant settlement through SilverScript covenant scripts.' },

  { id:'multisigescrow', name:'MultiSigEscrow', category:'Escrow', tier:'PRO', tier_kas:500, amount_kaspa:3000.0, amount_sompi:300000000000, image:'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d', desc:'M-of-N multisig escrow for secure, trust-minimized trades. Configurable signer thresholds with timelock fallback.' },
  { id:'timelockescrow', name:'TimelockEscrow', category:'Escrow', tier:'BASIC', tier_kas:100, amount_kaspa:0, amount_sompi:0, image:'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f', desc:'Time-based fund release mechanism. Anyone can trigger the resolution once the block height threshold is passed.' },

  { id:'elimination', name:'EliminationBracket', category:'Tourney', tier:'ELITE', tier_kas:1000, amount_kaspa:5000.0, amount_sompi:500000000000, image:'https://images.unsplash.com/photo-1511882150382-421056c89033?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a', desc:'Single-elimination tournament bracket with KAS prize pool. Automated bracket progression via oracle verification.' },

  { id:'governancevote', name:'GovernanceVote', category:'Pool', tier:'PRO', tier_kas:500, amount_kaspa:1000.0, amount_sompi:100000000000, image:'https://images.unsplash.com/photo-1491438590914-bc09f19aa1dc?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d', desc:'On-chain governance with delegated voting power. Quadratic voting and proposal bonds for Sybil resistance.' },

  { id:'flashloan', name:'FlashLoan', category:'Flash', tier:'ELITE', tier_kas:1000, amount_kaspa:10000.0, amount_sompi:1000000000000, image:'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=600&h=300', tx_id:'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f', desc:'Borrow and repay within a single block execution. Zero-risk arbitrage and liquidation protocol.' },
];

const TIER_PRICE = { ELITE:1000, PRO:500, BASIC:100, FREE:0 };

app.get('/api/health', (_req, res) => res.send('OK'));

app.get('/api/status', (_req, res) => res.json({
  connected: true, network: 'testnet-12', network_id: 1,
  w_rpc_url: 'ws://127.0.0.1:17110', tip_daa_score: 3116000,
  tip_hash: '0000000000000000000000000000000000000000000000000000000000000000',
}));

app.get('/api/utxos', (_req, res) => {
  const utxos = COVENANTS.map(c => ({
    address: `kaspatest:${c.tx_id.slice(0,40)}`,
    tx_id: c.tx_id, index: 0,
    amount_sompi: c.amount_sompi, amount_kaspa: c.amount_kaspa,
    is_coinbase: c.amount_kaspa===0, block_daa_score: 3000000,
    name: c.name, category: c.category, tier: c.tier,
    tier_kas: c.tier_kas, description: c.desc,
    image: c.image, id: c.id,
  }));
  res.json({ count: utxos.length, utxos });
});

app.get('/api/covenants', (_req, res) => {
  const { category, tier, search } = _req.query;
  let filtered = [...COVENANTS];
  if (category) filtered = filtered.filter(c => c.category === category);
  if (tier) filtered = filtered.filter(c => c.tier === tier.toUpperCase());
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
  }
  const order = { ELITE:0, PRO:1, BASIC:2, FREE:3 };
  filtered.sort((a,b) => (order[a.tier]||9) - (order[b.tier]||9) || a.name.localeCompare(b.name));
  res.json({
    total: filtered.length, grand_total: COVENANTS.length,
    categories: [...new Set(COVENANTS.map(c => c.category))],
    tiers: Object.entries(TIER_PRICE).map(([n,p]) => ({name:n, price:p})),
    treasury: TREASURY,
    covenants: filtered.map(c => ({...c, address: `kaspatest:${c.tx_id.slice(0,40)}`})),
  });
});

app.post('/api/compile', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'No SilverScript code provided' });
  res.json({ success: true, script_template_hash: 'c09f01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01', bytecode: 'a0b1c2d3e4f5'.repeat(20) });
});

app.listen(PORT, '0.0.0.0', () => console.log(`API on :${PORT} - ${COVENANTS.length} covenants`));
