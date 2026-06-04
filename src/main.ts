/**
 * App entry point. The full UI is built in Phase 9; for now this just proves
 * the sim wiring works end-to-end by booting a fresh game and rendering a
 * placeholder so the static build has something to deploy.
 */

import { newGame } from "./sim/state";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  const game = newGame();
  app.innerHTML = `
    <main style="font-family: system-ui; padding: 2rem; color: #325269;">
      <h1 style="font-family: Bungee, system-ui;">SHORE THING</h1>
      <p>${game.companyName} — Week ${game.week}</p>
      <p>Cash: $${game.cash.toLocaleString()} · Reputation: ${game.reputation}</p>
      <p style="opacity:.6">Phase 1 scaffold. Game systems coming online.</p>
    </main>
  `;
}
