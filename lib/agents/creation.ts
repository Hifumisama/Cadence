/** THE INSTALLER: the creation of a project end to end, without intermediate validation (2026-10-03, feedback from the
 * general test). Once the briefing is ready, a single request chains all the steps; each one is generated THEN
 * applied on its own, and progress is followed on a dedicated page. PURE rules (steps, state, decision): the
 * reads, writes and service calls are in lib/agents/creation-db.ts, driven by the worker
 * (one loop turn = at most one transition per creation: resumed on restart, nothing in memory).
 *
 * The only undo of a creation is deleting the project: so we only apply what is ticked
 * outright (creations; an overwrite is unticked by default and is never confirmed here).
 *
 * A SINGLE PHASE (2026-11-09, wave 4b): the creation goes from the brief to the screenplay review, then STOPS (status `termine`): we review
 * the clips' intents (a sheet written on a wrong intent costs a render and an iteration for nothing) while the reference images
 * are being made. Sheets are NO LONGER creation steps: "Écrire les fiches" posts one `fiche-plan` request per clip
 * (`lancerDemandesFiches`, lib/tasks/requests-*.ts), independent of the creation. Reason: while a creation is running, worker/images.ts
 * holds back the project's images; sheets kept as creation steps would wait for their own images indefinitely. */

export const ETAPES_CREATION = [
  { cle: "brief", libelle: "Brief du projet", detail: "Le briefing de la conversation, mis au propre." },
  { cle: "squelette", libelle: "Structure du projet", detail: "L'épisode du film, depuis le brief." },
  { cle: "traitement", libelle: "Traitement du film", detail: "Le film découpé en scènes : ce que chacune raconte, d'où elle part, où elle arrive (dès 1 min 30 de film)." },
  { cle: "scenarios", libelle: "Scénarios des épisodes", detail: "Les plans et les répliques, scène par scène quand le film a un traitement, sinon un épisode d'un seul tenant." },
  { cle: "registre", libelle: "Registre d'assets", detail: "Personnages et lieux du brief, avec leurs prompts d'image." },
  { cle: "inventaire", libelle: "Inventaire des assets", detail: "Accessoires, états de décor, effets que les plans réclament." },
  { cle: "prompts-inventaire", libelle: "Prompts des assets de l'inventaire", detail: "Un prompt d'image par asset ajouté." },
  { cle: "relecture", libelle: "Relecture des scénarios", detail: "Cohérence, motifs, doublons, résolution : les plus petites corrections, avant d'écrire les fiches." },
] as const;

export type CleEtapeCreation = (typeof ETAPES_CREATION)[number]["cle"];
type StatutEtapeCreation = "a_venir" | "en_cours" | "fait" | "passe" | "echoue";
export type StatutCreation = "en_cours" | "termine" | "echoue" | "arretee";

export type EtapeCreation = {
  cle: CleEtapeCreation;
  statut: StatutEtapeCreation;
  /** The step's proposal (once launched): the one that gets applied, and from which the following "prompts" step starts. */
  propositionUuid: string | null;
  /** Automatic re-runs of failed subtasks: only one, then the step fails. */
  essais: number;
  /** One sentence on what happened ("3 épisodes", "rien à ajouter"). */
  detail: string | null;
  erreur: string | null;
};

/** A new creation: all its steps to come. */
export const etapesNeuves = (): EtapeCreation[] => ETAPES_CREATION.map((e) => ({ cle: e.cle, statut: "a_venir", propositionUuid: null, essais: 0, detail: null, erreur: null }));

const FINALES: StatutEtapeCreation[] = ["fait", "passe"];
export const estFinale = (e: Pick<EtapeCreation, "statut">) => FINALES.includes(e.statut);

const CLES_CONNUES = new Set<string>(ETAPES_CREATION.map((e) => e.cle));

