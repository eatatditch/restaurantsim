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
