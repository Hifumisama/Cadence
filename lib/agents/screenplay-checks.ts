import { bornesDuree } from "./conversion";
import { aUnEtatDeFin, recitDe } from "../clips/intent";

/** Checks the total duration of an episode screenplay (skill `scenario-episode`). The model does not add up reliably
 * (×2 discrepancies found in testing): it is the code that counts, and that sends back the exact total. A single re-prompt
 * (see lib/llm/checks.ts); if the gap persists, the review's duration warning takes over. */

type SortieScenario = { scenes?: { plans?: { dureeSecondes?: number }[] }[] };

export function dureeTotaleScenario(sortie: SortieScenario): { secondes: number; nbPlans: number } {
  let secondes = 0;
  let nbPlans = 0;
  for (const scene of sortie.scenes ?? []) {
    for (const plan of scene.plans ?? []) {
      secondes += Number(plan.dureeSecondes) || 0;
      nbPlans++;
    }
  }
  return { secondes, nbPlans };
}

/** Duration errors: empty if the total is within tolerance (or if there is no target). Pure. */
export function controlerDureeScenario(sortie: SortieScenario, cibleSecondes: number | null | undefined): string[] {
  if (!cibleSecondes || cibleSecondes <= 0) return [];
  const { secondes, nbPlans } = dureeTotaleScenario(sortie);
  if (nbPlans === 0) return [];
  const { bas, haut } = bornesDuree(cibleSecondes);
  if (secondes >= bas && secondes <= haut) return [];
  const moyenne = secondes / nbPlans;
  const consigne =
    secondes > haut
      ? `Trop long de ${secondes - haut} s au moins : fusionne les plans consécutifs d'une même unité d'action (même lieu, même moment) ou retire ce qui ne sert pas l'arc.`
      : `Trop court de ${bas - secondes} s au moins : ajoute les moments que l'arc réclame, ou donne plus de durée aux plans qui portent l'enjeu.`;
  return [
    `Durée totale : tes ${nbPlans} plans font ${secondes} s (${moyenne.toFixed(1)} s en moyenne), pour ${cibleSecondes} s visées au brief : le total doit tenir entre ${bas} et ${haut} s. ${consigne} Recompte avant de rendre.`,
  ];
}

/** Structure required by the skill: each description has a STORY (not only lines of dialogue) and no longer has an "État en fin de plan" line
 * (removed on 2026-11-08: a `suite` extends the previous render through its latent; the clip's end is read in its last moment). A gap is
 * an ERROR, hence a re-prompt to the model. No layout rule: it varies with each scene. Pure. */
export function controlerStructureScenario(sortie: { scenes?: { titre?: string; plans?: { titre?: string; description?: string }[] }[] }): string[] {
  const erreurs: string[] = [];
  for (const scene of sortie.scenes ?? []) {
    for (const plan of scene.plans ?? []) {
      const description = plan.description ?? "";
      const nom = `Le plan « ${plan.titre ?? "?"} »`;
      if (aUnEtatDeFin(description)) {
        erreurs.push(`${nom} : n'écris pas de ligne « État en fin de plan : … ». Raconte plutôt la fin du plan dans son dernier temps (qui est où, en train de faire quoi, par rapport aux repères du lieu), dans le récit.`);
      }
      if (!recitDe(description)) {
        erreurs.push(`${nom} : sa description n'a pas de récit. Dis ce qui se passe, dans l'ordre (le début, les gestes, ce qui change, la fin), puis les répliques.`);
      }
    }
  }
  return erreurs;
}

/** Comparable form of a treatment state: case, spaces and final punctuation ignored. */
const formeEtat = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.…;,!]+$/, "")
    .trim();

/** The first plan's `liaison` of a scene (skill `scenario-scene`, bug S4 of project 259). The treatment COPIES the previous scene's `etatSortie`
 * into `etatEntree` when the story goes on without a break (traitement-episode, rule 4): only that exact copy (normalised) is taken as « same place,
 * same moment », never a resemblance. Then a first plan in `coupe` is an error; and without a previous scene, a `suite` is one. Pure. */
export function controlerLiaisonPremierPlan(
  entree: { scene?: { etatEntree?: string } | null; scenePrecedente?: { etatSortie?: string } | null },
  sortie: { plans?: { titre?: string; liaison?: string }[] },
): string[] {
  const premier = sortie.plans?.[0];
  if (!premier) return [];
  const nom = `Le premier plan « ${premier.titre ?? "?"} »`;
  if (!entree.scenePrecedente) {
    return premier.liaison === "suite" ? [`${nom} : il n'y a pas de scène précédente, sa liaison est donc « coupe ».`] : [];
  }
  const debut = formeEtat(entree.scene?.etatEntree);
  const enContinuite = debut !== "" && debut === formeEtat(entree.scenePrecedente.etatSortie);
  if (enContinuite && premier.liaison === "coupe") {
    return [
      `${nom} : la scène commence là où la précédente s'arrête (son état d'entrée est l'état de sortie de la scène précédente : même lieu, même moment), sa liaison est donc « suite », et sa description commence directement sur le premier temps, sans redonner les positions.`,
    ];
  }
  return [];
}
