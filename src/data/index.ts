/**
 * Balance constants for SHORE THING.
 *
 * PROVENANCE: There is no legacy reference file available, so every value here
 * is ORIGINAL — authored from the build spec to produce a coherent economy.
 * They are intended to be tuned. Keep all tuning in this directory so balance
 * changes are a data edit, not a code hunt. Nothing in src/sim should hardcode
 * a number that belongs here.
 */

export const SAVE_VERSION = 1;

// ---------------------------------------------------------------------------
// Verticals
// ---------------------------------------------------------------------------

export type Vertical =
  | "restaurant"
  | "apparel"
  | "cpg"
  | "realestate"
  | "venue"
  | "resort"
  | "group";

/**
 * Per-vertical net-margin band used by the margin governor. Net margin for a
 * unit is clamped into [floor, cap] and pulled toward `center` as the unit
 * matures. Restaurant units derive their margin from the customer/staff sim,
 * but are still clamped by this band.
 */
export interface MarginBand {
  floor: number;
  center: number;
  cap: number;
}

export const VERTICAL_MARGIN_BANDS: Record<Vertical, MarginBand> = {
  restaurant: { floor: 0.04, center: 0.14, cap: 0.22 },
  apparel: { floor: 0.06, center: 0.18, cap: 0.34 },
  cpg: { floor: 0.05, center: 0.16, cap: 0.28 },
  realestate: { floor: 0.1, center: 0.32, cap: 0.55 },
  venue: { floor: 0.05, center: 0.2, cap: 0.36 },
  resort: { floor: 0.06, center: 0.24, cap: 0.42 },
  group: { floor: 0.04, center: 0.12, cap: 0.2 },
};

// ---------------------------------------------------------------------------
// Restaurant concepts
// ---------------------------------------------------------------------------

export interface Concept {
  id: string;
  name: string;
  /** Base check size in dollars before tier/positioning multipliers. */
  basePrice: number;
  priceMult: number;
  customerMult: number;
  /** Cost-of-goods adjustment, added to the base COGS ratio. */
  cogsAdj: number;
  startingRepBonus: number;
  revMult: number;
}

export const RESTAURANT_CONCEPTS: readonly Concept[] = [
  { id: "coastal", name: "Coastal Seafood", basePrice: 32, priceMult: 1.0, customerMult: 1.0, cogsAdj: 0.02, startingRepBonus: 4, revMult: 1.0 },
  { id: "fine", name: "Fine Dining", basePrice: 78, priceMult: 1.6, customerMult: 0.55, cogsAdj: 0.04, startingRepBonus: 8, revMult: 1.0 },
  { id: "fastcasual", name: "Fast Casual", basePrice: 16, priceMult: 0.7, customerMult: 1.7, cogsAdj: -0.02, startingRepBonus: 2, revMult: 1.0 },
  { id: "sports", name: "Sports Bar", basePrice: 24, priceMult: 0.9, customerMult: 1.25, cogsAdj: 0.0, startingRepBonus: 3, revMult: 1.0 },
  { id: "steak", name: "Steakhouse", basePrice: 64, priceMult: 1.45, customerMult: 0.7, cogsAdj: 0.05, startingRepBonus: 6, revMult: 1.0 },
  { id: "bakery", name: "Bakery & Cafe", basePrice: 12, priceMult: 0.6, customerMult: 1.9, cogsAdj: -0.03, startingRepBonus: 3, revMult: 1.0 },
  { id: "health", name: "Health & Bowls", basePrice: 18, priceMult: 0.8, customerMult: 1.4, cogsAdj: -0.01, startingRepBonus: 4, revMult: 1.0 },
  { id: "fusion", name: "Fusion Kitchen", basePrice: 38, priceMult: 1.1, customerMult: 0.95, cogsAdj: 0.03, startingRepBonus: 5, revMult: 1.0 },
];

/** Base cost-of-goods ratio for restaurants before per-concept adjustment. */
export const RESTAURANT_BASE_COGS = 0.3;

// ---------------------------------------------------------------------------
// Brand price positioning (brand-level)
// ---------------------------------------------------------------------------

