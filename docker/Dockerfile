# Argon all-in-one image: Postgres 17 + ZFS userland + argond + Next.js UI.
# Requires the ZFS kernel module on the HOST and `privileged: true`.

FROM node:22-bookworm

# Postgres 17 (pgdg) + ZFS userland tools
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-common ca-certificates \
  && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
  && apt-get install -y --no-install-recommends postgresql-17 zfsutils-linux \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install && pnpm build

ENV NODE_ENV=production \
    ARGON_DATASET=argon \
    ARGON_STATE_DIR=/var/lib/argon/state \
    ARGON_PG_BIN=/usr/lib/postgresql/17/bin \
    ARGON_DAEMON_URL=http://127.0.0.1:5310

EXPOSE 3000 5433-5443

ENTRYPOINT ["/app/docker/entrypoint.sh"]
