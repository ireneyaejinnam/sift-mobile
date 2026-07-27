import { defineConfig } from "vitest/config";
import path from "path";

// Mirrors the `@/* -> src/*` alias from tsconfig.json / babel.config.js so
// tests and the eval harness can import app modules the same way.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
