import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, propositionChangements, propositions } from "../../db/schema";
import { applicateurDe, refusSansApplicateur } from "./appliers";
import type { CtxAppli, CtxPrevisu } from "./appliers/common";
import { clesParent, ordonnerParDependances, type ChangementBrut, type LigneChangement } from "./changes";
import { cocheParDefaut, estBloque } from "./checking";
import { verifierPortee, type ScopeDemandee } from "./scope";
import type { Avertissement, CibleType, EcrasementAConfirmer, Operation, Position, ResultatApplication } from "./types";
import type { Tx } from "../clips/clip-order";

/** Database layer of the proposals: enrich the raw changes with the current state, record
 * them (default ticking, scope lock, explicit refusals), then apply the selection IN ONE transaction. See docs/CONCEPTION_AGENTS.md §14. */

type DbOuTx = typeof db | Tx;

/** Impact sentence of a proposal (displayed before application). */
export function resumeAutomatique(lignes: { operation: Operation; cibleType: CibleType; refuseRaison: string | null }[]): string {
  const utiles = lignes.filter((l) => !l.refuseRaison);
  if (lignes.length === 0) return "Aucun changement proposé.";
  const n = (op: Operation) => utiles.filter((l) => l.operation === op).length;
  const morceaux = [
    n("creer") ? `${n("creer")} création${n("creer") > 1 ? "s" : ""}` : "",
    n("modifier") ? `${n("modifier")} modification${n("modifier") > 1 ? "s" : ""}` : "",
    n("supprimer") ? `${n("supprimer")} suppression${n("supprimer") > 1 ? "s" : ""}` : "",
    lignes.length - utiles.length ? `${lignes.length - utiles.length} refusé${lignes.length - utiles.length > 1 ? "s" : ""} d'office` : "",
  ].filter(Boolean);
  return `${lignes.length} changement${lignes.length > 1 ? "s" : ""} proposé${lignes.length > 1 ? "s" : ""} : ${morceaux.join(", ")}.`;
}

/** `sousTache`: a subtask of a BATCH writes and replaces only ITS rows (the other
 * subtasks do not move), starting from `baseOrdre`; the proposal's status is then not
 * touched (it is `finaliserLot` that decides it when all subtasks are closed). */
export type OptionsEnregistrement = { sousTache?: string; baseOrdre?: number };

/** A change enriched by its applier (current state, overwrite, warnings, refusal), ready to be recorded. */
type ChangementEnrichi = Omit<typeof propositionChangements.$inferInsert, "propositionId" | "ordre" | "sousTache">;

/** Enriches the raw changes (current state, overwrites, checks), applies the scope lock and computes the default ticking. READ ONLY: writes nothing. Used by
 * `enregistrerChangements` and by the episode review (the findings of a decision).
 * `clesExistantes`: the keys of creations already proposed elsewhere (the other subtasks of a batch). */
async function enrichirChangements(
  tx: DbOuTx,
  projectId: number,
  scope: ScopeDemandee,
  bruts: ChangementBrut[],
  clesExistantes: Iterable<string> = [],
): Promise<ChangementEnrichi[]> {
  const clesNouvelles = new Set([...bruts.map((b) => b.cle).filter((c): c is string => !!c), ...clesExistantes]);
  const ctx: CtxPrevisu = { projectId, scope, clesNouvelles };
  const refusees = new Set<string>();
  const lignes: ChangementEnrichi[] = [];

  for (const brut of bruts) {
    const applicateur = applicateurDe(brut.cibleType);
    let c: ChangementBrut = { ...brut, avertissements: [...(brut.avertissements ?? [])] };

    if (!applicateur) {
      c.refuseRaison = refusSansApplicateur(brut.cibleType);
    } else {
      c = await applicateur.previsualiser(tx, ctx, c);
      if (!c.refuseRaison) {
        const cible = await applicateur.cible(tx, ctx, { operation: c.operation, cibleRef: c.cibleRef, apres: c.apres });
        if (typeof cible === "string") c.refuseRaison = cible;
        else {
          const raison = verifierPortee(scope, cible);
          if (raison) {
            c.refuseRaison = raison;
            c.avertissements = [...(c.avertissements ?? []), { type: "hors_portee", texte: raison }];
          }
        }
      }
    }
    // A child whose proposed parent is refused is refused too: it would have nowhere to be born.
    if (!c.refuseRaison && clesParent(c.apres).some((cle) => refusees.has(cle))) {
      c.refuseRaison = "Le parent proposé par la même proposition est refusé : ce changement n'aurait nulle part où s'appliquer.";
    }
    if (c.refuseRaison && c.cle) refusees.add(c.cle);

    const avertissements = (c.avertissements ?? []) as Avertissement[];
    lignes.push({
      sousGroupe: c.sousGroupe ?? null,
      groupe: c.groupe,
      cle: c.cle ?? null,
      cibleType: c.cibleType,
      cibleRef: c.cibleRef,
      libelle: c.libelle,
      operation: c.operation,
      avant: c.avant ?? null,
      apres: c.apres ?? null,
      position: (c.position ?? null) as Position | null,
      avertissements,
      ecrase: c.ecrase ?? null,
      coche: cocheParDefaut({ operation: c.operation, avertissements, ecrase: c.ecrase ?? null, refuseRaison: c.refuseRaison ?? null, office: c.cocheOffice === true }),
      refuseRaison: c.refuseRaison ?? null,
    });
  }
  return lignes;
}

