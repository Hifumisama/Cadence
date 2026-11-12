import { eq } from "drizzle-orm";
import { agentConversations, briefs, projects } from "../../db/schema";
import { ecrireBrouillon } from "./brief-db";
import { briefVersFiche, ficheComplete, ficheVersBrief, lireFiche, titreAAdopter, type Fiche } from "./sheet";
import type { Db } from "./appliers/common";
import type { StatutChamp } from "./types";

/** A conversation's notes sheet, with the database: read first from the draft if it exists (it is authoritative: the user may have
 * corrected a section there), otherwise from the memorised sheet; written into the conversation, and into the draft as soon as the sheet is
 * complete (or the draft already exists). See lib/agents/sheet.ts. */

type Conv = { id: number; projectId: number; fiche: unknown };

export async function ficheCourante(db: Db, conv: Conv): Promise<Fiche> {
  const memorisee = lireFiche(conv.fiche);
  const [b] = await db.select({ statut: briefs.statut, contenu: briefs.contenu, statuts: briefs.statuts }).from(briefs).where(eq(briefs.projectId, conv.projectId));
  if (b?.statut === "brouillon") return briefVersFiche({ contenu: b.contenu, statuts: b.statuts as Record<string, string> }, memorisee);
  return memorisee;
}

/** Memorises the sheet and, if it is complete (or if a draft already exists), copies it into the brief's draft. Returns true
 * when the sheet is complete. A validated brief is never touched. */
export async function enregistrerFiche(db: Db, conv: Conv, fiche: Fiche, messagesUtilisateur: number | readonly string[]): Promise<boolean> {
  const complete = ficheComplete(fiche, messagesUtilisateur);
  const ancienne = lireFiche(conv.fiche);
  await db.update(agentConversations).set({ fiche, updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  // The title said or proposed during the interview becomes the project's name (until it is corrected by hand): it is used from the brief on.
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
