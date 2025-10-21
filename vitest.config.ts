import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.ts"],
    setupFiles: ["./tests/setupTests.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      lines: 75,
      branches: 70,
      functions: 75,
      statements: 75,
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
