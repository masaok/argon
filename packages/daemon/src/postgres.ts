import { execa } from "execa";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

/**
 * Wrappers around initdb / pg_ctl / psql. Each branch is a full cluster whose
 * data directory lives at <dataset mountpoint>/pgdata.
 */

function pgBin(name: string): string {
  return config.pgBinDir ? join(config.pgBinDir, name) : name;
}

export function pgDataDir(mountpoint: string): string {
  return join(mountpoint, "pgdata");
}

export async function initCluster(dataDir: string): Promise<void> {
  // trust auth on loopback: v1 is a local single-user dev tool
  await execa(pgBin("initdb"), [
    "-D", dataDir,
    "-U", config.pgUser,
    "--auth=trust",
    "--no-instructions",
  ]);
}

export async function start(dataDir: string, port: number, logFile: string): Promise<void> {
  mkdirSync(dirname(logFile), { recursive: true });
  await execa(pgBin("pg_ctl"), [
    "-D", dataDir,
    "-l", logFile,
    "-o", `-p ${port} -c listen_addresses=127.0.0.1`,
    "-w",
    "start",
  ]);
}

export async function stop(dataDir: string): Promise<void> {
  await execa(pgBin("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]);
}

export async function isAlive(dataDir: string): Promise<boolean> {
  try {
    await execa(pgBin("pg_ctl"), ["-D", dataDir, "status"]);
    return true;
  } catch {
    return false;
  }
}

/** Count client backends, excluding our own probe connection. */
export async function activeConnections(port: number): Promise<number> {
  const { stdout } = await execa(pgBin("psql"), [
    "-h", "127.0.0.1",
    "-p", String(port),
    "-U", config.pgUser,
    "-d", "postgres",
    "-tA",
    "-c",
    "SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()",
  ]);
  return Number.parseInt(stdout.trim(), 10) || 0;
}

export function connectionString(port: number): string {
  return `postgresql://${config.pgUser}@127.0.0.1:${port}/postgres`;
}
