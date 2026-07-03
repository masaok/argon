import Fastify from "fastify";
import type { CreateBranchRequest, DaemonHealth } from "@argon/shared";
import { config } from "./config.js";
import * as db from "./db.js";
import {
  BranchError,
  createBranch,
  deleteBranch,
  startBranch,
  stopBranch,
  toInfo,
} from "./branches.js";

const VERSION = "0.1.0";

export async function startApi(): Promise<void> {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _req, reply) => {
    const status = err instanceof BranchError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    if (status >= 500) console.error("[api]", err);
    void reply.status(status).send({ error: message });
  });

  app.get("/health", async (): Promise<DaemonHealth> => {
    const branches = db.listBranches();
    return {
      ok: true,
      version: VERSION,
      branches: branches.length,
      running: branches.filter((b) => b.status === "running").length,
    };
  });

  app.get("/branches", async () => db.listBranches().map(toInfo));

  app.post("/branches", async (req, reply) => {
    const body = req.body as CreateBranchRequest;
    if (!body?.name) throw new BranchError("name is required");
    const info = await createBranch(body);
    return reply.status(201).send(info);
  });

  app.post("/branches/:id/start", async (req) => {
    const { id } = req.params as { id: string };
    return toInfo(await startBranch(id));
  });

  app.post("/branches/:id/stop", async (req) => {
    const { id } = req.params as { id: string };
    return toInfo(await stopBranch(id));
  });

  app.delete("/branches/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteBranch(id);
    return reply.status(204).send();
  });

  // Loopback only: single-machine tool, no auth in v1.
  await app.listen({ host: config.apiHost, port: config.apiPort });
  console.log(`[argond] API listening on http://${config.apiHost}:${config.apiPort}`);
}
