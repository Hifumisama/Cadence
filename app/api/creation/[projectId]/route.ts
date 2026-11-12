import { NextResponse } from "next/server";
import { lireVueCreation } from "@/lib/agents/creation-view";

// Polled by the installer page: never cached.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  if (!Number.isInteger(pid)) return NextResponse.json({ erreur: "Projet inconnu." }, { status: 404 });
  return NextResponse.json({ creation: await lireVueCreation(pid) }, { headers: { "Cache-Control": "no-store" } });
}