export type Positioning = "budget" | "standard" | "premium" | "luxury";

export interface PriceTier {
  id: Positioning;
  name: string;
  priceMult: number;
  customerMult: number;
  repMult: number;
}

export const PRICE_TIERS: Record<Positioning, PriceTier> = {
  budget: { id: "budget", name: "Budget", priceMult: 0.8, customerMult: 1.3, repMult: 0.9 },
  standard: { id: "standard", name: "Standard", priceMult: 1.0, customerMult: 1.0, repMult: 1.0 },
  premium: { id: "premium", name: "Premium", priceMult: 1.35, customerMult: 0.78, repMult: 1.15 },
  luxury: { id: "luxury", name: "Luxury", priceMult: 1.85, customerMult: 0.52, repMult: 1.35 },
};

// ---------------------------------------------------------------------------
// Site selection: settings (formats), traffic tiers, cities
// ---------------------------------------------------------------------------

export interface LocationSetting {
  id: string;
  name: string;
  priceFactor: number;
  /** Base build cost before traffic-tier scaling. */
  baseBuildCost: number;
  buildWeeks: number;
}

export const LOCATION_SETTINGS: readonly LocationSetting[] = [
  { id: "strip", name: "Strip Mall", priceFactor: 0.9, baseBuildCost: 180_000, buildWeeks: 6 },
  { id: "downtown", name: "Downtown", priceFactor: 1.15, baseBuildCost: 320_000, buildWeeks: 9 },
  { id: "waterfront", name: "Waterfront", priceFactor: 1.35, baseBuildCost: 480_000, buildWeeks: 12 },
  { id: "mall", name: "Shopping Mall", priceFactor: 1.0, baseBuildCost: 240_000, buildWeeks: 7 },
  { id: "standalone", name: "Standalone Pad", priceFactor: 1.05, baseBuildCost: 300_000, buildWeeks: 8 },
];

export type TrafficTier = "low" | "medium" | "high";

export interface TrafficTierDef {
  id: TrafficTier;
  name: string;
  /** Base weekly customers before all multipliers. */
  baseCustomers: number;
  buildCostMult: number;
  rentMult: number;
}

export const TRAFFIC_TIERS: Record<TrafficTier, TrafficTierDef> = {
  low: { id: "low", name: "Low Traffic", baseCustomers: 900, buildCostMult: 0.75, rentMult: 0.7 },
  medium: { id: "medium", name: "Medium Traffic", baseCustomers: 1500, buildCostMult: 1.0, rentMult: 1.0 },
  high: { id: "high", name: "High Traffic", baseCustomers: 2400, buildCostMult: 1.4, rentMult: 1.5 },
};

export interface City {
  id: string;
  name: string;
  /** Demand multiplier applied to customer counts. */
  demandMult: number;
  /** Rent/land cost multiplier. */
  costMult: number;
  /** Market growth rate driving maturity ramp speed. */
  growth: number;
}

export const CITY_MARKETS: readonly City[] = [
  { id: "shoreline", name: "Shoreline", demandMult: 1.0, costMult: 1.0, growth: 1.0 },
  { id: "baytown", name: "Baytown", demandMult: 0.92, costMult: 0.85, growth: 1.1 },
  { id: "harborcity", name: "Harbor City", demandMult: 1.18, costMult: 1.35, growth: 0.9 },
  { id: "palmgrove", name: "Palm Grove", demandMult: 1.08, costMult: 1.15, growth: 1.05 },
  { id: "tidewater", name: "Tidewater", demandMult: 0.85, costMult: 0.75, growth: 1.2 },
  { id: "marina", name: "Marina Heights", demandMult: 1.25, costMult: 1.45, growth: 0.85 },
];

// ---------------------------------------------------------------------------
// Staffing
// ---------------------------------------------------------------------------

export type StaffRole = "chef" | "server" | "bartender" | "manager";

export interface StaffType {
  id: StaffRole;
  name: string;
  weeklyWage: number;
  minStaff: number;
  optStaff: number;
}

