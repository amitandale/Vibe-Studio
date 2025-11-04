"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
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
import { OnboardingClient } from "@/lib/api/onboarding.client";
import { AgentMcpClient } from "@/lib/api/client";
import type {
  ProviderDescriptor,
  ProviderTokenRecord,
  TokenValidationResult,
  ToolAttachmentPayload,
  PullRequestSummary,
} from "@/lib/api/types";
import {
  onboardingManifestSchema,
  onboardingStatusSchema,
  type OnboardingManifest,
  type OnboardingStatus,
  type SpecsDraft,
  type SpecsConfirmationSummary,
  type StackRecommendation,
  type TemplateDescriptor,
} from "@/lib/onboarding/schemas";
import { loadOnboardingContracts, type OnboardingContracts } from "@/lib/onboarding/contracts";
import { persistTraceId, readTraceId } from "@/lib/onboarding/storage";
import { detectMcpEnvironment, type McpEnvironmentSnapshot } from "@/lib/env/detectMcpEnv";
import { resolveProjectId } from "@/lib/onboarding/state";
import "@/styles/onboarding.css";

const OFFLINE_PROVIDERS: ProviderDescriptor[] = [
  { id: "openai", name: "OpenAI", docsUrl: "https://platform.openai.com/docs" },
  { id: "anthropic", name: "Anthropic", docsUrl: "https://docs.anthropic.com" },
  { id: "azure-openai", name: "Azure OpenAI", docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/" },
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

type PendingStep = StepId | "templates" | "reset" | null;

type WizardToolName =
  | "wizard/spec_chat"
  | "wizard/stack_recommend"
  | "wizard/logic_recommend"
  | "wizard/ui_recommend"
  | "wizard/pr_dashboard";

interface WizardRationales {
  spec?: string | null;
  stack?: string | null;
  logic?: string | null;
  ui?: string | null;
  summary?: string | null;
}

const INITIAL_ENVIRONMENT: McpEnvironmentSnapshot = {
  status: "OFFLINE",
  baseUrl: null,
  timestamp: Date.now(),
};

const INITIAL_MESSAGES: ChatMessage[] = [
  createSystemMessage("Welcome to the Vibe-Studio onboarding flow."),
  createSystemMessage(
    "Provide your product goals, constraints, data sources, auth model, and NFRs. The advisor drafts specs with iterative validation.",
  ),
];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof window !== "undefined" && window.btoa) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  }
  const globalBuffer =
    typeof globalThis !== "undefined"
      ? ((globalThis as Record<string, unknown>).Buffer as
          | { from: (data: ArrayBuffer | Uint8Array) => { toString: (encoding: string) => string } }
          | undefined)
      : undefined;
  if (globalBuffer) {
    return globalBuffer.from(buffer).toString("base64");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return btoa(binary);
}

