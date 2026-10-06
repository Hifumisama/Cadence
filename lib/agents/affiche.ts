import { and, eq } from "drizzle-orm";
import { assets, episodes, projects, seasons } from "../../db/schema";
import { cibleDeCodeAffiche, personnagePrincipal, titreDansPrompt, type CibleAffiche } from "../affiches";
import { horsAffiches } from "../assets-visibles";
import { imageActuelle } from "../queries-generations";
import type { Db } from "./applicateurs/commun";
import { extraitsBrief, lireBriefDuProjet, type EntreeSkill } from "./contexte";

/** Ce qu'une affiche habille, résolu une fois : le projet concerné, le titre à citer et ce qui nourrit le prompt (résumé,
 * genre et ton). Le brief fait foi pour un projet ou une saison ; un épisode a son propre résumé. */
export type ContexteAffiche = { projectId: number; titre: string; resume: string | null; genreTon: string | null };

export async function resoudreAffiche(db: Db, cible: CibleAffiche, id: number): Promise<ContexteAffiche | null> {
  if (cible === "projects") {
    const [projet] = await db.select().from(projects).where(eq(projects.id, id));
    if (!projet) return null;
    const brief = await briefUtilisable(db, projet.id);
    let resume = brief?.arc || null;
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
    return { projectId: projet.id, titre: projet.nom, resume, genreTon: brief?.genreTon ?? null };
  }
  if (cible === "seasons") {
    const [ligne] = await db.select({ titre: seasons.titre, projectId: seasons.projectId }).from(seasons).where(eq(seasons.id, id));
    if (!ligne) return null;
    const brief = await briefUtilisable(db, ligne.projectId);
    return { projectId: ligne.projectId, titre: ligne.titre, resume: brief?.arc || null, genreTon: brief?.genreTon ?? null };
  }
  const [ligne] = await db
    .select({ episode: episodes, projectId: seasons.projectId })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(eq(episodes.id, id));
  if (!ligne) return null;
  const brief = await briefUtilisable(db, ligne.projectId);
  return {
    projectId: ligne.projectId,
    titre: ligne.episode.titre,
    resume: ligne.episode.resume?.trim() || brief?.arc || null,
    genreTon: brief?.genreTon ?? null,
  };
}

/** Le brief du projet, sauf s'il est vide ou partiel (rien de rédigé dont s'inspirer). */
async function briefUtilisable(db: Db, projectId: number) {
  const brief = await lireBriefDuProjet(db, projectId);
  return brief && brief.statut !== "partiel" ? brief.contenu : null;
}

/** Le personnage principal du projet et son image : le premier personnage du brief retrouvé dans le registre (voir
 * `personnagePrincipal`). Lu côté serveur (accès disque pour savoir si l'image existe). */
export async function lirePersonnagePrincipal(db: Db, projectId: number) {
  const brief = await lireBriefDuProjet(db, projectId);
  const lignes = await db
    .select({ code: assets.code, description: assets.description, fichier: assets.fichier })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.type, "personnage"), horsAffiches))
    .orderBy(assets.code);
  const registre = lignes.map((a) => ({
    code: a.code,
    description: a.description ?? "",
    aImage: imageActuelle({ id: 0, code: a.code, type: "personnage", fichier: a.fichier }) != null,
  }));
  const choix = personnagePrincipal(brief && brief.statut !== "partiel" ? brief.contenu.personnages : [], registre);
  return choix ? { ...choix.asset, nom: choix.nom ?? choix.asset.code } : null;
}

/** L'entrée du skill `prompt-affiche` pour l'asset d'affiche d'un projet, d'une saison ou d'un épisode : titre, résumé, ton,
 * personnage principal (et si son image existe : elle sert de première source), clause de style en information. */
export async function entreePromptAffiche(db: Db, projectId: number, assetId: number, consigne: string, retour?: string): Promise<EntreeSkill | null> {
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)));
  const cible = asset ? cibleDeCodeAffiche(asset.code) : null;
  if (!asset || !cible) return null;
  const contexteAffiche = await resoudreAffiche(db, cible.cible, cible.id);
  if (!contexteAffiche) return null;
  const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, projectId));
  const brief = await lireBriefDuProjet(db, projectId);
  const { contexte } = extraitsBrief(brief?.contenu ?? null);
  const principal = await lirePersonnagePrincipal(db, projectId);

  return {
    skill: "prompt-affiche",
    contexte: [
      { type: "asset", libelle: `Affiche · ${contexteAffiche.titre}`, ref: asset.code },
      ...(principal ? [{ type: "asset" as const, libelle: `Personnage principal ${principal.code}${principal.aImage ? " (image en source 1)" : " (sans image)"}`, ref: principal.code }] : []),
      ...(projet?.clauseStyle ? [{ type: "projet" as const, libelle: "Clause de style du projet (information)" }] : []),
      ...contexte,
    ],
    entree: {
      cible: cible.cible === "projects" ? "projet" : cible.cible === "seasons" ? "saison" : "episode",
      titre: contexteAffiche.titre,
      resume: contexteAffiche.resume ?? "",
      genreTon: contexteAffiche.genreTon ?? "",
      clauseStyleDuProjet: projet?.clauseStyle ?? "",
      titreDansImage: titreDansPrompt(asset.promptGeneration ?? ""),
      promptActuel: asset.promptGeneration ?? "",
      personnagePrincipal: principal
        ? { code: principal.code, nom: principal.nom, description: principal.description, imageDisponible: principal.aImage }
        : null,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}
