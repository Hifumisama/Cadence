import { db } from "../db";
import {
  assets,
  jobs,
  mouvements,
  planDialogues,
  planPromptSections,
  planRefs,
  plans,
} from "../db/schema";
import { desc, eq, ne } from "drizzle-orm";

export type ShotListItem = {
  numero: number;
  titre: string;
  statut: string;
  dernierJob: { tentative: number; erreur: string | null } | null;
};

/** Frise Shots : tous les plans, ordonnés par numéro — les trous des plans
 * supprimés restent visibles, jamais renumérotés (F03). */
export async function getShotsList(): Promise<ShotListItem[]> {
  // Un plan brouillon n'a pas encore de fiche de plan (pas de prompt, pas de
  // durée de génération) : il vit dans Scénario, pas dans la queue Shots.
  const rows = await db.select().from(plans).where(ne(plans.statut, "brouillon")).orderBy(plans.numero);
  const allJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt));

  const dernierJobParPlan = new Map<number, (typeof allJobs)[number]>();
  for (const job of allJobs) {
    if (!dernierJobParPlan.has(job.planId)) dernierJobParPlan.set(job.planId, job);
  }

  return rows.map((p) => ({
    numero: p.numero,
    titre: p.titre,
    statut: p.statut,
    dernierJob: dernierJobParPlan.has(p.id)
      ? {
          tentative: dernierJobParPlan.get(p.id)!.tentative,
          erreur: dernierJobParPlan.get(p.id)!.erreur,
        }
      : null,
  }));
}

/** Fiche de plan complète : plan + prompt sectionné + refs (avec l'asset
 * associé) + dialogues + historique des jobs. */
export async function getPlanDetail(numero: number) {
  const plan = await db.query.plans.findFirst({
    where: eq(plans.numero, numero),
  });
  if (!plan) return null;

  const [promptSections, refs, dialogues, jobHistory] = await Promise.all([
    db
      .select()
      .from(planPromptSections)
      .where(eq(planPromptSections.planId, plan.id))
      .orderBy(planPromptSections.ordre),
    db
      .select({
        id: planRefs.id,
        type: planRefs.type,
        slot: planRefs.slot,
        role: planRefs.role,
        retention: planRefs.retention,
        asset: assets,
      })
      .from(planRefs)
      .leftJoin(assets, eq(planRefs.assetId, assets.id))
      .where(eq(planRefs.planId, plan.id)),
    db
      .select()
      .from(planDialogues)
      .where(eq(planDialogues.planId, plan.id))
      .orderBy(planDialogues.slot),
    db
      .select()
      .from(jobs)
      .where(eq(jobs.planId, plan.id))
      .orderBy(desc(jobs.createdAt)),
  ]);

  return { plan, promptSections, refs, dialogues, jobHistory };
}

/** Tous les assets (27 sur l'épisode 1) — pour peupler le sélecteur d'ajout
 * de référence sur la Fiche de plan. */
export async function getAllAssets() {
  return db.select().from(assets).orderBy(assets.type, assets.code);
}

/** Page Scénario : les mouvements narratifs, et tous les plans (brouillon
 * compris) groupés par mouvement — un plan sans mouvementId atterrit dans
 * le groupe "sans mouvement" plutôt que d'être perdu. */
export async function getScenarioData() {
  const [tousLesMouvements, tousLesPlans] = await Promise.all([
    db.select().from(mouvements).orderBy(mouvements.ordre),
    db.select().from(plans).orderBy(plans.numero),
  ]);

  const parMouvement = new Map<number, typeof tousLesPlans>();
  const sansMouvement: typeof tousLesPlans = [];
  for (const plan of tousLesPlans) {
    if (plan.mouvementId == null) {
      sansMouvement.push(plan);
      continue;
    }
    const liste = parMouvement.get(plan.mouvementId) ?? [];
    liste.push(plan);
    parMouvement.set(plan.mouvementId, liste);
  }

  return {
    mouvements: tousLesMouvements.map((m) => ({
      ...m,
      plans: parMouvement.get(m.id) ?? [],
    })),
    sansMouvement,
    prochainNumeroLibre: tousLesPlans.reduce((acc, p) => Math.max(acc, p.numero), 0) + 10,
  };
}

export type AssetNode = Awaited<ReturnType<typeof getAssetsTree>>[number];

/** Registre d'assets en arborescence par sujet (masters + dérivés), pas par
 * type — demande explicite de l'utilisateur (2026-09-27) : le type reste un
 * simple tag informatif, le regroupement se fait sur deriveDeId. */
export async function getAssetsTree() {
  const tousLesAssets = await db.select().from(assets).orderBy(assets.code);
  const toutesLesRefs = await db
    .select({ assetId: planRefs.assetId, planId: planRefs.planId })
    .from(planRefs);
  const tousLesPlans = await db.select({ id: plans.id, numero: plans.numero }).from(plans);

  const numeroParPlanId = new Map(tousLesPlans.map((p) => [p.id, p.numero]));
  const plansParAssetId = new Map<number, number[]>();
  for (const ref of toutesLesRefs) {
    if (ref.assetId == null) continue;
    const numero = numeroParPlanId.get(ref.planId);
    if (numero == null) continue;
    const liste = plansParAssetId.get(ref.assetId) ?? [];
    if (!liste.includes(numero)) liste.push(numero);
    plansParAssetId.set(ref.assetId, liste);
  }

  const enfantsParParentId = new Map<number, typeof tousLesAssets>();
  for (const asset of tousLesAssets) {
    if (asset.deriveDeId == null) continue;
    const liste = enfantsParParentId.get(asset.deriveDeId) ?? [];
    liste.push(asset);
    enfantsParParentId.set(asset.deriveDeId, liste);
  }

  type AssetAvecDerives = (typeof tousLesAssets)[number] & {
    plansCitants: number[];
    derives: AssetAvecDerives[];
  };

  function construireNoeud(asset: (typeof tousLesAssets)[number]): AssetAvecDerives {
    return {
      ...asset,
      plansCitants: (plansParAssetId.get(asset.id) ?? []).sort((a, b) => a - b),
      derives: (enfantsParParentId.get(asset.id) ?? [])
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(construireNoeud),
    };
  }

  return tousLesAssets.filter((a) => a.deriveDeId == null).map(construireNoeud);
}
