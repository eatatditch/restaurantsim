import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../src/sim/state.ts";
import {
  actAcquireBigGroup,
  actAcquireCompetitor,
  actCreateBrand,
  actRenovateUnit,
  actScaleGroupDivision,
  ActionError,
} from "../src/sim/actions.ts";
import { advanceWeek } from "../src/sim/advanceWeek.ts";
import { refreshAcquisitions } from "../src/sim/acquisitions.ts";
import { Rng } from "../src/sim/rng.ts";

function gameWithMarket(seed = 500, cash = 200_000_000): GameState {
  let s = newGame({ seed });
  s.cash = cash;
  // Populate the acquisitions market deterministically.
  const rng = Rng.fromState(s.rngState);
  refreshAcquisitions(s, rng);
  s.rngState = rng.toState();
  return s;
}

describe("big groups", () => {
  it("market refreshes with group and competitor offers", () => {
    const s = gameWithMarket();
    expect(s.bigGroups.length).toBeGreaterThan(0);
    expect(s.competitorChains.length).toBeGreaterThan(0);
    for (const g of s.bigGroups) {
      expect(g.units).toBeGreaterThanOrEqual(15);
      expect(g.units).toBeLessThanOrEqual(130);
    }
  });

  it("acquiring a big group creates one aggregate division unit", () => {
    let s = gameWithMarket();
    const offer = s.bigGroups[0];
    const brandsBefore = s.brands.length;
    s = actAcquireBigGroup(s, offer.id);

    expect(s.brands.length).toBe(brandsBefore + 1);
    const division = s.locations.find((l) => l.vertical === "group");
    expect(division).toBeDefined();
    expect(division!.storeCount).toBe(offer.units);
    // The offer leaves the market once bought.
    expect(s.bigGroups.find((g) => g.id === offer.id)).toBeUndefined();
  });

  it("the division earns aggregate revenue scaled by store count", () => {
    let s = gameWithMarket();
    s = actAcquireBigGroup(s, s.bigGroups[0].id);
    for (let i = 0; i < 4; i++) s = advanceWeek(s);
    const division = s.locations.find((l) => l.vertical === "group")!;
    expect(division.lastRevenue).toBeGreaterThan(0);
  });

  it("scaling the division builds out stores and grows revenue", () => {
    let s = gameWithMarket();
    s = actAcquireBigGroup(s, s.bigGroups[0].id);
    const division = s.locations.find((l) => l.vertical === "group")!;
    const before = division.storeCount;
    s = actScaleGroupDivision(s, division.id, 10);
    const after = s.locations.find((l) => l.id === division.id)!;
    expect(after.storeCount).toBe(before + 10);
  });

  it("blocks an acquisition you cannot afford", () => {
    let s = gameWithMarket(500, 1000);
    expect(() => actAcquireBigGroup(s, s.bigGroups[0].id)).toThrow(ActionError);
  });
});

describe("competitor chains", () => {
  it("acquiring creates a restaurant brand whose units need renovation", () => {
    let s = gameWithMarket();
    const offer = s.competitorChains[0];
    s = actAcquireCompetitor(s, offer.id);
    const units = s.locations.filter((l) => l.needsRenovation);
    expect(units.length).toBe(offer.units);
    expect(units.every((u) => u.vertical === "restaurant")).toBe(true);
  });

  it("renovating flips a unit into one of your own brands and clears the flag", () => {
    let s = gameWithMarket();
    s = actCreateBrand(s, { name: "The Catch", vertical: "restaurant", conceptId: "coastal", positioning: "premium" });
    const myBrandId = s.brands[s.brands.length - 1].id;

    s = actAcquireCompetitor(s, s.competitorChains[0].id);
    const target = s.locations.find((l) => l.needsRenovation)!;
    s = actRenovateUnit(s, target.id, myBrandId);

    const flipped = s.locations.find((l) => l.id === target.id)!;
    expect(flipped.needsRenovation).toBe(false);
    expect(flipped.brandId).toBe(myBrandId);
  });

  it("un-renovated units underperform vs renovated", () => {
    let s = gameWithMarket();
    s = actCreateBrand(s, { name: "Mine", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
    const myBrandId = s.brands[s.brands.length - 1].id;
    s = actAcquireCompetitor(s, s.competitorChains[0].id);

    // Run a few weeks while run-down.
    for (let i = 0; i < 3; i++) s = advanceWeek(s);
    const downRev = s.locations.find((l) => l.needsRenovation)!.lastRevenue;

    const target = s.locations.find((l) => l.needsRenovation)!;
    s = actRenovateUnit(s, target.id, myBrandId);
    for (let i = 0; i < 3; i++) s = advanceWeek(s);
    const upRev = s.locations.find((l) => l.id === target.id)!.lastRevenue;
    expect(upRev).toBeGreaterThan(downRev);
  });
});
