/**
 * The economic engine: weekly P&L, the margin governor, and market maturity.
 *
 * Everything here is a PURE function of its inputs. No state mutation beyond
 * the explicit return values, no randomness except through an injected Rng.
 *
 * These three pieces enforce the core economic invariants:
 *  - the margin governor is the anti-runaway clamp (Section 8.1),
 *  - market maturity makes units start below 1.0 and asymptote up (8.5),
 *  - the rent cap keeps occupancy sane (8.2).
 */

import {
  LOCATION_SETTINGS,
  MARKET_MATURITY,
  OCCUPANCY_RATIO_CAP,
  PRICE_TIERS,
  NR_UPGRADE,
  RESTAURANT_BASE_COGS,
  RESTAURANT_CONCEPTS,
  STAFF_TYPES,
  TRAFFIC_TIERS,
  UPGRADE_EFFECTS,
  VERTICAL_MARGIN_BANDS,
  type MarginBand,
  type Vertical,
} from "../data/index";
import type { Brand, Location } from "./state";
import type { Rng } from "./rng";

/** Weeks at which a unit is considered fully mature for banding purposes. */
export const MATURE_WEEKS = 104;

// ---------------------------------------------------------------------------
// Margin governor
// ---------------------------------------------------------------------------

/**
 * Clamp a raw net margin into a unit's age-based band, pulling it toward the
 * band center as the unit matures. `boost` (from sourcing upgrades / CEO) lifts
 * the whole band by exactly that amount and no more.
 *
 * Guarantees (covered by tests):
 *  - result <= cap + boost   (hard ceiling)
 *  - result >= floor         (floor holds)
 *  - mature units land near center + boost
 */
export function governMargin(
  rawMargin: number,
  band: MarginBand,
  ageWeeks: number,
  boost: number,
): number {
  const floor = band.floor;
  const cap = band.cap + boost;
  const center = band.center + boost;

  const ageFactor = Math.min(Math.max(ageWeeks, 0) / MATURE_WEEKS, 1);
  // Mature units are pulled hard toward center; young units keep more of their
  // raw (more volatile) margin.
  const pull = 0.35 + 0.5 * ageFactor;
  const pulled = rawMargin + (center - rawMargin) * pull;

  return Math.min(Math.max(pulled, floor), cap);
}

export function marginBandFor(vertical: Vertical): MarginBand {
  return VERTICAL_MARGIN_BANDS[vertical];
}

// ---------------------------------------------------------------------------
// Market maturity
// ---------------------------------------------------------------------------

/**
 * Advance a unit's market maturity one week toward its (reputation-scaled)
 * ceiling. Returns the new maturity value. Digital units use a higher ceiling
 * and a slower global-reach ramp so worldwide sales build over ~2 years.
 */
export function rampMaturity(
  loc: Location,
  reputation: number,
  cityGrowth: number,
): number {
  const ceiling = loc.digital ? MARKET_MATURITY.digitalCeiling : MARKET_MATURITY.ceiling;
  const rate = loc.digital ? MARKET_MATURITY.digitalRampRate : MARKET_MATURITY.baseRampRate;

  // Reputation scales how much of the ceiling the unit can actually reach.
  const repScale = 0.6 + 0.4 * (reputation / 100);
  const target = ceiling * repScale;

  const gap = target - loc.maturity;
  return loc.maturity + gap * rate * cityGrowth;
}

// ---------------------------------------------------------------------------
// Weekly P&L
// ---------------------------------------------------------------------------

/** Multipliers that come online in later phases. Default to neutral (1.0). */
export interface PLModifiers {
  marketingMult: number;
  repMult: number;
  brandMult: number;
  execRevenueMult: number;
  adMult: number;
  overextensionMult: number;
  disasterMult: number;
  seasonMult: number;
  happinessMult: number;
  blitzMult: number;
  eventMult: number;
}

export function neutralModifiers(): PLModifiers {
  return {
    marketingMult: 1,
    repMult: 1,
    brandMult: 1,
    execRevenueMult: 1,
    adMult: 1,
    overextensionMult: 1,
    disasterMult: 1,
    seasonMult: 1,
    happinessMult: 1,
    blitzMult: 1,
    eventMult: 1,
  };
}

export interface PLResult {
  revenue: number;
  customers: number;
  avgCheck: number;
  cogs: number;
  labor: number;
  rent: number;
  /** Net after the margin governor (the authoritative figure). */
  net: number;
  netMargin: number;
  /** Rent capped to the occupancy ratio of annualized sales (for tests). */
  rentCapped: boolean;
}

function lookup<T extends { id: string }>(arr: readonly T[], id: string): T {
  const found = arr.find((x) => x.id === id);
  if (!found) throw new Error(`Unknown id: ${id}`);
  return found;
}

/**
 * Compute one week of P&L for a restaurant unit. The margin governor has final
 * authority over net, which is what prevents runaway profits.
 */
