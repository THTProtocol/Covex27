/**
 * Covex Covenant Configuration v1
 * Integrated into Covex Terminal for Phase 11
 */

import { z } from 'zod';

export const ResolutionMode = z.enum(['zk', 'oracle', 'custom_oracle']);
export type ResolutionMode = z.infer<typeof ResolutionMode>;

export const CircuitType = z.enum([
  'merkle_membership',
  'range_proof',
  'age_verification',
  'verifiable_compute',
  'chess_v1',
  'custom',
]);
export type CircuitType = z.infer<typeof CircuitType>;

export const PayoutModelType = z.enum(['winner_takes_all', 'proportional', 'custom']);
export type PayoutModelType = z.infer<typeof PayoutModelType>;

export const CovenantCoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).max(80),
  description: z.string().max(500).optional(),
  creatorAddress: z.string(),
  createdAt: z.string().datetime().optional(),
  reusable: z.boolean().default(false),
  allowTopups: z.boolean().default(false),
});

export const CircuitSchema = z.object({
  type: CircuitType,
  verifierKey: z.string().optional(),
  publicInputs: z.record(z.any()).optional(),
});

export const OracleConfigSchema = z.object({
  provider: z.enum(['covex', 'custom', 'multi']).default('covex'),
  customPublicKey: z.string().optional(),

  // Phase 15: Multi-Oracle Federation
  multiOracle: z.object({
    providers: z.array(z.object({
      name: z.string(),
      publicKey: z.string(),
      weight: z.number().int().min(1).default(1),
    })).min(2),
    threshold: z.number().int().min(1), // e.g. 2 for 2-of-3
    requireAll: z.boolean().default(false),
  }).optional(),

  // Legacy fields for backward compat
  threshold: z.number().int().min(1).optional(),
  providers: z.array(z.string()).optional(),
});

export const PayoutModelSchema = z.object({
  type: PayoutModelType,
  feeBasisPoints: z.number().int().min(0).max(10000), // 0 to 100% (10000 bps), no sub-100 cap
  platformShare: z.number().int().min(0).max(10000).optional(),
  creatorShare: z.number().int().min(0).max(10000).optional(),
});

export const ResolutionSchema = z.object({
  mode: ResolutionMode,
  circuit: CircuitSchema,
  oracle: OracleConfigSchema,
  payoutModel: PayoutModelSchema,
  constraints: z.object({
    minStake: z.number().optional(),
    maxStake: z.number().optional(),
    deadline: z.string().datetime().optional(),
  }).optional(),

  // Phase 14: Advanced Covenant Primitives
  advancedPrimitives: z.object({
    timeLocks: z.object({
      releaseAfter: z.string().datetime().optional(), // ISO date
      challengePeriodHours: z.number().int().min(1).optional(),
    }).optional(),

    multiParty: z.object({
      requiredApprovals: z.number().int().min(1).optional(),
      approvers: z.array(z.string()).optional(), // list of addresses
    }).optional(),

    conditions: z.array(z.object({
      type: z.enum(['zk', 'oracle', 'time', 'multi_sig']),
      description: z.string().optional(),
      config: z.record(z.any()).optional(),
    })).optional(),

    dispute: z.object({
      enabled: z.boolean().default(false),
      bondAmount: z.number().optional(), // in KAS
      disputePeriodHours: z.number().int().min(1).optional(),
    }).optional(),

    payoutTree: z.object({
      type: z.enum(['simple', 'conditional', 'tiered', 'royalty']).optional(),
      branches: z.array(z.record(z.any())).optional(), // simplified tree representation
    }).optional(),
  }).optional(),
});

export const UIConfigSchema = z.object({
  templateId: z.string(),
  theme: z.object({
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    backgroundColor: z.string().optional(),
    fontFamily: z.string().optional(),
  }),
  customizations: z.record(z.any()).optional(),
  bundleUrl: z.string().url().optional(),
});

export const CovenantConfigV1Schema = z.object({
  version: z.literal('1.0'),
  covenant: CovenantCoreSchema,
  resolution: ResolutionSchema,
  ui: UIConfigSchema,
  metadata: z.record(z.any()).optional(),
});

export type CovenantConfigV1 = z.infer<typeof CovenantConfigV1Schema>;

export function validateCovenantConfig(input: unknown): CovenantConfigV1 {
  return CovenantConfigV1Schema.parse(input);
}

export function isValidCovenantConfig(input: unknown): input is CovenantConfigV1 {
  return CovenantConfigV1Schema.safeParse(input).success;
}

export function createDefaultConfig(creatorAddress: string, type: 'chess' | 'escrow' = 'chess'): CovenantConfigV1 {
  const base = {
    version: '1.0' as const,
    covenant: {
      id: crypto.randomUUID(),
      name: type === 'chess' ? 'Chess Match' : 'Conditional Escrow',
      description: type === 'chess' ? 'Standard chess game' : 'Milestone-based escrow',
      creatorAddress,
      reusable: true,
      allowTopups: true,
    },
    ui: {
      templateId: type === 'chess' ? 'chess-classic-v1' : 'escrow-milestone-v1',
      theme: { primaryColor: '#49EACB' },
    },
  };

  if (type === 'chess') {
    return {
      ...base,
      resolution: {
        mode: 'zk' as const,
        circuit: { type: 'chess_v1' as const, verifierKey: '0xCHESSv1_8x8_STANDARD' },
        oracle: { provider: 'covex' as const },
        payoutModel: { type: 'winner_takes_all' as const, feeBasisPoints: 200 },
      },
    };
  } else {
    return {
      ...base,
      resolution: {
        mode: 'oracle' as const,
        circuit: { type: 'merkle_membership' as const },
        oracle: { provider: 'covex' as const },
        payoutModel: { type: 'proportional' as const, feeBasisPoints: 100 },
      },
    };
  }
}
