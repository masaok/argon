"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BranchInfo } from "@argon/shared";

export function BranchActions({ branch }: { branch: BranchInfo }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(path: string, method: string) {
    setBusy(true);
    const res = await fetch(path, { method });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? `request failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  const btn =
    "rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40";

  return (
    <div className="flex justify-end gap-2">
      {branch.status === "running" ? (
        <button
          disabled={busy}
          onClick={() => call(`/api/branches/${branch.id}/stop`, "POST")}
          className={btn}
        >
          Stop
        </button>
      ) : (
        <button
          disabled={busy || branch.status === "starting"}
          onClick={() => call(`/api/branches/${branch.id}/start`, "POST")}
          className={btn}
        >
          Start
        </button>
      )}
      {branch.parentId !== null && (
        <button
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete branch "${branch.name}" and its data?`)) {
              void call(`/api/branches/${branch.id}`, "DELETE");
            }
          }}
          className={`${btn} hover:border-red-500/50 hover:text-red-400`}
        >
          Delete
        </button>
      )}
    </div>
  );
}
