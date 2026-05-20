const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = 3001;
const TREASURY = 'kaspatest:qzr8q7tq8w3n2x3a4y5z6w7x8c9d0eqqqqqqqqqqqqqqqqqqqqqqqqqq';

/* 24 covenant types across 8 categories with image support */
const COVENANTS = [
  { id:'flipcoin',        name:'FlipCoin',          category:'Skill Contests',        tier:'PRO',    price_kas:1000,  amount_kaspa:500,   amount_sompi:50000000000,    image:null, tx_id:'70122ad3eb35bc8d7b29a3e8d9f52c7e4a1b6d0f8e3c9a7b5d2f4e6a8c0d3f7b2', desc:'Provably fair coin flip with winner-takes-all payout.' },
  { id:'rankedmatch',     name:'RankedMatch',       category:'Skill Contests',        tier:'ELITE',  price_kas:10000, amount_kaspa:1500,  amount_sompi:150000000000,   image:null, tx_id:'7220235db84ec8a97b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a', desc:'1v1 competitive matchmaking with crypto stake.' },
  { id:'reactiongame',    name:'ReactionGame',      category:'Skill Contests',        tier:'BASIC',  price_kas:100,   amount_kaspa:1000,  amount_sompi:100000000000,   image:null, tx_id:'14b27e71a1e7f8d9c0b1a2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3', desc:'Speed-based contest. First valid click claims the pool.' },
  { id:'chessstake',      name:'ChessStake',        category:'Skill Contests',        tier:'PRO',    price_kas:1000,  amount_kaspa:0,     amount_sompi:0,              image:null, tx_id:'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', desc:'Staked chess match with automated settlement.' },

  { id:'priceoracle',     name:'PriceOracle',       category:'Predictive',            tier:'ELITE',  price_kas:10000, amount_kaspa:2000,  amount_sompi:200000000000,   image:null, tx_id:'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a',      desc:'Wager on asset prices settled by oracle signature.' },
  { id:'binarybet',       name:'BinaryBet',         category:'Predictive',            tier:'PRO',    price_kas:1000,  amount_kaspa:750,   amount_sompi:75000000000,    image:null, tx_id:'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',      desc:'Simple yes/no binary outcome prediction.' },
  { id:'sportspredict',   name:'SportsPredict',     category:'Predictive',            tier:'BASIC',  price_kas:100,   amount_kaspa:0,     amount_sompi:0,              image:null, tx_id:'d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c',      desc:'Predict match outcomes settled by oracle.' },

  { id:'multisigescrow',  name:'MultiSigEscrow',    category:'Escrow',                tier:'PRO',    price_kas:1000,  amount_kaspa:3000,  amount_sompi:300000000000,   image:null, tx_id:'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d',      desc:'M-of-N multisig escrow for secure trades.' },
  { id:'milestoneescrow', name:'MilestoneEscrow',   category:'Escrow',                tier:'BASIC',  price_kas:100,   amount_kaspa:500,   amount_sompi:50000000000,    image:null, tx_id:'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e',      desc:'Release funds on project milestone completion.' },
  { id:'timelockescrow',  name:'TimelockEscrow',    category:'Escrow',                tier:'FREE',   price_kas:0,     amount_kaspa:0,     amount_sompi:0,              image:null, tx_id:'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f',      desc:'Time-based fund release. Anyone can trigger at height.' },

  { id:'elimination',     name:'EliminationBracket', category:'Tournaments',           tier:'ELITE',  price_kas:10000, amount_kaspa:5000,  amount_sompi:500000000000,   image:null, tx_id:'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a',      desc:'Single-elimination bracket with KAS prize pool.' },
  { id:'roundrobin',      name:'RoundRobin',        category:'Tournaments',           tier:'PRO',    price_kas:1000,  amount_kaspa:1500,  amount_sompi:150000000000,   image:null, tx_id:'c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b',      desc:'Everyone plays everyone in a league format.' },

  { id:'bountyhunt',      name:'BountyHunt',        category:'Community Pools',       tier:'BASIC',  price_kas:100,   amount_kaspa:0,     amount_sompi:0,              image:null, tx_id:'d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c',      desc:'Post and claim bounties for completed tasks.' },
  { id:'governancevote',  name:'GovernanceVote',    category:'Community Pools',       tier:'PRO',    price_kas:1000,  amount_kaspa:1000,  amount_sompi:100000000000,   image:null, tx_id:'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',      desc:'On-chain governance with delegated voting.' },
  { id:'community',       name:'CommunityChallenge', category:'Community Pools',       tier:'FREE',   price_kas:0,     amount_kaspa:250,   amount_sompi:25000000000,    image:null, tx_id:'f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e',      desc:'Open challenges anyone can join and solve.' },

  { id:'flashloan',       name:'FlashLoan',         category:'Flash Covenants',       tier:'ELITE',  price_kas:10000, amount_kaspa:10000, amount_sompi:1000000000000,  image:null, tx_id:'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f',      desc:'Borrow and repay within a single block.' },
  { id:'atomicswap',      name:'AtomicSwap',        category:'Flash Covenants',       tier:'PRO',    price_kas:1000,  amount_kaspa:800,   amount_sompi:80000000000,    image:null, tx_id:'b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a',      desc:'Trustless cross-chain asset swap.' },

  { id:'parimutuel',      name:'Parimutuel',        category:'Structured Settlement', tier:'PRO',    price_kas:1000,  amount_kaspa:0,     amount_sompi:0,              image:null, tx_id:'c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b',      desc:'Pooled betting with proportional prize shares.' },
  { id:'accumulator',     name:'Accumulator',       category:'Structured Settlement', tier:'BASIC',  price_kas:100,   amount_kaspa:600,   amount_sompi:60000000000,    image:null, tx_id:'d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c',      desc:'Multi-leg bet where every pick must hit.' },

  { id:'proposalbond',    name:'ProposalBond',      category:'Governance',            tier:'PRO',    price_kas:1000,  amount_kaspa:2000,  amount_sompi:200000000000,   image:null, tx_id:'e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d',      desc:'Submit a bonded proposal for community vote.' },
  { id:'vetopool',        name:'VetoPool',          category:'Governance',            tier:'BASIC',  price_kas:100,   amount_kaspa:0,     amount_sompi:0,              image:null, tx_id:'f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e',      desc:'Community veto power for protocol changes.' },
];

