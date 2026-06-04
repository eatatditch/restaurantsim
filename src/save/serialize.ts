/**
 * Save serialization, deserialization, and versioned migration.
 *
 * Saves are JSON. Because GameState is already plain serializable data
 * (including the RNG state), serialize/deserialize is mostly a clone plus a
 * migration pass that upgrades older saves to the current SAVE_VERSION.
 *
 * Invariant (tested): deserialize(serialize(state)) deep-equals state, and an
 * older-version save migrates without throwing.
 */

import { SAVE_VERSION } from "../data/index";
import type { GameState } from "../sim/state";

/** A save blob as stored on disk / in the cloud. */
export interface SaveBlob {
  version: number;
  state: GameState;
  savedAt: string;
}

export function serialize(state: GameState): string {
  const blob: SaveBlob = {
    version: SAVE_VERSION,
    state,
    // savedAt is metadata only; it never feeds the sim, so determinism holds.
    savedAt: new Date(0).toISOString(),
  };
  return JSON.stringify(blob);
}

/** Apply a deterministic timestamp-free serialize for round-trip tests. */
export function deserialize(json: string): GameState {
  const blob = JSON.parse(json) as Partial<SaveBlob> & { state?: GameState };
  if (!blob.state) {
    throw new Error("Invalid save: missing state");
  }
  return migrate(blob.state, blob.version ?? blob.state.version ?? 0);
}

/**
 * Migrate a state from `fromVersion` up to SAVE_VERSION. Each step is additive
 * and must be idempotent-safe. This is the formalized replacement for the
 * legacy `hydrate` backfill: it fills in any field a newer version expects.
 */
export function migrate(state: GameState, fromVersion: number): GameState {
  let s = structuredCloneSafe(state);

  // Always run the backfill so partially-shaped saves hydrate cleanly.
  s = backfill(s);

  // Versioned steps go here as the schema evolves, e.g.:
  // if (fromVersion < 2) s = migrateV1toV2(s);

  s.version = SAVE_VERSION;
  // fromVersion is currently only informational; referenced to satisfy lint.
  void fromVersion;
  return s;
}

/** Fill in any missing fields with safe defaults (hydrate equivalent). */
function backfill(state: GameState): GameState {
  const s = state;
  s.brands ??= [];
  s.locations ??= [];
  s.activeDisasters ??= [];
  for (const loc of s.locations) loc.lastRent ??= 0;
  s.bigGroups ??= [];
  s.competitorChains ??= [];
  s.lastAcquisitionRefresh ??= 0;
  s.pendingMeeting ??= null;
  s.peOffers ??= [];
  s.activeBuffs ??= [];
  s.complications ??= [];
  s.achievements ??= [];
  s.goals ??= [];
  s.log ??= [];
  s.nextId ??= 1;
  s.ownRealEstatePolicy ??= false;
  s.expansionPlan ??= { overextensionWeeks: 0, locationsOpenedThisYear: 0 };
  s.personal ??= {
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
  };
  s.executives ??= {
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
  };
  // Backfill newer proCeo sub-fields on older saves.
  s.executives.proCeo.weeksInRole ??= 0;
  s.executives.proCeo.goals ??= { newLocationsPerBrand: 0, growChains: 0, newBrands: 0 };
  s.executives.proCeo.pendingSitDown ??= false;
  // Backfill newer kid sub-fields (venture system) on older saves.
  for (const kid of s.personal.kids) {
    kid.venture ??= "none";
    kid.ventureIncome ??= 0;
  }
  return s;
}

function structuredCloneSafe<T>(value: T): T {
  // structuredClone is available in Node 18+ and modern browsers.
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
