/**
 * GameState: the complete, serializable shape of a SHORE THING game.
 *
 * This is plain data — no methods, no class instances (the RNG lives here as
 * serialized state, not as an Rng object). Everything the simulation needs to
 * reproduce a game lives in this object, which is what makes save/load and
 * determinism testing straightforward.
 *
 * Later phases flesh out the executive, acquisition, and personal subsystems;
 * the shape is defined up front so migrations stay additive.
 */

import {
  DIFFICULTIES,
  SAVE_VERSION,
  type Difficulty,
  type Positioning,
  type StaffRole,
  type TrafficTier,
  type UpgradeKind,
  type Vertical,
} from "../data/index";
import { Rng, type RngState } from "./rng";

export interface Brand {
  id: string;
  name: string;
  vertical: Vertical;
  conceptId: string;
  positioning: Positioning;
  /** True for brands created via acquisition (competitor chains / big groups). */
  acquired: boolean;
  /** Reputation pull specific to this brand. */
  reputation: number;
}

export interface Lease {
  weeklyRent: number;
  escalation: number;
  termWeeks: number;
  startedWeek: number;
}

export type LocationStatus = "available" | "building" | "open";

export interface Location {
  id: string;
  brandId: string;
  vertical: Vertical;
  cityId: string;
  settingId: string;
  trafficTier: TrafficTier;
  status: LocationStatus;
  /** Week the unit opens (while building). */
  opensWeek: number;
  openedWeek: number;
  /** Market maturity multiplier, ramps from ~0.78 toward the ceiling. */
  maturity: number;
  /** True for digital DTC units (higher ceiling, global-reach ramp). */
  digital: boolean;
  /** null => owned outright; otherwise the active lease. */
  lease: Lease | null;
  /** Flagged by the Facilities Manager when a bridge lease was signed. */
  fmFlagged: boolean;
  staff: Record<StaffRole, number>;
  upgrades: Record<UpgradeKind, number>;
  /** Non-restaurant investment levels. */
  nrUpgrades: { sourcing: number; brand: number };
  /** Base weekly revenue for non-restaurant verticals. */
  baseWeeklyRevenue: number;
  /** For 'group' division units: number of aggregated stores. */
  storeCount: number;
  /** Per-unit margin band overrides (lifted by sourcing upgrades, CEO, etc.). */
  nrMarginBoost: number;
  ceoAdjustNet: number;
  /** Acquired competitor units start needing renovation before they perform. */
  needsRenovation: boolean;
  /** Last computed weekly figures for display/regression. */
  lastNet: number;
  lastRevenue: number;
  /** Actual rent charged last week (occupancy-capped), for display + tests. */
  lastRent: number;
}

/** A purchasable mega-chain in the acquisitions market. */
export interface GroupOffer {
  id: string;
  name: string;
  categoryId: string;
  units: number;
  askingPrice: number;
}

/** A small competitor chain (2-4 units) whose units need renovation. */
export interface CompetitorOffer {
  id: string;
  name: string;
  units: number;
  askingPrice: number;
}

export interface PersonalState {
  cash: number;
  bank: number;
  happiness: number;
  salary: number;
  homeId: string | null;
  carId: string | null;
  partner: { name: string; married: boolean } | null;
  kids: Kid[];
  luxuries: Array<{ catalogId: string; count: number }>;
  burnoutWeeks: number;
}

export interface Kid {
  id: string;
  name: string;
  /** child -> college -> graduated. */
  stage: "child" | "college" | "graduated";
  /** Business venture funded for this kid. */
  venture: "none" | "running" | "failed" | "exited";
  /** Weekly income to the player from a running venture. */
  ventureIncome: number;
}

export interface ExecutivesState {
  president: boolean;
  cmo: boolean;
  cfo: boolean;
  coo: boolean;
  facilities: boolean;
  proCeo: {
    hired: boolean;
    phase: "none" | "golden" | "decline" | "shift" | "failing";
    pressure: number;
    weeksInRole: number;
    goals: { newLocationsPerBrand: number; growChains: number; newBrands: number };
    pendingSitDown: boolean;
  };
  founderRole: "ceo" | "chairman" | "board";
}

/** A pending C-suite meeting decision awaiting the player's choice. */
export interface PendingMeeting {
  meetingId: string;
  week: number;
}

