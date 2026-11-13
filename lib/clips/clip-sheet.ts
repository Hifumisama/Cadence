/** PURE logic of the clip sheet (montage table, 2026-10-12): states of a clip, order and navigation of the attempts, deletion
 * of an attempt and its cascades, count of the previews to launch. No database nor disk access: importable client-side, tested
 * (lib/clips/clip-sheet.test.ts). See docs/FRICTIONS.md, « Fiche de plan : la table de montage » (2026-10-12).
 *
 * Vocabulary: an ATTEMPT is a `jobs` row (a render), numbered by `numeroRendu`; the clip has no number (F03), its
 * position (rank in the episode) is only for display. */

import { notesDecisions, PREFIXE_SANS_ECRITURE } from "../agents/iteration-notes";
import type { DecisionsAffichees, DecisionsIteration } from "../agents/types";

/** The displayed state of a clip, DERIVED (never stored): without attempt = draft; `plans.pret_upscale_at` set = ready to upscale; otherwise
 * in iteration. A new attempt launched on a ready clip puts it back in iteration (the marker is cleared at job creation). */
export type EtatPlan = "brouillon" | "iteration" | "pret";

export const LIBELLE_ETAT_PLAN: Record<EtatPlan, string> = {
  brouillon: "Brouillon",
  iteration: "En itération",
  pret: "Prêt à upscaler",
};

export function etatPlan(p: { nbEssais: number; pretUpscaleAt: Date | string | null }): EtatPlan {
  if (p.nbEssais <= 0) return "brouillon";
  return p.pretUpscaleAt ? "pret" : "iteration";
}

/** An attempt the queue has not finished: we do not delete it, we do not use it as a base. */
export const essaiEnFile = (statut: string): boolean => statut === "en_attente" || statut === "en_cours";

/** Attempts from the newest (top of the column) to the oldest (bottom). The render NUMBER sets the order (never a date); the
 * number itself does not change, only the display is reversed. */
export function trierEssais<T extends { numeroRendu: number }>(essais: readonly T[]): T[] {
  return [...essais].sort((a, b) => b.numeroRendu - a.numeroRendu);
}

/** The attempt neighbouring `idCourant` in the column (▲ = newer, ▼ = older), among those that can be looked at. `null` at the end. */
export function essaiVoisin<T extends { id: number; numeroRendu: number }>(
  lisibles: readonly T[],
  idCourant: number | null,
  sens: "plus-recent" | "plus-ancien",
): T | null {
  const tries = trierEssais(lisibles);
  const i = tries.findIndex((e) => e.id === idCourant);
  if (i < 0) return null;
  return tries[sens === "plus-recent" ? i - 1 : i + 1] ?? null;
}

/** « Essai n°3 · depuis n°2 » (no « depuis » for a first generation or an import). */
export function libelleEssai(numeroRendu: number, depuisNumero: number | null): string {
  return depuisNumero != null ? `Essai n°${numeroRendu} · depuis n°${depuisNumero}` : `Essai n°${numeroRendu}`;
}

/** What the legend and the log say of an attempt that has no instruction (renders from before the montage table, imports). */
export function texteConsigne(e: { consigne: string | null; importe: boolean }): string | null {
  if (e.consigne?.trim()) return e.consigne.trim();
  return e.importe ? "Vidéo importée." : null;
}

// --- the count of previews to launch -------------------------------------------------------------------------------

export type PlanPourPrevisualisation = {
  /** `plans.statut`: « brouillon » = sheet not yet developed. */
  statut: string;
  nbTermines: number;
  /** Jobs queued or running. */
  nbEnFile: number;
};

/** Same sorting as « Toutes les prévisualisations » (app/plans/actions.ts): `neufs` go automatically (sheet developed, no finished render,
 * nothing queued), `avecRendu` already have one, `dejaEnFile` are waiting or running, `brouillons` have no sheet. */
export function classerPourPrevisualisation<T extends PlanPourPrevisualisation & { id: number }>(plans: readonly T[]) {
  const neufs: number[] = [];
  const avecRendu: number[] = [];
  let dejaEnFile = 0;
  let brouillons = 0;
  for (const p of plans) {
    if (p.statut === "brouillon") brouillons++;
    else if (p.statut === "en_cours" || p.nbEnFile > 0) dejaEnFile++;
    else if (p.nbTermines > 0) avecRendu.push(p.id);
    else neufs.push(p.id);
  }
  return { neufs, avecRendu, dejaEnFile, brouillons };
}

/** The clip that follows this one in the episode, by ORDER (`plans.ordre`, never anything else); `null` for the last. The clips arrive
 * already sorted by `ordre`. */
export function planSuivant<T extends { uuid: string }>(plansOrdonnes: readonly T[], uuid: string): T | null {
  const i = plansOrdonnes.findIndex((p) => p.uuid === uuid);
  return i >= 0 ? (plansOrdonnes[i + 1] ?? null) : null;
}

// --- delete an attempt -------------------------------------------------------------------------------------------------------

