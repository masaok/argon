import type { BranchInfo, CreateBranchRequest, DaemonHealth } from "@argon/shared";
import { DEFAULT_DAEMON_URL } from "@argon/shared";

const BASE = process.env.ARGON_DAEMON_URL ?? DEFAULT_DAEMON_URL;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new Error(
      `cannot reach argond at ${BASE} — is it running? Start it with \`argon up\`.`,
    );
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(body.error ?? `daemon returned ${res.status}`));
  }
  return body as T;
}

export const daemon = {
  health: () => request<DaemonHealth>("/health"),
  list: () => request<BranchInfo[]>("/branches"),
  create: (req: CreateBranchRequest) =>
    request<BranchInfo>("/branches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),
  start: (id: string) => request<BranchInfo>(`/branches/${id}/start`, { method: "POST" }),
  stop: (id: string) => request<BranchInfo>(`/branches/${id}/stop`, { method: "POST" }),
  remove: (id: string) => request<void>(`/branches/${id}`, { method: "DELETE" }),
};

export async function findByName(name: string): Promise<BranchInfo> {
  const branch = (await daemon.list()).find((b) => b.name === name);
  if (!branch) throw new Error(`branch "${name}" not found`);
  return branch;
}
