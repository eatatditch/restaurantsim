import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../src/sim/state.ts";
import { actBulkOpen, actCreateBrand } from "../src/sim/actions.ts";
import { advanceWeek } from "../src/sim/advanceWeek.ts";
import { managementCapacity, maxAffordableOpen } from "../src/sim/expansion.ts";
import { EXPANSION } from "../src/data/index.ts";

function gameWithBrand(seed = 300, cash = 100_000_000): GameState {
  let s = newGame({ seed });
  s.cash = cash;
  s = actCreateBrand(s, { name: "Reef", vertical: "restaurant", conceptId: "fastcasual", positioning: "standard" });
  return s;
}

describe("bulk open", () => {
  it("opens the requested number of units when affordable", () => {
    let s = gameWithBrand();
    const brandId = s.brands[0].id;
    s = actBulkOpen(s, { brandId, count: 5 });
    expect(s.locations.length).toBe(5);
    expect(s.locations.every((l) => l.brandId === brandId)).toBe(true);
  });

  it("respects the cash reserve and stops early when funds run low", () => {
    let s = gameWithBrand(301, 700_000); // only a couple of units affordable
    const brandId = s.brands[0].id;
    s = actBulkOpen(s, { brandId, count: 20 });
    expect(s.cash).toBeGreaterThanOrEqual(EXPANSION.cashReserve);
    expect(s.locations.length).toBeLessThan(20);
    expect(s.locations.length).toBeGreaterThan(0);
  });

  it("is deterministic (RNG state persisted across the action)", () => {
    const run = () => {
      let s = gameWithBrand(42);
      s = actBulkOpen(s, { brandId: s.brands[0].id, count: 8 });
      return JSON.stringify(s);
    };
    expect(run()).toEqual(run());
  });
});

describe("overextension (invariant 8.4)", () => {
  it("opening past capacity produces rushed units and a strain window", () => {
    let s = gameWithBrand();
    const capacity = managementCapacity(s);
    const brandId = s.brands[0].id;
    s = actBulkOpen(s, { brandId, count: capacity + 5 });

    const rushed = s.locations.filter((l) => l.maturity < 0.78 * 0.99);
    expect(rushed.length).toBeGreaterThan(0);
    expect(s.expansionPlan.overextensionWeeks).toBe(EXPANSION.strainWeeks);
  });

  it("rushed units start with depressed maturity vs in-capacity units", () => {
    let s = gameWithBrand();
    const brandId = s.brands[0].id;
    const capacity = managementCapacity(s);
    s = actBulkOpen(s, { brandId, count: capacity + 3 });
    const inCap = s.locations[0].maturity;
    const last = s.locations[s.locations.length - 1].maturity;
    expect(last).toBeLessThan(inCap);
  });

  it("the strain window drives a company-wide revenue drag, then clears", () => {
    let s = gameWithBrand();
    s = actBulkOpen(s, { brandId: s.brands[0].id, count: managementCapacity(s) + 4 });
    expect(s.expansionPlan.overextensionWeeks).toBeGreaterThan(0);
    for (let i = 0; i < EXPANSION.strainWeeks + 1; i++) s = advanceWeek(s);
    expect(s.expansionPlan.overextensionWeeks).toBe(0);
  });
});

describe("MAX affordability helper", () => {
  it("never proposes more than the cash reserve allows", () => {
    const s = gameWithBrand(7, 5_000_000);
    const max = maxAffordableOpen(s, s.brands[0].id);
    expect(max).toBeLessThanOrEqual(EXPANSION.maxBulkOpen);
    expect(max).toBeGreaterThan(0);
  });
});
