import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "../../db";
import { agentRuns, assetGenerations, assets, demandes, planRefs, plans } from "../../db/schema";
import type { Db } from "../agents/applicateurs/commun";
import { horsAffiches } from "../assets-visibles";
import { poserGenerationsLot } from "../generation-lancement";
import { cheminAssetMedia, MEDIA_ROOT } from "../media";
import { estEtapeFinale, type ContexteFichePlan, type EtapeDemande } from "../demandes";
import { ecrireReferencesPlan } from "./references-ecriture";
import { decisionSortieReferencesPlan, precedentEnAttente, type EtatImageAsset } from "./preparation";

/** Les lectures et écritures de la PRÉPARATION d'un plan (règles pures : lib/h3ir/preparation.ts ; pilote : lib/demandes-db.ts). */

const fichierPresent = (f: string | null): boolean => !!f && existsSync(join(MEDIA_ROOT, cheminAssetMedia(f)));

/** Les codes des références VISUELLES actuelles d'un plan (images, vidéos), dans l'ordre des emplacements. */
export async function codesRefsVisuelles(planId: number): Promise<string[]> {
  const l = await db
    .select({ code: assets.code })
    .from(planRefs)
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(and(eq(planRefs.planId, planId), ne(planRefs.type, "audio")))
    .orderBy(asc(planRefs.type), asc(planRefs.slot));
  return l.map((x) => x.code);
}

/** L'état des images attendues (ces codes), plus le MASTER d'un dérivé en édition qui n'a pas encore d'image (sans lui le dérivé ne part pas).
 * `depuis` : seules les générations en échec depuis cette date comptent (une vieille génération échouée ne bloque pas : on en relance une). */
export async function etatImagesAssets(projectId: number, codes: string[], depuis: Date): Promise<EtatImageAsset[]> {
  if (codes.length === 0) return [];
  const tous = await db
    .select({ id: assets.id, code: assets.code, label: assets.label, type: assets.type, fichier: assets.fichier, prompt: assets.promptGeneration, methode: assets.methodeGeneration, deriveDeId: assets.deriveDeId })
    .from(assets)
    .where(eq(assets.projectId, projectId));
  const parCode = new Map(tous.map((a) => [a.code, a]));
  const parId = new Map(tous.map((a) => [a.id, a]));
  const voulus: typeof tous = [];
  const ajouter = (a: (typeof tous)[number] | undefined) => {
    if (!a || voulus.some((v) => v.id === a.id)) return;
    voulus.push(a);
    if (a.methode === "edition" && a.deriveDeId != null && !fichierPresent(a.fichier)) {
      const master = parId.get(a.deriveDeId);
      if (master && !fichierPresent(master.fichier)) ajouter(master);
    }
  };
  for (const c of codes) ajouter(parCode.get(c));
  const ids = voulus.map((a) => a.id);
  const gens = ids.length
    ? await db
        .select({ assetId: assetGenerations.assetId, statut: assetGenerations.statut, erreur: assetGenerations.erreur, createdAt: assetGenerations.createdAt })
        .from(assetGenerations)
        .where(inArray(assetGenerations.assetId, ids))
        .orderBy(desc(assetGenerations.createdAt), desc(assetGenerations.id))
    : [];
  return voulus.map((a) => {
    const siennes = gens.filter((g) => g.assetId === a.id);
    const enFile = siennes.some((g) => g.statut === "en_attente" || g.statut === "en_cours" || g.statut === "traduction");
    const derniere = siennes[0];
    const echec = derniere && derniere.statut === "echoue" && derniere.createdAt >= depuis ? (derniere.erreur ?? "échec sans message") : null;
    return {
      code: a.code,
      nom: a.label?.trim() || a.code,
      aFichier: fichierPresent(a.fichier),
      aPrompt: !!(a.prompt ?? "").trim(),
      enFile,
      echec,
    };
  });
}

/** Met en file les images de ces assets (prompt et format par défaut de leur type, ADOPTION AUTOMATIQUE : lib/generation-lancement.ts). Les écartés
 * (déjà en file, master sans image…) se relancent au tour suivant. */
