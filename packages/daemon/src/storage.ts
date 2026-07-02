import { config } from "./config.js";
import { zfsBackend } from "./storage-zfs.js";
import { btrfsBackend } from "./storage-btrfs.js";

/**
 * Storage backend abstraction. A "locator" is backend-specific: a ZFS dataset
 * name ("argon/feat-x") or a Btrfs subvolume path ("~/.argon/branches/feat-x").
 * It's what the daemon stores in the branches.dataset column.
 */
export interface StorageBackend {
  readonly name: "zfs" | "btrfs";
  available(): Promise<boolean>;
  /** Locator for a branch of the given name. */
  branchLocator(name: string): string;
  exists(locator: string): Promise<boolean>;
  /** Create the empty base (main) branch. */
  createBase(locator: string): Promise<void>;
  /**
   * Copy-on-write clone of parent → target. Returns the intermediate
   * snapshot's id where the backend has one (ZFS), else null (Btrfs).
   */
  cloneFrom(
    parentLocator: string,
    snapName: string,
    targetLocator: string,
  ): Promise<string | null>;
  destroyBranch(locator: string): Promise<void>;
  destroySnapshot(snapshotId: string): Promise<void>;
  /** Filesystem path holding the branch's pgdata. */
  getMountpoint(locator: string): Promise<string>;
}

let backend: StorageBackend | null = null;

/** Resolve the backend once at daemon boot (ARGON_STORAGE=auto|zfs|btrfs). */
export async function initStorage(): Promise<StorageBackend> {
  if (backend) return backend;
  if (config.storage === "zfs") backend = zfsBackend;
  else if (config.storage === "btrfs") backend = btrfsBackend;
  else if (await zfsBackend.available()) backend = zfsBackend;
  else if (await btrfsBackend.available()) backend = btrfsBackend;
  else {
    throw new Error(
      "no usable storage backend: ZFS not present and no Btrfs filesystem at " +
        `${config.btrfsRoot} — run \`argon doctor\` for setup instructions`,
    );
  }
  return backend;
}

export function getBackend(): StorageBackend {
  if (!backend) throw new Error("storage backend not initialized");
  return backend;
}
