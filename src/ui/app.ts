/**
 * The SHORE THING UI. Renders every view as a pure function of game state and
 * dispatches pure actions through the store. Built from real DOM elements.
 */

import {
  ACHIEVEMENTS,
  CARS,
  CITY_MARKETS,
  CSUITE_MEETINGS,
  EXECUTIVES,
  GOALS,
  HOMES,
  LOCATION_SETTINGS,
  LUXURY_CATALOG,
  NR_VERTICALS,
  PRICE_TIERS,
  RESTAURANT_CONCEPTS,
  type ExecRole,
  type Positioning,
  type TrafficTier,
  type Vertical,
} from "../data/index";
import * as A from "../sim/actions";
import { findBrand } from "../sim/brands";
import { goalProgress, seasonForWeek } from "../sim/events";
import { lifestyleHappinessTarget, personalNetWorth } from "../sim/life";
import { managementCapacity } from "../sim/expansion";
import type { Brand, GameState, Location } from "../sim/state";
import { h, render } from "./dom";
import { money, moneyFull, pct, titleCase } from "./format";
import { isMuted, toggleMute } from "./sound";
import { GameStore } from "./store";

type ViewId = "dashboard" | "portfolio" | "acquisitions" | "executives" | "realestate" | "life" | "settings";

let store: GameStore;
let view: ViewId = "dashboard";
let openBrandId: string | null = null;
let modal: HTMLElement | null = null;

export async function startApp(root: HTMLElement): Promise<void> {
  store = new GameStore();
  await store.init();
  store.subscribe(() => renderAll(root));

  window.addEventListener("keydown", (e) => {
    if (e.key === " " && !modal && !isTyping()) {
      e.preventDefault();
      store.advance();
    } else if (e.key === "Escape" && modal) {
      closeModal();
    }
  });

  renderAll(root);
}

function isTyping(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
}

// ---------------------------------------------------------------------------
// Top-level render
// ---------------------------------------------------------------------------

function renderAll(root: HTMLElement): void {
  const s = store.state;
  render(root, topbar(s), nav(), viewEl(s), toastEl());
  if (modal) document.body.appendChild(modal);
}

function topbar(s: GameState): HTMLElement {
  const season = seasonForWeek(s.week);
  return h(
    "div",
    { class: "topbar" },
    h("div", { class: "brandmark" }, "SHORE ", h("span", { class: "b2" }, "THING")),
    h(
      "div",
      { class: "metrics" },
      metric("Week", `${s.week}`, ""),
      metric("Season", season.name, ""),
      metric("Cash", money(s.cash), s.cash >= 0 ? "good" : "bad"),
      metric("Reputation", s.reputation.toFixed(0), ""),
      metric("Net Worth", money(personalNetWorth(s) + s.cash), ""),
    ),
    h("button", { class: "advance-btn", onClick: () => store.advance(), title: "Advance one week (spacebar)" }, "▶ WEEK"),
  );
}

function metric(label: string, value: string, cls: string): HTMLElement {
  return h("div", { class: "metric" }, h("div", { class: "label" }, label), h("div", { class: `value ${cls}` }, value));
}

function nav(): HTMLElement {
  const tabs: [ViewId, string][] = [
    ["dashboard", "Dashboard"],
    ["portfolio", "Portfolio"],
    ["acquisitions", "Acquisitions"],
    ["executives", "Executives"],
    ["realestate", "Real Estate"],
    ["life", "Life"],
    ["settings", "Settings"],
  ];
  return h(
    "div",
    { class: "nav" },
    ...tabs.map(([id, label]) =>
      h(
        "button",
        {
          class: view === id ? "active" : "",
          onClick: () => {
            view = id;
            openBrandId = null;
            renderAll(document.getElementById("app")!);
          },
        },
        label,
      ),
    ),
  );
}

function viewEl(s: GameState): HTMLElement {
  switch (view) {
    case "dashboard": return dashboardView(s);
    case "portfolio": return portfolioView(s);
    case "acquisitions": return acquisitionsView(s);
    case "executives": return executivesView(s);
    case "realestate": return realestateView(s);
    case "life": return lifeView(s);
    case "settings": return settingsView(s);
  }
}

