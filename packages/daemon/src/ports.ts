import { createServer } from "node:net";
import { config } from "./config.js";
import { usedPorts } from "./db.js";

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => {
      srv.close(() => resolve(true));
    });
  });
}

/**
 * Allocate a port from the configured range, skipping ports recorded in the
 * db AND ports something else is actually listening on.
 */
export async function allocatePort(): Promise<number> {
  const taken = new Set(usedPorts());
  for (let p = config.portRangeStart; p <= config.portRangeEnd; p++) {
    if (taken.has(p)) continue;
    if (await isPortFree(p)) return p;
  }
  throw new Error(
    `no free port in range ${config.portRangeStart}-${config.portRangeEnd}`,
  );
}
