import { and, eq } from "drizzle-orm";
import { assets, episodes, projects } from "../../db/schema";
import { cibleDeCodeAffiche, personnagePrincipal, titreDansPrompt, type CibleAffiche } from "../posters/posters";
import { horsAffiches } from "../assets/assets-visible";
import { VARIANTE_AFFICHE } from "../llm/variants";
import { imageActuelle } from "../assets/queries-generations";
import type { Db } from "./appliers/common";
import { extraitsBrief, lireBriefDuProjet, type EntreeSkill } from "./context";

/** What a poster dresses, resolved once: the project concerned, the title to cite and what feeds the prompt (summary,
 * genre and tone). The brief is authoritative for a project; an episode has its own summary. */
export type ContexteAffiche = { projectId: number; titre: string; resume: string | null; genreTon: string | null };

export async function resoudreAffiche(db: Db, cible: CibleAffiche, id: number): Promise<ContexteAffiche | null> {
  if (cible === "projects") {
    const [projet] = await db.select().from(projects).where(eq(projects.id, id));
    if (!projet) return null;
    const brief = await briefUtilisable(db, projet.id);
    let resume = brief?.arc || null;
    // A film has only its single episode: its summary stands for the whole film.
    if (!resume) {
      const [ep] = await db.select({ resume: episodes.resume }).from(episodes).where(eq(episodes.projectId, projet.id)).orderBy(episodes.numero).limit(1);
      resume = ep?.resume?.trim() || null;
    }
    return { projectId: projet.id, titre: projet.nom, resume, genreTon: brief?.genreTon ?? null };
  }
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, id));
  if (!episode) return null;
  const brief = await briefUtilisable(db, episode.projectId);
  return {
    projectId: episode.projectId,
    titre: episode.titre,
    resume: episode.resume?.trim() || brief?.arc || null,
    genreTon: brief?.genreTon ?? null,
  };
}

/** The project's brief, unless it is empty or partial (nothing written to draw on). */
async function briefUtilisable(db: Db, projectId: number) {
  const brief = await lireBriefDuProjet(db, projectId);
  return brief && brief.statut !== "partiel" ? brief.contenu : null;
}

/** The project's main character and its image: the first character of the brief found in the registry (see
 * `personnagePrincipal`). Read server side (disk access to know whether the image exists). */
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

/** The `prompt-asset` skill input, `affiche` variant, for the poster asset of a project or an episode: title,
 * summary, tone, main character (and whether its image exists: it serves as the first source), style clause as information. */
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
    skill: "prompt-asset",
    variante: VARIANTE_AFFICHE,
    contexte: [
      { type: "asset", libelle: `Affiche · ${contexteAffiche.titre}`, ref: asset.code },
      ...(principal ? [{ type: "asset" as const, libelle: `Personnage principal ${principal.code}${principal.aImage ? " (image en source 1)" : " (sans image)"}`, ref: principal.code }] : []),
      ...(projet?.clauseStyle ? [{ type: "projet" as const, libelle: "Clause de style du projet (information)" }] : []),
      ...contexte,
    ],
    entree: {
      cible: cible.cible === "projects" ? "projet" : "episode",
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
