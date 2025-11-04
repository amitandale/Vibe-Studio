export type PageSearchParams = { project_id?: string | string[] | undefined };

export type OnboardingPageState =
  | { kind: "missingProject" }
  | { kind: "mismatch"; expected: string; received: string }
  | { kind: "missingBaseUrl" }
  | { kind: "wizard"; projectId: string; baseUrl: string; onboardingEnabled: boolean; allowReset: boolean };

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (["false", "0", "off"].includes(normalized)) {
    return false;
  }
  if (["true", "1", "on"].includes(normalized)) {
    return true;
  }
  return fallback;
}

export function normalizeBaseUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  return value.replace(/\/$/, "");
}

export function resolveOnboardingPageState(
  searchParams: PageSearchParams | undefined,
  env: NodeJS.ProcessEnv,
): OnboardingPageState {
  const queryProject = typeof searchParams?.project_id === "string" ? searchParams.project_id : undefined;
  const envProject = env.NEXT_PUBLIC_PROJECT_ID?.trim();
  const projectId = envProject ?? queryProject;

  if (!projectId) {
    return { kind: "missingProject" };
  }

  if (envProject && queryProject && envProject !== queryProject) {
    return { kind: "mismatch", expected: envProject, received: queryProject };
  }

  const onboardingEnabled = parseBoolean(env.NEXT_PUBLIC_ONBOARDING_ENABLED, true);
  const allowReset = parseBoolean(env.NEXT_PUBLIC_ONBOARDING_RESET_ALLOWED, false);
  const baseUrl = normalizeBaseUrl(env.NEXT_PUBLIC_MCP_BASE_URL) ?? normalizeBaseUrl(env.NEXT_PUBLIC_API_URL);

  if (!baseUrl) {
    return { kind: "missingBaseUrl" };
  }

  return { kind: "wizard", projectId, baseUrl, onboardingEnabled, allowReset };
}

