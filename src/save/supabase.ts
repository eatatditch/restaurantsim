/**
 * Supabase cloud-save adapter + Auth.
 *
 * Backs the SaveAdapter seam with Supabase Auth (login) and a `saves` table
 * holding one versioned save JSON per slot per user. The sim never imports
 * this file; only the UI/persistence layer does. Row-level security on the
 * `saves` table ensures a user can only read/write their own rows.
 *
 * Schema (applied via migration on the `restaurantsim` Supabase project):
 *
 *   create table public.saves (
 *     user_id uuid not null references auth.users(id) on delete cascade,
 *     slot_id text not null,
 *     version int not null,
 *     blob jsonb not null,
 *     updated_at timestamptz not null default now(),
 *     primary key (user_id, slot_id)
 *   );
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deserialize, serialize } from "./serialize";
import type { SaveAdapter, SaveSlot } from "./storage";
import type { GameState } from "../sim/state";

export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

export class SupabaseSaveAdapter implements SaveAdapter {
  constructor(private readonly client: SupabaseClient) {}

  private async userId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw new Error("Not signed in");
    return data.user.id;
  }

  async save(slotId: string, state: GameState): Promise<void> {
    const user_id = await this.userId();
    // serialize() validates/normalizes; we store the parsed blob as jsonb.
    const blob = JSON.parse(serialize(state));
    const { error } = await this.client
      .from("saves")
      .upsert({ user_id, slot_id: slotId, version: state.version, blob });
    if (error) throw new Error(`Cloud save failed: ${error.message}`);
  }

  async load(slotId: string): Promise<GameState | null> {
    const user_id = await this.userId();
    const { data, error } = await this.client
      .from("saves")
      .select("blob")
      .eq("user_id", user_id)
      .eq("slot_id", slotId)
      .maybeSingle();
    if (error) throw new Error(`Cloud load failed: ${error.message}`);
    if (!data) return null;
    return deserialize(JSON.stringify(data.blob));
  }

  async list(): Promise<SaveSlot[]> {
    const user_id = await this.userId();
    const { data, error } = await this.client
      .from("saves")
      .select("slot_id, updated_at")
      .eq("user_id", user_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Cloud list failed: ${error.message}`);
    return (data ?? []).map((r) => ({ id: r.slot_id as string, updatedAt: r.updated_at as string }));
  }

  async remove(slotId: string): Promise<void> {
    const user_id = await this.userId();
    const { error } = await this.client
      .from("saves")
      .delete()
      .eq("user_id", user_id)
      .eq("slot_id", slotId);
    if (error) throw new Error(`Cloud delete failed: ${error.message}`);
  }
}
