import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "../../db";
import { agentRuns, assetGenerations, assets, demandes, planRefs, plans } from "../../db/schema";
import type { Db } from "../agents/appliers/common";
import { horsAffiches } from "../assets/assets-visible";
import { poserGenerationsLot } from "../assets/generation-launch";
import { cheminAssetMedia, MEDIA_ROOT } from "../media";
import { estEtapeFinale, type ContexteFichePlan, type EtapeDemande } from "../tasks/requests";
import { ecrireReferencesPlan } from "./references-write";
import { decisionSortieReferencesPlan, precedentEnAttente, type EtatImageAsset } from "./preparation";

/** The reads and writes of a clip's PREPARATION (pure rules: lib/h3ir/preparation.ts; driver: lib/tasks/requests-db.ts). */

const fichierPresent = (f: string | null): boolean => !!f && existsSync(join(MEDIA_ROOT, cheminAssetMedia(f)));

/** The codes of a clip's CURRENT visual references (images, videos), in slot order. */
export async function codesRefsVisuelles(planId: number): Promise<string[]> {
  const l = await db
    .select({ code: assets.code })
    .from(planRefs)
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(and(eq(planRefs.planId, planId), ne(planRefs.type, "audio")))
    .orderBy(asc(planRefs.type), asc(planRefs.slot));
  return l.map((x) => x.code);
}

/** The state of the expected images (these codes), plus the MASTER of an editing derivative that does not yet have an image (without it the derivative does not go).
 * `depuis`: only generations that failed since this date count (an old failed generation does not block: one is relaunched). */
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

/** Queues the images of these assets (default prompt and format of their type, AUTOMATIC ADOPTION: lib/assets/generation-launch.ts). Those set aside
 * (already queued, master without an image…) are relaunched on the next round. */
export async function lancerImagesAssets(projectId: number, codes: string[]): Promise<{ lancees: number; ecartes: { code: string; raison: string }[] }> {
  if (codes.length === 0) return { lancees: 0, ecartes: [] };
  const lus = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, codes)));
  if (lus.length === 0) return { lancees: 0, ecartes: [] };
  const r = await poserGenerationsLot(projectId, lus.map((a) => a.id));
  return r.ok ? { lancees: r.lancees, ecartes: r.ecartes.map((e) => ({ code: e.code, raison: e.raison })) } : { lancees: 0, ecartes: [] };
}

/** Are this clip's references finished in its request (step `references` done or passed)? A request without this step counts as finished. */
const referencesFinies = (etapes: EtapeDemande[]): boolean => {
  const e = etapes.find((x) => x.cle === "references");
  return !e || estEtapeFinale(e);
};

/** Does a clip EARLIER in the screenplay order (same episode) have a sheet request in progress that has not finished its references? The set continuation
 * (« suite » clip) reads the references of the previous clip, and the missing ones of a clip become the candidates of the next one: they are chosen in order. */
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

/** The assets that the OTHER sheet requests in progress in the project have created for their clip (they are in the registry, still without an image): the skill's
 * `assetsProposesParLeLot` entry (it may cite them, never propose them again). */
export async function assetsCreesParLeLot(projectId: number, saufDemandeId: number): Promise<{ code: string; type: string }[]> {
  const lignes = await db.select({ id: demandes.id, contexte: demandes.contexte }).from(demandes).where(and(eq(demandes.projectId, projectId), eq(demandes.type, "fiche-plan"), eq(demandes.statut, "en_cours")));
  const codes = [...new Set(lignes.filter((l) => l.id !== saufDemandeId).flatMap((l) => (l.contexte as ContexteFichePlan).preparation?.assetsCrees ?? []))];
  if (codes.length === 0) return [];
  return db.select({ code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, codes)));
}

/** A project's registry (posters excluded): code and type. */
export async function registreCodesTypes(d: Db, projectId: number): Promise<{ code: string; type: string }[]> {
  return d.select({ code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches));
}

/** At APPLICATION of a `references-plan` proposal (in its transaction, after the missing ones are created): the skill's references, created assets
 * included, are written onto the clip (`remplacer` if the request asked for it). Never the `plans` table. */
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

