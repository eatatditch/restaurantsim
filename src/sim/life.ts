/**
 * The life simulator: the player's personal life, run in parallel to the
 * business. Money (owner's draw, salary, savings), homes/cars/luxuries,
 * family/kids/college/ventures, temptations, and the happiness<->business loop.
 *
 * happinessMult feeds restaurant customer counts, so personal life materially
 * affects the company. Pure functions; randomness via the injected Rng.
 */

import {
  CARS,
  HOMES,
  LIFE,
  LUXURY_CATALOG,
  type LadderItem,
  type LuxuryItem,
} from "../data/index";
import { Rng } from "./rng";
import { allocId, type GameState, type PersonalState } from "./state";
import { clamp, log } from "./util";

function ladderItem(arr: readonly LadderItem[], id: string | null): LadderItem | null {
  if (!id) return null;
  return arr.find((x) => x.id === id) ?? null;
}

function luxuryItem(id: string): LuxuryItem {
  const item = LUXURY_CATALOG.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown luxury: ${id}`);
  return item;
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/** Total personal net worth: cash, savings, home/car resale, luxury resale. */
export function personalNetWorth(state: GameState): number {
  const p = state.personal;
  let nw = p.cash + p.bank;
  const home = ladderItem(HOMES, p.homeId);
  if (home) nw += home.cost * 0.85;
  const car = ladderItem(CARS, p.carId);
  if (car) nw += car.cost * 0.6;
  for (const lux of p.luxuries) {
    const item = luxuryItem(lux.catalogId);
    nw += item.cost * item.resale * lux.count;
  }
  return Math.round(nw);
}

/** The happiness target driven by home, car, partner, kids, and luxuries. */
export function lifestyleHappinessTarget(state: GameState): number {
  const p = state.personal;
  let target = LIFE.baseHappiness;
  const home = ladderItem(HOMES, p.homeId);
  if (home) target += home.happiness;
  const car = ladderItem(CARS, p.carId);
  if (car) target += car.happiness;
  if (p.partner) {
    target += LIFE.partnerHappiness;
    if (p.partner.married) target += LIFE.marriedHappiness;
  }
  for (const kid of p.kids) {
    target += LIFE.kidHappiness;
    if (kid.stage === "graduated") target += LIFE.collegeHappiness;
  }
  for (const lux of p.luxuries) {
    target += luxuryItem(lux.catalogId).happiness * lux.count;
  }
  return clamp(target, 0, 100);
}

/** Business multiplier from happiness: maps 0..100 into the configured band. */
export function happinessMult(state: GameState): number {
  const h = clamp(state.personal.happiness, 0, 100) / 100;
  return LIFE.businessHappinessMin + (LIFE.businessHappinessMax - LIFE.businessHappinessMin) * h;
}

/** Total weekly upkeep across home, car, and luxuries. */
export function weeklyUpkeep(p: PersonalState): number {
  let upkeep = 0;
  const home = ladderItem(HOMES, p.homeId);
  if (home) upkeep += home.upkeep;
  const car = ladderItem(CARS, p.carId);
  if (car) upkeep += car.upkeep;
  for (const lux of p.luxuries) {
    upkeep += luxuryItem(lux.catalogId).upkeep * lux.count;
  }
  return upkeep;
}

// ---------------------------------------------------------------------------
// Weekly personal tick
// ---------------------------------------------------------------------------

export function tickPersonal(state: GameState): void {
  const p = state.personal;

  // Owner's salary draw from the company (auto-draw).
  if (p.salary > 0 && state.cash >= p.salary) {
    state.cash -= p.salary;
    p.cash += p.salary;
  }

  // Venture income from running kid businesses.
  for (const kid of p.kids) {
    if (kid.venture === "running") p.cash += kid.ventureIncome;
  }

  // Savings interest.
  p.bank += p.bank * LIFE.savingsRate;

  // Lifestyle upkeep (paid from personal cash, can go negative into "debt").
  p.cash -= weeklyUpkeep(p);

  // Happiness moves toward its lifestyle target.
  const target = lifestyleHappinessTarget(state);
  p.happiness = clamp(p.happiness + (target - p.happiness) * LIFE.happinessLerp, 0, 100);

  // Burnout accrues when happiness is low; recovers otherwise.
  if (p.happiness < LIFE.burnoutThreshold) p.burnoutWeeks += 1;
  else if (p.burnoutWeeks > 0) p.burnoutWeeks -= 1;
}

// ---------------------------------------------------------------------------
// Actions (mutate the draft state; wrapped by actions.ts)
// ---------------------------------------------------------------------------

export function ownerDraw(state: GameState, amount: number): void {
  if (amount <= 0) throw new Error("Draw must be positive");
  if (state.cash < amount) throw new Error("Company cannot cover the draw");
  state.cash -= amount;
  state.personal.cash += amount;
  log(state, "life", `Owner's draw of $${amount.toLocaleString()}.`);
}

