import { execa } from "execa";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import type { StorageBackend } from "./storage.js";

/**
 * Btrfs backend — the fallback for hosts without a ZFS kernel module
 * (stock WSL2 / Docker Desktop). Branches are subvolumes under
 * config.btrfsRoot, which must live on a Btrfs filesystem, ideally mounted
 * with `user_subvol_rm_allowed` so an unprivileged daemon can delete
 * branches.
 *
 * Unlike ZFS, `btrfs subvolume snapshot` produces a writable copy in one
 * step, so there is no separate snapshot object to record (cloneFrom
 * returns null).
 */

async function btrfs(args: string[]): Promise<string> {
  try {
    const { stdout } = await execa("btrfs", args);
    return stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string; shortMessage?: string };
    throw new Error(
      `btrfs ${args.slice(0, 2).join(" ")} failed: ${e.stderr || e.shortMessage || String(err)}`,
    );
  }
}

async function fsType(path: string): Promise<string> {
  const { stdout } = await execa("stat", ["-f", "-c", "%T", path]);
  return stdout.trim();
}

export const btrfsBackend: StorageBackend = {
  name: "btrfs",

  async available(): Promise<boolean> {
    try {
      await execa("btrfs", ["--version"]);
      mkdirSync(config.btrfsRoot, { recursive: true });
      return (await fsType(config.btrfsRoot)) === "btrfs";
    } catch {
      return false;
    }
  },

  branchLocator(name: string): string {
    return join(config.btrfsRoot, name);
  },

  async exists(locator: string): Promise<boolean> {
    return existsSync(locator);
  },

  async createBase(locator: string): Promise<void> {
    mkdirSync(dirname(locator), { recursive: true });
    if ((await fsType(dirname(locator))) !== "btrfs") {
      throw new Error(
        `${dirname(locator)} is not on a Btrfs filesystem — run \`argon doctor\` for setup instructions`,
      );
    }
    await btrfs(["subvolume", "create", locator]);
  },

  async cloneFrom(
    parentLocator: string,
    _snapName: string,
    targetLocator: string,
  ): Promise<string | null> {
    // A btrfs snapshot IS a writable clone — one step, no snapshot object.
    await btrfs(["subvolume", "snapshot", parentLocator, targetLocator]);
    return null;
  },

  async destroyBranch(locator: string): Promise<void> {
    // Requires the mount option user_subvol_rm_allowed when running
    // unprivileged; doctor's setup instructions include it.
    await btrfs(["subvolume", "delete", locator]);
  },

  async destroySnapshot(_snapshotId: string): Promise<void> {
    // No separate snapshot objects on btrfs.
  },

  async getMountpoint(locator: string): Promise<string> {
    if (!existsSync(locator)) {
      throw new Error(`subvolume ${locator} does not exist`);
    }
    return locator;
  },
};
