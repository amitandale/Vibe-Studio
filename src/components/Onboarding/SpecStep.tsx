"use client";

import React from "react";
import type { SpecsDraft, SpecsConfirmationSummary } from "@/lib/onboarding/schemas";
import { FileUploader } from "@/components/FileUploader";
import { SpecsChat, type ChatMessage } from "@/app/onboarding/_components/SpecsChat";

interface SpecStepProps {
  messages: ChatMessage[];
  draft: SpecsDraft | null;
  confirmation: SpecsConfirmationSummary | null;
  isStreaming: boolean;
  disabled: boolean;
  onSendMessage: (message: string) => void;
  onAction: (action: "refine" | "suggestion" | "clear" | "confirm") => void;
  onUpload: (files: FileList) => void;
  onClearUploads: () => void;
}

export function SpecStep({
  messages,
  draft,
  confirmation,
  isStreaming,
  disabled,
  onSendMessage,
  onAction,
  onUpload,
  onClearUploads,
}: SpecStepProps): React.ReactNode {
  const [attachments, setAttachments] = React.useState<File[]>([]);

  const handleUpload = React.useCallback(
    (files: FileList) => {
      const selected = Array.from(files);
      setAttachments(selected);
      onUpload(files);
    },
    [onUpload],
  );

  const handleClear = React.useCallback(() => {
    setAttachments([]);
    onClearUploads();
  }, [onClearUploads]);

  return (
    <div className="space-y-4">
      <SpecsChat
        messages={messages}
        onSend={onSendMessage}
        onAction={onAction}
        disabled={disabled}
        isStreaming={isStreaming}
        draft={draft}
        confirmation={confirmation}
      />
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
        <p className="font-rajdhani text-xs uppercase tracking-[0.3em] text-slate-400">Attachments</p>
        <p className="mt-1 text-sm text-slate-300">
          Upload reference documents or branding assets. Files are available to the onboarding assistant for this session only.
        </p>
        <FileUploader
          accept=".md,.pdf,.png,.jpg,.jpeg,.txt"
          multiple
          onFilesSelected={handleUpload}
          onClear={handleClear}
          className="mt-3"
          disabled={disabled}
        />
        {attachments.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {attachments.map((file) => (
              <li key={file.name}>
                {file.name} — {(file.size / 1024).toFixed(1)} KB
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

