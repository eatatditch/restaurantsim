/**
 * advanceWeek: the master weekly tick. Orchestrates one simulated week as an
 * ordered pipeline of pure steps, then commits. Returns a NEW state; the input
 * is never mutated (the UI re-renders from the return value).
 *
 * Order (Section 5): market maturity ramp -> per-unit P&L -> company overhead
 * / exec costs / loan interest -> lease escalations + FM sweep -> personal tick
 * -> events/complications -> CEO autonomy -> achievements/goals -> commit.
 *
 * Later phases fill in the currently-stubbed steps; the ordering is fixed now.
 */

import {
  CITY_MARKETS,
  COMPANY,
  DIFFICULTIES,
  EXPANSION,
  FACILITIES,
  PRICE_TIERS,
  UPGRADE_EFFECTS,
} from "../data/index";
import {
  companyOverheadMult,
  companyRevenueMult,
  execSalaries,
  maybeScheduleMeeting,
  tickBuffs,
  tickCeo,
} from "./executives";
import {
  ownershipSweep,
  processLeaseEscalations,
  processLeaseExpiries,
} from "./realestate";
import { tickAcquisitions } from "./acquisitions";
import { applyFinancing } from "./finance";
import { happinessMult, personalNetWorth, tickPersonal } from "./life";
import { seasonForWeek, tickEvents } from "./events";
import { findBrand } from "./brands";
import {
  calculateNonRestaurantPL,
  calculateRestaurantPL,
  neutralModifiers,
  rampMaturity,
  type PLModifiers,
} from "./economy";
import { tickLifecycle } from "./locations";
import { Rng } from "./rng";
import { cloneState, log } from "./util";
import type { GameState, Location } from "./state";

const WEEKS_PER_YEAR = 52;

export function advanceWeek(input: GameState): GameState {
  const state = cloneState(input);
  const rng = Rng.fromState(state.rngState);

  // 1. Lifecycle: finish builds that complete this week.
  for (const loc of state.locations) tickLifecycle(state, loc);

  // 2. Market maturity ramp (open units only).
  for (const loc of state.locations) {
    if (loc.status !== "open") continue;
    const city = CITY_MARKETS.find((c) => c.id === loc.cityId);
    const growth = (city?.growth ?? 1) * DIFFICULTIES[state.difficulty].rampMult;
    loc.maturity = rampMaturity(loc, state.reputation, growth);
  }

  // 3. Per-unit P&L -> company cash.
  let weeklyNet = 0;
  for (const loc of state.locations) {
    if (loc.status !== "open") {
      loc.lastNet = 0;
      loc.lastRevenue = 0;
      loc.lastRent = 0;
      continue;
    }
    const brand = findBrand(state, loc.brandId);
    const city = CITY_MARKETS.find((c) => c.id === loc.cityId);
    const mods = modifiersFor(state);

    const pl =
      loc.vertical === "restaurant"
        ? calculateRestaurantPL(loc, brand, city?.demandMult ?? 1, state.week, mods, rng)
        : calculateNonRestaurantPL(loc, state.week, mods, rng);
    loc.lastNet = pl.net;
    loc.lastRevenue = pl.revenue;
    loc.lastRent = pl.rent;
    weeklyNet += pl.net;
  }

  // 4. Company overhead (exec-reduced) + executive salaries.
  const openUnits = state.locations.filter((l) => l.status === "open").length;
  const overhead =
    (COMPANY.weeklyOverheadBase + COMPANY.weeklyOverheadPerUnit * openUnits) *
    companyOverheadMult(state) *
    DIFFICULTIES[state.difficulty].overheadMult;
  weeklyNet -= overhead;
  weeklyNet -= execSalaries(state);
  if (state.executives.facilities) {
    weeklyNet -= FACILITIES.weeklySalary;
  }

  // Financing: loan interest (cost) + investor dividend on positive net.
  weeklyNet = applyFinancing(state, weeklyNet);

  state.cash += weeklyNet;

  // 5. Lease escalations + expiries + FM ownership sweep.
  processLeaseEscalations(state);
  processLeaseExpiries(state);
  ownershipSweep(state);

  // 6. Personal tick (money, upkeep, happiness, burnout).
  tickPersonal(state);

  // 7. Events / complications + acquisitions market + C-suite meetings.
  tickAcquisitions(state, rng);
  tickBuffs(state);
  maybeScheduleMeeting(state, rng);
  tickEvents(state, rng);

  // 8. CEO autonomy tick (quarterly builds, lifecycle, sit-downs, PE offers).
  tickCeo(state, rng);

  // 9. Reputation drifts toward the portfolio's quality.
  state.reputation = updateReputation(state);

  // 10. Commit: advance the clock, roll the year, persist RNG.
  state.week += 1;
  if ((state.week - 1) % WEEKS_PER_YEAR === 0) {
    state.expansionPlan.locationsOpenedThisYear = 0;
  }
  if (state.expansionPlan.overextensionWeeks > 0) {
    state.expansionPlan.overextensionWeeks -= 1;
  }
  state.rngState = rng.toState();

  if (weeklyNet !== 0) {
    log(state, "pl", `Week ${state.week - 1}: net ${fmt(weeklyNet)} · cash ${fmt(state.cash)}`);
  }

  recordHistory(state);
  return state;
}

