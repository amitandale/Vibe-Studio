import type { PullRequestDetail, PullRequestSummary, PullRequestStatus, PullRequestMessage } from "@/lib/api/types";

export const PULL_REQUEST_STATUS_ORDER: Record<PullRequestStatus, number> = {
  open: 1,
  draft: 0,
  merged: 4,
  closed: 3,
  error: 5,
};

export function formatPullRequestStatus(status: PullRequestStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "draft":
      return "Draft";
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function sortPullRequests<T extends PullRequestSummary>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderDelta = PULL_REQUEST_STATUS_ORDER[b.status] - PULL_REQUEST_STATUS_ORDER[a.status];
    if (orderDelta !== 0) {
      return orderDelta;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function isActionableStatus(status: PullRequestStatus): boolean {
  return status === "open" || status === "draft" || status === "error";
}

export function extractConversation(pr: PullRequestDetail): PullRequestMessage[] {
  const log = (pr.metadata?.conversation as PullRequestMessage[] | undefined) ?? [];
  return log.map((message) => ({
    ...message,
    createdAt: message.createdAt ?? pr.updatedAt,
  }));
}

export function derivePullRequestSummary(pr: PullRequestDetail): PullRequestSummary {
  const { id, title, status, createdAt, updatedAt, author, branch, metadata } = pr;
  return { id, title, status, createdAt, updatedAt, author, branch, metadata };
}

