#!/usr/bin/env node
import { Command } from "commander";
import { execa } from "execa";
import { createRequire } from "node:module";
import pc from "picocolors";
import type { BranchInfo } from "@argon/shared";
import { daemon, findByName } from "./client.js";
import { runDoctor } from "./doctor.js";

const program = new Command();
program
  .name("argon")
  .description("Instant Postgres branching on a single machine")
  .version("0.1.0");

function die(err: unknown): never {
  console.error(pc.red(`error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
}

function printBranch(b: BranchInfo): void {
  console.log(`${pc.bold(b.name)}  ${statusBadge(b.status)}`);
  if (b.parentName) console.log(`  parent:     ${b.parentName}`);
  if (b.connectionString) console.log(`  connect:    ${pc.cyan(b.connectionString)}`);
}

function statusBadge(status: string): string {
  switch (status) {
    case "running": return pc.green(status);
    case "stopped": return pc.dim(status);
    case "starting": return pc.yellow(status);
    default: return pc.red(status);
  }
}

program
  .command("doctor")
  .description("check host prerequisites (ZFS, Postgres, delegation)")
  .action(async () => {
    const ok = await runDoctor().catch(die);
    process.exit(ok ? 0 : 1);
  });

program
  .command("init")
  .description("check prerequisites and prepare the host")
  .action(async () => {
    const ok = await runDoctor().catch(die);
    if (ok) {
      console.log(
        "\nHost is ready. `argon up` will bootstrap the main branch (initdb) on first run.",
      );
    }
    process.exit(ok ? 0 : 1);
  });

program
  .command("up")
  .description("start the argond daemon (foreground)")
  .action(async () => {
    // Resolve the daemon entrypoint from the installed @argon/daemon package.
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@argon/daemon");
    console.log(pc.dim(`starting argond (${entry})…`));
    console.log(pc.dim("UI: run `pnpm --filter @argon/web dev` in the repo, or use Docker.\n"));
    try {
      await execa("node", [entry], { stdio: "inherit" });
    } catch (err) {
      die(err);
    }
  });

const branch = program.command("branch").description("manage branches");

branch
  .command("create <name>")
  .description("create a branch (instant copy-on-write clone)")
  .option("--from <parent>", "parent branch", "main")
  .option("--no-start", "create without starting Postgres")
  .action(async (name: string, opts: { from: string; start: boolean }) => {
    const info = await daemon
      .create({ name, from: opts.from, start: opts.start })
      .catch(die);
    console.log(pc.green(`created branch "${info.name}" from "${opts.from}"`));
    printBranch(info);
  });

branch
  .command("list")
  .description("list branches")
  .action(async () => {
    const branches = await daemon.list().catch(die);
    if (branches.length === 0) {
      console.log(pc.dim("no branches yet — argond bootstraps `main` on startup"));
      return;
    }
    const pad = Math.max(...branches.map((b) => b.name.length)) + 2;
    for (const b of branches) {
      const port = b.port !== null ? `:${b.port}` : "";
      const parent = b.parentName ? pc.dim(` (from ${b.parentName})`) : "";
      console.log(`${b.name.padEnd(pad)}${statusBadge(b.status).padEnd(18)}${port}${parent}`);
    }
  });

branch
  .command("start <name>")
  .description("start a stopped branch")
  .action(async (name: string) => {
    const b = await findByName(name).catch(die);
    printBranch(await daemon.start(b.id).catch(die));
  });

branch
  .command("stop <name>")
  .description("stop a running branch")
  .action(async (name: string) => {
    const b = await findByName(name).catch(die);
    printBranch(await daemon.stop(b.id).catch(die));
  });

branch
  .command("delete <name>")
  .description("delete a branch (stops it and destroys its dataset)")
  .action(async (name: string) => {
    const b = await findByName(name).catch(die);
    await daemon.remove(b.id).catch(die);
    console.log(pc.green(`deleted branch "${name}"`));
  });

program
  .command("connect <name>")
  .description("open psql against a branch (starts it if stopped)")
  .action(async (name: string) => {
    let b = await findByName(name).catch(die);
    if (b.status !== "running") {
      console.log(pc.dim(`waking "${name}"…`));
      b = await daemon.start(b.id).catch(die);
    }
    if (!b.connectionString) die(new Error(`branch "${name}" has no connection string`));
    try {
      await execa("psql", [b.connectionString], { stdio: "inherit" });
    } catch (err) {
      const e = err as { exitCode?: number };
      process.exit(e.exitCode ?? 1);
    }
  });

program
  .command("status")
  .description("daemon health")
  .action(async () => {
    const h = await daemon.health().catch(die);
    console.log(
      `argond v${h.version} — ${h.branches} branch(es), ${h.running} running`,
    );
  });

program.parseAsync().catch(die);
