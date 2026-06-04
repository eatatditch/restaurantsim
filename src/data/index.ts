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
// Difficulty modes
// ---------------------------------------------------------------------------

export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  startingCash: number;
  /** Global demand multiplier on every unit's revenue. */
  demandMult: number;
  /** Company overhead multiplier. */
  overheadMult: number;
  /** Market-maturity ramp-speed multiplier. */
  rampMult: number;
}

/** `normal` is neutral (multipliers = 1) so it matches the baseline economy. */
export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { id: "easy", name: "Easy", startingCash: 1_200_000, demandMult: 1.12, overheadMult: 0.9, rampMult: 1.2 },
  normal: { id: "normal", name: "Normal", startingCash: 750_000, demandMult: 1, overheadMult: 1, rampMult: 1 },
  hard: { id: "hard", name: "Hard", startingCash: 500_000, demandMult: 0.9, overheadMult: 1.15, rampMult: 0.85 },
};

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
  { id: "nextgen", name: "Next-Gen Casual", basePrice: 21, priceMult: 0.85, customerMult: 1.5, cogsAdj: -0.01, startingRepBonus: 5, revMult: 1.0 },
  { id: "taco", name: "Taco (Next-Gen)", basePrice: 17, priceMult: 0.75, customerMult: 1.6, cogsAdj: -0.02, startingRepBonus: 4, revMult: 1.0 },
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
  /** Bulk-open keeps at least this much company cash in reserve. */
  cashReserve: 100_000,
  /** Hard cap on a single bulk-open / MAX request. */
  maxBulkOpen: 25,
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

// ---------------------------------------------------------------------------
// Financing: loans, investors, private equity
// ---------------------------------------------------------------------------

export const FINANCE = {
  /** Weekly interest rate charged on outstanding loan principal (~8%/yr). */
  loanWeeklyRate: 0.08 / 52,
  /** Borrowing capacity = trailing annual revenue x this + a base, minus debt. */
  leverageOfRevenue: 0.5,
  baseBorrowingCapacity: 500_000,
  /** Investors/PE take this fraction of positive weekly net as a dividend. */
  maxEquitySold: 0.9,
} as const;

export type CapitalRound = "angel" | "vc" | "pe";

export interface CapitalRoundDef {
  id: CapitalRound;
  name: string;
  /** Equity fraction sold per dollar raised (higher valuation = less equity). */
  equityPerDollar: number;
  /** Minimum raise for this round. */
  minRaise: number;
}

export const CAPITAL_ROUNDS: Record<CapitalRound, CapitalRoundDef> = {
  // ~4% equity per $1M.
  angel: { id: "angel", name: "Angel Round", equityPerDollar: 0.04 / 1_000_000, minRaise: 250_000 },
  // ~3% per $1M (better valuation).
  vc: { id: "vc", name: "Venture Round", equityPerDollar: 0.03 / 1_000_000, minRaise: 1_000_000 },
  // ~2.5% per $1M but big checks only.
  pe: { id: "pe", name: "Private Equity", equityPerDollar: 0.025 / 1_000_000, minRaise: 5_000_000 },
} as const;

// ---------------------------------------------------------------------------
// Non-restaurant verticals
// ---------------------------------------------------------------------------

/**
 * Non-restaurant units don't run the customer/staff sim; they run on a
 * baseWeeklyRevenue times their margin band. These defaults size a freshly
 * opened unit per vertical (before city/scale multipliers).
 */
export interface NrVerticalDef {
  vertical: Vertical;
  name: string;
  baseWeeklyRevenue: number;
  buildCost: number;
  buildWeeks: number;
}

export const NR_VERTICALS: Record<Exclude<Vertical, "restaurant">, NrVerticalDef> = {
  apparel: { vertical: "apparel", name: "Apparel", baseWeeklyRevenue: 55_000, buildCost: 260_000, buildWeeks: 8 },
  cpg: { vertical: "cpg", name: "Packaged Goods", baseWeeklyRevenue: 70_000, buildCost: 340_000, buildWeeks: 10 },
  realestate: { vertical: "realestate", name: "Real Estate", baseWeeklyRevenue: 40_000, buildCost: 900_000, buildWeeks: 14 },
  venue: { vertical: "venue", name: "Venue", baseWeeklyRevenue: 48_000, buildCost: 420_000, buildWeeks: 12 },
  resort: { vertical: "resort", name: "Resort", baseWeeklyRevenue: 95_000, buildCost: 1_400_000, buildWeeks: 20 },
  group: { vertical: "group", name: "Operating Chain", baseWeeklyRevenue: 0, buildCost: 0, buildWeeks: 0 },
};

