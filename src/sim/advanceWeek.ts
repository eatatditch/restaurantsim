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
  FACILITIES,
  PRICE_TIERS,
  UPGRADE_EFFECTS,
} from "../data/index.ts";
import {
  ownershipSweep,
  processLeaseEscalations,
  processLeaseExpiries,
} from "./realestate.ts";
import { findBrand } from "./brands.ts";
import {
  calculateNonRestaurantPL,
  calculateRestaurantPL,
  neutralModifiers,
  rampMaturity,
  type PLModifiers,
} from "./economy.ts";
import { tickLifecycle } from "./locations.ts";
import { Rng } from "./rng.ts";
import { cloneState, log } from "./util.ts";
import type { GameState, Location } from "./state.ts";

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
    const growth = city?.growth ?? 1;
    loc.maturity = rampMaturity(loc, state.reputation, growth);
  }

  // 3. Per-unit P&L -> company cash.
  let weeklyNet = 0;
  for (const loc of state.locations) {
    if (loc.status !== "open") {
      loc.lastNet = 0;
      loc.lastRevenue = 0;
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
    weeklyNet += pl.net;
  }

  // 4. Company overhead (exec salaries / loan interest arrive in Phase 7).
  const openUnits = state.locations.filter((l) => l.status === "open").length;
  const overhead = COMPANY.weeklyOverheadBase + COMPANY.weeklyOverheadPerUnit * openUnits;
  weeklyNet -= overhead;

  // Facilities Manager salary (other exec salaries arrive in Phase 7).
  if (state.executives.facilities) {
    weeklyNet -= FACILITIES.weeklySalary;
  }

  state.cash += weeklyNet;

  // 5. Lease escalations + expiries + FM ownership sweep.
  processLeaseEscalations(state);
  processLeaseExpiries(state);
  ownershipSweep(state);

  // 6. Personal tick -> Phase 8.
  // 7. Events / complications -> Phase 9.
  // 8. CEO autonomy -> Phase 7.

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
  return state;
}

/** Company-wide P&L modifiers assembled from current state (mostly neutral). */
function modifiersFor(state: GameState): PLModifiers {
  const mods = neutralModifiers();
  // Overextension drags revenue while the strain window is open.
  if (state.expansionPlan.overextensionWeeks > 0) {
    mods.overextensionMult = 0.88;
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
