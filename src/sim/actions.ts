/**
 * Player actions. Every action is a pure function (state, payload) => newState:
 * it clones the input, applies the change, and returns the new state. The UI
 * dispatches actions and re-renders from the result; it never mutates state.
 *
 * Actions that cost money are gated by available funds (Invariant 8.3).
 */

import {
  EXPANSION,
  NR_UPGRADE,
  PRICE_TIERS,
  UPGRADES,
  type Positioning,
  type StaffRole,
  type UpgradeKind,
} from "../data/index";
import { createBrand, findBrand, type BrandSpec } from "./brands";
import { buildCost, createLocation, landBuyoutPrice, type SiteSpec } from "./locations";
import { openExpansionUnits } from "./expansion";
import { createNrLocation, goFullyDigital, nrBuildCost } from "./investments";
import {
  acquireBigGroup,
  acquireCompetitor,
  renovateUnit,
  scaleGroupDivision,
} from "./acquisitions";
import {
  acceptPeOffer,
  ceoSitDown,
  hireCeo,
  resolveMeeting,
  setCeoGoals,
  setExec,
} from "./executives";
import {
  affair,
  buyLadder,
  buyLuxury,
  depositSavings,
  exitVenture,
  fundVenture,
  haveKid,
  marry,
  ownerDraw,
  sellLuxury,
  sendToCollege,
  setSalary,
  startDating,
  vegas,
  withdrawSavings,
} from "./life";
import { resolveComplication } from "./events";
import { type ExecRole } from "../data/index";
import { buyoutPriceFromLease } from "./realestate";
import { Rng } from "./rng";
import { cloneState, log } from "./util";
import type { GameState } from "./state";

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

export interface BulkOpenPayload {
  brandId: string;
  count: number;
  buyLand?: boolean;
}

/**
 * Open N locations of one of your own brands at once (presets +3/+5/+10/MAX or
 * a custom amount). Reuses the proposal builder; honors buy-and-own; respects
 * the cash reserve; triggers overextension past management capacity.
 */
