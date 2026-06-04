/**
 * Financing: debt (loans) and equity (angel / VC / private-equity raises).
 *
 * Loans add cash now and accrue weekly interest on the outstanding principal.
 * Capital raises add cash in exchange for permanent equity; investors then take
 * a dividend share of positive weekly net. Borrowing capacity scales with the
 * company's trailing revenue.
 *
 * All functions mutate the draft state (wrapped by actions.ts / advanceWeek).
 */

import { CAPITAL_ROUNDS, FINANCE, type CapitalRound } from "../data/index";
import { log } from "./util";
import type { GameState } from "./state";

/** Trailing annualized company revenue (from last week's per-unit figures). */
export function trailingAnnualRevenue(state: GameState): number {
  const weekly = state.locations
    .filter((l) => l.status === "open")
    .reduce((sum, l) => sum + l.lastRevenue, 0);
  return weekly * 52;
}

/** How much more the company can borrow right now. */
export function borrowingCapacity(state: GameState): number {
  const ceiling = trailingAnnualRevenue(state) * FINANCE.leverageOfRevenue + FINANCE.baseBorrowingCapacity;
  return Math.max(0, Math.round(ceiling - state.debt));
}

export function takeLoan(state: GameState, amount: number): void {
  const amt = Math.floor(amount);
  if (amt <= 0) throw new Error("Loan must be positive");
  if (amt > borrowingCapacity(state)) throw new Error("Exceeds borrowing capacity");
  state.cash += amt;
  state.debt += amt;
  log(state, "finance", `Took a $${amt.toLocaleString()} loan.`);
}

export function repayLoan(state: GameState, amount: number): void {
  const amt = Math.floor(amount);
  if (amt <= 0) throw new Error("Repayment must be positive");
  const pay = Math.min(amt, state.debt, state.cash);
  if (pay <= 0) throw new Error("Nothing to repay or insufficient cash");
  state.cash -= pay;
  state.debt -= pay;
  log(state, "finance", `Repaid $${pay.toLocaleString()} of debt.`);
}

/** Raise capital, selling equity. Returns the equity fraction sold. */
export function raiseCapital(state: GameState, round: CapitalRound, amount: number): number {
  const def = CAPITAL_ROUNDS[round];
  const amt = Math.floor(amount);
  if (amt < def.minRaise) throw new Error(`${def.name} requires at least $${def.minRaise.toLocaleString()}`);
  const equity = amt * def.equityPerDollar;
  if (state.investorEquity + equity > FINANCE.maxEquitySold) {
    throw new Error("Too much equity already sold");
  }
  state.cash += amt;
  state.investorEquity += equity;
  log(state, "finance", `${def.name}: raised $${amt.toLocaleString()} for ${(equity * 100).toFixed(1)}% equity.`);
  return equity;
}

/** Buy back investor equity at a premium to the cash-in valuation. */
export function buyBackEquity(state: GameState, fraction: number): void {
  const f = Math.min(fraction, state.investorEquity);
  if (f <= 0) throw new Error("No equity to buy back");
  // Valuation: trailing revenue x2 as enterprise value, 1.5x premium.
  const enterpriseValue = trailingAnnualRevenue(state) * 2;
  const price = Math.round(enterpriseValue * f * 1.5);
  if (state.cash < price) throw new Error(`Buyback costs $${price.toLocaleString()}`);
  state.cash -= price;
  state.investorEquity -= f;
  log(state, "finance", `Bought back ${(f * 100).toFixed(1)}% equity for $${price.toLocaleString()}.`);
}

/**
 * Weekly financing effects, applied to the company's weekly net before it hits
 * cash: loan interest (a cost) and the investor dividend on positive net.
 * Returns the adjusted weekly net.
 */
export function applyFinancing(state: GameState, weeklyNet: number): number {
  let net = weeklyNet;
  // Interest on outstanding debt.
  if (state.debt > 0) net -= state.debt * FINANCE.loanWeeklyRate;
  // Investors take their dividend share of any positive net.
  if (state.investorEquity > 0 && net > 0) net -= net * state.investorEquity;
  return net;
}
