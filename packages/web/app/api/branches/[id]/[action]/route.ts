import { NextResponse } from "next/server";
import { daemon, DaemonError } from "@/lib/daemon";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  try {
    if (action === "start") return NextResponse.json(await daemon.start(id));
    if (action === "stop") return NextResponse.json(await daemon.stop(id));
    return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    const status = err instanceof DaemonError ? err.status : 500;
    const message = err instanceof Error ? err.message : "internal error";
    return NextResponse.json({ error: message }, { status });
  }
}
