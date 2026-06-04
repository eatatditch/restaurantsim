/**
 * Real estate: leases vs owned, annual escalations, and the Facilities Manager
 * who executes the buy-and-own mandate.
 *
 * Leased units pay rent (capped to occupancy in economy.ts). Owned units pay
 * only an operating cost. The FM:
 *  - buys a building automatically at lease expiry (no approval),
 *  - signs a short bridge lease + flags the unit if cash is tight,
 *  - runs a weekly ownership sweep converting the leased footprint to owned
 *    (up to a per-week cap), always preserving a cash reserve.
 *
 * All functions mutate the passed-in draft state (called inside advanceWeek,
 * which already cloned). The one-shot buy-out-all is exposed as an action.
 */

import { FACILITIES, LAND_BUYOUT_RENT_MULTIPLE } from "../data/index.ts";
import { log } from "./util.ts";
import type { GameState, Location } from "./state.ts";

/** Buyout price to own a leased building, from its current rent. */
export function buyoutPriceFromLease(loc: Location): number {
  if (!loc.lease) return 0;
  return Math.round(loc.lease.weeklyRent * 52 * LAND_BUYOUT_RENT_MULTIPLE);
}

/** Convert a leased unit to owned, charging the company. Returns success. */
export function convertToOwned(state: GameState, loc: Location, reserve: number): boolean {
  if (!loc.lease) return false;
  const price = buyoutPriceFromLease(loc);
  if (state.cash - price < reserve) return false;
  state.cash -= price;
  loc.lease = null;
  loc.fmFlagged = false;
  return true;
}

/**
 * Apply annual rent escalations: at each lease anniversary the weekly rent
 * grows by the lease's escalation rate.
 */
export function processLeaseEscalations(state: GameState): void {
  for (const loc of state.locations) {
    if (!loc.lease) continue;
    const elapsed = state.week - loc.lease.startedWeek;
    if (elapsed > 0 && elapsed % 52 === 0) {
      loc.lease.weeklyRent = Math.round(loc.lease.weeklyRent * (1 + loc.lease.escalation));
    }
  }
}

/**
 * Handle lease expiries. With the Facilities Manager hired and the buy-and-own
 * policy on, an expiring lease is bought outright; if cash is tight the FM
 * signs a short bridge lease and flags the unit for later conversion.
 */
export function processLeaseExpiries(state: GameState): void {
  if (!state.executives.facilities) return;
  for (const loc of state.locations) {
    if (!loc.lease || loc.status !== "open") continue;
    const elapsed = state.week - loc.lease.startedWeek;
    if (elapsed < loc.lease.termWeeks) continue;

    if (state.ownRealEstatePolicy && convertToOwned(state, loc, FACILITIES.cashReserve)) {
      log(state, "facilities", `Bought building at ${loc.cityId} on lease expiry.`);
    } else {
      // Sign a short bridge lease and flag for the FM to finish later.
      loc.lease.startedWeek = state.week;
      loc.lease.termWeeks = FACILITIES.bridgeLeaseWeeks;
      loc.fmFlagged = true;
      log(state, "facilities", `Signed a bridge lease at ${loc.cityId}; flagged to own.`);
    }
  }
}

/**
 * Proactive weekly ownership sweep: convert up to maxConvertsPerWeek leased
 * units to owned, prioritizing flagged units, always keeping the cash reserve.
 * Only runs when the FM is hired and the buy-and-own policy is on.
 */
export function ownershipSweep(state: GameState): void {
  if (!state.executives.facilities || !state.ownRealEstatePolicy) return;

  const leased = state.locations
    .filter((l) => l.lease && l.status === "open")
    .sort((a, b) => Number(b.fmFlagged) - Number(a.fmFlagged));

  let converted = 0;
  for (const loc of leased) {
    if (converted >= FACILITIES.maxConvertsPerWeek) break;
    if (convertToOwned(state, loc, FACILITIES.cashReserve)) {
      converted += 1;
      log(state, "facilities", `Ownership sweep: bought ${loc.cityId}.`);
    }
  }
}