function toastEl(): HTMLElement | null {
  if (!store.toast) return null;
  return h("div", { class: `toast ${store.toast.kind}` }, store.toast.message);
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function openModal(title: string, body: HTMLElement, actions: HTMLElement[]): void {
  const m = h(
    "div",
    { class: "modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget) closeModal(); } },
    h("div", { class: "modal" }, h("h2", {}, title), body, h("div", { class: "btn-row" }, ...actions)),
  );
  modal = m;
  document.body.appendChild(m);
}

function closeModal(): void {
  modal?.remove();
  modal = null;
  renderAll(document.getElementById("app")!);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function dashboardView(s: GameState): HTMLElement {
  const open = s.locations.filter((l) => l.status === "open");
  const weeklyNet = open.reduce((sum, l) => sum + l.lastNet, 0);
  const weeklyRev = open.reduce((sum, l) => sum + l.lastRevenue, 0);

  const coach = onboarding(s);

  return h(
    "div",
    { class: "view" },
    coach,
    h("div", { class: "section-title" }, s.companyName),
    h(
      "div",
      { class: "grid" },
      h("div", { class: "card" },
        h("h3", {}, "Weekly P&L"),
        statline("Revenue", money(weeklyRev)),
        statline("Net", money(weeklyNet)),
        statline("Open units", `${open.length}`),
        statline("Brands", `${s.brands.length}`),
        statline("Mgmt capacity / yr", `${managementCapacity(s)}`),
        statline("Opened this year", `${s.expansionPlan.locationsOpenedThisYear}`),
      ),
      goalsCard(s),
      achievementsCard(s),
      feedCard(s),
    ),
  );
}

function onboarding(s: GameState): HTMLElement | null {
  if (s.brands.length === 0) {
    return h("div", { class: "coachmark" },
      h("b", {}, "Welcome to Shore Thing. "),
      "Start by launching your first brand — pick a concept and a price position. ",
      h("div", { class: "btn-row" }, h("button", { class: "btn warn", onClick: newBrandModal }, "＋ Launch first brand")),
    );
  }
  if (s.locations.length === 0) {
    return h("div", { class: "coachmark" },
      h("b", {}, "Open a location. "),
      "Your brand needs a home. Head to Portfolio and open your first unit, then press ",
      h("span", { class: "mono" }, "SPACE"), " to advance the week.",
    );
  }
  if (s.week < 6) {
    return h("div", { class: "coachmark" },
      "Press ", h("span", { class: "mono" }, "SPACE"), " (or ▶ WEEK) to run a week. Watch reputation and maturity climb. Grow only as fast as your management capacity allows.",
    );
  }
  return null;
}

function goalsCard(s: GameState): HTMLElement {
  return h("div", { class: "card" },
    h("h3", {}, "Goals"),
    ...GOALS.map((g) => {
      const done = s.goals.includes(g.id);
      const prog = Math.min(goalProgress(s, g) / g.target, 1);
      return h("div", { style: "margin:8px 0" },
        h("div", { class: "row" }, h("span", { style: "font-size:13px" }, g.name), h("span", { class: "mono", style: "font-size:11px" }, done ? "✓" : pct(prog))),
        h("div", { class: "progress" }, h("div", { style: `width:${prog * 100}%` })),
      );
    }),
  );
}

function achievementsCard(s: GameState): HTMLElement {
  return h("div", { class: "card" },
    h("h3", {}, "Achievements"),
    h("div", { class: "pill-row", style: "margin-top:8px" },
      ...ACHIEVEMENTS.map((a) => {
        const got = s.achievements.includes(a.id);
        return h("span", { class: `ach ${got ? "" : "locked"}`, title: a.description }, got ? h("span", { class: "dot" }) : "", a.name);
      }),
    ),
  );
}

function feedCard(s: GameState): HTMLElement {
  const entries = [...s.log].slice(-40).reverse();
  return h("div", { class: "card" },
    h("h3", {}, "Feed"),
    h("div", { class: "feed" },
      entries.length === 0 ? h("div", { class: "empty" }, "No activity yet.") :
      h("div", {}, ...entries.map((e) => h("div", { class: "entry" }, h("span", { class: "wk" }, `W${e.week}`), e.message))),
    ),
  );
}

function statline(k: string, v: string): HTMLElement {
  return h("div", { class: "statline" }, h("span", { class: "k" }, k), h("span", { class: "v" }, v));
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

function portfolioView(s: GameState): HTMLElement {
  if (openBrandId) return brandFolderView(s, openBrandId);

  return h("div", { class: "view" },
    h("div", { class: "row" },
      h("div", { class: "section-title" }, "Portfolio"),
      h("button", { class: "btn warn", onClick: newBrandModal }, "＋ New Brand"),
    ),
    s.brands.length === 0
      ? h("div", { class: "empty" }, "No brands yet. Launch your first one.")
      : h("div", { class: "grid" }, ...s.brands.map((b) => brandFolderCard(s, b))),
  );
}

function brandFolderCard(s: GameState, b: Brand): HTMLElement {
  const units = s.locations.filter((l) => l.brandId === b.id);
  const open = units.filter((u) => u.status === "open");
  const net = open.reduce((sum, u) => sum + u.lastNet, 0);
  return h("div", { class: "card folder", onClick: () => { openBrandId = b.id; renderAll(document.getElementById("app")!); } },
    h("div", { class: "row" },
      h("h3", {}, b.name),
      h("span", { class: `tag ${b.positioning}` }, PRICE_TIERS[b.positioning].name),
    ),
    h("div", { class: "sub" }, `${titleCase(b.vertical)}${b.acquired ? " · acquired" : ""}`),
    statline("Units", `${units.length} (${open.length} open)`),
    statline("Weekly net", money(net)),
    statline("Reputation", b.reputation.toFixed(0)),
  );
}

function brandFolderView(s: GameState, brandId: string): HTMLElement {
  const b = s.brands.find((x) => x.id === brandId);
  if (!b) { openBrandId = null; return portfolioView(s); }
  const units = s.locations.filter((l) => l.brandId === b.id);

  const actions: HTMLElement[] = [
    h("button", { class: "btn ghost", onClick: () => { openBrandId = null; renderAll(document.getElementById("app")!); } }, "← Back"),
  ];
  if (b.vertical === "restaurant" && !b.acquired) {
    actions.push(h("button", { class: "btn warn", onClick: () => openLocationModal(b.id) }, "＋ Open Location"));
    actions.push(h("button", { class: "btn", onClick: () => bulkOpenModal(b.id) }, "Bulk Open"));
  }
  if ((b.vertical as Vertical) !== "restaurant" && (b.vertical as Vertical) !== "group") {
    actions.push(h("button", { class: "btn warn", onClick: () => openNonRestaurantModal(b.id) }, "＋ Open Unit"));
  }
  if (b.vertical === "apparel" && units.some((u) => !u.digital)) {
    actions.push(h("button", { class: "btn", onClick: () => store.dispatch((st) => A.actGoFullyDigital(st, b.id), { sound: "success" }) }, "Go Fully Digital"));
  }
  if (b.vertical === "group") {
    actions.push(h("button", { class: "btn", onClick: () => scaleGroupModal(b.id) }, "Build Out Stores"));
  }

  return h("div", { class: "view" },
    h("div", { class: "row" }, h("div", { class: "section-title" }, b.name), h("span", { class: `tag ${b.positioning}` }, PRICE_TIERS[b.positioning].name)),
    positioningPanel(b),
    h("div", { class: "btn-row" }, ...actions),
    units.length === 0 ? h("div", { class: "empty" }, "No units yet.") :
    h("div", { class: "grid", style: "margin-top:14px" }, ...units.map((u) => unitCard(s, u))),
  );
}

function positioningPanel(b: Brand): HTMLElement {
  if (b.vertical === "group") return h("div", {});
  return h("div", { class: "card" },
    h("h3", {}, "Brand Positioning"),
    h("div", { class: "sub" }, "Applies to every location of this brand."),
    h("div", { class: "btn-row" },
      ...(["budget", "standard", "premium", "luxury"] as Positioning[]).map((p) =>
        h("button", { class: `btn ${b.positioning === p ? "warn" : "ghost"}`, onClick: () => store.dispatch((st) => A.actSetPositioning(st, b.id, p)) }, PRICE_TIERS[p].name),
      ),
    ),
  );
}

function unitCard(_s: GameState, u: Location): HTMLElement {
  const city = CITY_MARKETS.find((c) => c.id === u.cityId)?.name ?? u.cityId;
  const statusTag = u.status === "building" ? "building" : "open";
  const tags = [
    h("span", { class: `tag ${statusTag}` }, u.status === "building" ? `Building (W${u.opensWeek})` : "Open"),
    u.digital ? h("span", { class: "tag digital" }, "Digital") : h("span", { class: `tag ${u.lease ? "leased" : "owned"}` }, u.lease ? "Leased" : "Owned"),
    u.needsRenovation ? h("span", { class: "tag reno" }, "Needs Reno") : null,
  ].filter(Boolean) as HTMLElement[];

  const body: HTMLElement[] = [
    h("div", { class: "row" }, h("h3", {}, u.digital ? "Global DTC" : city), h("div", { class: "pill-row" }, ...tags)),
    statline("Weekly net", money(u.lastNet)),
    statline("Weekly rev", money(u.lastRevenue)),
    statline("Maturity", u.maturity.toFixed(2)),
  ];
  if (u.lease) body.push(statline("Rent/wk", moneyFull(u.lease.weeklyRent)));
  if (u.vertical === "group") body.push(statline("Stores", `${u.storeCount}`));

  const ctl: HTMLElement[] = [];
  if (u.vertical === "restaurant" && !u.needsRenovation) {
    for (const up of ["kitchen", "decor", "marketing"] as const) {
      ctl.push(h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actBuyUpgrade(st, u.id, up), { sound: "cash" }) }, `${titleCase(up)} ▲ (${u.upgrades[up]})`));
    }
  }
  if (u.vertical !== "restaurant" && u.vertical !== "group") {
    ctl.push(h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actBuyNrUpgrade(st, u.id, "sourcing"), { sound: "cash" }) }, `Sourcing ▲ (${u.nrUpgrades.sourcing})`));
    ctl.push(h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actBuyNrUpgrade(st, u.id, "brand"), { sound: "cash" }) }, `Brand ▲ (${u.nrUpgrades.brand})`));
  }
  if (u.lease && !u.digital) {
    ctl.push(h("button", { class: "btn", onClick: () => store.dispatch((st) => A.actBuyLand(st, u.id), { sound: "cash" }) }, "Buy Building"));
  }
  if (u.needsRenovation) {
    ctl.push(h("button", { class: "btn warn", onClick: () => renovateModal(u.id) }, "Renovate"));
  }
  if (ctl.length) body.push(h("div", { class: "btn-row" }, ...ctl));

  return h("div", { class: "card" }, ...body);
}

