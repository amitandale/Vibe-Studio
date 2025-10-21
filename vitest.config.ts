import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["tests/setupTests.ts"],
    coverage: {
      provider: "v8",
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
