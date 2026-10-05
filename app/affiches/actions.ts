"use server";

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { assets, episodes, projects, seasons } from "@/db/schema";
import { TYPE_AFFICHE, codeAffiche, promptAffiche, type CibleAffiche } from "@/lib/affiches";
import { MEDIA_ROOT, cheminPosterMedia } from "@/lib/media";
import { lireBriefOuVide } from "@/lib/queries-agents";

/** Ce qu'une affiche habille, résolu une fois : le projet concerné, le titre à citer et le résumé qui nourrit le prompt. */
async function resoudre(cible: CibleAffiche, id: number): Promise<{ projectId: number; titre: string; resume: string | null; genreTon: string | null } | null> {
  if (cible === "projects") {
    const [projet] = await db.select().from(projects).where(eq(projects.id, id));
    if (!projet) return null;
    const brief = await lireBriefOuVide(projet.id, projet.nom);
    let resume = brief.statut === "partiel" ? null : brief.contenu.arc || null;
    // Un OneShot n'a que son épisode technique : son résumé vaut pour le film entier.
    if (!resume && projet.type === "oneshot") {
      const [ep] = await db
        .select({ resume: episodes.resume })
        .from(episodes)
        .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
        .where(eq(seasons.projectId, projet.id))
        .limit(1);
      resume = ep?.resume?.trim() || null;
    }
    return { projectId: projet.id, titre: projet.nom, resume, genreTon: brief.statut === "partiel" ? null : (brief.contenu.genreTon ?? null) };
  }
  const [ligne] = await db
    .select({ episode: episodes, projectId: seasons.projectId, nomProjet: projects.nom })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .innerJoin(projects, eq(projects.id, seasons.projectId))
    .where(eq(episodes.id, id));
  if (!ligne) return null;
  const brief = await lireBriefOuVide(ligne.projectId, ligne.nomProjet);
  return {
    projectId: ligne.projectId,
    titre: ligne.episode.titre,
    resume: ligne.episode.resume?.trim() || (brief.statut === "partiel" ? null : brief.contenu.arc || null),
    genreTon: brief.statut === "partiel" ? null : (brief.contenu.genreTon ?? null),
  };
}

/** Ouvre la page de génération de l'affiche d'un projet ou d'un épisode. L'asset d'affiche (invisible du registre) est
 * créé AU PREMIER CLIC, avec un prompt proposé à partir du titre et du résumé ; ensuite on le retrouve tel quel, prompt
 * modifié compris. */
export async function ouvrirAffiche(cible: CibleAffiche, id: number): Promise<void> {
  const contexte = await resoudre(cible, id);
  if (!contexte) throw new Error(cible === "projects" ? "Ce projet n'existe pas." : "Cet épisode n'existe pas.");
  const code = codeAffiche(cible, id);

  const [existant] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, contexte.projectId), eq(assets.code, code)));
  if (!existant) {
    await db
      .insert(assets)
      .values({
        projectId: contexte.projectId,
        code,
        type: TYPE_AFFICHE,
        statut: "a_produire",
        description: `Affiche : ${contexte.titre}`,
        promptGeneration: promptAffiche({ cible, titre: contexte.titre, resume: contexte.resume, genreTon: contexte.genreTon }),
      })
      .onConflictDoNothing();
  }
  redirect(`/p/${contexte.projectId}/affiche/${code}`);
}

/** Retire l'affiche (retour au dégradé de repli). L'asset d'affiche et ses candidats restent : on peut en réadopter un. */
export async function retirerAffiche(cible: CibleAffiche, id: number): Promise<void> {
  const [courant] =
    cible === "projects"
      ? await db.select({ poster: projects.posterFichier }).from(projects).where(eq(projects.id, id))
      : await db.select({ poster: episodes.posterFichier }).from(episodes).where(eq(episodes.id, id));
  if (!courant) return;
  if (cible === "projects") await db.update(projects).set({ posterFichier: null }).where(eq(projects.id, id));
  else await db.update(episodes).set({ posterFichier: null }).where(eq(episodes.id, id));
  if (courant.poster) await unlink(join(MEDIA_ROOT, cheminPosterMedia(cible, id, courant.poster))).catch(() => undefined);
  revalidatePath("/", "layout");
}
