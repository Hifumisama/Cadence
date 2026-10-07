"use server";

import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { creerProjetSansRedirection } from "@/app/projects/actions";
import { ouvrirConversation } from "@/lib/agents/service";
import { resoudreStyle, validerConception } from "@/lib/conception";
import { ecrireConception, poserStyleDuProjet } from "@/lib/conception-db";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET } from "@/lib/media";
import { SUJET_AFFICHE_CLAP } from "@/lib/styles/sujets";
import { bibliothequeStyles } from "@/lib/styles/bibliotheque";

/** Actions de la page de conception d'un projet (`/nouveau`). Chaque action rend `{ ok: true, … } | { ok: false, erreur }` : jamais
 * d'exception pour un cas métier. Plan : docs/PLAN_CONCEPTION_PROJET.md. */

type Echec = { ok: false; erreur: string };

/** Les images des styles libres vivent sous `styles/libres/` (même dossier que les aperçus de la bibliothèque, `styles/<id>.webp`). Le nom
 * est un uuid : on ne l'accepte qu'à cette forme exacte (jamais un chemin venu du client). */
const MOTIF_IMAGE_LIBRE = /^libres\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
const LARGEUR_IMAGE_STYLE = 720;
const HAUTEUR_IMAGE_STYLE = 1080; // 2:3

/** Dépose l'image de présentation (2:3, facultative) d'un style libre, avant que le projet existe : recadrée au centre en 2:3, WebP.
 * Renvoie le nom à mettre dans `style.image`. Une image abandonnée (projet jamais créé) reste sur le disque : quelques dizaines de Ko. */
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

/** Crée le projet à partir de la conception, au passage à l'entretien : projet (nom provisoire, le titre se règle au clap), conception,
 * style posé dans le brief partiel, puis conversation d'entrée avec la fiche préremplie et l'accroche du scénariste. Tout ou rien :
 * en cas d'échec le projet est supprimé (les autres tables suivent en cascade). Le premier épisode n'est pas créé ici : comme pour
 * « Créer avec l'agent », le squelette de la proposition le fait (sauf pour un film, qui a toujours sa saison et son épisode). */
export async function creerProjetConcu(brut: unknown): Promise<{ ok: true; projectId: number; conversationUuid: string } | Echec> {
  const bibliotheque = bibliothequeStyles();
  const valide = validerConception(brut, bibliotheque);
  if (!valide.ok) return { ok: false, erreur: valide.erreurs.join(" ") };
  const conception = valide.valeur;
  if (conception.style.source === "libre" && conception.style.image && !MOTIF_IMAGE_LIBRE.test(conception.style.image)) {
    return { ok: false, erreur: "Image de style invalide : dépose-la à nouveau." };
  }
  const style = resoudreStyle(conception, bibliotheque);
  if (!style.ok) return { ok: false, erreur: style.erreur };
  // Pour un style de la bibliothèque, l'image est son aperçu (s'il a été généré) : le brief garde le chemin relatif au dossier `styles/`.
  const image = conception.style.source === "libre" ? conception.style.image : `${conception.style.styleId}/${SUJET_AFFICHE_CLAP}.webp`;

  const { projectId } = await creerProjetSansRedirection({ nom: "Sans titre", type: conception.format === "film" ? "oneshot" : "serie", avecPremierEpisode: false });
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
