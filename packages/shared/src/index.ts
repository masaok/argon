/** Lifecycle states of a branch's Postgres process. */
export type BranchStatus = "stopped" | "starting" | "running" | "error";

/** A branch = one ZFS clone + (optionally) one running Postgres cluster. */
export interface Branch {
  id: string;
  name: string;
  /** null for the root ("main") branch */
  parentId: string | null;
  /** ZFS dataset backing this branch, e.g. "argon/feat-x" */
  dataset: string;
  /** ZFS snapshot this branch was cloned from, e.g. "argon/main@argon-abc123" */
  snapshot: string | null;
  /** TCP port Postgres listens on while running; null when stopped */
  port: number | null;
  status: BranchStatus;
  /** Unix epoch millis */
  createdAt: number;
}

/** Branch enriched with fields derived by the daemon for display. */
export interface BranchInfo extends Branch {
  parentName: string | null;
  /** e.g. "postgresql://postgres@127.0.0.1:5434/postgres" — null when stopped */
  connectionString: string | null;
}

export interface CreateBranchRequest {
  name: string;
  /** Parent branch name; defaults to "main" */
  from?: string;
  /** Start Postgres immediately after cloning; defaults to true */
  start?: boolean;
}

export interface ApiError {
  error: string;
}

export interface DaemonHealth {
  ok: boolean;
  version: string;
  branches: number;
  running: number;
}

/** Default daemon API address (loopback only — no auth in v1). */
export const DEFAULT_DAEMON_PORT = 5310;
export const DEFAULT_DAEMON_URL = `http://127.0.0.1:${DEFAULT_DAEMON_PORT}`;

/** Name reserved for the root branch. */
export const MAIN_BRANCH = "main";

export function isValidBranchName(name: string): boolean {
  // dataset-safe and URL-safe: letters, digits, dash, underscore; must not
  // start with a dash (zfs would parse it as a flag)
  return /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,62}$/.test(name);
}
