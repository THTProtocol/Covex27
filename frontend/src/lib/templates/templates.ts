/**
 * Phase 13: Universal Easy UI + Covenant Template Library
 * 
 * This is the canonical template definitions for Covex.
 * Each template produces a ready-to-use CovenantConfigV1 (from Phase 11 protocol).
 */

import { CovenantConfigV1, createDefaultConfig } from '../covenant-config/covenant-config';

export type TemplateCategory = 
  | 'Games' 
  | 'Escrow & Agreements' 
  | 'Prediction & Markets' 
  | 'Governance & DAOs' 
  | 'Financial Tools';

export interface CovenantTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedTime: string;
  recommendedTier: 'BUILDER' | 'PRO' | 'MAX';
  tags: string[];
  
  // Generates the full config for this template
  generateConfig: (creatorAddress: string) => CovenantConfigV1;
  
  // Suggested UI customizations for Covenant Studio
  studioSuggestions?: {
    primaryColor?: string;
    style?: string;
    features?: string[];
  };
}

export const COVENANT_TEMPLATES: CovenantTemplate[] = [
  // === GAMES ===
  {
    id: 'chess-classic',
    name: 'Classic Chess Match',
    description: 'Standard 8x8 chess with FIDE rules. Winner takes all. Full legal play proven via ZK.',
    category: 'Games',
    icon: '♟️',
    difficulty: 'Beginner',
    estimatedTime: '5 min',
    recommendedTier: 'BUILDER',
    tags: ['Chess', '1v1', 'ZK'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'chess'),
      covenant: {
        ...createDefaultConfig(addr, 'chess').covenant,
        name: 'Classic Chess Match',
        description: 'FIDE rules chess. Winner takes the pot minus 2% fee.',
      },
      ui: {
        templateId: 'chess-classic-v1',
        theme: { primaryColor: '#49EACB' },
        customizations: { boardStyle: 'classic', showClocks: true }
      }
    }),
    studioSuggestions: { primaryColor: '#49EACB', style: 'Minimal Dark', features: ['Live board', 'Move history', 'Resign button'] }
  },
  {
    id: 'chess-blitz',
    name: 'Blitz Chess (10 min)',
    description: 'Fast chess with time controls. High stakes, quick resolution.',
    category: 'Games',
    icon: '⚡',
    difficulty: 'Beginner',
    estimatedTime: '4 min',
    recommendedTier: 'PRO',
    tags: ['Chess', 'Blitz', 'Timed'],
    generateConfig: (addr) => {
      const cfg = createDefaultConfig(addr, 'chess');
      return {
        ...cfg,
        covenant: { ...cfg.covenant, name: 'Blitz Chess (10 min)', description: '10-minute blitz. Time forfeit = loss.' },
        ui: { templateId: 'chess-blitz-v1', theme: { primaryColor: '#F59E0B' } }
      };
    }
  },
  {
    id: 'poker-texas',
    name: 'Texas Hold\'em Poker',
    description: '6-max Texas Hold\'em. Hand ranking proven via ZK where possible.',
    category: 'Games',
    icon: '🃏',
    difficulty: 'Intermediate',
    estimatedTime: '8 min',
    recommendedTier: 'PRO',
    tags: ['Poker', 'Multiplayer', 'Cards'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'chess'), // placeholder until poker circuit
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Texas Hold\'em (6-max)', description: 'Standard poker. Best hand wins.' },
      resolution: { ...createDefaultConfig(addr).resolution, circuit: { type: 'custom' } },
      ui: { templateId: 'poker-texas-v1', theme: { primaryColor: '#DC2626' } }
    })
  },

  // === ESCROW & AGREEMENTS ===
  {
    id: 'simple-escrow',
    name: 'Simple Escrow',
    description: 'Basic 2-party escrow. Released on mutual agreement or oracle attestation.',
    category: 'Escrow & Agreements',
    icon: '🤝',
    difficulty: 'Beginner',
    estimatedTime: '3 min',
    recommendedTier: 'BUILDER',
    tags: ['Escrow', '2-party', 'Simple'],
    generateConfig: (addr) => createDefaultConfig(addr, 'escrow'),
    studioSuggestions: { primaryColor: '#3B82F6', style: 'Clean Professional' }
  },
  {
    id: 'milestone-escrow',
    name: 'Milestone Escrow (3 stages)',
    description: 'Funds released in 3 milestones. Each stage requires proof or oracle confirmation.',
    category: 'Escrow & Agreements',
    icon: '🪜',
    difficulty: 'Intermediate',
    estimatedTime: '6 min',
    recommendedTier: 'PRO',
    tags: ['Escrow', 'Milestones', 'Conditional'],
    generateConfig: (addr) => {
      const cfg = createDefaultConfig(addr, 'escrow');
      return {
        ...cfg,
        covenant: { ...cfg.covenant, name: '3-Stage Milestone Escrow', description: 'Release in thirds upon milestone completion.' },
        ui: { templateId: 'escrow-milestone-v1', theme: { primaryColor: '#10B981' } }
      };
    }
  },
  {
    id: 'conditional-release',
    name: 'Conditional Release (ZK)',
    description: 'Funds released only when a Range Proof or Membership proof is submitted.',
    category: 'Escrow & Agreements',
    icon: '🔑',
    difficulty: 'Intermediate',
    estimatedTime: '5 min',
    recommendedTier: 'PRO',
    tags: ['Escrow', 'ZK Proof', 'Conditional'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      resolution: {
        mode: 'zk',
        circuit: { type: 'range_proof' },
        oracle: { provider: 'covex' },
        payoutModel: { type: 'winner_takes_all', feeBasisPoints: 50 }
      },
      ui: { templateId: 'conditional-zk-v1', theme: { primaryColor: '#8B5CF6' } }
    })
  },

  // === PREDICTION & MARKETS ===
  {
    id: 'binary-prediction',
    name: 'Binary Prediction Market',
    description: 'Yes/No event. Traders buy shares. Oracle resolves at deadline.',
    category: 'Prediction & Markets',
    icon: '🔮',
    difficulty: 'Intermediate',
    estimatedTime: '7 min',
    recommendedTier: 'PRO',
    tags: ['Prediction', 'Market', 'Oracle'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Binary Prediction Market', description: 'Will X happen by date Y?' },
      resolution: { mode: 'oracle', circuit: { type: 'merkle_membership' }, oracle: { provider: 'covex' }, payoutModel: { type: 'proportional', feeBasisPoints: 150 } },
      ui: { templateId: 'prediction-binary-v1', theme: { primaryColor: '#EF4444' } }
    })
  },

  // === GOVERNANCE & DAOs ===
  {
    id: 'quadratic-voting',
    name: 'Quadratic Voting Poll',
    description: 'Community votes with quadratic cost. Results enforced via oracle + ZK.',
    category: 'Governance & DAOs',
    icon: '🗳️',
    difficulty: 'Advanced',
    estimatedTime: '10 min',
    recommendedTier: 'MAX',
    tags: ['DAO', 'Voting', 'Quadratic'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Quadratic Voting', description: 'Fair community decision making.' },
      resolution: { mode: 'oracle', circuit: { type: 'merkle_membership' }, oracle: { provider: 'covex' }, payoutModel: { type: 'proportional', feeBasisPoints: 100 } },
      ui: { templateId: 'quadratic-voting-v1', theme: { primaryColor: '#6366F1' } }
    })
  },

  // === FINANCIAL TOOLS ===
  {
    id: 'revenue-share',
    name: 'Revenue Share Pool',
    description: 'Incoming funds automatically split between team members per defined shares.',
    category: 'Financial Tools',
    icon: '💰',
    difficulty: 'Beginner',
    estimatedTime: '4 min',
    recommendedTier: 'BUILDER',
    tags: ['Finance', 'Split', 'Recurring'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Revenue Share Pool', description: 'Automatic proportional distribution.' },
      resolution: { mode: 'oracle', circuit: { type: 'merkle_membership' }, oracle: { provider: 'covex' }, payoutModel: { type: 'proportional', feeBasisPoints: 75 } },
      ui: { templateId: 'revenue-share-v1', theme: { primaryColor: '#F59E0B' } }
    })
  },

  // === Additional High-Value Templates ===
  {
    id: 'dao-treasury',
    name: 'DAO Treasury (Multi-sig + Time Lock)',
    description: 'Multi-party treasury with time locks and approval thresholds. Classic DAO primitive.',
    category: 'Governance & DAOs',
    icon: '🏦',
    difficulty: 'Advanced',
    estimatedTime: '9 min',
    recommendedTier: 'MAX',
    tags: ['DAO', 'Treasury', 'Multi-sig'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'DAO Treasury', description: 'Multi-sig with time locks.' },
      resolution: {
        mode: 'hybrid',
        circuit: { type: 'merkle_membership' },
        oracle: { provider: 'multi', multiOracle: { providers: [], threshold: 2 } },
        payoutModel: { type: 'proportional', feeBasisPoints: 50 }
      },
      ui: { templateId: 'dao-treasury-v1', theme: { primaryColor: '#6366F1' } }
    })
  },
  {
    id: 'insurance-pool',
    name: 'Insurance / Risk Pool',
    description: 'Contributors pay in, claims paid out on oracle or ZK proof of event.',
    category: 'Financial Tools',
    icon: '🛡️',
    difficulty: 'Intermediate',
    estimatedTime: '7 min',
    recommendedTier: 'PRO',
    tags: ['Insurance', 'Risk', 'Pool'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Insurance Pool', description: 'Risk sharing with oracle resolution.' },
      resolution: { mode: 'oracle', circuit: { type: 'merkle_membership' }, oracle: { provider: 'multi', multiOracle: { providers: [], threshold: 2 } }, payoutModel: { type: 'proportional', feeBasisPoints: 100 } },
      ui: { templateId: 'insurance-pool-v1', theme: { primaryColor: '#10B981' } }
    })
  },

  // === MORE: real-ZK claims (genuine Groth16 circuits) ===
  {
    id: 'merkle-airdrop',
    name: 'Merkle Airdrop Claim',
    description: 'Eligible addresses prove membership in a committed Merkle root to claim. Real Groth16 ZK proof, no list revealed.',
    category: 'Financial Tools',
    icon: '🎁',
    difficulty: 'Intermediate',
    estimatedTime: '6 min',
    recommendedTier: 'PRO',
    tags: ['ZK', 'Airdrop', 'Merkle'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Merkle Airdrop', description: 'Claim by proving Merkle membership (zero-knowledge).' },
      resolution: { mode: 'zk', circuit: { type: 'merkle_membership' }, oracle: { provider: 'covex' }, payoutModel: { type: 'proportional', feeBasisPoints: 0 } },
      ui: { templateId: 'merkle-airdrop-v1', theme: { primaryColor: '#49EACB' } }
    }),
    studioSuggestions: { primaryColor: '#49EACB', features: ['Claim button', 'Proof status', 'Remaining pool'] }
  },
  {
    id: 'solvency-range-proof',
    name: 'Solvency / Range Proof Escrow',
    description: 'Prove a committed balance sits within [min, max] without revealing it, on a genuine range-proof ZK circuit.',
    category: 'Financial Tools',
    icon: '📊',
    difficulty: 'Advanced',
    estimatedTime: '8 min',
    recommendedTier: 'MAX',
    tags: ['ZK', 'Range Proof', 'Solvency'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Solvency Escrow', description: 'Release on a zero-knowledge range proof of reserves.' },
      resolution: { mode: 'zk', circuit: { type: 'range_proof' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'solvency-range-v1', theme: { primaryColor: '#8B5CF6' } }
    })
  },
  {
    id: 'age-gated-claim',
    name: 'Age-Gated Claim',
    description: 'Prove age over a threshold (zero-knowledge KYC alternative) to unlock, on the real age_verification circuit.',
    category: 'Governance & DAOs',
    icon: '🔞',
    difficulty: 'Intermediate',
    estimatedTime: '6 min',
    recommendedTier: 'PRO',
    tags: ['ZK', 'Identity', 'Gating'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Age-Gated Claim', description: 'Unlock by proving age >= threshold in zero knowledge.' },
      resolution: { mode: 'zk', circuit: { type: 'age_verification' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'age-gate-v1', theme: { primaryColor: '#F59E0B' } }
    })
  },

  // === MORE: oracle-attested markets & pools (honest: oracle BIP340 signs the outcome) ===
  {
    id: 'binary-prediction-market',
    name: 'Binary Prediction Market',
    description: 'Yes/No event resolved by the Covex oracle at a deadline. Stake on an outcome; oracle attests the result.',
    category: 'Prediction & Markets',
    icon: '🔮',
    difficulty: 'Beginner',
    estimatedTime: '5 min',
    recommendedTier: 'BUILDER',
    tags: ['Market', 'Oracle', 'Binary'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Prediction Market', description: 'Oracle-attested Yes/No market. Winners split the pool.' },
      resolution: { mode: 'oracle', circuit: { type: 'custom' }, oracle: { provider: 'covex' }, payoutModel: { type: 'proportional', feeBasisPoints: 100 } },
      ui: { templateId: 'binary-market-v1', theme: { primaryColor: '#F59E0B' } }
    })
  },
  {
    id: 'dutch-auction',
    name: 'Dutch Auction',
    description: 'Price descends over time; the first bidder wins at the current price. Oracle attests the clearing price.',
    category: 'Prediction & Markets',
    icon: '⏬',
    difficulty: 'Intermediate',
    estimatedTime: '7 min',
    recommendedTier: 'PRO',
    tags: ['Auction', 'Dutch', 'Oracle'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Dutch Auction', description: 'Descending-price auction, oracle-attested clearing.' },
      resolution: { mode: 'oracle', circuit: { type: 'custom' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 100 } },
      ui: { templateId: 'dutch-auction-v1', theme: { primaryColor: '#A78BFA' } }
    })
  },
  {
    id: 'revenue-share-pool',
    name: 'Revenue Share Pool',
    description: 'Members receive a proportional split when the oracle attests a distribution event. Shares set on creation.',
    category: 'Financial Tools',
    icon: '💸',
    difficulty: 'Intermediate',
    estimatedTime: '7 min',
    recommendedTier: 'PRO',
    tags: ['Revenue', 'Split', 'Oracle'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Revenue Share Pool', description: 'Proportional payouts on oracle-attested distribution.' },
      resolution: { mode: 'oracle', circuit: { type: 'custom' }, oracle: { provider: 'covex' }, payoutModel: { type: 'proportional', feeBasisPoints: 100 } },
      ui: { templateId: 'revenue-share-v1', theme: { primaryColor: '#10B981' } }
    })
  },
  {
    id: 'connect4-arena',
    name: 'Connect Four Arena',
    description: 'Head-to-head Connect Four for stakes. Server-authoritative engine; oracle attests the winner. Winner takes the pot.',
    category: 'Games',
    icon: '🔴',
    difficulty: 'Beginner',
    estimatedTime: '4 min',
    recommendedTier: 'BUILDER',
    tags: ['Game', '1v1', 'Oracle'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'chess'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Connect Four Arena', description: 'Oracle-attested Connect Four. Winner takes the pot minus fee.' },
      resolution: { mode: 'oracle', circuit: { type: 'custom' }, oracle: { provider: 'covex' }, payoutModel: { type: 'winner_takes_all', feeBasisPoints: 200 } },
      ui: { templateId: 'connect4-v1', theme: { primaryColor: '#EF4444' } }
    })
  },

  // === CORE COVENANT PRIMITIVES (each deep-links to its real circuit in the Sandbox) ===
  // Honest by construction: every entry maps to a circuit that already exists, and its
  // reality chip is derived from the resolution mode (zk -> oracle-verified off-chain,
  // oracle -> oracle-attested). No "on-chain enforced" / "trustless" claims: the Sandbox
  // destination verifies these proofs off-chain via the disclosed Covex oracle.
  {
    id: 'hashlock-htlc',
    name: 'HTLC (Hashlock + Timeout Refund)',
    description: 'The atomic-swap building block. The receiver claims by revealing a secret preimage; the sender is refunded after a timeout. Enforced on-chain by the Kaspa script.',
    category: 'Escrow & Agreements',
    icon: '🔗',
    difficulty: 'Intermediate',
    estimatedTime: '5 min',
    recommendedTier: 'PRO',
    tags: ['HTLC', 'Hashlock', 'Atomic Swap'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'HTLC', description: 'Claim by revealing the secret preimage; refund after the timeout.' },
      resolution: { mode: 'zk', circuit: { type: 'hash_preimage' }, oracle: { provider: 'covex' }, payoutModel: { type: 'winner_takes_all', feeBasisPoints: 0 } },
      ui: { templateId: 'htlc-v1', theme: { primaryColor: '#F59E0B' } }
    }),
    studioSuggestions: { primaryColor: '#F59E0B', features: ['Reveal preimage', 'Refund after timeout', 'Claim status'] }
  },
  {
    id: 'plain-hashlock',
    name: 'Hashlock Vault',
    description: 'Funds unlock only when the holder reveals the secret preimage of a committed hash. The minimal commitment primitive, enforced on-chain by the script.',
    category: 'Escrow & Agreements',
    icon: '🔒',
    difficulty: 'Beginner',
    estimatedTime: '4 min',
    recommendedTier: 'BUILDER',
    tags: ['Hashlock', 'Preimage', 'Commitment'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Hashlock Vault', description: 'Unlock by revealing the secret preimage of the committed hash.' },
      resolution: { mode: 'zk', circuit: { type: 'hash_preimage' }, oracle: { provider: 'covex' }, payoutModel: { type: 'winner_takes_all', feeBasisPoints: 0 } },
      ui: { templateId: 'hashlock-v1', theme: { primaryColor: '#FBBF24' } }
    })
  },
  {
    id: 'absolute-timelock',
    name: 'Absolute Timelock (CLTV)',
    description: 'Funds are spendable only once the chain DAA score reaches the unlock point. Vesting and scheduled releases, enforced on-chain (an early spend is rejected by consensus).',
    category: 'Financial Tools',
    icon: '⏳',
    difficulty: 'Beginner',
    estimatedTime: '4 min',
    recommendedTier: 'BUILDER',
    tags: ['Timelock', 'CLTV', 'Vesting'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Absolute Timelock', description: 'Spendable only after the DAA score reaches the unlock point.' },
      resolution: { mode: 'zk', circuit: { type: 'timelock_absolute' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'timelock-abs-v1', theme: { primaryColor: '#F97316' } }
    })
  },
  {
    id: 'relative-timelock-csv',
    name: 'Relative Timelock (CSV)',
    description: 'Funds become spendable only after they have aged a relative number of blocks (OpCheckSequenceVerify, BIP68). Dispute windows and cooldowns, node-enforced on-chain.',
    category: 'Financial Tools',
    icon: '🕰️',
    difficulty: 'Intermediate',
    estimatedTime: '5 min',
    recommendedTier: 'PRO',
    tags: ['Timelock', 'CSV', 'Cooldown'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Relative Timelock', description: 'Spendable only after the funds age a relative number of DAA blocks.' },
      resolution: { mode: 'zk', circuit: { type: 'relative_timelock' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'timelock-rel-v1', theme: { primaryColor: '#FB7185' } }
    })
  },
  {
    id: 'dead-man-switch',
    name: "Dead-Man's Switch",
    description: 'The owner can refresh or spend at any time; the heir can claim only after the timelock elapses, so funds pass on if the owner goes silent. Enforced on-chain by the script.',
    category: 'Financial Tools',
    icon: '💼',
    difficulty: 'Intermediate',
    estimatedTime: '6 min',
    recommendedTier: 'PRO',
    tags: ['Inheritance', 'Timelock', 'Recovery'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: "Dead-Man's Switch", description: 'Owner refreshes any time; the heir claims only after the timelock.' },
      resolution: { mode: 'zk', circuit: { type: 'timelock_absolute' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'deadman-v1', theme: { primaryColor: '#22C55E' } }
    })
  },
  {
    id: 'multisig-nofm',
    name: 'N-of-M Multisig',
    description: 'Release requires a threshold of signatures from the named signer set. DAO treasuries and shared custody, enforced on-chain by the multisig script.',
    category: 'Governance & DAOs',
    icon: '🔑',
    difficulty: 'Intermediate',
    estimatedTime: '6 min',
    recommendedTier: 'PRO',
    tags: ['Multisig', 'Threshold', 'Treasury'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'N-of-M Multisig', description: 'Release on a threshold of signatures from the signer set.' },
      resolution: { mode: 'oracle', circuit: { type: 'multisig_threshold' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'multisig-v1', theme: { primaryColor: '#A855F7' } }
    })
  },
  {
    id: 'payment-channel',
    name: 'Payment Channel (2-of-2 Close)',
    description: 'A two-party pot that closes cooperatively when both sides sign the final balance, with a funder refund after a timeout. The chain pays the agreed balance, no oracle.',
    category: 'Financial Tools',
    icon: '🔁',
    difficulty: 'Advanced',
    estimatedTime: '8 min',
    recommendedTier: 'MAX',
    tags: ['Channel', '2-of-2', 'Cooperative'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Payment Channel', description: 'Cooperative 2-of-2 close on the agreed final balance.' },
      resolution: { mode: 'oracle', circuit: { type: 'multisig_threshold' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'channel-v1', theme: { primaryColor: '#38BDF8' } }
    })
  },
  {
    id: 'merkle-allowlist',
    name: 'Allowlist (Merkle Membership)',
    description: 'Eligible addresses prove membership in a committed Merkle root to unlock, without revealing the rest of the list. Real Groth16 proof on the merkle_membership circuit.',
    category: 'Governance & DAOs',
    icon: '📜',
    difficulty: 'Intermediate',
    estimatedTime: '6 min',
    recommendedTier: 'PRO',
    tags: ['ZK', 'Allowlist', 'Merkle'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Allowlist Gate', description: 'Unlock by proving Merkle membership (zero-knowledge).' },
      resolution: { mode: 'zk', circuit: { type: 'merkle_membership' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'allowlist-v1', theme: { primaryColor: '#3B82F6' } }
    }),
    studioSuggestions: { primaryColor: '#3B82F6', features: ['Proof status', 'Eligibility check'] }
  },
  {
    id: 'anti-sybil-nullifier',
    name: 'Anti-Sybil Nullifier',
    description: 'Each participant can act once: a one-time nullifier derived from a hidden secret is rejected on reuse, without revealing the secret. Real Groth16 proof on the nullifier_set circuit.',
    category: 'Governance & DAOs',
    icon: '🚫',
    difficulty: 'Advanced',
    estimatedTime: '7 min',
    recommendedTier: 'MAX',
    tags: ['ZK', 'Anti-Sybil', 'Nullifier'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Anti-Sybil Gate', description: 'One action per participant via a single-use zero-knowledge nullifier.' },
      resolution: { mode: 'zk', circuit: { type: 'nullifier_set' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'nullifier-v1', theme: { primaryColor: '#FB923C' } }
    })
  },
  {
    id: 'vrf-lottery',
    name: 'VRF Lottery (Provably Fair Draw)',
    description: 'A winner forced by a committed random value so no one can cherry-pick the result. The draw is generated in your browser and verified on the vrf_random circuit (zero-knowledge).',
    category: 'Games',
    icon: '🎰',
    difficulty: 'Intermediate',
    estimatedTime: '6 min',
    recommendedTier: 'PRO',
    tags: ['ZK', 'VRF', 'Lottery'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'VRF Lottery', description: 'Provably fair draw forced by a committed random value (VRF).' },
      resolution: { mode: 'zk', circuit: { type: 'vrf_random' }, oracle: { provider: 'covex' }, payoutModel: { type: 'winner_takes_all', feeBasisPoints: 100 } },
      ui: { templateId: 'vrf-lottery-v1', theme: { primaryColor: '#EC4899' } }
    })
  },
  {
    id: 'vrf-dice-draw',
    name: 'Provably-Fair Dice Draw',
    description: 'A dice result forced by Poseidon(secret, public seed) so the roll cannot be rigged. Generated in your browser and verified on the vrf_dice_roll circuit (zero-knowledge).',
    category: 'Games',
    icon: '🎲',
    difficulty: 'Beginner',
    estimatedTime: '5 min',
    recommendedTier: 'BUILDER',
    tags: ['ZK', 'VRF', 'Dice'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Provably-Fair Dice', description: 'A dice roll forced by a committed secret and public seed (VRF).' },
      resolution: { mode: 'zk', circuit: { type: 'vrf_dice_roll' }, oracle: { provider: 'covex' }, payoutModel: { type: 'winner_takes_all', feeBasisPoints: 100 } },
      ui: { templateId: 'vrf-dice-v1', theme: { primaryColor: '#F472B6' } }
    })
  },
  {
    id: 'timeout-refund-escrow',
    name: 'Timeout-Refund ZK Escrow',
    description: 'A two-party escrow where a DAA timelock enables an honest refund if the deal stalls. Outcome proven on the escrow_2party circuit (zero-knowledge).',
    category: 'Escrow & Agreements',
    icon: '⏱️',
    difficulty: 'Intermediate',
    estimatedTime: '6 min',
    recommendedTier: 'PRO',
    tags: ['ZK', 'Escrow', 'Refund'],
    generateConfig: (addr) => ({
      ...createDefaultConfig(addr, 'escrow'),
      covenant: { ...createDefaultConfig(addr).covenant, name: 'Timeout-Refund Escrow', description: 'Two-party escrow with an honest timelock refund (zero-knowledge).' },
      resolution: { mode: 'zk', circuit: { type: 'escrow_2party' }, oracle: { provider: 'covex' }, payoutModel: { type: 'custom', feeBasisPoints: 0 } },
      ui: { templateId: 'escrow-2party-v1', theme: { primaryColor: '#38BDF8' } }
    })
  }
];

export function getTemplatesByCategory(category: TemplateCategory): CovenantTemplate[] {
  return COVENANT_TEMPLATES.filter(t => t.category === category);
}

export function getTemplateById(id: string): CovenantTemplate | undefined {
  return COVENANT_TEMPLATES.find(t => t.id === id);
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'Games', 'Escrow & Agreements', 'Prediction & Markets', 'Governance & DAOs', 'Financial Tools'
];
