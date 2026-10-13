/** Logique PURE de la fiche de plan (table de montage, 2026-10-12) : états d'un plan, ordre et navigation des essais, suppression
 * d'un essai et ses cascades, compte des prévisualisations à lancer. Aucun accès base ni disque : importable côté client, testée
 * (lib/fiche-plan.test.ts). Voir docs/FRICTIONS.md, « Fiche de plan : la table de montage » (2026-10-12).
 *
 * Vocabulaire : un ESSAI est une ligne de `jobs` (un rendu), numéroté par `numeroRendu` ; le plan n'a pas de numéro (F03), sa
 * position (rang dans l'épisode) ne sert qu'à l'affichage. */

/** L'état affiché d'un plan, DÉRIVÉ (jamais stocké) : sans essai = brouillon ; `plans.pret_upscale_at` posé = prêt à upscaler ; sinon en
 * itération. Un nouvel essai lancé sur un plan prêt le remet en itération (le marqueur est effacé à la création du job). */
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

/** Un essai que la file n'a pas fini : on ne le supprime pas, on ne s'en sert pas comme base. */
export const essaiEnFile = (statut: string): boolean => statut === "en_attente" || statut === "en_cours";

/** Les essais du plus récent (haut de la colonne) au plus ancien (bas). Le NUMÉRO de rendu fait l'ordre (jamais une date) ; le
 * numéro lui-même ne change pas, seul l'affichage est inversé. */
export function trierEssais<T extends { numeroRendu: number }>(essais: readonly T[]): T[] {
  return [...essais].sort((a, b) => b.numeroRendu - a.numeroRendu);
}

/** L'essai voisin de `idCourant` dans la colonne (▲ = plus récent, ▼ = plus ancien), parmi ceux qu'on peut regarder. `null` au bout. */
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

/** « Essai n°3 · depuis n°2 » (pas de « depuis » pour une première génération ou un import). */
export function libelleEssai(numeroRendu: number, depuisNumero: number | null): string {
  return depuisNumero != null ? `Essai n°${numeroRendu} · depuis n°${depuisNumero}` : `Essai n°${numeroRendu}`;
}

/** Ce que la légende et le journal disent d'un essai qui n'a pas de consigne (rendus d'avant la table de montage, imports). */
export function texteConsigne(e: { consigne: string | null; importe: boolean }): string | null {
  if (e.consigne?.trim()) return e.consigne.trim();
  return e.importe ? "Vidéo importée." : null;
}

/** Ajoute une suggestion cliquable à la consigne en cours (« plus serré » après « Plus dynamique » → « Plus dynamique, plus serré »). */
export function ajouterSuggestion(texte: string, suggestion: string): string {
  const t = texte.trim();
  if (!t) return suggestion;
  return `${t.replace(/[.,;\s]+$/, "")}, ${suggestion.charAt(0).toLowerCase()}${suggestion.slice(1)}`;
}

export const SUGGESTIONS_CONSIGNE = ["Plus dynamique", "Plus serré", "Plus lent", "Lumière plus chaude", "Plus sombre"] as const;

// --- le compte des prévisualisations à lancer -------------------------------------------------------------------------------

export type PlanPourPrevisualisation = {
  /** `plans.statut` : « brouillon » = fiche pas encore développée. */
  statut: string;
  nbTermines: number;
  /** Jobs en file ou en cours. */
  nbEnFile: number;
};

/** Même classement que « Toutes les prévisualisations » (app/plans/actions.ts) : `neufs` partent d'office (fiche développée, aucun rendu
 * terminé, rien en file), `avecRendu` en ont déjà un, `dejaEnFile` attendent ou tournent, `brouillons` n'ont pas de fiche. */
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

/** Le « N » du bouton « Générer les prévisualisations (N) » : les plans qui n'ont aucun rendu et qui peuvent en recevoir un. */
export function compterAPrevisualiser(plans: readonly PlanPourPrevisualisation[]): number {
  return classerPourPrevisualisation(plans.map((p, id) => ({ ...p, id }))).neufs.length;
}

// --- l'avancée vers l'upscale -------------------------------------------------------------------------------------------------

