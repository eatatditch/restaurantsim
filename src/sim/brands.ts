/**
 * Brand creation and lookups. A brand has a vertical, a concept, and a
 * brand-level price positioning that propagates to every one of its units.
 */

import {
  RESTAURANT_CONCEPTS,
  type Positioning,
  type Vertical,
} from "../data/index.ts";
import { allocId, type Brand, type GameState } from "./state.ts";

export interface BrandSpec {
  name: string;
  vertical: Vertical;
  conceptId: string;
  positioning: Positioning;
  acquired?: boolean;
}

/** Evaluate a proposed brand concept (the creation-flow feedback step). */
export function evaluateBrand(spec: BrandSpec): { startingRep: number; note: string } {
  if (spec.vertical === "restaurant") {
    const concept = RESTAURANT_CONCEPTS.find((c) => c.id === spec.conceptId);
    if (!concept) throw new Error(`Unknown concept: ${spec.conceptId}`);
    const startingRep = 50 + concept.startingRepBonus;
    return { startingRep, note: `${concept.name} opens with strong word of mouth.` };
  }
  return { startingRep: 50, note: "Non-restaurant concept." };
}

export function createBrand(state: GameState, spec: BrandSpec): Brand {
  const evald = evaluateBrand(spec);
  const brand: Brand = {
    id: allocId(state, "brand"),
    name: spec.name,
    vertical: spec.vertical,
    conceptId: spec.conceptId,
    positioning: spec.positioning,
    acquired: spec.acquired ?? false,
    reputation: evald.startingRep,
  };
  return brand;
}

export function findBrand(state: GameState, brandId: string): Brand {
  const brand = state.brands.find((b) => b.id === brandId);
  if (!brand) throw new Error(`Unknown brand: ${brandId}`);
  return brand;
}

/** Units belonging to a brand (the brand "folder"). */
export function brandUnits(state: GameState, brandId: string) {
  return state.locations.filter((l) => l.brandId === brandId);
}
