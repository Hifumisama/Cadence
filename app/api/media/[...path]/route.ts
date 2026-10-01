import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { MEDIA_ROOT } from "@/lib/media";
import { lireLargeur } from "@/lib/miniatures";
import { obtenirMiniature } from "@/lib/miniatures-serveur";

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

  // Miniature à la demande (`?w=192`, largeurs en liste blanche — voir
  // lib/miniatures.ts) : WebP mis en cache sur disque. Une largeur inconnue est
  // ignorée (on sert l'original) ; si sharp échoue, repli sur l'original aussi.
  const largeur = lireLargeur(req.nextUrl.searchParams.get("w"));
  if (largeur) {
    const mini = await obtenirMiniature(MEDIA_ROOT, relatif, largeur);
    if (mini) {
      // L'URL des assets porte `?v=<mtime>` : tant que `v` est là, le contenu ne
      // change pas pour cette URL. Sans `v`, on revalide (304 grâce à l'ETag).
      const entetes: Record<string, string> = {
        "Content-Type": "image/webp",
        ETag: mini.etag,
        "Cache-Control": req.nextUrl.searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-cache",
      };
      if (req.headers.get("if-none-match") === mini.etag) return new NextResponse(null, { status: 304, headers: entetes });
      try {
        const octets = await readFile(mini.chemin);
        return new NextResponse(new Uint8Array(octets), { headers: { ...entetes, "Content-Length": String(octets.length) } });
      } catch {
        // miniature disparue entre-temps : on sert l'original
      }
    }
  }

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