/** nrUpgrades effects: sourcing lifts the margin band; brand lifts revenue. */
export const NR_UPGRADE = {
  maxLevel: 5,
  sourcingBaseCost: 90_000,
  brandBaseCost: 120_000,
  costGrowth: 1.6,
  /** Margin-band lift per sourcing level (added to the band). */
  sourcingMarginBoost: [0, 0.02, 0.04, 0.06, 0.08, 0.1],
  /** Revenue multiplier per brand-investment level. */
  brandRevenue: [1.0, 1.08, 1.17, 1.27, 1.38, 1.5],
} as const;

// ---------------------------------------------------------------------------
// Digital DTC conversion (Go Fully Digital — apparel)
// ---------------------------------------------------------------------------

export const DIGITAL = {
  /** Physical stores liquidate for this fraction of their build cost. */
  liquidationFraction: 0.55,
  /** The relaunched online unit's starting weekly revenue multiplier. */
  launchRevenueMult: 1.25,
  /** Online unit starts low and ramps to the digital ceiling over ~2 years. */
  startMaturity: 0.6,
} as const;

// ---------------------------------------------------------------------------
// Executives (C-suite) + pro-CEO
// ---------------------------------------------------------------------------

export type ExecRole = "president" | "cmo" | "cfo" | "coo";

export interface ExecDef {
  id: ExecRole;
  name: string;
  weeklySalary: number;
  /** Company-wide revenue multiplier while employed. */
  revenueMult: number;
  /** Company overhead multiplier while employed (lower = cheaper). */
  overheadMult: number;
}

export const EXECUTIVES: Record<ExecRole, ExecDef> = {
  president: { id: "president", name: "President", weeklySalary: 8000, revenueMult: 1.03, overheadMult: 0.9 },
  cmo: { id: "cmo", name: "CMO", weeklySalary: 6000, revenueMult: 1.07, overheadMult: 1.0 },
  cfo: { id: "cfo", name: "CFO", weeklySalary: 6500, revenueMult: 1.0, overheadMult: 0.85 },
  coo: { id: "coo", name: "COO", weeklySalary: 6000, revenueMult: 1.04, overheadMult: 0.95 },
};

/** A C-suite meeting: a periodic multiple-choice decision. */
export interface CSuiteOutcome {
  weight: number;
  note: string;
  cash?: number;
  reputation?: number;
  /** A temporary company-wide revenue buff. */
  buff?: { revMult: number; weeks: number };
}

export interface CSuiteOption {
  label: string;
  outcomes: CSuiteOutcome[];
}

export interface CSuiteMeeting {
  id: string;
  title: string;
  prompt: string;
  options: CSuiteOption[];
}

export const CSUITE_MEETINGS: readonly CSuiteMeeting[] = [
  {
    id: "celebrity",
    title: "Celebrity Endorsement",
    prompt: "A coastal celebrity wants to front a campaign for a steep fee.",
    options: [
      {
        label: "Sign the deal ($400k)",
        outcomes: [
          { weight: 6, note: "The campaign pops — sales surge.", cash: -400_000, buff: { revMult: 1.15, weeks: 12 } },
          { weight: 4, note: "Lukewarm reception; mostly a wash.", cash: -400_000, reputation: 2 },
        ],
      },
      { label: "Pass", outcomes: [{ weight: 1, note: "No change.", reputation: 0 }] },
    ],
  },
  {
    id: "valuemenu",
    title: "Value-Menu Reset",
    prompt: "The CFO proposes a value-menu reset to drive traffic.",
    options: [
      {
        label: "Roll it out",
        outcomes: [
          { weight: 5, note: "Traffic up, margins thin briefly.", buff: { revMult: 1.08, weeks: 16 } },
          { weight: 5, note: "Cannibalized higher-margin orders.", reputation: -2 },
        ],
      },
      { label: "Hold prices", outcomes: [{ weight: 1, note: "Steady as she goes.", reputation: 1 }] },
    ],
  },
  {
    id: "supplier",
    title: "Supplier Renegotiation",
    prompt: "Lock in a long-term supplier contract?",
    options: [
      {
        label: "Lock it in",
        outcomes: [
          { weight: 7, note: "Costs drop company-wide.", buff: { revMult: 1.05, weeks: 20 } },
          { weight: 3, note: "Quality slips; reputation dips.", reputation: -3 },
        ],
      },
      { label: "Stay flexible", outcomes: [{ weight: 1, note: "No change.", reputation: 0 }] },
    ],
  },
];