export function setSalary(state: GameState, salary: number): void {
  state.personal.salary = Math.max(0, Math.round(salary));
  log(state, "life", `Set owner salary to $${state.personal.salary.toLocaleString()}/wk.`);
}

export function depositSavings(state: GameState, amount: number): void {
  if (amount <= 0 || state.personal.cash < amount) throw new Error("Insufficient personal cash");
  state.personal.cash -= amount;
  state.personal.bank += amount;
}

export function withdrawSavings(state: GameState, amount: number): void {
  if (amount <= 0 || state.personal.bank < amount) throw new Error("Insufficient savings");
  state.personal.bank -= amount;
  state.personal.cash += amount;
}

export function buyLadder(state: GameState, kind: "home" | "car", id: string): void {
  const arr = kind === "home" ? HOMES : CARS;
  const item = arr.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown ${kind}: ${id}`);
  if (state.personal.cash < item.cost) throw new Error("Insufficient personal cash");
  state.personal.cash -= item.cost;
  if (kind === "home") state.personal.homeId = id;
  else state.personal.carId = id;
  log(state, "life", `Bought ${item.name}.`);
}

export function buyLuxury(state: GameState, catalogId: string): void {
  const item = luxuryItem(catalogId);
  if (state.personal.cash < item.cost) throw new Error("Insufficient personal cash");
  state.personal.cash -= item.cost;
  const existing = state.personal.luxuries.find((l) => l.catalogId === catalogId);
  if (existing) existing.count += 1;
  else state.personal.luxuries.push({ catalogId, count: 1 });
  log(state, "life", `Acquired ${item.name}.`);
}

export function sellLuxury(state: GameState, catalogId: string): void {
  const item = luxuryItem(catalogId);
  const owned = state.personal.luxuries.find((l) => l.catalogId === catalogId);
  if (!owned || owned.count <= 0) throw new Error("You don't own that");
  owned.count -= 1;
  if (owned.count <= 0) {
    state.personal.luxuries = state.personal.luxuries.filter((l) => l.catalogId !== catalogId);
  }
  const proceeds = Math.round(item.cost * item.resale);
  state.personal.cash += proceeds;
  log(state, "life", `Sold ${item.name} for $${proceeds.toLocaleString()}.`);
}

// --- Family ---

export function startDating(state: GameState, name: string): void {
  if (state.personal.partner) throw new Error("Already partnered");
  state.personal.partner = { name, married: false };
  log(state, "life", `Started dating ${name}.`);
}

export function marry(state: GameState): void {
  if (!state.personal.partner) throw new Error("No partner to marry");
  state.personal.partner.married = true;
  log(state, "life", `Married ${state.personal.partner.name}.`);
}

export function haveKid(state: GameState, name: string): void {
  if (!state.personal.partner) throw new Error("Need a partner first");
  state.personal.kids.push({ id: allocId(state, "kid"), name, stage: "child", venture: "none", ventureIncome: 0 });
  log(state, "life", `Welcomed ${name}.`);
}

export function sendToCollege(state: GameState, kidId: string): void {
  const kid = state.personal.kids.find((k) => k.id === kidId);
  if (!kid) throw new Error("Unknown kid");
  if (kid.stage !== "child") throw new Error("Kid is not college-age-eligible");
  if (state.personal.cash < LIFE.collegeCost) throw new Error("Insufficient personal cash");
  state.personal.cash -= LIFE.collegeCost;
  kid.stage = "graduated";
  log(state, "life", `${kid.name} graduated college.`);
}

/**
 * Fund a kid's business venture. Outcomes: fail (burn the capital), running
 * (weekly income to you for life), or — when sold later — an exit payout.
 */
export function fundVenture(state: GameState, kidId: string, rng: Rng): void {
  const kid = state.personal.kids.find((k) => k.id === kidId);
  if (!kid) throw new Error("Unknown kid");
  if (kid.venture !== "none") throw new Error("Venture already underway");
  if (state.personal.cash < LIFE.ventureCost) throw new Error("Insufficient personal cash");
  state.personal.cash -= LIFE.ventureCost;

  if (rng.chance(0.4)) {
    kid.venture = "failed";
    log(state, "life", `${kid.name}'s venture failed; capital burned.`);
  } else {
    kid.venture = "running";
    kid.ventureIncome = Math.round(LIFE.ventureCost * rng.range(0.01, 0.03));
    log(state, "life", `${kid.name}'s venture is running ($${kid.ventureIncome.toLocaleString()}/wk).`);
  }
}

