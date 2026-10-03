/** L'INSTALLATEUR : la création d'un projet de bout en bout, sans validation intermédiaire (2026-10-03, retours du
 * test général). Une fois le briefing prêt, une seule demande enchaîne toutes les étapes ; chacune est générée PUIS
 * appliquée toute seule, et la progression se suit sur une page dédiée. Règles PURES (étapes, état, décision) : les
 * lectures, les écritures et les appels au service sont dans lib/agents/creation-db.ts, piloté par le worker
 * (un tour de boucle = au plus une transition par création : reprise sur redémarrage, rien en mémoire).
 *
 * Le seul retour en arrière d'une création est de supprimer le projet : on n'applique donc que ce qui est coché
 * d'office (les créations ; un écrasement est décoché par défaut, il n'est jamais confirmé ici). */

export const ETAPES_CREATION = [
  { cle: "brief", libelle: "Brief du projet", detail: "Le briefing de la conversation, mis au propre." },
  { cle: "squelette", libelle: "Structure du projet", detail: "Saisons et épisodes, depuis le brief." },
  { cle: "scenarios", libelle: "Scénarios des épisodes", detail: "Un épisode après l'autre : scènes, plans, répliques." },
  { cle: "registre", libelle: "Registre d'assets", detail: "Personnages et lieux du brief, avec leurs prompts d'image." },
  { cle: "inventaire", libelle: "Inventaire des assets", detail: "Accessoires, états de décor, effets que les plans réclament." },
  { cle: "prompts-inventaire", libelle: "Prompts des assets de l'inventaire", detail: "Un prompt d'image par asset ajouté." },
  { cle: "voix", libelle: "Voix des personnages", detail: "Une voix pour chaque personnage qui parle." },
  { cle: "fiches", libelle: "Fiches de plan", detail: "Le prompt vidéo de chaque plan, avec ses références." },
  { cle: "prompts-fiches", libelle: "Prompts des assets créés par les fiches", detail: "Ce que les fiches ont ajouté au registre." },
] as const;

export type CleEtapeCreation = (typeof ETAPES_CREATION)[number]["cle"];
export type StatutEtapeCreation = "a_venir" | "en_cours" | "fait" | "passe" | "echoue";
export type StatutCreation = "en_cours" | "termine" | "echoue" | "arretee";

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

export const etapesNeuves = (): EtapeCreation[] => ETAPES_CREATION.map((e) => ({ cle: e.cle, statut: "a_venir" as const, propositionUuid: null, essais: 0, detail: null, erreur: null }));

const FINALES: StatutEtapeCreation[] = ["fait", "passe"];
export const estFinale = (e: Pick<EtapeCreation, "statut">) => FINALES.includes(e.statut);

/** La prochaine étape à traiter : la première qui n'est ni faite ni passée ; null quand tout est fini. */
export function etapeCourante(etapes: EtapeCreation[]): EtapeCreation | null {
  return etapes.find((e) => !estFinale(e)) ?? null;
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
  if (etape.statut === "echoue") return { type: "attendre" }; // en attente d'une reprise manuelle
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
      if (p.lot && p.echecs > 0) {
        return { type: "echouer", erreur: `${p.echecs} sous-tâche${p.echecs > 1 ? "s" : ""} en échec, même après une relance : relance l'étape quand le serveur répond.` };
      }
      // Des changements encore bloqués après la relance ne bloquent pas la création : le reste s'applique, et l'étape le dit.
      return p.nbChangements === 0 ? { type: "fait", detail: "Rien à ajouter." } : { type: "appliquer" };
    case "echouee":
      return p.lot && etape.essais < 1 ? { type: "relancer-echecs" } : { type: "echouer", erreur: p.erreur ?? "La génération a échoué." };
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

/** Progression globale : nombre d'étapes terminées sur le total (étapes passées comprises). */
export function progression(etapes: EtapeCreation[]): { faites: number; total: number } {
  return { faites: etapes.filter(estFinale).length, total: etapes.length };
}

/** Statut de la création d'après ses étapes. */
export function statutDepuisEtapes(etapes: EtapeCreation[], actuel: StatutCreation): StatutCreation {
  if (actuel === "arretee") return "arretee";
  if (etapes.some((e) => e.statut === "echoue")) return "echoue";
  return etapes.every(estFinale) ? "termine" : "en_cours";
}
