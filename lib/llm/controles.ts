import { corrigerCodesInconnus } from "../agents/codes-proches";
import { corpusExemplesPlanH3 } from "../agents/plan-h3-corpus";
import { controlerSortiePlanH3, type SortiePlanH3 } from "../agents/plan-h3-controles";
import { controlerDureeScenario, controlerStructureScenario } from "../agents/scenario-controles";
import { contexteDepuisEntree, controlerSortieIterationPlan, type SortieIterationPlan } from "../agents/iteration-plan";
import { problemesDeRelecture, type EntreeRelecture, type SortieRelecture } from "../agents/relecture";
import { controleurAnalyse, type ControleAnalyse } from "../agents/revision/entrees";

/** Contrôles SÉMANTIQUES d'un skill, appliqués à une sortie qui respecte déjà le schéma : ce que le
 * schéma ne sait pas dire (un code d'asset recopié de travers, un timecode qui recule…). S'il en trouve,
 * l'exécuteur renvoie UNE fois le modèle avec la liste ; si le défaut persiste, la sortie est gardée et
 * ses problèmes apparaîtront dans la revue (jamais de JSON réparé en silence). Seules les ERREURS de
 * contrat déclenchent un renvoi ; les alertes se lisent à la revue. */
export type Controleur = (json: unknown) => string[];

export function controleurPourSkill(skill: string, entree: unknown): Controleur | undefined {
  if (skill === "plan-h3") {
    const e = (entree ?? {}) as { registre?: { code: string; type: string }[]; plan?: { raccord?: boolean } };
    const ctx = {
      registre: (e.registre ?? []).map((a) => ({ code: a.code, type: a.type })),
      corpusExemples: corpusExemplesPlanH3(),
      // Un plan « suite » garde un emplacement d'image pour le raccord (2026-10-19) : trop d'images citées dans les shots = renvoi du modèle.
      reserveRaccord: e.plan?.raccord === true,
    };
    return (json) =>
      controlerSortiePlanH3(corrigerCodesInconnus(json as SortiePlanH3, ctx.registre.map((a) => a.code)).sortie, ctx)
        .filter((p) => p.niveau === "erreur")
        .map((p) => p.message);
  }
  if (skill === "iteration-plan") {
    // L'entrée est celle que le worker envoie (texte, durée réelle comprise), jamais la planche d'images.
    const ctx = contexteDepuisEntree(entree);
    return (json) =>
      controlerSortieIterationPlan(json as SortieIterationPlan, ctx)
        .filter((p) => p.niveau === "erreur")
        .map((p) => p.message);
  }
  if (skill === "realisateur-analyse") {
    // L'épisode tel que le modèle l'a lu : une poignée inventée, une durée hors limites, un id inconnu sont renvoyés UNE fois.
    return entree ? controleurAnalyse(entree as ControleAnalyse) : undefined;
  }
  if (skill === "relecture-scenario") {
    // Des corrections minimales, sans renvoi à un autre plan, qui gardent « État en fin de plan », les mots de l'auteur et la durée : un défaut = un renvoi.
    const e = (entree ?? {}) as EntreeRelecture;
    if (!Array.isArray(e.plans)) return undefined;
    return (json) => problemesDeRelecture(json as SortieRelecture, e).map((x) => x.message);
  }
  if (skill === "scenario-episode") {
    // Seul un scénario d'épisode ENTIER se compare à la durée visée (un plan à insérer ou à corriger n'en est qu'un morceau).
    const e = (entree ?? {}) as { portee?: { type?: string }; briefExtrait?: { dureeEpisodeSecondes?: number } | null; plansExistants?: unknown[] };
    if (e.portee?.type !== "episode" || (e.plansExistants?.length ?? 0) > 0) return undefined;
    const cible = e.briefExtrait?.dureeEpisodeSecondes;
    return (json) => [
      ...controlerStructureScenario(json as Parameters<typeof controlerStructureScenario>[0]),
      ...controlerDureeScenario(json as Parameters<typeof controlerDureeScenario>[0], cible),
    ];
  }
  return undefined;
}