export const CEO = {
  weeklySalary: 12_000,
  /** Weeks per CEO build cycle (quarterly). */
  buildCycleWeeks: 13,
  goldenWeeks: 26,
  declineWeeks: 52,
  /** Phase revenue multipliers. */
  phaseRevenueMult: { none: 1, golden: 1.06, decline: 0.97, shift: 0.94, failing: 0.88 } as const,
  /** Pressure thresholds for lifecycle phases. */
  shiftPressure: 70,
  failingPressure: 85,
  /** Quarterly natural pressure creep. */
  pressureCreep: 6,
  approveRelief: 15,
  pushPenalty: 20,
  /** Probability a quarter surfaces a PE buyout offer for a brand. */
  peOfferChance: 0.25,
} as const;

// ---------------------------------------------------------------------------
// Seasons, disasters, events, achievements, goals
// ---------------------------------------------------------------------------

export interface Season {
  id: string;
  name: string;
  /** Revenue multiplier across the company while in season. */
  revMult: number;
}

/** Four 13-week seasons. Coastal demand peaks in summer. */
export const SEASONS: readonly Season[] = [
  { id: "winter", name: "Winter", revMult: 0.9 },
  { id: "spring", name: "Spring", revMult: 1.0 },
  { id: "summer", name: "Summer", revMult: 1.18 },
  { id: "fall", name: "Fall", revMult: 1.04 },
];

export interface DisasterDef {
  id: string;
  name: string;
  /** Revenue multiplier while active. */
  revMult: number;
  /** Weeks the disaster lingers. */
  weeks: number;
  /** One-off cleanup cost. */
  cost: number;
}

export const DISASTERS: readonly DisasterDef[] = [
  { id: "storm", name: "Coastal Storm", revMult: 0.8, weeks: 3, cost: 120_000 },
  { id: "outage", name: "Power Outage", revMult: 0.85, weeks: 1, cost: 40_000 },
  { id: "recall", name: "Supplier Recall", revMult: 0.88, weeks: 4, cost: 90_000 },
  { id: "heatwave", name: "Heat Wave", revMult: 0.92, weeks: 2, cost: 25_000 },
];

/** Per-week probability that a disaster strikes. */
export const DISASTER_WEEKLY_CHANCE = 0.03;

export interface ComplicationDef {
  id: string;
  name: string;
  message: string;
  /** Weeks until it must be resolved. */
  deadlineWeeks: number;
  /** Cost to resolve now. */
  resolveCost: number;
  /** Reputation hit if it lapses unresolved. */
  lapsePenalty: number;
}

export const COMPLICATIONS: readonly ComplicationDef[] = [
  { id: "healthinspection", name: "Health Inspection", message: "A unit failed a surprise inspection.", deadlineWeeks: 4, resolveCost: 60_000, lapsePenalty: 6 },
  { id: "lawsuit", name: "Slip-and-Fall Suit", message: "A liability claim needs settling.", deadlineWeeks: 6, resolveCost: 150_000, lapsePenalty: 8 },
  { id: "laborgrievance", name: "Labor Grievance", message: "Staff filed a grievance.", deadlineWeeks: 5, resolveCost: 80_000, lapsePenalty: 5 },
];

