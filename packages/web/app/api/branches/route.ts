import { NextResponse } from "next/server";
import { daemon, DaemonError } from "@/lib/daemon";

function toResponse(err: unknown): NextResponse {
  if (err instanceof DaemonError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await daemon.list());
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const created = await daemon.create(body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}
