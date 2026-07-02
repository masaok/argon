import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DAEMON_PORT } from "@argon/shared";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const stateDir = process.env.ARGON_STATE_DIR || join(homedir(), ".argon");

export const config = {
  /** Storage backend: "auto" prefers ZFS, falls back to Btrfs. */
  storage: (process.env.ARGON_STORAGE || "auto") as "auto" | "zfs" | "btrfs",

  /** ZFS: base dataset under which every branch lives, e.g. "argon" or "tank/argon". */
  baseDataset: process.env.ARGON_DATASET || "argon",

  /** Btrfs: directory (on a btrfs filesystem) holding branch subvolumes. */
  btrfsRoot: process.env.ARGON_BTRFS_ROOT || join(stateDir, "branches"),

  /** Where the daemon keeps its own state (SQLite db, logs). */
  stateDir,

  /** Directory containing initdb/pg_ctl/psql. Empty string = rely on $PATH. */
  pgBinDir: process.env.ARGON_PG_BIN || "",

  /** Superuser name used for every cluster (local trust auth in v1). */
  pgUser: process.env.ARGON_PG_USER || "postgres",

  apiHost: "127.0.0.1",
  apiPort: envInt("ARGON_DAEMON_PORT", DEFAULT_DAEMON_PORT),

  /** Port range handed out to branch Postgres instances. */
  portRangeStart: envInt("ARGON_PORT_START", 5433),
  portRangeEnd: envInt("ARGON_PORT_END", 5533),

  /** Idle supervisor: stop a branch after this long with zero client connections. */
  idleTimeoutMs: envInt("ARGON_IDLE_TIMEOUT_MS", 5 * 60_000),
  sweepIntervalMs: envInt("ARGON_SWEEP_INTERVAL_MS", 15_000),

  /** Set ARGON_NO_SUSPEND=1 to disable scale-to-zero entirely. */
  suspendEnabled: process.env.ARGON_NO_SUSPEND !== "1",
} as const;

export function dbPath(): string {
  return join(config.stateDir, "argon.db");
}

export function branchLogPath(branchName: string): string {
  return join(config.stateDir, "logs", `${branchName}.log`);
}
