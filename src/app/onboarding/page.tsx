import { redirect } from "next/navigation";
import React from "react";
import { OnboardingWizard } from "./_components/OnboardingWizard";
import type { OnboardingManifest } from "@/lib/onboarding/schemas";
import { fetchOnboardingManifest } from "@/lib/onboarding/server";

type PageSearchParams = { project_id?: string | string[] | undefined };

interface OnboardingPageProps {
  searchParams?: PageSearchParams;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
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

function normalizeBaseUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  return value.replace(/\/$/, "");
}

function ProjectMismatch({ expected, received }: { expected: string; received: string }): React.ReactNode {
  return (
    <div className="mx-auto max-w-3xl py-24 text-center text-slate-200">
      <h1 className="text-3xl font-semibold text-white">Project ID mismatch</h1>
      <p className="mt-4 text-sm text-slate-400">
        The studio is configured for project <span className="font-semibold text-emerald-200">{expected}</span> but the URL provided <span className="font-semibold text-rose-200">{received}</span>.
      </p>
      <p className="mt-2 text-sm text-slate-400">Update the project_id query parameter or adjust your environment variables.</p>
    </div>
  );
}

function MissingBaseUrl(): React.ReactNode {
  return (
    <div className="mx-auto max-w-3xl py-24 text-center text-slate-200">
      <h1 className="text-3xl font-semibold text-white">agent-mcp unavailable</h1>
      <p className="mt-4 text-sm text-slate-400">
        Provide <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">NEXT_PUBLIC_MCP_BASE_URL</code> or <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">NEXT_PUBLIC_API_URL</code> to access onboarding.
      </p>
    </div>
  );
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps): Promise<React.ReactNode> {
  const queryProject = typeof searchParams?.project_id === "string" ? searchParams.project_id : undefined;
  const envProject = process.env.NEXT_PUBLIC_PROJECT_ID?.trim();
  const projectId = envProject ?? queryProject;

  if (!projectId) {
    throw new Error("Project ID is required to launch onboarding.");
  }

  if (envProject && queryProject && envProject !== queryProject) {
    return <ProjectMismatch expected={envProject} received={queryProject} />;
  }

  const onboardingEnabled = parseBoolean(process.env.NEXT_PUBLIC_ONBOARDING_ENABLED, true);
  const allowReset = parseBoolean(process.env.NEXT_PUBLIC_ONBOARDING_RESET_ALLOWED, false);
  const baseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_MCP_BASE_URL) ?? normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);

  let manifest: OnboardingManifest | null = null;
  if (baseUrl) {
    try {
      manifest = await fetchOnboardingManifest(baseUrl, projectId);
    } catch (error) {
      console.error("Failed to fetch onboarding manifest", error);
    }
  }

  if (!baseUrl) {
    return <MissingBaseUrl />;
  }

  if (manifest?.status === "Locked") {
    redirect("/");
  }

  return (
    <OnboardingWizard
      projectId={projectId}
      baseUrl={baseUrl ?? ""}
      manifest={manifest}
      onboardingEnabled={onboardingEnabled}
      allowReset={allowReset}
    />
  );
}
