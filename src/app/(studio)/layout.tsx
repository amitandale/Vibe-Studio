import React from "react";
import { StudioShell } from "@/components/studio/StudioShell";

type StudioLayoutProps = {
  children: React.ReactNode;
};

export default function StudioLayout({ children }: StudioLayoutProps): React.ReactNode {
  return <StudioShell>{children}</StudioShell>;
}
