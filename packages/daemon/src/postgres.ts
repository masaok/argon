import { execa } from "execa";
import { join } from "node:path";
import { mkdirSync, appendFileSync } from "node:fs";
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
  // trust auth: v1 is a local single-user dev tool
  await execa(pgBin("initdb"), [
    "-D", dataDir,
    "-U", config.pgUser,
    "--auth=trust",
    "--no-instructions",
  ]);
  // Branches listen on 0.0.0.0 so the published container ports are reachable
  // from the host; connections arrive via Docker's gateway (an RFC1918 IP),
  // which the default loopback-only rules reject. Trust only the private Docker
  // ranges — not the public internet or IPv6 — and rely on binding the host
  // side of the published ports to 127.0.0.1 for real containment. This is a
  // single-user local dev tool; do not expose these ports to an untrusted
  // network. Clones inherit this pg_hba.conf.
  appendFileSync(
    join(dataDir, "pg_hba.conf"),
    [
      "host all all 10.0.0.0/8 trust",
      "host all all 172.16.0.0/12 trust",
      "host all all 192.168.0.0/16 trust",
      "",
    ].join("\n"),
  );
}

export async function start(dataDir: string, port: number, logFile: string): Promise<void> {
  mkdirSync(dirname(logFile), { recursive: true });
  await execa(pgBin("pg_ctl"), [
    "-D", dataDir,
    "-l", logFile,
    "-o", `-p ${port} -c listen_addresses=0.0.0.0`,
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
