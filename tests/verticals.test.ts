import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../src/sim/state.ts";
import {
  actBuyNrUpgrade,
  actCreateBrand,
  actGoFullyDigital,
  actOpenNonRestaurant,
  ActionError,
} from "../src/sim/actions.ts";
import { advanceWeek } from "../src/sim/advanceWeek.ts";
import { marginBandFor } from "../src/sim/economy.ts";
import { MARKET_MATURITY, NR_UPGRADE } from "../src/data/index.ts";

function apparelGame(seed = 400): GameState {
  let s = newGame({ seed });
  s.cash = 50_000_000;
  s = actCreateBrand(s, { name: "Tidewear", vertical: "apparel", conceptId: "apparel", positioning: "standard" });
  return s;
}

function openApparelUnits(s: GameState, n: number): GameState {
  const brandId = s.brands[0].id;
  const cities = ["shoreline", "baytown", "harborcity", "palmgrove"];
  for (let i = 0; i < n; i++) {
    s = actOpenNonRestaurant(s, { brandId, cityId: cities[i % cities.length] });
  }
  for (let i = 0; i < 12; i++) s = advanceWeek(s);
  return s;
}

describe("non-restaurant verticals", () => {
  it("runs on baseWeeklyRevenue x margin band, not the customer sim", () => {
    let s = openApparelUnits(apparelGame(), 1);
    const loc = s.locations[0];
    expect(loc.vertical).toBe("apparel");
    expect(loc.lastRevenue).toBeGreaterThan(0);
    const band = marginBandFor("apparel");
    const margin = loc.lastNet / loc.lastRevenue;
    expect(margin).toBeLessThanOrEqual(band.cap + 0.11); // cap + max sourcing boost headroom
    expect(margin).toBeGreaterThanOrEqual(band.floor - 1e-9);
  });

  it("sourcing investment lifts the margin band; brand investment lifts revenue", () => {
    let s = openApparelUnits(apparelGame(), 1);
    const loc0 = s.locations[0];
    const baseMargin = loc0.lastNet / loc0.lastRevenue;
    const baseRev = loc0.lastRevenue;

    // Max out both investments.
    for (let i = 0; i < NR_UPGRADE.maxLevel; i++) {
      s = actBuyNrUpgrade(s, s.locations[0].id, "sourcing");
      s = actBuyNrUpgrade(s, s.locations[0].id, "brand");
    }
    s = advanceWeek(s);
    const loc1 = s.locations[0];
    expect(loc1.lastNet / loc1.lastRevenue).toBeGreaterThan(baseMargin);
    expect(loc1.lastRevenue).toBeGreaterThan(baseRev);
  });

  it("rejects opening a non-restaurant unit for a restaurant brand", () => {
    let s = newGame({ seed: 5 });
    s.cash = 50_000_000;
    s = actCreateBrand(s, { name: "Grill", vertical: "restaurant", conceptId: "steak", positioning: "premium" });
    expect(() => actOpenNonRestaurant(s, { brandId: s.brands[0].id, cityId: "shoreline" })).toThrow(ActionError);
  });
});

describe("digital DTC conversion", () => {
  it("liquidates physical stores into one owned, no-rent online unit", () => {
    let s = openApparelUnits(apparelGame(), 4);
    expect(s.locations.length).toBe(4);
    const cashBefore = s.cash;
    s = actGoFullyDigital(s, s.brands[0].id);

    // Exactly one unit remains, owned (no lease), digital, location-independent.
    const units = s.locations.filter((l) => l.brandId === s.brands[0].id);
    expect(units.length).toBe(1);
    const online = units[0];
    expect(online.digital).toBe(true);
    expect(online.lease).toBeNull();
    expect(online.status).toBe("open");
    expect(s.cash).toBeGreaterThan(cashBefore); // liquidation proceeds added
  });

  it("the online unit ramps toward the higher digital ceiling over ~2 years", () => {
    let s = openApparelUnits(apparelGame(), 2);
    s = actGoFullyDigital(s, s.brands[0].id);
    const online = s.locations.find((l) => l.digital)!;
    const startRev = (() => {
      const before = advanceWeek(s);
      return before.locations.find((l) => l.digital)!.lastRevenue;
    })();
    for (let i = 0; i < 104; i++) s = advanceWeek(s);
    const later = s.locations.find((l) => l.digital)!;
    expect(online.maturity).toBeLessThan(1.0); // started low
    expect(later.maturity).toBeGreaterThan(1.6); // climbs past the physical ceiling
    expect(later.maturity).toBeLessThanOrEqual(MARKET_MATURITY.digitalCeiling + 1e-9);
    expect(later.lastRevenue).toBeGreaterThan(startRev); // worldwide sales grew
  });

  it("rejects going digital for non-apparel brands", () => {
    let s = newGame({ seed: 9 });
    s.cash = 50_000_000;
    s = actCreateBrand(s, { name: "Snacks", vertical: "cpg", positioning: "standard", conceptId: "cpg" });
    s = actOpenNonRestaurant(s, { brandId: s.brands[0].id, cityId: "shoreline" });
    expect(() => actGoFullyDigital(s, s.brands[0].id)).toThrow();
  });
});

describe("multiple brands / folders", () => {
  it("supports many brands across verticals, units grouped by brand", () => {
    let s = newGame({ seed: 11 });
    s.cash = 100_000_000;
    s = actCreateBrand(s, { name: "Catch", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
    s = actCreateBrand(s, { name: "Wear", vertical: "apparel", conceptId: "apparel", positioning: "premium" });
    expect(s.brands.length).toBe(2);
    s = actOpenNonRestaurant(s, { brandId: s.brands[1].id, cityId: "shoreline" });
    const folder = s.locations.filter((l) => l.brandId === s.brands[1].id);
    expect(folder.length).toBe(1);
    expect(MARKET_MATURITY.start).toBeGreaterThan(0.7);
  });
});