// ---------------------------------------------------------------------------
// Modals: brand / location / bulk / non-restaurant / scale / renovate
// ---------------------------------------------------------------------------

function newBrandModal(): void {
  let name = "";
  let vertical: Vertical = "restaurant";
  let conceptId = RESTAURANT_CONCEPTS[0].id;
  let positioning: Positioning = "standard";

  const conceptSelect = h("select", { onChange: (e) => { conceptId = (e.target as HTMLSelectElement).value; } },
    ...RESTAURANT_CONCEPTS.map((c) => h("option", { value: c.id }, c.name))) as HTMLSelectElement;

  const verticalSelect = h("select", {
    onChange: (e) => {
      vertical = (e.target as HTMLSelectElement).value as Vertical;
      conceptSelect.disabled = vertical !== "restaurant";
    },
  },
    h("option", { value: "restaurant" }, "Restaurant"),
    ...(["apparel", "cpg", "realestate", "venue", "resort"] as const).map((v) => h("option", { value: v }, NR_VERTICALS[v].name)),
  ) as HTMLSelectElement;

  const body = h("div", {},
    field("Brand name", h("input", { placeholder: "e.g. The Catch", onInput: (e) => { name = (e.target as HTMLInputElement).value; } })),
    field("Vertical", verticalSelect),
    field("Concept", conceptSelect),
    field("Positioning", h("select", { onChange: (e) => { positioning = (e.target as HTMLSelectElement).value as Positioning; } },
      ...(["budget", "standard", "premium", "luxury"] as Positioning[]).map((p) => h("option", { value: p, ...(p === "standard" ? { } : {}) }, PRICE_TIERS[p].name)))),
  );

  openModal("Launch a Brand", body, [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => {
      if (!name.trim()) { store.flash({ kind: "error", message: "Name your brand." }); return; }
      const concept = vertical === "restaurant" ? conceptId : vertical;
      if (store.dispatch((st) => A.actCreateBrand(st, { name: name.trim(), vertical, conceptId: concept, positioning }), { sound: "success" })) closeModal();
    } }, "Launch"),
  ]);
}

