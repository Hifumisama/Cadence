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
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

export async function GET(
  _req: NextRequest,
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

  const stream = createReadStream(cible);
  const ext = cible.slice(cible.lastIndexOf(".")).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(taille),
    },
  });
}
