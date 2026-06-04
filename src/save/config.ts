/**
 * Supabase client configuration, read from Vite env vars. The publishable
 * (anon) key is designed to be embedded client-side; row-level security on the
 * `saves` table is what actually protects user data.
 *
 * Returns null when env vars are absent so the app cleanly falls back to
 * local-only saves (e.g. in tests or offline).
 */

import { createSupabaseClient, SupabaseSaveAdapter } from "./supabase.ts";
import { LocalStorageAdapter, type SaveAdapter } from "./storage.ts";

interface ViteEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

function readEnv(): ViteEnv {
  // import.meta.env exists under Vite; guard for non-Vite contexts (tests).
  try {
    return (import.meta as unknown as { env?: ViteEnv }).env ?? {};
  } catch {
    return {};
  }
}

/** Build the active cloud adapter, or null if Supabase isn't configured. */
export function makeCloudAdapter(): SaveAdapter | null {
  const env = readEnv();
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  const client = createSupabaseClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  return new SupabaseSaveAdapter(client);
}

/** Always-available local adapter. */
export function makeLocalAdapter(): SaveAdapter {
  return new LocalStorageAdapter();
}
