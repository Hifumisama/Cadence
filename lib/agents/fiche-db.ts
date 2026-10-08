import { eq } from "drizzle-orm";
import { agentConversations, briefs, projects } from "../../db/schema";
import { ecrireBrouillon } from "./brief-db";
import { briefVersFiche, ficheComplete, ficheVersBrief, lireFiche, titreAAdopter, type Fiche } from "./fiche";
import type { Db } from "./applicateurs/commun";
import type { StatutChamp } from "./types";

/** La fiche de notes d'une conversation, avec la base : lue d'abord du brouillon s'il existe (il fait foi : l'utilisateur a pu
 * y corriger une section), sinon de la fiche mémorisée ; écrite dans la conversation, et dans le brouillon dès que la fiche est
 * complète (ou que le brouillon existe déjà). Voir lib/agents/fiche.ts. */

type Conv = { id: number; projectId: number; fiche: unknown };

export async function ficheCourante(db: Db, conv: Conv): Promise<Fiche> {
  const memorisee = lireFiche(conv.fiche);
  const [b] = await db.select({ statut: briefs.statut, contenu: briefs.contenu, statuts: briefs.statuts }).from(briefs).where(eq(briefs.projectId, conv.projectId));
  if (b?.statut === "brouillon") return briefVersFiche({ contenu: b.contenu, statuts: b.statuts as Record<string, string> }, memorisee);
  return memorisee;
}

/** Mémorise la fiche et, si elle est complète (ou si un brouillon existe déjà), la recopie dans le brouillon du brief. Rend vrai
 * quand la fiche est complète. Un brief validé n'est jamais touché. */
export async function enregistrerFiche(db: Db, conv: Conv, fiche: Fiche, nbMessagesUtilisateur: number): Promise<boolean> {
  const complete = ficheComplete(fiche, nbMessagesUtilisateur);
  const ancienne = lireFiche(conv.fiche);
  await db.update(agentConversations).set({ fiche, updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  // Le titre dit ou proposé pendant l'entretien devient le nom du projet (tant qu'on ne l'a pas corrigé à la main) : il sert dès le brief.
  const [courant] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, conv.projectId));
  const titre = courant ? titreAAdopter(fiche, ancienne, courant.nom) : null;
  if (titre) await db.update(projects).set({ nom: titre }).where(eq(projects.id, conv.projectId));
  const [b] = await db.select({ statut: briefs.statut }).from(briefs).where(eq(briefs.projectId, conv.projectId));
  if (b?.statut !== "valide" && (complete || b?.statut === "brouillon")) {
    const [projet] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, conv.projectId));
    const genere = ficheVersBrief(fiche, titre ?? projet?.nom ?? "");
    await ecrireBrouillon(db, conv.projectId, { contenu: genere.contenu, statuts: genere.statuts as Record<string, StatutChamp> });
  }
  return complete;
}