/** A private-equity buyout offer for one of the player's brands. */
export interface PeOffer {
  id: string;
  brandId: string;
  price: number;
}

/** A temporary company-wide revenue buff (from meetings/events). */
export interface ActiveBuff {
  revMult: number;
  weeksLeft: number;
  note: string;
}

export interface LogEntry {
  week: number;
  kind: string;
  message: string;
}

/** A weekly snapshot for the stats/history charts. */
export interface HistoryPoint {
  week: number;
  netWorth: number;
  cash: number;
  reputation: number;
  units: number;
  avgMargin: number;
}

/** An active complication with a deadline the player must resolve. */
export interface Complication {
  id: string;
  defId: string;
  message: string;
  deadlineWeek: number;
}

/** An active disaster dragging revenue for a few weeks. */
export interface ActiveDisaster {
  defId: string;
  name: string;
  revMult: number;
  weeksLeft: number;
}

export interface GameState {
  version: number;
  seed: number;
  difficulty: Difficulty;
  rngState: RngState;
  week: number;
  cash: number;
  reputation: number;
  companyName: string;

  brands: Brand[];
  locations: Location[];

  expansionPlan: {
    overextensionWeeks: number;
    locationsOpenedThisYear: number;
  };

  executives: ExecutivesState;
  ownRealEstatePolicy: boolean;

  /** Outstanding loan principal (accrues weekly interest). */
  debt: number;
  /** Fraction of the company sold to investors/PE (dividend on positive net). */
  investorEquity: number;

  /** Acquisition market: purchasable mega-chains and small competitor chains. */
  bigGroups: GroupOffer[];
  competitorChains: CompetitorOffer[];
  lastAcquisitionRefresh: number;

  /** Executive layer extras. */
  pendingMeeting: PendingMeeting | null;
  peOffers: PeOffer[];
  activeBuffs: ActiveBuff[];

  personal: PersonalState;

  complications: Complication[];
  activeDisasters: ActiveDisaster[];
  achievements: string[];
  /** Completed goal ids. */
  goals: string[];
  log: LogEntry[];
  /** Weekly snapshots for the stats/history panel. */
  history: HistoryPoint[];

  /** Monotonic id counter so generated ids stay deterministic. */
  nextId: number;
}

export interface NewGameOptions {
  seed?: number;
  companyName?: string;
  difficulty?: Difficulty;
}

/** Hash an arbitrary seed string into a 32-bit integer (for shareable seeds). */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Create a fresh game. Deterministic given a seed: the same seed always
 * yields the same starting state.
 */
export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = (opts.seed ?? 0x5e1ec7ed) >>> 0;
  const difficulty: Difficulty = opts.difficulty ?? "normal";
  const diff = DIFFICULTIES[difficulty];
  const rng = new Rng(seed);

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    difficulty,
    rngState: rng.toState(),
    week: 1,
    cash: diff.startingCash,
    reputation: 50,
    companyName: opts.companyName ?? "Shore Thing Holdings",

    brands: [],
    locations: [],

    expansionPlan: {
      overextensionWeeks: 0,
      locationsOpenedThisYear: 0,
    },

    executives: {
      president: false,
      cmo: false,
      cfo: false,
      coo: false,
      facilities: false,
      proCeo: {
        hired: false,
        phase: "none",
        pressure: 0,
        weeksInRole: 0,
        goals: { newLocationsPerBrand: 0, growChains: 0, newBrands: 0 },
        pendingSitDown: false,
      },
      founderRole: "ceo",
    },
    ownRealEstatePolicy: false,
    debt: 0,
    investorEquity: 0,

    bigGroups: [],
    competitorChains: [],
    lastAcquisitionRefresh: 0,

    pendingMeeting: null,
    peOffers: [],
    activeBuffs: [],

    personal: {
      cash: 0,
      bank: 0,
      happiness: 60,
      salary: 0,
      homeId: null,
      carId: null,
      partner: null,
      kids: [],
      luxuries: [],
      burnoutWeeks: 0,
    },

    complications: [],
    activeDisasters: [],
    achievements: [],
    goals: [],
    log: [],
    history: [],

    nextId: 1,
  };

  return state;
}

/** Allocate a deterministic unique id of the given kind. */
export function allocId(state: GameState, kind: string): string {
  const id = `${kind}_${state.nextId}`;
  state.nextId += 1;
  return id;
}
