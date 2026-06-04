/**
 * Expansion: the shared proposal builder, management-bandwidth capacity, and
 * the overextension mechanic (the core Goldratt bottleneck).
 *
 * The same proposal builder serves the player's single open, the player's bulk
 * open, and (Phase 7) the pro-CEO's autonomous expansion. Opening past your
 * management capacity in a year produces rushed openings (low starting
 * maturity) and a company-wide strain window.
 */

import { CITY_MARKETS, EXPANSION, LOCATION_SETTINGS } from "../data/index.ts";
import { findBrand } from "./brands.ts";
import { buildCost, createLocation, landBuyoutPrice, type SiteSpec } from "./locations.ts";
import { Rng } from "./rng.ts";
import { log } from "./util.ts";
import type { Brand, GameState } from "./state.ts";

/**
 * Management bandwidth: how many locations can be opened per year before
 * overextension. Each executive raises capacity.
 */
export function managementCapacity(state: GameState): number {
  const ex = state.executives;
  const execCount =
    Number(ex.president) +
    Number(ex.cmo) +
    Number(ex.cfo) +
    Number(ex.coo) +
    Number(ex.facilities) +
    Number(ex.proCeo.hired);
  return EXPANSION.baseCapacity + EXPANSION.capacityPerExec * execCount;
}

/**
 * Build a site proposal for a brand: choose a city (weighted by demand), a
 * setting, traffic tier, and financing. Deterministic given the RNG.
 */
export function buildExpansionProposal(
  state: GameState,
  _brand: Brand,
  rng: Rng,
): SiteSpec {
  const cities = CITY_MARKETS;
  const city = rng.weightedPick(
    cities,
    cities.map((c) => c.demandMult * c.growth),
  );
  const setting = rng.pick(LOCATION_SETTINGS);
  const trafficTier = rng.weightedPick(["low", "medium", "high"] as const, [2, 5, 3]);
  const leaseTermId = state.ownRealEstatePolicy ? null : "standard";
  return { cityId: city.id, settingId: setting.id, trafficTier, leaseTermId };
}

/** Total cost to open a proposed site (build + optional land). */
export function proposalCost(brand: Brand, site: SiteSpec, buyLand: boolean): number {
  const wantsOwn = buyLand || site.leaseTermId === null;
  const land = wantsOwn ? landBuyoutPrice(brand, { ...site, leaseTermId: null }) : 0;
  return buildCost(site) + land;
}

export interface BulkOpenResult {
  opened: number;
  rushed: number;
  spent: number;
  overextended: boolean;
}

/**
 * Open up to `count` new units of a brand, reusing the proposal builder for
 * each site. Honors the buy-and-own policy, keeps a cash reserve, and triggers
 * overextension once openings exceed management capacity for the year.
 *
 * Mutates the passed-in draft state. Returns a summary.
 */
export function openExpansionUnits(
  state: GameState,
  brandId: string,
  count: number,
  opts: { buyLand?: boolean; rng: Rng },
): BulkOpenResult {
  const brand = findBrand(state, brandId);
  const capacity = managementCapacity(state);

  let opened = 0;
  let rushed = 0;
  let spent = 0;
  let overextended = false;

  for (let i = 0; i < count; i++) {
    const site = buildExpansionProposal(state, brand, opts.rng);
    const wantsOwn = opts.buyLand || state.ownRealEstatePolicy;
    const financedSite: SiteSpec = wantsOwn ? { ...site, leaseTermId: null } : site;
    const cost = proposalCost(brand, financedSite, wantsOwn);

    // Respect the cash reserve (Invariant 8.3).
    if (state.cash - cost < EXPANSION.cashReserve) break;

    state.cash -= cost;
    spent += cost;
    state.expansionPlan.locationsOpenedThisYear += 1;

    // Past capacity => rushed opening with depressed starting maturity.
    const isRushed = state.expansionPlan.locationsOpenedThisYear > capacity;
    const loc = createLocation(state, brand, financedSite, isRushed);
    state.locations.push(loc);
    opened += 1;
    if (isRushed) {
      rushed += 1;
      overextended = true;
    }
  }

  if (overextended) {
    // Open a company-wide strain window (revenue drag in advanceWeek).
    state.expansionPlan.overextensionWeeks = EXPANSION.strainWeeks;
    log(state, "expansion", `Overextended: ${rushed} rushed opening(s); company strained.`);
  }
  log(state, "expansion", `Bulk-opened ${opened} ${brand.name} unit(s).`);
  return { opened, rushed, spent, overextended };
}

/** How many units a MAX bulk-open could afford right now (capped). */
export function maxAffordableOpen(state: GameState, brandId: string): number {
  const brand = findBrand(state, brandId);
  // Estimate with a medium downtown lease as a representative cost.
  const sample: SiteSpec = {
    cityId: "shoreline",
    settingId: "downtown",
    trafficTier: "medium",
    leaseTermId: state.ownRealEstatePolicy ? null : "standard",
  };
  const each = proposalCost(brand, sample, state.ownRealEstatePolicy);
  if (each <= 0) return 0;
  const budget = Math.max(0, state.cash - EXPANSION.cashReserve);
  return Math.min(EXPANSION.maxBulkOpen, Math.floor(budget / each));
}
