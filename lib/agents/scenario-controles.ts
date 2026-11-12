import { ECART_DUREE_TOLERE } from "./conversion";
import { aUnEtatDeFin, recitDe } from "../plans/intent";

/** Contrôle de la durée totale d'un scénario d'épisode (skill `scenario-episode`). Le modèle n'additionne pas fiablement
 * (écarts de ×2 constatés en recette) : c'est le code qui compte, et qui lui renvoie le total exact. Un seul renvoi
 * (voir lib/llm/controles.ts) ; si l'écart persiste, l'avertissement de durée de la revue prend le relais. */

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

/** Erreurs de durée : vide si le total est dans la tolérance (ou s'il n'y a pas de cible). Pur. */
export function controlerDureeScenario(sortie: SortieScenario, cibleSecondes: number | null | undefined): string[] {
  if (!cibleSecondes || cibleSecondes <= 0) return [];
  const { secondes, nbPlans } = dureeTotaleScenario(sortie);
  if (nbPlans === 0) return [];
  const bas = Math.ceil(cibleSecondes * (1 - ECART_DUREE_TOLERE));
  const haut = Math.floor(cibleSecondes * (1 + ECART_DUREE_TOLERE));
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

/** Structure exigée par le skill : chaque description a un RÉCIT (pas seulement des répliques) et n'a plus de ligne « État en fin de plan »
 * (retirée le 2026-11-08 : une `suite` prolonge le rendu précédent par son latent ; la fin du plan se lit dans son dernier temps). Un manque est
 * une ERREUR, donc un renvoi au modèle. Aucune règle de disposition : elle varie avec chaque scène. Pur. */
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
