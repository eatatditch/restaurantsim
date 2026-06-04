/**
 * Location lifecycle and construction helpers. Pure functions that build and
 * advance units; player-facing entry points live in actions.ts.
 */

import {
  CITY_MARKETS,
  LEASE_TERMS,
  LOCATION_SETTINGS,
  OCCUPANCY_RATIO_TARGET,
  PRICE_TIERS,
  RESTAURANT_CONCEPTS,
  STAFF_TYPES,
  TRAFFIC_TIERS,
  MARKET_MATURITY,
  type StaffRole,
  type TrafficTier,
  type UpgradeKind,
} from "../data/index.ts";
import { allocId, type Brand, type GameState, type Lease, type Location } from "./state.ts";

function lookup<T extends { id: string }>(arr: readonly T[], id: string): T {
  const found = arr.find((x) => x.id === id);
  if (!found) throw new Error(`Unknown id: ${id}`);
  return found;
}

export interface SiteSpec {
  cityId: string;
  settingId: string;
  trafficTier: TrafficTier;
  leaseTermId: string | null; // null => buy/own outright
}

/** Build cost for a site, scaled by traffic tier and city cost. */
export function buildCost(spec: SiteSpec): number {
  const setting = lookup(LOCATION_SETTINGS, spec.settingId);
  const traffic = TRAFFIC_TIERS[spec.trafficTier];
  const city = lookup(CITY_MARKETS, spec.cityId);
  return Math.round(setting.baseBuildCost * traffic.buildCostMult * city.costMult);
}

/**
 * Estimated weekly rent for a site, derived from a target occupancy ratio of
 * expected annual sales. Keeps rent in a sane band from day one.
 */
export function estimateWeeklyRent(brand: Brand, spec: SiteSpec): number {
  const concept = lookup(RESTAURANT_CONCEPTS, brand.conceptId);
  const setting = lookup(LOCATION_SETTINGS, spec.settingId);
  const traffic = TRAFFIC_TIERS[spec.trafficTier];
  const city = lookup(CITY_MARKETS, spec.cityId);
  const tier = PRICE_TIERS[brand.positioning];

  const expectedCustomers = traffic.baseCustomers * city.demandMult * tier.customerMult * concept.customerMult;
  const avgCheck = concept.basePrice * concept.priceMult * tier.priceMult * setting.priceFactor;
  const annualSales = expectedCustomers * avgCheck * 52;
  return Math.round((annualSales * OCCUPANCY_RATIO_TARGET) / 52);
}

/** Price to buy the building outright (instead of leasing). */
export function landBuyoutPrice(brand: Brand, spec: SiteSpec): number {
  const weeklyRent = estimateWeeklyRent(brand, spec);
  return Math.round(weeklyRent * 52 * 12); // ~12x annual rent
}

function defaultStaff(): Record<StaffRole, number> {
  const staff = {} as Record<StaffRole, number>;
  for (const role of Object.keys(STAFF_TYPES) as StaffRole[]) {
    staff[role] = STAFF_TYPES[role].optStaff;
  }
  return staff;
}

function zeroUpgrades(): Record<UpgradeKind, number> {
  return { kitchen: 0, decor: 0, marketing: 0 };
}

/**
 * Create a building unit. It enters `building` and opens after the setting's
 * buildWeeks. `rushed` lowers starting maturity (overextension, Phase 4).
 */
export function createLocation(
  state: GameState,
  brand: Brand,
  spec: SiteSpec,
  rushed = false,
): Location {
  const setting = lookup(LOCATION_SETTINGS, spec.settingId);

  let lease: Lease | null = null;
  if (spec.leaseTermId) {
    const term = lookup(LEASE_TERMS, spec.leaseTermId);
    lease = {
      weeklyRent: estimateWeeklyRent(brand, spec),
      escalation: term.escalation,
      termWeeks: term.termWeeks,
      startedWeek: state.week,
    };
  }

  const startMaturity = rushed
    ? MARKET_MATURITY.start * 0.7
    : MARKET_MATURITY.start;

  return {
    id: allocId(state, "loc"),
    brandId: brand.id,
    vertical: brand.vertical,
    cityId: spec.cityId,
    settingId: spec.settingId,
    trafficTier: spec.trafficTier,
    status: "building",
    opensWeek: state.week + setting.buildWeeks,
    openedWeek: -1,
    maturity: startMaturity,
    digital: false,
    lease,
    fmFlagged: false,
    staff: defaultStaff(),
    upgrades: zeroUpgrades(),
    nrUpgrades: { sourcing: 0, brand: 0 },
    baseWeeklyRevenue: 0,
    storeCount: 1,
    nrMarginBoost: 0,
    ceoAdjustNet: 0,
    lastNet: 0,
    lastRevenue: 0,
  };
}

/** Advance lifecycle: building -> open when the build completes. */
export function tickLifecycle(state: GameState, loc: Location): void {
  if (loc.status === "building" && state.week >= loc.opensWeek) {
    loc.status = "open";
    loc.openedWeek = state.week;
  }
}
