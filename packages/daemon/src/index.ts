#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { ensureMain, reconcile } from "./branches.js";
import { startApi } from "./api.js";
import { startSupervisor, stopSupervisor } from "./supervisor.js";
import { initStorage } from "./storage.js";

async function main(): Promise<void> {
  mkdirSync(config.stateDir, { recursive: true });
  openDb();

  let backendName: string;
  try {
    backendName = (await initStorage()).name;
  } catch (err) {
    console.error(`[argond] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.log(`[argond] storage backend: ${backendName}`);

  await reconcile();

  try {
    await ensureMain();
  } catch (err) {
    console.error(
      "[argond] could not bootstrap the main branch — run `argon doctor` for setup instructions.",
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
