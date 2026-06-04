import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/state.ts";
import { deserialize, migrate, serialize } from "../src/save/serialize.ts";
import { SAVE_VERSION } from "../src/data/index.ts";

describe("save round-trip", () => {
  it("deserialize(serialize(state)) reproduces an identical state", () => {
    const state = newGame({ seed: 555, companyName: "Test Co" });
    const restored = deserialize(serialize(state));
    expect(restored).toEqual(state);
  });

  it("preserves RNG state across a round-trip", () => {
    const state = newGame({ seed: 1234 });
    state.rngState.s = 0xabcdef;
    const restored = deserialize(serialize(state));
    expect(restored.rngState).toEqual(state.rngState);
  });

  it("migrates an older-version save without throwing", () => {
    const state = newGame({ seed: 1 });
    // Simulate an old save missing newer fields and tagged with version 0.
    const legacyLike = JSON.parse(serialize(state));
    legacyLike.version = 0;
    legacyLike.state.version = 0;
    delete legacyLike.state.achievements;
    delete legacyLike.state.ownRealEstatePolicy;

    const migrated = deserialize(JSON.stringify(legacyLike));
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.achievements).toEqual([]);
    expect(migrated.ownRealEstatePolicy).toBe(false);
  });

  it("migrate is a pure upgrade and does not throw on a current save", () => {
    const state = newGame({ seed: 9 });
    expect(() => migrate(state, SAVE_VERSION)).not.toThrow();
  });
});
