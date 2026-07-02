import { execa } from "execa";

/**
 * Thin wrappers around the zfs CLI. The daemon expects to run as a user with
 * ZFS delegation (`zfs allow <user> create,snapshot,clone,mount,destroy <ds>`)
 * — never as root.
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

export async function datasetExists(dataset: string): Promise<boolean> {
  try {
    await execa("zfs", ["list", "-H", "-o", "name", dataset]);
    return true;
  } catch {
    return false;
  }
}

export async function createDataset(dataset: string): Promise<void> {
  await zfs(["create", "-p", dataset]);
}

export async function snapshot(dataset: string, snapName: string): Promise<string> {
  const full = `${dataset}@${snapName}`;
  await zfs(["snapshot", full]);
  return full;
}

export async function clone(snapshotFull: string, targetDataset: string): Promise<void> {
  await zfs(["clone", snapshotFull, targetDataset]);
}

/** Destroys a branch dataset. Fails if other branches were cloned from it. */
export async function destroyDataset(dataset: string): Promise<void> {
  await zfs(["destroy", "-r", dataset]);
}

export async function destroySnapshot(snapshotFull: string): Promise<void> {
  await zfs(["destroy", snapshotFull]);
}

/** Filesystem path where a dataset is mounted, e.g. /argon/feat-x */
export async function getMountpoint(dataset: string): Promise<string> {
  const out = await zfs(["get", "-H", "-o", "value", "mountpoint", dataset]);
  const mp = out.trim();
  if (!mp || mp === "none" || mp === "legacy") {
    throw new Error(`dataset ${dataset} has no usable mountpoint (got "${mp}")`);
  }
  return mp;
}

export async function zfsAvailable(): Promise<boolean> {
  try {
    await execa("zfs", ["version"]);
    return true;
  } catch {
    return false;
  }
}
