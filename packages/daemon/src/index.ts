#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { ensureMain, reconcile } from "./branches.js";
import { startApi } from "./api.js";
import { startSupervisor, stopSupervisor } from "./supervisor.js";
import { zfsAvailable } from "./storage.js";

async function main(): Promise<void> {
  mkdirSync(config.stateDir, { recursive: true });
  openDb();

  if (!(await zfsAvailable())) {
    console.error(
      "[argond] `zfs` not found. Install ZFS (see `argon doctor`) or run via Docker.",
    );
    process.exit(1);
  }

  await reconcile();

  try {
    await ensureMain();
  } catch (err) {
    console.error(
      "[argond] could not bootstrap the main branch. Is the base dataset " +
        `"${config.baseDataset}" created and delegated to this user? Run \`argon doctor\`.`,
    );
    throw err;
  }

  await startApi();
  startSupervisor();

  const shutdown = () => {
    // Branch Postgres processes are independent daemons — leave them running.
    stopSupervisor();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[argond] fatal:", err);
  process.exit(1);
});
