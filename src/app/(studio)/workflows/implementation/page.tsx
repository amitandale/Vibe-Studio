"use client";

import { useState } from "react";
import { PRImplementationForm } from "@/components/workflow/PRImplementationForm";
import { WorkflowProgressLog } from "@/components/workflow/WorkflowProgressLog";
import { AgentMcpClient } from "@/lib/api/client";
import { ImplementationWorkflowService, WorkflowProgress } from "@/lib/workflows/implementation";
import { PRImplementationRequest, PRImplementationOutput } from "@/lib/api/types";

export default function ImplementationWorkflowPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<WorkflowProgress[]>([]);
  const [result, setResult] = useState<PRImplementationOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (request: PRImplementationRequest) => {
    setIsRunning(true);
    setProgress([]);
    setResult(null);
    setError(null);

    const baseUrl = process.env.NEXT_PUBLIC_MCP_BASE_URL || "http://localhost:2024";
    const client = new AgentMcpClient(baseUrl);
    const service = new ImplementationWorkflowService(client);

    try {
      const teardown = await service.invokeAndStream(
        request,
        {
          onProgress: (progressUpdate) => {
            setProgress((previous) => [...previous, progressUpdate]);
          },
          onComplete: (output) => {
            setResult(output ?? null);
            setIsRunning(false);
          },
          onError: (err) => {
            setError(err.message);
            setIsRunning(false);
          },
        },
        {
          projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
        },
      );

      void teardown;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsRunning(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="mb-6 text-3xl font-bold">PR Implementation Workflow</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <PRImplementationForm onSubmit={handleSubmit} isSubmitting={isRunning} />
        </div>

        <div className="space-y-4">
          {progress.length > 0 && <WorkflowProgressLog progress={progress} />}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-4">
              <p className="font-semibold text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {result && (
            <div className="rounded-md border bg-green-50 p-4">
              <p className="font-semibold text-green-800">Workflow Complete!</p>
              {result.pull_request.pr_url && (
                <a
                  href={result.pull_request.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  View Pull Request #{result.pull_request.pr_number}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
