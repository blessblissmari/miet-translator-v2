/**
 * Model tier roles for the new cascade pipeline.
 *
 * Roles, not concrete IDs, so we can swap models per-pass without touching
 * call sites. Real model IDs map here. Pricing (overseas, ≤256K input):
 *
 *   mimo-v2.5       — $0.40 / $2.00   omni, 1M ctx       → OMNI_BEST
 *   mimo-v2-omni    — $0.40 / $2.00   omni, 256K ctx     → OMNI_MID
 *   mimo-v2.5-pro   — $1.00 / $3.00   text reasoning     → REASON
 *   mimo-v2-flash   — $0.10 / $0.30   cheap text         → CHEAP
 */

export type Tier = "OMNI_BEST" | "OMNI_MID" | "REASON" | "CHEAP";

export const TIER_MODEL: Record<Tier, string> = {
  OMNI_BEST: "mimo-v2.5",
  OMNI_MID: "mimo-v2-omni",
  REASON: "mimo-v2.5-pro",
  CHEAP: "mimo-v2-flash",
};

/** Rough $/M input,output for budget logging. */
export const TIER_PRICE: Record<Tier, { in: number; out: number }> = {
  OMNI_BEST: { in: 0.4, out: 2.0 },
  OMNI_MID: { in: 0.4, out: 2.0 },
  REASON: { in: 1.0, out: 3.0 },
  CHEAP: { in: 0.1, out: 0.3 },
};

/** Resolve a tier role to a concrete model ID. */
export function modelFor(tier: Tier): string {
  return TIER_MODEL[tier];
}
