import { nanoid } from "nanoid";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Branch, BranchInfo, CreateBranchRequest } from "@argon/shared";
import { MAIN_BRANCH, isValidBranchName } from "@argon/shared";
import { branchLogPath } from "./config.js";
import * as db from "./db.js";
import * as pg from "./postgres.js";
import { getBackend } from "./storage.js";
import { allocatePort } from "./ports.js";

export class BranchError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

export function toInfo(branch: Branch): BranchInfo {
  const parent = branch.parentId ? db.getBranchById(branch.parentId) : null;
  return {
    ...branch,
    parentName: parent?.name ?? null,
    connectionString:
      branch.status === "running" && branch.port !== null
        ? pg.connectionString(branch.port)
        : null,
  };
}

/**
 * First-boot bootstrap: create the base dataset/subvolume for "main", run
 * initdb, and record it. Idempotent.
 */
export async function ensureMain(): Promise<Branch> {
  const existing = db.getBranchByName(MAIN_BRANCH);
  if (existing) return existing;

  const storage = getBackend();
  const locator = storage.branchLocator(MAIN_BRANCH);
  if (!(await storage.exists(locator))) {
    await storage.createBase(locator);
  }
  const mountpoint = await storage.getMountpoint(locator);
  const dataDir = pg.pgDataDir(mountpoint);
  if (!existsSync(join(dataDir, "PG_VERSION"))) {
    await pg.initCluster(dataDir);
  }

  const branch: Branch = {
    id: nanoid(10),
    name: MAIN_BRANCH,
    parentId: null,
    dataset: locator,
    snapshot: null,
    port: null,
    status: "stopped",
    createdAt: Date.now(),
  };
  db.insertBranch(branch);
  return branch;
}

export async function createBranch(req: CreateBranchRequest): Promise<BranchInfo> {
  const { name, from = MAIN_BRANCH, start = true } = req;

  if (!isValidBranchName(name)) {
    throw new BranchError(
      `invalid branch name "${name}" (use letters, digits, - and _)`,
    );
  }
  if (db.getBranchByName(name)) {
    throw new BranchError(`branch "${name}" already exists`, 409);
  }
  const parent = db.getBranchByName(from);
  if (!parent) {
    throw new BranchError(`parent branch "${from}" not found`, 404);
  }

  const storage = getBackend();
  const id = nanoid(10);
  const locator = storage.branchLocator(name);
  const snap = await storage.cloneFrom(parent.dataset, `argon-${id}`, locator);

  // Cloning a *running* parent captures its live postmaster.pid. The snapshot
  // is crash-consistent, so Postgres will recover via WAL on boot — but the
  // stale pid file names the parent's still-alive PID (same container), which
  // makes pg_ctl refuse to start. A fresh clone is never running, so drop it.
  const cloneDataDir = pg.pgDataDir(await storage.getMountpoint(locator));
  rmSync(join(cloneDataDir, "postmaster.pid"), { force: true });

  const branch: Branch = {
    id,
    name,
    parentId: parent.id,
    dataset: locator,
    snapshot: snap,
    port: null,
    status: "stopped",
    createdAt: Date.now(),
  };
  db.insertBranch(branch);

  if (start) {
    return toInfo(await startBranch(branch.id));
  }
  return toInfo(branch);
}

export async function startBranch(id: string): Promise<Branch> {
  const branch = db.getBranchById(id);
  if (!branch) throw new BranchError("branch not found", 404);
  if (branch.status === "running") return branch;

  const mountpoint = await getBackend().getMountpoint(branch.dataset);
  const dataDir = pg.pgDataDir(mountpoint);

  // Clear a stale postmaster.pid left by a previous run of THIS branch that
  // didn't shut down cleanly (e.g. the daemon/container was killed), unless a
  // cluster is genuinely still alive here. Clone-time pids are handled in
  // createBranch.
  const pidFile = join(dataDir, "postmaster.pid");
  if (existsSync(pidFile) && !(await pg.isAlive(dataDir))) {
    rmSync(pidFile, { force: true });
  }

  const port = await allocatePort();
  db.updateBranchStatus(id, "starting", port);
  try {
    await pg.start(dataDir, port, branchLogPath(branch.name));
  } catch (err) {
    db.updateBranchStatus(id, "error", null);
    throw err;
  }
  db.updateBranchStatus(id, "running", port);
  return db.getBranchById(id)!;
}

export async function stopBranch(id: string): Promise<Branch> {
  const branch = db.getBranchById(id);
  if (!branch) throw new BranchError("branch not found", 404);
  if (branch.status !== "running" && branch.status !== "starting") return branch;

  const mountpoint = await getBackend().getMountpoint(branch.dataset);
  const dataDir = pg.pgDataDir(mountpoint);
  if (await pg.isAlive(dataDir)) {
    await pg.stop(dataDir);
  }
  db.updateBranchStatus(id, "stopped", null);
  return db.getBranchById(id)!;
}

export async function deleteBranch(id: string): Promise<void> {
  const branch = db.getBranchById(id);
  if (!branch) throw new BranchError("branch not found", 404);
  if (branch.name === MAIN_BRANCH) {
    throw new BranchError("cannot delete the main branch");
  }
  const children = db.childrenOf(id);
  if (children.length > 0) {
    throw new BranchError(
      `branch has child branches (${children.map((c) => c.name).join(", ")}); delete them first`,
      409,
    );
  }

  const storage = getBackend();
  await stopBranch(id);
  await storage.destroyBranch(branch.dataset);
  if (branch.snapshot) {
    // Origin snapshot lives on the parent; harmless to keep, tidy to remove.
    try {
      await storage.destroySnapshot(branch.snapshot);
    } catch {
      // snapshot may have other clones or already be gone — not fatal
    }
  }
  db.deleteBranchRow(id);
}

/**
 * On daemon boot, reality wins over the db: mark rows "running" only if a
 * postmaster is actually alive on that data directory.
 */
export async function reconcile(): Promise<void> {
  for (const branch of db.listBranches()) {
    if (branch.status === "stopped") continue;
    try {
      const mountpoint = await getBackend().getMountpoint(branch.dataset);
      const alive = await pg.isAlive(pg.pgDataDir(mountpoint));
      if (alive && branch.port !== null) {
        db.updateBranchStatus(branch.id, "running", branch.port);
      } else {
        db.updateBranchStatus(branch.id, "stopped", null);
      }
    } catch {
      db.updateBranchStatus(branch.id, "error", null);
    }
  }
}