function toAttachmentPayload(file: File): Promise<ToolAttachmentPayload> {
  return file.arrayBuffer().then((buffer) => ({
    name: file.name,
    data: arrayBufferToBase64(buffer),
    mime_type: file.type || "application/octet-stream",
  }));
}

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
  const contractsRef = React.useRef<OnboardingContracts | null>(null);
  const [contractsError, setContractsError] = React.useState<string | null>(null);
  const [environment, setEnvironment] = React.useState<McpEnvironmentSnapshot>(INITIAL_ENVIRONMENT);
  const [providers, setProviders] = React.useState<ProviderDescriptor[]>(OFFLINE_PROVIDERS);
  const [tokens, setTokens] = React.useState<ProviderTokenRecord[]>([]);
  const [validatingProviderId, setValidatingProviderId] = React.useState<string | null>(null);
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [specDraft, setSpecDraft] = React.useState<SpecsDraft | null>(null);
  const [specConfirmation, setSpecConfirmation] = React.useState<SpecsConfirmationSummary | null>(null);
  const [stackRecommendations, setStackRecommendations] = React.useState<StackRecommendation[]>([]);
  const [templates, setTemplates] = React.useState<TemplateDescriptor[]>(manifest?.templates?.items ?? []);
  const [selectedTemplatesMap, setSelectedTemplatesMap] = React.useState<Record<string, boolean>>(() => {
    if (!manifest?.templates?.items) {
      return {};
    }
    return Object.fromEntries(manifest.templates.items.map((item) => [item.id, true]));
  });
  const [selectedStackId, setSelectedStackId] = React.useState<string | null>(manifest?.stack?.id ?? null);
  const [logicOptions, setLogicOptions] = React.useState<BusinessLogicOption[]>([]);
  const [selectedLogicId, setSelectedLogicId] = React.useState<string | null>(null);
  const [uiOptions, setUiOptions] = React.useState<UiTemplateOption[]>([]);
  const [selectedUiId, setSelectedUiId] = React.useState<string | null>(null);
  const [pullRequests, setPullRequests] = React.useState<PullRequestSummary[]>([]);
  const [auditEvents, setAuditEvents] = React.useState<unknown[]>([]);
  const [rationales, setRationales] = React.useState<WizardRationales>({});
  const [status, setStatus] = React.useState<OnboardingStatus>(manifest?.status ?? "NotStarted");
  const [manifestState, setManifestState] = React.useState<OnboardingManifest | null>(manifest ?? null);
  const [pendingStep, setPendingStep] = React.useState<PendingStep>(null);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
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
    let active = true;
    void loadOnboardingContracts(baseUrl)
      .then((contracts) => {
        if (active) {
          contractsRef.current = contracts;
          setContractsError(null);
        }
      })
      .catch((error) => {
        if (active) {
          setContractsError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      active = false;
    };
  }, [baseUrl]);

  React.useEffect(() => {
    if (!manifest) {
      return;
    }
    try {
      const parsed = onboardingManifestSchema.parse(manifest);
      setManifestState(parsed);
      setStatus(parsed.status);
      if (parsed.stack?.id) {
        setSelectedStackId(parsed.stack.id);
      }
      if (parsed.templates?.items) {
        setTemplates(parsed.templates.items);
        setSelectedTemplatesMap((prev) => {
          const next: Record<string, boolean> = {};
          for (const template of parsed.templates?.items ?? []) {
            next[template.id] = prev[template.id] ?? true;
          }
          return next;
        });
      }
    } catch (error) {
      console.warn("Unable to parse onboarding manifest", error);
    }
  }, [manifest]);

  React.useEffect(() => {
    const client = onboardingClientRef.current;
    if (!client) {
      return;
    }
    let cancelled = false;
    const loadManifest = async () => {
      try {
        const fresh = await client.fetchManifest(traceId);
        if (!cancelled && fresh) {
          setManifestState(fresh);
          setStatus(onboardingStatusSchema.parse(fresh.status));
          if (fresh.stack?.id) {
            setSelectedStackId(fresh.stack.id);
          }
          if (fresh.templates?.items) {
            setTemplates(fresh.templates.items);
            setSelectedTemplatesMap((prev) => {
              const next: Record<string, boolean> = {};
              for (const template of fresh.templates?.items ?? []) {
                next[template.id] = prev[template.id] ?? true;
              }
              return next;
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to fetch onboarding manifest", error);
        }
      }
    };
    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  React.useEffect(() => {
    const client = onboardingClientRef.current;
    if (!client) {
      return;
    }
    streamCancelRef.current?.();
    streamCancelRef.current = client.streamTrace(traceId, {
      onEvent: (event) => {
        switch (event.type) {
          case "SPECS_DRAFT_UPDATED":
            setSpecDraft(event.draft);
            setStatus((current) => (current === "NotStarted" ? "SpecsDrafting" : current));
            break;
          case "SPECS_CONFIRMATION_READY":
            setSpecConfirmation(event.summary);
            setStatus((current) => (current === "SpecsDrafting" ? "SpecsDrafting" : current));
            break;
          case "STACKS_RECOMMENDED":
            setStackRecommendations(event.items);
            setStatus((current) => (current === "SpecsDrafting" ? "SpecsConfirmed" : current));
            break;
          case "STACK_SELECTED":
            setSelectedStackId(event.id);
            setStatus((current) => (current === "SpecsConfirmed" ? "StackSelected" : current));
            break;
          case "TEMPLATES_LISTED":
            setTemplates(event.items);
            break;
          case "TEMPLATES_LOCKED":
            setStatus("Locked");
            break;
          case "ERROR":
            setErrorBanner(event.message);
            break;
          default:
            break;
        }
      },
      onError: (error) => {
        console.warn("Onboarding event stream error", error);
      },
    });
    return () => {
      streamCancelRef.current?.();
      streamCancelRef.current = null;
    };
  }, [traceId]);

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

  React.useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  const encodeAttachments = React.useCallback(async (files: File[]): Promise<ToolAttachmentPayload[] | undefined> => {
    if (files.length === 0) {
      return undefined;
    }
    const encoded = await Promise.all(files.map((file) => toAttachmentPayload(file)));
    return encoded;
  }, []);

  const invokeWizardTool = React.useCallback(
    async <TResult, TInput extends Record<string, unknown> = Record<string, unknown>>(
      toolName: WizardToolName,
      input: TInput,
      options?: { pendingStep?: PendingStep; message?: string; role?: ChatRole; files?: File[] },
    ): Promise<TResult> => {
      if (!apiClientRef.current) {
        throw new Error("MCP client unavailable. Check your environment configuration.");
      }
      const contracts = contractsRef.current;
      const contract = contracts?.tools?.[toolName];
      if (!contract) {
        throw new Error(`Tool contract missing for ${toolName}`);
      }
      const payload = {
        project_id: resolvedProjectId,
        trace_id: traceId,
        ...input,
      } as Record<string, unknown>;
      const validatedInput = contract.inputSchema.parse(payload);
      const attachmentsPayload = options?.files ? await encodeAttachments(options.files) : undefined;
      if (options?.message) {
        setMessages((prev) => [
          ...prev,
          { id: uuidv4(), role: options.role ?? "user", content: options.message, timestamp: Date.now() },
        ]);
      }
      setPendingStep(options?.pendingStep ?? null);
      setErrorBanner(null);
      try {
        const response = await apiClientRef.current.invokeTool<TResult>(toolName, {
          input: validatedInput,
          projectId: resolvedProjectId,
          traceId,
          attachments: attachmentsPayload,
        });
        const parsed = contract.outputSchema.parse(response.result) as TResult;
        return parsed;
      } catch (error) {
        setErrorBanner(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        setPendingStep(null);
      }
    },
    [encodeAttachments, resolvedProjectId, traceId],
  );

  const handleSendMessage = React.useCallback(
    async (message: string) => {
      const conversation = [...messages, { id: uuidv4(), role: "user" as ChatRole, content: message, timestamp: Date.now() }];
      try {
        const result = await invokeWizardTool<{
          messages: ChatMessage[];
          draft?: SpecsDraft | null;
          confirmation?: SpecsConfirmationSummary | null;
          rationale?: string | null;
          manifest?: OnboardingManifest | null;
        }>(
          "wizard/spec_chat",
          {
            conversation: conversation.map(({ id, role, content, rationale }) => ({ id, role, content, rationale })),
            message,
            action: null,
          },
          { pendingStep: "spec", message, role: "user", files: attachments },
        );
        setMessages(result.messages.length > 0 ? result.messages : conversation);
        setSpecDraft(result.draft ?? null);
        setSpecConfirmation(result.confirmation ?? null);
        setRationales((prev) => ({ ...prev, spec: result.rationale ?? null }));
        if (result.manifest) {
          setManifestState(result.manifest);
          setStatus(onboardingStatusSchema.parse(result.manifest.status));
        }
      } catch (error) {
        console.warn("Failed to send spec message", error);
      }
    },
    [attachments, invokeWizardTool, messages],
  );

  const handleSpecsAction = React.useCallback(
    async (action: "refine" | "suggestion" | "clear" | "confirm") => {
      try {
        const result = await invokeWizardTool<{
          messages: ChatMessage[];
          draft?: SpecsDraft | null;
          confirmation?: SpecsConfirmationSummary | null;
          rationale?: string | null;
          manifest?: OnboardingManifest | null;
        }>(
          "wizard/spec_chat",
          {
            conversation: messages.map(({ id, role, content, rationale }) => ({ id, role, content, rationale })),
            message: action,
            action,
          },
          { pendingStep: "spec" },
        );
        if (result.messages?.length) {
          setMessages(result.messages);
        }
        setSpecDraft(result.draft ?? null);
        setSpecConfirmation(result.confirmation ?? null);
        setRationales((prev) => ({ ...prev, spec: result.rationale ?? null }));
        if (result.manifest) {
          setManifestState(result.manifest);
          setStatus(onboardingStatusSchema.parse(result.manifest.status));
        }
      } catch (error) {
        console.warn("Failed to process spec action", error);
      }
    },
    [invokeWizardTool, messages],
  );

  const handleSelectStack = React.useCallback(
    async (stackId: string) => {
      try {
        const selection = {
          stack_id: stackId,
          template_ids: Object.entries(selectedTemplatesMap)
            .filter(([, selected]) => selected)
            .map(([id]) => id),
        };
        const result = await invokeWizardTool<{
          stacks: StackRecommendation[];
          templates?: TemplateDescriptor[] | null;
          rationale?: string | null;
          manifest?: OnboardingManifest | null;
        }>(
          "wizard/stack_recommend",
          { selection },
          { pendingStep: "stack" },
        );
        setStackRecommendations(result.stacks ?? []);
        if (result.templates) {
          setTemplates(result.templates);
        }
        setSelectedStackId(stackId);
        setRationales((prev) => ({ ...prev, stack: result.rationale ?? null }));
        if (result.manifest) {
          setManifestState(result.manifest);
          setStatus(onboardingStatusSchema.parse(result.manifest.status));
        }
      } catch (error) {
        console.warn("Failed to record stack selection", error);
      }
    },
    [invokeWizardTool, selectedTemplatesMap],
  );

  const handleLockTemplates = React.useCallback(async () => {
    if (!selectedStackId) {
      setErrorBanner("Select a stack before locking templates.");
      return;
    }
    const templateIds = Object.entries(selectedTemplatesMap)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    if (templateIds.length === 0) {
      setErrorBanner("Select at least one template before locking.");
      return;
    }
    try {
      const result = await invokeWizardTool<{
        stacks: StackRecommendation[];
        templates?: TemplateDescriptor[] | null;
        manifest?: OnboardingManifest | null;
        rationale?: string | null;
      }>(
        "wizard/stack_recommend",
        { selection: { stack_id: selectedStackId, template_ids: templateIds } },
        { pendingStep: "templates" },
      );
      if (result.templates) {
        setTemplates(result.templates);
      }
      setRationales((prev) => ({ ...prev, stack: result.rationale ?? prev.stack ?? null }));
      if (result.manifest) {
        setManifestState(result.manifest);
        setStatus(onboardingStatusSchema.parse(result.manifest.status));
      }
    } catch (error) {
      console.warn("Failed to lock templates", error);
    }
  }, [invokeWizardTool, selectedStackId, selectedTemplatesMap]);

  const handleLogicSelection = React.useCallback(
    async (optionId: string) => {
      try {
        const result = await invokeWizardTool<{
          options: BusinessLogicOption[];
          rationale?: string | null;
          manifest?: OnboardingManifest | null;
        }>(
          "wizard/logic_recommend",
          { stack_id: selectedStackId, selection: { option_id: optionId } },
          { pendingStep: "logic" },
        );
        if (result.options) {
          setLogicOptions(result.options);
        }
        setSelectedLogicId(optionId);
        setRationales((prev) => ({ ...prev, logic: result.rationale ?? null }));
        if (result.manifest) {
          setManifestState(result.manifest);
        }
      } catch (error) {
        console.warn("Failed to select logic option", error);
      }
    },
    [invokeWizardTool, selectedStackId],
  );

  const handleUiSelection = React.useCallback(
    async (templateId: string) => {
      try {
        const result = await invokeWizardTool<{
          options: UiTemplateOption[];
          rationale?: string | null;
          manifest?: OnboardingManifest | null;
        }>(
          "wizard/ui_recommend",
          { stack_id: selectedStackId, selection: { template_id: templateId } },
          { pendingStep: "ui" },
        );
        if (result.options) {
          setUiOptions(result.options);
        }
        setSelectedUiId(templateId);
        setRationales((prev) => ({ ...prev, ui: result.rationale ?? null }));
        if (result.manifest) {
          setManifestState(result.manifest);
        }
      } catch (error) {
        console.warn("Failed to select UI option", error);
      }
    },
    [invokeWizardTool, selectedStackId],
  );

  const refreshDashboard = React.useCallback(async () => {
    try {
      const result = await invokeWizardTool<{
        pull_requests: PullRequestSummary[];
        audit_events?: unknown[] | null;
        rationale?: string | null;
        manifest?: OnboardingManifest | null;
      }>("wizard/pr_dashboard", { include_audit: true }, { pendingStep: "summary" });
      setPullRequests(result.pull_requests ?? []);
      setAuditEvents(result.audit_events ?? []);
      setRationales((prev) => ({ ...prev, summary: result.rationale ?? null }));
      if (result.manifest) {
        setManifestState(result.manifest);
        setStatus(onboardingStatusSchema.parse(result.manifest.status));
      }
    } catch (error) {
      console.warn("Failed to refresh PR dashboard", error);
    }
  }, [invokeWizardTool]);

  const handleValidateToken = React.useCallback(
    async (providerId: string, token: string): Promise<TokenValidationResult | null> => {
      if (!apiClientRef.current) {
        setTokenError("MCP client unavailable");
        return null;
      }
      setValidatingProviderId(providerId);
      try {
        const validation = await apiClientRef.current.validateProviderToken({
          providerId,
          token,
          projectId: resolvedProjectId,
        });
        const stored = await apiClientRef.current.storeProviderToken({
          providerId,
          token,
          projectId: resolvedProjectId,
        });
        setTokens((prev) => [stored, ...prev.filter((item) => item.id !== stored.id)]);
        setTokenError(null);
        return validation;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTokenError(message);
        return null;
      } finally {
        setValidatingProviderId(null);
      }
    },
    [resolvedProjectId],
  );

  const handleRemoveToken = React.useCallback(
    async (tokenId: string) => {
      if (!apiClientRef.current) {
        return;
      }
      try {
        await apiClientRef.current.deleteProviderToken(tokenId, resolvedProjectId);
        setTokens((prev) => prev.filter((item) => item.id !== tokenId));
      } catch (error) {
        setTokenError(error instanceof Error ? error.message : String(error));
      }
    },
    [resolvedProjectId],
  );

  const handleReset = React.useCallback(async () => {
    setResetOpen(false);
    setAttachments([]);
    setMessages(INITIAL_MESSAGES);
    setSpecDraft(null);
    setSpecConfirmation(null);
    setStackRecommendations([]);
    setTemplates([]);
    setSelectedTemplatesMap({});
    setSelectedStackId(null);
    setLogicOptions([]);
    setSelectedLogicId(null);
    setUiOptions([]);
    setSelectedUiId(null);
    setPullRequests([]);
    setAuditEvents([]);
    setRationales({});
    setStatus("NotStarted");
    setManifestState(null);
    try {
      await invokeWizardTool("wizard/pr_dashboard", { action: "reset" }, { pendingStep: "reset" });
    } catch (error) {
      console.warn("Reset request failed", error);
    }
  }, [invokeWizardTool]);

  const handleSelectAllTemplates = React.useCallback(() => {
    setSelectedTemplatesMap((prev) => {
      const next = { ...prev };
      for (const template of templates) {
        next[template.id] = true;
      }
      return next;
    });
  }, [templates]);

  const handleToggleTemplate = React.useCallback((templateId: string) => {
    setSelectedTemplatesMap((prev) => ({ ...prev, [templateId]: !prev[templateId] }));
  }, []);

  const handleAttachmentsUpload = React.useCallback((files: FileList) => {
    setAttachments(Array.from(files));
  }, []);

  const handleClearUploads = React.useCallback(() => {
    setAttachments([]);
  }, []);

  const activeStepId = React.useMemo<StepId>(() => {
    if (status === "Locked") {
      return "summary";
    }
    if (selectedUiId) {
      return "summary";
    }
    if (selectedLogicId) {
      return "ui";
    }
    if (selectedStackId) {
      return "logic";
    }
    if (specDraft || specConfirmation) {
      return "stack";
    }
    if (tokens.length > 0) {
      return "spec";
    }
    return "tokens";
  }, [selectedLogicId, selectedStackId, selectedUiId, specConfirmation, specDraft, status, tokens.length]);

  const templatesLocked = React.useMemo(() => status === "Locked" || (manifestState?.templates?.lockDigest ?? null) !== null, [
    manifestState?.templates?.lockDigest,
    status,
  ]);

  const logicComplete = React.useMemo(() => Boolean(selectedLogicId), [selectedLogicId]);
  const uiComplete = React.useMemo(() => Boolean(selectedUiId), [selectedUiId]);
  const summaryComplete = React.useMemo(() => status === "Locked", [status]);
  const tokensComplete = React.useMemo(() => tokens.length > 0, [tokens.length]);
  const specsComplete = React.useMemo(() => Boolean(specDraft) || Boolean(specConfirmation), [specDraft, specConfirmation]);

  const completedSteps = React.useMemo(() => {
    const done: StepId[] = [];
    if (tokensComplete) {
      done.push("tokens");
    }
    if (specsComplete) {
      done.push("spec");
    }
    if (selectedStackId) {
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
  }, [logicComplete, selectedStackId, specsComplete, summaryComplete, tokensComplete, uiComplete]);

  const selectedTemplateIds = React.useMemo(
    () => Object.entries(selectedTemplatesMap).filter(([, selected]) => selected).map(([templateId]) => templateId),
    [selectedTemplatesMap],
  );

  const lockedTemplates = React.useMemo(() => {
    if (templatesLocked) {
      return templates.filter((template) => selectedTemplatesMap[template.id]);
    }
    return templates;
  }, [selectedTemplatesMap, templates, templatesLocked]);

  const selectedStack = React.useMemo(() => {
    if (!selectedStackId) {
      return null;
    }
    return stackRecommendations.find((stack) => stack.id === selectedStackId) ?? null;
  }, [selectedStackId, stackRecommendations]);

  const handleCopySummary = React.useCallback(() => {
    setLastCopiedAt(Date.now());
  }, []);

  React.useEffect(() => {
    if (activeStepId !== "stack" || stackRecommendations.length > 0 || pendingStep === "stack") {
      return;
    }
    void invokeWizardTool<{
      stacks: StackRecommendation[];
      templates?: TemplateDescriptor[] | null;
      rationale?: string | null;
      manifest?: OnboardingManifest | null;
    }>("wizard/stack_recommend", {}, { pendingStep: "stack" })
      .then((result) => {
        setStackRecommendations(result.stacks ?? []);
        if (result.templates) {
          setTemplates(result.templates);
        }
        setRationales((prev) => ({ ...prev, stack: result.rationale ?? prev.stack ?? null }));
        if (result.manifest) {
          setManifestState(result.manifest);
          setStatus(onboardingStatusSchema.parse(result.manifest.status));
        }
      })
      .catch((error) => {
        console.warn("Failed to load stack recommendations", error);
      });
  }, [activeStepId, invokeWizardTool, pendingStep, stackRecommendations.length]);

  React.useEffect(() => {
    if (activeStepId !== "logic" || logicOptions.length > 0 || pendingStep === "logic") {
      return;
    }
    void invokeWizardTool<{
      options: BusinessLogicOption[];
      rationale?: string | null;
      manifest?: OnboardingManifest | null;
    }>("wizard/logic_recommend", { stack_id: selectedStackId ?? null }, { pendingStep: "logic" })
      .then((result) => {
        if (result.options) {
          setLogicOptions(result.options);
        }
        setRationales((prev) => ({ ...prev, logic: result.rationale ?? prev.logic ?? null }));
        if (result.manifest) {
          setManifestState(result.manifest);
        }
      })
      .catch((error) => {
        console.warn("Failed to load logic options", error);
      });
  }, [activeStepId, invokeWizardTool, logicOptions.length, pendingStep, selectedStackId]);

  React.useEffect(() => {
    if (activeStepId !== "ui" || uiOptions.length > 0 || pendingStep === "ui") {
      return;
    }
    void invokeWizardTool<{
      options: UiTemplateOption[];
      rationale?: string | null;
      manifest?: OnboardingManifest | null;
    }>("wizard/ui_recommend", { stack_id: selectedStackId ?? null }, { pendingStep: "ui" })
      .then((result) => {
        if (result.options) {
          setUiOptions(result.options);
        }
        setRationales((prev) => ({ ...prev, ui: result.rationale ?? prev.ui ?? null }));
        if (result.manifest) {
          setManifestState(result.manifest);
        }
      })
      .catch((error) => {
        console.warn("Failed to load UI recommendations", error);
      });
  }, [activeStepId, invokeWizardTool, pendingStep, selectedStackId, uiOptions.length]);

  React.useEffect(() => {
    if (!templatesLocked || pullRequests.length > 0) {
      return;
    }
    void refreshDashboard();
  }, [pullRequests.length, refreshDashboard, templatesLocked]);

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

      {contractsError ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {contractsError}
        </div>
      ) : null}

      {errorBanner ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorBanner}</div>
      ) : null}

      {pendingStep ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-emerald-200">
          {pendingStep === "spec"
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
                      : pendingStep === "summary"
                        ? "Refreshing PR dashboard..."
                        : pendingStep === "reset"
                          ? "Resetting onboarding state..."
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
              draft={specDraft}
              confirmation={specConfirmation}
              isStreaming={pendingStep === "spec"}
              disabled={pendingStep === "spec"}
              attachments={attachments}
              onSendMessage={handleSendMessage}
              onAction={handleSpecsAction}
              onUpload={handleAttachmentsUpload}
              onClearUploads={handleClearUploads}
              rationale={rationales.spec ?? null}
            />
          ) : null}

          {activeStepId === "stack" ? (
            <StackStep
              stacks={stackRecommendations}
              selectedStackId={selectedStackId}
              onSelectStack={handleSelectStack}
              onPreviewStack={() => undefined}
              templates={templates}
              selectedTemplateIds={selectedTemplateIds}
              onToggleTemplate={handleToggleTemplate}
              onPreviewTemplate={() => undefined}
              onLockTemplates={handleLockTemplates}
              disabled={pendingStep === "stack" || pendingStep === "templates"}
              lockDisabled={templatesLocked}
              onSelectAllTemplates={handleSelectAllTemplates}
              rationale={rationales.stack ?? null}
            />
          ) : null}

          {activeStepId === "logic" ? (
            <LogicStep
              options={logicOptions}
              selectedOptionId={selectedLogicId}
              onSelectOption={handleLogicSelection}
              onPreviewOption={() => undefined}
              disabled={pendingStep === "logic"}
              rationale={rationales.logic ?? null}
            />
          ) : null}

          {activeStepId === "ui" ? (
            <UIStep
              options={uiOptions}
              selectedOptionId={selectedUiId}
              onSelectOption={handleUiSelection}
              onPreviewOption={() => undefined}
              disabled={pendingStep === "ui"}
              rationale={rationales.ui ?? null}
            />
          ) : null}

          {activeStepId === "summary" ? (
            <SummaryStep
              selectedStack={selectedStack}
              lockedTemplates={lockedTemplates}
              logicOption={logicOptions.find((option) => option.id === selectedLogicId) ?? null}
              uiOption={uiOptions.find((option) => option.id === selectedUiId) ?? null}
              pullRequests={pullRequests}
              auditEvents={auditEvents}
              rationale={rationales.summary ?? null}
              onCopySummary={handleCopySummary}
              onRefreshDashboard={refreshDashboard}
            />
          ) : null}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status</p>
            <p className="mt-2 font-semibold text-white">{status}</p>
            <p className="mt-2 text-xs text-slate-500">
              Trace <code className="rounded bg-slate-900 px-1 py-0.5 text-[10px]">{traceId}</code>
            </p>
            {manifestState?.updatedAt ? (
              <p className="mt-2 text-xs text-slate-500">Updated {new Date(manifestState.updatedAt).toLocaleString()}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void router.push("/")}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
            >
              <ArrowRight className="h-4 w-4" /> Go to studio
            </button>
          </div>

          {allowReset ? (
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Reset</p>
              <p className="mt-2 text-sm text-slate-400">
                Resetting clears specs, stack selections, and locked templates. Stored tokens remain intact.
              </p>
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:border-rose-400/50 hover:bg-rose-500/20"
              >
                Reset onboarding
              </button>
            </div>
          ) : null}
        </aside>
      </div>

      <ConfirmModal
        open={resetOpen}
        title="Reset onboarding session"
        description="This clears draft specs, stack selections, and template locks. Tokens are preserved."
        confirmLabel="Reset"
        onOpenChange={setResetOpen}
        onConfirm={() => void handleReset()}
      />
    </div>
  );
}
