import { and, asc, desc, eq, lt } from "drizzle-orm";
import { assets, briefs, planRefs, plans, scenes } from "../../db/schema";
import type { Db } from "../agents/appliers/common";
import { horsAffiches } from "../assets/assets-visible";
import { liaisonOuDefaut } from "../clips/clip-link";
import { choisirReferences, type CandidatReference, type EntreeReferencesPlan, type ResultatReferencesPlan } from "./references-clip";

/** The choice of a clip's references, read from the database (step 5 of Open H3 IR): loads the clip, its scene, its link, the previous clip's set, the registry
 * and the current `plan_refs`, then calls the pure rule (lib/h3ir/references-clip.ts). Read-only: nothing is written (the preparation of a clip,
 * lib/tasks/requests-db.ts, writes the choice or poses the skill in case of doubt). */

type DonneesReferencesPlan = {
  plan: { id: number; uuid: string; projectId: number; titre: string; dureeSecondes: number; liaison: string };
  scene: { titre: string; ambiance: string | null } | null;
  entree: EntreeReferencesPlan;
  /** The clip's current visual references (`plan_refs`, not audio), in slot order. */
  existantes: string[];
};

export type ChoixReferencesPlan = ResultatReferencesPlan &
  Omit<DonneesReferencesPlan, "entree"> & {
    /** The previous clip's set when it serves (sequel in the same scene), for the skill's entry. */
    decorPrecedent: string | null;
    /** True when the code's choice is exactly the current list (same codes, same order). */
    identiqueAuxExistantes: boolean;
    /** The chosen references whose asset does not yet have an image: the clip does not compile before that (images first, decision of 2026-11-01). */
    sansImage: string[];
    /** The registry read (without posters), for the skill's entry. */
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

  // The previous clip in the screenplay ORDER (never a position): its scene and its current set (its first reference of type decor).
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

/** The references the code chooses for a clip, its doubts (`suffit = false`: to be handed to the `references-plan` skill) and the comparison with the
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
