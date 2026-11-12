"use server";

import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { creerProjetSansRedirection } from "@/app/projects/actions";
import { ouvrirConversation } from "@/lib/agents/service";
import { resoudreStyle, validerConception } from "@/lib/projects/design";
import { ecrireConception, poserStyleDuProjet } from "@/lib/projects/design-db";
import { reglagesDepuisCharge } from "@/lib/h3ir/settings";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET } from "@/lib/media";
import { SUJET_AFFICHE_CLAP } from "@/lib/styles/subjects";
import { listerStyles } from "@/lib/styles/styles-db";

/** Actions of the project design page (`/nouveau`). Each action returns `{ ok: true, … } | { ok: false, erreur }`: never
 * an exception for a business case. Plan: docs/PLAN_CONCEPTION_PROJET.md. */

type Echec = { ok: false; erreur: string };

/** Images of free styles live under `styles/libres/` (same folder as the library previews, `styles/<id>.webp`). The name
 * is a uuid: we only accept it in this exact form (never a path coming from the client). */
const MOTIF_IMAGE_LIBRE = /^libres\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
const LARGEUR_IMAGE_STYLE = 720;
const HAUTEUR_IMAGE_STYLE = 1080; // 2:3

/** Uploads the presentation image (2:3, optional) of a free style, before the project exists: center-cropped to 2:3, WebP.
 * Returns the name to put in `style.image`. An abandoned image (project never created) stays on disk: a few dozen KB. */
export async function deposerImageStyleLibre(formData: FormData): Promise<{ ok: true; image: string } | Echec> {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { ok: false, erreur: "Aucun fichier reçu." };
  if (fichier.size > TAILLE_MAX_UPLOAD_ASSET) {
    return { ok: false, erreur: `Image trop volumineuse (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).` };
  }
  const nom = `libres/${randomUUID()}.webp`;
  const cible = join(MEDIA_ROOT, "styles", nom);
  try {
    const { default: sharp } = await import("sharp");
    sharp.cache(false);
    await mkdir(dirname(cible), { recursive: true });
    await sharp(Buffer.from(await fichier.arrayBuffer()))
      .rotate()
      .resize({ width: LARGEUR_IMAGE_STYLE, height: HAUTEUR_IMAGE_STYLE, fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toFile(cible);
  } catch {
    return { ok: false, erreur: "Ce fichier n'est pas une image lisible (PNG, JPEG, WebP…)." };
  }
  return { ok: true, image: nom };
}

/** Creates the project from the design, when moving to the interview: project (provisional name, the title is set at the clap), design,
 * style set in the partial brief, then the entry conversation with the pre-filled sheet and the screenwriter's hook. All or nothing:
 * on failure the project is deleted (the other tables follow by cascade). The first episode is not created here: as for
 * « Créer avec l'agent », the proposal's skeleton does it (the film's episode exists as soon as the project is created). */
export async function creerProjetConcu(brut: unknown): Promise<{ ok: true; projectId: number; conversationUuid: string } | Echec> {
  const bibliotheque = await listerStyles();
  const valide = validerConception(brut, bibliotheque);
  if (!valide.ok) return { ok: false, erreur: valide.erreurs.join(" ") };
  const conception = valide.valeur;
  if (conception.style.source === "libre" && conception.style.image && !MOTIF_IMAGE_LIBRE.test(conception.style.image)) {
    return { ok: false, erreur: "Image de style invalide : dépose-la à nouveau." };
  }
  const style = resoudreStyle(conception, bibliotheque);
  if (!style.ok) return { ok: false, erreur: style.erreur };
  // For a library style, the image is its preview (if it has been generated): the brief keeps the path relative to the `styles/` folder.
  const image = conception.style.source === "libre" ? conception.style.image : `${conception.style.styleId}/${SUJET_AFFICHE_CLAP}.webp`;

  // Staging (creativity, style) is not part of the design: it lives in the project, where the Brief modifies it afterwards (lib/h3ir/settings.ts).
  const { projectId } = await creerProjetSansRedirection({ nom: "Sans titre", ...reglagesDepuisCharge(brut) });
  try {
    await ecrireConception(db, projectId, conception);
    const pose = await poserStyleDuProjet(db, projectId, { ...style.style, ...(image ? { image } : {}) });
    if (!pose.ok) throw new Error(pose.erreur);
    const conv = await ouvrirConversation(projectId, "projet", null, "complete");
    if (!conv.ok) throw new Error(conv.erreur);
    return { ok: true, projectId, conversationUuid: conv.conversationUuid };
  } catch (e) {
    await db.delete(projects).where(eq(projects.id, projectId));
    return { ok: false, erreur: e instanceof Error ? e.message : "La création du projet a échoué." };
  }
}
