import { eq } from "drizzle-orm";
import { briefs, projects } from "../../db/schema";
import { briefVide, clauseDuBrief, fusionnerPartielDansBrouillon, notesDuBrief, promptImageDuBrief } from "./brief";
import type { Db } from "./applicateurs/commun";
import type { BriefContenu, StatutChamp } from "./types";

/** Le brief est la SOURCE UNIQUE de la clause de style et des notes du projet (2026-10-02,
 * remplace les « globaux du scénario »). `projects.clause_style` et `projects.notes` ne sont que
 * des COPIES dénormalisées (la génération d'images lit la clause sans changer) : elles ne
 * s'écrivent QUE par `synchroniserClauseStyle`, appelée après toute écriture d'un brief « valide »
 * ou « partiel » (édition directe, application d'une proposition). Un brouillon ne synchronise rien :
 * il n'est pas encore la référence du projet. */
export async function synchroniserClauseStyle(db: Db, projectId: number): Promise<void> {
  const [b] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  if (!b || (b.statut !== "valide" && b.statut !== "partiel")) return;
  const contenu = b.contenu as BriefContenu;
  await db
    .update(projects)
    .set({ clauseStyle: clauseDuBrief(contenu), stylePromptImage: promptImageDuBrief(contenu), notes: notesDuBrief(contenu) })
    .where(eq(projects.id, projectId));
}

/** Crée le brief partiel d'un projet qui n'en a pas (première édition à la main). */
export async function creerBriefPartiel(db: Db, projectId: number): Promise<void> {
  const [projet] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, projectId));
  await db
    .insert(briefs)
    .values({ projectId, statut: "partiel", source: "reconstitue", contenu: briefVide(projet?.nom ?? ""), statuts: {} })
    .onConflictDoNothing();
}

/** Écrit le BROUILLON du brief d'un projet (jamais par-dessus un brief validé). Un brief partiel (style, notes… posés à la main) :
 * ce que l'utilisateur a posé gagne sur ce que l'agent a rédigé. Sert au brouillon issu de la fiche de
 * notes de l'entretien, dès qu'elle est complète. */
export async function ecrireBrouillon(db: Db, projectId: number, genere: { contenu: BriefContenu; statuts: Record<string, StatutChamp> }): Promise<void> {
  const [existant] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  if (existant?.statut === "valide") throw new Error("Le projet a déjà un brief validé : le brouillon n'a pas été écrit par-dessus.");
  const { contenu, statuts } =
    existant?.statut === "partiel"
      ? fusionnerPartielDansBrouillon(genere, { contenu: existant.contenu as BriefContenu, statuts: existant.statuts as Record<string, StatutChamp> })
      : genere;
  if (existant) {
    await db
      .update(briefs)
      .set({ statut: "brouillon", source: "conversation", contenu, statuts, version: existant.version + 1, updatedAt: new Date() })
      .where(eq(briefs.id, existant.id));
  } else {
    await db.insert(briefs).values({ projectId, statut: "brouillon", source: "conversation", contenu, statuts });
  }
}
