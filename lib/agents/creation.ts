/** L'INSTALLATEUR : la création d'un projet de bout en bout, sans validation intermédiaire (2026-10-03, retours du
 * test général). Une fois le briefing prêt, une seule demande enchaîne toutes les étapes ; chacune est générée PUIS
 * appliquée toute seule, et la progression se suit sur une page dédiée. Règles PURES (étapes, état, décision) : les
 * lectures, les écritures et les appels au service sont dans lib/agents/creation-db.ts, piloté par le worker
 * (un tour de boucle = au plus une transition par création : reprise sur redémarrage, rien en mémoire).
 *
 * Le seul retour en arrière d'une création est de supprimer le projet : on n'applique donc que ce qui est coché
 * d'office (les créations ; un écrasement est décoché par défaut, il n'est jamais confirmé ici).
 *
 * UNE SEULE PHASE (2026-11-09, vague 4b) : la création va du brief à la relecture des scénarios, puis S'ARRÊTE (statut `termine`) : on relit
 * les intents des plans (une fiche écrite sur un intent faux coûte un rendu et une itération pour rien) pendant que les images de référence
 * se fabriquent. Les fiches ne sont PLUS des étapes de la création : « Écrire les fiches » pose une demande `fiche-plan` par plan
 * (`lancerDemandesFiches`, lib/tasks/requests-db.ts), indépendante de la création. Raison : pendant qu'une création est en cours, worker/images.ts
 * retient les images du projet ; des fiches gardées comme étapes de la création attendraient leurs propres images indéfiniment. */

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
  /** La proposition de l'étape (une fois lancée) : celle qu'on applique, et d'où part l'étape « prompts » qui suit. */
  propositionUuid: string | null;
  /** Relances automatiques des sous-tâches en échec : une seule, puis l'étape échoue. */
  essais: number;
  /** Une phrase sur ce qui s'est passé (« 3 épisodes », « rien à ajouter »). */
  detail: string | null;
  erreur: string | null;
};

/** Une création neuve : toutes ses étapes à venir. */
export const etapesNeuves = (): EtapeCreation[] => ETAPES_CREATION.map((e) => ({ cle: e.cle, statut: "a_venir", propositionUuid: null, essais: 0, detail: null, erreur: null }));

const FINALES: StatutEtapeCreation[] = ["fait", "passe"];
export const estFinale = (e: Pick<EtapeCreation, "statut">) => FINALES.includes(e.statut);

const CLES_CONNUES = new Set<string>(ETAPES_CREATION.map((e) => e.cle));

/** Les étapes telles que le pilote et les écrans les lisent. Les enregistrements anciens gardent des étapes qui n'existent plus (`voix`, puis les
 * fiches de la création en deux phases : `fiches`, `prompts-fiches`, `compilation`, au statut `a_demander` ou autre) : elles sont IGNORÉES. Une
 * création terminée le reste (son statut stocké ne bouge pas) ; une création en cours dont l'étape courante était une de celles-là n'a plus rien
 * à faire et se termine au tour suivant du pilote (la proposition des fiches qui tournait reste dans l'historique, non appliquée). Ordre gardé ;
 * les étapes ajoutées depuis (ex. `traitement`) ne sont pas ajoutées à une création ancienne. Pure. */
export function normaliserEtapes(etapes: unknown): EtapeCreation[] {
  if (!Array.isArray(etapes)) return [];
  return (etapes as { cle?: unknown; statut?: unknown }[])
    .filter((e): e is EtapeCreation => e != null && typeof e.cle === "string" && CLES_CONNUES.has(e.cle))
    .map((e) => ((e.statut as string) === "a_demander" ? { ...e, statut: "a_venir" as const } : e));
}

/** La prochaine étape à traiter : la première qui n'est ni faite ni passée ; null quand tout est fini. */
export function etapeCourante(etapes: EtapeCreation[]): EtapeCreation | null {
  return etapes.find((x) => !estFinale(x)) ?? null;
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
      if (p.lot && etape.essais < 1) return { type: "relancer-echecs" };
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

/** Progression globale : nombre d'étapes terminées sur le total (étapes passées comprises). */
export function progression(etapes: EtapeCreation[]): { faites: number; total: number } {
  return { faites: etapes.filter(estFinale).length, total: etapes.length };
}

/** Statut de la création d'après ses étapes. `termine` : toutes ses étapes sont finies (la relecture est la dernière ; les fiches se demandent
 * ensuite, hors création). */
export function statutDepuisEtapes(etapes: EtapeCreation[], actuel: StatutCreation): StatutCreation {
  if (actuel === "arretee") return "arretee";
  if (etapes.some((e) => e.statut === "echoue")) return "echoue";
  return etapes.every(estFinale) ? "termine" : "en_cours";
}

/** Le statut à AFFICHER d'une création lue en base (étapes normalisées) : une création ancienne en échec ou en cours SEULEMENT à cause d'une étape
 * de fiches (retirée de la création) n'a plus rien à faire : elle se lit « terminée » (le pilote la terminera au prochain tour si elle est en cours).
 * Une création arrêtée, ou sans étape lisible, garde son statut. Pure. */
export function statutEffectif(etapes: EtapeCreation[], stocke: StatutCreation): StatutCreation {
  if (stocke === "arretee" || stocke === "termine" || etapes.length === 0) return stocke;
  return etapes.every(estFinale) ? "termine" : stocke;
}

// --- après la création : « Écrire les fiches » (une demande `fiche-plan` par plan, hors création) -------------------------------------------

/** Les plans que « Écrire les fiches » lance : ceux sans fiche (ou tous si l'auteur le demande), jamais un plan dont une demande tourne déjà
 * (elle serait refusée). L'ordre du scénario est rétabli par `lancerDemandesFiches`. Pure. */
export function plansAEcrire(plans: { uuid: string; aUneFiche: boolean; demandeEnCours: boolean }[], tous = false): string[] {
  return plans.filter((p) => !p.demandeEnCours && (tous || !p.aUneFiche)).map((p) => p.uuid);
}

/** L'état d'une demande de fiche (`etatDemandesFiches`, lib/tasks/requests-db.ts), tel que l'écran des intents le montre. */
export type EtatDemandeFiche = { id: number; planUuid: string; statut: "en_cours" | "termine" | "echoue" | "annulee"; etape: string | null; erreur: string | null };

/** Une ligne de suivi : l'étape en cours (« Choix des références », « Création d'assets (2) », « Images (1/3) », « Compilation Open H3 IR »),
 * « Fiche écrite », ou l'échec avec sa raison (l'asset en cause y est nommé par la demande). Pure. */
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

/** La DERNIÈRE demande de fiche de chaque plan (plus grand id). Pure. */
export function dernieresDemandesParPlan<T extends { id: number; planId: number }>(demandes: T[]): T[] {
  const parPlan = new Map<number, T>();
  for (const d of demandes) {
    const deja = parPlan.get(d.planId);
    if (!deja || d.id > deja.id) parPlan.set(d.planId, d);
  }
  return [...parPlan.values()];
}
