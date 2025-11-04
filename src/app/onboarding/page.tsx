import { redirect } from "next/navigation";
import React from "react";
import { MissingBaseUrl, MissingProjectId, ProjectMismatch } from "./_components/Fallbacks";
import type { OnboardingManifest } from "@/lib/onboarding/schemas";
import { fetchOnboardingManifest } from "@/lib/onboarding/server";
import type { PageSearchParams } from "./page.state";
import { resolveOnboardingPageState } from "./page.state";

type OnboardingPageProps = {
  searchParams?: Promise<PageSearchParams>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps): Promise<React.ReactNode> {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resolution = resolveOnboardingPageState(resolvedSearchParams, process.env);

  if (resolution.kind === "missingProject") {
    return <MissingProjectId />;
  }

  if (resolution.kind === "mismatch") {
    return <ProjectMismatch expected={resolution.expected} received={resolution.received} />;
  }

  if (resolution.kind === "missingBaseUrl") {
    return <MissingBaseUrl />;
  }

  const { projectId, baseUrl, onboardingEnabled, allowReset } = resolution;

  let manifest: OnboardingManifest | null = null;
  try {
    manifest = await fetchOnboardingManifest(baseUrl, projectId);
  } catch (error) {
    console.error("Failed to fetch onboarding manifest", error);
  }

  if (manifest?.status === "Locked") {
    redirect("/");
  }

  const { OnboardingWizard } = await import("./_components/OnboardingWizard");

  return (
    <OnboardingWizard
      projectId={projectId}
      baseUrl={baseUrl}
      manifest={manifest}
      onboardingEnabled={onboardingEnabled}
      allowReset={allowReset}
    />
  );
}