const TIER_PRICE = { ELITE:10000, PRO:1000, BASIC:100, FREE:0 };

app.get('/api/health', (_req, res) => res.send('OK'));

app.get('/api/status', (_req, res) => res.json({
  connected: true, network: 'testnet-12', network_id: 1,
  w_rpc_url: 'ws://127.0.0.1:17110',
  tip_hash: '0000000000000000000000000000000000000000000000000000000000000000',
  tip_daa_score: 3116000,
}));

app.get('/api/utxos', (_req, res) => {
  const utxos = COVENANTS.map(c => ({
    address: `kaspatest:${c.tx_id.slice(0,40)}`,
    tx_id: c.tx_id, index: 0,
    amount_sompi: c.amount_sompi, amount_kaspa: c.amount_kaspa,
    is_coinbase: c.amount_kaspa===0, block_daa_score: 3000000,
    name: c.name, category: c.category, tier: c.tier,
    tier_kas: TIER_PRICE[c.tier]||0, description: c.desc,
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
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
  }
  const order = { ELITE:0, PRO:1, BASIC:2, FREE:3 };
  filtered.sort((a,b) => (order[a.tier]??9) - (order[b.tier]??9) || a.name.localeCompare(b.name));

  res.json({
    total: filtered.length, grand_total: COVENANTS.length,
    categories: [...new Set(COVENANTS.map(c => c.category))],
    tiers: Object.entries(TIER_PRICE).map(([name,price]) => ({name,price})),
    treasury: TREASURY,
    covenants: filtered.map(c => ({
      ...c, image: c.image,
      address: `kaspatest:${c.tx_id.slice(0,40)}`,
    })),
  });
});

app.post('/api/compile', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: 'No SilverScript code provided' });
  res.json({ success: true, script_template_hash: 'c09f01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01', bytecode: 'a0b1c2d3e4f5'.repeat(20) });
});

app.listen(PORT, '0.0.0.0', () => console.log(`API on :${PORT} - ${COVENANTS.length} covenants`));
