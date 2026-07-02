import { execa } from "execa";
import { userInfo } from "node:os";
import pc from "picocolors";

/**
 * `argon doctor` — turn cryptic host failures into fixable instructions.
 * Half of "easy install" for infra tools is clear diagnosis when the host
 * isn't ready.
 */

interface Check {
  ok: boolean;
  label: string;
  fix?: string[];
}

const BASE_DATASET = process.env.ARGON_DATASET ?? "argon";

async function has(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execa(cmd, args);
    return stdout.trim().split("\n")[0];
  } catch {
    return null;
  }
}

async function checkNode(): Promise<Check> {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    ok: major >= 20,
    label: `Node ${process.versions.node}`,
    fix: ["Install Node 20+ (https://nodejs.org)"],
  };
}

async function checkPostgres(): Promise<Check> {
  const binDir = process.env.ARGON_PG_BIN;
  const initdb = await has(binDir ? `${binDir}/initdb` : "initdb", ["--version"]);
  const pgctl = await has(binDir ? `${binDir}/pg_ctl` : "pg_ctl", ["--version"]);
  if (initdb && pgctl) return { ok: true, label: `Postgres (${initdb})` };
  return {
    ok: false,
    label: "Postgres: initdb / pg_ctl not found on PATH",
    fix: [
      "Ubuntu/Debian: sudo apt install postgresql-17",
      "  then: export ARGON_PG_BIN=/usr/lib/postgresql/17/bin",
      "Fedora:        sudo dnf install postgresql-server",
      "macOS:         brew install postgresql@17",
    ],
  };
}

async function checkZfs(): Promise<Check> {
  const version = await has("zfs", ["version"]);
  if (version) return { ok: true, label: `ZFS (${version})` };
  return {
    ok: false,
    label: "ZFS: `zfs` not found",
    fix: [
      "Ubuntu/Debian: sudo apt install zfsutils-linux",
      "Fedora:        sudo dnf install zfs",
      "macOS/Windows: unsupported natively — use the Docker install path",
    ],
  };
}

async function checkPool(): Promise<Check> {
  const pool = BASE_DATASET.split("/")[0];
  const out = await has("zpool", ["list", "-H", "-o", "name", pool]);
  if (out === pool) return { ok: true, label: `zpool "${pool}" exists` };
  return {
    ok: false,
    label: `zpool "${pool}" not found`,
    fix: [
      "No spare disk needed — a file-backed pool works fine for dev:",
      `  sudo truncate -s 20G /var/lib/argon-pool.img`,
      `  sudo zpool create ${pool} /var/lib/argon-pool.img`,
    ],
  };
}

async function checkDelegation(): Promise<Check> {
  const user = userInfo().username;
  const pool = BASE_DATASET.split("/")[0];
  try {
    const { stdout } = await execa("zfs", ["allow", pool]);
    if (stdout.includes(user)) {
      return { ok: true, label: `ZFS delegation set for user "${user}"` };
    }
  } catch {
    // fall through — pool missing or zfs missing is reported by other checks
  }
  return {
    ok: false,
    label: `ZFS delegation not set for user "${user}"`,
    fix: [
      `Run: sudo zfs allow ${user} create,snapshot,clone,mount,destroy ${pool}`,
      "(Argon never needs to run as root — only delegated ZFS rights.)",
    ],
  };
}

export async function runDoctor(): Promise<boolean> {
  const checks = [
    await checkNode(),
    await checkPostgres(),
    await checkZfs(),
    await checkPool(),
    await checkDelegation(),
  ];

  for (const c of checks) {
    console.log(`${c.ok ? pc.green("✓") : pc.red("✗")} ${c.label}`);
    if (!c.ok && c.fix) {
      for (const line of c.fix) console.log(pc.dim(`   → ${line}`));
    }
  }

  const healthy = checks.every((c) => c.ok);
  console.log(
    healthy
      ? pc.green("\nAll checks passed — run `argon up` to start the daemon.")
      : pc.yellow("\nFix the items above, then re-run `argon doctor`.") +
          pc.dim("\n(Or skip host setup entirely: `docker compose up -d` in the repo.)"),
  );
  return healthy;
}