/** Append a weekly snapshot for the stats/history charts (bounded). */
function recordHistory(state: GameState): void {
  const open = state.locations.filter((l) => l.status === "open");
  const margins = open.map((l) => (l.lastRevenue > 0 ? l.lastNet / l.lastRevenue : 0));
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
  state.history.push({
    week: state.week,
    netWorth: Math.round(state.cash + personalNetWorth(state)),
    cash: Math.round(state.cash),
    reputation: Math.round(state.reputation * 10) / 10,
    units: open.length,
    avgMargin: Math.round(avgMargin * 10000) / 10000,
  });
  if (state.history.length > 1040) state.history.splice(0, state.history.length - 1040);
}

/** Company-wide P&L modifiers assembled from current state (mostly neutral). */
function modifiersFor(state: GameState): PLModifiers {
  const mods = neutralModifiers();
  // Executive layer, CEO phase, and active buffs fold into the revenue mult.
  mods.execRevenueMult = companyRevenueMult(state);
  // The owner's happiness feeds restaurant customer counts (life<->business).
  mods.happinessMult = happinessMult(state);
  // Difficulty global demand multiplier (normal = 1).
  mods.brandMult *= DIFFICULTIES[state.difficulty].demandMult;
  // Seasonality and any active disasters.
  mods.seasonMult = seasonForWeek(state.week).revMult;
  for (const d of state.activeDisasters) mods.disasterMult *= d.revMult;
  // Overextension drags revenue while the strain window is open.
  if (state.expansionPlan.overextensionWeeks > 0) {
    mods.overextensionMult = EXPANSION.overextensionRevenueDrag > 0
      ? 1 - EXPANSION.overextensionRevenueDrag
      : 0.88;
  }
  return mods;
}

/** Quality score (0..100) for a single open unit. */
function unitQuality(state: GameState, loc: Location): number {
  const brand = findBrand(state, loc.brandId);
  const tier = PRICE_TIERS[brand.positioning];
  const decorRep = UPGRADE_EFFECTS.decorRep[loc.upgrades.decor] ?? 1;
  const base = 50;
  return clamp(
    base + (decorRep - 1) * 120 + (tier.repMult - 1) * 120 + (loc.maturity - 1) * 25,
    0,
    100,
  );
}

function updateReputation(state: GameState): number {
  const open = state.locations.filter((l) => l.status === "open");
  if (open.length === 0) return state.reputation;
  let sum = 0;
  for (const loc of open) sum += unitQuality(state, loc);
  const target = sum / open.length;
  // Reputation is sticky: move 12% toward the portfolio target each week.
  return clamp(state.reputation + (target - state.reputation) * 0.12, 0, 100);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
