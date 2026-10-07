import { eq, sql } from "drizzle-orm";
import { briefs, conceptions, projects } from "../db/schema";
import type { Db } from "./agents/applicateurs/commun";
import { briefVide } from "./agents/brief";
import { synchroniserClauseStyle } from "./agents/brief-db";
import type { BriefContenu } from "./agents/types";
import { validerConception, type Conception, type StyleResolu } from "./conception";

/** Accès base de la conception d'un projet (voir lib/conception.ts pour le contenu et les règles). */

/** La conception d'un projet, ou null s'il n'en a pas (projet créé avant la conception) ou si la ligne est illisible. L'identifiant d'un
 * style de la bibliothèque n'est PAS revérifié contre la bibliothèque : l'utilisateur peut avoir retiré ce style depuis, le projet garde
 * son choix. */
export async function lireConception(db: Db, projectId: number): Promise<Conception | null> {
  const [ligne] = await db.select({ contenu: conceptions.contenu }).from(conceptions).where(eq(conceptions.projectId, projectId));
  if (!ligne) return null;
  const style = (ligne.contenu as { style?: { source?: string; styleId?: string } } | null)?.style;
  const bibliotheque = style?.source === "bibliotheque" && style.styleId ? [{ id: style.styleId }] : [];
  const r = validerConception(ligne.contenu, bibliotheque);
  return r.ok ? r.valeur : null;
}

/** Enregistre la conception (une par projet, remplacée à chaque écriture). */
export async function ecrireConception(db: Db, projectId: number, conception: Conception): Promise<void> {
  await db
    .insert(conceptions)
    .values({ projectId, contenu: conception })
    .onConflictDoUpdate({ target: conceptions.projectId, set: { contenu: conception, updatedAt: new Date() } });
}

/** Pose le style de la conception dans le brief PARTIEL du projet (statut « fourni » : ce que l'utilisateur a choisi gagne sur ce que
 * l'agent rédigera), puis recopie la clause et le prompt long dans le projet. Crée le brief partiel s'il n'existe pas ; refuse de
 * toucher un brief déjà validé ou en brouillon (le style se change alors par la page du brief). */
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
