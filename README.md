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
what `argon doctor` walks you through). With Docker, everything is in the
box: ZFS is used if your kernel has it, and if not (stock WSL2 / Docker
Desktop), the container falls back to a file-backed **Btrfs** volume
automatically — no setup either way.

1. **Install and start Argon:**

   ```bash
   curl -fsSL https://raw.githubusercontent.com/masaok/argon/main/install.sh | sh
   # or, from a clone of this repo:
   docker compose up -d
   ```

2. **Open the dashboard** at http://localhost:3000 — the `main` branch is
   bootstrapped automatically on first run.

3. **Create a branch and connect** (branches listen on ports 5433–5443):

   ```bash
   psql "postgresql://postgres@127.0.0.1:5434/postgres"
   ```

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

### WSL2 / Docker Desktop users

The standard WSL2 kernel (and therefore Docker Desktop, which shares it)
ships **without the ZFS module** — but the kernel does include **Btrfs**, and
Argon falls back to it automatically. Both quickstart paths work:

- **Docker (nothing to do):** `docker compose up -d` just works — the
  entrypoint detects the missing ZFS module and creates a file-backed Btrfs
  volume inside the container instead.

- **Native in WSL2:** set up a file-backed Btrfs volume once, then run as
  usual (`argon doctor` prints these same steps):

  ```bash
  sudo apt install btrfs-progs
  sudo truncate -s 20G /var/lib/argon-btrfs.img
  sudo mkfs.btrfs /var/lib/argon-btrfs.img
  mkdir -p ~/.argon/branches
  sudo mount -o loop,user_subvol_rm_allowed /var/lib/argon-btrfs.img ~/.argon/branches
  sudo chown $USER ~/.argon/branches
  argon up
  ```

  `user_subvol_rm_allowed` lets Argon delete branches without root. The mount
  doesn't survive a WSL restart — add it to `/etc/fstab` (see `argon doctor`)
  or re-run the `mount` line.

Prefer real ZFS on WSL2 anyway? It requires building a custom WSL2 kernel —
possible, but it defeats the "easy install" goal; the Btrfs backend is the
supported path.

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
  `pg_ctl start` on a free port from 5433–5533. On the Btrfs backend it's a
  single `btrfs subvolume snapshot` (also O(1), writable in one step).
- **Storage backends**: `ARGON_STORAGE=auto` (default) prefers ZFS and falls
  back to Btrfs; force one with `zfs`/`btrfs`.
- **Scale-to-zero**: a supervisor sweeps every 15s; a branch with zero client
  connections for 5 minutes is stopped (`ARGON_NO_SUSPEND=1` disables this).
  Restart is explicit in v1 — wake-on-connect proxying is planned for v2.
- **Connection routing (v1)**: each branch listens on its own loopback port;
  connect directly with the string shown in the UI/CLI.

## Honest constraints (read before filing issues)

- **Linux only (ZFS or Btrfs).** ZFS is preferred; hosts without the ZFS
  kernel module (stock WSL2, Docker Desktop) use the Btrfs fallback
  automatically. macOS/Windows go through Docker. No overlayfs mode.
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

Environment knobs (daemon): `ARGON_STORAGE` (auto|zfs|btrfs),
`ARGON_DATASET` (zfs), `ARGON_BTRFS_ROOT` (btrfs), `ARGON_STATE_DIR`,
`ARGON_PG_BIN`, `ARGON_DAEMON_PORT`, `ARGON_PORT_START/END`,
`ARGON_IDLE_TIMEOUT_MS`, `ARGON_NO_SUSPEND`.

## License

Apache-2.0
