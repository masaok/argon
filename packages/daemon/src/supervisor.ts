import { config } from "./config.js";
import * as db from "./db.js";
import * as pg from "./postgres.js";
import { stopBranch } from "./branches.js";

/**
 * Scale-to-zero: every sweep, count client connections on each running
 * branch. A branch idle (zero clients) for longer than idleTimeoutMs gets
 * stopped. Restart is explicit in v1 (API/UI/CLI); wake-on-connect is v2.
 */

const idleSince = new Map<string, number>();
let timer: NodeJS.Timeout | null = null;
let sweeping = false;

async function sweep(): Promise<void> {
  if (sweeping) return; // don't overlap slow sweeps
  sweeping = true;
  try {
    const now = Date.now();
    for (const branch of db.listBranches()) {
      if (branch.status !== "running" || branch.port === null) {
        idleSince.delete(branch.id);
        continue;
      }
      let conns: number;
      try {
        conns = await pg.activeConnections(branch.port);
      } catch {
        // probe failed (booting/crashed) — leave it alone this round
        idleSince.delete(branch.id);
        continue;
      }
      if (conns > 0) {
        idleSince.delete(branch.id);
        continue;
      }
      const since = idleSince.get(branch.id) ?? now;
      idleSince.set(branch.id, since);
      if (now - since >= config.idleTimeoutMs) {
        console.log(`[supervisor] suspending idle branch "${branch.name}"`);
        idleSince.delete(branch.id);
        await stopBranch(branch.id).catch((err) =>
          console.error(`[supervisor] failed to stop "${branch.name}":`, err),
        );
      }
    }
  } finally {
    sweeping = false;
  }
}

export function startSupervisor(): void {
  if (!config.suspendEnabled) {
    console.log("[supervisor] disabled (ARGON_NO_SUSPEND=1)");
    return;
  }
  timer = setInterval(() => void sweep(), config.sweepIntervalMs);
  timer.unref();
  console.log(
    `[supervisor] idle sweep every ${config.sweepIntervalMs / 1000}s, timeout ${config.idleTimeoutMs / 1000}s`,
  );
}

export function stopSupervisor(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
