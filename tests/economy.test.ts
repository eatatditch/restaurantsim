import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../src/sim/state";
import {
  actBuyUpgrade,
  actCreateBrand,
  actOpenLocation,
  actSetPositioning,
  ActionError,
} from "../src/sim/actions";
import { advanceWeek } from "../src/sim/advanceWeek";
import { governMargin, marginBandFor } from "../src/sim/economy";
import { OCCUPANCY_RATIO_CAP } from "../src/data/index";

/** Build a game with one restaurant brand and one open location. */
function gameWithOpenUnit(seed = 100): GameState {
  let s = newGame({ seed });
  s = actCreateBrand(s, {
    name: "The Catch",
    vertical: "restaurant",
    conceptId: "coastal",
    positioning: "standard",
  });
  const brandId = s.brands[0].id;
  s = actOpenLocation(s, {
    brandId,
    site: { cityId: "shoreline", settingId: "downtown", trafficTier: "medium", leaseTermId: "standard" },
  });
  // Advance past the build period so the unit opens.
  for (let i = 0; i < 12; i++) s = advanceWeek(s);
  return s;
}

describe("margin governor (invariant 8.1)", () => {
  it("never exceeds the vertical cap, even for absurd raw margins", () => {
    const band = marginBandFor("restaurant");
    for (let age = 0; age <= 200; age += 10) {
      const m = governMargin(5.0, band, age, 0);
      expect(m).toBeLessThanOrEqual(band.cap + 1e-9);
    }
  });

  it("holds the floor for deeply negative raw margins", () => {
    const band = marginBandFor("restaurant");
    const m = governMargin(-2.0, band, 150, 0);
    expect(m).toBeGreaterThanOrEqual(band.floor - 1e-9);
  });

  it("centers mature units near the band center", () => {
    const band = marginBandFor("restaurant");
    const m = governMargin(band.cap, band, 500, 0);
    // A fully mature unit is pulled most of the way to center.
    expect(Math.abs(m - band.center)).toBeLessThan((band.cap - band.center) * 0.5);
  });

  it("sourcing boost lifts the band by exactly the boost and no more", () => {
    const band = marginBandFor("apparel");
    const boost = 0.05;
    const capped = governMargin(5.0, band, 500, boost);
    expect(capped).toBeLessThanOrEqual(band.cap + boost + 1e-9);
    expect(capped).toBeGreaterThan(band.cap); // it actually used the boost
  });
});

describe("market maturity (invariant 8.5)", () => {
  it("units start below 1.0 and climb toward the ceiling", () => {
    let s = gameWithOpenUnit();
    const startMaturity = s.locations[0].maturity;
    expect(startMaturity).toBeGreaterThan(0.7);
    // After two in-game years, maturity should have grown meaningfully.
    for (let i = 0; i < 104; i++) s = advanceWeek(s);
    const later = s.locations[0].maturity;
    expect(later).toBeGreaterThan(startMaturity);
    expect(later).toBeGreaterThan(1.0);
    expect(later).toBeLessThanOrEqual(1.6 + 1e-9); // never exceeds physical ceiling
  });
});

describe("rent cap (invariant 8.2)", () => {
  it("weekly rent stays within the occupancy ratio of annualized sales", () => {
    const s = gameWithOpenUnit();
    const loc = s.locations[0];
    expect(loc.status).toBe("open");
    const annualized = loc.lastRevenue * 52;
    if (loc.lease) {
      // The CHARGED rent (occupancy-capped in P&L) must respect the cap, even
      // when seasonality lowers a given week's sales. The contractual rent may
      // exceed a low week's cap; the governor caps what's actually charged.
      expect(loc.lastRent * 52).toBeLessThanOrEqual(annualized * OCCUPANCY_RATIO_CAP + 1);
    }
  });
});

describe("positioning propagation (invariant 8.6)", () => {
  it("changing brand positioning changes every unit's pricing next tick", () => {
    let s = gameWithOpenUnit();
    const before = s.locations[0].lastRevenue;
    s = actSetPositioning(s, s.brands[0].id, "luxury");
    expect(s.brands[0].positioning).toBe("luxury");
    s = advanceWeek(s);
    const after = s.locations[0].lastRevenue;
    // Luxury raises check size and cuts covers; the revenue profile shifts.
    expect(after).not.toBeCloseTo(before, -2);
  });
});

describe("no negative-cash exploits (invariant 8.3)", () => {
  it("blocks opening a location you cannot afford", () => {
    let s = newGame({ seed: 5 });
    s = actCreateBrand(s, { name: "X", vertical: "restaurant", conceptId: "fine", positioning: "luxury" });
    s.cash = 1000; // not enough to build
    expect(() =>
      actOpenLocation(s, {
        brandId: s.brands[0].id,
        site: { cityId: "marina", settingId: "waterfront", trafficTier: "high", leaseTermId: "standard" },
      }),
    ).toThrow(ActionError);
  });

  it("blocks an upgrade you cannot afford", () => {
    let s = gameWithOpenUnit();
    s.cash = 0;
    expect(() => actBuyUpgrade(s, s.locations[0].id, "kitchen")).toThrow(ActionError);
  });
});

describe("determinism of advanceWeek (invariant 9)", () => {
  it("same seed + same actions => byte-identical state after N weeks", () => {
    const run = () => {
      let s = newGame({ seed: 77 });
      s = actCreateBrand(s, { name: "Reef", vertical: "restaurant", conceptId: "fastcasual", positioning: "budget" });
      s = actOpenLocation(s, {
        brandId: s.brands[0].id,
        site: { cityId: "baytown", settingId: "strip", trafficTier: "medium", leaseTermId: "short" },
      });
      for (let i = 0; i < 60; i++) s = advanceWeek(s);
      return s;
    };
    expect(JSON.stringify(run())).toEqual(JSON.stringify(run()));
  });
});
