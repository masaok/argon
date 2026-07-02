import { execa } from "execa";
import { config } from "./config.js";
import type { StorageBackend } from "./storage.js";

/**
 * ZFS backend. The daemon expects to run as a user with ZFS delegation
 * (`zfs allow <user> create,snapshot,clone,mount,destroy <ds>`) — never root.
 */

async function zfs(args: string[]): Promise<string> {
  try {
    const { stdout } = await execa("zfs", args);
    return stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string; shortMessage?: string };
    throw new Error(`zfs ${args[0]} failed: ${e.stderr || e.shortMessage || String(err)}`);
  }
}

export const zfsBackend: StorageBackend = {
  name: "zfs",

  async available(): Promise<boolean> {
    try {
      await execa("zfs", ["version"]);
      return true;
    } catch {
      return false;
    }
  },

  branchLocator(name: string): string {
    return `${config.baseDataset}/${name}`;
  },

  async exists(locator: string): Promise<boolean> {
    try {
      await execa("zfs", ["list", "-H", "-o", "name", locator]);
      return true;
    } catch {
      return false;
    }
  },

  async createBase(locator: string): Promise<void> {
    await zfs(["create", "-p", locator]);
  },

  async cloneFrom(
    parentLocator: string,
    snapName: string,
    targetLocator: string,
  ): Promise<string | null> {
    const snap = `${parentLocator}@${snapName}`;
    await zfs(["snapshot", snap]);
    await zfs(["clone", snap, targetLocator]);
    return snap;
  },

  async destroyBranch(locator: string): Promise<void> {
    await zfs(["destroy", "-r", locator]);
  },

  async destroySnapshot(snapshotId: string): Promise<void> {
    await zfs(["destroy", snapshotId]);
  },

  async getMountpoint(locator: string): Promise<string> {
    const out = await zfs(["get", "-H", "-o", "value", "mountpoint", locator]);
    const mp = out.trim();
    if (!mp || mp === "none" || mp === "legacy") {
      throw new Error(`dataset ${locator} has no usable mountpoint (got "${mp}")`);
    }
    return mp;
  },
};
