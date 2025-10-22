import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.ts"],
    setupFiles: ["tests/setupTests.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      lines: 95,
      branches: 90,
      functions: 95,
      statements: 95,
      exclude: [
        "**/*.d.ts",
        "src/app/globals.css",
        "next.config.*",
        "postcss.config.*",
        "tailwind.config.*",
      ],
    },
  },
});
