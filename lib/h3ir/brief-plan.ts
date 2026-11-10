import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
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

/** Ce qu'« Itérer » fait compiler À LA PLACE de ce qui est en base (lib/agents/service.ts, genererReecriturePlan) : rien n'est écrit sur le plan avant
 * l'application de la fiche compilée, qui écrit tout ensemble. `references` : codes d'images à ajouter / retirer ; `reglages` : la valeur du PLAN qui
 * remplace la sienne (`null`/absent = la sienne ; `"aucun"` = pas de style), la scène et le projet restent hérités en dessous. */
export type SurchargeBrief = {
  description?: string | null;
  dureeSecondes?: number | null;
  references?: { ajouter?: string[]; retirer?: string[] } | null;
  reglages?: { creativite?: string | null; styleCamera?: string | null } | null;
};

/** Les références d'image d'un plan APRÈS des ajouts / retraits (par code) : `inconnus` (pas au registre du projet), `pasDesImages` (voix),
 * `sansImage` (fichier absent : la compilation serait refusée). Lu par le service AVANT de lancer la recompilation, pour une erreur claire. */
export async function referencesApresDecisions(
  projectId: number,
  planUuid: string,
  ops: { ajouter?: string[]; retirer?: string[] },
): Promise<{ codes: string[]; inconnus: string[]; pasDesImages: string[]; sansImage: string[] } | null> {
  const [plan] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!plan) return null;
  const actuelles = await db
    .select({ type: planRefs.type, code: assets.code, fichier: assets.fichier })
    .from(planRefs)
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(eq(planRefs.planId, plan.id));
  const retires = new Set(ops.retirer ?? []);
  const gardees = actuelles.filter((r) => r.type !== "audio" && !retires.has(r.code));
  const voulus = [...new Set(ops.ajouter ?? [])].filter((c) => !gardees.some((g) => g.code === c));
  const ajoutes = voulus.length ? await db.select({ code: assets.code, type: assets.type, fichier: assets.fichier }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, voulus))) : [];
  const inconnus = voulus.filter((c) => !ajoutes.some((a) => a.code === c));
  const pasDesImages = ajoutes.filter((a) => a.type === "voix").map((a) => a.code);
  const finales = [...gardees, ...ajoutes.filter((a) => !pasDesImages.includes(a.code))];
  const sansImage = finales.filter((r) => !r.fichier || !cheminSiExiste(cheminAssetMedia(r.fichier))).map((r) => r.code);
  return { codes: finales.map((r) => r.code), inconnus, pasDesImages, sansImage };
}

/** Charge ce qu'il faut à un plan (références, scène, voix des personnages, langue, voix off) puis en fait le brief Open H3 IR (lib/h3ir/brief.ts).
 * Créativité et style de mise en scène : ceux de `options` s'ils sont donnés (`null`/absent = hérite), sinon ceux du plan, de sa scène ou du projet (lib/h3ir/reglages.ts).
 * `null` si le plan n'est pas de ce projet. `surcharge` : ce qu'« Itérer » compile À LA PLACE de ce qui est en base (description, durée, références,
 * réglages du plan : `SurchargeBrief`), qui ne s'écrit sur le plan qu'avec la fiche. Un code ajouté inconnu du registre refuse le brief. */
export async function chargerBriefPlan(
  projectId: number,
  planUuid: string,
  options: OptionsBrief = {},
  surcharge: SurchargeBrief = {},
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
  const reglagesPlan = {
    creativite: surcharge.reglages?.creativite ?? plan.creativite,
    styleCamera: surcharge.reglages?.styleCamera ?? plan.styleCamera,
  };
  const reglages = resoudreReglages({ projet, scene, plan: reglagesPlan });

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
  const versEntree = (l: (typeof lignes)[number]): ReferenceEntree => ({
    type: l.type,
    slot: l.slot,
    code: l.code,
    label: l.label,
    typeAsset: l.typeAsset,
    description: l.description,
    chemin: l.fichier ? cheminSiExiste(cheminAssetMedia(l.fichier)) : null,
  });
  // Surcharge des références (« Itérer ») : les images retirées sortent, les ajoutées suivent aux emplacements libres (le compilateur renumérote
  // les labels ; la fiche compilée écrit la liste complète).
  const retires = new Set(surcharge.references?.retirer ?? []);
  const gardees = lignes.filter((l) => l.type === "audio" || !retires.has(l.code));
  const voulus = [...new Set(surcharge.references?.ajouter ?? [])].filter((c) => !gardees.some((g) => g.type !== "audio" && g.code === c));
  const ajoutes = voulus.length
    ? await db
        .select({ code: assets.code, label: assets.label, typeAsset: assets.type, description: assets.description, fichier: assets.fichier })
        .from(assets)
        .where(and(eq(assets.projectId, projectId), inArray(assets.code, voulus)))
    : [];
  const inconnus = voulus.filter((c) => !ajoutes.some((a) => a.code === c));
  if (inconnus.length > 0) return { brief: null, refus: `Références inconnues du registre : ${inconnus.join(", ")}.`, avertissements: [], liens: [], reglages };
  let slot = Math.max(0, ...gardees.filter((l) => l.type !== "audio").map((l) => l.slot));
  const references: ReferenceEntree[] = [...gardees.map(versEntree), ...ajoutes.map((a) => versEntree({ ...a, type: "picture", slot: ++slot }))];

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
