import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { MEDIA_ROOT } from "@/lib/media";

// Sert les fichiers du stockage média (partage NFS monté en volume Docker,
// voir MEDIA_ROOT). Les chemins stockés en base sont relatifs à cette
// racine — jamais de binaire dans Postgres, jamais de chemin absolu affiché.

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const relatif = normalize(join(...path));

  // Empêche toute traversée hors de MEDIA_ROOT.
  const cible = resolve(MEDIA_ROOT, relatif);
  if (!cible.startsWith(MEDIA_ROOT)) {
    return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
  }

  let taille: number;
  try {
    taille = statSync(cible).size;
  } catch {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }

  const ext = cible.slice(cible.lastIndexOf(".")).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  // Requêtes partielles (Range) : sans elles, le navigateur ne peut pas
  // positionner `currentTime` hors de ce qu'il a déjà chargé — le banc A/B
  // du casting vocal bascule d'une prise à l'autre au même instant.
  const plage = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (plage && taille > 0) {
    const debut = plage[1] ? Number(plage[1]) : Math.max(0, taille - Number(plage[2]));
    const fin = plage[1] && plage[2] ? Math.min(Number(plage[2]), taille - 1) : taille - 1;
    if (Number.isNaN(debut) || debut > fin || debut >= taille) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${taille}` } });
    }
    const partiel = createReadStream(cible, { start: debut, end: fin });
    return new NextResponse(partiel as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fin - debut + 1),
        "Content-Range": `bytes ${debut}-${fin}/${taille}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const stream = createReadStream(cible);

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(taille),
      "Accept-Ranges": "bytes",
    },
  });
}
