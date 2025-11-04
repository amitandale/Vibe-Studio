import React from "react";

export function ProjectMismatch({
  expected,
  received,
}: {
  expected: string;
  received: string;
}): React.ReactNode {
  return (
    <div className="mx-auto max-w-3xl py-24 text-center text-slate-200">
      <h1 className="text-3xl font-semibold text-white">Project ID mismatch</h1>
      <p className="mt-4 text-sm text-slate-400">
        The studio is configured for project <span className="font-semibold text-emerald-200">{expected}</span> but the URL provided{' '}
        <span className="font-semibold text-rose-200">{received}</span>.
      </p>
      <p className="mt-2 text-sm text-slate-400">Update the project_id query parameter or adjust your environment variables.</p>
    </div>
  );
}

export function MissingBaseUrl(): React.ReactNode {
  return (
    <div className="mx-auto max-w-3xl py-24 text-center text-slate-200">
      <h1 className="text-3xl font-semibold text-white">agent-mcp unavailable</h1>
      <p className="mt-4 text-sm text-slate-400">
        Provide <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">NEXT_PUBLIC_MCP_BASE_URL</code> or{' '}
        <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">NEXT_PUBLIC_API_URL</code> to access onboarding.
      </p>
    </div>
  );
}

export function MissingProjectId(): React.ReactNode {
  return (
    <div className="mx-auto max-w-3xl py-24 text-center text-slate-200">
      <h1 className="text-3xl font-semibold text-white">Project ID required</h1>
      <p className="mt-4 text-sm text-slate-400">
        Provide a <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">project_id</code> query parameter or set{" "}
        <code className="rounded bg-slate-900 px-1 py-0.5 text-xs">NEXT_PUBLIC_PROJECT_ID</code> before launching onboarding.
      </p>
      <p className="mt-2 text-sm text-slate-400">
        This ensures selections, credentials, and generated PRs are scoped to the correct project.
      </p>
    </div>
  );
}

