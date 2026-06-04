/**
 * Save storage adapters.
 *
 * The sim is pure and never touches storage. The UI owns persistence through
 * a SaveAdapter, so we can swap localStorage for Supabase cloud saves without
 * touching game logic. This is the "clean seam for optional cloud saves" the
 * spec calls for — now backed by real Supabase Auth + a `saves` table.
 */

import { deserialize, serialize } from "./serialize.ts";
import type { GameState } from "../sim/state.ts";

export interface SaveSlot {
  id: string;
  updatedAt: string;
}

export interface SaveAdapter {
  /** Persist the current game under a slot id. */
  save(slotId: string, state: GameState): Promise<void>;
  /** Load a game by slot id, or null if absent. */
  load(slotId: string): Promise<GameState | null>;
  /** List available save slots. */
  list(): Promise<SaveSlot[]>;
  /** Remove a save. */
  remove(slotId: string): Promise<void>;
}

const LS_PREFIX = "shorething:save:";

/** Default local-first adapter. Always available, no account required. */
export class LocalStorageAdapter implements SaveAdapter {
  async save(slotId: string, state: GameState): Promise<void> {
    localStorage.setItem(LS_PREFIX + slotId, serialize(state));
  }

  async load(slotId: string): Promise<GameState | null> {
    const json = localStorage.getItem(LS_PREFIX + slotId);
    return json ? deserialize(json) : null;
  }

  async list(): Promise<SaveSlot[]> {
    const slots: SaveSlot[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LS_PREFIX)) {
        slots.push({ id: key.slice(LS_PREFIX.length), updatedAt: "" });
      }
    }
    return slots;
  }

  async remove(slotId: string): Promise<void> {
    localStorage.removeItem(LS_PREFIX + slotId);
  }
}
