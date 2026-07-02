import { NextResponse } from "next/server";
import { daemon, DaemonError } from "@/lib/daemon";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await daemon.remove(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const status = err instanceof DaemonError ? err.status : 500;
    const message = err instanceof Error ? err.message : "internal error";
    return NextResponse.json({ error: message }, { status });
  }
}
