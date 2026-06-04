import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/state";
import { actBulkOpen, actCreateBrand, actOpenLocation } from "../src/sim/actions";
import { advanceWeek } from "../src/sim/advanceWeek";
import { VERTICAL_MARGIN_BANDS } from "../src/data/index";

/**
 * Economy regression: a fixed scripted game run over two in-game years must
 * land in stable, expected ranges. This is the canary that catches unintended
 * balance changes — if a constant moves, these ranges should be re-baselined
 * deliberately, not silently.
 */
describe("scripted two-year economy regression", () => {
  function runScript() {
    let s = newGame({ seed: 20260604 });
    s.cash = 8_000_000;
    s = actCreateBrand(s, { name: "The Catch", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
    s = actOpenLocation(s, {
      brandId: s.brands[0].id,
      site: { cityId: "shoreline", settingId: "downtown", trafficTier: "medium", leaseTermId: "standard" },
    });
    for (let i = 0; i < 26; i++) s = advanceWeek(s);
    s = actBulkOpen(s, { brandId: s.brands[0].id, count: 5 });
    for (let i = 0; i < 78; i++) s = advanceWeek(s);
    return s;
  }

  it("is fully deterministic", () => {
    expect(JSON.stringify(runScript())).toEqual(JSON.stringify(runScript()));
  });

  it("lands in expected ranges after two years", () => {
    const s = runScript();
    expect(s.week).toBe(105);

    const open = s.locations.filter((l) => l.status === "open");
    expect(open.length).toBe(6);

    // Cash grew into the low eight figures.
    expect(s.cash).toBeGreaterThan(8_000_000);
    expect(s.cash).toBeLessThan(15_000_000);

    // Reputation settled in a healthy mid band.
    expect(s.reputation).toBeGreaterThan(50);
    expect(s.reputation).toBeLessThan(62);

    // The margin governor held every unit within the restaurant cap.
    const cap = VERTICAL_MARGIN_BANDS.restaurant.cap;
    for (const u of open) {
      const margin = u.lastNet / u.lastRevenue;
      expect(margin).toBeLessThanOrEqual(cap + 1e-9);
      expect(margin).toBeGreaterThan(0.1);
    }

    // Milestone achievements unlocked along the way.
    expect(s.achievements).toContain("first_location");
    expect(s.achievements).toContain("millionaire");
  });
});
