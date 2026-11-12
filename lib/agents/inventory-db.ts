import { and, asc, eq, isNull } from "drizzle-orm";
import { agentRuns, assets, plans, propositionChangements, propositions } from "../../db/schema";
import { horsAffiches } from "../assets/assets-visible";
import { ecrireReferencesPlan } from "../h3ir/references-write";
import type { Db } from "./appliers/common";
import { cleNouvelAsset } from "./sheets";
import { codeFinal, controlerReferences, plansDeLEntree, type AssetConnu, type EntreeInventaire, type OptionsRunInventaire, type SortieInventaire } from "./inventory";

/** Each clip's references rendered by the asset inventory (lib/agents/inventory.ts), written to the database. Two moments:
 * - at the task's POST-PROCESSING (worker/agents/postProcessing.ts): the clips whose references all already exist in the registry get them
 *   right away (nothing to create, they can be re-read with the intents); those citing an asset the inventory proposes to create
 *   wait;
 * - at the APPLICATION of the proposal (lib/agents/service.ts, `appliquerSelection`), in the same transaction, AFTER the assets are created:
 *   the rest. An asset that is unticked or refused does not exist: it is simply omitted.
 * Never over references already set (lib/h3ir/references-write.ts); the clips' status does not move. */

export type TacheInventaire = { entree: unknown; options: unknown; resultat: unknown };
export type BilanReferences = { ecrits: number; differes: number; dejaRenseignes: number; sansReference: number };

const PREFIXE_NOUVEL_ASSET = cleNouvelAsset("");

/** The project's assets (excluding posters) with their parent: what the references can cite. */
async function connusDuProjet(d: Db, projectId: number): Promise<AssetConnu[]> {
  const lignes = await d.select({ id: assets.id, code: assets.code, type: assets.type, deriveDeId: assets.deriveDeId }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches));
  const codeDe = new Map(lignes.map((a) => [a.id, a.code]));
  return lignes.map((a) => ({ code: a.code, type: a.type, parent: a.deriveDeId != null ? (codeDe.get(a.deriveDeId) ?? null) : null }));
}

/** A proposal's asset creations that are not yet written (nor refused): they will exist if the proposal is applied.
 * `saufSousTache`: without those of this subtask (it is about to be re-run, its rows will be replaced). */
export async function assetsACreer(d: Db, propositionId: number, options: { saufSousTache?: string } = {}): Promise<(AssetConnu & { description: string })[]> {
  const lignes = await d
    .select({ apres: propositionChangements.apres, sousTache: propositionChangements.sousTache })
    .from(propositionChangements)
    .where(
      and(
        eq(propositionChangements.propositionId, propositionId),
        eq(propositionChangements.cibleType, "asset"),
        eq(propositionChangements.operation, "creer"),
        isNull(propositionChangements.refuseRaison),
        isNull(propositionChangements.appliqueAt),
      ),
    );
  return lignes.flatMap((l) => {
    if (options.saufSousTache && l.sousTache === options.saufSousTache) return [];
    const a = (l.apres ?? {}) as { code?: unknown; type?: unknown; description?: unknown; deriveDeCode?: unknown; deriveDeCle?: unknown };
    if (typeof a.code !== "string" || typeof a.type !== "string") return [];
    const parent = typeof a.deriveDeCode === "string" ? a.deriveDeCode : typeof a.deriveDeCle === "string" && a.deriveDeCle.startsWith(PREFIXE_NOUVEL_ASSET) ? a.deriveDeCle.slice(PREFIXE_NOUVEL_ASSET.length) : null;
    return [{ code: a.code, type: a.type, description: typeof a.description === "string" ? a.description : "", parent, aCreer: true }];
  });
}

/** Writes the references these inventory tasks return. `aCreer`: the proposed assets not yet created; a clip that cites one waits for
 * the application (counted in `differes`). */
