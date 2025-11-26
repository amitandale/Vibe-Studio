"use client";

import { WorkflowProgress } from "@/lib/workflows/implementation";

interface WorkflowProgressLogProps {
  progress: WorkflowProgress[];
}

export function WorkflowProgressLog({ progress }: WorkflowProgressLogProps) {
  return (
    <div className="rounded-md border bg-gray-50 p-4">
      <h3 className="mb-2 font-semibold">Workflow Progress</h3>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {progress.map((item, index) => (
          <div key={index} className="text-sm">
            <span className="font-medium text-blue-600">[{item.action}]</span>{" "}
            <span className="text-gray-700">{item.message}</span>
            <span className="ml-2 text-xs text-gray-500">
              {new Date(item.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
