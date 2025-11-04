"use client";

import React from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileUploaderProps {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFilesSelected?: (files: FileList) => void;
  onClear?: () => void;
  className?: string;
}

export function FileUploader({
  accept,
  multiple = false,
  disabled = false,
  onFilesSelected,
  onClear,
  className,
}: FileUploaderProps): React.ReactNode {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [fileNames, setFileNames] = React.useState<string[]>([]);

  const handleSelect = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      if (!event.target.files) {
        return;
      }
      setFileNames(Array.from(event.target.files, (file) => file.name));
      onFilesSelected?.(event.target.files);
    },
    [onFilesSelected],
  );

  const handleClear = React.useCallback(() => {
    setFileNames([]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onClear?.();
  }, [onClear]);

  const buttonLabel = fileNames.length > 0 ? `${fileNames.length} file(s) selected` : "Attach files";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <label
        className={cn(
          "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition",
          disabled && "cursor-not-allowed opacity-40",
        )}
      >
        <UploadCloud className="h-4 w-4" aria-hidden="true" />
        <span>{buttonLabel}</span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleSelect}
          className="hidden"
        />
      </label>
      {fileNames.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {fileNames.slice(0, 3).map((name) => (
            <span key={name} className="rounded bg-slate-800/80 px-2 py-1 font-mono">
              {name}
            </span>
          ))}
          {fileNames.length > 3 ? <span className="text-slate-500">+{fileNames.length - 3} more</span> : null}
          <button
            type="button"
            onClick={handleClear}
            className="rounded bg-slate-800/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-700"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

