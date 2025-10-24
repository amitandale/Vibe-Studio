"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  open: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  tone?: "default" | "danger";
  confirmLoading?: boolean;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  open,
  onConfirm,
  onOpenChange,
  tone = "default",
  confirmLoading = false,
}: ConfirmModalProps): React.ReactNode {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-800/70 bg-slate-950 p-6 shadow-xl shadow-emerald-500/10 focus:outline-none">
          <div className="flex items-start justify-between gap-6">
            <div>
              <Dialog.Title className="text-xl font-semibold text-white">{title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-slate-300">{description}</Dialog.Description>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-transparent p-1 text-slate-400 transition hover:border-slate-700 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
                disabled={confirmLoading}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmLoading}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition",
                tone === "danger"
                  ? "border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                  : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
                confirmLoading ? "opacity-70" : undefined,
              )}
            >
              {confirmLoading ? "Working..." : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