/** The steps as the pilot and the screens read them. Old records keep steps that no longer exist (`voix`, then the
 * sheets of the two-phase creation: `fiches`, `prompts-fiches`, `compilation`, at status `a_demander` or other): they are IGNORED. A
 * finished creation stays so (its stored status does not move); an ongoing creation whose current step was one of those has nothing
 * left to do and ends on the pilot's next turn (the sheets proposal that was running stays in the history, unapplied). Order kept;
 * steps added since (e.g. `traitement`) are not added to an old creation. Pure. */
export function normaliserEtapes(etapes: unknown): EtapeCreation[] {
  if (!Array.isArray(etapes)) return [];
  return (etapes as { cle?: unknown; statut?: unknown }[])
    .filter((e): e is EtapeCreation => e != null && typeof e.cle === "string" && CLES_CONNUES.has(e.cle))
    .map((e) => ((e.statut as string) === "a_demander" ? { ...e, statut: "a_venir" as const } : e));
}

/** The next step to process: the first one that is neither done nor skipped; null when everything is finished. */
export function etapeCourante(etapes: EtapeCreation[]): EtapeCreation | null {
  return etapes.find((x) => !estFinale(x)) ?? null;
}

/** What the pilot observes for the current step. */
export type ObservationEtape = {
  /** An agent task occupies the project's conversation (pending or running). */
  occupe: boolean;
  /** State of the project's brief. */
  brief: "aucun" | "partiel" | "brouillon" | "valide";
  /** The step's proposal, when it exists. */
  /** `bloques`: changes blocked by a check (e.g. an unresolvable asset code): not tickable, hence never applied. */
  proposition: { statut: string; lot: boolean; echecs: number; bloques: number; nbChangements: number; erreur: string | null } | null;
};

export type Decision =
  | { type: "attendre" }
  | { type: "lancer" }
  | { type: "appliquer" }
  | { type: "relancer-echecs" }
  | { type: "fait"; detail: string | null }
  | { type: "echouer"; erreur: string };

/** What to do with the current step. Pure: all the chaining logic is here (tested), the pilot only
 * executes the decision. */
export function decider(etape: EtapeCreation, obs: ObservationEtape): Decision {
  if (etape.statut === "echoue") return { type: "attendre" }; // waiting for a manual resume
  if (etape.statut === "a_venir") return obs.occupe ? { type: "attendre" } : { type: "lancer" };

  // in progress
  if (etape.cle === "brief") {
    if (obs.occupe) return { type: "attendre" };
    return obs.brief === "brouillon" || obs.brief === "valide"
      ? { type: "fait", detail: "Brief écrit." }
      : { type: "echouer", erreur: "Le brief n'a pas pu être écrit : relance l'étape (le serveur LLM a peut-être échoué)." };
  }
  const p = obs.proposition;
  if (!p) return { type: "echouer", erreur: "La proposition de cette étape n'existe plus." };
  switch (p.statut) {
    case "en_generation":
      return { type: "attendre" };
    case "prete":
      if (p.lot && p.echecs + p.bloques > 0 && etape.essais < 1) return { type: "relancer-echecs" }; // failures AND blocked sheets: one re-run
      if (p.lot && p.echecs > 0) {
        return { type: "echouer", erreur: `${p.echecs} sous-tâche${p.echecs > 1 ? "s" : ""} en échec, même après une relance : relance l'étape quand le serveur répond.` };
      }
      // Changes still blocked after the re-run do not block the creation: the rest is applied, and the step says so.
      return p.nbChangements === 0 ? { type: "fait", detail: "Rien à ajouter." } : { type: "appliquer" };
    case "echouee":
      if (p.lot && etape.essais < 1) return { type: "relancer-echecs" };
      return { type: "echouer", erreur: p.erreur ?? "La génération a échoué." };
    case "appliquee":
    case "partielle":
      return { type: "fait", detail: null };
    default: // rejetee, ou inconnu
      return { type: "echouer", erreur: "La proposition de cette étape a été rejetée : l'installateur s'arrête (reprends-le pour la refaire)." };
  }
}

