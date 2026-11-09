/** L'INSTALLATEUR : la création d'un projet de bout en bout, sans validation intermédiaire (2026-10-03, retours du
 * test général). Une fois le briefing prêt, une seule demande enchaîne toutes les étapes ; chacune est générée PUIS
 * appliquée toute seule, et la progression se suit sur une page dédiée. Règles PURES (étapes, état, décision) : les
 * lectures, les écritures et les appels au service sont dans lib/agents/creation-db.ts, piloté par le worker
 * (un tour de boucle = au plus une transition par création : reprise sur redémarrage, rien en mémoire).
 *
 * Le seul retour en arrière d'une création est de supprimer le projet : on n'applique donc que ce qui est coché
 * d'office (les créations ; un écrasement est décoché par défaut, il n'est jamais confirmé ici).
 *
 * DEUX PHASES (2026-11-08) : la phase 1 va du brief à la relecture des scénarios, puis la création S'ARRÊTE (statut `termine`) : on relit
 * les intents des plans (une fiche écrite sur un intent faux coûte un rendu et une itération pour rien) pendant que les images de référence
 * se fabriquent. La phase 2 (fiches, prompts des assets qu'elles créent, compilation Open H3 IR) ne part que sur demande explicite
 * (`lancerFichesProjet`, lib/agents/creation-db.ts) ; ses étapes attendent en statut `a_demander` jusque-là. */

export const ETAPES_CREATION = [
  { cle: "brief", phase: 1, libelle: "Brief du projet", detail: "Le briefing de la conversation, mis au propre." },
  { cle: "squelette", phase: 1, libelle: "Structure du projet", detail: "L'épisode du film, depuis le brief." },
  { cle: "traitement", phase: 1, libelle: "Traitement du film", detail: "Le film découpé en scènes : ce que chacune raconte, d'où elle part, où elle arrive (dès 1 min 30 de film)." },
  { cle: "scenarios", phase: 1, libelle: "Scénarios des épisodes", detail: "Les plans et les répliques, scène par scène quand le film a un traitement, sinon un épisode d'un seul tenant." },
  { cle: "registre", phase: 1, libelle: "Registre d'assets", detail: "Personnages et lieux du brief, avec leurs prompts d'image." },
  { cle: "inventaire", phase: 1, libelle: "Inventaire des assets", detail: "Accessoires, états de décor, effets que les plans réclament." },
  { cle: "prompts-inventaire", phase: 1, libelle: "Prompts des assets de l'inventaire", detail: "Un prompt d'image par asset ajouté." },
  { cle: "relecture", phase: 1, libelle: "Relecture des scénarios", detail: "Cohérence, motifs, doublons, résolution : les plus petites corrections, avant d'écrire les fiches." },
  { cle: "fiches", phase: 2, libelle: "Fiches de plan", detail: "Le prompt vidéo de chaque plan, avec ses références (Open H3 IR quand ses images existent, sinon plan-h3 choisit les références)." },
  { cle: "prompts-fiches", phase: 2, libelle: "Prompts des assets créés par les fiches", detail: "Ce que les fiches ont ajouté au registre." },
  { cle: "compilation", phase: 2, libelle: "Compilation Open H3 IR", detail: "Les fiches écrites par plan-h3 dont toutes les images de référence existent sont recompilées par Open H3 IR (créativité, style de mise en scène)." },
] as const;

export type CleEtapeCreation = (typeof ETAPES_CREATION)[number]["cle"];
/** `a_demander` : étape de la phase 2 qui attend que l'utilisateur la demande (« Écrire les fiches ») ; le pilote ne la lance jamais seul. */
export type StatutEtapeCreation = "a_venir" | "en_cours" | "fait" | "passe" | "echoue" | "a_demander";
export type StatutCreation = "en_cours" | "termine" | "echoue" | "arretee";

/** Les étapes de la phase 2 (déclenchée à la demande). */
export const CLES_PHASE_2: CleEtapeCreation[] = ETAPES_CREATION.filter((e) => e.phase === 2).map((e) => e.cle);
const estPhase2 = (cle: string) => (CLES_PHASE_2 as string[]).includes(cle);