export const STAFF_TYPES: Record<StaffRole, StaffType> = {
  chef: { id: "chef", name: "Chef", weeklyWage: 1400, minStaff: 1, optStaff: 3 },
  server: { id: "server", name: "Server", weeklyWage: 700, minStaff: 2, optStaff: 6 },
  bartender: { id: "bartender", name: "Bartender", weeklyWage: 850, minStaff: 0, optStaff: 2 },
  manager: { id: "manager", name: "Manager", weeklyWage: 1600, minStaff: 1, optStaff: 1 },
};

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

export type UpgradeKind = "kitchen" | "decor" | "marketing";

export interface UpgradeDef {
  id: UpgradeKind;
  name: string;
  maxLevel: number;
  /** Cost of each level: baseCost * (costGrowth ^ level). */
  baseCost: number;
  costGrowth: number;
}

export const UPGRADES: Record<UpgradeKind, UpgradeDef> = {
  kitchen: { id: "kitchen", name: "Kitchen Capacity", maxLevel: 5, baseCost: 60_000, costGrowth: 1.6 },
  decor: { id: "decor", name: "Decor & Quality", maxLevel: 5, baseCost: 45_000, costGrowth: 1.55 },
  marketing: { id: "marketing", name: "Local Marketing", maxLevel: 5, baseCost: 30_000, costGrowth: 1.5 },
};

/** Per-level effect multipliers (index 0 = no upgrade). */
export const UPGRADE_EFFECTS = {
  /** Kitchen raises the capacity cap on covers. */
  kitchenCapacity: [1.0, 1.12, 1.26, 1.42, 1.6, 1.8],
  /** Decor raises reputation pull. */
  decorRep: [1.0, 1.05, 1.11, 1.18, 1.26, 1.35],
  /** Marketing raises demand. */
  marketingDemand: [1.0, 1.08, 1.17, 1.27, 1.38, 1.5],
} as const;

// ---------------------------------------------------------------------------
// Leases
// ---------------------------------------------------------------------------

export interface LeaseTerm {
  id: string;
  name: string;
  termWeeks: number;
  /** Annual escalation applied at each anniversary. */
  escalation: number;
}

export const LEASE_TERMS: readonly LeaseTerm[] = [
  { id: "short", name: "3-Year", termWeeks: 156, escalation: 0.04 },
  { id: "standard", name: "5-Year", termWeeks: 260, escalation: 0.03 },
  { id: "long", name: "10-Year", termWeeks: 520, escalation: 0.025 },
];

/** Occupancy ratio: leased rent is capped to this fraction of annualized sales. */
export const OCCUPANCY_RATIO_CAP = 0.1;
export const OCCUPANCY_RATIO_TARGET = 0.07;

/** Land buyout price as a multiple of annual rent. */
export const LAND_BUYOUT_RENT_MULTIPLE = 12;

// ---------------------------------------------------------------------------
// Market maturity
// ---------------------------------------------------------------------------

export const MARKET_MATURITY = {
  /** Units open here. */
  start: 0.78,
  /** Default ceiling a physical unit asymptotes toward. */
  ceiling: 1.6,
  /** Digital (DTC) units get a much higher ceiling and global-reach ramp. */
  digitalCeiling: 3.0,
  /** Base fraction of the remaining gap closed each week (scaled by city growth). */
  baseRampRate: 0.04,
  digitalRampRate: 0.025,
} as const;

// ---------------------------------------------------------------------------
// Expansion / management bandwidth
// ---------------------------------------------------------------------------

export const EXPANSION = {
  /** Base number of openings per year before overextension. */
  baseCapacity: 6,
  /** Each executive / GM adds capacity (filled in later phases). */
  capacityPerExec: 3,
  /** Maturity penalty applied to rushed openings beyond capacity. */
  overextensionMaturityPenalty: 0.2,
  /** Company-wide revenue drag while overextended. */
  overextensionRevenueDrag: 0.12,
  /** Weeks the strain window lasts after an overextension event. */
  strainWeeks: 8,
} as const;

// ---------------------------------------------------------------------------
// Company layer
// ---------------------------------------------------------------------------

export const COMPANY = {
  weeklyOverheadBase: 4000,
  weeklyOverheadPerUnit: 600,
  startingCash: 750_000,
  startingReputation: 50,
} as const;
