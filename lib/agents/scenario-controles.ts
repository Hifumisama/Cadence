import { ECART_DUREE_TOLERE } from "./conversion";

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

/** Structure exigée par le skill (état en fin de plan) : un manque est une ERREUR, donc un renvoi au modèle. Sans elle, le modèle l'oublie
 * (le suivi d'état est ce qui porte la continuité d'un plan à l'autre). Aucune règle de disposition : elle varie avec chaque scène. Pur. */
export function controlerStructureScenario(sortie: { scenes?: { titre?: string; plans?: { titre?: string; description?: string }[] }[] }): string[] {
  const erreurs: string[] = [];
  for (const scene of sortie.scenes ?? []) {
    for (const plan of scene.plans ?? []) {
      if (!/[ée]tat en fin de plan\s*:/i.test(plan.description ?? "")) {
        erreurs.push(`Le plan « ${plan.titre ?? "?"} » : sa description doit se terminer par « État en fin de plan : … » (où se tiennent les personnages qui comptent et vers quoi ils sont tournés, par rapport aux repères fixes du lieu et non à la caméra ; l'état de ce qui a changé : feu allumé ou éteint, créature présente ou non). N'y écris que ce que la description a montré.`);
      }
    }
  }
  return erreurs;
}
