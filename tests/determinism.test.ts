import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/state";
import { Rng } from "../src/sim/rng";

/**
 * Determinism is the foundational invariant for the whole sim. Until
 * advanceWeek lands in Phase 2, we prove the primitives it will rely on:
 * newGame() is seed-deterministic, and an RNG driven through the serialized
 * state advances identically when restored.
 */
describe("determinism foundations", () => {
  it("newGame is byte-identical for the same seed", () => {
    const a = newGame({ seed: 2026, companyName: "Shore Thing" });
    const b = newGame({ seed: 2026, companyName: "Shore Thing" });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("newGame differs across seeds", () => {
    const a = newGame({ seed: 1 });
    const b = newGame({ seed: 2 });
    expect(a.seed).not.toEqual(b.seed);
    expect(a.rngState).not.toEqual(b.rngState);
  });

  it("an RNG resumed from serialized state continues the same stream", () => {
    const game = newGame({ seed: 4242 });
    // Drive an RNG, persist its state back to the game, then resume.
    const live = Rng.fromState(game.rngState);
    const drawn = [live.next(), live.next(), live.next()];
    game.rngState = live.toState();

    const resumed = Rng.fromState(game.rngState);
    const resumedDraws = [resumed.next(), resumed.next()];

    // A fresh run from the same seed reproduces the exact sequence.
    const fresh = new Rng(4242);
    const freshDraws = [fresh.next(), fresh.next(), fresh.next(), fresh.next(), fresh.next()];
    expect([...drawn, ...resumedDraws]).toEqual(freshDraws);
  });
});
