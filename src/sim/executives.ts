/**
 * Executives: C-suite roles + effects, C-suite meetings, and the pro-CEO
 * lifecycle + autonomy + PE buyout offers.
 *
 * The player hires execs (revenue/overhead effects + expansion capacity),
 * resolves periodic C-suite meetings (weighted random outcomes), and can hire
 * a pro-CEO and step up to a board role. The CEO then auto-expands toward goals
 * each quarter with no per-location approval, ages through a lifecycle, and
 * holds a quarterly sit-down. It can also surface PE buyout offers for brands.
 */

import {
  CEO,
  CSUITE_MEETINGS,
  EXECUTIVES,
  type ExecRole,
} from "../data/index";
import { findBrand } from "./brands";
import { openExpansionUnits } from "./expansion";
import { Rng } from "./rng";
import { allocId, type GameState } from "./state";
import { log } from "./util";

// ---------------------------------------------------------------------------
// C-suite roles
// ---------------------------------------------------------------------------

/** Total weekly executive salaries (facilities billed in advanceWeek). */
export function execSalaries(state: GameState): number {
  let total = 0;
  const ex = state.executives;
  if (ex.president) total += EXECUTIVES.president.weeklySalary;
  if (ex.cmo) total += EXECUTIVES.cmo.weeklySalary;
  if (ex.cfo) total += EXECUTIVES.cfo.weeklySalary;
  if (ex.coo) total += EXECUTIVES.coo.weeklySalary;
  if (ex.proCeo.hired) total += CEO.weeklySalary;
  return total;
}

/** Company-wide revenue multiplier from execs + CEO phase + active buffs. */
export function companyRevenueMult(state: GameState): number {
  const ex = state.executives;
  let m = 1;
  if (ex.president) m *= EXECUTIVES.president.revenueMult;
  if (ex.cmo) m *= EXECUTIVES.cmo.revenueMult;
  if (ex.cfo) m *= EXECUTIVES.cfo.revenueMult;
  if (ex.coo) m *= EXECUTIVES.coo.revenueMult;
  if (ex.proCeo.hired) m *= CEO.phaseRevenueMult[ex.proCeo.phase];
  for (const b of state.activeBuffs) m *= b.revMult;
  return m;
}

/** Company overhead multiplier from execs (lower = cheaper). */
export function companyOverheadMult(state: GameState): number {
  const ex = state.executives;
  let m = 1;
  if (ex.president) m *= EXECUTIVES.president.overheadMult;
  if (ex.cfo) m *= EXECUTIVES.cfo.overheadMult;
  if (ex.coo) m *= EXECUTIVES.coo.overheadMult;
  return m;
}

export function setExec(state: GameState, role: ExecRole, hired: boolean): void {
  state.executives[role] = hired;
  log(state, "exec", `${hired ? "Hired" : "Released"} ${EXECUTIVES[role].name}.`);
}

// ---------------------------------------------------------------------------
// C-suite meetings
// ---------------------------------------------------------------------------

/** Decrement active buffs and drop expired ones (called each week). */
export function tickBuffs(state: GameState): void {
  for (const b of state.activeBuffs) b.weeksLeft -= 1;
  state.activeBuffs = state.activeBuffs.filter((b) => b.weeksLeft > 0);
}

/** Periodically surface a C-suite meeting (only with a CMO or CEO present). */
export function maybeScheduleMeeting(state: GameState, rng: Rng): void {
  if (state.pendingMeeting) return;
  const hasExec = state.executives.cmo || state.executives.cfo || state.executives.proCeo.hired;
  if (!hasExec) return;
  // ~ once every 12 weeks on average.
  if (!rng.chance(1 / 12)) return;
  const meeting = rng.pick(CSUITE_MEETINGS);
  state.pendingMeeting = { meetingId: meeting.id, week: state.week };
  log(state, "exec", `C-suite meeting: ${meeting.title}.`);
}

/** Resolve a pending meeting by choosing an option; applies a weighted outcome. */
export function resolveMeeting(state: GameState, optionIndex: number, rng: Rng): void {
  if (!state.pendingMeeting) throw new Error("No pending meeting");
  const meeting = CSUITE_MEETINGS.find((m) => m.id === state.pendingMeeting!.meetingId);
  if (!meeting) throw new Error("Unknown meeting");
  const option = meeting.options[optionIndex];
  if (!option) throw new Error("Invalid option");

  const outcome = rng.weightedPick(
    option.outcomes,
    option.outcomes.map((o) => o.weight),
  );
  if (outcome.cash) state.cash += outcome.cash;
  if (outcome.reputation) {
    state.reputation = Math.min(100, Math.max(0, state.reputation + outcome.reputation));
  }
  if (outcome.buff) {
    state.activeBuffs.push({ revMult: outcome.buff.revMult, weeksLeft: outcome.buff.weeks, note: meeting.title });
  }
  log(state, "exec", `${meeting.title}: ${outcome.note}`);
  state.pendingMeeting = null;
}

// ---------------------------------------------------------------------------
// Pro-CEO lifecycle + autonomy
// ---------------------------------------------------------------------------

