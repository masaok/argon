# Argon — instant Postgres branching on a single machine

Argon is an open-source "Neon-lite": create copy-on-write branches of a
Postgres database in about a second, each running as its own cluster on its
own port, with a web dashboard, a CLI, and scale-to-zero for idle branches.

Argon is **not a database** — it's an orchestrator. It takes ZFS snapshots of
a Postgres data directory, boots a stock Postgres against each clone, and
keeps the bookkeeping in SQLite.

```
argon branch create feat-x        # O(1) clone of main, running in ~1s
psql postgresql://postgres@127.0.0.1:5434/postgres
```

## Quickstart

### Path A — Docker (recommended, one command)

**Why Docker?** Argon's hard parts aren't its own code — they're the things it
needs on your machine: ZFS tools, the right Postgres binaries, a storage pool,
and permission to snapshot it. The Docker image ships all of that pre-wired:
Postgres 17 and ZFS tools are inside the container, the storage pool is
created automatically as a plain file (no spare disk or partition needed), and
the permission setup happens for you — no `sudo` commands to copy around.
Going native means installing and configuring those pieces yourself (that's
what `argon doctor` walks you through). With Docker, the only thing your
machine needs is the ZFS kernel module; everything else is in the box.

1. **Check the one host requirement** — the ZFS kernel module (Linux):

   ```bash
   lsmod | grep zfs || sudo apt install zfsutils-linux   # Ubuntu/Debian
   ```

2. **Install and start Argon:**

   ```bash
   curl -fsSL https://raw.githubusercontent.com/masaok/argon/main/install.sh | sh
   # or, from a clone of this repo:
   docker compose up -d
   ```

3. **Open the dashboard** at http://localhost:3000 — the `main` branch is
   bootstrapped automatically on first run.

4. **Create a branch and connect** (branches listen on ports 5433–5443):

   ```bash
   psql "postgresql://postgres@127.0.0.1:5434/postgres"
   ```

macOS/Windows: Docker Desktop's Linux VM must have ZFS available.

### Path B — Native (pnpm, no Docker)

1. **Install the CLI:**

   ```bash
   pnpm add -g argon
   ```

2. **Check prerequisites** — `argon init` diagnoses the host and prints
   copy-pasteable fixes (ZFS, Postgres binaries, a pool, delegation):

   ```bash
   argon init
   ```

3. **Fix whatever it flags**, typically:

   ```bash
   sudo apt install zfsutils-linux postgresql-17          # Ubuntu/Debian
   sudo truncate -s 20G /var/lib/argon-pool.img           # file-backed pool,
   sudo zpool create argon /var/lib/argon-pool.img        #   no spare disk needed
   sudo zfs allow $USER create,snapshot,clone,mount,destroy argon
   export ARGON_PG_BIN=/usr/lib/postgresql/17/bin
   ```

   Re-run `argon doctor` until all checks pass.

4. **Start the daemon** (bootstraps the `main` branch on first run):

   ```bash
   argon up
   ```

5. **Create your first branch and connect** (in another terminal):

   ```bash
   argon branch create feat-x
   argon connect feat-x
   ```

`argon doctor` turns host problems into copy-pasteable fixes:

```
$ argon doctor
✓ Node 24.15.0
✗ ZFS: `zfs` not found
   → Ubuntu/Debian: sudo apt install zfsutils-linux
✗ zpool "argon" not found
   → sudo truncate -s 20G /var/lib/argon-pool.img
   → sudo zpool create argon /var/lib/argon-pool.img
✗ ZFS delegation not set for user 'you'
   → Run: sudo zfs allow you create,snapshot,clone,mount,destroy argon
```

## CLI

```bash
argon doctor                       # check host prerequisites
argon up                           # run the daemon (foreground)
argon branch create feat-x         # branch from main, start immediately
argon branch create exp --from feat-x --no-start
argon branch list
argon branch stop feat-x
argon branch delete feat-x
argon connect feat-x               # opens psql (wakes the branch if stopped)
argon status
```

## How it works

```
Next.js UI (:3000)  ──▶  argond (127.0.0.1:5310)  ──▶  zfs snapshot/clone
                              │                          pg_ctl -p <port>
                              └── SQLite metadata        SQLite: branch ↔ port
```

- **Branch create** = `zfs snapshot parent@x` + `zfs clone` (both O(1)) +
  `pg_ctl start` on a free port from 5433–5533.
- **Scale-to-zero**: a supervisor sweeps every 15s; a branch with zero client
  connections for 5 minutes is stopped (`ARGON_NO_SUSPEND=1` disables this).
  Restart is explicit in v1 — wake-on-connect proxying is planned for v2.
- **Connection routing (v1)**: each branch listens on its own loopback port;
  connect directly with the string shown in the UI/CLI.

## Honest constraints (read before filing issues)

- **Linux for real ZFS.** macOS/Windows go through Docker. There is no
  Btrfs/overlayfs fallback yet.
- **Privileges.** ZFS operations need either `privileged: true` (Docker path)
  or one-time `sudo zfs allow` delegation (native path). Never run the web UI
  or daemon as root — `initdb` will refuse anyway.
- **Per-cluster branching.** A branch is a whole Postgres *cluster* (ZFS
  clones the entire data directory), not a single database at an arbitrary
  LSN like hosted Neon. For local dev this is simpler and usually what you
  want.
- **Local trust auth.** v1 binds every cluster to 127.0.0.1 with `trust`
  auth — it's a single-user dev tool, not a shared server.

## Development

pnpm monorepo:

| Package | What |
|---|---|
| `packages/shared` | `@argon/shared` — types shared by daemon, CLI, and web |
| `packages/daemon` | `argond` — ZFS + `pg_ctl` orchestrator, Fastify API, idle supervisor |
| `packages/cli` | `argon` — CLI incl. `doctor` |
| `packages/web` | Next.js 15 dashboard |

```bash
pnpm setup       # install + build daemon/cli
pnpm dev         # daemon (tsx watch) + web (next dev) together
```

Environment knobs (daemon): `ARGON_DATASET`, `ARGON_STATE_DIR`,
`ARGON_PG_BIN`, `ARGON_DAEMON_PORT`, `ARGON_PORT_START/END`,
`ARGON_IDLE_TIMEOUT_MS`, `ARGON_NO_SUSPEND`.

## License

Apache-2.0
