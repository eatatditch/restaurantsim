/**
 * Meta systems: seasons, disasters, complications, achievements, and goals.
 *
 * Seasons are deterministic by week. Disasters and complications roll through
 * the injected Rng. Achievements/goals are checked each week and recorded once.
 * All functions mutate the draft state (called inside advanceWeek).
 */

import {
  ACHIEVEMENTS,
  COMPLICATIONS,
  COMPLICATION_WEEKLY_CHANCE,
  DISASTERS,
  DISASTER_WEEKLY_CHANCE,
  GOALS,
  SEASONS,
  type GoalDef,
} from "../data/index";
import { personalNetWorth } from "./life";
import { Rng } from "./rng";
import { allocId, type GameState } from "./state";
import { log } from "./util";

/** The season for a given week (4 x 13-week seasons per year). */
export function seasonForWeek(week: number): (typeof SEASONS)[number] {
  const idx = Math.floor(((week - 1) % 52) / 13);
  return SEASONS[idx];
}

/** Combined seasonal + active-disaster revenue multiplier. */
export function seasonAndDisasterMult(state: GameState): number {
  let m = seasonForWeek(state.week).revMult;
  for (const d of state.activeDisasters) m *= d.revMult;
  return m;
}

/** Roll disasters and tick down active ones. */
export function tickDisasters(state: GameState, rng: Rng): void {
  for (const d of state.activeDisasters) d.weeksLeft -= 1;
  state.activeDisasters = state.activeDisasters.filter((d) => d.weeksLeft > 0);

  if (rng.chance(DISASTER_WEEKLY_CHANCE)) {
    const def = rng.pick(DISASTERS);
    state.activeDisasters.push({ defId: def.id, name: def.name, revMult: def.revMult, weeksLeft: def.weeks });
    state.cash -= def.cost;
    log(state, "disaster", `${def.name} struck — cleanup cost $${def.cost.toLocaleString()}.`);
  }
}

/** Roll new complications and lapse expired unresolved ones. */
export function tickComplications(state: GameState, rng: Rng): void {
  // Lapse complications past their deadline (reputation hit).
  const lapsed = state.complications.filter((c) => state.week > c.deadlineWeek);
  for (const c of lapsed) {
    const def = COMPLICATIONS.find((d) => d.id === c.defId);
    if (def) {
      state.reputation = Math.max(0, state.reputation - def.lapsePenalty);
      log(state, "complication", `${def.name} lapsed — reputation took a hit.`);
    }
  }
  state.complications = state.complications.filter((c) => state.week <= c.deadlineWeek);

  // Roll a new complication (only once units exist).
  if (state.locations.length > 0 && rng.chance(COMPLICATION_WEEKLY_CHANCE)) {
    const def = rng.pick(COMPLICATIONS);
    state.complications.push({
      id: allocId(state, "cplx"),
      defId: def.id,
      message: def.message,
      deadlineWeek: state.week + def.deadlineWeeks,
    });
    log(state, "complication", `${def.name}: ${def.message}`);
  }
}

/** Resolve a complication by paying its cost. */
export function resolveComplication(state: GameState, complicationId: string): void {
  const c = state.complications.find((x) => x.id === complicationId);
  if (!c) throw new Error("Unknown complication");
  const def = COMPLICATIONS.find((d) => d.id === c.defId);
  if (!def) throw new Error("Unknown complication type");
  if (state.cash < def.resolveCost) throw new Error("Insufficient funds to resolve");
  state.cash -= def.resolveCost;
  state.complications = state.complications.filter((x) => x.id !== complicationId);
  log(state, "complication", `Resolved ${def.name} for $${def.resolveCost.toLocaleString()}.`);
}

/** Check and record newly-earned achievements. */
export function checkAchievements(state: GameState): void {
  const has = (id: string) => state.achievements.includes(id);
  const earn = (id: string) => {
    if (!has(id)) {
      state.achievements.push(id);
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      log(state, "achievement", `Achievement unlocked: ${def?.name ?? id}.`);
    }
  };

  const openCount = state.locations.filter((l) => l.status === "open").length;
  if (openCount >= 1) earn("first_location");
  if (openCount >= 10) earn("ten_locations");
  if (openCount >= 50) earn("fifty_locations");
  if (state.cash >= 1_000_000) earn("millionaire");
  if (state.brands.length >= 3) earn("multibrand");
  if (personalNetWorth(state) >= 100_000_000) earn("tycoon");
  if (state.brands.some((b) => b.acquired)) earn("acquirer");
  if (state.locations.some((l) => l.digital)) earn("digital");
}

/** Current numeric progress toward a goal. */
export function goalProgress(state: GameState, goal: GoalDef): number {
  switch (goal.metric) {
    case "locations":
      return state.locations.filter((l) => l.status === "open").length;
    case "brands":
      return state.brands.length;
    case "cash":
      return state.cash;
    case "reputation":
      return state.reputation;
  }
}

/** Check and record newly-completed goals. */
export function checkGoals(state: GameState): void {
  for (const goal of GOALS) {
    if (state.goals.includes(goal.id)) continue;
    if (goalProgress(state, goal) >= goal.target) {
      state.goals.push(goal.id);
      log(state, "goal", `Goal complete: ${goal.name}.`);
    }
  }
}

/** Master meta tick, called from advanceWeek. */
export function tickEvents(state: GameState, rng: Rng): void {
  tickDisasters(state, rng);
  tickComplications(state, rng);
  checkAchievements(state);
  checkGoals(state);
}
