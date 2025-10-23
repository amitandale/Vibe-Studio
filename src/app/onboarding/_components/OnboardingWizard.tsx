"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { SpecsChat, type ChatMessage, type ChatRole, createSystemMessage } from "./SpecsChat";
import { StacksPicker } from "./StacksPicker";
import { TemplatesPicker } from "./TemplatesPicker";
import { ConfirmModal } from "./ConfirmModal";
import { OnboardingClient, type StartRunRequest } from "@/lib/api/onboarding.client";
import {
  onboardingManifestSchema,
  type OnboardingManifest,
  type OnboardingEvent,
} from "@/lib/onboarding/schemas";
import {
  OnboardingStateMachine,
  type OnboardingSnapshot,
  resolveProjectId,
} from "@/lib/onboarding/state";
import { persistTraceId, readTraceId } from "@/lib/onboarding/storage";
import { detectMcpEnvironment, type McpEnvironmentSnapshot } from "@/lib/env/detectMcpEnv";
import "@/styles/onboarding.css";

interface OnboardingWizardProps {
  projectId: string;
  baseUrl: string;
  manifest: OnboardingManifest | null;
  onboardingEnabled: boolean;
  allowReset: boolean;
}

type PendingStep = "specs" | "stack" | "templates" | "reset" | null;

const INITIAL_ENVIRONMENT: McpEnvironmentSnapshot = {
  status: "OFFLINE",
  baseUrl: null,
  timestamp: Date.now(),
};

const STEP_ITEMS = [
  {
    id: 1,
    title: "System Requirements",
    description: "Draft product goals, constraints, data sources, auth, and NFRs.",
  },
  {
    id: 2,
    title: "Stack Recommendation",
    description: "Review ranked stacks with rationale and select the best fit.",
  },
  {
    id: 3,
    title: "Template Lock",
    description: "Choose base templates per sub-stack and create templates.lock.json.",
  },
] as const;

