/**
 * Small shared helpers for the sim. Kept dependency-free and pure.
 */

import type { GameState, LogEntry } from "./state";

/** Deep clone a state at an action/tick boundary so callers never mutate input. */
export function cloneState(state: GameState): GameState {
  if (typeof structuredClone === "function") return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** Append a log entry (mutates the passed-in draft state). */
export function log(state: GameState, kind: string, message: string): void {
  const entry: LogEntry = { week: state.week, kind, message };
  state.log.push(entry);
  // Keep the log bounded so long games don't grow without limit.
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