export async function lancerImagesAssets(projectId: number, codes: string[]): Promise<{ lancees: number; ecartes: { code: string; raison: string }[] }> {
  if (codes.length === 0) return { lancees: 0, ecartes: [] };
  const lus = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, codes)));
  if (lus.length === 0) return { lancees: 0, ecartes: [] };
  const r = await poserGenerationsLot(projectId, lus.map((a) => a.id));
  return r.ok ? { lancees: r.lancees, ecartes: r.ecartes.map((e) => ({ code: e.code, raison: e.raison })) } : { lancees: 0, ecartes: [] };
}

/** Les références de ce plan sont-elles finies dans sa demande (étape `references` faite ou passée) ? Une demande sans cette étape (plan-h3) compte comme finie. */
const referencesFinies = (etapes: EtapeDemande[]): boolean => {
  const e = etapes.find((x) => x.cle === "references");
  return !e || estEtapeFinale(e);
};

/** Un plan PLUS TÔT dans l'ordre du scénario (même épisode) a-t-il une demande de fiche en cours qui n'a pas fini ses références ? La reprise du décor
 * (plan « suite ») lit les références du plan précédent, et les manquants d'un plan deviennent les candidats du suivant : on les choisit dans l'ordre. */
export async function attendUnPlanPrecedent(planId: number): Promise<boolean> {
  const [p] = await db.select({ episodeId: plans.episodeId, ordre: plans.ordre }).from(plans).where(eq(plans.id, planId));
  if (!p) return false;
  const autres = await db
    .select({ etapes: demandes.etapes, ordre: plans.ordre })
    .from(demandes)
    .innerJoin(plans, and(eq(demandes.cibleType, "plan"), eq(plans.id, demandes.cibleId)))
    .where(and(eq(demandes.type, "fiche-plan"), eq(demandes.statut, "en_cours"), eq(plans.episodeId, p.episodeId), lt(plans.ordre, p.ordre)));
  return precedentEnAttente(
    p.ordre,
    autres.map((a) => ({ ordre: a.ordre, referencesFinies: referencesFinies(Array.isArray(a.etapes) ? (a.etapes as EtapeDemande[]) : []) })),
  );
}

/** Les assets que les AUTRES demandes de fiche en cours du projet ont créés pour leur plan (ils sont au registre, sans image encore) : l'entrée
 * `assetsProposesParLeLot` du skill (il peut les citer, jamais les reproposer). */
export async function assetsCreesParLeLot(projectId: number, saufDemandeId: number): Promise<{ code: string; type: string }[]> {
  const lignes = await db.select({ id: demandes.id, contexte: demandes.contexte }).from(demandes).where(and(eq(demandes.projectId, projectId), eq(demandes.type, "fiche-plan"), eq(demandes.statut, "en_cours")));
  const codes = [...new Set(lignes.filter((l) => l.id !== saufDemandeId).flatMap((l) => (l.contexte as ContexteFichePlan).preparation?.assetsCrees ?? []))];
  if (codes.length === 0) return [];
  return db.select({ code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, codes)));
}

/** Le registre d'un projet (hors affiches) : code et type. */
export async function registreCodesTypes(d: Db, projectId: number): Promise<{ code: string; type: string }[]> {
  return d.select({ code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches));
}

/** À l'APPLICATION d'une proposition `references-plan` (dans sa transaction, après la création des manquants) : les références du skill, assets créés
 * compris, sont écrites sur le plan (`remplacer` si la demande l'a voulu). Jamais la table `plans`. */
export async function ecrireReferencesDuSkill(d: Db, propositionId: number, runId: number | null): Promise<void> {
  if (runId == null) return;
  const [run] = await d.select({ projectId: agentRuns.projectId, resultat: agentRuns.resultat, options: agentRuns.options, entree: agentRuns.entree }).from(agentRuns).where(eq(agentRuns.id, runId));
  if (!run?.projectId) return;
  const planId = (run.options as { planId?: number } | null)?.planId;
  if (planId == null) return;
  const sortie = (run.resultat ?? {}) as Parameters<typeof decisionSortieReferencesPlan>[0];
  const { references } = decisionSortieReferencesPlan(sortie, await registreCodesTypes(d, run.projectId));
  if (references.length === 0) return;
  await ecrireReferencesPlan(d, planId, references, { remplacer: (run.options as { rechoisir?: boolean } | null)?.rechoisir === true });
}

