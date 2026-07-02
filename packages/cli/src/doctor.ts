import { execa } from "execa";
import { readFileSync, mkdirSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import pc from "picocolors";

/**
 * `argon doctor` — turn cryptic host failures into fixable instructions.
 * Half of "easy install" for infra tools is clear diagnosis when the host
 * isn't ready. Storage passes if EITHER the ZFS stack or the Btrfs
 * fallback is usable.
 */

interface Check {
  ok: boolean;
  label: string;
  fix?: string[];
}

const BASE_DATASET = process.env.ARGON_DATASET || "argon";
const STATE_DIR = process.env.ARGON_STATE_DIR || join(homedir(), ".argon");
const BTRFS_ROOT = process.env.ARGON_BTRFS_ROOT || join(STATE_DIR, "branches");

function isWsl(): boolean {
  try {
    return readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

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

// --- ZFS stack ---------------------------------------------------------

async function checkZfs(): Promise<Check> {
  const version = await has("zfs", ["version"]);
  if (version) return { ok: true, label: `ZFS (${version})` };
  const fix = [
    "Ubuntu/Debian: sudo apt install zfsutils-linux",
    "Fedora:        sudo dnf install zfs",
  ];
  if (isWsl()) {
    fix.unshift(
      "WSL2 detected: the standard WSL2 kernel has NO ZFS module —",
      "Argon will use the Btrfs fallback instead (see below).",
    );
  }
  return { ok: false, label: "ZFS: `zfs` not found", fix };
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

// --- Btrfs fallback stack ----------------------------------------------

async function checkBtrfs(): Promise<Check> {
  const version = await has("btrfs", ["--version"]);
  if (version) return { ok: true, label: `Btrfs tools (${version})` };
  return {
    ok: false,
    label: "Btrfs: `btrfs` not found",
    fix: [
      "Ubuntu/Debian: sudo apt install btrfs-progs",
      "Fedora:        sudo dnf install btrfs-progs",
    ],
  };
}

async function checkBtrfsRoot(): Promise<Check> {
  try {
    mkdirSync(BTRFS_ROOT, { recursive: true });
    const { stdout } = await execa("stat", ["-f", "-c", "%T", BTRFS_ROOT]);
    if (stdout.trim() === "btrfs") {
      return { ok: true, label: `Btrfs branch root at ${BTRFS_ROOT}` };
    }
  } catch {
    // fall through to instructions
  }
  return {
    ok: false,
    label: `${BTRFS_ROOT} is not on a Btrfs filesystem`,
    fix: [
      "Create a file-backed Btrfs volume (no spare disk needed):",
      `  sudo truncate -s 20G /var/lib/argon-btrfs.img`,
      `  sudo mkfs.btrfs /var/lib/argon-btrfs.img`,
      `  sudo mount -o loop,user_subvol_rm_allowed /var/lib/argon-btrfs.img ${BTRFS_ROOT}`,
      `  sudo chown ${userInfo().username} ${BTRFS_ROOT}`,
      "(user_subvol_rm_allowed lets Argon delete branches without root.)",
      "To remount after reboot, add to /etc/fstab:",
      `  /var/lib/argon-btrfs.img ${BTRFS_ROOT} btrfs loop,user_subvol_rm_allowed 0 0`,
    ],
  };
}

// ------------------------------------------------------------------------

export async function runDoctor(): Promise<boolean> {
  const base = [await checkNode(), await checkPostgres()];
  const zfsChecks = [await checkZfs(), await checkPool(), await checkDelegation()];
  const btrfsChecks = [await checkBtrfs(), await checkBtrfsRoot()];

  const zfsOk = zfsChecks.every((c) => c.ok);
  const btrfsOk = btrfsChecks.every((c) => c.ok);

  const report = (checks: Check[], showFixes: boolean) => {
    for (const c of checks) {
      console.log(`${c.ok ? pc.green("✓") : pc.red("✗")} ${c.label}`);
      if (!c.ok && showFixes && c.fix) {
        for (const line of c.fix) console.log(pc.dim(`   → ${line}`));
      }
    }
  };

  report(base, true);

  console.log(pc.bold("\nStorage (one of the two stacks must pass):"));
  report(zfsChecks, !zfsOk && !btrfsOk);
  if (zfsOk) {
    console.log(pc.dim("  → ZFS stack complete; Argon will use ZFS."));
  }
  console.log("");
  report(btrfsChecks, !zfsOk);
  if (!zfsOk && btrfsOk) {
    console.log(pc.dim("  → Btrfs fallback complete; Argon will use Btrfs."));
  }

  const healthy = base.every((c) => c.ok) && (zfsOk || btrfsOk);
  console.log(
    healthy
      ? pc.green("\nAll checks passed — run `argon up` to start the daemon.")
      : pc.yellow("\nFix the items above, then re-run `argon doctor`.") +
          pc.dim("\n(Or skip host setup entirely: `docker compose up -d` in the repo.)"),
  );
  return healthy;
}
