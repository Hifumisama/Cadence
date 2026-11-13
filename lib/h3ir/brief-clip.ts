import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { assets, briefs, planRefs, plans, projects, scenes } from "../../db/schema";
import { codesEnVoixOff } from "../agents/conversion";
import { langueDesDialogues } from "./dialogue-language";
import { cheminAssetMedia, MEDIA_ROOT } from "../media";
import { briefDepuisPlan, type OptionsBrief, type PersonnageEntree, type ReferenceEntree, type ResultatBrief } from "./brief";
import { resoudreReglages, STYLE_AUCUN, type ReglagesResolus } from "./settings";

/** The absolute path of a file under MEDIA_ROOT if it exists, otherwise null. */
function cheminSiExiste(relatif: string): string | null {
  const absolu = join(MEDIA_ROOT, relatif);
  return existsSync(absolu) ? absolu : null;
}

/** A clip's brief and the settings (creativity, staging style) as they have been resolved, with the level each one comes from. */
export type ResultatChargement = ResultatBrief & { reglages: ReglagesResolus };

/** What « Itérer » compiles INSTEAD OF what is in the database (lib/agents/service.ts, genererReecriturePlan): nothing is written to the clip before
 * the application of the compiled sheet, which writes everything together. `references`: image codes to add / remove; `reglages`: the value of the CLIP
 * that replaces its own (`null`/absent = its own; `"aucun"` = no style), the scene and the project remain inherited below. */
export type SurchargeBrief = {
  description?: string | null;
  dureeSecondes?: number | null;
  references?: { ajouter?: string[]; retirer?: string[] } | null;
  reglages?: { creativite?: string | null; styleCamera?: string | null } | null;
};

/** The image references of a clip AFTER additions / removals (by code): `inconnus` (not in the project's registry), `pasDesImages` (voice),
 * `sansImage` (missing file: the compilation would be refused). Read by the service BEFORE launching the recompilation, for a clear error. */
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

/** Loads what a clip needs (references, scene, characters' voices, language, voiceover) then turns it into the Open H3 IR brief (lib/h3ir/brief.ts).
 * Creativity and staging style: those of `options` if given (`null`/absent = inherits), otherwise those of the clip, its scene or the project (lib/h3ir/settings.ts).
 * `null` if the clip is not of this project. `surcharge`: what « Itérer » compiles INSTEAD OF what is in the database (description, duration, references,
 * clip settings: `SurchargeBrief`), which is only written to the clip with the sheet. An added code unknown to the registry refuses the brief. */
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
  // Reference overrides (« Itérer »): removed images leave, added ones take the free slots (the compiler renumbers
  // the labels; the compiled sheet writes the full list).
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

  // The characters in the registry: the brief only keeps those of the characters who speak in the clip.
  const persos = await db
    .select({ code: assets.code, label: assets.label })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.type, "personnage")));
  const personnages: PersonnageEntree[] = persos;

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
      // A given value wins (the drawer sends the ones chosen there); « aucun » or empty = no style; absent or null = what is resolved in the database.
      creativity: options.creativity ?? reglages.creativite,
      director: options.director ?? reglages.styleCamera ?? STYLE_AUCUN,
    },
  );
  return { ...resultat, reglages };
}
