import { NextResponse } from "next/server";
import { lirePlansIntents, lireSuiviFiches } from "@/lib/agents/creation-view";

// Polled by the intents screen (components/design/IntentsBeforeSheets.tsx) while the sheets are being written: never cached. A route
// rather than a server action: actions go through one at a time on the client side, so a poll would hold up « Enregistrer ».
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  if (!Number.isInteger(pid)) return NextResponse.json({ erreur: "Projet inconnu." }, { status: 404 });
  const [plans, suivi] = await Promise.all([lirePlansIntents(pid), lireSuiviFiches(pid)]);
  return NextResponse.json({ plans, suivi }, { headers: { "Cache-Control": "no-store" } });
}
