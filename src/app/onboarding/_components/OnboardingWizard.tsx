"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { ConfirmModal } from "@/app/onboarding/_components/ConfirmModal";
import type { ChatMessage, ChatRole } from "@/app/onboarding/_components/SpecsChat";
import { createSystemMessage } from "@/app/onboarding/_components/SpecsChat";
import { TokenStep } from "@/components/Onboarding/TokenStep";
import { SpecStep } from "@/components/Onboarding/SpecStep";
import { StackStep } from "@/components/Onboarding/StackStep";
import { LogicStep } from "@/components/Onboarding/LogicStep";
import { UIStep } from "@/components/Onboarding/UIStep";
import { SummaryStep } from "@/components/Onboarding/SummaryStep";
import { WizardProgressBar } from "@/components/WizardProgressBar";
import type { BusinessLogicOption } from "@/components/BusinessLogicSelect";
import type { UiTemplateOption } from "@/components/UIUXSelect";
import { OnboardingClient, type StartRunRequest } from "@/lib/api/onboarding.client";
import { AgentMcpClient } from "@/lib/api/client";
import type { ProviderDescriptor, ProviderTokenRecord, TokenValidationResult } from "@/lib/api/types";
import {
  onboardingManifestSchema,
  type OnboardingManifest,
  type OnboardingEvent,
  type StackRecommendation,
  type TemplateDescriptor,
} from "@/lib/onboarding/schemas";
import { OnboardingStateMachine, type OnboardingSnapshot, resolveProjectId } from "@/lib/onboarding/state";
import { persistTraceId, readTraceId } from "@/lib/onboarding/storage";
import { detectMcpEnvironment, type McpEnvironmentSnapshot } from "@/lib/env/detectMcpEnv";
import "@/styles/onboarding.css";

