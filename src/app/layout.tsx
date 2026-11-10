import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Fin-Zeus 2.0 — Financial Intelligence Hub",
  description: "Upload company statements, classify costs, track KPIs, forecast, run sensitivity and optimization, test pricing, and find AI efficiency gains.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
