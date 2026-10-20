import { differenceMots } from "../diff-mots";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../plan-checks";
import { estLiaison } from "../plan-liaison";
import type { ChangementBrut } from "./changements";
import { ECART_DUREE_TOLERE } from "./conversion";
import { validerOperations } from "./vue-operations/operations";
import { operationsVersChangements } from "./vue-operations/operations-vers-changements";
import type { Operation, OperationBrute } from "./vue-operations/types";
import { numeroDePoignee, planParUuid, type VueEpisode } from "./vue-operations/vue-episode";
import type { Avertissement } from "./types";

/** RELECTURE DU SCÉNARIO (skill `relecture-scenario`, FRICTIONS 2026-10-19) : une passe du modèle qui réfléchit sur le scénario d'un épisode
 * ÉCRIT (intentions et « État en fin de plan »), avant les fiches de plan. Elle ne réécrit pas l'épisode : elle rend les PLUS PETITES corrections
 * (modifier la description ou la liaison d'un plan, changer une durée, supprimer un doublon, ajouter une résolution), citées par poignée (« P07 »,
 * un rang à l'instant de la lecture, jamais stocké : F03), que le code traduit en uuid puis en changements pour les applicateurs existants du
 * plan. Tout ce qui se vérifie par code se vérifie ici ; le jugement (est-ce physiquement possible ?) est
 * au modèle. Pur, testé. */

export const CRITERES_RELECTURE = [
  "physique", // incohérence physique : monté/descendu, qui tient quoi, ce qui est visible depuis où
  "temps", // incohérence temporelle : jour/nuit, ambiance de scène non tenue, ordre des événements
  "direction", // direction d'un déplacement (train, cavaliers…) contraire aux repères du lieu
  "entrees-sorties", // ordre des entrées et des sorties, qui est où
  "motif", // geste sans cause
  "doublon", // deux plans pour le même beat
  "menace", // menace qui arrive ou se présente mal
  "resolution", // épisode sans fin
  "dialogue", // réplique creuse, redondante ou incohérente
] as const;
export type CritereRelecture = (typeof CRITERES_RELECTURE)[number];

export const LIBELLE_CRITERE: Record<CritereRelecture, string> = {
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

/** Au plus autant de corrections : « les plus petites corrections » ; un épisode qui en réclame davantage est à réécrire, pas à relire. */
export const MAX_CORRECTIONS = 8;
/** Part minimale des mots d'une description conservée par une correction : en dessous, c'est une réécriture, pas la plus petite correction. */
export const PART_CONSERVEE_MIN = 0.5;

export type ConstatRelecture = { critere: CritereRelecture; plans: string[]; probleme: string };

/** Une correction telle que le modèle la rend : une `OperationBrute` (couper_plan, duree_plan, modifier_plan, ajouter_plan) plus ce qui la justifie. */
export type CorrectionRelecture = OperationBrute & { critere: CritereRelecture; motif: string };

export type SortieRelecture = { constats: ConstatRelecture[]; corrections: CorrectionRelecture[]; notes: string };

/** Ce que la relecture lit d'un plan et de l'épisode : l'entrée du skill (contexte.ts, `entreeRelecture`). */
export type EntreeRelecture = {
  plans: { plan: string; scene: string; titre: string; liaison: string; dureeSecondes: number; description: string }[];
  parolesDeLAuteur?: string[];
  dureeCibleSecondes?: number | null;
};

// --- contrôles de code ----------------------------------------------------------------------------------------------------------------

const ETAT_FIN = /[ée]tat en fin de plan\s*:/i;
/** Une description ne renvoie jamais à un autre plan (FRICTIONS 2026-09-28/29 et 2026-10-14) : ni poignée, ni « plan précédent », ni numéro. */
const RENVOI_A_UN_PLAN = /\bP\s?\d{1,3}\b|\bplans?\s+(?:pr[ée]c[ée]dents?|suivants?|d'avant|d'apr[èe]s|n°?\s*\d+|\d+)\b|\b(?:comme|ainsi qu')\s+(?:au|dans le|dans les)\s+plans?\b/i;
const norme = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[«»"“”]/g, "").trim();

/** Les répliques `« … »` d'une description. */
export const repliquesDe = (description: string): string[] => [...description.matchAll(/«\s*([\s\S]*?)\s*»/g)].map((m) => m[1]!.trim()).filter(Boolean);

/** Part (0 à 1) des mots de `avant` qu'on retrouve, dans l'ordre, dans `apres`. */
export function partConservee(avant: string, apres: string): number {
  const total = avant.split(/\s+/).filter(Boolean).length;
  if (total === 0) return 1;
  // Les segments identiques consécutifs sont fusionnés par `differenceMots` : on compte les mots, pas les segments.
  const gardes = differenceMots(avant, apres)
    .filter((s) => s.type === "meme")
    .reduce((n, s) => n + s.texte.split(/\s+/).filter(Boolean).length, 0);
  return gardes / total;
}

export type ProblemeCorrection = { index: number; message: string };

/** Les défauts d'une sortie, correction par correction. Les mêmes règles servent au contrôle qui RENVOIE le modèle (lib/llm/controles.ts) et à la
 * conversion, qui bloque (non cochable) ce qui persiste. `vue` n'est pas requis : la poignée se lit dans l'entrée. */
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
        if (!ETAT_FIN.test(texte)) dit(i, `${nom} : la description doit se terminer par « État en fin de plan : … » (où sont les personnages qui comptent, vers quoi ils sont tournés, par rapport aux repères fixes du lieu ; l'état de ce qui a changé).`);
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
        dit(i, `${nom} : tu réécris ${c.plan} presque en entier. La plus petite correction change la phrase fautive (ou en ajoute une) et garde le reste mot pour mot, y compris les répliques et l'« État en fin de plan » quand ils restent vrais.`);
      }
      // Les mots de l'auteur ne se touchent pas : une réplique qu'il a écrite reste mot pour mot.
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

  // un même plan n'est pas corrigé deux fois de la même façon
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

  // la durée totale ne sort pas de la tolérance du brief à cause de la relecture
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

// --- sortie du modèle → changements -------------------------------------------------------------------------------------------------

export type ResultatRelecture = {
  bruts: ChangementBrut[];
  /** Corrections que le code ne sait pas traduire (poignée inconnue…) : écartées, avec la raison. */
  refusees: { index: number; raison: string }[];
  /** Constats rendus par le modèle, lisibles (le résumé de la proposition). */
  constats: string[];
};

const coupe = (t: string, n = 140) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** La sortie de `relecture-scenario` → les changements d'une sous-tâche (un épisode). Les poignées sont résolues sur `vue` (l'épisode tel qu'il est
 * MAINTENANT : le worker vérifie avant que l'ordre n'a pas changé depuis la lecture). Une correction qui échoue encore aux contrôles de code est
 * posée BLOQUÉE (non cochable, `bloque_controle`) : l'installateur relance alors la sous-tâche une fois. Une suppression d'un plan sans fiche ni rendu
 * est cochée d'office (rien n'est perdu que le scénario ne dise déjà ailleurs) ; toute autre suppression garde la règle (décochée). */
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
        ...(b.operation === "supprimer" && plan?.etat === "brouillon" ? { cocheOffice: true } : {}),
      });
    }
  });
  const constats = (sortie.constats ?? []).map((k) => `${LIBELLE_CRITERE[k.critere] ?? k.critere}${k.plans?.length ? ` (${k.plans.join(", ")})` : ""} : ${k.probleme}`);
  return { bruts, refusees, constats };
}
