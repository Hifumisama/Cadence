import { and, asc, eq, isNull } from "drizzle-orm";
import { agentRuns, assets, plans, propositionChangements, propositions } from "../../db/schema";
import { horsAffiches } from "../assets-visibles";
import { ecrireReferencesPlan } from "../h3ir/references-ecriture";
import type { Db } from "./applicateurs/commun";
import { cleNouvelAsset } from "./fiches";
import { codeFinal, controlerReferences, plansDeLEntree, type AssetConnu, type EntreeInventaire, type OptionsRunInventaire, type SortieInventaire } from "./inventaire";

/** Les références de chaque plan rendues par l'inventaire des assets (lib/agents/inventaire.ts), écrites en base. Deux moments :
 * - au POST-TRAITEMENT de la tâche (worker/agents/postTraitement.ts) : les plans dont toutes les références existent déjà au registre les
 *   reçoivent tout de suite (rien à créer, elles sont relisibles avec les intents) ; ceux qui citent un asset que l'inventaire propose de créer
 *   attendent ;
 * - à l'APPLICATION de la proposition (lib/agents/service.ts, `appliquerSelection`), dans la même transaction, APRÈS la création des assets :
 *   le reste. Un asset décoché ou refusé n'existe pas : il est simplement omis.
 * Jamais par-dessus des références déjà posées (lib/h3ir/references-ecriture.ts) ; le statut des plans ne bouge pas. */

export type TacheInventaire = { entree: unknown; options: unknown; resultat: unknown };
export type BilanReferences = { ecrits: number; differes: number; dejaRenseignes: number; sansReference: number };

const PREFIXE_NOUVEL_ASSET = cleNouvelAsset("");

/** Les assets du projet (hors affiches) avec leur parent : ce que les références peuvent citer. */
async function connusDuProjet(d: Db, projectId: number): Promise<AssetConnu[]> {
  const lignes = await d.select({ id: assets.id, code: assets.code, type: assets.type, deriveDeId: assets.deriveDeId }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches));
  const codeDe = new Map(lignes.map((a) => [a.id, a.code]));
  return lignes.map((a) => ({ code: a.code, type: a.type, parent: a.deriveDeId != null ? (codeDe.get(a.deriveDeId) ?? null) : null }));
}

/** Les créations d'assets d'une proposition qui ne sont pas encore écrites (ni refusées) : elles existeront si la proposition est appliquée.
 * `saufSousTache` : sans celles de cette sous-tâche (elle va être relancée, ses lignes seront remplacées). */
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

/** Écrit les références que rendent ces tâches d'inventaire. `aCreer` : les assets proposés et pas encore créés ; un plan qui en cite un attend
 * l'application (compté dans `differes`). */
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
      if (!p) continue; // plan supprimé depuis
      const e = await ecrireReferencesPlan(d, p.id, r.codes);
      if (e.ok) bilan.ecrits += 1;
      else if (e.raison === "deja-des-references") bilan.dejaRenseignes += 1;
      else bilan.sansReference += 1;
    }
  }
  return bilan;
}

/** Les tâches terminées d'une proposition d'inventaire (la dernière par sous-tâche pour un inventaire découpé). */
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

/** À l'application d'une proposition d'inventaire, dans SA transaction, après la création des assets : les références qui attendaient. */
export async function ecrireReferencesApresApplication(d: Db, propositionId: number): Promise<BilanReferences> {
  const [prop] = await d.select({ projectId: propositions.projectId, skill: propositions.skill }).from(propositions).where(eq(propositions.id, propositionId));
  if (!prop || prop.skill !== "inventaire-assets") return { ecrits: 0, differes: 0, dejaRenseignes: 0, sansReference: 0 };
  return ecrireReferencesDesTaches(d, prop.projectId, await tachesTermineesDe(d, propositionId));
}

/** La phrase du bilan, pour le résumé de la proposition. */
export function phraseBilan(b: BilanReferences): string {
  const morceaux = [
    b.ecrits ? `${b.ecrits} plan${b.ecrits > 1 ? "s ont déjà leurs" : " a déjà ses"} références` : "",
    b.differes ? `${b.differes} les ${b.differes > 1 ? "recevront" : "recevra"} à l'application (assets à créer)` : "",
    b.dejaRenseignes ? `${b.dejaRenseignes} en avai${b.dejaRenseignes > 1 ? "ent" : "t"} déjà (gardées)` : "",
  ].filter(Boolean);
  return morceaux.length ? `Références : ${morceaux.join(", ")}.` : "";
}
