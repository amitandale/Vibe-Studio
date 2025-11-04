function resolveBooleanFlag(key: string, fallback: boolean): boolean {
  const raw =
    (typeof process !== "undefined" ? process.env[key] : undefined) ??
    (typeof window !== "undefined" ? (window as unknown as Record<string, string | undefined>)[key] : undefined);

  if (typeof raw !== "string") {
    return fallback;
  }

  if (raw === "0" || raw.toLowerCase() === "false" || raw.toLowerCase() === "off") {
    return false;
  }

  if (raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "on") {
    return true;
  }

  return fallback;
}

export const featureFlags = {
  "studio.envDetection": true,
  "studio.specBuilder": true,
  "studio.streamingPanes": false,
  "studio.onboarding": resolveBooleanFlag("NEXT_PUBLIC_ONBOARDING_ENABLED", true),
  "studio.onboardingReset": resolveBooleanFlag("NEXT_PUBLIC_ONBOARDING_RESET_ALLOWED", false),
  "studio.onboardingStrict": resolveBooleanFlag("NEXT_PUBLIC_ONBOARDING_STRICT", true),
  "studio.chatUploads": resolveBooleanFlag("NEXT_PUBLIC_ONBOARDING_CHAT_UPLOADS", true),
  "studio.prDashboard": resolveBooleanFlag("NEXT_PUBLIC_PR_DASHBOARD", true),
  "studio.onboardingWizardTools": true,
  "studio.prDashboardWizard": true,
} as const satisfies Record<string, boolean>;

export type FeatureFlagKey = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return featureFlags[flag];
}
