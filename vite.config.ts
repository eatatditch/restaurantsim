import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@sim": fileURLToPath(new URL("./src/sim", import.meta.url)),
      "@data": fileURLToPath(new URL("./src/data", import.meta.url)),
      "@save": fileURLToPath(new URL("./src/save", import.meta.url)),
      "@ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
