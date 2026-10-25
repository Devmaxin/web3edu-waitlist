import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    setupFiles: [r("tests/setup.ts")],
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // The RSC guard would otherwise fail outside a Next.js bundle.
      "server-only": r("tests/stubs/server-only.ts"),
      "@": r("src"),
    },
  },
});
