import type { BranchInfo } from "@argon/shared";
import { daemon, DaemonError } from "@/lib/daemon";
import { CreateBranchForm } from "@/components/create-branch-form";
import { BranchActions } from "@/components/branch-actions";
import { CopyString } from "@/components/copy-string";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: BranchInfo["status"] }) {
  const styles: Record<BranchInfo["status"], string> = {
    running: "bg-emerald-500/15 text-emerald-400",
    stopped: "bg-zinc-500/15 text-zinc-400",
    starting: "bg-amber-500/15 text-amber-400",
    error: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

export default async function Dashboard() {
  let branches: BranchInfo[];
  try {
    branches = await daemon.list();
  } catch (err) {
    const message =
      err instanceof DaemonError ? err.message : "failed to load branches";
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6">
        <p className="font-medium text-red-400">Daemon unreachable</p>
        <p className="mt-1 text-sm text-zinc-400">{message}</p>
        <p className="mt-3 text-sm text-zinc-500">
          Start it with <code className="rounded bg-zinc-800 px-1.5 py-0.5">argon up</code>{" "}
          or <code className="rounded bg-zinc-800 px-1.5 py-0.5">docker compose up -d</code>.
        </p>
      </div>
    );
  }

  return (
    <main className="space-y-8">
      <CreateBranchForm parents={branches.map((b) => b.name)} />

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Branch</th>
              <th className="px-4 py-3 font-medium">Parent</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Connection</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3 text-zinc-400">{b.parentName ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={b.status} />
                </td>
                <td className="px-4 py-3">
                  {b.connectionString ? (
                    <CopyString value={b.connectionString} />
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <BranchActions branch={b} />
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No branches yet — argond bootstraps <code>main</code> on startup.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
