import React from "react";
import { StudioShell } from "@/components/studio/StudioShell";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return <StudioShell>{children}</StudioShell>;
}
