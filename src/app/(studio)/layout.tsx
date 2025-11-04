import React from "react";
import { redirect } from "next/navigation";
import { StudioShell } from "@/components/studio/StudioShell";
import { fetchOnboardingManifest } from "@/lib/onboarding/server";
import { shouldRedirectToOnboarding } from "@/lib/onboarding/state";

type StudioLayoutProps = {
  children: React.ReactNode;
};

function normalizeBaseUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  return value.replace(/\/$/, "");
}

async function resolveManifest(): Promise<void> {
  const onboardingEnabledRaw = process.env.NEXT_PUBLIC_ONBOARDING_ENABLED;
  const onboardingEnabled = onboardingEnabledRaw === undefined ? true : onboardingEnabledRaw !== "false" && onboardingEnabledRaw !== "0";

  if (!onboardingEnabled) {
    return;
  }

  const projectId = process.env.NEXT_PUBLIC_PROJECT_ID?.trim();
  const baseUrl =
    normalizeBaseUrl(process.env.NEXT_PUBLIC_MCP_BASE_URL) ?? normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);

  if (!projectId || !baseUrl) {
    return;
  }

  try {
    const manifest = await fetchOnboardingManifest(baseUrl, projectId);
    if (shouldRedirectToOnboarding(manifest)) {
      redirect("/onboarding");
    }
  } catch (error) {
    console.error("Failed to load onboarding manifest for layout", error);
    redirect("/onboarding");
  }
}

export default async function StudioLayout({ children }: StudioLayoutProps): Promise<React.ReactNode> {
  await resolveManifest();
  return <StudioShell>{children}</StudioShell>;
}
