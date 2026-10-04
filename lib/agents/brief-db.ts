import { eq, sql } from "drizzle-orm";
import { briefs, projects } from "../../db/schema";
import { briefVide, clauseDuBrief, notesDuBrief, residuPartiel } from "./brief";
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
    .set({ clauseStyle: clauseDuBrief(contenu), notes: notesDuBrief(contenu) })
    .where(eq(projects.id, projectId));
}

/** Abandonne le brouillon d'un projet (nouvelle conversation, rejet, réinitialisation) SANS perdre la
 * clause de style ni les notes du projet : elles reviennent en brief partiel (voir `residuPartiel`) ;
 * s'il n'y a rien à garder, le brouillon est supprimé. Sans effet sur un brief valide ou partiel. */
export async function abandonnerBrouillon(db: Db, projectId: number): Promise<void> {
  const [b] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  if (!b || b.statut !== "brouillon") return;
  const [projet] = await db.select({ nom: projects.nom, clauseStyle: projects.clauseStyle, notes: projects.notes }).from(projects).where(eq(projects.id, projectId));
  const reste = residuPartiel(
    { contenu: b.contenu as BriefContenu, statuts: b.statuts as Record<string, StatutChamp> },
    { titre: projet?.nom ?? "", clauseStyle: projet?.clauseStyle ?? "", notes: projet?.notes ?? "" },
  );
  if (!reste) {
    await db.delete(briefs).where(eq(briefs.id, b.id));
    return;
  }
  await db
    .update(briefs)
    .set({ statut: "partiel", source: "reconstitue", contenu: reste.contenu, statuts: reste.statuts, version: sql`${briefs.version} + 1`, updatedAt: new Date() })
    .where(eq(briefs.id, b.id));
}

/** Crée le brief partiel d'un projet qui n'en a pas (première édition à la main). */
export async function creerBriefPartiel(db: Db, projectId: number): Promise<void> {
  const [projet] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, projectId));
  await db
    .insert(briefs)
    .values({ projectId, statut: "partiel", source: "reconstitue", contenu: briefVide(projet?.nom ?? ""), statuts: {} })
    .onConflictDoNothing();
}
