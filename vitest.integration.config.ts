import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Integration config: runs the DB-gated suite only; skipped entirely without staging env. */
export default defineConfig({
  test: {
    setupFiles: [fileURLToPath(new URL("./tests/setup.ts", import.meta.url))],
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
