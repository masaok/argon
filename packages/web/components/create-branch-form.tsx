"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateBranchForm({ parents }: { parents: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [from, setFrom] = useState("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, from }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `failed (${res.status})`);
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        New branch
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="feat-x"
          required
          pattern="[a-zA-Z0-9_][a-zA-Z0-9_-]*"
          className="w-48 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        From
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
        >
          {parents.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "Cloning…" : "Create branch"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
