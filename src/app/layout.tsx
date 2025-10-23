import type { Metadata } from "next";
import "./globals.css";
import { Inter, Rajdhani } from "next/font/google";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const inter = Inter({
  subsets: ["latin"],
  preload: true,
  display: "swap",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  preload: true,
  display: "swap",
  variable: "--font-rajdhani",
});

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${rajdhani.variable}`} suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-950 text-slate-100`}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