/** A service refusal meaning "there is nothing to do here" (not a breakdown): the step is skipped. */
const RIEN_A_FAIRE = /^(Aucun|Aucune|Tous|Toutes|Rien|Le brief ne décrit aucun|Plus rien)/i;
export const estRienAFaire = (erreur: string): boolean => RIEN_A_FAIRE.test(erreur.trim()) || /tous les assets du brief ont déjà un prompt|plus rien à écrire|toutes ont une fiche|chaque personnage qui parle a déjà/i.test(erreur);

/** The refusal "a task is already running": the step waits its turn, it is not a failure. */
export const estOccupe = (erreur: string): boolean => /déjà en cours|déjà en train de répondre/i.test(erreur);

/** Overall progress: number of finished steps out of the total (skipped steps included). */
export function progression(etapes: EtapeCreation[]): { faites: number; total: number } {
  return { faites: etapes.filter(estFinale).length, total: etapes.length };
}

/** The creation's status from its steps. `termine`: all its steps are finished (the review is the last one; the sheets are requested
 * afterwards, outside the creation). */
export function statutDepuisEtapes(etapes: EtapeCreation[], actuel: StatutCreation): StatutCreation {
  if (actuel === "arretee") return "arretee";
  if (etapes.some((e) => e.statut === "echoue")) return "echoue";
  return etapes.every(estFinale) ? "termine" : "en_cours";
}

/** The status to DISPLAY for a creation read from the database (normalized steps): an old creation failed or ongoing ONLY because of a sheets step
 * (removed from the creation) has nothing left to do: it reads as "terminée" (the pilot will end it on the next turn if it is ongoing).
 * A stopped creation, or one without a readable step, keeps its status. Pure. */
export function statutEffectif(etapes: EtapeCreation[], stocke: StatutCreation): StatutCreation {
  if (stocke === "arretee" || stocke === "termine" || etapes.length === 0) return stocke;
  return etapes.every(estFinale) ? "termine" : stocke;
}

// --- after the creation: "Écrire les fiches" (one `fiche-plan` request per clip, outside the creation) -------------------------------------------

/** The clips that "Écrire les fiches" launches: those without a sheet (or all if the author asks), never a clip whose request is already running
 * (it would be refused). The screenplay order is restored by `lancerDemandesFiches`. Pure. */
export function plansAEcrire(plans: { uuid: string; aUneFiche: boolean; demandeEnCours: boolean }[], tous = false): string[] {
  return plans.filter((p) => !p.demandeEnCours && (tous || !p.aUneFiche)).map((p) => p.uuid);
}

/** The state of a sheet request (`etatDemandesFiches`, lib/tasks/requests-*.ts), as the intents screen shows it. */
export type EtatDemandeFiche = { id: number; planUuid: string; statut: "en_cours" | "termine" | "echoue" | "annulee"; etape: string | null; erreur: string | null };

/** A tracking line: the current step ("Choix des références", "Création d'assets (2)", "Images (1/3)", "Compilation Open H3 IR"),
 * "Fiche écrite", or the failure with its reason (the asset at fault is named there by the request). Pure. */
export function libelleSuiviFiche(e: Pick<EtatDemandeFiche, "statut" | "etape" | "erreur">): string {
  switch (e.statut) {
    case "en_cours":
      return e.etape ?? "En file";
    case "termine":
      return "Fiche écrite";
    case "annulee":
      return "Annulée";
    case "echoue":
      return `Échec${e.etape ? ` (${e.etape})` : ""} : ${e.erreur ?? "raison inconnue"}`;
  }
}

/** The LAST sheet request of each clip (highest id). Pure. */
export function dernieresDemandesParPlan<T extends { id: number; planId: number }>(demandes: T[]): T[] {
  const parPlan = new Map<number, T>();
  for (const d of demandes) {
    const deja = parPlan.get(d.planId);
    if (!deja || d.id > deja.id) parPlan.set(d.planId, d);
  }
  return [...parPlan.values()];
}
