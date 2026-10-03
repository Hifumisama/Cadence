import { NextResponse } from "next/server";
import { listerTaches } from "@/lib/queries-taches";
import { lireServeursInjoignables } from "@/lib/serveurs-injoignables";

// Sondé par le TachesProvider (components/taches) : jamais mis en cache.
export const dynamic = "force-dynamic";

export async function GET() {
  const [{ taches, resume }, serveurs] = await Promise.all([listerTaches(), lireServeursInjoignables().catch(() => ({ llm: null, comfyui: null }))]);
  return NextResponse.json({ taches, resume, serveurs }, { headers: { "Cache-Control": "no-store" } });
}
