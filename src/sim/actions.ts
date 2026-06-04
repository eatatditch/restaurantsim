/**
 * Player actions. Every action is a pure function (state, payload) => newState:
 * it clones the input, applies the change, and returns the new state. The UI
 * dispatches actions and re-renders from the result; it never mutates state.
 *
 * Actions that cost money are gated by available funds (Invariant 8.3).
 */

import {
  PRICE_TIERS,
  UPGRADES,
  type Positioning,
  type StaffRole,
  type UpgradeKind,
} from "../data/index.ts";
import { createBrand, findBrand, type BrandSpec } from "./brands.ts";
import { buildCost, createLocation, landBuyoutPrice, type SiteSpec } from "./locations.ts";
import { buyoutPriceFromLease } from "./realestate.ts";
import { cloneState, log } from "./util.ts";
import type { GameState } from "./state.ts";

export class ActionError extends Error {}

/** Create a new brand (first brand at game start, or a branched brand later). */
export function actCreateBrand(input: GameState, spec: BrandSpec): GameState {
  const state = cloneState(input);
  const brand = createBrand(state, spec);
  state.brands.push(brand);
  log(state, "brand", `Launched brand "${brand.name}".`);
  return state;
}

export interface OpenLocationPayload {
  brandId: string;
  site: SiteSpec;
  /** If true, buy the building outright (subject to ownRealEstatePolicy too). */
  buyLand?: boolean;
}

/** Open a single location for one of the player's brands. */
export function actOpenLocation(input: GameState, payload: OpenLocationPayload): GameState {
  const state = cloneState(input);
  const brand = findBrand(state, payload.brandId);

  const wantsOwn = payload.buyLand || state.ownRealEstatePolicy;
  const site: SiteSpec = wantsOwn ? { ...payload.site, leaseTermId: null } : payload.site;

  const construction = buildCost(site);
  const land = wantsOwn ? landBuyoutPrice(brand, site) : 0;
  const cost = construction + land;

  if (state.cash < cost) {
    throw new ActionError(`Insufficient funds: need ${cost}, have ${state.cash}`);
  }

  state.cash -= cost;
  const loc = createLocation(state, brand, site);
  state.locations.push(loc);
  state.expansionPlan.locationsOpenedThisYear += 1;

  log(state, "expansion", `Opening ${brand.name} in ${site.cityId} (${site.trafficTier}).`);
  return state;
}

/** Set a staff count for a role at a location. */
export function actSetStaff(
  input: GameState,
  locId: string,
  role: StaffRole,
  count: number,
): GameState {
  const state = cloneState(input);
  const loc = state.locations.find((l) => l.id === locId);
  if (!loc) throw new ActionError(`Unknown location: ${locId}`);
  loc.staff[role] = Math.max(0, Math.floor(count));
  return state;
}

/** Buy one level of an upgrade at a location. */
export function actBuyUpgrade(input: GameState, locId: string, kind: UpgradeKind): GameState {
  const state = cloneState(input);
  const loc = state.locations.find((l) => l.id === locId);
  if (!loc) throw new ActionError(`Unknown location: ${locId}`);

  const def = UPGRADES[kind];
  const level = loc.upgrades[kind];
  if (level >= def.maxLevel) throw new ActionError(`${kind} already maxed`);

  const cost = Math.round(def.baseCost * Math.pow(def.costGrowth, level));
  if (state.cash < cost) {
    throw new ActionError(`Insufficient funds for ${kind}: need ${cost}, have ${state.cash}`);
  }
  state.cash -= cost;
  loc.upgrades[kind] = level + 1;
  log(state, "upgrade", `Upgraded ${kind} to level ${level + 1}.`);
  return state;
}

/** Toggle the company-wide Buy & Own real estate policy. */
export function actSetOwnPolicy(input: GameState, on: boolean): GameState {
  const state = cloneState(input);
  state.ownRealEstatePolicy = on;
  log(state, "facilities", `Buy & Own policy ${on ? "enabled" : "disabled"}.`);
  return state;
}

/** Hire (or fire) the Facilities Manager who executes the ownership mandate. */
export function actSetFacilities(input: GameState, hired: boolean): GameState {
  const state = cloneState(input);
  state.executives.facilities = hired;
  log(state, "facilities", hired ? "Hired a Facilities Manager." : "Let the Facilities Manager go.");
  return state;
}

/** Buy the building for a single leased unit now (company cash). */
export function actBuyLand(input: GameState, locId: string): GameState {
  const state = cloneState(input);
  const loc = state.locations.find((l) => l.id === locId);
  if (!loc) throw new ActionError(`Unknown location: ${locId}`);
  if (!loc.lease) throw new ActionError("Unit already owned");
  const price = buyoutPriceFromLease(loc);
  if (state.cash < price) throw new ActionError(`Insufficient funds: need ${price}, have ${state.cash}`);
  state.cash -= price;
  loc.lease = null;
  loc.fmFlagged = false;
  log(state, "facilities", `Bought building at ${loc.cityId}.`);
  return state;
}

/**
 * One-shot: buy every leased building immediately. Company cash first, then
 * personal funds; anything still unaffordable is flagged for the FM to finish.
 */
export function actBuyOutAllLeases(input: GameState): GameState {
  const state = cloneState(input);
  let bought = 0;
  let flagged = 0;
  for (const loc of state.locations) {
    if (!loc.lease) continue;
    const price = buyoutPriceFromLease(loc);
    if (state.cash >= price) {
      state.cash -= price;
      loc.lease = null;
      loc.fmFlagged = false;
      bought += 1;
    } else if (state.cash + state.personal.cash >= price) {
      const fromPersonal = price - state.cash;
      state.personal.cash -= fromPersonal;
      state.cash = 0;
      loc.lease = null;
      loc.fmFlagged = false;
      bought += 1;
    } else {
      loc.fmFlagged = true;
      flagged += 1;
    }
  }
  log(state, "facilities", `Buy-out-all: bought ${bought}, flagged ${flagged} for the FM.`);
  return state;
}

/**
 * Set a brand's price positioning. Propagates to every unit of the brand in
 * the same tick (Invariant 8.6) — units read positioning off the brand, so a
 * single field update is the propagation.
 */
export function actSetPositioning(
  input: GameState,
  brandId: string,
  positioning: Positioning,
): GameState {
  const state = cloneState(input);
  const brand = findBrand(state, brandId);
  brand.positioning = positioning;
  log(state, "brand", `${brand.name} repositioned to ${PRICE_TIERS[positioning].name}.`);
  return state;
}
