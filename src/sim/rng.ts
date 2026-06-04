/**
 * Deterministic, seedable RNG (mulberry32).
 *
 * The entire simulation draws randomness exclusively through an instance of
 * this generator. Because its full internal state is a single 32-bit integer,
 * we can serialize/restore it inside the save file, which is what makes the
 * game reproducible: same seed + same action script => byte-identical state.
 *
 * Never call Math.random() anywhere in src/sim.
 */

export interface RngState {
  /** Current 32-bit internal state of the generator. */
  s: number;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Coerce into an unsigned 32-bit integer.
    this.state = seed >>> 0;
  }

  /** Restore an RNG from previously serialized state. */
  static fromState(state: RngState): Rng {
    const rng = new Rng(0);
    rng.state = state.s >>> 0;
    return rng;
  }

  /** Snapshot the generator's state for serialization. */
  toState(): RngState {
    return { s: this.state >>> 0 };
  }

  /** Next float in [0, 1). */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a uniformly random element. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick on empty array");
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * Weighted pick. `weights[i]` is the relative weight of `arr[i]`.
   * Weights need not sum to 1.
   */
  weightedPick<T>(arr: readonly T[], weights: readonly number[]): T {
    if (arr.length === 0) throw new Error("Rng.weightedPick on empty array");
    if (arr.length !== weights.length) {
      throw new Error("Rng.weightedPick length mismatch");
    }
    let total = 0;
    for (const w of weights) total += w;
    let roll = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      roll -= weights[i];
      if (roll < 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
}