export type EssaiPourSuppression = {
  id: number;
  numeroRendu: number;
  statut: string;
  cheminSortie: string | null;
  activerUpscale: boolean;
};

export type PlanPourSuppression = {
  renduRetenuId: number | null;
  pretUpscaleAt: Date | null;
  /** `plans.statut` current (the projection of the last job). */
  statut: string;
};

export type ConsequencesSuppression =
  | { ok: false; raison: string }
  | {
      ok: true;
      /** The video file is not referenced by any other attempt of the clip: we also remove it from storage. */
      supprimerFichier: boolean;
      renduRetenuId: number | null;
      pretUpscaleAt: Date | null;
      /** The new displayed state: draft if it was the last attempt, in iteration if it was the kept attempt. */
      etat: EtatPlan;
      /** The `plans.statut` projection to write. */
      statutPlan: string;
    };

/** What deleting the attempt `supprime` changes for the clip (the `restants` are the OTHER attempts of the clip):
 * - refused as long as the attempt is queued or running;
 * - the file leaves storage only if no other attempt references it;
 * - if it was the kept attempt, the clip is no longer ready (back to « en itération »); if it was the last attempt, it becomes a draft again;
 * - the `plans.statut` projection follows the last remaining attempt (nothing new as long as another attempt is queued: it drives it). */
export function consequencesSuppression(plan: PlanPourSuppression, supprime: EssaiPourSuppression, restants: readonly EssaiPourSuppression[]): ConsequencesSuppression {
  if (essaiEnFile(supprime.statut)) return { ok: false, raison: "Cet essai est en file ou en cours : annule-le d'abord, on ne supprime pas un rendu qui tourne." };

  const partage = !!supprime.cheminSortie && restants.some((r) => r.cheminSortie === supprime.cheminSortie);
  const supprimerFichier = !!supprime.cheminSortie && !partage;

  const etaitRetenu = plan.renduRetenuId === supprime.id;
  const renduRetenuId = etaitRetenu || restants.length === 0 ? null : plan.renduRetenuId;
  const pretUpscaleAt = etaitRetenu || restants.length === 0 ? null : plan.pretUpscaleAt;

  let statutPlan = plan.statut;
  if (restants.length === 0) statutPlan = "en_attente";
  else if (!restants.some((r) => essaiEnFile(r.statut))) {
    const dernier = trierEssais(restants)[0]!;
    statutPlan = dernier.statut === "termine" ? (dernier.activerUpscale ? "termine" : "previsualise") : dernier.statut === "echoue" ? "echoue" : plan.statut;
  }
  return { ok: true, supprimerFichier, renduRetenuId, pretUpscaleAt, etat: etatPlan({ nbEssais: restants.length, pretUpscaleAt }), statutPlan };
}

// --- « Itérer »: what to do with the agent's proposal ------------------------------------------------------------------------

/** What the decision reads from an `iteration-plan` proposal (structural subset of `VueProposition`). */
export type PropositionIteration = {
  statut: string;
  erreur: string | null;
  /** The proposal's summary: says why nothing is written when the agent proposes no change. */
  resume?: string | null;
  diagnostic: {
    confiance: string;
    dureeCoherente: boolean;
    abandon: { propose: boolean } | null;
    assetsSuggeres?: { code: string }[];
    decisions?: DecisionsIteration | null;
    affichage?: DecisionsAffichees | null;
  } | null;
  /** `cibleType`: a proposal may also carry asset creations, which « Itérer » never applies. */
  groupes: { changements: { id: number; bloque: boolean; refuseRaison: string | null; cibleType?: string; avertissements: { type: string; texte?: string }[] }[] }[];
};

export type DecisionIteration =
  | { action: "attendre" }
  /** Sole stop of the agent: its task failed (or the proposal was rejected). */
  | { action: "echec"; erreur: string }
  /** No applicable write (diagnosis only, everything blocked or refused): clear message, no attempt is created. */
  | { action: "rien"; message: string }
  /** The iteration agent has DECIDED (intent, duration, references, settings): the sheet is recompiled by Open H3 IR with these decisions, written with
   * it (2026-11-09: always recompile, no more retouching of passages). `notes`: what the agent flagged, kept on the attempt. */
  | { action: "reecrire"; decisions: DecisionsIteration; affichage: DecisionsAffichees | null; notes: string[] }
  /** We apply what passes, then generate, without confirmation. `notes` = what the agent or the checks flagged: kept on the attempt
   * created (the prompt from before stays in the previous attempt, « Repartir de là »), never a block. */
  | { action: "appliquer"; ids: number[]; notes: string[] };

/** « Itérer » is an indivisible transaction (instruction → the agent rewrites → application → generation, decision 2026-10-12, see
 * docs/FRICTIONS.md): the old stops of the review (weak confidence, proposed abandonment, incoherent duration, change blocked or refused,
 * structure alert) become NOTES kept on the attempt. The changes blocked or refused by a check are not applied
 * (we apply those that pass, we flag the others). The only stops: the agent failed, or nothing is applicable. */
