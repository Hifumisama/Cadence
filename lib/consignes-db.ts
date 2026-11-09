import { and, asc, eq, max } from "drizzle-orm";
import { db } from "../db";
import { consignes, demandes, plans } from "../db/schema";
import { ouvrirConversation } from "./agents/service";
import { deplacer, fusionTropLongue, fusionnerConsignes, fusionnerReglages, MAX_CONSIGNE, verifierConsigne, type ConsigneEnAttente, type Reglages } from "./consignes";
import { lancerDemandeIteration } from "./demandes-db";

/** La file de consignes d'un plan (lecture et écriture ; règles pures dans lib/consignes.ts). Des brouillons : aucune tâche n'est posée avant « Lancer ». */

const ERR = (erreur: string) => ({ ok: false as const, erreur });
type Ok<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

const ligne = (c: typeof consignes.$inferSelect): ConsigneEnAttente => ({ id: c.id, texte: c.texte, reglages: (c.reglages ?? {}) as Reglages, rang: c.rang });

export async function consignesDuPlan(planId: number): Promise<ConsigneEnAttente[]> {
  const l = await db.select().from(consignes).where(eq(consignes.planId, planId)).orderBy(asc(consignes.rang), asc(consignes.id));
  return l.map(ligne);
}

/** Empile une consigne au bout de la file du plan. */
export async function ajouterConsigne(planId: number, texte: string, reglages: Reglages = {}): Promise<Ok<{ consigne: ConsigneEnAttente }>> {
  const v = verifierConsigne(texte);
  if (!v.ok) return v;
  const [p] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, planId));
  if (!p) return ERR("Plan introuvable.");
  const [{ rang } = { rang: null }] = await db.select({ rang: max(consignes.rang) }).from(consignes).where(eq(consignes.planId, planId));
  const [c] = await db.insert(consignes).values({ planId, texte: v.texte, reglages, rang: (rang ?? -1) + 1 }).returning();
  return { ok: true, consigne: ligne(c!) };
}

export async function modifierConsigne(id: number, texte: string): Promise<Ok> {
  const v = verifierConsigne(texte);
  if (!v.ok) return v;
  const r = await db.update(consignes).set({ texte: v.texte }).where(eq(consignes.id, id)).returning({ id: consignes.id });
  return r.length ? { ok: true } : ERR("Cette consigne n'existe plus (elle est peut-être déjà partie).");
}

export async function supprimerConsigne(id: number): Promise<Ok> {
  const r = await db.delete(consignes).where(eq(consignes.id, id)).returning({ id: consignes.id });
  return r.length ? { ok: true } : ERR("Cette consigne n'existe plus (elle est peut-être déjà partie).");
}

/** Monte (−1) ou descend (+1) une consigne dans la file de son plan. */
export async function deplacerConsigne(id: number, sens: -1 | 1): Promise<Ok> {
  const [c] = await db.select({ planId: consignes.planId }).from(consignes).where(eq(consignes.id, id));
  if (!c) return ERR("Cette consigne n'existe plus (elle est peut-être déjà partie).");
  const nouvelle = deplacer(await consignesDuPlan(c.planId), id, sens);
  if (!nouvelle) return { ok: true };
  await db.transaction(async (tx) => {
    for (const [i, x] of nouvelle.entries()) await tx.update(consignes).set({ rang: i }).where(eq(consignes.id, x.id));
  });
  return { ok: true };
}

/** « Lancer » : les consignes du plan, fusionnées, deviennent UNE demande d'itération (un passage de l'agent, un rendu). Les brouillons sont
 * effacés une fois la demande posée ; ils restent lisibles dans son contexte. Refusé (rien ne bouge) si le plan a déjà une demande en cours,
 * si la file est vide ou si la fusion est trop longue. */
export async function lancerConsignesPlan(planId: number): Promise<Ok<{ demandeId: number; nb: number }>> {
  const [p] = await db.select({ id: plans.id, projectId: plans.projectId }).from(plans).where(eq(plans.id, planId));
  if (!p) return ERR("Plan introuvable.");
  const file = await consignesDuPlan(planId);
  if (file.length === 0) return ERR("Aucune consigne en attente sur ce plan.");
  const [enCours] = await db.select({ id: demandes.id }).from(demandes).where(and(eq(demandes.cibleType, "plan"), eq(demandes.cibleId, planId), eq(demandes.statut, "en_cours")));
  if (enCours) return ERR("Une itération est déjà en cours sur ce plan : tes consignes restent en attente, lance-les quand elle sera finie.");
  const textes = file.map((c) => c.texte);
  if (fusionTropLongue(textes)) return ERR(`Les consignes de ce plan, mises bout à bout, dépassent ${MAX_CONSIGNE} caractères : raccourcis-en ou lance-les en deux fois.`);

  const conv = await ouvrirConversation(p.projectId, "plan", { id: planId }, "courte");
  if (!conv.ok) return conv;
  const r = await lancerDemandeIteration(conv.conversationUuid, {
    retour: fusionnerConsignes(textes),
    depuisNumero: null,
    reglages: fusionnerReglages(file.map((c) => c.reglages)),
    consignes: textes,
  });
  if (!r.ok) return r;
  // Seules les consignes lancées sont effacées : une consigne ajoutée entre-temps reste dans la file.
  await db.transaction(async (tx) => {
    for (const c of file) await tx.delete(consignes).where(eq(consignes.id, c.id));
  });
  return { ok: true, demandeId: r.demandeId, nb: file.length };
}
