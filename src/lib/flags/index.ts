export const featureFlags = {
  "studio.envDetection": true,
  "studio.specBuilder": true,
  "studio.streamingPanes": false,
} as const satisfies Record<string, boolean>;

export type FeatureFlagKey = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return featureFlags[flag];
}
