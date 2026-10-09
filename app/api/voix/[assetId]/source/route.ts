import { NextRequest, NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { voixFiches } from "@/db/schema";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_VIDEO, cheminVoixMedia, estAudio, estVideo } from "@/lib/media";
import { getVoixAsset } from "@/lib/queries-voix";

export const dynamic = "force-dynamic";

/** Dépôt de la SOURCE d'une voix fournie (casting vocal, scène « La source ») : un audio ou une vidéo, rangé sous voix/<assetId>/source.<ext>
 * (un nouveau dépôt remplace le précédent, pas de versionnage). Une Server Action est plafonnée à 10 Mo : une vidéo entière passe
 * par cette route, jusqu'à TAILLE_MAX_UPLOAD_VIDEO. Le fichier n'est ni transformé ni rogné ici : l'extraction (une fenêtre de 30 s
 * au plus) se lance ensuite depuis la scène, sur ce fichier. Champ du formulaire : `fichier`. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const assetId = Number((await params).assetId);
  if (!Number.isInteger(assetId)) return NextResponse.json({ ok: false, erreur: "Voix inconnue." }, { status: 400 });
  const asset = await getVoixAsset(assetId);
  if (!asset) return NextResponse.json({ ok: false, erreur: "Cette voix n'existe pas." }, { status: 404 });

  let formulaire: FormData;
  try {
    formulaire = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, erreur: "Envoi illisible : dépose le fichier à nouveau." }, { status: 400 });
  }
  const fichier = formulaire.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return NextResponse.json({ ok: false, erreur: "Choisis un audio ou une vidéo." }, { status: 400 });
  if (fichier.size > TAILLE_MAX_UPLOAD_VIDEO) {
    return NextResponse.json(
      { ok: false, erreur: `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(0)} Mo, max ${TAILLE_MAX_UPLOAD_VIDEO / 1024 / 1024} Mo).` },
      { status: 413 },
    );
  }
  const video = estVideo(fichier.name);
  if (!video && !estAudio(fichier.name)) {
    return NextResponse.json({ ok: false, erreur: "Format non pris en charge : audio (WAV, FLAC, MP3, OGG, M4A) ou vidéo (MP4, WebM, MOV)." }, { status: 400 });
  }

  const nom = `source${extname(fichier.name).toLowerCase()}`;
  const cible = join(MEDIA_ROOT, cheminVoixMedia(assetId, nom));
  await mkdir(dirname(cible), { recursive: true });
  await writeFile(cible, Buffer.from(await fichier.arrayBuffer()));

  const [ancienne] = await db.select({ sourceFichier: voixFiches.sourceFichier }).from(voixFiches).where(eq(voixFiches.assetId, assetId));
  if (ancienne?.sourceFichier && ancienne.sourceFichier !== nom) {
    await unlink(join(MEDIA_ROOT, cheminVoixMedia(assetId, ancienne.sourceFichier))).catch(() => undefined);
  }
  await db.insert(voixFiches).values({ assetId, sourceFichier: nom }).onConflictDoUpdate({ target: voixFiches.assetId, set: { sourceFichier: nom } });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, nom, video, src: `/api/media/${cheminVoixMedia(assetId, nom)}?v=${Date.now()}` });
}
