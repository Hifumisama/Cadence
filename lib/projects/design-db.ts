import { eq, sql } from "drizzle-orm";
import { briefs, conceptions, projects } from "../../db/schema";
import type { Db } from "../agents/appliers/common";
import { briefVide } from "../agents/brief";
import { synchroniserClauseStyle } from "../agents/brief-db";
import type { BriefContenu } from "../agents/types";
import { entreeAccroche } from "../agents/hook";
import type { Fiche } from "../agents/sheet";
import { ficheDepuisConception, validerConception, type Conception, type StyleResolu } from "./design";

/** Database access for a project's design (see lib/projects/design.ts for the content and the rules). */

/** A project's design, or null if it has none (project created before the design) or if the row is unreadable. The identifier of a
 * library style is NOT re-checked against the library: the user may have removed that style since, the project keeps
 * its choice. */
export async function lireConception(db: Db, projectId: number): Promise<Conception | null> {
  const [ligne] = await db.select({ contenu: conceptions.contenu }).from(conceptions).where(eq(conceptions.projectId, projectId));
  if (!ligne) return null;
  const style = (ligne.contenu as { style?: { source?: string; styleId?: string } } | null)?.style;
  const bibliotheque = style?.source === "bibliotheque" && style.styleId ? [{ id: style.styleId }] : [];
  const r = validerConception(ligne.contenu, bibliotheque);
  return r.ok ? r.valeur : null;
}

/** Saves the design (one per project, replaced on each write). */
export async function ecrireConception(db: Db, projectId: number, conception: Conception): Promise<void> {
  await db
    .insert(conceptions)
    .values({ projectId, contenu: conception })
    .onConflictDoUpdate({ target: conceptions.projectId, set: { contenu: conception, updatedAt: new Date() } });
}

/** Sets the design's style in the project's PARTIAL brief (status « fourni »: what the user chose wins over what the agent
 * will write), then copies the clause and the long prompt into the project. Creates the partial brief if it does not exist; refuses to touch a brief
 * already validated or in draft (the style is then changed from the brief page). */
export async function poserStyleDuProjet(db: Db, projectId: number, style: StyleResolu): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [projet] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, projectId));
  if (!projet) return { ok: false, erreur: "Projet introuvable." };
  const [existant] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  const styleBrief: BriefContenu["style"] = { nom: style.nom, clause: style.clause, promptImage: style.promptImage, ...(style.image ? { image: style.image } : {}) };
  if (!existant) {
    await db.insert(briefs).values({
      projectId,
      statut: "partiel",
      source: "reconstitue",
      contenu: { ...briefVide(projet.nom), style: styleBrief },
      statuts: { style: "fourni" },
    });
  } else if (existant.statut === "partiel") {
    await db
      .update(briefs)
      .set({
        contenu: { ...(existant.contenu as BriefContenu), style: styleBrief },
        statuts: { ...(existant.statuts as Record<string, string>), style: "fourni" },
        version: sql`${briefs.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(briefs.id, existant.id));
  } else {
    return { ok: false, erreur: "Le projet a déjà un brief : change son style depuis la page du brief." };
  }
  await synchroniserClauseStyle(db, projectId);
  return { ok: true };
}

/** Opening a DESIGNED project: the interview sheet pre-filled and the input of the skill that writes the screenwriter's hook (the model
 * writes it: see `hook.ts`). The style comes from the project's brief (name and clause set at creation) and not from the library: a
 * style removed from the library since does not break an existing project. Null for a project without design (the interview then opens as
 * before, with the three-track hook). */
export async function ouvertureConcue(db: Db, projectId: number): Promise<{ fiche: Fiche; entreeAccroche: ReturnType<typeof entreeAccroche> } | null> {
  const conception = await lireConception(db, projectId);
  if (!conception) return null;
  const [b] = await db.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  const style = (b?.contenu as BriefContenu | undefined)?.style;
  if (!style?.clause?.trim()) return null;
  return {
    fiche: ficheDepuisConception(conception, { nom: style.nom, clause: style.clause, promptImage: "" }),
    entreeAccroche: entreeAccroche(conception, { nom: style.nom, clause: style.clause }),
  };
}
