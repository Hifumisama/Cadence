import { NextResponse } from "next/server";
import { lirePlansIntents, lireSuiviFiches } from "@/lib/agents/creation-view";

// Sondé par l'écran des intents (components/conception/IntentsAvantFiches.tsx) pendant que les fiches s'écrivent : jamais mis en cache. Une route
// plutôt qu'une action serveur : les actions passent une à une côté client, un sondage retiendrait « Enregistrer ».
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  if (!Number.isInteger(pid)) return NextResponse.json({ erreur: "Projet inconnu." }, { status: 404 });
  const [plans, suivi] = await Promise.all([lirePlansIntents(pid), lireSuiviFiches(pid)]);
  return NextResponse.json({ plans, suivi }, { headers: { "Cache-Control": "no-store" } });
}
