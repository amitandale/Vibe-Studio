import { z } from "zod";

export const onboardingStatusSchema = z.enum([
  "NotStarted",
  "SpecsDrafting",
  "SpecsConfirmed",
  "StackSelected",
  "Locked",
]);

export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const specsDraftSchema = z
  .object({
    $schema: z.string().url().optional(),
  })
  .catchall(z.unknown());

export type SpecsDraft = z.infer<typeof specsDraftSchema>;

export const stackRecommendationSchema = z.object({
  id: z.string(),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  opsNotes: z.array(z.string()).default([]),
  expectedCosts: z.string().optional(),
  fit_score: z.number().min(0).max(1),
  rationale: z.string().optional(),
});

export type StackRecommendation = z.infer<typeof stackRecommendationSchema>;

export const templateDescriptorSchema = z.object({
  id: z.string(),
  digest: z.string(),
  source: z.string().optional(),
  summary: z.string().optional(),
});

export type TemplateDescriptor = z.infer<typeof templateDescriptorSchema>;

export const onboardingManifestSchema = z.object({
  projectId: z.string(),
  status: onboardingStatusSchema,
  specsHash: z.string().optional(),
  stack: z
    .object({
      id: z.string(),
      rationaleRef: z.string().optional(),
    })
    .optional(),
  templates: z
    .object({
      items: z.array(
        z.object({
          id: z.string(),
          digest: z.string(),
        }),
      ),
      lockedAt: z.string().datetime().optional(),
      lockDigest: z.string().optional(),
    })
    .optional(),
  updatedAt: z.string().datetime(),
});

export type OnboardingManifest = z.infer<typeof onboardingManifestSchema>;

const baseEvent = z.object({
  type: z.string(),
  ts: z.string().datetime(),
  seq: z.number().int().nonnegative(),
});

const specsDraftUpdatedEvent = baseEvent.extend({
  type: z.literal("SPECS_DRAFT_UPDATED"),
  draft: specsDraftSchema,
});

const specsConfirmationReadyEvent = baseEvent.extend({
  type: z.literal("SPECS_CONFIRMATION_READY"),
  summary: z.object({ chapters: z.array(z.string()) }),
});

const stacksRecommendedEvent = baseEvent.extend({
  type: z.literal("STACKS_RECOMMENDED"),
  seq_group: z.string().optional(),
  items: z.array(stackRecommendationSchema),
});

const stackSelectedEvent = baseEvent.extend({
  type: z.literal("STACK_SELECTED"),
  id: z.string(),
});

const templatesListedEvent = baseEvent.extend({
  type: z.literal("TEMPLATES_LISTED"),
  items: z.array(templateDescriptorSchema),
});

const templatesLockedEvent = baseEvent.extend({
  type: z.literal("TEMPLATES_LOCKED"),
  lock_artifact_id: z.string(),
  lock_digest: z.string(),
});

const errorEvent = baseEvent.extend({
  type: z.literal("ERROR"),
  code: z.string(),
  message: z.string(),
});

export const onboardingEventSchema = z.discriminatedUnion("type", [
  specsDraftUpdatedEvent,
  specsConfirmationReadyEvent,
  stacksRecommendedEvent,
  stackSelectedEvent,
  templatesListedEvent,
  templatesLockedEvent,
  errorEvent,
]);

export type OnboardingEvent = z.infer<typeof onboardingEventSchema>;

export type SpecsConfirmationSummary = z.infer<typeof specsConfirmationReadyEvent>['summary'];
