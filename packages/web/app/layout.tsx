import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Argon — Postgres branching",
  description: "Instant Postgres branching on a single machine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-5xl px-6 py-10">
          <header className="mb-8 flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Argon</h1>
            <p className="text-sm text-zinc-400">
              instant Postgres branching, one machine
            </p>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
