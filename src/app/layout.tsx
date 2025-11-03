import type { Metadata, Viewport } from "next";
import "./globals.css";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export const metadata: Metadata = {
  title: "Vibe-Studio",
  description:
    "Vibe-Studio — spec-driven orchestration console for the agent-mcp runtime.",
  applicationName: "Vibe-Studio",
  icons: {
    icon: "/vibe-icon.svg",
    shortcut: "/vibe-icon.svg",
    apple: "/vibe-icon.svg",
  },
  openGraph: {
    title: "Vibe-Studio",
    description:
      "Design, launch, and observe MCP agents with the Vibe-Studio dashboard.",
  },
  metadataBase: new URL("https://vibe-studio.local"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-slate-950 text-slate-100">
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
