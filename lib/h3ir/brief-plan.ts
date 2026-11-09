import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { assets, briefs, planRefs, plans, projects, scenes } from "../../db/schema";
import { codesEnVoixOff } from "../agents/conversion";
import { langueDesDialogues } from "../langue-dialogues";
import { cheminAssetMedia, cheminVoixMedia, MEDIA_ROOT } from "../media";
import { briefDepuisPlan, type OptionsBrief, type PersonnageEntree, type ReferenceEntree, type ResultatBrief } from "./brief";
import { resoudreReglages, STYLE_AUCUN, type ReglagesResolus } from "./reglages";

/** Le chemin absolu d'un fichier sous MEDIA_ROOT s'il existe, sinon null. */
function cheminSiExiste(relatif: string): string | null {
  const absolu = join(MEDIA_ROOT, relatif);
  return existsSync(absolu) ? absolu : null;
}

/** Le brief d'un plan et les réglages (créativité, style de mise en scène) tels qu'ils ont été résolus, avec le niveau d'où chacun vient. */
export type ResultatChargement = ResultatBrief & { reglages: ReglagesResolus };

/** Charge ce qu'il faut à un plan (références, scène, voix des personnages, langue, voix off) puis en fait le brief Open H3 IR (lib/h3ir/brief.ts).
 * Créativité et style de mise en scène : ceux de `options` s'ils sont donnés (`null`/absent = hérite), sinon ceux du plan, de sa scène ou du projet (lib/h3ir/reglages.ts).
 * `null` si le plan n'est pas de ce projet. `surcharge` : la description (et la durée) à compiler À LA PLACE de celles en base — la réécriture
 * d'« Itérer » compile la nouvelle description, qui ne s'écrit sur le plan qu'avec la fiche. */
export async function chargerBriefPlan(
  projectId: number,
  planUuid: string,
  options: OptionsBrief = {},
  surcharge: { description?: string | null; dureeSecondes?: number | null } = {},
): Promise<ResultatChargement | null> {
  const [plan] = await db
    .select({
      id: plans.id,
      description: plans.description,
      duree: plans.dureeGenerationSecondes,
      seed: plans.seed,
      sceneId: plans.sceneId,
      creativite: plans.creativite,
      styleCamera: plans.styleCamera,
    })
    .from(plans)
    .where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!plan) return null;

  const [scene] =
    plan.sceneId == null
      ? []
      : await db.select({ titre: scenes.titre, ambiance: scenes.ambiance, creativite: scenes.creativite, styleCamera: scenes.styleCamera }).from(scenes).where(eq(scenes.id, plan.sceneId));
  const [projet] = await db.select({ creativite: projects.creativite, styleCamera: projects.styleCamera }).from(projects).where(eq(projects.id, projectId));
  const reglages = resoudreReglages({ projet, scene, plan });

  const lignes = await db
    .select({
      type: planRefs.type,
      slot: planRefs.slot,
      code: assets.code,
      label: assets.label,
      typeAsset: assets.type,
      description: assets.description,
      fichier: assets.fichier,
    })
    .from(planRefs)
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(eq(planRefs.planId, plan.id))
    .orderBy(asc(planRefs.slot));
  const references: ReferenceEntree[] = lignes.map((l) => ({
    type: l.type,
    slot: l.slot,
    code: l.code,
    label: l.label,
    typeAsset: l.typeAsset,
    description: l.description,
    chemin: l.fichier ? cheminSiExiste(cheminAssetMedia(l.fichier)) : null,
  }));

  // Les personnages du registre, avec leur voix fixée (le master) : le brief ne garde que celles des personnages qui parlent dans le plan.
  const persos = await db
    .select({ id: assets.id, code: assets.code, label: assets.label, voixMaster: assets.voixMaster, voixDescription: assets.voixDescription, voixRepliqueBase: assets.voixRepliqueBase })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.type, "personnage")));
  const personnages: PersonnageEntree[] = persos.map((p) => {
    const chemin = p.voixMaster ? cheminSiExiste(cheminVoixMedia(p.id, p.voixMaster)) : null;
    return {
      code: p.code,
      label: p.label,
      voix: chemin
        ? { chemin, sha256: createHash("sha256").update(readFileSync(chemin)).digest("hex"), description: p.voixDescription, repliqueBase: p.voixRepliqueBase }
        : null,
    };
  });

  const [leBrief] = await db.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  const voixOff = codesEnVoixOff(
    (leBrief?.contenu as { personnages?: { nom?: string; voix?: string }[] } | undefined)?.personnages ?? [],
    persos.map((p) => p.code),
  );

  const resultat = briefDepuisPlan(
    {
      plan: { description: surcharge.description?.trim() || (plan.description ?? ""), dureeSecondes: surcharge.dureeSecondes ?? plan.duree, seed: plan.seed },
      scene: scene ? { titre: scene.titre, ambiance: scene.ambiance } : null,
      langueDialogues: await langueDesDialogues(projectId),
      codesVoixOff: [...voixOff],
      personnages,
      references,
    },
    {
      ...options,
      // Une valeur donnée l'emporte (le tiroir envoie celles qu'on y a choisies) ; « aucun » ou vide = pas de style ; absente ou null = ce qui est résolu en base.
      creativity: options.creativity ?? reglages.creativite,
      director: options.director ?? reglages.styleCamera ?? STYLE_AUCUN,
    },
  );
  return { ...resultat, reglages };
}
