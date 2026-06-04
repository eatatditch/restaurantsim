/**
 * Light moddability: load balance-constant overrides from an external JSON so
 * tuning needs no rebuild. Place a `balance.json` in the deployed site root (or
 * host it anywhere) and the app deep-merges it over the defaults at startup,
 * BEFORE any game runs — preserving determinism within a session.
 *
 * Because the exported balance constants are objects, importers hold a
 * reference to the same object; deep-merging in place propagates everywhere.
 * Only a curated allowlist of top-level constants is overridable.
 *
 * Example balance.json:
 *   { "COMPANY": { "startingCash": 1000000 },
 *     "MARKET_MATURITY": { "ceiling": 1.8 } }
 */

import * as data from "./index";

type AnyRecord = Record<string, unknown>;

/** Top-level constants that may be overridden by external JSON. */
const ALLOWLIST: Record<string, unknown> = {
  COMPANY: data.COMPANY,
  MARKET_MATURITY: data.MARKET_MATURITY,
  EXPANSION: data.EXPANSION,
  FACILITIES: data.FACILITIES,
  FINANCE: data.FINANCE,
  VERTICAL_MARGIN_BANDS: data.VERTICAL_MARGIN_BANDS,
  PRICE_TIERS: data.PRICE_TIERS,
  LIFE: data.LIFE,
  COMPANY_DIFFICULTIES: data.DIFFICULTIES,
};

function isPlainObject(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge source into target in place (objects only; scalars overwrite). */
function deepMerge(target: AnyRecord, source: AnyRecord): void {
  for (const [key, val] of Object.entries(source)) {
    if (isPlainObject(val) && isPlainObject(target[key])) {
      deepMerge(target[key] as AnyRecord, val);
    } else {
      target[key] = val;
    }
  }
}

/**
 * Apply a parsed overrides object. Returns the list of top-level keys applied.
 * Unknown keys are ignored (so a typo can't corrupt the economy).
 */
export function applyBalanceOverrides(overrides: AnyRecord): string[] {
  const applied: string[] = [];
  for (const [key, val] of Object.entries(overrides)) {
    const target = ALLOWLIST[key];
    if (target && isPlainObject(target) && isPlainObject(val)) {
      deepMerge(target as AnyRecord, val);
      applied.push(key);
    }
  }
  return applied;
}

/**
 * Fetch and apply `balance.json` from a URL (default: site root). Silently
 * no-ops if the file is absent or invalid — the game runs on defaults.
 */
export async function loadBalanceOverrides(url = "/balance.json"): Promise<string[]> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as AnyRecord;
    return applyBalanceOverrides(json);
  } catch {
    return [];
  }
}