export type EtapeCreation = {
  cle: CleEtapeCreation;
  statut: StatutEtapeCreation;
  /** La proposition de l'étape (une fois lancée) : celle qu'on applique, et d'où part l'étape « prompts » qui suit. */
  propositionUuid: string | null;
  /** Relances automatiques des sous-tâches en échec : une seule, puis l'étape échoue. */
  essais: number;
  /** Une phrase sur ce qui s'est passé (« 3 épisodes », « rien à ajouter »). */
  detail: string | null;
  erreur: string | null;
};

const etapeNeuve = (cle: CleEtapeCreation, statut: StatutEtapeCreation): EtapeCreation => ({ cle, statut, propositionUuid: null, essais: 0, detail: null, erreur: null });

/** Une création neuve : la phase 1 à venir, la phase 2 en attente d'une demande. */
export const etapesNeuves = (): EtapeCreation[] => ETAPES_CREATION.map((e) => etapeNeuve(e.cle, e.phase === 2 ? "a_demander" : "a_venir"));

const FINALES: StatutEtapeCreation[] = ["fait", "passe"];
export const estFinale = (e: Pick<EtapeCreation, "statut">) => FINALES.includes(e.statut);

/** La phase 1 est-elle finie (toutes ses étapes faites ou passées) ? */
export const phase1Finie = (etapes: EtapeCreation[]): boolean => etapes.filter((e) => !estPhase2(e.cle)).every(estFinale);

/** Les étapes telles que le pilote les lit. Une création lancée AVANT les deux phases a sa phase 2 « à venir » : tant que sa phase 1 n'est
 * pas finie, elle passe « à demander » (elle aussi s'arrêtera avant les fiches). Une phase 2 « à venir » APRÈS une phase 1 finie est une
 * phase 2 demandée : elle reste telle quelle. Pure. */
export function normaliserEtapes(etapes: EtapeCreation[]): EtapeCreation[] {
  if (phase1Finie(etapes)) return etapes;
  return etapes.map((e) => (estPhase2(e.cle) && e.statut === "a_venir" ? { ...e, statut: "a_demander" as const } : e));
}

/** La phase 2 demandée (« Écrire les fiches ») : ses étapes repartent de zéro (celles qui manquent à une création ancienne sont ajoutées), la
 * phase 1 ne bouge pas. Pure. */
export function demanderPhase2(etapes: EtapeCreation[]): EtapeCreation[] {
  const phase1 = etapes.filter((e) => !estPhase2(e.cle));
  return [...phase1, ...CLES_PHASE_2.map((cle) => etapeNeuve(cle, "a_venir"))];
}

/** Où en est la phase 2 : `a_demander` (pas encore demandée), `en_cours`, `faite` (toutes ses étapes finies), `echoue`. Une création
 * d'avant les deux phases qui a fait ses fiches est `faite`. */
export function etatPhase2(etapes: EtapeCreation[]): "a_demander" | "en_cours" | "faite" | "echoue" {
  const p2 = etapes.filter((e) => estPhase2(e.cle));
  if (p2.some((e) => e.statut === "echoue")) return "echoue";
  if (p2.some((e) => e.statut === "a_demander")) return "a_demander";
  return p2.every(estFinale) ? "faite" : "en_cours";
}

/** La prochaine étape à traiter : la première qui n'est ni faite ni passée ; null quand tout est fini OU quand la suite attend une demande
 * (`a_demander` : la phase 2 ne part jamais seule). */
export function etapeCourante(etapes: EtapeCreation[]): EtapeCreation | null {
  const e = etapes.find((x) => !estFinale(x)) ?? null;
  return e && e.statut === "a_demander" ? null : e;
}

/** Ce que le pilote observe pour l'étape courante. */
export type ObservationEtape = {
  /** Une tâche de l'agent occupe la conversation du projet (en attente ou en cours). */
  occupe: boolean;
  /** État du brief du projet. */
  brief: "aucun" | "partiel" | "brouillon" | "valide";
  /** La proposition de l'étape, quand elle existe. */
  /** `bloques` : changements qu'un contrôle bloque (ex. un code d'asset irrésolvable) : non cochables, donc jamais appliqués. */
  proposition: { statut: string; lot: boolean; echecs: number; bloques: number; nbChangements: number; erreur: string | null } | null;
};