export const COMPLICATION_WEEKLY_CHANCE = 0.04;

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "first_location", name: "Grand Opening", description: "Open your first location." },
  { id: "ten_locations", name: "Chain Reaction", description: "Operate 10 locations." },
  { id: "fifty_locations", name: "Empire", description: "Operate 50 locations." },
  { id: "millionaire", name: "Millionaire", description: "Reach $1M company cash." },
  { id: "multibrand", name: "Portfolio", description: "Run 3 brands at once." },
  { id: "tycoon", name: "Tycoon", description: "Reach $100M personal net worth." },
  { id: "acquirer", name: "Acquirer", description: "Acquire a chain or big group." },
  { id: "digital", name: "Going Global", description: "Take a brand fully digital." },
];

export interface GoalDef {
  id: string;
  name: string;
  metric: "locations" | "brands" | "cash" | "reputation";
  target: number;
}

export const GOALS: readonly GoalDef[] = [
  { id: "g_locations_5", name: "Open 5 locations", metric: "locations", target: 5 },
  { id: "g_brands_3", name: "Run 3 brands", metric: "brands", target: 3 },
  { id: "g_cash_10m", name: "Bank $10M", metric: "cash", target: 10_000_000 },
  { id: "g_rep_80", name: "Reach 80 reputation", metric: "reputation", target: 80 },
];

// ---------------------------------------------------------------------------
// Life simulator (personal, parallel to the business)
// ---------------------------------------------------------------------------

export interface LadderItem {
  id: string;
  name: string;
  cost: number;
  /** Contribution to the happiness ceiling. */
  happiness: number;
  /** Weekly upkeep cost. */
  upkeep: number;
}

/** Home upgrade ladder. */
export const HOMES: readonly LadderItem[] = [
  { id: "apartment", name: "City Apartment", cost: 280_000, happiness: 6, upkeep: 1200 },
  { id: "condo", name: "Beach Condo", cost: 850_000, happiness: 12, upkeep: 2600 },
  { id: "house", name: "Coastal House", cost: 2_400_000, happiness: 20, upkeep: 5200 },
  { id: "estate", name: "Cliffside Estate", cost: 7_500_000, happiness: 32, upkeep: 12_000 },
  { id: "compound", name: "Private Compound", cost: 22_000_000, happiness: 48, upkeep: 32_000 },
];

/** Car upgrade ladder. */
export const CARS: readonly LadderItem[] = [
  { id: "sedan", name: "Sensible Sedan", cost: 38_000, happiness: 3, upkeep: 180 },
  { id: "suv", name: "Luxury SUV", cost: 95_000, happiness: 6, upkeep: 360 },
  { id: "sports", name: "Sports Coupe", cost: 240_000, happiness: 11, upkeep: 820 },
  { id: "exotic", name: "Exotic Supercar", cost: 850_000, happiness: 18, upkeep: 2400 },
];

/** Collectible big-ticket assets (ownable in multiples). */
export interface LuxuryItem {
  id: string;
  name: string;
  cost: number;
  happiness: number;
  upkeep: number;
  /** Resale fraction of cost. */
  resale: number;
}

export const LUXURY_CATALOG: readonly LuxuryItem[] = [
  { id: "island", name: "Private Island", cost: 35_000_000, happiness: 30, upkeep: 60_000, resale: 0.7 },
  { id: "realestate", name: "Investment Property", cost: 4_000_000, happiness: 8, upkeep: 6000, resale: 0.85 },
  { id: "supercar", name: "Collector Supercar", cost: 1_800_000, happiness: 10, upkeep: 3000, resale: 0.75 },
  { id: "yacht", name: "Superyacht", cost: 28_000_000, happiness: 26, upkeep: 90_000, resale: 0.6 },
  { id: "jet", name: "Private Jet", cost: 45_000_000, happiness: 28, upkeep: 120_000, resale: 0.65 },
  { id: "helicopter", name: "Helicopter", cost: 6_000_000, happiness: 12, upkeep: 18_000, resale: 0.6 },
  { id: "art", name: "Art Collection", cost: 9_000_000, happiness: 14, upkeep: 8000, resale: 0.9 },
  { id: "watch", name: "Watch Collection", cost: 2_200_000, happiness: 9, upkeep: 1500, resale: 0.8 },
  { id: "wine", name: "Wine Cellar", cost: 1_400_000, happiness: 7, upkeep: 2000, resale: 0.7 },
];

