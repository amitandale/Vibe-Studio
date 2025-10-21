import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const defaultMockPath = path.join(process.cwd(), "tools/mocks/google-fonts.cjs");

const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DISABLE_FONT_DOWNLOADS: process.env.NEXT_DISABLE_FONT_DOWNLOADS ?? "true",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES:
      process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES ?? defaultMockPath,
    LIGHTNINGCSS_PLATFORM: process.env.LIGHTNINGCSS_PLATFORM ?? "wasm",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
