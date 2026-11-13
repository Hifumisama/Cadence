import { differenceMots } from "../clips/diff-words";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../clips/clip-checks";
import { estLiaison } from "../clips/clip-link";
import type { ChangementBrut } from "./changes";
import { ECART_DUREE_TOLERE } from "./conversion";
import { validerOperations } from "./view-operations/operations";
import { operationsVersChangements } from "./view-operations/operations-to-changes";
import type { Operation, OperationBrute } from "./view-operations/types";
import { numeroDePoignee, planParUuid, type VueEpisode } from "./view-operations/view-episode";
import type { Avertissement } from "./types";
import { aUnEtatDeFin, recitDe } from "../clips/intent";

/** SCREENPLAY REVIEW (skill `relecture-scenario`, FRICTIONS 2026-10-19): a model pass that reflects on an episode's WRITTEN screenplay
 * (intents and lines of dialogue), before the clip sheets. It does not rewrite the episode: it returns the SMALLEST corrections
 * (edit a clip's description or link, change a duration, remove a duplicate, add a resolution), cited by handle ("P07",
 * a rank at the moment of reading, never stored: F03), which the code translates into uuids then into changes for the clip's existing
 * appliers. Everything that can be checked by code is checked here; the judgement (is it physically possible?) is
 * the model's. Pure, tested. */

const CRITERES_RELECTURE = [
  "physique", // physical inconsistency: got up/down, who holds what, what is visible from where
  "temps", // temporal inconsistency: day/night, scene ambiance not held, order of events
  "direction", // direction of a movement (train, riders…) contrary to the place's landmarks
  "entrees-sorties", // order of entrances and exits, who is where
  "motif", // gesture without cause
  "doublon", // two clips for the same beat
  "menace", // threat that arrives or is presented badly
  "resolution", // episode without an ending
  "dialogue", // hollow, redundant or inconsistent line of dialogue
] as const;
type CritereRelecture = (typeof CRITERES_RELECTURE)[number];

const LIBELLE_CRITERE: Record<CritereRelecture, string> = {
  physique: "cohérence physique",
  temps: "cohérence temporelle",
  direction: "direction des déplacements",
  "entrees-sorties": "entrées et sorties",
  motif: "geste sans motif",
  doublon: "doublon",
  menace: "arrivée de la menace",
  resolution: "résolution",
  dialogue: "dialogue",
};

/** At most this many corrections: "the smallest corrections"; an episode that calls for more must be rewritten, not reviewed. */
export const MAX_CORRECTIONS = 8;
/** Minimum share of a description's words kept by a correction: below it, it is a rewrite, not the smallest correction. */
const PART_CONSERVEE_MIN = 0.5;

type ConstatRelecture = { critere: CritereRelecture; plans: string[]; probleme: string };

/** A correction as the model returns it: an `OperationBrute` (couper_plan, duree_plan, modifier_plan, ajouter_plan) plus what justifies it. */
type CorrectionRelecture = OperationBrute & { critere: CritereRelecture; motif: string };

export type SortieRelecture = { constats: ConstatRelecture[]; corrections: CorrectionRelecture[]; notes: string };

/** What the review reads of a clip and of the episode: the skill input (context.ts, `entreeRelecture`). */
export type EntreeRelecture = {
  plans: { plan: string; scene: string; titre: string; liaison: string; dureeSecondes: number; description: string }[];
  parolesDeLAuteur?: string[];
  dureeCibleSecondes?: number | null;
};

// --- code checks ----------------------------------------------------------------------------------------------------------------

