import { onboardingManifestSchema, onboardingStatusSchema, type OnboardingManifest, type OnboardingStatus, type OnboardingEvent, type SpecsConfirmationSummary, type SpecsDraft, type StackRecommendation, type TemplateDescriptor } from "./schemas";

export interface SseViolation {
  seq: number;
  reason: string;
  eventType: string;
}

export interface OnboardingErrorEvent {
  code: string;
  message: string;
  timestamp: string;
  seq: number;
}

export interface OnboardingSnapshot {
  status: OnboardingStatus;
  manifest: OnboardingManifest | null;
  specsDraft: SpecsDraft | null;
  confirmation: SpecsConfirmationSummary | null;
  stacks: StackRecommendation[];
  selectedStackId: string | null;
  templates: TemplateDescriptor[];
  lockArtifactId: string | null;
  lockDigest: string | null;
  lastSeq: number | null;
  violations: SseViolation[];
  errors: OnboardingErrorEvent[];
}

export interface MachineOptions {
  projectId: string;
  manifest?: OnboardingManifest | null;
}

const INITIAL_SNAPSHOT: OnboardingSnapshot = {
  status: "NotStarted",
  manifest: null,
  specsDraft: null,
  confirmation: null,
  stacks: [],
  selectedStackId: null,
  templates: [],
  lockArtifactId: null,
  lockDigest: null,
  lastSeq: null,
  violations: [],
  errors: [],
};

const statusOrder: Record<OnboardingStatus, number> = {
  NotStarted: 0,
  SpecsDrafting: 1,
  SpecsConfirmed: 2,
  StackSelected: 3,
  Locked: 4,
};

function maxStatus(current: OnboardingStatus, next: OnboardingStatus): OnboardingStatus {
  return statusOrder[next] > statusOrder[current] ? next : current;
}

export class OnboardingStateMachine {
  private snapshot: OnboardingSnapshot = { ...INITIAL_SNAPSHOT };
  private readonly projectId: string;

  constructor(options: MachineOptions) {
    this.projectId = options.projectId;
    if (options.manifest) {
      this.applyManifest(options.manifest);
    }
  }

  applyManifest(manifest: OnboardingManifest): void {
    const parsed = onboardingManifestSchema.parse(manifest);
    const templates = parsed.templates?.items ?? [];
    this.snapshot = {
      ...this.snapshot,
      manifest: parsed,
      status: parsed.status,
      selectedStackId: parsed.stack?.id ?? this.snapshot.selectedStackId,
      templates: templates.length > 0 ? templates.map((item) => ({ id: item.id, digest: item.digest })) : this.snapshot.templates,
      lockDigest: parsed.templates?.lockDigest ?? this.snapshot.lockDigest,
    };
  }

  getSnapshot(): OnboardingSnapshot {
    return structuredClone(this.snapshot);
  }

  reset(): void {
    this.snapshot = { ...INITIAL_SNAPSHOT };
  }

  applyEvent(event: OnboardingEvent): void {
    if (this.snapshot.lastSeq !== null && event.seq <= this.snapshot.lastSeq) {
      this.snapshot.violations = [
        ...this.snapshot.violations,
        {
          seq: event.seq,
          reason: `Out-of-order event received. Expected sequence greater than ${this.snapshot.lastSeq}.`,
          eventType: event.type,
        },
      ];
      return;
    }

    this.snapshot.lastSeq = event.seq;

    switch (event.type) {
      case "SPECS_DRAFT_UPDATED":
        this.snapshot.status = maxStatus(this.snapshot.status, "SpecsDrafting");
        this.snapshot.specsDraft = event.draft;
        break;
      case "SPECS_CONFIRMATION_READY":
        this.snapshot.status = maxStatus(this.snapshot.status, "SpecsDrafting");
        this.snapshot.confirmation = event.summary;
        break;
      case "STACKS_RECOMMENDED":
        this.snapshot.status = maxStatus(this.snapshot.status, "SpecsConfirmed");
        this.snapshot.stacks = event.items;
        break;
      case "STACK_SELECTED":
        this.snapshot.status = maxStatus(this.snapshot.status, "StackSelected");
        this.snapshot.selectedStackId = event.id;
        break;
      case "TEMPLATES_LISTED":
        this.snapshot.templates = event.items;
        break;
      case "TEMPLATES_LOCKED": {
        this.snapshot.status = "Locked";
        this.snapshot.lockArtifactId = event.lock_artifact_id;
        this.snapshot.lockDigest = event.lock_digest;
        const templates = {
          items: this.snapshot.templates.map((item) => ({ id: item.id, digest: item.digest })),
          lockDigest: event.lock_digest,
          lockedAt: new Date(event.ts).toISOString(),
        } as const;
        this.snapshot.manifest = this.snapshot.manifest
          ? {
              ...this.snapshot.manifest,
              status: "Locked",
              templates,
              updatedAt: event.ts,
            }
          : {
              projectId: this.projectId,
              status: "Locked",
              updatedAt: event.ts,
              templates,
            };
        break;
      }
      case "ERROR":
        this.snapshot.errors = [
          ...this.snapshot.errors,
          {
            code: event.code,
            message: event.message,
            timestamp: event.ts,
            seq: event.seq,
          },
        ];
        break;
      default:
        break;
    }
  }

  canEditSpecs(): boolean {
    return this.snapshot.status === "NotStarted" || this.snapshot.status === "SpecsDrafting";
  }

  canSelectStack(): boolean {
    return this.snapshot.status === "SpecsConfirmed" || this.snapshot.status === "StackSelected";
  }

  canLockTemplates(): boolean {
    return this.snapshot.status === "StackSelected" && this.snapshot.templates.length > 0;
  }

  getCurrentStep(): 1 | 2 | 3 {
    switch (this.snapshot.status) {
      case "NotStarted":
      case "SpecsDrafting":
        return 1;
      case "SpecsConfirmed":
      case "StackSelected":
        return this.snapshot.selectedStackId ? 3 : 2;
      case "Locked":
        return 3;
      default:
        return 1;
    }
  }
}

export function deriveStatusFromManifest(manifest: OnboardingManifest | null | undefined): OnboardingStatus {
  if (!manifest) {
    return "NotStarted";
  }
  return onboardingStatusSchema.parse(manifest.status);
}

export function shouldRedirectToOnboarding(manifest: OnboardingManifest | null | undefined): boolean {
  const status = deriveStatusFromManifest(manifest);
  return status !== "Locked";
}

export function resolveProjectId(): string {
  const id = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PROJECT_ID : undefined;
  if (id && id.trim()) {
    return id.trim();
  }
  if (typeof window !== "undefined") {
    const search = new URLSearchParams(window.location.search);
    const value = search.get("project_id");
    if (value) {
      return value;
    }
  }
  throw new Error("Project ID is required for onboarding flow");
}
