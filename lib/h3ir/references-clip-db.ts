import { and, asc, desc, eq, lt } from "drizzle-orm";
import { assets, briefs, planRefs, plans, scenes } from "../../db/schema";
import type { Db } from "../agents/appliers/common";
import { horsAffiches } from "../assets/assets-visible";
import { liaisonOuDefaut } from "../clips/clip-link";
import { choisirReferences, type CandidatReference, type EntreeReferencesPlan, type ResultatReferencesPlan } from "./references-clip";

/** Le choix des références d'un plan, lu en base (étape 5 d'Open H3 IR) : charge le plan, sa scène, sa liaison, le décor du plan précédent, le registre
 * et les `plan_refs` actuelles, puis appelle la règle pure (lib/h3ir/references-clip.ts). Lecture seule : rien n'est écrit (la préparation d'un plan,
 * lib/tasks/requests-db.ts, écrit le choix ou pose le skill en cas de doute). */

type DonneesReferencesPlan = {
  plan: { id: number; uuid: string; projectId: number; titre: string; dureeSecondes: number; liaison: string };
  scene: { titre: string; ambiance: string | null } | null;
  entree: EntreeReferencesPlan;
  /** Les références visuelles actuelles du plan (`plan_refs`, hors audio), dans l'ordre des emplacements. */
  existantes: string[];
};

export type ChoixReferencesPlan = ResultatReferencesPlan &
  Omit<DonneesReferencesPlan, "entree"> & {
    /** Le décor du plan précédent quand il sert (suite dans la même scène), pour l'entrée du skill. */
    decorPrecedent: string | null;
    /** Vrai quand le choix du code est exactement la liste actuelle (mêmes codes, même ordre). */
    identiqueAuxExistantes: boolean;
    /** Les références choisies dont l'asset n'a pas encore d'image : le plan ne se compile pas avant (images d'abord, décision du 2026-11-01). */
    sansImage: string[];
    /** Le registre lu (sans affiches), pour l'entrée du skill. */
    candidats: CandidatReference[];
  };

async function chargerDonneesReferencesPlan(db: Db, planId: number): Promise<DonneesReferencesPlan | null> {
  const [p] = await db
    .select({
      id: plans.id,
      uuid: plans.uuid,
      projectId: plans.projectId,
      episodeId: plans.episodeId,
      ordre: plans.ordre,
      titre: plans.titre,
      description: plans.description,
      liaison: plans.liaison,
      sceneId: plans.sceneId,
      duree: plans.dureeGenerationSecondes,
    })
    .from(plans)
    .where(eq(plans.id, planId));
  if (!p) return null;

  const [scene] = p.sceneId == null ? [] : await db.select({ titre: scenes.titre, ambiance: scenes.ambiance }).from(scenes).where(eq(scenes.id, p.sceneId));

  const registre = await db
    .select({ id: assets.id, code: assets.code, type: assets.type, label: assets.label, description: assets.description, fichier: assets.fichier, deriveDeId: assets.deriveDeId })
    .from(assets)
    .where(and(eq(assets.projectId, p.projectId), horsAffiches))
    .orderBy(asc(assets.code));
  const codeParId = new Map(registre.map((a) => [a.id, a.code]));
  const candidats: CandidatReference[] = registre
    .map((a) => ({
      code: a.code,
      type: a.type,
      label: a.label,
      description: a.description,
      parent: a.deriveDeId != null ? (codeParId.get(a.deriveDeId) ?? null) : null,
      aUneImage: !!a.fichier,
    }));

  // Le plan précédent dans l'ORDRE du scénario (jamais une position) : sa scène et son décor actuel (sa première référence de type décor).
  const [prec] = await db
    .select({ id: plans.id, sceneId: plans.sceneId })
    .from(plans)
    .where(and(eq(plans.episodeId, p.episodeId), lt(plans.ordre, p.ordre)))
    .orderBy(desc(plans.ordre))
    .limit(1);
  const [decorPrec] = prec
    ? await db
        .select({ code: assets.code })
        .from(planRefs)
        .innerJoin(assets, eq(assets.id, planRefs.assetId))
        .where(and(eq(planRefs.planId, prec.id), eq(assets.type, "decor")))
        .orderBy(asc(planRefs.slot))
        .limit(1)
    : [];

  const [b] = await db.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, p.projectId));
  const elements = ((b?.contenu as { elements?: { nom?: string; nature?: string }[] } | undefined)?.elements ?? [])
    .filter((e) => e.nom?.trim() && e.nature)
    .map((e) => ({ nom: e.nom!, nature: e.nature! }));

  const actuelles = await db
    .select({ code: assets.code, typeRef: planRefs.type })
    .from(planRefs)
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(eq(planRefs.planId, p.id))
    .orderBy(asc(planRefs.slot));

  return {
    plan: { id: p.id, uuid: p.uuid, projectId: p.projectId, titre: p.titre, dureeSecondes: p.duree, liaison: liaisonOuDefaut(p.liaison) },
    scene: scene ? { titre: scene.titre, ambiance: scene.ambiance } : null,
    entree: {
      description: p.description ?? "",
      liaison: liaisonOuDefaut(p.liaison),
      precedent: prec ? { memeScene: p.sceneId != null && prec.sceneId === p.sceneId, decor: decorPrec?.code ?? null } : null,
      candidats,
      elements,
    },
    existantes: actuelles.filter((r) => r.typeRef !== "audio").map((r) => r.code),
  };
}

/** Les références que le code choisit pour un plan, ses doutes (`suffit = false` : à confier au skill `references-plan`) et la comparaison avec les
 * `plan_refs` actuelles. `null` si le plan n'existe pas. */
export async function choisirReferencesPlan(db: Db, planId: number): Promise<ChoixReferencesPlan | null> {
  const d = await chargerDonneesReferencesPlan(db, planId);
  if (!d) return null;
  const r = choisirReferences(d.entree);
  const image = new Map(d.entree.candidats.map((c) => [c.code, c.aUneImage]));
  const p = d.entree.precedent;
  return {
    ...r,
    plan: d.plan,
    scene: d.scene,
    existantes: d.existantes,
    decorPrecedent: p && d.entree.liaison === "suite" && p.memeScene ? p.decor : null,
    identiqueAuxExistantes: r.references.length === d.existantes.length && r.references.every((x, i) => x.code === d.existantes[i]),
    sansImage: r.references.filter((x) => !image.get(x.code)).map((x) => x.code),
    candidats: d.entree.candidats,
  };
}
