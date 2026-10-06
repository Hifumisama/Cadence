import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { assets, jobs, planRefs, plans } from "../db/schema";

/** Un plan est « périmé » quand son DERNIER rendu terminé est antérieur à l'image (ou au son) d'une de ses références :
 * le plan a été rendu avec une version de l'asset qui n'existe plus (pas de versionnage, F01 : adopter remplace le fichier).
 * Un plan jamais rendu n'est pas périmé — il n'a rien de dépassé. */
export type PlanPerime = {
  planId: number;
  /** Assets modifiés depuis le dernier rendu, par code. */
  codes: string[];
};

type Filtre = { projectId: number } | { planIds: number[] } | { assetId: number };

/** Plans périmés. `assetId` : ceux qui citent cet asset (la fiche d'asset) ; `planIds` : ceux de la liste ; `projectId` : tous. */
export async function getPlansPerimes(filtre: Filtre): Promise<Map<number, PlanPerime>> {
  let planIds: number[];
  if ("planIds" in filtre) planIds = filtre.planIds;
  else if ("assetId" in filtre) {
    planIds = (await db.select({ id: planRefs.planId }).from(planRefs).where(eq(planRefs.assetId, filtre.assetId))).map((r) => r.id);
  } else {
    planIds = (await db.select({ id: plans.id }).from(plans).where(eq(plans.projectId, filtre.projectId))).map((r) => r.id);
  }
  const resultat = new Map<number, PlanPerime>();
  if (planIds.length === 0) return resultat;

  // Début du dernier rendu terminé de chaque plan : c'est à ce moment que le worker a lu les références.
  const rendus = await db
    .select({ planId: jobs.planId, debut: jobs.startedAt, cree: jobs.createdAt })
    .from(jobs)
    .where(and(inArray(jobs.planId, planIds), eq(jobs.statut, "termine")))
    .orderBy(desc(jobs.finishedAt), desc(jobs.id));
  const dernierRendu = new Map<number, Date>();
  for (const r of rendus) if (!dernierRendu.has(r.planId)) dernierRendu.set(r.planId, r.debut ?? r.cree);
  if (dernierRendu.size === 0) return resultat;

  const refs = await db
    .select({ planId: planRefs.planId, code: assets.code, fichierAt: assets.fichierAt })
    .from(planRefs)
    .innerJoin(assets, eq(planRefs.assetId, assets.id))
    .where(and(inArray(planRefs.planId, [...dernierRendu.keys()]), isNotNull(assets.fichierAt)));
  for (const ref of refs) {
    const rendu = dernierRendu.get(ref.planId);
    if (!rendu || !ref.fichierAt || ref.fichierAt <= rendu) continue;
    const p = resultat.get(ref.planId) ?? { planId: ref.planId, codes: [] };
    if (!p.codes.includes(ref.code)) p.codes.push(ref.code);
    resultat.set(ref.planId, p);
  }
  return resultat;
}

/** Plans rendus au moins une fois qui citent cet asset : ceux que le remplacement de son image périmerait. */
export async function nbPlansRendusCitant(assetId: number): Promise<number> {
  const ids = (await db.select({ id: planRefs.planId }).from(planRefs).where(eq(planRefs.assetId, assetId))).map((r) => r.id);
  if (ids.length === 0) return 0;
  const rendus = await db
    .selectDistinct({ planId: jobs.planId })
    .from(jobs)
    .where(and(inArray(jobs.planId, ids), eq(jobs.statut, "termine")));
  return rendus.length;
}
