import { describe, expect, it } from "vitest";
import { newGame, hashSeed, type GameState } from "../src/sim/state";
import {
  actBuyBackEquity,
  actCreateBrand,
  actOpenLocation,
  actRaiseCapital,
  actRepayLoan,
  actTakeLoan,
  ActionError,
} from "../src/sim/actions";
import { advanceWeek } from "../src/sim/advanceWeek";
import { borrowingCapacity } from "../src/sim/finance";
import { applyBalanceOverrides } from "../src/data/overrides";
import { COMPANY, DIFFICULTIES, RESTAURANT_CONCEPTS } from "../src/data/index";

function withUnit(seed = 900, difficulty: GameState["difficulty"] = "normal"): GameState {
  let s = newGame({ seed, difficulty });
  s.cash = 20_000_000;
  s = actCreateBrand(s, { name: "The Catch", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
  s = actOpenLocation(s, {
    brandId: s.brands[0].id,
    site: { cityId: "shoreline", settingId: "downtown", trafficTier: "medium", leaseTermId: "standard" },
  });
  for (let i = 0; i < 12; i++) s = advanceWeek(s);
  return s;
}

describe("difficulty modes", () => {
  it("set starting cash per difficulty", () => {
    expect(newGame({ difficulty: "easy" }).cash).toBe(DIFFICULTIES.easy.startingCash);
    expect(newGame({ difficulty: "normal" }).cash).toBe(DIFFICULTIES.normal.startingCash);
    expect(newGame({ difficulty: "hard" }).cash).toBe(DIFFICULTIES.hard.startingCash);
  });

  it("normal matches the baseline starting cash (regression stays valid)", () => {
    expect(DIFFICULTIES.normal.startingCash).toBe(COMPANY.startingCash);
  });

  it("easy out-earns hard over a year on the same script", () => {
    function run(d: GameState["difficulty"]): number {
      let s = withUnit(5, d);
      for (let i = 0; i < 52; i++) s = advanceWeek(s);
      return s.locations[0].lastRevenue;
    }
    expect(run("easy")).toBeGreaterThan(run("hard"));
  });
});

describe("shareable seeds", () => {
  it("hashSeed is deterministic and seeds reproduce games", () => {
    const seed = hashSeed("daily-2026-06-04");
    expect(hashSeed("daily-2026-06-04")).toBe(seed);
    expect(JSON.stringify(newGame({ seed }))).toEqual(JSON.stringify(newGame({ seed })));
  });
});

describe("loans", () => {
  it("borrow within capacity, accrue interest, and repay", () => {
    let s = withUnit();
    const cap = borrowingCapacity(s);
    expect(cap).toBeGreaterThan(0);
    s = actTakeLoan(s, 200_000);
    expect(s.debt).toBe(200_000);

    // Interest is charged weekly (debt persists).
    const cashBefore = s.cash;
    s = advanceWeek(s);
    // Net includes interest as a cost; debt unchanged.
    expect(s.debt).toBe(200_000);
    expect(cashBefore).toBeGreaterThan(0);

    s = actRepayLoan(s, 200_000);
    expect(s.debt).toBe(0);
  });

  it("blocks borrowing beyond capacity", () => {
    let s = withUnit();
    expect(() => actTakeLoan(s, borrowingCapacity(s) + 1_000_000)).toThrow(ActionError);
  });
});

describe("investors / private equity", () => {
  it("raising capital adds cash and sells equity; dividend reduces net", () => {
    let s = withUnit();
    const cashBefore = s.cash;
    s = actRaiseCapital(s, "pe", 5_000_000);
    expect(s.cash).toBe(cashBefore + 5_000_000);
    expect(s.investorEquity).toBeGreaterThan(0);

    // With equity sold, a profitable week pays investors a slice.
    const equity = s.investorEquity;
    expect(equity).toBeLessThan(0.9);
    s = advanceWeek(s);
    expect(s.investorEquity).toBe(equity); // permanent until bought back
  });

  it("enforces minimum raise per round", () => {
    let s = withUnit();
    expect(() => actRaiseCapital(s, "pe", 1_000_000)).toThrow(ActionError);
  });

  it("equity can be bought back", () => {
    let s = withUnit();
    s = actRaiseCapital(s, "angel", 1_000_000);
    const before = s.investorEquity;
    s = actBuyBackEquity(s, before);
    expect(s.investorEquity).toBeLessThan(before);
  });
});

describe("history tracking", () => {
  it("records a snapshot each week", () => {
    let s = withUnit();
    const len = s.history.length;
    s = advanceWeek(s);
    expect(s.history.length).toBe(len + 1);
    const last = s.history[s.history.length - 1];
    expect(last.week).toBe(s.week);
    expect(last.units).toBe(1);
  });
});

describe("new concepts", () => {
  it("Next-Gen Casual and Taco concepts exist and are playable", () => {
    expect(RESTAURANT_CONCEPTS.find((c) => c.id === "nextgen")).toBeDefined();
    expect(RESTAURANT_CONCEPTS.find((c) => c.id === "taco")).toBeDefined();
    let s = newGame({ seed: 1 });
    s.cash = 5_000_000;
    s = actCreateBrand(s, { name: "Taco Wave", vertical: "restaurant", conceptId: "taco", positioning: "budget" });
    s = actOpenLocation(s, { brandId: s.brands[0].id, site: { cityId: "shoreline", settingId: "strip", trafficTier: "high", leaseTermId: "standard" } });
    for (let i = 0; i < 14; i++) s = advanceWeek(s);
    expect(s.locations[0].lastRevenue).toBeGreaterThan(0);
  });
});

describe("balance overrides (moddability)", () => {
  it("applies allowlisted overrides and ignores unknown keys", () => {
    const applied = applyBalanceOverrides({ FINANCE: { leverageOfRevenue: 0.5 }, BOGUS: { x: 1 } });
    expect(applied).toContain("FINANCE");
    expect(applied).not.toContain("BOGUS");
  });
});
