import { NextResponse } from "next/server";
import { listerTaches } from "@/lib/queries-taches";

// Sondé par le TachesProvider (components/taches) : jamais mis en cache.
export const dynamic = "force-dynamic";

export async function GET() {
  const { taches, resume } = await listerTaches();
  return NextResponse.json({ taches, resume }, { headers: { "Cache-Control": "no-store" } });
}