/** A description never refers to another clip (FRICTIONS 2026-09-28/29 and 2026-10-14): neither handle, nor "plan précédent", nor number. */
const RENVOI_A_UN_PLAN = /\bP\s?\d{1,3}\b|\bplans?\s+(?:pr[ée]c[ée]dents?|suivants?|d'avant|d'apr[èe]s|n°?\s*\d+|\d+)\b|\b(?:comme|ainsi qu')\s+(?:au|dans le|dans les)\s+plans?\b/i;
const norme = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[«»"“”]/g, "").trim();

/** The lines of dialogue `« … »` of a description. */
export const repliquesDe = (description: string): string[] => [...description.matchAll(/«\s*([\s\S]*?)\s*»/g)].map((m) => m[1]!.trim()).filter(Boolean);

/** Share (0 to 1) of the words of `avant` found again, in order, in `apres`. */
export function partConservee(avant: string, apres: string): number {
  const total = avant.split(/\s+/).filter(Boolean).length;
  if (total === 0) return 1;
  // Consecutive identical segments are merged by `differenceMots`: we count words, not segments.
  const gardes = differenceMots(avant, apres)
    .filter((s) => s.type === "meme")
    .reduce((n, s) => n + s.texte.split(/\s+/).filter(Boolean).length, 0);
  return gardes / total;
}

export type ProblemeCorrection = { index: number; message: string };

/** The defects of an output, correction by correction. The same rules serve the check that RE-PROMPTS the model (lib/llm/checks.ts) and the
 * conversion, which blocks (non tickable) what would persist. `vue` is not required: the handle is read from the input. */
export function problemesDeRelecture(sortie: SortieRelecture, entree: EntreeRelecture): ProblemeCorrection[] {
  const p: ProblemeCorrection[] = [];
  const corrections = sortie.corrections ?? [];
  const parHandle = new Map(entree.plans.map((x) => [x.plan, x]));
  const dit = (index: number, message: string) => p.push({ index, message });
  if (corrections.length > MAX_CORRECTIONS) {
    dit(-1, `${corrections.length} corrections : ${MAX_CORRECTIONS} au plus, ce sont les PLUS PETITES corrections. Garde celles qui rendent l'épisode possible (physique, temps, doublon, fin) et laisse le reste.`);
  }
  const paroles = norme((entree.parolesDeLAuteur ?? []).join(" "));

  corrections.forEach((c, i) => {
    const nom = `Correction ${i + 1} (${c.type}${c.plan ? ` ${c.plan}` : ""})`;
    if (!c.motif?.trim()) dit(i, `${nom} : dis en une phrase POURQUOI (le champ "motif").`);
    if (c.type !== "ajouter_plan" || c.apres) {
      for (const ref of [c.plan, c.type === "ajouter_plan" ? c.apres : null].filter((x): x is string => !!x)) {
        if (!parHandle.has(ref) || numeroDePoignee(ref) == null) dit(i, `${nom} : « ${ref} » n'est pas un plan de l'épisode (références valides : ${entree.plans.map((x) => x.plan).join(", ")}).`);
      }
    }
    if (c.type === "ajouter_plan" && !c.apres) dit(i, `${nom} : un plan ajouté dit après quel plan il vient ("apres").`);

    const texte = c.type === "modifier_plan" || c.type === "ajouter_plan" ? (c.description ?? "").trim() : "";
    if (c.type === "modifier_plan" || c.type === "ajouter_plan") {
      if (c.type === "modifier_plan" && !texte && !c.liaison && !c.titre) dit(i, `${nom} : ni nouvelle description, ni liaison, ni titre : rien à modifier.`);
      if (c.type === "ajouter_plan" && !texte) dit(i, `${nom} : un plan ajouté a une description.`);
      if (texte) {
        if (aUnEtatDeFin(texte)) dit(i, `${nom} : n'écris pas de ligne « État en fin de plan : … » (elle n'existe plus) ; la fin du plan se raconte dans son dernier temps, dans le récit.`);
        if (!recitDe(texte)) dit(i, `${nom} : la description n'a pas de récit (ce qui se passe dans le plan) ; donne la description COMPLÈTE, pas seulement la phrase changée.`);
        if (RENVOI_A_UN_PLAN.test(texte)) dit(i, `${nom} : la description ne renvoie à aucun autre plan (ni poignée « P07 », ni « plan précédent » ou « suivant ») : elle se désynchroniserait au réordonnancement. Dis le fait, pas le plan.`);
        if (/\b(?:cam[ée]ra|travelling|gros plan|plan large|contre-plong[ée]e|panoramique)\b/i.test(texte) && !/consigne de l'auteur/i.test(texte)) {
          dit(i, `${nom} : pas de cadrage ni de caméra dans une description de scénario (c'est l'affaire de la fiche de plan).`);
        }
      }
    }
    const avant = c.plan ? parHandle.get(c.plan) : undefined;
    if (c.type === "modifier_plan" && avant && texte) {
      if (norme(texte) === norme(avant.description)) dit(i, `${nom} : la description est identique à l'actuelle.`);
      else if (partConservee(avant.description, texte) < PART_CONSERVEE_MIN) {
        dit(i, `${nom} : tu réécris ${c.plan} presque en entier. La plus petite correction change la phrase fautive (ou en ajoute une) et garde le reste mot pour mot, y compris les répliques quand elles restent vraies.`);
      }
      // The author's words are not touched: a line of dialogue they wrote stays word for word.
      for (const r of repliquesDe(avant.description)) {
        if (paroles && paroles.includes(norme(r)) && !norme(texte).includes(norme(r))) {
          dit(i, `${nom} : la réplique « ${r} » est de l'auteur (mot pour mot dans ses paroles) : garde-la telle quelle.`);
        }
      }
    }
    if (c.type === "couper_plan" && avant) {
      for (const r of repliquesDe(avant.description)) {
        if (paroles && paroles.includes(norme(r))) dit(i, `${nom} : ${c.plan} porte une réplique de l'auteur (« ${r.slice(0, 50)} ») : une suppression la perdrait. Fusionne plutôt le plan dans son voisin en reprenant cette réplique mot pour mot, ou laisse-le.`);
      }
    }
    if ((c.type === "duree_plan" || c.type === "ajouter_plan") && !(Number.isInteger(c.secondes) && c.secondes! >= DUREE_GENERATION_MIN && c.secondes! <= DUREE_GENERATION_MAX)) {
      dit(i, `${nom} : la durée est un entier de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s.`);
    }
    if (c.liaison != null && !estLiaison(c.liaison)) dit(i, `${nom} : liaison « ${c.liaison} » inconnue (suite ou coupe).`);
    if (c.liaison === "suite" && c.plan === entree.plans[0]?.plan) dit(i, `${nom} : le premier plan de l'épisode est une coupe.`);
  });

  // the same clip is not corrected twice in the same way
  const vus = new Set<string>();
  corrections.forEach((c, i) => {
    if (!c.plan) return;
    const cle = `${c.type}:${c.plan}`;
    if (vus.has(cle)) dit(i, `Correction ${i + 1} : ${c.plan} est déjà ${c.type === "couper_plan" ? "coupé" : "corrigé"} (${c.type}) plus haut : un seul geste par plan.`);
    vus.add(cle);
    const coupe = corrections.some((x) => x.type === "couper_plan" && x.plan === c.plan);
    if (coupe && c.type !== "couper_plan") dit(i, `Correction ${i + 1} : ${c.plan} est supprimé par une autre correction : ne le modifie pas.`);
  });
  if (corrections.filter((c) => c.type === "ajouter_plan").length > 1) dit(-1, "Un seul plan ajouté (la résolution manquante) : si l'épisode réclame davantage, il est à réécrire, pas à relire.");

  // the total duration does not leave the brief's tolerance because of the review
  const cible = entree.dureeCibleSecondes;
  if (cible && cible > 0) {
    const avantTotal = entree.plans.reduce((n, x) => n + x.dureeSecondes, 0);
    const duree = new Map(entree.plans.map((x) => [x.plan, x.dureeSecondes]));
    let apresTotal = avantTotal;
    for (const c of corrections) {
      if (c.type === "couper_plan" && c.plan) apresTotal -= duree.get(c.plan) ?? 0;
      else if (c.type === "duree_plan" && c.plan && Number.isInteger(c.secondes)) apresTotal += c.secondes! - (duree.get(c.plan) ?? c.secondes!);
      else if (c.type === "ajouter_plan" && Number.isInteger(c.secondes)) apresTotal += c.secondes!;
    }
    const bas = Math.ceil(cible * (1 - ECART_DUREE_TOLERE));
    const haut = Math.floor(cible * (1 + ECART_DUREE_TOLERE));
    if (avantTotal >= bas && avantTotal <= haut && (apresTotal < bas || apresTotal > haut)) {
      dit(-1, `Tes corrections font passer l'épisode de ${avantTotal} s à ${apresTotal} s, hors de ${bas}–${haut} s visées au brief. Compense (durée d'un plan voisin) ou renonce à une suppression/un ajout.`);
    }
  }
  return p;
}

// --- model output → changes -------------------------------------------------------------------------------------------------

export type ResultatRelecture = {
  bruts: ChangementBrut[];
  /** Corrections the code cannot translate (unknown handle…): dropped, with the reason. */
  refusees: { index: number; raison: string }[];
  /** Findings returned by the model, readable (the proposal's summary). */
  constats: string[];
};

const coupe = (t: string, n = 140) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** The `relecture-scenario` output → the changes of a subtask (an episode). The handles are resolved against `vue` (the episode as it is
 * NOW: the worker checks beforehand that the order has not changed since the reading). A correction that still fails the code checks is
 * set BLOCKED (not tickable, `bloque_controle`): the installer then re-runs the subtask once. A deletion of a clip with no sheet nor render
 * is ticked outright (nothing is lost that the screenplay does not already say elsewhere); any other deletion keeps the rule (unticked). */
export function depuisRelecture(sortie: SortieRelecture, vue: VueEpisode, entree: EntreeRelecture, options: { groupe: string }): ResultatRelecture {
  const problemes = problemesDeRelecture(sortie, entree);
  const parIndex = new Map<number, string[]>();
  for (const x of problemes) parIndex.set(x.index, [...(parIndex.get(x.index) ?? []), x.message]);
  const generaux = parIndex.get(-1) ?? [];

  const bruts: ChangementBrut[] = [];
  const refusees: { index: number; raison: string }[] = [];
  (sortie.corrections ?? []).forEach((c, index) => {
    const { critere, motif, ...brute } = c;
    const { valides, refusees: r } = validerOperations([{ ...brute, secondes: brute.secondes ?? null }], vue);
    if (r.length || valides.length === 0) {
      refusees.push({ index, raison: r[0]?.raison ?? "Correction inutilisable." });
      return;
    }
    const op: Operation = valides[0]!;
    const justification: Avertissement[] = [{ type: "info", texte: `Relecture · ${LIBELLE_CRITERE[critere] ?? critere} : ${coupe(motif ?? "")}` }];
    const defauts: Avertissement[] = [...(parIndex.get(index) ?? []), ...generaux].map((m) => ({ type: "bloque_controle" as const, texte: m }));
    for (const b of operationsVersChangements([op], vue)) {
      const plan = "planUuid" in op ? planParUuid(vue, op.planUuid) : undefined;
      const apres = op.type === "ajouter_plan" && "apresPlanUuid" in op.position ? planParUuid(vue, op.position.apresPlanUuid) : undefined;
      bruts.push({
        ...b,
        groupe: options.groupe,
        sousGroupe: (plan ?? apres)?.sceneTitre ?? null,
        avertissements: [...(b.avertissements ?? []), ...justification, ...defauts],
        ...(b.operation === "supprimer" && plan?.etat === "brouillon" ? { sansRisque: true } : {}),
      });
    }
  });
  const constats = (sortie.constats ?? []).map((k) => `${LIBELLE_CRITERE[k.critere] ?? k.critere}${k.plans?.length ? ` (${k.plans.join(", ")})` : ""} : ${k.probleme}`);
  return { bruts, refusees, constats };
}