export function avanceeUpscale(etats: readonly EtatPlan[]): { prets: number; total: number; pourcent: number; tousPrets: boolean } {
  const total = etats.length;
  const prets = etats.filter((e) => e === "pret").length;
  return { prets, total, pourcent: total ? Math.round((100 * prets) / total) : 0, tousPrets: total > 0 && prets === total };
}

/** Le plan qui suit celui-ci dans l'épisode, par l'ORDRE (`plans.ordre`, jamais autre chose) ; `null` pour le dernier. Les plans arrivent
 * déjà triés par `ordre`. */
export function planSuivant<T extends { uuid: string }>(plansOrdonnes: readonly T[], uuid: string): T | null {
  const i = plansOrdonnes.findIndex((p) => p.uuid === uuid);
  return i >= 0 ? (plansOrdonnes[i + 1] ?? null) : null;
}

// --- supprimer un essai -------------------------------------------------------------------------------------------------------

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
  /** `plans.statut` actuel (la projection du dernier job). */
  statut: string;
};

export type ConsequencesSuppression =
  | { ok: false; raison: string }
  | {
      ok: true;
      /** Le fichier vidéo n'est référencé par aucun autre essai du plan : on l'enlève aussi du stockage. */
      supprimerFichier: boolean;
      renduRetenuId: number | null;
      pretUpscaleAt: Date | null;
      /** Le nouvel état affiché : brouillon si c'était le dernier essai, en itération si c'était l'essai retenu. */
      etat: EtatPlan;
      /** La projection `plans.statut` à écrire. */
      statutPlan: string;
    };

/** Ce que supprimer l'essai `supprime` change pour le plan (les `restants` sont les AUTRES essais du plan) :
 * - refusé tant que l'essai est en file ou en cours ;
 * - le fichier part du stockage seulement si aucun autre essai ne le référence ;
 * - si c'était l'essai retenu, le plan n'est plus prêt (retour « en itération ») ; si c'était le dernier essai, il redevient brouillon ;
 * - la projection `plans.statut` suit le dernier essai restant (rien de neuf tant qu'un autre essai est en file : il la pilote). */
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

// --- « Itérer » : que faire de la proposition de l'agent ------------------------------------------------------------------------

/** Ce que la décision lit d'une proposition `iteration-plan` (sous-ensemble structurel de `VueProposition`). */
export type PropositionIteration = {
  statut: string;
  erreur: string | null;
  /** Le résumé de la proposition : dit pourquoi rien n'est écrit quand l'agent ne propose aucun changement. */
  resume?: string | null;
  diagnostic: { confiance: string; dureeCoherente: boolean; abandon: { propose: boolean } | null; assetsSuggeres?: { code: string }[]; reecriture?: { description: string } | null } | null;
  /** `cibleType` : une proposition `plan-h3` (réécriture du plan) porte aussi des créations d'assets, que « Itérer » n'applique jamais. */
  groupes: { changements: { id: number; bloque: boolean; refuseRaison: string | null; cibleType?: string; avertissements: { type: string; texte?: string }[] }[] }[];
};

export type DecisionIteration =
  | { action: "attendre" }
  /** Seul arrêt de l'agent : sa tâche a échoué (ou la proposition a été rejetée). */
  | { action: "echec"; erreur: string }
  /** Aucune écriture appliquable (diagnostic seul, tout bloqué ou refusé) : message clair, aucun essai n'est créé. */
  | { action: "rien"; message: string }
  /** La consigne change ce qui se passe dans le plan : on ne retouche pas des passages, la fiche est RÉÉCRITE (plan-h3, depuis cette nouvelle description). */
  | { action: "reecrire"; description: string }
  /** On applique ce qui passe, puis on génère, sans confirmation. `notes` = ce que l'agent ou les contrôles ont signalé : gardé sur l'essai
   * créé (le prompt d'avant reste dans l'essai précédent, « Repartir de là »), jamais un blocage. */
  | { action: "appliquer"; ids: number[]; notes: string[] };

/** « Itérer » est une transaction indissociable (consigne → l'agent réécrit → application → génération, décision 2026-10-12, voir
 * docs/FRICTIONS.md) : les anciens arrêts de la revue (confiance faible, abandon proposé, durée incohérente, changement bloqué ou refusé,
 * alerte de structure) deviennent des NOTES gardées sur l'essai. Les changements bloqués ou refusés par un contrôle ne sont pas appliqués
 * (on applique ceux qui passent, on signale les autres). Les seuls arrêts : l'agent a échoué, ou rien n'est appliquable. */
