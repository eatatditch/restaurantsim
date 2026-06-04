import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../src/sim/state.ts";
import {
  actCeoSitDown,
  actCreateBrand,
  actHireCeo,
  actResolveMeeting,
  actSetCeoGoals,
  actSetExec,
} from "../src/sim/actions.ts";
import { advanceWeek } from "../src/sim/advanceWeek.ts";
import { companyRevenueMult } from "../src/sim/executives.ts";
import { CEO, EXECUTIVES } from "../src/data/index.ts";

function gameWithUnit(seed = 600): GameState {
  let s = newGame({ seed });
  s.cash = 50_000_000;
  s = actCreateBrand(s, { name: "The Catch", vertical: "restaurant", conceptId: "coastal", positioning: "standard" });
  return s;
}

describe("C-suite roles", () => {
  it("hiring a CMO raises the company revenue multiplier", () => {
    let s = gameWithUnit();
    const before = companyRevenueMult(s);
    s = actSetExec(s, "cmo", true);
    expect(companyRevenueMult(s)).toBeCloseTo(before * EXECUTIVES.cmo.revenueMult, 6);
  });

  it("execs cost their salary each week", () => {
    let s = gameWithUnit();
    s = actSetExec(s, "president", true);
    const cashBefore = s.cash;
    s = advanceWeek(s);
    // No open units yet, so the only flows are overhead + the president salary.
    expect(s.cash).toBeLessThan(cashBefore);
  });
});

describe("C-suite meetings", () => {
  it("a scheduled meeting resolves to a weighted outcome and clears", () => {
    let s = gameWithUnit();
    s = actSetExec(s, "cmo", true);
    // Force a pending meeting.
    s.pendingMeeting = { meetingId: "supplier", week: s.week };
    const repBefore = s.reputation;
    s = actResolveMeeting(s, 0);
    expect(s.pendingMeeting).toBeNull();
    // Either a buff was applied or reputation moved — state changed somehow.
    const changed = s.activeBuffs.length > 0 || s.reputation !== repBefore;
    expect(changed).toBe(true);
  });
});

describe("pro-CEO lifecycle + autonomy", () => {
  it("hiring a CEO moves the founder to a board role and starts the golden phase", () => {
    let s = gameWithUnit();
    s = actHireCeo(s);
    expect(s.executives.proCeo.hired).toBe(true);
    expect(s.executives.proCeo.phase).toBe("golden");
    expect(s.executives.founderRole).toBe("chairman");
  });

  it("the CEO autonomously expands toward goals each quarter without approval", () => {
    let s = gameWithUnit();
    s = actHireCeo(s);
    s = actSetCeoGoals(s, { newLocationsPerBrand: 2, growChains: 0, newBrands: 0 });
    const before = s.locations.length;
    // Run a full quarter so the build cycle fires.
    for (let i = 0; i < CEO.buildCycleWeeks; i++) s = advanceWeek(s);
    expect(s.locations.length).toBeGreaterThan(before);
    expect(s.executives.proCeo.pendingSitDown).toBe(true);
  });

  it("the sit-down: approve eases pressure, push harder raises it", () => {
    let s = gameWithUnit();
    s = actHireCeo(s);
    s = actSetCeoGoals(s, { newLocationsPerBrand: 1, growChains: 0, newBrands: 0 });
    for (let i = 0; i < CEO.buildCycleWeeks; i++) s = advanceWeek(s);

    const pressure = s.executives.proCeo.pressure;
    const approved = actCeoSitDown(s, "approve");
    expect(approved.executives.proCeo.pressure).toBeLessThan(pressure);

    // Re-trigger a sit-down and push harder this time.
    let s2 = s;
    const pushed = actCeoSitDown(s2, "pushHarder");
    expect(pushed.executives.proCeo.pressure).toBeGreaterThan(pressure);
    expect(pushed.executives.proCeo.goals.newLocationsPerBrand).toBeGreaterThan(1);
  });

  it("phase degrades to failing under sustained high pressure", () => {
    let s = gameWithUnit();
    s = actHireCeo(s);
    s.executives.proCeo.pressure = CEO.failingPressure + 1;
    s = advanceWeek(s);
    expect(s.executives.proCeo.phase).toBe("failing");
  });

  it("CEO autonomy keeps the game deterministic", () => {
    const run = () => {
      let s = gameWithUnit(42);
      s = actHireCeo(s);
      s = actSetCeoGoals(s, { newLocationsPerBrand: 2, growChains: 0, newBrands: 0 });
      for (let i = 0; i < 40; i++) s = advanceWeek(s);
      return JSON.stringify(s);
    };
    expect(run()).toEqual(run());
  });
});
