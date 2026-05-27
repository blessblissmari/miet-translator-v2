import { describe, it, expect } from "vitest";
import { TIER_MODEL, TIER_PRICE, modelFor } from "../lib/pipeline/tiers";

describe("pipeline tiers", () => {
  it("maps every tier to a real MiMo model id", () => {
    expect(TIER_MODEL.OMNI_BEST).toBe("mimo-v2.5");
    expect(TIER_MODEL.OMNI_MID).toBe("mimo-v2-omni");
    expect(TIER_MODEL.REASON).toBe("mimo-v2.5-pro");
    expect(TIER_MODEL.CHEAP).toBe("mimo-v2-omni");
  });

  it("CHEAP is no more expensive than REASON on inputs", () => {
    expect(TIER_PRICE.CHEAP.in).toBeLessThanOrEqual(TIER_PRICE.REASON.in);
  });

  it("modelFor() returns the mapped model id", () => {
    expect(modelFor("CHEAP")).toBe("mimo-v2-omni");
  });
});