export type Decision =
  | { type: "attendre" }
  | { type: "lancer" }
  | { type: "appliquer" }
  | { type: "relancer-echecs" }
  | { type: "fait"; detail: string | null }
  | { type: "echouer"; erreur: string };

/** La suite à donner à l'étape courante. Pure : toute la logique de l'enchaînement est ici (testée), le pilote ne fait
 * qu'exécuter la décision. */
export function decider(etape: EtapeCreation, obs: ObservationEtape): Decision {
  if (etape.statut === "echoue" || etape.statut === "a_demander") return { type: "attendre" }; // en attente d'une reprise manuelle, ou d'une demande
  if (etape.statut === "a_venir") return obs.occupe ? { type: "attendre" } : { type: "lancer" };

  // en_cours
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
      if (p.lot && p.echecs + p.bloques > 0 && etape.essais < 1) return { type: "relancer-echecs" }; // échecs ET fiches bloquées : une relance
      // La compilation Open H3 IR n'est qu'une amélioration : une compilation en échec laisse la fiche plan-h3 du plan, la création continue.
      if (p.lot && p.echecs > 0 && etape.cle !== "compilation") {
        return { type: "echouer", erreur: `${p.echecs} sous-tâche${p.echecs > 1 ? "s" : ""} en échec, même après une relance : relance l'étape quand le serveur répond.` };
      }
      // Des changements encore bloqués après la relance ne bloquent pas la création : le reste s'applique, et l'étape le dit.
      return p.nbChangements === 0 ? { type: "fait", detail: "Rien à ajouter." } : { type: "appliquer" };
    case "echouee":
      if (p.lot && etape.essais < 1) return { type: "relancer-echecs" };
      if (etape.cle === "compilation") return { type: "fait", detail: `Compilation Open H3 IR impossible (${p.erreur ?? "échec"}) : les fiches plan-h3 restent.` };
      return { type: "echouer", erreur: p.erreur ?? "La génération a échoué." };
    case "appliquee":
    case "partielle":
      return { type: "fait", detail: null };
    default: // rejetee, ou inconnu
      return { type: "echouer", erreur: "La proposition de cette étape a été rejetée : l'installateur s'arrête (reprends-le pour la refaire)." };
  }
}

/** Un refus du service qui veut dire « il n'y a rien à faire ici » (et non une panne) : l'étape est passée. */
const RIEN_A_FAIRE = /^(Aucun|Aucune|Tous|Toutes|Rien|Le brief ne décrit aucun|Plus rien)/i;
export const estRienAFaire = (erreur: string): boolean => RIEN_A_FAIRE.test(erreur.trim()) || /tous les assets du brief ont déjà un prompt|plus rien à écrire|toutes ont une fiche|chaque personnage qui parle a déjà/i.test(erreur);

/** Le refus « une tâche est déjà en cours » : l'étape attend son tour, ce n'est pas un échec. */
export const estOccupe = (erreur: string): boolean => /déjà en cours|déjà en train de répondre/i.test(erreur);

/** Progression globale : nombre d'étapes terminées sur le total (étapes passées comprises). Les étapes qui attendent une demande ne comptent
 * pas : une phase 1 finie fait 100 %. */
export function progression(etapes: EtapeCreation[]): { faites: number; total: number } {
  const comptees = etapes.filter((e) => e.statut !== "a_demander");
  return { faites: comptees.filter(estFinale).length, total: comptees.length };
}

/** Statut de la création d'après ses étapes. `termine` : plus rien à faire sans l'utilisateur (tout fini, ou la phase 2 attend sa demande). */
export function statutDepuisEtapes(etapes: EtapeCreation[], actuel: StatutCreation): StatutCreation {
  if (actuel === "arretee") return "arretee";
  if (etapes.some((e) => e.statut === "echoue")) return "echoue";
  return etapes.every((e) => estFinale(e) || e.statut === "a_demander") ? "termine" : "en_cours";
}
