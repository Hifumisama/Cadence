import { NextResponse } from "next/server";
import { lireEtatImages } from "@/lib/queries-images";

// Sondé par le clap de la préparation, le bandeau « Prochaine étape » et le registre : jamais mis en cache.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  if (!Number.isInteger(pid)) return NextResponse.json({ erreur: "Projet inconnu." }, { status: 404 });
  return NextResponse.json({ images: await lireEtatImages(pid) }, { headers: { "Cache-Control": "no-store" } });
}
