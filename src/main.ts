/**
 * App entry point. Boots the SHORE THING UI, which reads game state from the
 * store and dispatches pure actions. All game logic lives in src/sim.
 */

import "./ui/styles.css";
import { startApp } from "./ui/app";

const root = document.querySelector<HTMLDivElement>("#app");
if (root) {
  void startApp(root);
}