export function hireCeo(state: GameState): void {
  state.executives.proCeo.hired = true;
  state.executives.proCeo.phase = "golden";
  state.executives.proCeo.weeksInRole = 0;
  state.executives.proCeo.pressure = 20;
  state.executives.founderRole = "chairman";
  log(state, "ceo", "Hired a professional CEO; you step up to Chairman.");
}

export function setCeoGoals(
  state: GameState,
  goals: { newLocationsPerBrand: number; growChains: number; newBrands: number },
): void {
  state.executives.proCeo.goals = goals;
  log(state, "ceo", "Updated CEO expansion goals.");
}

/** Recompute the CEO's lifecycle phase from tenure and pressure. */
function updateCeoPhase(state: GameState): void {
  const ceo = state.executives.proCeo;
  if (!ceo.hired) {
    ceo.phase = "none";
    return;
  }
  if (ceo.pressure >= CEO.failingPressure) ceo.phase = "failing";
  else if (ceo.pressure >= CEO.shiftPressure) ceo.phase = "shift";
  else if (ceo.weeksInRole >= CEO.declineWeeks) ceo.phase = "decline";
  else if (ceo.weeksInRole >= CEO.goldenWeeks) ceo.phase = "decline";
  else ceo.phase = "golden";
}

/**
 * Weekly CEO autonomy tick: ages the CEO, runs quarterly autonomous builds
 * toward goals (no approval), creeps pressure, surfaces a quarterly sit-down,
 * and may surface a PE buyout offer.
 */
export function tickCeo(state: GameState, rng: Rng): void {
  const ceo = state.executives.proCeo;
  if (!ceo.hired || state.executives.founderRole === "ceo") return;

  ceo.weeksInRole += 1;

  // Quarterly cycle.
  if (ceo.weeksInRole % CEO.buildCycleWeeks === 0) {
    autonomousBuild(state, rng);
    ceo.pressure = Math.min(100, ceo.pressure + CEO.pressureCreep);
    ceo.pendingSitDown = true;

    if (rng.chance(CEO.peOfferChance)) surfacePeOffer(state, rng);
  }

  updateCeoPhase(state);
}

/** The CEO opens locations / scales chains / launches brands toward goals. */
function autonomousBuild(state: GameState, rng: Rng): void {
  const goals = state.executives.proCeo.goals;
  if (goals.newLocationsPerBrand > 0) {
    for (const brand of state.brands.filter((b) => b.vertical === "restaurant" && !b.acquired)) {
      openExpansionUnits(state, brand.id, goals.newLocationsPerBrand, { rng });
    }
  }
  log(state, "ceo", "CEO executed the quarterly expansion plan.");
}

function surfacePeOffer(state: GameState, rng: Rng): void {
  const candidates = state.brands.filter((b) => !b.acquired);
  if (candidates.length === 0) return;
  const brand = rng.pick(candidates);
  // Offer ~ a multiple of the brand's annualized net.
  const units = state.locations.filter((l) => l.brandId === brand.id);
  const annualNet = units.reduce((sum, u) => sum + u.lastNet, 0) * 52;
  const price = Math.max(2_000_000, Math.round(annualNet * rng.range(2.5, 4.5)));
  state.peOffers.push({ id: allocId(state, "pe"), brandId: brand.id, price });
  log(state, "ceo", `PE buyout offer surfaced for ${brand.name}: $${price.toLocaleString()}.`);
}

/**
 * The quarterly sit-down. `approve` eases pressure; `pushHarder` raises it and
 * the CEO's ambition (more aggressive builds) but risks a downward spiral.
 */
export function ceoSitDown(state: GameState, decision: "approve" | "pushHarder", rng: Rng): void {
  const ceo = state.executives.proCeo;
  if (!ceo.pendingSitDown) throw new Error("No pending CEO sit-down");

  if (decision === "approve") {
    ceo.pressure = Math.max(0, ceo.pressure - CEO.approveRelief);
    log(state, "ceo", "Approved the CEO's plan; pressure eases.");
  } else {
    ceo.pressure = Math.min(100, ceo.pressure + CEO.pushPenalty);
    ceo.goals.newLocationsPerBrand += 1;
    // Pushing a stressed CEO risks a spiral that degrades the phase.
    if (ceo.pressure >= CEO.shiftPressure && rng.chance(0.5)) {
      ceo.pressure = Math.min(100, ceo.pressure + 10);
      log(state, "ceo", "You pushed harder — the CEO is spiraling.");
    } else {
      log(state, "ceo", "You pushed harder; the CEO takes on more.");
    }
  }
  ceo.pendingSitDown = false;
  updateCeoPhase(state);
}

/** Accept a PE buyout offer: sell the brand and its units for cash. */
export function acceptPeOffer(state: GameState, offerId: string): number {
  const offer = state.peOffers.find((o) => o.id === offerId);
  if (!offer) throw new Error("Unknown PE offer");
  const brand = findBrand(state, offer.brandId);
  state.cash += offer.price;
  state.locations = state.locations.filter((l) => l.brandId !== brand.id);
  state.brands = state.brands.filter((b) => b.id !== brand.id);
  state.peOffers = state.peOffers.filter((o) => o.id !== offerId);
  log(state, "ceo", `Sold ${brand.name} to PE for $${offer.price.toLocaleString()}.`);
  return offer.price;
}
