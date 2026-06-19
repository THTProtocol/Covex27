// tierPalette.js - single source of truth for Covex paid-tier identity.
//
// Tier identity is the visual proof of a paying customer's purchase. Drift
// between pages (BUILDER blue here, green there; PRO gold on Pricing but
// amber on Stats) devalues that purchase, so every page imports from here.
//
// Brand-anchored: PRO uses Kaspa gold (#E8AF34), MAX uses purple, BUILDER
// uses a calm blue that does not collide with the brand teal, FREE is neutral
// slate gray. Icons live alongside colors so tier glyphs stay consistent too.

import { Eye, Terminal, Star, Crown } from 'lucide-react';

export const TIER_PALETTE = {
  FREE:    { color: '#6B7280', icon: Eye,      label: 'FREE'    },
  BUILDER: { color: '#3B82F6', icon: Terminal, label: 'BUILDER' },
  PRO:     { color: '#E8AF34', icon: Star,     label: 'PRO'     },
  MAX:     { color: '#A855F7', icon: Crown,    label: 'MAX'     },
};

// Convenience accessor that normalises a server-supplied tier string and
// falls back to FREE on anything unknown.
export function tierFor(rawTier) {
  const key = (rawTier || 'FREE').toUpperCase();
  return TIER_PALETTE[key] || TIER_PALETTE.FREE;
}

// Direct color map - the most common consumer pattern (Stats charts,
// PremiumBuilder accent, Pricing card edge).
export const TIER_COLOR = Object.fromEntries(
  Object.entries(TIER_PALETTE).map(([k, v]) => [k, v.color])
);

// Direct icon map.
export const TIER_ICON = Object.fromEntries(
  Object.entries(TIER_PALETTE).map(([k, v]) => [k, v.icon])
);