/** Enriches the raw changes (see `enrichirChangements`) and RECORDS them; the proposal becomes `prete`.
 * Replaces any existing rows (refinement / regeneration). */
export async function enregistrerChangements(
  tx: DbOuTx,
  propositionId: number,
  projectId: number,
  scope: ScopeDemandee,
  bruts: ChangementBrut[],
  options: OptionsEnregistrement = {},
): Promise<void> {
  const clesExistantes: string[] = [];
  if (options.sousTache) {
    // Batch: the creations already proposed by the OTHER subtasks are part of the proposal (a missing asset
    // of a clip may derive from an asset whose creation another clip of the batch proposes).
    const autres = await tx
      .select({ cle: propositionChangements.cle, sousTache: propositionChangements.sousTache, refuse: propositionChangements.refuseRaison })
      .from(propositionChangements)
      .where(eq(propositionChangements.propositionId, propositionId));
    for (const a of autres) if (a.cle && a.sousTache !== options.sousTache && !a.refuse) clesExistantes.push(a.cle);
  }
  const enrichis = await enrichirChangements(tx, projectId, scope, bruts, clesExistantes);
  const lignes: (typeof propositionChangements.$inferInsert)[] = enrichis.map((e, ordre) => ({
    ...e,
    propositionId,
    ordre: (options.baseOrdre ?? 0) + ordre,
    sousTache: options.sousTache ?? null,
  }));

  if (options.sousTache) {
    await tx
      .delete(propositionChangements)
      .where(and(eq(propositionChangements.propositionId, propositionId), eq(propositionChangements.sousTache, options.sousTache)));
    if (lignes.length) await tx.insert(propositionChangements).values(lignes);
    return;
  }
  await tx.delete(propositionChangements).where(eq(propositionChangements.propositionId, propositionId));
  if (lignes.length) await tx.insert(propositionChangements).values(lignes);
  await tx
    .update(propositions)
    .set({
      statut: "prete",
      resume: resumeAutomatique(lignes.map((l) => ({ operation: l.operation as Operation, cibleType: l.cibleType as CibleType, refuseRaison: l.refuseRaison ?? null }))),
      erreur: null,
    })
    .where(eq(propositions.id, propositionId));
}

class RefusApplication extends Error {}

function ligne(r: typeof propositionChangements.$inferSelect): LigneChangement {
  return {
    id: r.id,
    propositionId: r.propositionId,
    ordre: r.ordre,
    groupe: r.groupe,
    cle: r.cle,
    cibleType: r.cibleType as CibleType,
    cibleRef: r.cibleRef,
    libelle: r.libelle,
    operation: r.operation as Operation,
    avant: r.avant,
    apres: r.apres,
    position: (r.position ?? null) as Position | null,
    avertissements: (r.avertissements ?? []) as Avertissement[],
    ecrase: r.ecrase,
    coche: r.coche,
    refuseRaison: r.refuseRaison,
    sousGroupe: r.sousGroupe,
  };
}

