import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.ts"],
    setupFiles: ["tests/setupTests.ts"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
