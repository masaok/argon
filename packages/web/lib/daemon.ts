import type { BranchInfo, CreateBranchRequest } from "@argon/shared";
import { DEFAULT_DAEMON_URL } from "@argon/shared";

/**
 * Server-side client for the argond API. Only Next.js server code talks to
 * the daemon; the browser goes through our /api route handlers.
 */

const BASE = process.env.ARGON_DAEMON_URL ?? DEFAULT_DAEMON_URL;

export class DaemonError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new DaemonError(`argond unreachable at ${BASE}`, 502);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new DaemonError(String(body.error ?? `daemon returned ${res.status}`), res.status);
  }
  return body as T;
}

export const daemon = {
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
