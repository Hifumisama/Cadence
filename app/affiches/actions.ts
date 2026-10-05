"use server";

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { assets, episodes, projects, seasons } from "@/db/schema";
import { TYPE_AFFICHE, avecTitreDansImage, codeAffiche, promptAffiche, titreDansPrompt, type CibleAffiche } from "@/lib/affiches";
import { lirePersonnagePrincipal } from "@/lib/affiche-personnage";
import { executerSkill } from "@/lib/llm";
import { imageActuelle } from "@/lib/queries-generations";
import { MEDIA_ROOT, cheminPosterMedia } from "@/lib/media";
import { ecrirePoster, lirePoster } from "@/lib/affiche-application";
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
  if (cible === "seasons") {
    const [ligne] = await db
      .select({ titre: seasons.titre, projectId: seasons.projectId, nomProjet: projects.nom })
      .from(seasons)
      .innerJoin(projects, eq(projects.id, seasons.projectId))
      .where(eq(seasons.id, id));
    if (!ligne) return null;
    const brief = await lireBriefOuVide(ligne.projectId, ligne.nomProjet);
    return {
      projectId: ligne.projectId,
      titre: ligne.titre,
      resume: brief.statut === "partiel" ? null : brief.contenu.arc || null,
      genreTon: brief.statut === "partiel" ? null : (brief.contenu.genreTon ?? null),
    };
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

/** Ouvre la page de génération de l'affiche d'un projet, d'une saison ou d'un épisode. L'asset d'affiche (invisible du registre) est
 * créé AU PREMIER CLIC, avec un prompt proposé à partir du titre et du résumé ; ensuite on le retrouve tel quel, prompt
 * modifié compris. */
export async function ouvrirAffiche(cible: CibleAffiche, id: number): Promise<void> {
  const contexte = await resoudre(cible, id);
  if (!contexte) throw new Error(cible === "projects" ? "Ce projet n'existe pas." : cible === "seasons" ? "Cette saison n'existe pas." : "Cet épisode n'existe pas.");
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
  const courant = await lirePoster(cible, id);
  if (courant === undefined) return;
  await ecrirePoster(cible, id, null);
  if (courant) await unlink(join(MEDIA_ROOT, cheminPosterMedia(cible, id, courant))).catch(() => undefined);
  revalidatePath("/", "layout");
}

/** L'asset d'affiche d'une cible, ou null s'il n'a pas encore été créé (bouton « Générer une image »). */
async function assetAffiche(projectId: number, cible: CibleAffiche, id: number) {
  const [asset] = await db.select().from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, codeAffiche(cible, id))));
  return asset ?? null;
}

/** « Écrire le titre dans l'image » : ajoute ou retire la ligne de titre du prompt (le reste n'est pas touché). C'est le
 * prompt qui fait foi : à l'adoption, un prompt qui porte la ligne donne une affiche sans titre superposé. */
export async function reglerTitreAffiche(cible: CibleAffiche, id: number, actif: boolean): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const contexte = await resoudre(cible, id);
  if (!contexte) return { ok: false, erreur: "Introuvable." };
  const asset = await assetAffiche(contexte.projectId, cible, id);
  if (!asset) return { ok: false, erreur: "Ouvre d'abord la page de génération de l'affiche." };
  await db
    .update(assets)
    .set({ promptGeneration: avecTitreDansImage(asset.promptGeneration ?? promptAffiche({ cible, titre: contexte.titre }), contexte.titre, actif) })
    .where(eq(assets.id, asset.id));
  revalidatePath(`/p/${contexte.projectId}/affiche/${asset.code}`);
  return { ok: true };
}

/** « Rédiger le prompt avec l'agent » : le skill `prompt-affiche` écrit le prompt à partir du titre, du résumé, du ton et du
 * personnage principal (son image sert de première source quand elle existe). Appel direct, comme une proposition : le
 * prompt remplace celui de l'affiche, que l'utilisateur relit et modifie avant de lancer. */
export async function redigerPromptAffiche(cible: CibleAffiche, id: number): Promise<{ ok: true; remarques: string[] } | { ok: false; erreur: string }> {
  const contexte = await resoudre(cible, id);
  if (!contexte) return { ok: false, erreur: "Introuvable." };
  const asset = await assetAffiche(contexte.projectId, cible, id);
  if (!asset) return { ok: false, erreur: "Ouvre d'abord la page de génération de l'affiche." };

  const [projet] = await db.select({ nom: projects.nom, clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, contexte.projectId));
  const principal = await lirePersonnagePrincipal(contexte.projectId, projet?.nom ?? "");
  const titreDansImage = titreDansPrompt(asset.promptGeneration ?? "");

  try {
    const r = await executerSkill(
      "prompt-affiche",
      {
        cible: cible === "projects" ? "projet" : cible === "seasons" ? "saison" : "episode",
        titre: contexte.titre,
        resume: contexte.resume ?? "",
        genreTon: contexte.genreTon ?? "",
        clauseStyleDuProjet: projet?.clauseStyle ?? "",
        titreDansImage,
        personnagePrincipal: principal
          ? { code: principal.code, nom: principal.nom, description: principal.description, imageDisponible: principal.aImage }
          : null,
      },
      { projectId: contexte.projectId },
    );
    const sortie = r.json as { methode: "generation" | "edition"; promptGeneration: string; remarques: string[] };
    const edition = sortie.methode === "edition" && principal?.aImage === true;
    await db
      .update(assets)
      .set({
        promptGeneration: avecTitreDansImage(sortie.promptGeneration.trim(), contexte.titre, titreDansImage),
        methodeGeneration: edition ? "edition" : "generation",
      })
      .where(eq(assets.id, asset.id));
    revalidatePath(`/p/${contexte.projectId}/affiche/${asset.code}`);
    return { ok: true, remarques: sortie.remarques ?? [] };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "L'agent n'a pas répondu." };
  }
}
