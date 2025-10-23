# Vibe-Studio

Vibe-Studio is a Next.js app router experience for composing and running specs against the `agent-mcp` runtime. The UI exposes a spec builder, run streaming panes, and workspace diagnostics wired exclusively to the public HTTP/SSE surface of `agent-mcp`.

## Getting started

```bash
pnpm install
pnpm dev
```

The development server boots on <http://localhost:3000>.

### Environment detection

Vibe-Studio locates the MCP service in two passes:

1. If `NEXT_PUBLIC_MCP_BASE_URL` is defined at build time the UI targets it directly.
2. Otherwise the browser probes `window.location.origin + /health` with a 2 s timeout. Response codes ≥400 mark the environment as `DEGRADED`; network or timeout failures mark it `OFFLINE`.

The detection status is surfaced in the top bar and the Settings page. A manual “Retry detection” button is provided when switching networks.

### Feature flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `studio.envDetection` | `true` | Enables the health badge and diagnostics. |
| `studio.specBuilder` | `true` | Gates the spec builder shell at `/specs/new`. |
| `studio.streamingPanes` | `false` | Enables live panes that subscribe to `GET /v1/stream/{id}`. |

Feature flags are defined in `src/lib/flags/index.ts`. Flip them during development before introducing a runtime configuration service.

## Speaking to agent-mcp

All network interactions originate from a typed API client in `src/lib/api/client.ts`. The client centralises fetch retries, EventSource lifetimes, and tool-list caching. Only the following endpoints are used by the browser:

- `POST /v1/runs` – launch a run with a spec manifest and optional metadata.
- `GET /v1/stream/{id}` – consume server-sent events for the run lifecycle.
- `POST /v1/runs/{id}/cancel` – request cancellation.
- `GET /v1/artifacts/{id}` – fetch artifact metadata (UI stub only in this milestone).
- `GET /v1/tools` – obtain the MCP tool catalogue with client-side caching.

The request body for `POST /v1/runs` is composed by the spec builder. Edit the form fields on `/specs/new` to see the live JSON payload that will be submitted to agent-mcp. A Cancel button calls `POST /v1/runs/{id}/cancel` for the active run.

## Keyboard navigation

- `g d` – Dashboard
- `g p` – Projects
- `g s` – Specs
- `g r` – Runs
- `g a` – Artifacts
- `?` – Print the available shortcuts to the console

## Testing

```bash
pnpm test
```

Vitest runs unit and component suites. Added coverage for:

- Environment detection states.
- Spec builder payload composition.
- SSE ordering guarantees.
- Cancel action wiring.
- Tool list rendering with cache.

Type-check with `pnpm typecheck` and run ESLint via `pnpm lint` before pushing.