export function OnboardingWizard({
  projectId,
  baseUrl,
  manifest,
  onboardingEnabled,
  allowReset,
}: OnboardingWizardProps): React.ReactNode {
  const router = useRouter();
  const resolvedProjectId = React.useMemo(() => projectId || resolveProjectId(), [projectId]);
  const clientRef = React.useRef<OnboardingClient | null>(null);
  const [environment, setEnvironment] = React.useState<McpEnvironmentSnapshot>(INITIAL_ENVIRONMENT);
  const machineRef = React.useRef<OnboardingStateMachine>(
    new OnboardingStateMachine({ projectId: resolvedProjectId, manifest: manifest ?? undefined }),
  );
  const [snapshot, setSnapshot] = React.useState<OnboardingSnapshot>(() => machineRef.current.getSnapshot());
  const [activeStep, setActiveStep] = React.useState<number>(machineRef.current.getCurrentStep());
  const [messages, setMessages] = React.useState<ChatMessage[]>(() => [
    createSystemMessage("Welcome to the Vibe-Studio onboarding flow."),
    createSystemMessage(
      "Provide your product goals, constraints, data sources, auth model, and NFRs. The advisor will draft specs and preview them live.",
    ),
  ]);
  const [traceId, setTraceId] = React.useState<string>(() => {
    if (typeof window !== "undefined") {
      return readTraceId(resolvedProjectId) ?? uuidv4();
    }
    return uuidv4();
  });
  const [pendingStep, setPendingStep] = React.useState<PendingStep>(null);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [selectedTemplates, setSelectedTemplates] = React.useState<Record<string, boolean>>({});
  const streamCancelRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    clientRef.current = new OnboardingClient(baseUrl, resolvedProjectId);
  }, [baseUrl, resolvedProjectId]);

  React.useEffect(() => {
    if (!manifest) {
      return;
    }
    try {
      const parsed = onboardingManifestSchema.parse(manifest);
      machineRef.current.applyManifest(parsed);
      setSnapshot(machineRef.current.getSnapshot());
      setActiveStep(machineRef.current.getCurrentStep());
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
    setActiveStep(machineRef.current.getCurrentStep());
  }, [snapshot.status, snapshot.selectedStackId, snapshot.templates.length]);

  React.useEffect(() => {
    return () => {
      streamCancelRef.current?.();
      streamCancelRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const client = clientRef.current;
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
          pushMessage("assistant", "Templates locked successfully. Redirect to the dashboard when ready.");
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
      if (!clientRef.current) {
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
        const run = await clientRef.current.startRun(payload, traceId);
        streamCancelRef.current = clientRef.current.streamRun(
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

  const specsEditable = snapshot.status === "NotStarted" || snapshot.status === "SpecsDrafting";
  const stacksSelectable = snapshot.status === "SpecsConfirmed" || snapshot.status === "StackSelected";
  const templatesLockable = snapshot.status === "StackSelected" && snapshot.templates.length > 0;
  const locked = snapshot.status === "Locked";

  React.useEffect(() => {
    setSelectedTemplates((prev) => {
      const next: Record<string, boolean> = {};
      for (const template of snapshot.templates) {
        next[template.id] = prev[template.id] ?? true;
      }
      return next;
    });
  }, [snapshot.templates]);

  const handleSendMessage = React.useCallback(
    (message: string) => {
      startRun(
        {
          task: "onboarding/specs_draft",
          inputs: { message, draft: snapshot.specsDraft ?? {} },
          params: { mode: "conversational" },
        },
        "specs",
        { message },
      );
    },
    [snapshot.specsDraft, startRun],
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
    const selections = snapshot.templates.filter((template) => selectedTemplates[template.id]);
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
  }, [selectedTemplates, snapshot.selectedStackId, snapshot.templates, startRun]);

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
    setMessages([
      createSystemMessage("Onboarding has been reset. Start drafting specs to begin again."),
    ]);
    setActiveStep(1);
    setSelectedTemplates({});
    setPendingStep(null);
  }, [resolvedProjectId, startRun]);

  const handleSelectAllTemplates = React.useCallback(() => {
    setSelectedTemplates(() => {
      const next: Record<string, boolean> = {};
      for (const template of snapshot.templates) {
        next[template.id] = true;
      }
      return next;
    });
  }, [snapshot.templates]);

  const lockDisabled = !templatesLockable || Object.values(selectedTemplates).every((selected) => !selected);

  const violationBanner = snapshot.violations.length > 0 ? snapshot.violations[snapshot.violations.length - 1] : null;

  const navigateToDashboard = React.useCallback(() => {
    router.push("/");
  }, [router]);

  if (!onboardingEnabled) {
    return (
      <div className="mx-auto max-w-3xl py-24 text-center text-slate-200">
        <h1 className="text-3xl font-semibold text-white">Onboarding disabled</h1>
        <p className="mt-4 text-sm text-slate-400">
          The onboarding wizard is not enabled for this environment. Set <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">NEXT_PUBLIC_ONBOARDING_ENABLED=true</code> and reload.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-6 rounded-2xl border border-slate-800/70 bg-slate-950/70 p-6 shadow-lg shadow-emerald-500/5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-emerald-300/90">Project Onboarding</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">Project {resolvedProjectId}</h1>
            </div>
            <p className="text-sm text-slate-300">
              This wizard locks specs, stack, and templates for your project. Trace ID <span className="font-medium text-emerald-200">{traceId}</span> is applied to all MCP calls.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/60 px-3 py-1">
                <span className={`h-2 w-2 rounded-full ${getStatusColor(environment.status)}`} aria-hidden />
                MCP {environment.status.toLowerCase()} • {environment.latencyMs ? `${environment.latencyMs} ms` : "probing"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/60 px-3 py-1">
                Updated {new Date(snapshot.manifest?.updatedAt ?? Date.now()).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
            >
              Exit to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            {allowReset ? (
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
              >
                <RefreshCw className="h-4 w-4" />
                Reset Onboarding
              </button>
            ) : null}
          </div>
        </header>

        {errorBanner ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Something went wrong</p>
              <p className="text-rose-100">{errorBanner}</p>
            </div>
          </div>
        ) : null}

        {violationBanner ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">SSE violation detected</p>
              <p className="text-amber-50">Received {violationBanner.eventType} with sequence {violationBanner.seq}. Progression is paused until ordering is restored.</p>
            </div>
          </div>
        ) : null}

        <div className="onboarding-grid flex-1">
          <aside className="space-y-4">
            {STEP_ITEMS.map((step) => {
              const isActive = step.id === activeStep;
              const isComplete =
                (step.id === 1 && snapshot.status !== "NotStarted" && snapshot.status !== "SpecsDrafting") ||
                (step.id === 2 && (snapshot.status === "StackSelected" || snapshot.status === "Locked")) ||
                (step.id === 3 && snapshot.status === "Locked");
              return (
                <div
                  key={step.id}
                  className={`rounded-2xl border p-4 transition ${
                    isActive
                      ? "border-emerald-400/50 bg-emerald-500/10"
                      : "border-slate-800/70 bg-slate-950/70"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Step {step.id}</p>
                    {isComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : null}
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-xs text-slate-400">{step.description}</p>
                </div>
              );
            })}
          </aside>

          <section className="space-y-6">
            {locked ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-slate-100">
                <h2 className="text-2xl font-semibold text-white">Templates locked</h2>
                <p className="mt-3 text-sm text-emerald-100">
                  Your onboarding flow is complete. A <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">templates.lock.json</code> artifact is now immutable.
                </p>
                <button
                  type="button"
                  onClick={navigateToDashboard}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Continue to dashboard
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : activeStep === 1 ? (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-6">
                  <h2 className="text-2xl font-semibold text-white">Specs Draft Preview</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Live updates stream from the advisor as it reasons through your requirements. Sections remain editable until you pick a stack.
                  </p>
                  <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-800/70 bg-slate-950/80 p-4 text-sm text-slate-200">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(snapshot.specsDraft ?? { status: "Awaiting input" }, null, 2)}</pre>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-6">
                  <h3 className="text-lg font-semibold text-white">Manifest status</h3>
                  <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Specs hash</dt>
                      <dd className="text-sm text-slate-200">{snapshot.manifest?.specsHash ?? "Pending"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Stack selection</dt>
                      <dd className="text-sm text-slate-200">{snapshot.manifest?.stack?.id ?? "Not selected"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Templates locked</dt>
                      <dd className="text-sm text-slate-200">{snapshot.manifest?.templates?.lockDigest ?? "Pending"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Last updated</dt>
                      <dd className="text-sm text-slate-200">
                        {snapshot.manifest?.updatedAt
                          ? new Date(snapshot.manifest.updatedAt).toLocaleString()
                          : "Awaiting data"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            ) : activeStep === 2 ? (
              <StacksPicker
                stacks={snapshot.stacks}
                onSelect={handleSelectStack}
                onBack={() => setActiveStep(1)}
                selectedStackId={snapshot.selectedStackId}
                disabled={!stacksSelectable || pendingStep === "stack"}
              />
            ) : (
              <TemplatesPicker
                templates={snapshot.templates}
                selected={selectedTemplates}
                onToggle={(templateId) =>
                  setSelectedTemplates((prev) => ({ ...prev, [templateId]: !(prev[templateId] ?? false) }))
                }
                onSelectAll={handleSelectAllTemplates}
                onLock={handleLockTemplates}
                locking={pendingStep === "templates"}
                disabled={!templatesLockable || pendingStep === "templates"}
                stackId={snapshot.selectedStackId}
                lockDigest={snapshot.lockDigest}
                lockDisabled={lockDisabled}
              />
            )}
          </section>

          <aside>
            <SpecsChat
              messages={messages}
              onSend={handleSendMessage}
              onAction={handleSpecsAction}
              disabled={!specsEditable || pendingStep === "specs" || locked}
              isStreaming={pendingStep === "specs"}
              draft={snapshot.specsDraft}
              confirmation={snapshot.confirmation}
            />
          </aside>
        </div>
      </div>

      <ConfirmModal
        title="Reset onboarding?"
        description="This action clears the manifest, specs, stack selection, and template locks. You will need to start the onboarding flow again from Step 1."
        confirmLabel="Reset"
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={handleReset}
        tone="danger"
        confirmLoading={pendingStep === "reset"}
      />
    </div>
  );
}

function getStatusColor(status: McpEnvironmentSnapshot["status"]): string {
  switch (status) {
    case "ONLINE":
      return "bg-emerald-400";
    case "DEGRADED":
      return "bg-amber-400";
    default:
      return "bg-rose-400";
  }
}
