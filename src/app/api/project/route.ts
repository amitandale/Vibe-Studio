import { NextResponse } from "next/server";
import type { ProjectMetadata } from "@/providers/studio/ProjectContext";

const demoProject: ProjectMetadata = {
  id: "demo-project",
  name: "Demo Application",
  repository: {
    name: "acme/vibe-demo",
    url: "https://github.com/acme/vibe-demo",
    defaultBranch: "main",
  },
  activeBranch: "main",
  vps: {
    ipAddress: "10.20.30.40",
    status: "ONLINE",
  },
  environments: [
    {
      id: "staging",
      name: "Staging",
      branch: "develop",
      status: "DEGRADED",
      url: "https://staging.example.com",
    },
    {
      id: "production",
      name: "Production",
      branch: "main",
      status: "ONLINE",
      url: "https://app.example.com",
    },
  ],
};

export async function GET() {
  // TODO: replace with project ledger lookup once the VPS API is wired.
  return NextResponse.json({ project: demoProject });
}