function siteSelectors(): { el: HTMLElement; get: () => { cityId: string; settingId: string; trafficTier: TrafficTier; financing: string } } {
  let cityId = CITY_MARKETS[0].id;
  let settingId = LOCATION_SETTINGS[0].id;
  let trafficTier: TrafficTier = "medium";
  let financing = "standard";
  const el = h("div", {},
    field("City", h("select", { onChange: (e) => { cityId = (e.target as HTMLSelectElement).value; } }, ...CITY_MARKETS.map((c) => h("option", { value: c.id }, c.name)))),
    field("Format", h("select", { onChange: (e) => { settingId = (e.target as HTMLSelectElement).value; } }, ...LOCATION_SETTINGS.map((c) => h("option", { value: c.id }, c.name)))),
    field("Traffic", h("select", { onChange: (e) => { trafficTier = (e.target as HTMLSelectElement).value as TrafficTier; } },
      h("option", { value: "low" }, "Low"), h("option", { value: "medium" }, "Medium"), h("option", { value: "high" }, "High"))),
    field("Financing", h("select", { onChange: (e) => { financing = (e.target as HTMLSelectElement).value; } },
      h("option", { value: "standard" }, "Lease (5-Year)"), h("option", { value: "short" }, "Lease (3-Year)"), h("option", { value: "long" }, "Lease (10-Year)"), h("option", { value: "buy" }, "Buy & Own"))),
  );
  return { el, get: () => ({ cityId, settingId, trafficTier, financing }) };
}

function openLocationModal(brandId: string): void {
  const sel = siteSelectors();
  openModal("Open a Location", sel.el, [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => {
      const v = sel.get();
      const buy = v.financing === "buy";
      const leaseTermId = buy ? null : v.financing;
      if (store.dispatch((st) => A.actOpenLocation(st, { brandId, site: { cityId: v.cityId, settingId: v.settingId, trafficTier: v.trafficTier, leaseTermId }, buyLand: buy }), { sound: "cash" })) closeModal();
    } }, "Build"),
  ]);
}

function bulkOpenModal(brandId: string): void {
  let count = 3;
  const input = h("input", { type: "number", value: 3, min: 1, max: 25, onInput: (e) => { count = parseInt((e.target as HTMLInputElement).value || "0", 10); } }) as HTMLInputElement;
  const body = h("div", {},
    h("div", { class: "sub" }, "Opens N units of this brand using the proposal builder. Past your management capacity, openings get rushed and the company strains."),
    field("How many", input),
    h("div", { class: "btn-row" }, ...[3, 5, 10].map((n) => h("button", { class: "btn ghost", onClick: () => { count = n; input.value = String(n); } }, `+${n}`))),
  );
  openModal("Bulk Open", body, [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { if (store.dispatch((st) => A.actBulkOpen(st, { brandId, count }), { sound: "cash" })) closeModal(); } }, "Open"),
  ]);
}

