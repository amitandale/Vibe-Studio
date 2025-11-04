# Vibe-Studio Onboarding Wizard

The onboarding wizard enforces a strict, auditable flow before a project can access the rest of the studio. Projects remain gated
until the onboarding manifest reports a `Locked` status.

## Flow Overview

1. **Token Verification** – Collect at least one valid LLM provider token. Tokens are encrypted with AES-256-GCM using the
   `VIBE_TOKEN_SECRET` key and persisted per project.
2. **Spec Drafting** – Spec creation happens via a conversational chat experience. Upload attachments to influence the draft and
   confirm requirements before continuing.
3. **Stack & Template Selection** – Review stack recommendations, preview rationale, and lock templates. The generated
   `templates.lock.json` becomes immutable after this step.
4. **Business Logic & UI Templates** – Pick orchestration patterns and UI shells. Preview cards highlight accessibility and effort
   levels.
5. **Summary** – Copy final selections for auditing and unlock the studio.

All flows invoke MCP tasks such as `onboarding/specs_draft`, `onboarding/stack_select`, and `onboarding/templates_lock`. Trace IDs
are attached to SSE connections so downstream systems can correlate events with stored artifacts.

## Feature Flags

Feature flags control wizard behaviour:

- `studio.onboarding` – Toggles the wizard globally.
- `studio.onboardingStrict` – Enforces layout-level redirects until onboarding completes.
- `studio.chatUploads` – Enables file uploads inside the spec chat experience.
- `studio.prDashboard` – Shows the PR dashboard page (powered by `/v1/projects/:id/prs`).

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_ONBOARDING_ENABLED` | Enables or disables onboarding at runtime. |
| `NEXT_PUBLIC_ONBOARDING_RESET_ALLOWED` | Grants the reset action from the wizard quick actions panel. |
| `NEXT_PUBLIC_MCP_BASE_URL` | Preferred MCP base URL for API calls. |
| `NEXT_PUBLIC_PROJECT_ID` | Project identifier scoped to onboarding + PR APIs. |
| `VIBE_TOKEN_SECRET` | Secret used to derive encryption keys for provider tokens. |
| `VIBE_TOKEN_SALT` | Optional salt to harden token encryption. |

## Auditing Notes

- Every onboarding run includes a `trace_id` header that propagates through MCP calls.
- Locked templates are stored as artifacts and referenced in the onboarding manifest.
- Pull request activity is captured in `project_pull_requests` + `project_pr_messages` tables with per-message timestamps.

