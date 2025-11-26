"use client";

import { type FormEvent, useState } from "react";
import { PRImplementationRequest, VendorType } from "@/lib/api/types";

interface PRImplementationFormProps {
  onSubmit: (request: PRImplementationRequest) => void;
  isSubmitting?: boolean;
}

const VENDORS: { value: VendorType; label: string }[] = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude" },
  { value: "grok", label: "Grok" },
  { value: "antigravity", label: "Antigravity" },
  { value: "kimi", label: "Kimi" },
  { value: "qwen", label: "Qwen" },
];

export function PRImplementationForm({ onSubmit, isSubmitting }: PRImplementationFormProps) {
  const [formData, setFormData] = useState<PRImplementationRequest>({
    pr_title: "",
    pr_text: "",
    repo_url: "",
    working_branch: "main",
    vendor: "claude",
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="pr_title" className="block text-sm font-medium">
          PR Title
        </label>
        <input
          id="pr_title"
          type="text"
          required
          value={formData.pr_title}
          onChange={(event) => setFormData({ ...formData, pr_title: event.target.value })}
          className="mt-1 block w-full rounded-md border p-2"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="pr_text" className="block text-sm font-medium">
          Implementation Instructions
        </label>
        <textarea
          id="pr_text"
          required
          rows={6}
          value={formData.pr_text}
          onChange={(event) => setFormData({ ...formData, pr_text: event.target.value })}
          className="mt-1 block w-full rounded-md border p-2"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="repo_url" className="block text-sm font-medium">
          Repository URL
        </label>
        <input
          id="repo_url"
          type="url"
          required
          value={formData.repo_url}
          onChange={(event) => setFormData({ ...formData, repo_url: event.target.value })}
          className="mt-1 block w-full rounded-md border p-2"
          placeholder="https://github.com/owner/repo"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="working_branch" className="block text-sm font-medium">
          Target Branch
        </label>
        <input
          id="working_branch"
          type="text"
          required
          value={formData.working_branch}
          onChange={(event) => setFormData({ ...formData, working_branch: event.target.value })}
          className="mt-1 block w-full rounded-md border p-2"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="vendor" className="block text-sm font-medium">
          Vendor CLI
        </label>
        <select
          id="vendor"
          value={formData.vendor}
          onChange={(event) =>
            setFormData({ ...formData, vendor: event.target.value as VendorType })
          }
          className="mt-1 block w-full rounded-md border p-2"
          disabled={isSubmitting}
        >
          {VENDORS.map((vendor) => (
            <option key={vendor.value} value={vendor.value}>
              {vendor.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? "Running Workflow..." : "Start Implementation"}
      </button>
    </form>
  );
}