function openNonRestaurantModal(brandId: string): void {
  let cityId = CITY_MARKETS[0].id;
  let buy = false;
  const body = h("div", {},
    field("City", h("select", { onChange: (e) => { cityId = (e.target as HTMLSelectElement).value; } }, ...CITY_MARKETS.map((c) => h("option", { value: c.id }, c.name)))),
    field("Financing", h("select", { onChange: (e) => { buy = (e.target as HTMLSelectElement).value === "buy"; } }, h("option", { value: "lease" }, "Lease"), h("option", { value: "buy" }, "Buy & Own"))),
  );
  openModal("Open Unit", body, [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { if (store.dispatch((st) => A.actOpenNonRestaurant(st, { brandId, cityId, buyLand: buy }), { sound: "cash" })) closeModal(); } }, "Build"),
  ]);
}

function scaleGroupModal(brandId: string): void {
  const s = store.state;
  const division = s.locations.find((l) => l.brandId === brandId && l.vertical === "group");
  if (!division) return;
  let count = 10;
  const input = h("input", { type: "number", value: 10, min: 1, onInput: (e) => { count = parseInt((e.target as HTMLInputElement).value || "0", 10); } }) as HTMLInputElement;
  const body = h("div", {},
    h("div", { class: "sub" }, `Current stores: ${division.storeCount}. Build out more at the per-store cost.`),
    field("Add stores", input),
    h("div", { class: "btn-row" }, ...[5, 10, 25].map((n) => h("button", { class: "btn ghost", onClick: () => { count = n; input.value = String(n); } }, `+${n}`))),
  );
  openModal("Build Out Stores", body, [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { if (store.dispatch((st) => A.actScaleGroupDivision(st, division.id, count), { sound: "cash" })) closeModal(); } }, "Build"),
  ]);
}

function renovateModal(locId: string): void {
  const s = store.state;
  const myBrands = s.brands.filter((b) => b.vertical === "restaurant" && !b.acquired);
  if (myBrands.length === 0) { store.flash({ kind: "error", message: "Create a restaurant brand to renovate into." }); return; }
  let target = myBrands[0].id;
  const body = h("div", {},
    h("div", { class: "sub" }, "Flip this acquired unit into one of your own brands."),
    field("Target brand", h("select", { onChange: (e) => { target = (e.target as HTMLSelectElement).value; } }, ...myBrands.map((b) => h("option", { value: b.id }, b.name)))),
  );
  openModal("Renovate Unit", body, [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { if (store.dispatch((st) => A.actRenovateUnit(st, locId, target), { sound: "success" })) closeModal(); } }, "Renovate"),
  ]);
}

// ---------------------------------------------------------------------------
// Acquisitions
// ---------------------------------------------------------------------------

function acquisitionsView(s: GameState): HTMLElement {
  return h("div", { class: "view" },
    h("div", { class: "section-title" }, "Acquisitions Market"),
    h("h3", { style: "color:var(--sand)" }, "Big Groups"),
    s.bigGroups.length === 0 ? h("div", { class: "empty" }, "Advance a week to refresh the market.") :
    h("div", { class: "grid" }, ...s.bigGroups.map((g) =>
      h("div", { class: "card" },
        h("h3", {}, g.name),
        h("div", { class: "sub" }, `${g.units} stores`),
        statline("Asking", money(g.askingPrice)),
        h("div", { class: "btn-row" }, h("button", { class: "btn warn", onClick: () => store.dispatch((st) => A.actAcquireBigGroup(st, g.id), { sound: "cash" }) }, "Acquire")),
      ))),
    h("h3", { style: "color:var(--sand);margin-top:18px" }, "Competitor Chains"),
    s.competitorChains.length === 0 ? h("div", { class: "empty" }, "None on the market.") :
    h("div", { class: "grid" }, ...s.competitorChains.map((c) =>
      h("div", { class: "card" },
        h("h3", {}, c.name),
        h("div", { class: "sub" }, `${c.units} units · need renovation`),
        statline("Asking", money(c.askingPrice)),
        h("div", { class: "btn-row" }, h("button", { class: "btn warn", onClick: () => store.dispatch((st) => A.actAcquireCompetitor(st, c.id), { sound: "cash" }) }, "Acquire")),
      ))),
  );
}

// ---------------------------------------------------------------------------
// Executives
// ---------------------------------------------------------------------------

