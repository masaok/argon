import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Branch, BranchStatus } from "@argon/shared";
import { dbPath } from "./config.js";

interface BranchRow {
  id: string;
  name: string;
  parent_id: string | null;
  dataset: string;
  snapshot: string | null;
  port: number | null;
  status: BranchStatus;
  created_at: number;
}

let db: Database.Database | null = null;

export function openDb(): Database.Database {
  if (db) return db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id          TEXT PRIMARY KEY,
      name        TEXT UNIQUE NOT NULL,
      parent_id   TEXT REFERENCES branches(id),
      dataset     TEXT NOT NULL,
      snapshot    TEXT,
      port        INTEGER,
      status      TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `);
  return db;
}

function toBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    dataset: row.dataset,
    snapshot: row.snapshot,
    port: row.port,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function listBranches(): Branch[] {
  const rows = openDb()
    .prepare("SELECT * FROM branches ORDER BY created_at ASC")
    .all() as BranchRow[];
  return rows.map(toBranch);
}

export function getBranchById(id: string): Branch | null {
  const row = openDb().prepare("SELECT * FROM branches WHERE id = ?").get(id) as
    | BranchRow
    | undefined;
  return row ? toBranch(row) : null;
}

export function getBranchByName(name: string): Branch | null {
  const row = openDb()
    .prepare("SELECT * FROM branches WHERE name = ?")
    .get(name) as BranchRow | undefined;
  return row ? toBranch(row) : null;
}

export function insertBranch(branch: Branch): void {
  openDb()
    .prepare(
      `INSERT INTO branches (id, name, parent_id, dataset, snapshot, port, status, created_at)
       VALUES (@id, @name, @parentId, @dataset, @snapshot, @port, @status, @createdAt)`,
    )
    .run(branch as unknown as Record<string, unknown>);
}

export function updateBranchStatus(
  id: string,
  status: BranchStatus,
  port: number | null,
): void {
  openDb()
    .prepare("UPDATE branches SET status = ?, port = ? WHERE id = ?")
    .run(status, port, id);
}

export function deleteBranchRow(id: string): void {
  openDb().prepare("DELETE FROM branches WHERE id = ?").run(id);
}

export function childrenOf(id: string): Branch[] {
  const rows = openDb()
    .prepare("SELECT * FROM branches WHERE parent_id = ?")
    .all(id) as BranchRow[];
  return rows.map(toBranch);
}

export function usedPorts(): number[] {
  const rows = openDb()
    .prepare("SELECT port FROM branches WHERE port IS NOT NULL")
    .all() as Array<{ port: number }>;
  return rows.map((r) => r.port);
}
