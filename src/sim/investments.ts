/**
 * Non-restaurant verticals and the digital DTC conversion.
 *
 * Non-restaurant units (apparel, cpg, realestate, venue, resort) run on
 * baseWeeklyRevenue and a margin band, with nrUpgrades {sourcing, brand}.
 * "Go Fully Digital" converts a physical apparel brand into one global,
 * owned, no-rent online storefront with a higher ceiling and a slow
 * global-reach ramp.
 */

import {
  CITY_MARKETS,
  DIGITAL,
  LEASE_TERMS,
  MARKET_MATURITY,
  NR_VERTICALS,
  type Vertical,
} from "../data/index.ts";
import { brandUnits } from "./brands.ts";
import { allocId, type Brand, type GameState, type Lease, type Location } from "./state.ts";

function city(id: string) {
  const c = CITY_MARKETS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown city: ${id}`);
  return c;
}

/** Create a physical non-restaurant unit for a brand in a city. */
export function createNrLocation(
  state: GameState,
  brand: Brand,
  cityId: string,
  buyLand: boolean,
): Location {
  const def = NR_VERTICALS[brand.vertical as Exclude<Vertical, "restaurant">];
  if (!def) throw new Error(`Not a non-restaurant vertical: ${brand.vertical}`);
  const c = city(cityId);

  const baseWeeklyRevenue = Math.round(def.baseWeeklyRevenue * c.demandMult);

  let lease: Lease | null = null;
  if (!buyLand && !state.ownRealEstatePolicy) {
    const term = LEASE_TERMS[1]; // standard 5-year
    lease = {
      weeklyRent: Math.round(baseWeeklyRevenue * 0.07),
      escalation: term.escalation,
      termWeeks: term.termWeeks,
      startedWeek: state.week,
    };
  }

  return {
    id: allocId(state, "loc"),
    brandId: brand.id,
    vertical: brand.vertical,
    cityId,
    settingId: "standalone",
    trafficTier: "medium",
    status: "building",
    opensWeek: state.week + def.buildWeeks,
    openedWeek: -1,
    maturity: MARKET_MATURITY.start,
    digital: false,
    lease,
    fmFlagged: false,
    staff: { chef: 0, server: 0, bartender: 0, manager: 0 },
    upgrades: { kitchen: 0, decor: 0, marketing: 0 },
    nrUpgrades: { sourcing: 0, brand: 0 },
    baseWeeklyRevenue,
    storeCount: 1,
    nrMarginBoost: 0,
    ceoAdjustNet: 0,
    needsRenovation: false,
    lastNet: 0,
    lastRevenue: 0,
  };
}

export function nrBuildCost(vertical: Vertical, cityId: string): number {
  const def = NR_VERTICALS[vertical as Exclude<Vertical, "restaurant">];
  if (!def) throw new Error(`Not a non-restaurant vertical: ${vertical}`);
  return Math.round(def.buildCost * city(cityId).costMult);
}

export interface DigitalConversionResult {
  liquidationProceeds: number;
  onlineUnit: Location;
}

/**
 * Convert a physical apparel brand into a single global DTC storefront.
 * Liquidates the physical stores for cash, then relaunches as one owned,
 * no-rent, location-independent online unit carrying over the best brand and
 * sourcing investments, with the digital ceiling and a global-reach ramp.
 *
 * Mutates the draft state. Throws if the brand isn't eligible.
 */
export function goFullyDigital(state: GameState, brand: Brand): DigitalConversionResult {
  if (brand.vertical !== "apparel") {
    throw new Error("Only apparel brands can go fully digital");
  }
  const units = brandUnits(state, brand.id);
  if (units.length === 0) throw new Error("Brand has no physical stores to convert");
  if (units.some((u) => u.digital)) throw new Error("Brand is already digital");

  // Liquidate physical stores; carry over the best investments and revenue base.
  let liquidationProceeds = 0;
  let bestSourcing = 0;
  let bestBrandInv = 0;
  let totalBaseRevenue = 0;
  for (const u of units) {
    liquidationProceeds += nrBuildCost(u.vertical, u.cityId) * DIGITAL.liquidationFraction;
    bestSourcing = Math.max(bestSourcing, u.nrUpgrades.sourcing);
    bestBrandInv = Math.max(bestBrandInv, u.nrUpgrades.brand);
    totalBaseRevenue += u.baseWeeklyRevenue;
  }
  liquidationProceeds = Math.round(liquidationProceeds);

  // Remove the physical stores.
  state.locations = state.locations.filter((l) => l.brandId !== brand.id);

  // Relaunch as a single owned, no-rent global online unit.
  const onlineUnit: Location = {
    id: allocId(state, "loc"),
    brandId: brand.id,
    vertical: "apparel",
    cityId: "shoreline",
    settingId: "standalone",
    trafficTier: "high",
    status: "open",
    opensWeek: state.week,
    openedWeek: state.week,
    maturity: DIGITAL.startMaturity,
    digital: true,
    lease: null,
    fmFlagged: false,
    staff: { chef: 0, server: 0, bartender: 0, manager: 0 },
    upgrades: { kitchen: 0, decor: 0, marketing: 0 },
    nrUpgrades: { sourcing: bestSourcing, brand: bestBrandInv },
    // Carried-over revenue base, uplifted for global reach.
    baseWeeklyRevenue: Math.round(totalBaseRevenue * DIGITAL.launchRevenueMult),
    storeCount: 1,
    nrMarginBoost: 0,
    ceoAdjustNet: 0,
    needsRenovation: false,
    lastNet: 0,
    lastRevenue: 0,
  };

  state.cash += liquidationProceeds;
  state.locations.push(onlineUnit);
  return { liquidationProceeds, onlineUnit };
}