function executivesView(s: GameState): HTMLElement {
  const ex = s.executives;
  const roleCard = (role: ExecRole) => {
    const def = EXECUTIVES[role];
    const hired = ex[role];
    return h("div", { class: "card" },
      h("h3", {}, def.name),
      statline("Salary/wk", moneyFull(def.weeklySalary)),
      statline("Revenue", `×${def.revenueMult}`),
      statline("Overhead", `×${def.overheadMult}`),
      h("div", { class: "btn-row" }, h("button", { class: `btn ${hired ? "ghost" : "warn"}`, onClick: () => store.dispatch((st) => A.actSetExec(st, role, !hired)) }, hired ? "Release" : "Hire")),
    );
  };

  const cards: HTMLElement[] = [roleCard("president"), roleCard("cmo"), roleCard("cfo"), roleCard("coo")];

  // Pro-CEO card.
  const ceo = ex.proCeo;
  cards.push(h("div", { class: "card" },
    h("h3", {}, "Professional CEO"),
    ceo.hired
      ? h("div", {},
          statline("Phase", titleCase(ceo.phase)),
          statline("Pressure", ceo.pressure.toFixed(0)),
          statline("Founder role", titleCase(ex.founderRole)),
          statline("New units/brand/qtr", `${ceo.goals.newLocationsPerBrand}`),
          h("div", { class: "btn-row" },
            h("button", { class: "btn ghost", onClick: () => ceoGoalsModal() }, "Set Goals"),
            ceo.pendingSitDown ? h("button", { class: "btn warn", onClick: () => store.dispatch((st) => A.actCeoSitDown(st, "approve"), { sound: "success" }) }, "Approve") : null,
            ceo.pendingSitDown ? h("button", { class: "btn", onClick: () => store.dispatch((st) => A.actCeoSitDown(st, "pushHarder")) }, "Push Harder") : null,
          ),
        )
      : h("div", {},
          h("div", { class: "sub" }, "Hire a CEO to auto-expand toward goals while you step up to the board."),
          h("div", { class: "btn-row" }, h("button", { class: "btn warn", onClick: () => store.dispatch((st) => A.actHireCeo(st), { sound: "success" }) }, "Hire CEO")),
        ),
  ));

  const extras: HTMLElement[] = [];
  if (s.pendingMeeting) {
    const meeting = CSUITE_MEETINGS.find((m) => m.id === s.pendingMeeting!.meetingId)!;
    extras.push(h("div", { class: "card", style: "border-color:var(--orange)" },
      h("h3", {}, `Meeting: ${meeting.title}`),
      h("div", { class: "sub" }, meeting.prompt),
      h("div", { class: "btn-row" }, ...meeting.options.map((o, i) => h("button", { class: "btn warn", onClick: () => store.dispatch((st) => A.actResolveMeeting(st, i), { sound: "success" }) }, o.label))),
    ));
  }
  for (const offer of s.peOffers) {
    const brand = s.brands.find((b) => b.id === offer.brandId);
    extras.push(h("div", { class: "card", style: "border-color:var(--coral)" },
      h("h3", {}, "PE Buyout Offer"),
      h("div", { class: "sub" }, `${brand?.name ?? "A brand"} — ${money(offer.price)}`),
      h("div", { class: "btn-row" }, h("button", { class: "btn warn", onClick: () => store.dispatch((st) => A.actAcceptPeOffer(st, offer.id), { sound: "cash" }) }, "Accept & Sell")),
    ));
  }

  return h("div", { class: "view" },
    h("div", { class: "section-title" }, "Executive Suite"),
    extras.length ? h("div", { class: "grid", style: "margin-bottom:14px" }, ...extras) : null,
    h("div", { class: "grid" }, ...cards),
  );
}

function ceoGoalsModal(): void {
  let n = store.state.executives.proCeo.goals.newLocationsPerBrand;
  const body = h("div", {},
    h("div", { class: "sub" }, "How many new locations should the CEO open per brand each quarter?"),
    field("New locations / brand / quarter", h("input", { type: "number", value: n, min: 0, max: 10, onInput: (e) => { n = parseInt((e.target as HTMLInputElement).value || "0", 10); } })),
  );
  openModal("CEO Goals", body, [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { store.dispatch((st) => A.actSetCeoGoals(st, { newLocationsPerBrand: n, growChains: 0, newBrands: 0 })); closeModal(); } }, "Save"),
  ]);
}

// ---------------------------------------------------------------------------
// Real estate
// ---------------------------------------------------------------------------