/** Applies a proposal's selection in ONE transaction (all or nothing). Requires the
 * explicit confirmation of an overwrite; refuses out of scope; refuses a change whose
 * proposed parent is not kept. `appliquee` if all the changes were, `partielle`
 * if some were dropped, blocked or refused. */
export async function appliquerProposition(
  propositionId: number,
  options: {
    confirmeEcrasement?: boolean;
    /** Runs in the SAME transaction, after the writes: if it fails, nothing is applied ("Itérer": application + creation of the attempt). */
    dansTransaction?: (tx: Tx) => Promise<void>;
  } = {},
): Promise<ResultatApplication> {
  const [prop] = await db.select().from(propositions).where(eq(propositions.id, propositionId));
  if (!prop) return { ok: false, erreur: "Proposition introuvable." };
  if (prop.statut !== "prete") return { ok: false, erreur: `Cette proposition n'est plus applicable (statut : ${prop.statut}).` };

  const toutes = (await db.select().from(propositionChangements).where(eq(propositionChangements.propositionId, propositionId)).orderBy(asc(propositionChangements.ordre))).map(ligne);
  const retenus = ordonnerParDependances(toutes.filter((c) => c.coche && !c.refuseRaison && !estBloque(c.avertissements)));
  if (retenus.length === 0) return { ok: false, erreur: "Aucun changement n'est sélectionné." };

  const ecrasements: EcrasementAConfirmer[] = retenus.filter((c) => c.ecrase).map((c) => ({ changementId: c.id, libelle: c.libelle, ecrase: c.ecrase as string }));
  if (ecrasements.length > 0 && !options.confirmeEcrasement) {
    return {
      ok: false,
      erreur: `La sélection écrase ${ecrasements.length} élément${ecrasements.length > 1 ? "s" : ""} validé${ecrasements.length > 1 ? "s" : ""} : confirme l'écrasement pour continuer.`,
      confirmationRequise: ecrasements,
    };
  }

  const scope: ScopeDemandee = { type: prop.portee as ScopeDemandee["type"], cibleId: prop.cibleId };
  const clesRetenues = new Set(retenus.map((c) => c.cle).filter((c): c is string => !!c));

  try {
    await db.transaction(async (tx) => {
      const ctx: CtxAppli = { projectId: prop.projectId, scope, cles: new Map() };
      for (const c of retenus) {
        const manquant = clesParent(c.apres).find((cle) => !clesRetenues.has(cle));
        if (manquant) throw new RefusApplication(`« ${c.libelle} » dépend d'un élément proposé (${manquant}) qui n'est pas retenu.`);
        const applicateur = applicateurDe(c.cibleType);
        if (!applicateur) throw new RefusApplication(`« ${c.libelle} » : ${refusSansApplicateur(c.cibleType)}`);
        const cible = await applicateur.cible(tx, ctx, c);
        if (typeof cible === "string") throw new RefusApplication(`« ${c.libelle} » : ${cible}`);
        const raison = verifierPortee(scope, cible);
        if (raison) throw new RefusApplication(`« ${c.libelle} » : ${raison}`);
        const refus = await applicateur.verifier(tx, ctx, c);
        if (refus) throw new RefusApplication(`« ${c.libelle} » : ${refus}`);
        await applicateur.appliquer(tx, ctx, c);
        await tx.update(propositionChangements).set({ appliqueAt: new Date() }).where(eq(propositionChangements.id, c.id));
      }
      const statut = retenus.length === toutes.length ? "appliquee" : "partielle";
      await tx.update(propositions).set({ statut, appliedAt: new Date() }).where(eq(propositions.id, propositionId));
      if (prop.conversationId != null) {
        await tx.update(agentConversations).set({ etape: "applique", updatedAt: new Date() }).where(and(eq(agentConversations.id, prop.conversationId), eq(agentConversations.propositionId, propositionId)));
      }
      if (options.dansTransaction) await options.dansTransaction(tx);
    });
  } catch (e) {
    if (e instanceof RefusApplication) return { ok: false, erreur: `Rien n'a été appliqué. ${e.message}` };
    throw e;
  }
  const appliques = retenus.length;
  const refuses = toutes.filter((c) => c.refuseRaison).length;
  return { ok: true, statut: appliques === toutes.length ? "appliquee" : "partielle", appliques, ecartes: toutes.length - appliques - refuses, refuses };
}