export function decisionIteration(p: PropositionIteration | null): DecisionIteration {
  if (!p || p.statut === "en_generation") return { action: "attendre" };
  if (p.statut === "echouee" || p.statut === "rejetee") return { action: "echec", erreur: p.erreur ?? "L'agent n'a pas pu proposer de correction." };
  if (p.statut !== "prete") return { action: "attendre" };
  const tous = p.groupes.flatMap((g) => g.changements);
  // « Itérer » n'écrit que la fiche : les créations d'assets d'une réécriture restent proposées, jamais créées d'office.
  const cestLaFiche = (c: { cibleType?: string }) => c.cibleType === undefined || c.cibleType === "fiche";
  const appliquables = tous.filter((c) => !c.bloque && !c.refuseRaison && cestLaFiche(c));
  const creationsLaissees = tous.filter((c) => !c.bloque && !c.refuseRaison && !cestLaFiche(c)).length;
  if (appliquables.length === 0 && p.diagnostic?.reecriture?.description) return { action: "reecrire", description: p.diagnostic.reecriture.description };
  if (appliquables.length === 0) {
    const raison = p.resume?.trim() || (tous.length > 0 ? "tous les changements proposés ont été refusés par un contrôle." : "l'agent ne propose aucun changement du prompt.");
    const phrase = `Rien n'a été appliqué ni généré : ${raison}`;
    return { action: "rien", message: /[.!?…]$/.test(phrase) ? phrase : `${phrase}.` };
  }
  const notes: string[] = [];
  if (p.diagnostic?.confiance === "faible") notes.push("L'agent doutait de son diagnostic.");
  if (p.diagnostic?.abandon?.propose) notes.push("L'agent proposait d'abandonner cette piste.");
  if (p.diagnostic && !p.diagnostic.dureeCoherente) notes.push("La durée du rendu ne correspondait pas à celle du plan.");
  const suggeres = p.diagnostic?.assetsSuggeres ?? [];
  if (suggeres.length > 0) notes.push(`L'agent suggère de créer ${suggeres.map((a) => a.code).join(", ")} (non créé${suggeres.length > 1 ? "s" : ""}) : crée-le, génère son image, puis itère de nouveau.`);
  if (creationsLaissees > 0) notes.push(`${creationsLaissees} création${creationsLaissees > 1 ? "s" : ""} d'asset suggérée${creationsLaissees > 1 ? "s" : ""} par la réécriture, non créée${creationsLaissees > 1 ? "s" : ""} : crée-${creationsLaissees > 1 ? "les" : "le"} depuis le registre.`);
  if (appliquables.some((c) => c.avertissements.some((a) => a.type === "info" && /l'état de fin du plan a changé/i.test(a.texte ?? "")))) notes.push("L'état de fin du plan a changé : le plan suivant n'a pas été revérifié.");
  const ecartes = tous.length - appliquables.length - creationsLaissees;
  if (ecartes > 0) notes.push(`${ecartes} changement${ecartes > 1 ? "s" : ""} refusé${ecartes > 1 ? "s" : ""} par un contrôle.`);
  if (appliquables.some((c) => c.avertissements.some((a) => a.type === "alerte_controle"))) notes.push("Un contrôle signale une dégradation de structure des shots.");
  return { action: "appliquer", ids: appliquables.map((c) => c.id), notes };
}

/** Les passages « avant → après » d'un changement de fiche (corrections partielles), pour la revue compacte. */
export function passagesDeChangement(apres: unknown): { section: string; avant: string; apres: string }[] {
  if (!apres || typeof apres !== "object") return [];
  const brut = (apres as { passages?: unknown }).passages;
  if (!Array.isArray(brut)) return [];
  return brut.filter(
    (p): p is { section: string; avant: string; apres: string } =>
      !!p && typeof p === "object" && typeof (p as { section?: unknown }).section === "string" && typeof (p as { avant?: unknown }).avant === "string" && typeof (p as { apres?: unknown }).apres === "string",
  );
}
