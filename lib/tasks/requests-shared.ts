/** Helpers shared by the service-*.ts files (lib/tasks/service.ts was split by topic). */
import { demandes } from "../../db/schema";
import type { EtapeDemande, ContexteIteration, ContexteAjoutPlan, ContexteAjoutScene, ContexteFichePlan, StatutDemande } from "./requests";
import { db } from "../../db";
import { and, eq } from "drizzle-orm";

/** The PILOT of requests (rules in lib/tasks/requests.ts). `piloterDemandes` is called at each turn of the worker's « installer » loop:
 * at most one transition per ongoing request, state in `demandes` (resumes on restart, nothing in memory). A single
 * loop runs it, so there is no race between two pilots. Never touches the GPU: it posts tasks, the lanes take them. */

export type LigneDemande = typeof demandes.$inferSelect;
export const ERR = (erreur: string) => ({ ok: false as const, erreur });

export const lireEtapes = (d: LigneDemande): EtapeDemande[] => (Array.isArray(d.etapes) ? (d.etapes as EtapeDemande[]) : []);
export const lireContexte = (d: LigneDemande): ContexteIteration => d.contexte as ContexteIteration;

/** The briefing when the author gave none: the agent itself proposes the scene that follows on. */
export const CONSIGNE_SCENE_LIBRE = "Propose la scène qui s'enchaîne naturellement entre les deux scènes voisines, à partir du brief.";

export async function ecrire(d: LigneDemande, maj: { etapes?: EtapeDemande[]; contexte?: ContexteIteration | ContexteAjoutPlan | ContexteAjoutScene | ContexteFichePlan; statut?: StatutDemande; erreur?: string | null }): Promise<void> {
  const fin = maj.statut && maj.statut !== "en_cours";
  await db
    .update(demandes)
    .set({
      ...(maj.etapes ? { etapes: maj.etapes } : {}),
      ...(maj.contexte ? { contexte: maj.contexte } : {}),
      ...(maj.statut ? { statut: maj.statut } : {}),
      ...(maj.erreur !== undefined ? { erreur: maj.erreur } : {}),
      ...(fin ? { finishedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(demandes.id, d.id), eq(demandes.statut, "en_cours"))); // a request cancelled in the meantime does not reopen
}
export const occupe = (erreur: string) => /déjà en cours/i.test(erreur);

export const echouer = async (d: LigneDemande, erreur: string): Promise<boolean> => {
  await ecrire(d, { statut: "echoue", erreur: erreur.slice(0, 500) });
  return true;
};
export const annuler = async (d: LigneDemande): Promise<boolean> => {
  await ecrire(d, { statut: "annulee", erreur: null });
  return true;
};
