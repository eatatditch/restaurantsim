# SHORE THING

A single-player restaurant-empire tycoon simulator. Grow one brand and one
location into a multi-brand, multi-vertical holding company — while running
your personal life in parallel. The core tension is **management bandwidth as
the bottleneck**.

## Architecture

The simulation is **pure and deterministic**, fully decoupled from rendering.

```
src/
  sim/    PURE simulation — no DOM, no Date.now, no Math.random
    rng.ts        seedable mulberry32 RNG (all randomness flows through this)
    state.ts      GameState type + newGame() factory
  data/   all balance constants, typed, in one place
  save/   serialize / deserialize / migrate + storage adapters
    serialize.ts  versioned JSON save with migration (hydrate equivalent)
    storage.ts    SaveAdapter seam + LocalStorageAdapter
    supabase.ts   Supabase Auth + cloud-save adapter
  ui/     rendering only (built in Phase 9)
  main.ts
tests/    Vitest suite locking in economic invariants
```

**Non-negotiables:** deterministic seedable RNG; the UI never mutates state
(actions return new state); all balance constants live in `src/data/`.

## Stack

- **Vite + TypeScript** (strict) — static client-side app
- **Vitest** — test suite
- **Supabase** — Auth + cloud saves (`restaurantsim` project)
- **Vercel** — static hosting (`eatatditchs-projects`)
- **GitHub** — `eatatditch/restaurantsim`

Saves persist to `localStorage` first and sync to Supabase when signed in.

## Scripts

```bash
npm run dev        # local dev server
npm run build      # typecheck + static production build
npm test           # run the Vitest suite
npm run typecheck  # tsc --noEmit
```

## Balance provenance

No legacy reference file was available, so all balance constants in
`src/data/` are **original**, authored from the build spec and meant to be
tuned. They are centralized so tuning is a data edit, not a code hunt.

## How to play

Press **SPACE** (or ▶ WEEK) to advance one week. Launch a brand, open
locations, and grow — but only as fast as your management capacity allows.
Hire a C-suite, acquire chains, run your personal life in parallel. **Escape**
closes modals. Saves persist to `localStorage` and sync to Supabase when
signed in (Settings → Cloud Saves).

## Build plan — complete ✅

Built in 10 phases; the test suite (79 tests) stays green.

1. **Scaffold + foundations** — Vite/TS/Vitest, seedable RNG, `GameState` +
   `newGame()`, save/serialize/migrate with Supabase seam.
2. **Restaurant core** — P&L, margin governor, market maturity, reputation.
3. **Real estate** — leases vs owned, escalations, Facilities Manager.
4. **Expansion** — single + bulk open, proposal builder, overextension.
5. **Brands & verticals** — positioning, non-restaurant verticals, digital DTC.
6. **Acquisitions** — big groups (aggregate divisions) + competitor chains.
7. **Executives** — C-suite + meetings, pro-CEO lifecycle + autonomy + PE offers.
8. **Life simulator** — money, homes/cars/luxuries, family, temptations, the
   happiness↔business loop.
9. **Meta + UI** — seasons/disasters/complications, achievements/goals, and the
   full coastal/arcade UI.
10. **Balance pass + ship** — scripted two-year regression, deployed on Vercel.

## Economic invariants (locked by tests)

Margin governor caps/floors/centers · rent occupancy cap · no negative-cash
exploits · overextension strain · market-maturity asymptotes · positioning
propagation · save round-trips + migration · full determinism.
