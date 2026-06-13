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
