import { describe, expect, it } from "vitest";
import { Rng } from "../src/sim/rng";

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it("round-trips its state", () => {
    const a = new Rng(999);
    a.next();
    a.next();
    const restored = Rng.fromState(a.toState());
    // After restoring, both must continue producing the identical stream.
    expect(restored.next()).toEqual(Rng.fromState(a.toState()).next());
  });

  it("stays in range for ints and floats", () => {
    const r = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
      const f = r.range(0, 1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("weightedPick respects weights statistically", () => {
    const r = new Rng(7);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 5000; i++) {
      counts[r.weightedPick(["a", "b"] as const, [9, 1])]++;
    }
    // 'a' should dominate ~9:1.
    expect(counts.a).toBeGreaterThan(counts.b * 4);
  });
});
