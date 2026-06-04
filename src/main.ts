/**
 * App entry point. Boots the SHORE THING UI, which reads game state from the
 * store and dispatches pure actions. All game logic lives in src/sim.
 */

import "./ui/styles.css";
import { startApp } from "./ui/app";
import { loadBalanceOverrides } from "./data/overrides";

const root = document.querySelector<HTMLDivElement>("#app");
if (root) {
  // Apply optional external balance overrides BEFORE any game runs, then boot.
  void loadBalanceOverrides().finally(() => startApp(root));
}