export function decisionIteration(p: PropositionIteration | null): DecisionIteration {
  if (!p || p.statut === "en_generation") return { action: "attendre" };
  if (p.statut === "echouee" || p.statut === "annulee") return { action: "echec", erreur: p.erreur ?? "L'agent n'a pas pu proposer de correction." };
  if (p.statut !== "prete") return { action: "attendre" };
  const tous = p.groupes.flatMap((g) => g.changements);
  // « Itérer » writes the sheet AND creates the assets that its rewrite declares missing (decision 2026-10-14, which revises « never created by default »):
  // the sheet already cites them, their image will come after (the render that goes without it is the accepted price). Without an applicable sheet, nothing is created.
  const cestLaFiche = (c: { cibleType?: string }) => c.cibleType === undefined || c.cibleType === "fiche";
  const passe = (c: { bloque: boolean; refuseRaison: string | null }) => !c.bloque && !c.refuseRaison;
  const fiches = tous.filter((c) => passe(c) && cestLaFiche(c));
  const creations = fiches.length > 0 ? tous.filter((c) => passe(c) && c.cibleType === "asset") : [];
  const appliquables = [...fiches, ...creations];
  const creationsLaissees = tous.filter((c) => passe(c) && !cestLaFiche(c) && c.cibleType !== "asset").length;
  // An `iteration-plan` proposal carries no change (2026-11-09): its DECISIONS (diagnosis) are recompiled by Open H3 IR, except when
  // the post-processing said why nothing is written (measured incoherent real duration, abandonment…).
  const sansEcriture = (p.resume ?? "").startsWith(PREFIXE_SANS_ECRITURE);
  if (tous.length === 0 && p.diagnostic?.decisions && !sansEcriture) {
    const notes: string[] = [];
    if (p.diagnostic.confiance === "faible") notes.push("L'agent doutait de son diagnostic.");
    notes.push(...notesDecisions(p.diagnostic.affichage ?? null));
    return { action: "reecrire", decisions: p.diagnostic.decisions, affichage: p.diagnostic.affichage ?? null, notes };
  }
  if (appliquables.length === 0) {
    const refus = [...new Set(tous.map((c) => c.refuseRaison).filter((r): r is string => !!r))];
    const raison = refus.length > 0 ? `${refus.join(" ")} (refusé par un contrôle)` : p.resume?.trim() || (tous.length > 0 ? "tous les changements proposés ont été refusés par un contrôle." : "l'agent ne propose aucun changement du prompt.");
    const phrase = `Rien n'a été appliqué ni généré : ${raison}`;
    return { action: "rien", message: /[.!?…]$/.test(phrase) ? phrase : `${phrase}.` };
  }
  const notes: string[] = [];
  if (p.diagnostic?.confiance === "faible") notes.push("L'agent doutait de son diagnostic.");
  if (p.diagnostic?.abandon?.propose) notes.push("L'agent proposait d'abandonner cette piste.");
  if (p.diagnostic && !p.diagnostic.dureeCoherente) notes.push("La durée du rendu ne correspondait pas à celle du plan.");
  const suggeres = p.diagnostic?.assetsSuggeres ?? [];
  if (suggeres.length > 0) notes.push(`L'agent suggère de créer ${suggeres.map((a) => a.code).join(", ")} (non créé${suggeres.length > 1 ? "s" : ""}) : crée-le, génère son image, puis itère de nouveau.`);
  if (creations.length > 0) notes.push(`${creations.length} asset${creations.length > 1 ? "s" : ""} créé${creations.length > 1 ? "s" : ""} avec la correction et cité${creations.length > 1 ? "s" : ""} par la fiche : ${creations.length > 1 ? "ils n'ont" : "il n'a"} pas encore d'image (à générer avant un rendu qui l${creations.length > 1 ? "es" : "'"}utilise).`);
  if (creationsLaissees > 0) notes.push(`${creationsLaissees} création${creationsLaissees > 1 ? "s" : ""} d'asset suggérée${creationsLaissees > 1 ? "s" : ""} par la réécriture, non créée${creationsLaissees > 1 ? "s" : ""} : crée-${creationsLaissees > 1 ? "les" : "le"} depuis le registre.`);
  const recopies = appliquables.flatMap((c) => c.avertissements.filter((a) => a.type === "info" && /^Mots de ta consigne recopiés/.test(a.texte ?? "")).map((a) => a.texte as string));
  if (recopies.length > 0) notes.push(recopies[0]!);
  const ecartes = tous.length - appliquables.length - creationsLaissees;
  if (ecartes > 0) notes.push(`${ecartes} changement${ecartes > 1 ? "s" : ""} refusé${ecartes > 1 ? "s" : ""} par un contrôle.`);
  if (appliquables.some((c) => c.avertissements.some((a) => a.type === "alerte_controle"))) notes.push("Un contrôle signale une dégradation de structure des shots.");
  return { action: "appliquer", ids: appliquables.map((c) => c.id), notes };
}