function realestateView(s: GameState): HTMLElement {
  const leased = s.locations.filter((l) => l.lease).length;
  const owned = s.locations.filter((l) => !l.lease && l.status === "open").length;
  return h("div", { class: "view" },
    h("div", { class: "section-title" }, "Real Estate"),
    h("div", { class: "grid" },
      h("div", { class: "card" },
        h("h3", {}, "Portfolio"),
        statline("Leased units", `${leased}`),
        statline("Owned units", `${owned}`),
      ),
      h("div", { class: "card" },
        h("h3", {}, "Buy & Own Policy"),
        h("div", { class: "sub" }, "When on, all new openings buy the building."),
        h("div", { class: "btn-row" }, h("button", { class: `btn ${s.ownRealEstatePolicy ? "warn" : "ghost"}`, onClick: () => store.dispatch((st) => A.actSetOwnPolicy(st, !st.ownRealEstatePolicy)) }, s.ownRealEstatePolicy ? "On" : "Off")),
      ),
      h("div", { class: "card" },
        h("h3", {}, "Facilities Manager"),
        h("div", { class: "sub" }, "Auto-buys at lease expiry and runs a weekly ownership sweep."),
        h("div", { class: "btn-row" }, h("button", { class: `btn ${s.executives.facilities ? "warn" : "ghost"}`, onClick: () => store.dispatch((st) => A.actSetFacilities(st, !st.executives.facilities)) }, s.executives.facilities ? "Employed" : "Hire")),
      ),
      h("div", { class: "card" },
        h("h3", {}, "Buy Out All Leases"),
        h("div", { class: "sub" }, "Company cash first, then personal funds. Unaffordable units are flagged."),
        h("div", { class: "btn-row" }, h("button", { class: "btn warn", onClick: () => store.dispatch((st) => A.actBuyOutAllLeases(st), { sound: "cash" }) }, "Buy Out All")),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------

function lifeView(s: GameState): HTMLElement {
  const p = s.personal;
  return h("div", { class: "view" },
    h("div", { class: "section-title" }, "Life"),
    h("div", { class: "grid" },
      h("div", { class: "card" },
        h("h3", {}, "Money"),
        statline("Personal cash", moneyFull(p.cash)),
        statline("Savings", moneyFull(p.bank)),
        statline("Salary/wk", moneyFull(p.salary)),
        statline("Net worth", money(personalNetWorth(s))),
        h("div", { class: "btn-row" },
          h("button", { class: "btn", onClick: () => amountModal("Owner's Draw", (n) => A.actOwnerDraw(s, n)) }, "Draw"),
          h("button", { class: "btn ghost", onClick: () => amountModal("Set Salary", (n) => A.actSetSalary(s, n)) }, "Salary"),
          h("button", { class: "btn ghost", onClick: () => amountModal("Deposit Savings", (n) => A.actDeposit(s, n)) }, "Deposit"),
          h("button", { class: "btn ghost", onClick: () => amountModal("Withdraw Savings", (n) => A.actWithdraw(s, n)) }, "Withdraw"),
        ),
      ),
      h("div", { class: "card" },
        h("h3", {}, "Happiness"),
        statline("Current", p.happiness.toFixed(0)),
        statline("Target", lifestyleHappinessTarget(s).toFixed(0)),
        statline("Burnout weeks", `${p.burnoutWeeks}`),
      ),
      ladderCard("Home", HOMES, p.homeId, (id) => A.actBuyHome(s, id)),
      ladderCard("Car", CARS, p.carId, (id) => A.actBuyCar(s, id)),
      luxuriesCard(s),
      familyCard(s),
      temptationsCard(s),
    ),
  );
}

function ladderCard(title: string, items: readonly { id: string; name: string; cost: number; happiness: number; upkeep: number }[], current: string | null, buy: (id: string) => GameState): HTMLElement {
  return h("div", { class: "card" },
    h("h3", {}, title),
    h("div", { class: "sub" }, current ? `Current: ${items.find((i) => i.id === current)?.name}` : "None yet"),
    h("div", { style: "margin-top:8px" }, ...items.map((i) =>
      h("div", { class: "row", style: "margin:6px 0" },
        h("span", { style: "font-size:13px" }, `${i.name} · ${money(i.cost)}`),
        h("button", { class: "btn ghost", disabled: current === i.id, onClick: () => store.dispatch(() => buy(i.id), { sound: "cash" }) }, current === i.id ? "Owned" : "Buy"),
      ))),
  );
}

function luxuriesCard(s: GameState): HTMLElement {
  return h("div", { class: "card" },
    h("h3", {}, "Lifestyle & Assets"),
    h("div", { style: "margin-top:8px" }, ...LUXURY_CATALOG.map((l) => {
      const owned = s.personal.luxuries.find((x) => x.catalogId === l.id)?.count ?? 0;
      return h("div", { class: "row", style: "margin:6px 0" },
        h("span", { style: "font-size:13px" }, `${l.name} · ${money(l.cost)}${owned ? ` ×${owned}` : ""}`),
        h("div", { class: "pill-row" },
          h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actBuyLuxury(st, l.id), { sound: "cash" }) }, "Buy"),
          owned ? h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actSellLuxury(st, l.id), { sound: "cash" }) }, "Sell") : null,
        ),
      );
    })),
  );
}

function familyCard(s: GameState): HTMLElement {
  const p = s.personal;
  const ctl: HTMLElement[] = [];
  if (!p.partner) ctl.push(h("button", { class: "btn ghost", onClick: () => textModal("Start Dating", "Partner's name", (name) => A.actStartDating(s, name)) }, "Date"));
  if (p.partner && !p.partner.married) ctl.push(h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actMarry(st), { sound: "success" }) }, "Marry"));
  if (p.partner) ctl.push(h("button", { class: "btn ghost", onClick: () => textModal("New Arrival", "Child's name", (name) => A.actHaveKid(s, name)) }, "Have Kid"));

  return h("div", { class: "card" },
    h("h3", {}, "Family"),
    h("div", { class: "sub" }, p.partner ? `${p.partner.name}${p.partner.married ? " (married)" : ""}` : "Single"),
    ...p.kids.map((k) => h("div", { class: "row", style: "margin:6px 0" },
      h("span", { style: "font-size:13px" }, `${k.name} · ${k.stage}${k.venture !== "none" ? ` · venture ${k.venture}` : ""}`),
      h("div", { class: "pill-row" },
        k.stage === "child" ? h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actSendToCollege(st, k.id), { sound: "cash" }) }, "College") : null,
        k.venture === "none" ? h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actFundVenture(st, k.id), { sound: "cash" }) }, "Fund Venture") : null,
        k.venture === "running" ? h("button", { class: "btn ghost", onClick: () => store.dispatch((st) => A.actExitVenture(st, k.id), { sound: "cash" }) }, "Exit Venture") : null,
      ),
    )),
    h("div", { class: "btn-row" }, ...ctl),
  );
}

