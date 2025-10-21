import fs from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const defaultMockPath = path.join(process.cwd(), "tools/mocks/google-fonts.cjs");

function ensureLightningcssNativeBindings() {
  const pnpmRoot = path.join(process.cwd(), "node_modules/.pnpm");
  let entries;

  try {
    entries = fs.readdirSync(pnpmRoot, { withFileTypes: true });
  } catch (error) {
    console.warn("Skipping lightningcss native binding preparation:", error);
    return;
  }

  const lightningcssEntry = entries.find(
    (entry) => entry.isDirectory() && entry.name.startsWith("lightningcss@"),
  );

  if (!lightningcssEntry) {
    return;
  }

  const lightningcssDir = path.join(
    pnpmRoot,
    lightningcssEntry.name,
    "node_modules",
    "lightningcss",
  );

  if (!fs.existsSync(lightningcssDir)) {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("lightningcss-") || entry.name.includes("@lightningcss")) {
      continue;
    }

    const atIndex = entry.name.lastIndexOf("@");
    if (atIndex === -1) continue;

    const packageName = entry.name.slice(0, atIndex);
    const packageDir = path.join(
      pnpmRoot,
      entry.name,
      "node_modules",
      packageName,
    );

    if (!fs.existsSync(packageDir)) continue;

    for (const file of fs.readdirSync(packageDir)) {
      if (!file.startsWith("lightningcss.") || !file.endsWith(".node")) {
        continue;
      }

      const destination = path.join(lightningcssDir, file);
      if (!fs.existsSync(destination)) {
        fs.copyFileSync(path.join(packageDir, file), destination);
      }
    }
  }
}

ensureLightningcssNativeBindings();

const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DISABLE_FONT_DOWNLOADS: process.env.NEXT_DISABLE_FONT_DOWNLOADS ?? "true",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES:
      process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES ?? defaultMockPath,
    LIGHTNINGCSS_PLATFORM: process.env.LIGHTNINGCSS_PLATFORM ?? "wasm32-wasi",
    CSS_TRANSFORMER_WASM: process.env.CSS_TRANSFORMER_WASM ?? "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
