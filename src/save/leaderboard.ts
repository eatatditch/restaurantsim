/**
 * Supabase-backed global leaderboard. Anyone can read the top scores and submit
 * their own (public RLS with light validation). The sim never imports this; the
 * UI calls it through the store.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface LeaderboardEntry {
  name: string;
  net_worth: number;
  brands: number;
  week: number;
  difficulty: string;
  created_at?: string;
}

export class LeaderboardClient {
  constructor(private readonly client: SupabaseClient) {}

  async top(limit = 20): Promise<LeaderboardEntry[]> {
    const { data, error } = await this.client
      .from("leaderboard")
      .select("name, net_worth, brands, week, difficulty, created_at")
      .order("net_worth", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Leaderboard read failed: ${error.message}`);
    return (data ?? []) as LeaderboardEntry[];
  }

  async submit(entry: Omit<LeaderboardEntry, "created_at">): Promise<void> {
    const { error } = await this.client.from("leaderboard").insert({
      name: entry.name.slice(0, 40),
      net_worth: Math.round(entry.net_worth),
      brands: entry.brands,
      week: entry.week,
      difficulty: entry.difficulty,
    });
    if (error) throw new Error(`Leaderboard submit failed: ${error.message}`);
  }
}
