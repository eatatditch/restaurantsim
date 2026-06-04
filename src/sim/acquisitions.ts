/**
 * Acquisitions: big groups and competitor chains.
 *
 * Big groups (15-130 units) are mega-chains bought as an aggregate "division":
 * one unit of the `group` vertical that runs on aggregate revenue rather than
 * simulating every store. The division scales via per-store buildout.
 *
 * Competitor chains (2-4 units) become an acquired restaurant brand whose units
 * each need renovation; the player flips each into one of their own brands.
 */

import { ACQUISITIONS, GROUP_CATEGORIES, type GroupCategory } from "../data/index.ts";
import { findBrand } from "./brands.ts";
import { Rng } from "./rng.ts";
import { log } from "./util.ts";
import {
  allocId,
  type Brand,
  type CompetitorOffer,
  type GameState,
  type GroupOffer,
  type Location,
} from "./state.ts";

const GROUP_NAME_PARTS = ["Sunrise", "Coastal", "Summit", "Liberty", "Harbor", "Golden", "Metro", "Pacific"];
const COMPETITOR_NAMES = ["Rival Reef", "Dockside Diner", "Gull & Grill", "Anchor Eats", "Pier Provisions"];

function categoryById(id: string): GroupCategory {
  const c = GROUP_CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown group category: ${id}`);
  return c;
}

/** Refresh the acquisitions market with new group and competitor offers. */
export function refreshAcquisitions(state: GameState, rng: Rng): void {
  const groups: GroupOffer[] = [];
  for (let i = 0; i < ACQUISITIONS.groupOfferCount; i++) {
    const cat = rng.pick(GROUP_CATEGORIES);
    const units = rng.int(cat.minUnits, cat.maxUnits);
    // Asking price carries a modest premium over raw per-store price.
    const premium = rng.range(1.05, 1.25);
    groups.push({
      id: allocId(state, "grp"),
      name: `${rng.pick(GROUP_NAME_PARTS)} ${cat.name}`,
      categoryId: cat.id,
      units,
      askingPrice: Math.round(units * cat.pricePerStore * premium),
    });
  }

  const competitors: CompetitorOffer[] = [];
  for (let i = 0; i < ACQUISITIONS.competitorOfferCount; i++) {
    const units = rng.int(ACQUISITIONS.competitorMinUnits, ACQUISITIONS.competitorMaxUnits);
    competitors.push({
      id: allocId(state, "cmp"),
      name: rng.pick(COMPETITOR_NAMES),
      units,
      askingPrice: Math.round(units * ACQUISITIONS.competitorPricePerUnit * rng.range(0.9, 1.1)),
    });
  }

  state.bigGroups = groups;
  state.competitorChains = competitors;
  state.lastAcquisitionRefresh = state.week;
}

/** Weekly hook: refresh the market on the configured cadence. */
export function tickAcquisitions(state: GameState, rng: Rng): void {
  if (
    state.bigGroups.length === 0 ||
    state.week - state.lastAcquisitionRefresh >= ACQUISITIONS.refreshEveryWeeks
  ) {
    refreshAcquisitions(state, rng);
  }
}

/**
 * Buy a big group: creates an acquired `group` brand plus one aggregate
 * division unit whose baseWeeklyRevenue is units x per-store revenue.
 */
export function acquireBigGroup(state: GameState, offerId: string): { brand: Brand; division: Location } {
  const offer = state.bigGroups.find((g) => g.id === offerId);
  if (!offer) throw new Error(`Unknown group offer: ${offerId}`);
  if (state.cash < offer.askingPrice) throw new Error(`Insufficient funds: need ${offer.askingPrice}`);

  const cat = categoryById(offer.categoryId);
  state.cash -= offer.askingPrice;

  const brand: Brand = {
    id: allocId(state, "brand"),
    name: offer.name,
    vertical: "group",
    conceptId: cat.id,
    positioning: "standard",
    acquired: true,
    reputation: 55,
  };
  state.brands.push(brand);

  const division: Location = {
    id: allocId(state, "loc"),
    brandId: brand.id,
    vertical: "group",
    cityId: "shoreline",
    settingId: "standalone",
    trafficTier: "high",
    status: "open",
    opensWeek: state.week,
    openedWeek: state.week,
    maturity: 1.0, // an established chain opens mature
    digital: false,
    lease: null,
    fmFlagged: false,
    staff: { chef: 0, server: 0, bartender: 0, manager: 0 },
    upgrades: { kitchen: 0, decor: 0, marketing: 0 },
    nrUpgrades: { sourcing: 0, brand: 0 },
    baseWeeklyRevenue: cat.weeklyRevenuePerStore,
    storeCount: offer.units,
    nrMarginBoost: 0,
    ceoAdjustNet: 0,
    needsRenovation: false,
    lastNet: 0,
    lastRevenue: 0,
  };
  state.locations.push(division);

  state.bigGroups = state.bigGroups.filter((g) => g.id !== offerId);
  log(state, "acquisition", `Acquired ${brand.name} (${offer.units} stores).`);
  return { brand, division };
}

/**
 * Scale a group division by building out additional stores at the category's
 * per-store buildout cost. Raises storeCount (and thus aggregate revenue).
 */
export function scaleGroupDivision(state: GameState, locId: string, addStores: number): number {
  const loc = state.locations.find((l) => l.id === locId);
  if (!loc || loc.vertical !== "group") throw new Error("Not a group division unit");
  const brand = findBrand(state, loc.brandId);
  const cat = categoryById(brand.conceptId);

  const n = Math.max(0, Math.floor(addStores));
  const cost = n * cat.buildoutPerStore;
  if (state.cash < cost) throw new Error(`Insufficient funds: need ${cost}, have ${state.cash}`);

  state.cash -= cost;
  loc.storeCount += n;
  log(state, "acquisition", `Built out ${n} more ${brand.name} stores (${loc.storeCount} total).`);
  return cost;
}

/**
 * Buy a competitor chain: creates an acquired restaurant brand whose units are
 * open but need renovation before they perform.
 */
export function acquireCompetitor(state: GameState, offerId: string): { brand: Brand; units: Location[] } {
  const offer = state.competitorChains.find((c) => c.id === offerId);
  if (!offer) throw new Error(`Unknown competitor offer: ${offerId}`);
  if (state.cash < offer.askingPrice) throw new Error(`Insufficient funds: need ${offer.askingPrice}`);

  state.cash -= offer.askingPrice;

  const brand: Brand = {
    id: allocId(state, "brand"),
    name: offer.name,
    vertical: "restaurant",
    conceptId: "fastcasual",
    positioning: "standard",
    acquired: true,
    reputation: 42, // run-down; renovation lifts it
  };
  state.brands.push(brand);

  const units: Location[] = [];
  for (let i = 0; i < offer.units; i++) {
    const unit: Location = {
      id: allocId(state, "loc"),
      brandId: brand.id,
      vertical: "restaurant",
      cityId: "shoreline",
      settingId: "downtown",
      trafficTier: "medium",
      status: "open",
      opensWeek: state.week,
      openedWeek: state.week,
      maturity: 0.7,
      digital: false,
      lease: {
        weeklyRent: 9000,
        escalation: 0.03,
        termWeeks: 260,
        startedWeek: state.week,
      },
      fmFlagged: false,
      staff: { chef: 3, server: 6, bartender: 2, manager: 1 },
      upgrades: { kitchen: 0, decor: 0, marketing: 0 },
      nrUpgrades: { sourcing: 0, brand: 0 },
      baseWeeklyRevenue: 0,
      storeCount: 1,
      nrMarginBoost: 0,
      ceoAdjustNet: 0,
      needsRenovation: true,
      lastNet: 0,
      lastRevenue: 0,
    };
    units.push(unit);
    state.locations.push(unit);
  }

  state.competitorChains = state.competitorChains.filter((c) => c.id !== offerId);
  log(state, "acquisition", `Acquired ${brand.name} (${offer.units} units, need renovation).`);
  return { brand, units };
}

/** Renovate an acquired unit, flipping it into one of the player's own brands. */
export function renovateUnit(state: GameState, locId: string, targetBrandId: string): number {
  const loc = state.locations.find((l) => l.id === locId);
  if (!loc) throw new Error(`Unknown location: ${locId}`);
  if (!loc.needsRenovation) throw new Error("Unit does not need renovation");
  const target = findBrand(state, targetBrandId);
  if (target.vertical !== "restaurant") throw new Error("Target brand must be a restaurant brand");

  if (state.cash < ACQUISITIONS.renovationCost) {
    throw new Error(`Insufficient funds: need ${ACQUISITIONS.renovationCost}`);
  }
  state.cash -= ACQUISITIONS.renovationCost;
  loc.brandId = target.id;
  loc.needsRenovation = false;
  loc.maturity = Math.max(loc.maturity, 0.78);
  log(state, "acquisition", `Renovated a unit into ${target.name}.`);
  return ACQUISITIONS.renovationCost;
}