export const LIFE = {
  /** Base happiness target before lifestyle contributions. */
  baseHappiness: 45,
  /** How fast happiness moves toward its target each week. */
  happinessLerp: 0.1,
  /** Savings weekly interest rate. */
  savingsRate: 0.0008,
  /** Happiness below this accrues burnout. */
  burnoutThreshold: 25,
  /** happinessMult on business: maps happiness 0..100 to this range. */
  businessHappinessMin: 0.9,
  businessHappinessMax: 1.12,
  /** Partner & kid happiness contributions. */
  partnerHappiness: 10,
  marriedHappiness: 6,
  kidHappiness: 5,
  collegeCost: 320_000,
  collegeHappiness: 8,
  ventureCost: 500_000,
  /** Affair outcomes are heavily weighted toward disaster. */
  affairCaughtDivorceChance: 0.5,
  affairCaughtWreckedChance: 0.3,
  /** Divorce settlement takes this fraction of personal net worth. */
  divorceSettlement: 0.4,
  vegasStake: 250_000,
} as const;

// ---------------------------------------------------------------------------
// Acquisitions
// ---------------------------------------------------------------------------

/** Big-group categories: refreshing market of purchasable mega-chains. */
export interface GroupCategory {
  id: string;
  name: string;
  minUnits: number;
  maxUnits: number;
  /** Aggregate weekly revenue contributed per store. */
  weeklyRevenuePerStore: number;
  /** Acquisition price charged per store. */
  pricePerStore: number;
  /** Cost to build out one additional store when scaling the division. */
  buildoutPerStore: number;
}

export const GROUP_CATEGORIES: readonly GroupCategory[] = [
  { id: "coffee", name: "Coffee", minUnits: 40, maxUnits: 130, weeklyRevenuePerStore: 22_000, pricePerStore: 320_000, buildoutPerStore: 240_000 },
  { id: "burger", name: "Burger", minUnits: 25, maxUnits: 110, weeklyRevenuePerStore: 34_000, pricePerStore: 420_000, buildoutPerStore: 300_000 },
  { id: "fastcasual", name: "Fast Casual", minUnits: 20, maxUnits: 80, weeklyRevenuePerStore: 38_000, pricePerStore: 460_000, buildoutPerStore: 330_000 },
  { id: "pizza", name: "Pizza", minUnits: 30, maxUnits: 120, weeklyRevenuePerStore: 26_000, pricePerStore: 300_000, buildoutPerStore: 220_000 },
  { id: "chicken", name: "Chicken", minUnits: 20, maxUnits: 90, weeklyRevenuePerStore: 36_000, pricePerStore: 440_000, buildoutPerStore: 320_000 },
  { id: "taco", name: "Taco", minUnits: 25, maxUnits: 100, weeklyRevenuePerStore: 28_000, pricePerStore: 330_000, buildoutPerStore: 240_000 },
  { id: "donut", name: "Donut", minUnits: 15, maxUnits: 70, weeklyRevenuePerStore: 20_000, pricePerStore: 280_000, buildoutPerStore: 200_000 },
];

export const ACQUISITIONS = {
  /** How many big-group offers sit in the market at once. */
  groupOfferCount: 4,
  /** Weeks between market refreshes. */
  refreshEveryWeeks: 8,
  /** Competitor chains are small (2-4 units) and need renovation. */
  competitorMinUnits: 2,
  competitorMaxUnits: 4,
  competitorPricePerUnit: 380_000,
  competitorOfferCount: 3,
  /** Cost to renovate (rebrand) an acquired competitor unit into your brand. */
  renovationCost: 150_000,
} as const;

// ---------------------------------------------------------------------------
// Facilities Manager (executes the buy-and-own mandate)
// ---------------------------------------------------------------------------

export const FACILITIES = {
  weeklySalary: 3500,
  /** Proactive ownership sweep converts at most this many leases per week. */
  maxConvertsPerWeek: 2,
  /** Always keep at least this much company cash when buying buildings. */
  cashReserve: 250_000,
  /** A short bridge lease signed when a building can't be bought at expiry. */
  bridgeLeaseWeeks: 26,
} as const;
