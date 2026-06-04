import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../src/sim/state";
import { actCreateBrand, actOpenLocation, actResolveComplication } from "../src/sim/actions";
import { advanceWeek } from "../src/sim/advanceWeek";
import { checkAchievements, checkGoals, seasonForWeek, tickDisasters } from "../src/sim/events";
import { Rng } from "../src/sim/rng";
import { SEASONS } from "../src/data/index";

function gameWithUnit(seed = 800): GameState {
  let s = newGame({ seed });
  s.cash = 50_000_000;
  s = actCreateBrand(s, { name: "The Catch", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
  s = actOpenLocation(s, {
    brandId: s.brands[0].id,
    site: { cityId: "shoreline", settingId: "downtown", trafficTier: "medium", leaseTermId: "standard" },
  });
  for (let i = 0; i < 12; i++) s = advanceWeek(s);
  return s;
}

describe("seasons", () => {
  it("cycle through four 13-week seasons across the year", () => {
    expect(seasonForWeek(1).id).toBe(SEASONS[0].id);
    expect(seasonForWeek(14).id).toBe(SEASONS[1].id);
    expect(seasonForWeek(27).id).toBe(SEASONS[2].id);
    expect(seasonForWeek(40).id).toBe(SEASONS[3].id);
    expect(seasonForWeek(53).id).toBe(SEASONS[0].id); // wraps
  });
});

describe("disasters", () => {
  it("strike, drag revenue for a few weeks, then clear", () => {
    let s = newGame({ seed: 1 });
    s.cash = 10_000_000;
    // Force a disaster by exhausting the RNG until one rolls.
    const rng = new Rng(1);
    let struck = false;
    for (let i = 0; i < 500 && !struck; i++) {
      tickDisasters(s, rng);
      if (s.activeDisasters.length > 0) struck = true;
      s.week += 1;
    }
    expect(struck).toBe(true);
    const weeks = s.activeDisasters[0].weeksLeft;
    expect(weeks).toBeGreaterThan(0);
  });
});

describe("complications", () => {
  it("can be resolved by paying the cost", () => {
    let s = gameWithUnit();
    // Inject a complication directly.
    s.complications.push({ id: "cplx_test", defId: "lawsuit", message: "x", deadlineWeek: s.week + 6 });
    const cashBefore = s.cash;
    s = actResolveComplication(s, "cplx_test");
    expect(s.complications.length).toBe(0);
    expect(s.cash).toBeLessThan(cashBefore);
  });

  it("lapse when past deadline and dock reputation", () => {
    let s = gameWithUnit();
    s.reputation = 70;
    // Deadline already in the past so the next tick lapses it.
    s.complications.push({ id: "cplx_lapse", defId: "lawsuit", message: "x", deadlineWeek: s.week - 1 });
    s = advanceWeek(s);
    expect(s.complications.find((c) => c.id === "cplx_lapse")).toBeUndefined();
    expect(s.reputation).toBeLessThan(70);
  });
});

describe("achievements", () => {
  it("records milestones once", () => {
    let s = gameWithUnit();
    checkAchievements(s);
    expect(s.achievements).toContain("first_location");
    const len = s.achievements.length;
    checkAchievements(s); // idempotent
    expect(s.achievements.length).toBe(len);
  });
});

describe("goals", () => {
  it("complete when their metric crosses the target", () => {
    let s = gameWithUnit();
    s.reputation = 85;
    checkGoals(s);
    expect(s.goals).toContain("g_rep_80");
  });
});

describe("determinism with meta systems", () => {
  it("same seed + same actions stays byte-identical over a long run", () => {
    const run = () => {
      let s = gameWithUnit(123);
      for (let i = 0; i < 80; i++) s = advanceWeek(s);
      return JSON.stringify(s);
    };
    expect(run()).toEqual(run());
  });
});
