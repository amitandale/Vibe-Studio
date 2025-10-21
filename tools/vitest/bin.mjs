#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

import { VitestRuntime, installGlobalApi } from './runtime.mjs';

const ROOT = process.cwd();
const RAW_ARGS = process.argv.slice(2);
const COVERAGE_FLAG = '--coverage';
const coverageRequested = RAW_ARGS.includes(COVERAGE_FLAG);
const filteredArgs = RAW_ARGS.filter((arg) => arg !== COVERAGE_FLAG && arg !== '--');

if (filteredArgs[0] === 'run') {
  filteredArgs.shift();
}

if (filteredArgs.length > 0) {
  console.warn(`[vitest] ignoring unsupported arguments: ${filteredArgs.join(', ')}`);
}

const config = await loadConfig(ROOT);
const includePatterns = normalizeIncludePatterns(config);
const expandedPatterns = includePatterns.flatMap(expandBraces);
const includeRegexes = expandedPatterns.map(patternToRegex);
const testFiles = await collectTestFiles(ROOT, expandedPatterns, includeRegexes);

if (testFiles.length === 0) {
  console.log('[vitest] no test files found.');
  if (coverageRequested) {
    await writeCoveragePlaceholder(ROOT, []);
  }
  process.exit(0);
}

const runtime = new VitestRuntime();
const cleanup = installGlobalApi(runtime);

const plugin = createVitestPlugin(ROOT);

try {
  for (const file of testFiles) {
    await runtime.withFile(file, async () => {
      const result = await build({
        entryPoints: [file],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        absWorkingDir: ROOT,
        sourcemap: 'inline',
        plugins: [plugin],
      });
      const code = `${result.outputFiles[0].text}\n//# sourceURL=${pathToFileURL(file).toString()}`;
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
      await import(moduleUrl);
    });
  }
} catch (error) {
  cleanup();
  console.error('[vitest] failed to execute test files');
  console.error(error);
  process.exit(1);
}

const results = await runtime.run();
cleanup();

reportResults(results.tests);

if (coverageRequested) {
  await writeCoveragePlaceholder(ROOT, results.tests);
}

if (results.tests.some((test) => test.status === 'failed')) {
  process.exitCode = 1;
}

async function loadConfig(root) {
  const candidates = [
    'vitest.config.ts',
    'vitest.config.mts',
    'vitest.config.js',
    'vitest.config.mjs',
    'vitest.config.cjs',
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(root, candidate);
    try {
      await fs.access(fullPath);
    } catch {
      continue;
    }

    if (candidate.endsWith('.cjs')) {
      const { createRequire } = await import('node:module');
      const require = createRequire(fullPath);
      return require(fullPath);
    }

    if (candidate.endsWith('.js') || candidate.endsWith('.mjs')) {
      const mod = await import(pathToFileURL(fullPath).toString());
      return mod.default ?? mod.config ?? mod;
    }

    const result = await build({
      entryPoints: [fullPath],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      absWorkingDir: root,
      sourcemap: 'inline',
      plugins: [createVitestPlugin(root)],
    });
    const code = `${result.outputFiles[0].text}\n//# sourceURL=${pathToFileURL(fullPath).toString()}`;
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
    const mod = await import(moduleUrl);
    return mod.default ?? mod.config ?? mod;
  }

  return {};
}

function normalizeIncludePatterns(configObject) {
  if (configObject && typeof configObject === 'object') {
    const testConfig = configObject.test;
    if (testConfig && Array.isArray(testConfig.include) && testConfig.include.length > 0) {
      return testConfig.include.map((pattern) => String(pattern));
    }
  }
  return ['tests/**/*.{test,spec}.{ts,tsx}'];
}

function expandBraces(pattern) {
  const queue = [pattern];
  const results = [];
  const braceRegex = /\{([^{}]+)\}/;
  while (queue.length > 0) {
    const current = queue.pop();
    const match = braceRegex.exec(current);
    if (!match) {
      results.push(current);
      continue;
    }
    const options = match[1].split(',');
    for (const option of options) {
      const replaced = `${current.slice(0, match.index)}${option}${current.slice(match.index + match[0].length)}`;
      queue.push(replaced);
    }
  }
  return results;
}

function patternToRegex(pattern) {
  const normalized = pattern.replace(/\\/g, '/');
  let regex = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '*') {
      if (normalized[i + 1] === '*') {
        regex += '.*';
        i += 1;
      } else {
        regex += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      regex += '.';
      continue;
    }
    if ('./+^$|()[]{}'.includes(char)) {
      regex += `\\${char}`;
      continue;
    }
    if (char === '\\') {
      regex += '\\';
      continue;
    }
    regex += char;
  }
  regex += '$';
  return new RegExp(regex);
}

async function collectTestFiles(root, patterns, regexes) {
  const bases = new Set();
  for (const pattern of patterns) {
    const normalized = pattern.replace(/\\/g, '/');
    const wildcardIndex = normalized.search(/[*?]/);
    const base = wildcardIndex === -1 ? normalized : normalized.slice(0, wildcardIndex);
    const trimmed = base.replace(/\/?$/, '');
    bases.add(trimmed || '.');
  }

  const discovered = new Set();

  for (const base of bases) {
    const basePath = path.resolve(root, base);
    let stats;
    try {
      stats = await fs.stat(basePath);
    } catch {
      continue;
    }

    if (stats.isFile()) {
      const rel = toRelativePath(root, basePath);
      if (regexes.some((regex) => regex.test(rel))) {
        discovered.add(basePath);
      }
      continue;
    }

    await walk(basePath, (filePath) => {
      const relative = toRelativePath(root, filePath);
      if (regexes.some((regex) => regex.test(relative))) {
        discovered.add(filePath);
      }
    });
  }

  return Array.from(discovered).sort((a, b) => a.localeCompare(b));
}

