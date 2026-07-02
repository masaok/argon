"use client";

import { useState } from "react";

export function CopyString({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy connection string"
      className="group flex max-w-md items-center gap-2 text-left"
    >
      <code className="truncate rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-300 group-hover:bg-zinc-800">
        {value}
      </code>
      <span className="shrink-0 text-xs text-zinc-500">
        {copied ? "copied ✓" : "copy"}
      </span>
    </button>
  );
}