/** Exit a running venture for a lump-sum payout. */
export function exitVenture(state: GameState, kidId: string, rng: Rng): void {
  const kid = state.personal.kids.find((k) => k.id === kidId);
  if (!kid || kid.venture !== "running") throw new Error("No running venture");
  const payout = Math.round(LIFE.ventureCost * rng.range(2, 6));
  state.personal.cash += payout;
  kid.venture = "exited";
  kid.ventureIncome = 0;
  log(state, "life", `${kid.name} exited the venture for $${payout.toLocaleString()}.`);
}

// --- Temptations ---

/**
 * An affair — heavily weighted toward disaster. Outcomes: caught + divorce
 * settlement (loses a chunk of personal net worth), caught + wrecked
 * relationship, or got away. Non-graphic.
 */
export function affair(state: GameState, rng: Rng): string {
  const roll = rng.next();
  if (roll < LIFE.affairCaughtDivorceChance) {
    // Caught; divorce settlement takes a chunk of net worth.
    const settlement = Math.round(personalNetWorth(state) * LIFE.divorceSettlement);
    const fromCash = Math.min(state.personal.cash, settlement);
    state.personal.cash -= fromCash;
    const remainder = settlement - fromCash;
    state.personal.bank = Math.max(0, state.personal.bank - remainder);
    state.personal.partner = null;
    state.personal.happiness = clamp(state.personal.happiness - 25, 0, 100);
    log(state, "life", `Affair discovered — divorce settlement cost $${settlement.toLocaleString()}.`);
    return "divorce";
  }
  if (roll < LIFE.affairCaughtDivorceChance + LIFE.affairCaughtWreckedChance) {
    state.personal.happiness = clamp(state.personal.happiness - 15, 0, 100);
    if (state.personal.partner) state.personal.partner.married = false;
    log(state, "life", "Affair discovered — the relationship is wrecked.");
    return "wrecked";
  }
  state.personal.happiness = clamp(state.personal.happiness + 4, 0, 100);
  log(state, "life", "The affair went unnoticed... this time.");
  return "gotaway";
}

/** A Vegas high-roller gamble. */
export function vegas(state: GameState, rng: Rng): string {
  if (state.personal.cash < LIFE.vegasStake) throw new Error("Insufficient personal cash to play");
  state.personal.cash -= LIFE.vegasStake;
  const roll = rng.next();
  if (roll < 0.45) {
    log(state, "life", `Vegas: lost the $${LIFE.vegasStake.toLocaleString()} stake.`);
    return "lost";
  }
  if (roll < 0.85) {
    const winnings = Math.round(LIFE.vegasStake * rng.range(1.5, 2.5));
    state.personal.cash += winnings;
    log(state, "life", `Vegas: won $${winnings.toLocaleString()}.`);
    return "won";
  }
  const jackpot = Math.round(LIFE.vegasStake * rng.range(5, 12));
  state.personal.cash += jackpot;
  state.personal.happiness = clamp(state.personal.happiness + 8, 0, 100);
  log(state, "life", `Vegas JACKPOT: $${jackpot.toLocaleString()}!`);
  return "jackpot";
}
