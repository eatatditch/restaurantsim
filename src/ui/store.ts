/**
 * The UI store: the single owner of mutable game state on the client.
 *
 * The simulation stays pure — the store holds the current GameState, dispatches
 * pure actions (replacing state with their return value), persists to
 * localStorage and (when signed in) Supabase, and notifies subscribers to
 * re-render. The UI never mutates state directly.
 */

import { createSupabaseClient, SupabaseSaveAdapter } from "../save/supabase";
import { LocalStorageAdapter } from "../save/storage";
import { ActionError } from "../sim/actions";
import { advanceWeek } from "../sim/advanceWeek";
import { newGame, type GameState } from "../sim/state";
import { sfx } from "./sound";

const SLOT = "main";

interface ViteEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}
function env(): ViteEnv {
  try {
    return (import.meta as unknown as { env?: ViteEnv }).env ?? {};
  } catch {
    return {};
  }
}

export type Toast = { kind: "info" | "success" | "error"; message: string };

export class GameStore {
  state: GameState;
  toast: Toast | null = null;
  userEmail: string | null = null;

  private listeners = new Set<() => void>();
  private local = new LocalStorageAdapter();
  private supabase = (() => {
    const e = env();
    if (e.VITE_SUPABASE_URL && e.VITE_SUPABASE_ANON_KEY) {
      return createSupabaseClient(e.VITE_SUPABASE_URL, e.VITE_SUPABASE_ANON_KEY);
    }
    return null;
  })();
  private cloud: SupabaseSaveAdapter | null = null;

  constructor() {
    this.state = newGame();
  }

  get cloudEnabled(): boolean {
    return this.supabase !== null;
  }

  subscribe(fn: () => void): void {
    this.listeners.add(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /** Load from localStorage if a save exists; otherwise keep the fresh game. */
  async init(): Promise<void> {
    const saved = await this.local.load(SLOT).catch(() => null);
    if (saved) this.state = saved;

    if (this.supabase) {
      this.cloud = new SupabaseSaveAdapter(this.supabase);
      const { data } = await this.supabase.auth.getUser();
      this.userEmail = data.user?.email ?? null;
      this.supabase.auth.onAuthStateChange((_e, session) => {
        this.userEmail = session?.user?.email ?? null;
        this.notify();
      });
      if (this.userEmail) await this.pullCloud();
    }
    this.notify();
  }

  /** Dispatch a pure action; on success persist + re-render, on error toast. */
  dispatch(fn: (s: GameState) => GameState, opts: { sound?: keyof typeof sfx } = {}): boolean {
    try {
      this.state = fn(this.state);
      sfx[opts.sound ?? "click"]();
      this.persist();
      this.notify();
      return true;
    } catch (e) {
      if (e instanceof ActionError) {
        this.flash({ kind: "error", message: e.message });
        sfx.error();
      } else {
        this.flash({ kind: "error", message: (e as Error).message });
        sfx.error();
      }
      return false;
    }
  }

  /** Advance one week, noticing new achievements for a celebratory cue. */
  advance(): void {
    const before = this.state.achievements.length;
    this.state = advanceWeek(this.state);
    if (this.state.achievements.length > before) sfx.achievement();
    else sfx.tick();
    this.persist();
    this.notify();
  }

  startNewGame(companyName: string, seed?: number): void {
    this.state = newGame({ companyName, seed });
    this.persist();
    this.notify();
  }

  flash(toast: Toast): void {
    this.toast = toast;
    this.notify();
    setTimeout(() => {
      if (this.toast === toast) {
        this.toast = null;
        this.notify();
      }
    }, 3200);
  }

  private persist(): void {
    void this.local.save(SLOT, this.state).catch(() => {});
    if (this.cloud && this.userEmail) void this.cloud.save(SLOT, this.state).catch(() => {});
  }

  // --- Cloud auth ---

  async signIn(email: string): Promise<void> {
    if (!this.supabase) throw new Error("Cloud not configured");
    const { error } = await this.supabase.auth.signInWithOtp({ email });
    if (error) throw error;
    this.flash({ kind: "info", message: `Magic link sent to ${email}. Check your email.` });
  }

  async signOut(): Promise<void> {
    if (!this.supabase) return;
    await this.supabase.auth.signOut();
    this.userEmail = null;
    this.notify();
  }

  async pullCloud(): Promise<void> {
    if (!this.cloud || !this.userEmail) return;
    const cloudState = await this.cloud.load(SLOT).catch(() => null);
    if (cloudState && cloudState.week >= this.state.week) {
      this.state = cloudState;
      this.notify();
    }
  }

  // --- Export / import ---

  exportSave(): string {
    return JSON.stringify(this.state);
  }

  importSave(json: string): void {
    this.state = JSON.parse(json) as GameState;
    this.persist();
    this.notify();
  }
}
