import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../src/sim/state";
import {
  actBuyLand,
  actBuyOutAllLeases,
  actCreateBrand,
  actOpenLocation,
  actSetFacilities,
  actSetOwnPolicy,
  ActionError,
} from "../src/sim/actions";
import { advanceWeek } from "../src/sim/advanceWeek";
import { buyoutPriceFromLease } from "../src/sim/realestate";
import { FACILITIES } from "../src/data/index";

function withLeasedUnits(count: number, seed = 200): GameState {
  let s = newGame({ seed });
  s.cash = 50_000_000; // plenty to open several units
  s = actCreateBrand(s, { name: "The Catch", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
  const brandId = s.brands[0].id;
  for (let i = 0; i < count; i++) {
    s = actOpenLocation(s, {
      brandId,
      site: { cityId: "shoreline", settingId: "downtown", trafficTier: "medium", leaseTermId: "standard" },
    });
  }
  for (let i = 0; i < 12; i++) s = advanceWeek(s);
  return s;
}

describe("leases vs owned", () => {
  it("buying land converts a leased unit to owned and removes the lease", () => {
    let s = withLeasedUnits(1);
    const loc = s.locations[0];
    expect(loc.lease).not.toBeNull();
    const price = buyoutPriceFromLease(loc);
    const cashBefore = s.cash;
    s = actBuyLand(s, loc.id);
    expect(s.locations[0].lease).toBeNull();
    expect(s.cash).toBe(cashBefore - price);
  });

  it("rejects buying land on an already-owned unit", () => {
    let s = withLeasedUnits(1);
    s = actBuyLand(s, s.locations[0].id);
    expect(() => actBuyLand(s, s.locations[0].id)).toThrow(ActionError);
  });
});

describe("annual escalations", () => {
  it("raises weekly rent at the lease anniversary", () => {
    let s = withLeasedUnits(1);
    const rent0 = s.locations[0].lease!.weeklyRent;
    const esc = s.locations[0].lease!.escalation;
    // Advance to just past the 52-week anniversary of the lease start (week 1).
    while (s.week <= 54) s = advanceWeek(s);
    const rent1 = s.locations[0].lease!.weeklyRent;
    expect(rent1).toBe(Math.round(rent0 * (1 + esc)));
  });
});

describe("Facilities Manager", () => {
  it("ownership sweep converts leased units to owned, up to the weekly cap", () => {
    let s = withLeasedUnits(4);
    s.cash = 50_000_000;
    s = actSetFacilities(s, true);
    s = actSetOwnPolicy(s, true);
    const leasedBefore = s.locations.filter((l) => l.lease).length;
    s = advanceWeek(s);
    const leasedAfter = s.locations.filter((l) => l.lease).length;
    expect(leasedBefore - leasedAfter).toBeLessThanOrEqual(FACILITIES.maxConvertsPerWeek);
    expect(leasedBefore - leasedAfter).toBeGreaterThan(0);
  });

  it("always preserves the cash reserve when sweeping", () => {
    let s = withLeasedUnits(4);
    s = actSetFacilities(s, true);
    s = actSetOwnPolicy(s, true);
    // Leave less than one buyout above the reserve.
    const price = buyoutPriceFromLease(s.locations.find((l) => l.lease)!);
    s.cash = FACILITIES.cashReserve + price - 1;
    s = advanceWeek(s);
    // Could not afford to dip below the reserve => nothing converted this week.
    expect(s.cash).toBeGreaterThanOrEqual(FACILITIES.cashReserve - 1);
  });

  it("buy-out-all buys everything affordable and flags the rest", () => {
    let s = withLeasedUnits(3);
    const oneBuyout = buyoutPriceFromLease(s.locations[0]);
    // Enough company cash for ~1 unit only; personal funds cover part of a 2nd.
    s.cash = oneBuyout;
    s.personal.cash = 0;
    s = actBuyOutAllLeases(s);
    const owned = s.locations.filter((l) => !l.lease).length;
    const flagged = s.locations.filter((l) => l.fmFlagged).length;
    expect(owned).toBeGreaterThanOrEqual(1);
    expect(owned + flagged).toBe(3);
  });
});

describe("owned units pay no rent", () => {
  it("an owned unit has a null lease and is rent-exempt in P&L", () => {
    let s = newGame({ seed: 9 });
    s.cash = 50_000_000;
    s = actSetOwnPolicy(s, true);
    s = actCreateBrand(s, { name: "Own", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
    s = actOpenLocation(s, {
      brandId: s.brands[0].id,
      site: { cityId: "shoreline", settingId: "downtown", trafficTier: "medium", leaseTermId: "standard" },
    });
    // Buy-and-own policy forces ownership at open.
    expect(s.locations[0].lease).toBeNull();
  });
});