function temptationsCard(s: GameState): HTMLElement {
  return h("div", { class: "card" },
    h("h3", {}, "Temptations"),
    h("div", { class: "sub" }, "High risk. Real consequences."),
    h("div", { class: "btn-row" },
      s.personal.partner ? h("button", { class: "btn", onClick: () => confirmModal("Have an affair? This rarely ends well.", () => A.actAffair(s)) }, "Affair") : null,
      h("button", { class: "btn", onClick: () => store.dispatch((st) => A.actVegas(st), { sound: "cash" }) }, "Vegas"),
    ),
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function settingsView(s: GameState): HTMLElement {
  const cloud = store.cloudEnabled
    ? (store.userEmail
        ? h("div", {}, h("div", { class: "sub" }, `Signed in as ${store.userEmail}. Saves sync to the cloud.`), h("div", { class: "btn-row" }, h("button", { class: "btn ghost", onClick: () => store.signOut() }, "Sign Out")))
        : h("div", {}, h("div", { class: "sub" }, "Sign in to sync saves across devices."), h("div", { class: "btn-row" }, h("button", { class: "btn warn", onClick: () => textModal("Sign In", "you@example.com", (email) => { store.signIn(email).catch((e) => store.flash({ kind: "error", message: e.message })); return s; }) }, "Sign In with Email"))))
    : h("div", { class: "sub" }, "Cloud saves not configured.");

  return h("div", { class: "view" },
    h("div", { class: "section-title" }, "Settings"),
    h("div", { class: "grid" },
      h("div", { class: "card" }, h("h3", {}, "Cloud Saves"), cloud),
      h("div", { class: "card" }, h("h3", {}, "Sound"),
        h("div", { class: "btn-row" }, h("button", { class: "btn ghost", onClick: () => { toggleMute(); renderAll(document.getElementById("app")!); } }, isMuted() ? "Unmute" : "Mute"))),
      h("div", { class: "card" }, h("h3", {}, "New Game"),
        h("div", { class: "sub" }, "Start fresh. Your current game is overwritten."),
        h("div", { class: "btn-row" }, h("button", { class: "btn warn", onClick: () => textModal("New Game", "Company name", (name) => { store.startNewGame(name || "Shore Thing Holdings"); return store.state; }) }, "Start New Game"))),
      h("div", { class: "card" }, h("h3", {}, "Export / Import"),
        h("div", { class: "btn-row" },
          h("button", { class: "btn ghost", onClick: () => exportModal() }, "Export Save"),
          h("button", { class: "btn ghost", onClick: () => importModal() }, "Import Save"),
        )),
    ),
  );
}

// ---------------------------------------------------------------------------
// Generic input modals
// ---------------------------------------------------------------------------

function field(label: string, control: HTMLElement): HTMLElement {
  return h("label", { class: "field" }, label, control);
}

function amountModal(title: string, action: (n: number) => GameState): void {
  let n = 0;
  openModal(title, field("Amount ($)", h("input", { type: "number", min: 0, onInput: (e) => { n = parseFloat((e.target as HTMLInputElement).value || "0"); } })), [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { if (store.dispatch(() => action(n), { sound: "cash" })) closeModal(); } }, "Confirm"),
  ]);
}

function textModal(title: string, placeholder: string, action: (v: string) => GameState): void {
  let v = "";
  openModal(title, field(placeholder, h("input", { placeholder, onInput: (e) => { v = (e.target as HTMLInputElement).value; } })), [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { if (store.dispatch(() => action(v), { sound: "success" })) closeModal(); } }, "Confirm"),
  ]);
}

function confirmModal(prompt: string, action: () => GameState): void {
  openModal("Are you sure?", h("div", { class: "sub" }, prompt), [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { store.dispatch(() => action(), { sound: "click" }); closeModal(); } }, "Do It"),
  ]);
}

function textarea(value: string, onInput?: (v: string) => void): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("style", "width:100%;height:160px");
  if (onInput) ta.addEventListener("input", () => onInput(ta.value));
  return ta;
}

function exportModal(): void {
  const ta = textarea(store.exportSave());
  ta.addEventListener("click", () => ta.select());
  openModal("Export Save", field("Copy this JSON", ta), [
    h("button", { class: "btn warn", onClick: closeModal }, "Done"),
  ]);
}

function importModal(): void {
  let v = "";
  openModal("Import Save", field("Paste save JSON", textarea("", (val) => { v = val; })), [
    h("button", { class: "btn ghost", onClick: closeModal }, "Cancel"),
    h("button", { class: "btn warn", onClick: () => { try { store.importSave(v); closeModal(); } catch { store.flash({ kind: "error", message: "Invalid save." }); } } }, "Import"),
  ]);
}

// Re-export for findBrand usage typing (keeps imports honest in strict mode).
void findBrand;