export function actBulkOpen(input: GameState, payload: BulkOpenPayload): GameState {
  const state = cloneState(input);
  const rng = Rng.fromState(state.rngState);
  const count = Math.max(0, Math.min(Math.floor(payload.count), EXPANSION.maxBulkOpen));
  openExpansionUnits(state, payload.brandId, count, { buyLand: payload.buyLand, rng });
  // Persist RNG advancement so the game stays deterministic.
  state.rngState = rng.toState();
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

/** Open a physical non-restaurant unit for a non-restaurant brand. */
export function actOpenNonRestaurant(
  input: GameState,
  payload: { brandId: string; cityId: string; buyLand?: boolean },
): GameState {
  const state = cloneState(input);
  const brand = findBrand(state, payload.brandId);
  if (brand.vertical === "restaurant" || brand.vertical === "group") {
    throw new ActionError("Brand is not a physical non-restaurant vertical");
  }
  const cost = nrBuildCost(brand.vertical, payload.cityId);
  if (state.cash < cost) throw new ActionError(`Insufficient funds: need ${cost}, have ${state.cash}`);
  state.cash -= cost;
  const loc = createNrLocation(state, brand, payload.cityId, payload.buyLand ?? false);
  state.locations.push(loc);
  state.expansionPlan.locationsOpenedThisYear += 1;
  log(state, "expansion", `Opening ${brand.name} (${brand.vertical}) in ${payload.cityId}.`);
  return state;
}

/** Buy one level of a non-restaurant investment (sourcing or brand). */
export function actBuyNrUpgrade(
  input: GameState,
  locId: string,
  kind: "sourcing" | "brand",
): GameState {
  const state = cloneState(input);
  const loc = state.locations.find((l) => l.id === locId);
  if (!loc) throw new ActionError(`Unknown location: ${locId}`);
  const level = loc.nrUpgrades[kind];
  if (level >= NR_UPGRADE.maxLevel) throw new ActionError(`${kind} already maxed`);
  const base = kind === "sourcing" ? NR_UPGRADE.sourcingBaseCost : NR_UPGRADE.brandBaseCost;
  const cost = Math.round(base * Math.pow(NR_UPGRADE.costGrowth, level));
  if (state.cash < cost) throw new ActionError(`Insufficient funds for ${kind}: need ${cost}, have ${state.cash}`);
  state.cash -= cost;
  loc.nrUpgrades[kind] = level + 1;
  log(state, "investment", `${kind} investment raised to level ${level + 1}.`);
  return state;
}

/** Convert a physical apparel brand into a single global DTC storefront. */
export function actGoFullyDigital(input: GameState, brandId: string): GameState {
  const state = cloneState(input);
  const brand = findBrand(state, brandId);
  const result = goFullyDigital(state, brand);
  log(
    state,
    "digital",
    `${brand.name} went fully digital: liquidated stores for ${result.liquidationProceeds}.`,
  );
  return state;
}

/** Acquire a big group as an aggregate division unit. */
export function actAcquireBigGroup(input: GameState, offerId: string): GameState {
  const state = cloneState(input);
  try {
    acquireBigGroup(state, offerId);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  return state;
}

/** Scale a group division by building out more stores. */
export function actScaleGroupDivision(input: GameState, locId: string, addStores: number): GameState {
  const state = cloneState(input);
  try {
    scaleGroupDivision(state, locId, addStores);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  return state;
}

/** Acquire a competitor chain (units arrive needing renovation). */
export function actAcquireCompetitor(input: GameState, offerId: string): GameState {
  const state = cloneState(input);
  try {
    acquireCompetitor(state, offerId);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  return state;
}

/** Renovate an acquired unit into one of your own brands. */
export function actRenovateUnit(input: GameState, locId: string, targetBrandId: string): GameState {
  const state = cloneState(input);
  try {
    renovateUnit(state, locId, targetBrandId);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  return state;
}

/** Hire or release a C-suite executive (president/cmo/cfo/coo). */
export function actSetExec(input: GameState, role: ExecRole, hired: boolean): GameState {
  const state = cloneState(input);
  setExec(state, role, hired);
  return state;
}

/** Resolve a pending C-suite meeting by choosing an option. */
export function actResolveMeeting(input: GameState, optionIndex: number): GameState {
  const state = cloneState(input);
  const rng = Rng.fromState(state.rngState);
  try {
    resolveMeeting(state, optionIndex, rng);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  state.rngState = rng.toState();
  return state;
}

/** Hire a professional CEO and step up to a board role. */
export function actHireCeo(input: GameState): GameState {
  const state = cloneState(input);
  hireCeo(state);
  return state;
}

/** Set the CEO's autonomous expansion goals. */
export function actSetCeoGoals(
  input: GameState,
  goals: { newLocationsPerBrand: number; growChains: number; newBrands: number },
): GameState {
  const state = cloneState(input);
  setCeoGoals(state, goals);
  return state;
}

/** The quarterly CEO sit-down: approve eases pressure, push harder raises it. */
export function actCeoSitDown(input: GameState, decision: "approve" | "pushHarder"): GameState {
  const state = cloneState(input);
  const rng = Rng.fromState(state.rngState);
  try {
    ceoSitDown(state, decision, rng);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  state.rngState = rng.toState();
  return state;
}

/** Accept a PE buyout offer for one of your brands. */
export function actAcceptPeOffer(input: GameState, offerId: string): GameState {
  const state = cloneState(input);
  try {
    acceptPeOffer(state, offerId);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  return state;
}

/** Resolve a pending complication by paying its cost. */
export function actResolveComplication(input: GameState, complicationId: string): GameState {
  const state = cloneState(input);
  try {
    resolveComplication(state, complicationId);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Life simulator actions
// ---------------------------------------------------------------------------

/** Wrap a life mutation that may need the RNG and persist RNG state. */
function lifeRngAction(input: GameState, fn: (s: GameState, rng: Rng) => void): GameState {
  const state = cloneState(input);
  const rng = Rng.fromState(state.rngState);
  try {
    fn(state, rng);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  state.rngState = rng.toState();
  return state;
}

/** Wrap a deterministic life mutation. */
function lifeAction(input: GameState, fn: (s: GameState) => void): GameState {
  const state = cloneState(input);
  try {
    fn(state);
  } catch (e) {
    throw new ActionError((e as Error).message);
  }
  return state;
}

export const actOwnerDraw = (s: GameState, amount: number) => lifeAction(s, (st) => ownerDraw(st, amount));
export const actSetSalary = (s: GameState, salary: number) => lifeAction(s, (st) => setSalary(st, salary));
export const actDeposit = (s: GameState, amount: number) => lifeAction(s, (st) => depositSavings(st, amount));
export const actWithdraw = (s: GameState, amount: number) => lifeAction(s, (st) => withdrawSavings(st, amount));
export const actBuyHome = (s: GameState, id: string) => lifeAction(s, (st) => buyLadder(st, "home", id));
export const actBuyCar = (s: GameState, id: string) => lifeAction(s, (st) => buyLadder(st, "car", id));
export const actBuyLuxury = (s: GameState, id: string) => lifeAction(s, (st) => buyLuxury(st, id));
export const actSellLuxury = (s: GameState, id: string) => lifeAction(s, (st) => sellLuxury(st, id));
export const actStartDating = (s: GameState, name: string) => lifeAction(s, (st) => startDating(st, name));
export const actMarry = (s: GameState) => lifeAction(s, (st) => marry(st));
export const actHaveKid = (s: GameState, name: string) => lifeAction(s, (st) => haveKid(st, name));
export const actSendToCollege = (s: GameState, kidId: string) => lifeAction(s, (st) => sendToCollege(st, kidId));
export const actFundVenture = (s: GameState, kidId: string) => lifeRngAction(s, (st, rng) => fundVenture(st, kidId, rng));
export const actExitVenture = (s: GameState, kidId: string) => lifeRngAction(s, (st, rng) => exitVenture(st, kidId, rng));
export const actAffair = (s: GameState) => lifeRngAction(s, (st, rng) => affair(st, rng));
export const actVegas = (s: GameState) => lifeRngAction(s, (st, rng) => vegas(st, rng));

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
