/**
 * Covex Covenant Configuration v1
 * Shared protocol between Covex Terminal and Covenant Studio
 * 
 * This is the canonical TypeScript implementation for Phase 11.
 */

import { z } from 'zod';

// ============================================
// Core Enums
// ============================================

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

// ============================================
// Schemas
// ============================================

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
  threshold: z.number().int().min(1).optional(),
  providers: z.array(z.string()).optional(),
});

export const PayoutModelSchema = z.object({
  type: PayoutModelType,
  feeBasisPoints: z.number().int().min(0).max(1000),
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

// ============================================
// Types
// ============================================

export type CovenantConfigV1 = z.infer<typeof CovenantConfigV1Schema>;
export type CovenantCore = z.infer<typeof CovenantCoreSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;

// ============================================
// Validation Helpers
// ============================================

export function validateCovenantConfig(input: unknown): CovenantConfigV1 {
  return CovenantConfigV1Schema.parse(input);
}

export function isValidCovenantConfig(input: unknown): input is CovenantConfigV1 {
  return CovenantConfigV1Schema.safeParse(input).success;
}

// ============================================
// Example Factories (for testing / seeding)
// ============================================

export function createDefaultChessConfig(creatorAddress: string): CovenantConfigV1 {
  return {
    version: '1.0',
    covenant: {
      id: crypto.randomUUID(),
      name: 'Chess Match',
      description: 'Standard chess game with ZK outcome verification',
      creatorAddress,
      reusable: true,
      allowTopups: true,
    },
    resolution: {
      mode: 'zk',
      circuit: {
        type: 'chess_v1',
        verifierKey: '0xCHESSv1_8x8_STANDARD',
      },
      oracle: { provider: 'covex' },
      payoutModel: {
        type: 'winner_takes_all',
        feeBasisPoints: 200, // 2%
      },
    },
    ui: {
      templateId: 'chess-classic-v1',
      theme: {
        primaryColor: '#49EACB',
      },
    },
  };
}

export function createDefaultEscrowConfig(creatorAddress: string): CovenantConfigV1 {
  return {
    version: '1.0',
    covenant: {
      id: crypto.randomUUID(),
      name: 'Conditional Escrow',
      description: 'Escrow released on successful ZK proof or oracle attestation',
      creatorAddress,
    },
    resolution: {
      mode: 'oracle',
      circuit: { type: 'merkle_membership' },
      oracle: { provider: 'covex' },
      payoutModel: {
        type: 'proportional',
        feeBasisPoints: 100,
      },
    },
    ui: {
      templateId: 'escrow-milestone-v1',
      theme: { primaryColor: '#3B82F6' },
    },
  };
}

// ============================================
// Export everything
// ============================================

export const CovenantConfig = {
  schema: CovenantConfigV1Schema,
  validate: validateCovenantConfig,
  isValid: isValidCovenantConfig,
  createDefaultChess: createDefaultChessConfig,
  createDefaultEscrow: createDefaultEscrowConfig,
};