export function calculateRestaurantPL(
  loc: Location,
  brand: Brand,
  cityDemandMult: number,
  weekNow: number,
  mods: PLModifiers,
  rng: Rng,
): PLResult {
  const concept = lookup(RESTAURANT_CONCEPTS, brand.conceptId);
  const setting = lookup(LOCATION_SETTINGS, loc.settingId);
  const traffic = TRAFFIC_TIERS[loc.trafficTier];
  const tier = PRICE_TIERS[brand.positioning];

  // --- Demand side ---
  const kitchenCapMult = UPGRADE_EFFECTS.kitchenCapacity[loc.upgrades.kitchen] ?? 1;
  const marketingMult = UPGRADE_EFFECTS.marketingDemand[loc.upgrades.marketing] ?? 1;

  // Staffing factor: understaffing relative to optimal throttles capacity.
  const staffingFactor = computeStaffingFactor(loc);

  // Small deterministic weekly variance.
  const variance = rng.range(0.94, 1.06);

  const rawDemand =
    traffic.baseCustomers *
    cityDemandMult *
    tier.customerMult *
    concept.customerMult *
    marketingMult *
    mods.marketingMult *
    mods.repMult *
    mods.brandMult *
    loc.maturity *
    mods.execRevenueMult *
    mods.adMult *
    mods.overextensionMult *
    mods.disasterMult *
    mods.seasonMult *
    mods.happinessMult *
    mods.blitzMult *
    mods.eventMult *
    variance;

  // Physical capacity cap: base seats lifted by kitchen upgrades and staffing.
  const capacity = traffic.baseCustomers * kitchenCapMult * staffingFactor * 1.6;
  const customers = Math.min(rawDemand, capacity);

  const avgCheck = concept.basePrice * concept.priceMult * tier.priceMult * setting.priceFactor;
  // Un-renovated acquired units are run-down and underperform until flipped.
  const renovationMult = loc.needsRenovation ? 0.5 : 1;
  const revenue = customers * avgCheck * renovationMult;

  // --- Cost side ---
  const sourcingRelief = loc.nrUpgrades.sourcing * 0.015;
  const cogsRatio = Math.max(0.12, RESTAURANT_BASE_COGS + concept.cogsAdj - sourcingRelief);
  const cogs = revenue * cogsRatio;

  const labor = computeLabor(loc);

  let rent = loc.lease ? loc.lease.weeklyRent : ownedOperatingCost(loc);
  // Rent cap: a leased open unit never pays more than the occupancy ratio of
  // its annualized sales. Owned units (operating cost) are exempt.
  let rentCapped = false;
  if (loc.lease) {
    const maxRent = (revenue * 52 * OCCUPANCY_RATIO_CAP) / 52;
    if (rent > maxRent) {
      rent = maxRent;
      rentCapped = true;
    }
  }

  const unitOverhead = 1200;
  const rawNet = revenue - cogs - labor - rent - unitOverhead;
  const rawMargin = revenue > 0 ? rawNet / revenue : 0;

  const ageWeeks = loc.status === "open" ? weekNow - loc.openedWeek : 0;
  const band = marginBandFor(loc.vertical);
  const governedMargin = governMargin(rawMargin, band, ageWeeks, loc.nrMarginBoost + loc.ceoAdjustNet);
  const net = revenue * governedMargin;

  return {
    revenue,
    customers,
    avgCheck,
    cogs,
    labor,
    rent,
    net,
    netMargin: governedMargin,
    rentCapped,
  };
}

/**
 * Compute one week of P&L for a non-restaurant unit. These run on
 * baseWeeklyRevenue times maturity and the brand investment, with the margin
 * governor (band lifted by sourcing) deciding net. No customer/staff sim.
 */
export function calculateNonRestaurantPL(
  loc: Location,
  weekNow: number,
  mods: PLModifiers,
  rng: Rng,
): PLResult {
  const brandRevMult = NR_UPGRADE.brandRevenue[loc.nrUpgrades.brand] ?? 1;
  const variance = rng.range(0.96, 1.04);

  const revenue =
    loc.baseWeeklyRevenue *
    Math.max(loc.maturity, 0) *
    brandRevMult *
    loc.storeCount *
    mods.brandMult *
    mods.execRevenueMult *
    mods.overextensionMult *
    mods.seasonMult *
    mods.disasterMult *
    variance;

  // Sourcing lifts the margin band; brand investment is already in revenue.
  const sourcingBoost = NR_UPGRADE.sourcingMarginBoost[loc.nrUpgrades.sourcing] ?? 0;
  const boost = sourcingBoost + loc.nrMarginBoost + loc.ceoAdjustNet;

  const band = marginBandFor(loc.vertical);
  const ageWeeks = loc.status === "open" ? weekNow - loc.openedWeek : 0;
  // Non-restaurant raw margin centers on the band before governing.
  const rawMargin = band.center + sourcingBoost;
  const governedMargin = governMargin(rawMargin, band, ageWeeks, boost);
  const net = revenue * governedMargin;

  return {
    revenue,
    customers: 0,
    avgCheck: 0,
    cogs: revenue * (1 - governedMargin),
    labor: 0,
    rent: loc.lease ? loc.lease.weeklyRent : 0,
    net,
    netMargin: governedMargin,
    rentCapped: false,
  };
}

/** Owned units pay an operating cost (taxes/maintenance) instead of rent. */
export function ownedOperatingCost(loc: Location): number {
  const traffic = TRAFFIC_TIERS[loc.trafficTier];
  return traffic.baseCustomers * 0.6;
}

function computeStaffingFactor(loc: Location): number {
  // Average fill ratio across roles that have an optimum > 0.
  let total = 0;
  let n = 0;
  for (const role of Object.keys(STAFF_TYPES) as Array<keyof typeof STAFF_TYPES>) {
    const def = STAFF_TYPES[role];
    if (def.optStaff <= 0) continue;
    const have = loc.staff[role] ?? 0;
    total += Math.min(have / def.optStaff, 1);
    n += 1;
  }
  const fill = n > 0 ? total / n : 1;
  // Understaffing bites but never fully closes the unit.
  return 0.5 + 0.5 * fill;
}

function computeLabor(loc: Location): number {
  let labor = 0;
  for (const role of Object.keys(STAFF_TYPES) as Array<keyof typeof STAFF_TYPES>) {
    labor += (loc.staff[role] ?? 0) * STAFF_TYPES[role].weeklyWage;
  }
  return labor;
}