export async function ecrireReferencesDesTaches(d: Db, projectId: number, taches: TacheInventaire[], aCreer: AssetConnu[] = []): Promise<BilanReferences> {
  const bilan: BilanReferences = { ecrits: 0, differes: 0, dejaRenseignes: 0, sansReference: 0 };
  const duProjet = await connusDuProjet(d, projectId);
  const enBase = new Set(duProjet.map((a) => a.code));
  const enAttente = aCreer.filter((a) => !enBase.has(a.code));
  const codesEnAttente = new Set(enAttente.map((a) => a.code));
  const connus = [...duProjet, ...enAttente];
  for (const t of taches) {
    const sortie = (t.resultat ?? {}) as SortieInventaire;
    const parPoignee = ((t.options ?? {}) as OptionsRunInventaire).plans ?? {};
    const lesPlans = plansDeLEntree((t.entree ?? {}) as Partial<EntreeInventaire>)
      .filter((p) => typeof parPoignee[p.id] === "string")
      .map((p) => ({ id: p.id, uuid: parPoignee[p.id]!, intention: p.intention }));
    if (lesPlans.length === 0) continue;
    const alias = new Map((sortie.assets ?? []).flatMap((m) => {
      const f = codeFinal(m);
      return f ? [[m.code, f] as [string, string]] : [];
    }));
    const { plans: refs } = controlerReferences(sortie, { plans: lesPlans, connus, alias });
    for (const r of refs) {
      if (r.codes.length === 0) {
        bilan.sansReference += 1;
        continue;
      }
      if (r.codes.some((c) => codesEnAttente.has(c))) {
        bilan.differes += 1;
        continue;
      }
      const [p] = await d.select({ id: plans.id }).from(plans).where(and(eq(plans.uuid, r.uuid), eq(plans.projectId, projectId)));
      if (!p) continue; // clip deleted since
      const e = await ecrireReferencesPlan(d, p.id, r.codes);
      if (e.ok) bilan.ecrits += 1;
      else if (e.raison === "deja-des-references") bilan.dejaRenseignes += 1;
      else bilan.sansReference += 1;
    }
  }
  return bilan;
}

/** The finished tasks of an inventory proposal (the last one per subtask for a split inventory). */
async function tachesTermineesDe(d: Db, propositionId: number): Promise<TacheInventaire[]> {
  const runs = await d
    .select({ cle: agentRuns.cleSousTache, entree: agentRuns.entree, options: agentRuns.options, resultat: agentRuns.resultat })
    .from(agentRuns)
    .where(and(eq(agentRuns.propositionId, propositionId), eq(agentRuns.skill, "inventaire-assets"), eq(agentRuns.statut, "termine")))
    .orderBy(asc(agentRuns.id));
  const parCle = new Map<string, TacheInventaire>();
  for (const r of runs) parCle.set(r.cle ?? "", r);
  return [...parCle.values()];
}

/** On applying an inventory proposal, in ITS transaction, after the assets are created: the references that were waiting. */
export async function ecrireReferencesApresApplication(d: Db, propositionId: number): Promise<BilanReferences> {
  const [prop] = await d.select({ projectId: propositions.projectId, skill: propositions.skill }).from(propositions).where(eq(propositions.id, propositionId));
  if (!prop || prop.skill !== "inventaire-assets") return { ecrits: 0, differes: 0, dejaRenseignes: 0, sansReference: 0 };
  return ecrireReferencesDesTaches(d, prop.projectId, await tachesTermineesDe(d, propositionId));
}

/** The summary sentence of the report, for the proposal's summary. */
export function phraseBilan(b: BilanReferences): string {
  const morceaux = [
    b.ecrits ? `${b.ecrits} plan${b.ecrits > 1 ? "s ont déjà leurs" : " a déjà ses"} références` : "",
    b.differes ? `${b.differes} les ${b.differes > 1 ? "recevront" : "recevra"} à l'application (assets à créer)` : "",
    b.dejaRenseignes ? `${b.dejaRenseignes} en avai${b.dejaRenseignes > 1 ? "ent" : "t"} déjà (gardées)` : "",
  ].filter(Boolean);
  return morceaux.length ? `Références : ${morceaux.join(", ")}.` : "";
}
