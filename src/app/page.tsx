import { redirect } from "next/navigation";
import React from "react";
import DashboardPage from "./(studio)/page";
import { fetchOnboardingManifest } from "@/lib/onboarding/server";
import type { OnboardingManifest } from "@/lib/onboarding/schemas";

function normalizeBaseUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  return value.replace(/\/$/, "");
}

export default async function RootPage(): Promise<React.ReactNode> {
  const projectId = process.env.NEXT_PUBLIC_PROJECT_ID?.trim();
  const baseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_MCP_BASE_URL) ?? normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);

  let manifest: OnboardingManifest | null = null;
  if (projectId && baseUrl) {
    try {
      manifest = await fetchOnboardingManifest(baseUrl, projectId);
    } catch (error) {
      console.error("Failed to fetch onboarding manifest", error);
    }
  }

  if (manifest && manifest.status !== "Locked") {
    redirect("/onboarding");
  }

  return <DashboardPage />;
}
