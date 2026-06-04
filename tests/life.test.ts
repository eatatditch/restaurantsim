import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../src/sim/state";
import {
  actAffair,
  actBuyHome,
  actBuyLuxury,
  actCreateBrand,
  actFundVenture,
  actHaveKid,
  actMarry,
  actOpenLocation,
  actOwnerDraw,
  actSellLuxury,
  actSendToCollege,
  actSetSalary,
  actStartDating,
} from "../src/sim/actions";
import { advanceWeek } from "../src/sim/advanceWeek";
import { happinessMult, lifestyleHappinessTarget, personalNetWorth, weeklyUpkeep } from "../src/sim/life";
import { HOMES, LIFE, LUXURY_CATALOG } from "../src/data/index";

function richPlayer(seed = 700): GameState {
  let s = newGame({ seed });
  s.cash = 200_000_000;
  s.personal.cash = 100_000_000;
  return s;
}

describe("money: draw, salary, savings", () => {
  it("owner's draw moves cash from company to personal", () => {
    let s = richPlayer();
    const coBefore = s.cash;
    s = actOwnerDraw(s, 1_000_000);
    expect(s.cash).toBe(coBefore - 1_000_000);
    expect(s.personal.cash).toBe(100_000_000 + 1_000_000);
  });

  it("salary auto-draws each week", () => {
    let s = richPlayer();
    s = actSetSalary(s, 50_000);
    const before = s.personal.cash;
    s = advanceWeek(s);
    expect(s.personal.cash).toBeGreaterThan(before);
  });
});

describe("homes, cars, luxuries", () => {
  it("buying a home raises the happiness target and net worth, and adds upkeep", () => {
    let s = richPlayer();
    const targetBefore = lifestyleHappinessTarget(s);
    const nwBefore = personalNetWorth(s);
    s = actBuyHome(s, "estate");
    expect(lifestyleHappinessTarget(s)).toBeGreaterThan(targetBefore);
    expect(weeklyUpkeep(s.personal)).toBeGreaterThan(0);
    // Net worth: spent cash but gained a resaleable asset (roughly retained).
    expect(personalNetWorth(s)).toBeGreaterThan(nwBefore - HOMES.find((h) => h.id === "estate")!.cost);
  });

  it("luxuries can be owned in multiples and sold at a resale fraction", () => {
    let s = richPlayer();
    s = actBuyLuxury(s, "supercar");
    s = actBuyLuxury(s, "supercar");
    expect(s.personal.luxuries.find((l) => l.catalogId === "supercar")!.count).toBe(2);
    const cashBefore = s.personal.cash;
    s = actSellLuxury(s, "supercar");
    const item = LUXURY_CATALOG.find((l) => l.id === "supercar")!;
    expect(s.personal.cash).toBe(cashBefore + Math.round(item.cost * item.resale));
  });
});

describe("family, kids, college, ventures", () => {
  it("date -> marry -> have kid -> college progression", () => {
    let s = richPlayer();
    s = actStartDating(s, "Alex");
    s = actMarry(s);
    expect(s.personal.partner!.married).toBe(true);
    s = actHaveKid(s, "Sam");
    expect(s.personal.kids.length).toBe(1);
    s = actSendToCollege(s, s.personal.kids[0].id);
    expect(s.personal.kids[0].stage).toBe("graduated");
  });

  it("a funded venture either fails or pays weekly income", () => {
    let s = richPlayer();
    s = actStartDating(s, "Alex");
    s = actHaveKid(s, "Sam");
    s = actFundVenture(s, s.personal.kids[0].id);
    const kid = s.personal.kids[0];
    expect(["failed", "running"]).toContain(kid.venture);
    if (kid.venture === "running") {
      const before = s.personal.cash;
      s = advanceWeek(s);
      expect(s.personal.cash).toBeGreaterThan(before);
    }
  });
});

describe("temptations", () => {
  it("an affair is heavily weighted toward disaster (divorce/wrecked)", () => {
    let disasters = 0;
    for (let seed = 0; seed < 60; seed++) {
      let s = richPlayer(seed);
      s = actStartDating(s, "Alex");
      s = actMarry(s);
      const outcome = actAffair(s);
      // We can't read the return; infer from state.
      if (!outcome.personal.partner || !outcome.personal.partner.married) disasters += 1;
    }
    // The large majority should end in disaster.
    expect(disasters).toBeGreaterThan(40);
  });
});

describe("happiness <-> business loop", () => {
  it("higher happiness yields a higher business multiplier", () => {
    let s = richPlayer();
    s.personal.happiness = 20;
    const low = happinessMult(s);
    s.personal.happiness = 95;
    const high = happinessMult(s);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(LIFE.businessHappinessMin - 1e-9);
    expect(high).toBeLessThanOrEqual(LIFE.businessHappinessMax + 1e-9);
  });

  it("owner happiness measurably moves restaurant revenue", () => {
    function runWith(happiness: number): number {
      let s = newGame({ seed: 9 });
      s.cash = 50_000_000;
      s = actCreateBrand(s, { name: "The Catch", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
      s = actOpenLocation(s, {
        brandId: s.brands[0].id,
        site: { cityId: "shoreline", settingId: "downtown", trafficTier: "medium", leaseTermId: "standard" },
      });
      for (let i = 0; i < 12; i++) s = advanceWeek(s);
      s.personal.happiness = happiness;
      s = advanceWeek(s);
      return s.locations[0].lastRevenue;
    }
    expect(runWith(95)).toBeGreaterThan(runWith(15));
  });

  it("burnout accrues when happiness is very low", () => {
    let s = richPlayer();
    s.personal.happiness = 5;
    // No lifestyle => target stays low => happiness stays under threshold.
    for (let i = 0; i < 5; i++) s = advanceWeek(s);
    expect(s.personal.burnoutWeeks).toBeGreaterThan(0);
  });
});

describe("personal net worth aggregates everything", () => {
  it("includes cash, savings, home/car resale, and luxury resale", () => {
    let s = richPlayer();
    s = actBuyHome(s, "condo");
    s = actBuyLuxury(s, "watch");
    const nw = personalNetWorth(s);
    expect(nw).toBeGreaterThan(s.personal.cash); // assets add on top of cash
  });
});
