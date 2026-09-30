import { NextRequest, NextResponse } from "next/server";
import { getExportRepliques } from "@/lib/queries-repliques";
import { exportRepliquesCsv } from "@/lib/repliques";

// Export des audios seuls (F02, révision 2026-09-30) : un manifeste des
// répliques dans l'ordre du montage — rang, uuid, locuteur, voix, texte, durée
// mesurée, chemin de la prise (relatif à MEDIA_ROOT, servi par /api/media/…),
// plans d'usage. Pas d'OTIO pour l'instant (DaVinci Resolve, plus tard) : les
// positions se déduisent déjà de l'`ordre` des plans.
//
//   GET /api/export/repliques?projectId=1[&episodeId=2][&format=json|csv]

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const projectId = Number(q.get("projectId"));
  const episodeParam = q.get("episodeId");
  const episodeId = episodeParam ? Number(episodeParam) : undefined;
  if (!Number.isInteger(projectId) || projectId <= 0 || (episodeParam && !Number.isInteger(episodeId))) {
    return NextResponse.json({ error: "projectId (et episodeId) doivent être des entiers" }, { status: 400 });
  }

  const lignes = await getExportRepliques(projectId, episodeId);
  const nom = `repliques_p${projectId}${episodeId ? `_e${episodeId}` : ""}`;

  if ((q.get("format") ?? "json") === "csv") {
    return new NextResponse(exportRepliquesCsv(lignes), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nom}.csv"`,
      },
    });
  }
  return NextResponse.json(lignes, {
    headers: { "Content-Disposition": `attachment; filename="${nom}.json"` },
  });
}
