import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = process.cwd();

export default defineConfig({
  resolve: {
    alias: {
      "@testing-library/react": path.resolve(
        rootDir,
        "tests/mocks/testing-library-react.ts",
      ),
      react: path.resolve(rootDir, "tests/mocks/react.cts"),
      sonner: path.resolve(rootDir, "tests/mocks/sonner.ts"),
      "@testing-library/jest-dom/vitest": path.resolve(
        rootDir,
        "tests/mocks/testing-library-jest-dom.ts",
      ),
    },
  },
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
