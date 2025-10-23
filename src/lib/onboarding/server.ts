import { onboardingManifestSchema, type OnboardingManifest } from "./schemas";

export async function fetchOnboardingManifest(baseUrl: string, projectId: string): Promise<OnboardingManifest | null> {
  const url = new URL(`/v1/artifacts/${encodeURIComponent("onboarding/manifest.json")}`, baseUrl);
  url.searchParams.set("project_id", projectId);
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to load onboarding manifest (${response.status}): ${text}`);
  }
  const payload = await response.json();
  const raw =
    (typeof payload?.content === "string" ? JSON.parse(payload.content) : payload?.content) ??
    (payload?.metadata?.content as unknown | undefined) ??
    null;
  if (!raw) {
    throw new Error("Manifest payload missing content");
  }
  return onboardingManifestSchema.parse(raw);
}