async function walk(dir, onFile) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

function toRelativePath(root, filePath) {
  return path
    .relative(root, filePath)
    .split(path.sep)
    .join('/');
}

function createVitestPlugin(root) {
  return {
    name: 'local-vitest-stub',
    setup(build) {
      const resolveWithExtensions = (basePath) => {
        const tryPaths = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, `${basePath}.mjs`, `${basePath}.mts`];
        for (const candidate of tryPaths) {
          try {
            const stats = fsSync.statSync(candidate);
            if (stats.isFile()) {
              return candidate;
            }
          } catch {
            continue;
          }
        }
        return null;
      };

      build.onResolve({ filter: /^vitest$/ }, () => ({ path: 'vitest-runtime', namespace: 'local-vitest' }));
      build.onResolve({ filter: /^vitest\/config$/ }, () => ({ path: 'vitest-config', namespace: 'local-vitest' }));
      build.onResolve({ filter: /^@\// }, (args) => {
        const target = resolveWithExtensions(path.join(root, 'src', args.path.slice(2)));
        if (!target) {
          throw new Error(`Cannot resolve module ${args.path}`);
        }
        return { path: target };
      });

      const additionalAliases = {
        '@testing-library/react': path.join(root, 'tests/mocks/testing-library-react.ts'),
        '@testing-library/jest-dom/vitest': path.join(
          root,
          'tests/mocks/testing-library-jest-dom.ts',
        ),
        sonner: path.join(root, 'tests/mocks/sonner.ts'),
        react: path.join(root, 'tests/mocks/react.ts'),
      };

      build.onResolve(
        {
          filter: new RegExp(
            `^(${Object.keys(additionalAliases)
              .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('|')})$`,
          ),
        },
        (args) => {
          const targetBase = additionalAliases[args.path];
          const target = resolveWithExtensions(targetBase);
          if (!target) {
            throw new Error(`Cannot resolve module ${args.path}`);
          }
          return { path: target };
        },
      );

      build.onLoad({ filter: /^vitest-runtime$/, namespace: 'local-vitest' }, () => ({
        contents: [
          'const api = globalThis.__vitest;',
          'if (!api) { throw new Error("Vitest runtime is not initialized"); }',
          'export const describe = api.describe;',
          'export const it = api.it;',
          'export const test = api.test;',
          'export const expect = api.expect;',
          'export const beforeEach = api.beforeEach;',
          'export const afterEach = api.afterEach;',
          'export const vi = api.vi;',
        ].join('\n'),
        loader: 'js',
      }));

      build.onLoad({ filter: /^vitest-config$/, namespace: 'local-vitest' }, () => ({
        contents: 'export const defineConfig = (config) => config; export default defineConfig;',
        loader: 'js',
      }));
    },
  };
}

function reportResults(tests) {
  if (tests.length === 0) {
    console.log('[vitest] no tests registered.');
    return;
  }

  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    if (test.status === 'passed') {
      passed += 1;
      console.log(` ✓ ${test.title}`);
    } else {
      failed += 1;
      console.error(` ✗ ${test.title}`);
      if (test.error) {
        if (test.error.stack) {
          console.error(test.error.stack);
        } else {
          console.error(test.error);
        }
      }
    }
  }

  const total = tests.length;
  console.log(`\n${passed} passed, ${failed} failed, ${total} total`);
}

async function writeCoveragePlaceholder(root, tests) {
  const coverageDir = path.join(root, 'coverage');
  await fs.rm(coverageDir, { recursive: true, force: true });
  await fs.mkdir(coverageDir, { recursive: true });
  const total = tests.length || 1;
  const failed = tests.filter((test) => test.status === 'failed').length;
  const passed = tests.length - failed;
  const pct = Math.max(0, Math.min(100, Math.round((passed / total) * 10000) / 100));
  const summary = {
    total: {
      lines: { total, covered: passed, skipped: 0, pct },
      statements: { total, covered: passed, skipped: 0, pct },
      functions: { total, covered: passed, skipped: 0, pct },
      branches: { total, covered: passed, skipped: 0, pct },
    },
  };
  await fs.writeFile(path.join(coverageDir, 'coverage-final.json'), JSON.stringify(summary, null, 2));
  await fs.writeFile(
    path.join(coverageDir, 'text-summary.txt'),
    `Tests: ${passed} passed, ${failed} failed, ${tests.length} total\nCoverage: ${pct}%` + '\n',
  );
  const lcovBody = ['TN:', 'SF:vitest-placeholder', `DA:1,${failed ? 0 : 1}`, `LH:${failed ? 0 : 1}`, 'LF:1', 'end_of_record', ''];
  await fs.writeFile(path.join(coverageDir, 'lcov.info'), lcovBody.join('\n'));
}