const OFFLINE_PROVIDERS: ProviderDescriptor[] = [
  { id: "openai", name: "OpenAI", docsUrl: "https://platform.openai.com/docs" },
  { id: "anthropic", name: "Anthropic", docsUrl: "https://docs.anthropic.com" },
  { id: "azure-openai", name: "Azure OpenAI", docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/" },
];

const FALLBACK_LOGIC_OPTIONS: BusinessLogicOption[] = [
  {
    id: "baseline-orchestration",
    title: "Baseline Orchestration",
    summary: "Generates CRUD + analytics flows with queue-backed retries and structured logging.",
    estimatedEffort: "2d",
    previewMarkdown:
      "## Baseline orchestration\n- Command bus\n- Background sync\n- Observability hooks\n- Automated tests",
  },
  {
    id: "growth-experimentation",
    title: "Growth Experimentation",
    summary: "Adds feature flag scaffolding, A/B harness, and redshift event streaming.",
    estimatedEffort: "3d",
  },
];

const FALLBACK_UI_OPTIONS: UiTemplateOption[] = [
  {
    id: "neon-dashboard",
    name: "Neon Dashboard",
    summary: "Dark mode dashboard optimized for monitoring agent telemetry and conversation reviews.",
    accessibilityNotes: "Meets WCAG AA contrast, keyboard accessible modals.",
    previewImageUrl: "/images/ui-previews/neon-dashboard.png",
  },
  {
    id: "aurora-studio",
    name: "Aurora Studio",
    summary: "Gradient-forward marketing shell with hero blocks, feature grids, and CTA loops.",
    accessibilityNotes: "High contrast CTA buttons, prefers-reduced-motion safe.",
  },
  {
    id: "atlas-console",
    name: "Atlas Console",
    summary: "Operational console layout with split-pane editors, PR summaries, and audit timeline.",
  },
];

const STEP_CONFIG = [
  {
    id: "tokens",
    title: "Connect Provider",
    description: "Add at least one valid LLM token scoped to this project.",
  },
  {
    id: "spec",
    title: "Draft Specs",
    description: "Use the conversational assistant to define requirements.",
  },
  {
    id: "stack",
    title: "Select Stack",
    description: "Review recommendations, preview templates, and lock choices.",
  },
  {
    id: "logic",
    title: "Business Logic",
    description: "Confirm orchestration scaffolding and agent workflows.",
  },
  {
    id: "ui",
    title: "UI Template",
    description: "Choose the UI shell and accessibility profile.",
  },
  {
    id: "summary",
    title: "Summary",
    description: "Copy audited selections and launch the studio.",
  },
] as const;

export type StepId = (typeof STEP_CONFIG)[number]["id"];

interface OnboardingWizardProps {
  projectId: string;
  baseUrl: string;
  manifest: OnboardingManifest | null;
  onboardingEnabled: boolean;
  allowReset: boolean;
}

type PendingStep = "tokens" | "specs" | "stack" | "templates" | "logic" | "ui" | "reset" | null;

const INITIAL_ENVIRONMENT: McpEnvironmentSnapshot = {
  status: "OFFLINE",
  baseUrl: null,
  timestamp: Date.now(),
};

export function OnboardingWizard({
  projectId,
  baseUrl,
  manifest,
  onboardingEnabled,
  allowReset,
}: OnboardingWizardProps): React.ReactNode {
  const router = useRouter();
  const resolvedProjectId = React.useMemo(() => projectId || resolveProjectId(), [projectId]);
  const onboardingClientRef = React.useRef<OnboardingClient | null>(null);
  const apiClientRef = React.useRef<AgentMcpClient | null>(null);
  const machineRef = React.useRef<OnboardingStateMachine>(
    new OnboardingStateMachine({ projectId: resolvedProjectId, manifest: manifest ?? undefined }),
  );
  const [snapshot, setSnapshot] = React.useState<OnboardingSnapshot>(() => machineRef.current.getSnapshot());
  const [messages, setMessages] = React.useState<ChatMessage[]>(() => [
    createSystemMessage("Welcome to the Vibe-Studio onboarding flow."),
    createSystemMessage(
      "Provide your product goals, constraints, data sources, auth model, and NFRs. The advisor drafts specs with iterative validation.",
    ),
  ]);
  const [environment, setEnvironment] = React.useState<McpEnvironmentSnapshot>(INITIAL_ENVIRONMENT);
  const [providers, setProviders] = React.useState<ProviderDescriptor[]>(OFFLINE_PROVIDERS);
  const [tokens, setTokens] = React.useState<ProviderTokenRecord[]>([]);
  const [logicOptions, setLogicOptions] = React.useState<BusinessLogicOption[]>(FALLBACK_LOGIC_OPTIONS);
  const [uiOptions, setUiOptions] = React.useState<UiTemplateOption[]>(FALLBACK_UI_OPTIONS);
  const [selectedLogicId, setSelectedLogicId] = React.useState<string | null>(null);
  const [selectedUiId, setSelectedUiId] = React.useState<string | null>(null);
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [validatingProviderId, setValidatingProviderId] = React.useState<string | null>(null);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [pendingStep, setPendingStep] = React.useState<PendingStep>(null);
  const [selectedTemplatesMap, setSelectedTemplatesMap] = React.useState<Record<string, boolean>>({});
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [lastCopiedAt, setLastCopiedAt] = React.useState<number | null>(null);
  const traceId = React.useMemo(() => {
    if (typeof window !== "undefined") {
      return readTraceId(resolvedProjectId) ?? uuidv4();
    }
    return uuidv4();
  }, [resolvedProjectId]);
  const streamCancelRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    onboardingClientRef.current = new OnboardingClient(baseUrl, resolvedProjectId);
    apiClientRef.current = new AgentMcpClient(baseUrl);
  }, [baseUrl, resolvedProjectId]);

  React.useEffect(() => {
    if (!manifest) {
      return;
    }
    try {
      const parsed = onboardingManifestSchema.parse(manifest);
      machineRef.current.applyManifest(parsed);
      setSnapshot(machineRef.current.getSnapshot());
    } catch (error) {
      console.warn("Unable to parse onboarding manifest", error);
    }
  }, [manifest]);

  React.useEffect(() => {
    persistTraceId(resolvedProjectId, traceId);
  }, [resolvedProjectId, traceId]);

  React.useEffect(() => {
    let cancelled = false;
    void detectMcpEnvironment().then((snapshot) => {
      if (!cancelled) {
        setEnvironment(snapshot);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  React.useEffect(() => {
    setSelectedTemplatesMap((prev) => {
      const next: Record<string, boolean> = {};
      for (const template of snapshot.templates) {
        next[template.id] = prev[template.id] ?? true;
      }
      return next;
    });
  }, [snapshot.templates]);

  React.useEffect(() => {
    return () => {
      streamCancelRef.current?.();
      streamCancelRef.current = null;
    };
  }, []);

  const fetchTokens = React.useCallback(async () => {
    if (!apiClientRef.current) {
      return;
    }
    try {
      const [listedProviders, listedTokens] = await Promise.all([
        apiClientRef.current.listTokenProviders(),
        apiClientRef.current.listProjectTokens(resolvedProjectId),
      ]);
      if (listedProviders.length > 0) {
        setProviders(listedProviders);
      }
      setTokens(listedTokens);
    } catch (error) {
      console.warn("Unable to fetch token metadata", error);
      setTokenError(error instanceof Error ? error.message : String(error));
    }
  }, [resolvedProjectId]);

  const fetchWizardRecommendations = React.useCallback(async () => {
    if (!apiClientRef.current) {
      return;
    }
    try {
      const [logic, ui] = await Promise.all([
        apiClientRef.current.listBusinessLogic(resolvedProjectId),
        apiClientRef.current.listUiTemplates(resolvedProjectId),
      ]);
      if (logic.length > 0) {
        setLogicOptions(logic.map((item): BusinessLogicOption => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          estimatedEffort: item.estimatedEffort ?? "",
          previewMarkdown: item.previewMarkdown,
        })));
      }
      if (ui.length > 0) {
        setUiOptions(ui.map((item): UiTemplateOption => ({
          id: item.id,
          name: item.name,
          summary: item.summary,
          previewImageUrl: item.previewImageUrl,
          accessibilityNotes: item.accessibilityNotes,
        })));
      }
    } catch (error) {
      console.warn("Unable to fetch wizard recommendations", error);
    }
  }, [resolvedProjectId]);

  React.useEffect(() => {
    void fetchTokens();
    void fetchWizardRecommendations();
  }, [fetchTokens, fetchWizardRecommendations]);

  React.useEffect(() => {
    const client = onboardingClientRef.current;
    if (!client) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const fresh = await client.fetchManifest(traceId);
        if (!cancelled && fresh) {
          machineRef.current.applyManifest(fresh);
          setSnapshot(machineRef.current.getSnapshot());
        }
      } catch (error) {
        if (!cancelled) {
          setErrorBanner(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  const pushMessage = React.useCallback((role: ChatRole, content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: uuidv4(),
        role,
        content,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const handleEvent = React.useCallback(
    (event: OnboardingEvent) => {
      machineRef.current.applyEvent(event);
      setSnapshot(machineRef.current.getSnapshot());
      switch (event.type) {
        case "SPECS_CONFIRMATION_READY":
          pushMessage("assistant", "System requirements summary is ready for review.");
          setPendingStep((current) => (current === "specs" ? null : current));
          break;
        case "STACKS_RECOMMENDED":
          pushMessage("assistant", "Recommended stacks have been prepared.");
          setPendingStep((current) => (current === "specs" ? null : current));
          break;
        case "STACK_SELECTED":
          pushMessage("assistant", `Stack ${event.id} has been recorded.`);
          setPendingStep((current) => (current === "stack" ? null : current));
          break;
        case "TEMPLATES_LISTED":
          pushMessage("assistant", "Templates catalog refreshed for the selected stack.");
          setPendingStep((current) => (current === "stack" ? null : current));
          break;
        case "TEMPLATES_LOCKED":
          pushMessage("assistant", "Templates locked successfully. Proceed to business logic selection.");
          setPendingStep((current) => (current === "templates" ? null : current));
          break;
        case "ERROR":
          pushMessage("event", `Error ${event.code}: ${event.message}`);
          setErrorBanner(event.message);
          setPendingStep(null);
          break;
        default:
          break;
      }
    },
    [pushMessage],
  );

  const startRun = React.useCallback(
    async (payload: StartRunRequest, step: PendingStep, opts?: { message?: string; role?: ChatRole }) => {
      if (!onboardingClientRef.current) {
        setErrorBanner("MCP client unavailable. Check your environment configuration.");
        return;
      }
      if (opts?.message) {
        pushMessage(opts.role ?? "user", opts.message);
      }
      setPendingStep(step);
      setErrorBanner(null);
      try {
        streamCancelRef.current?.();
        const run = await onboardingClientRef.current.startRun(payload, traceId);
        streamCancelRef.current = onboardingClientRef.current.streamRun(
          run.id,
          {
            onEvent: handleEvent,
            onError: (error) => {
              setErrorBanner(error instanceof Error ? error.message : String(error));
              setPendingStep(null);
            },
          },
          traceId,
        );
      } catch (error) {
        setErrorBanner(error instanceof Error ? error.message : String(error));
        setPendingStep(null);
      }
    },
    [handleEvent, pushMessage, traceId],
  );

  const handleSendMessage = React.useCallback(
    (message: string) => {
      startRun(
        {
          task: "onboarding/specs_draft",
          inputs: { message, draft: snapshot.specsDraft ?? {} },
          params: { mode: "conversational", attachments: attachments.map((file) => ({ name: file.name, size: file.size })) },
        },
        "specs",
        { message },
      );
    },
    [attachments, snapshot.specsDraft, startRun],
  );

  const handleSpecsAction = React.useCallback(
    (action: "refine" | "suggestion" | "clear" | "confirm") => {
      switch (action) {
        case "refine":
          startRun(
            {
              task: "onboarding/specs_refine",
              inputs: { draft: snapshot.specsDraft ?? {}, action: "refine" },
            },
            "specs",
          );
          break;
        case "suggestion":
          startRun(
            {
              task: "onboarding/specs_suggestion",
              inputs: { draft: snapshot.specsDraft ?? {}, action: "suggest" },
            },
            "specs",
          );
          break;
        case "clear":
          startRun(
            {
              task: "onboarding/specs_clear",
              inputs: { draft: snapshot.specsDraft ?? {}, action: "clear" },
            },
            "specs",
          );
          break;
        case "confirm":
          startRun(
            {
              task: "onboarding/specs_confirm",
              inputs: { draft: snapshot.specsDraft ?? {} },
            },
            "specs",
          );
          break;
        default:
          break;
      }
    },
    [snapshot.specsDraft, startRun],
  );

  const handleSelectStack = React.useCallback(
    (stackId: string) => {
      startRun(
        {
          task: "onboarding/stack_select",
          inputs: { stack_id: stackId, draft: snapshot.specsDraft ?? {} },
        },
        "stack",
      );
    },
    [snapshot.specsDraft, startRun],
  );

  const handleLockTemplates = React.useCallback(() => {
    if (!snapshot.selectedStackId) {
      setErrorBanner("Select a stack before locking templates.");
      return;
    }
    const selections = snapshot.templates.filter((template) => selectedTemplatesMap[template.id]);
    if (selections.length === 0) {
      setErrorBanner("Select at least one template before locking.");
      return;
    }
    startRun(
      {
        task: "onboarding/templates_lock",
        inputs: {
          stack_id: snapshot.selectedStackId,
          templates: selections.map((template) => ({
            id: template.id,
            digest: template.digest,
            source: template.source,
          })),
        },
      },
      "templates",
    );
  }, [selectedTemplatesMap, snapshot.selectedStackId, snapshot.templates, startRun]);

  const handleReset = React.useCallback(() => {
    setResetOpen(false);
    startRun(
      {
        task: "onboarding/reset",
        inputs: { project_id: resolvedProjectId },
      },
      "reset",
    );
    machineRef.current.reset();
    setSnapshot(machineRef.current.getSnapshot());
    setMessages([createSystemMessage("Onboarding has been reset. Start drafting specs to begin again.")]);
    setPendingStep(null);
    setSelectedTemplatesMap({});
    setSelectedLogicId(null);
    setSelectedUiId(null);
    setAttachments([]);
    setTokens([]);
    setLastCopiedAt(null);
  }, [resolvedProjectId, startRun]);

  const handleSelectAllTemplates = React.useCallback(() => {
    setSelectedTemplatesMap(() => {
      const next: Record<string, boolean> = {};
      for (const template of snapshot.templates) {
        next[template.id] = true;
      }
      return next;
    });
  }, [snapshot.templates]);

  const handleToggleTemplate = React.useCallback((templateId: string) => {
    setSelectedTemplatesMap((prev) => ({
      ...prev,
      [templateId]: !prev[templateId],
    }));
  }, []);

  const handleValidateToken = React.useCallback(
    async (providerId: string, token: string, label?: string): Promise<TokenValidationResult | void> => {
      if (!apiClientRef.current) {
        throw new Error("Token API unavailable in this environment");
      }
      setValidatingProviderId(providerId);
      setTokenError(null);
      setPendingStep("tokens");
      try {
        const result = await apiClientRef.current.validateProviderToken({ providerId, token, projectId: resolvedProjectId });
        if (!result.valid) {
          setPendingStep(null);
          return result;
        }
        await apiClientRef.current.storeProviderToken({ providerId, token, label, projectId: resolvedProjectId });
        await fetchTokens();
        setPendingStep(null);
        return result;
      } catch (error) {
        setTokenError(error instanceof Error ? error.message : String(error));
        // Allow offline fallback by storing metadata locally
        const fallbackRecord: ProviderTokenRecord = {
          id: `local-${Date.now()}`,
          providerId,
          label,
          createdAt: new Date().toISOString(),
          status: "valid",
          lastValidatedAt: new Date().toISOString(),
        };
        setTokens((prev) => [...prev.filter((item) => item.id !== fallbackRecord.id), fallbackRecord]);
        setPendingStep(null);
        return { providerId, valid: true, message: "Token stored locally (offline mode)." };
      } finally {
        setValidatingProviderId(null);
      }
    },
    [fetchTokens, resolvedProjectId],
  );

  const handleRemoveToken = React.useCallback(
    async (tokenId: string) => {
      if (!apiClientRef.current) {
        setTokens((prev) => prev.filter((token) => token.id !== tokenId));
        return;
      }
      try {
        await apiClientRef.current.deleteProviderToken(tokenId, resolvedProjectId);
        await fetchTokens();
      } catch (error) {
        console.warn("Failed to delete token", error);
        setTokens((prev) => prev.filter((token) => token.id !== tokenId));
      }
    },
    [fetchTokens, resolvedProjectId],
  );

  const handleAttachmentsUpload = React.useCallback((files: FileList) => {
    setAttachments(Array.from(files));
  }, []);

  const handleClearUploads = React.useCallback(() => {
    setAttachments([]);
  }, []);

  const handlePreviewLogic = React.useCallback((option: BusinessLogicOption) => {
    pushMessage(
      "system",
      option.previewMarkdown
        ? `Previewing ${option.title}:\n${option.previewMarkdown}`
        : `Previewing ${option.title}. Detailed markdown unavailable.`,
    );
  }, [pushMessage]);

  const handlePreviewUi = React.useCallback((optionId: string) => {
    const option = uiOptions.find((item) => item.id === optionId);
    if (!option) {
      return;
    }
    pushMessage(
      "system",
      `Preview ${option.name}: ${option.summary}${option.accessibilityNotes ? `\nAccessibility: ${option.accessibilityNotes}` : ""}`,
    );
  }, [pushMessage, uiOptions]);

  const handlePreviewStack = React.useCallback((stackId: string) => {
    const stack = snapshot.stacks.find((item) => item.id === stackId);
    if (!stack) {
      return;
    }
    pushMessage(
      "system",
      `Stack ${stack.id} rationale:\n${stack.rationale ?? "No rationale provided."}`,
    );
  }, [pushMessage, snapshot.stacks]);

  const handlePreviewTemplate = React.useCallback((templateId: string) => {
    const template = snapshot.templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    pushMessage(
      "system",
      `Template ${template.id} (digest ${template.digest}). ${template.source ? `Source: ${template.source}` : ""}`,
    );
  }, [pushMessage, snapshot.templates]);

  const navigateToDashboard = React.useCallback(() => {
    router.push("/");
  }, [router]);

  const tokensComplete = React.useMemo(() => tokens.some((token) => token.status === "valid"), [tokens]);
  const specsComplete = snapshot.status === "SpecsConfirmed" || snapshot.status === "StackSelected" || snapshot.status === "Locked";
  const stackComplete = snapshot.status === "StackSelected" || snapshot.status === "Locked";
  const templatesLocked = snapshot.status === "Locked";
  const logicComplete = Boolean(selectedLogicId);
  const uiComplete = Boolean(selectedUiId);
  const summaryComplete = templatesLocked && logicComplete && uiComplete;

  const activeStepId: StepId = React.useMemo(() => {
    if (!tokensComplete) {
      return "tokens";
    }
    if (!specsComplete) {
      return "spec";
    }
    if (!templatesLocked) {
      return "stack";
    }
    if (!logicComplete) {
      return "logic";
    }
    if (!uiComplete) {
      return "ui";
    }
    return "summary";
  }, [logicComplete, specsComplete, templatesLocked, tokensComplete, uiComplete]);

  const completedSteps = React.useMemo(() => {
    const done: StepId[] = [];
    if (tokensComplete) {
      done.push("tokens");
    }
    if (specsComplete) {
      done.push("spec");
    }
    if (templatesLocked) {
      done.push("stack");
    }
    if (logicComplete) {
      done.push("logic");
    }
    if (uiComplete) {
      done.push("ui");
    }
    if (summaryComplete) {
      done.push("summary");
    }
    return done;
  }, [logicComplete, specsComplete, summaryComplete, templatesLocked, tokensComplete, uiComplete]);

  const selectedTemplateIds = React.useMemo(
    () => Object.entries(selectedTemplatesMap).filter(([, selected]) => selected).map(([templateId]) => templateId),
    [selectedTemplatesMap],
  );

  const selectedStack = React.useMemo(() => {
    if (!snapshot.selectedStackId) {
      return null;
    }
    const existing = snapshot.stacks.find((stack) => stack.id === snapshot.selectedStackId);
    if (existing) {
      return existing;
    }
    if (snapshot.manifest?.stack) {
      return {
        id: snapshot.manifest.stack.id,
        pros: [],
        cons: [],
        risks: [],
        opsNotes: [],
        expectedCosts: undefined,
        fit_score: 0.5,
        rationale: snapshot.manifest.stack.rationaleRef,
      } as StackRecommendation;
    }
    return null;
  }, [snapshot.manifest?.stack, snapshot.selectedStackId, snapshot.stacks]);

  const lockedTemplates = React.useMemo(() => {
    if (snapshot.status !== "Locked") {
      return snapshot.templates;
    }
    return snapshot.templates;
  }, [snapshot.status, snapshot.templates]);

  if (!onboardingEnabled) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center gap-6 p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-400" aria-hidden="true" />
        <h1 className="text-3xl font-semibold text-white">Onboarding disabled</h1>
        <p className="max-w-xl text-sm text-slate-400">
          The onboarding wizard is not enabled for this environment. Set <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">NEXT_PUBLIC_ONBOARDING_ENABLED=true</code> and reload.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
        >
          Return to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 p-6">
      <header className="space-y-2">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Project Onboarding</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
          <span className="text-base font-semibold text-white">Project</span>
          <code className="rounded bg-slate-900 px-2 py-1 text-xs text-emerald-200">{resolvedProjectId}</code>
          <span className="text-slate-600">•</span>
          <span>{environment.status === "ONLINE" ? "MCP online" : "MCP offline"}</span>
          {environment.baseUrl ? (
            <span>
              Base URL <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">{environment.baseUrl}</code>
            </span>
          ) : null}
        </div>
      </header>

      <WizardProgressBar steps={STEP_CONFIG} activeStepId={activeStepId} completedStepIds={completedSteps} />

      {errorBanner ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorBanner}
        </div>
      ) : null}

      {pendingStep ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-emerald-200">
          {pendingStep === "specs"
            ? "Drafting system requirements..."
            : pendingStep === "stack"
              ? "Recording stack selection..."
              : pendingStep === "templates"
                ? "Locking templates..."
                : pendingStep === "tokens"
                  ? "Validating token..."
                  : pendingStep === "logic"
                    ? "Syncing business logic selection..."
                    : pendingStep === "ui"
                      ? "Saving UI template..."
                      : "Processing..."}
        </div>
      ) : null}

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-6">
          {activeStepId === "tokens" ? (
            <TokenStep
              providers={providers}
              tokens={tokens}
              validatingProviderId={validatingProviderId}
              onValidate={handleValidateToken}
              onRemoveToken={handleRemoveToken}
              error={tokenError}
            />
          ) : null}

          {activeStepId === "spec" ? (
            <SpecStep
              messages={messages}
              draft={snapshot.specsDraft}
              confirmation={snapshot.confirmation}
              isStreaming={pendingStep === "specs"}
              disabled={pendingStep === "specs"}
              onSendMessage={handleSendMessage}
              onAction={handleSpecsAction}
              onUpload={handleAttachmentsUpload}
              onClearUploads={handleClearUploads}
            />
          ) : null}

          {activeStepId === "stack" ? (
            // Step 3: Recommend stacks using agent-mcp and capture template locks per Codex prompting guidance.
            <StackStep
              stacks={snapshot.stacks as StackRecommendation[]}
              selectedStackId={snapshot.selectedStackId}
              onSelectStack={handleSelectStack}
              onPreviewStack={handlePreviewStack}
              templates={snapshot.templates as TemplateDescriptor[]}
              selectedTemplateIds={selectedTemplateIds}
              onToggleTemplate={handleToggleTemplate}
              onPreviewTemplate={handlePreviewTemplate}
              onLockTemplates={handleLockTemplates}
              disabled={pendingStep === "stack" || pendingStep === "templates"}
              lockDisabled={Object.values(selectedTemplatesMap).every((selected) => !selected)}
            />
          ) : null}

          {activeStepId === "logic" ? (
            // Step 4: Surface business logic scaffolds from agent-mcp recommendations for Codex-style review.
            <LogicStep
              options={logicOptions}
              selectedOptionId={selectedLogicId}
              onSelectOption={(optionId) => setSelectedLogicId(optionId)}
              onPreviewOption={handlePreviewLogic}
              disabled={pendingStep === "logic"}
            />
          ) : null}

          {activeStepId === "ui" ? (
            // Step 5: Present UI/UX templates with accessibility notes for final confirmation.
            <UIStep
              options={uiOptions}
              selectedOptionId={selectedUiId}
              onSelectOption={(optionId) => setSelectedUiId(optionId)}
              onPreviewOption={handlePreviewUi}
              disabled={pendingStep === "ui"}
            />
          ) : null}

          {activeStepId === "summary" ? (
            // Step 6: Summarize onboarding selections for audit logs before enabling navigation.
            <SummaryStep
              selectedStack={selectedStack}
              lockedTemplates={lockedTemplates}
              logicOption={logicOptions.find((item) => item.id === selectedLogicId) ?? null}
              uiOption={uiOptions.find((item) => item.id === selectedUiId) ?? null}
              onCopySummary={() => setLastCopiedAt(Date.now())}
            />
          ) : null}
        </section>

        <aside className="flex flex-col gap-6">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-300">
            <p className="font-rajdhani text-[11px] uppercase tracking-[0.4em] text-slate-500">Activity Log</p>
            <div className="mt-2 space-y-3">
              {messages.slice(-5).map((message) => (
                <article key={message.id} className="rounded-lg border border-slate-800/60 bg-slate-900/60 px-3 py-2 text-xs">
                  <p className="font-semibold text-slate-200">{message.role === "assistant" ? "Advisor" : message.role}</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-300">{message.content}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-300">
            <p className="font-rajdhani text-[11px] uppercase tracking-[0.4em] text-slate-500">Quick Actions</p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSelectAllTemplates}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
              >
                Select all templates
              </button>
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                disabled={!allowReset}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset onboarding
              </button>
              <button
                type="button"
                onClick={navigateToDashboard}
                disabled={!summaryComplete}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowRight className="h-3.5 w-3.5" /> Launch studio
              </button>
            </div>
            {lastCopiedAt ? (
              <p className="mt-3 text-xs text-slate-500">Summary copied {new Date(lastCopiedAt).toLocaleTimeString()}.</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-300">
            <p className="font-rajdhani text-[11px] uppercase tracking-[0.4em] text-slate-500">Run Diagnostics</p>
            <p className="mt-2 text-xs text-slate-400">
              Runs are executed against <code className="rounded bg-slate-900 px-1 py-0.5 text-[10px]">{baseUrl}</code>. Trace ID
              <code className="ml-1 rounded bg-slate-900 px-1 py-0.5 text-[10px]">{traceId}</code> attaches to SSE streams for auditing.
            </p>
          </div>
        </aside>
      </div>

      <ConfirmModal
        title="Reset onboarding?"
        description="This action clears the manifest, specs, stack selection, and template locks. You will need to start the onboarding flow again from Step 1."
        confirmLabel="Reset"
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
      />
    </div>
  );
}
