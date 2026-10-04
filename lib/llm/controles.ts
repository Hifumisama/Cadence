import { corrigerCodesInconnus } from "../agents/codes-proches";
import { corpusExemplesPlanH3 } from "../agents/plan-h3-corpus";
import { controlerSortiePlanH3, type SortiePlanH3 } from "../agents/plan-h3-controles";
import { contexteDepuisEntree, controlerSortieIterationPlan, type SortieIterationPlan } from "../agents/iteration-plan";

/** Contrôles SÉMANTIQUES d'un skill, appliqués à une sortie qui respecte déjà le schéma : ce que le
 * schéma ne sait pas dire (un code d'asset recopié de travers, un timecode qui recule…). S'il en trouve,
 * l'exécuteur renvoie UNE fois le modèle avec la liste ; si le défaut persiste, la sortie est gardée et
 * ses problèmes apparaîtront dans la revue (jamais de JSON réparé en silence). Seules les ERREURS de
 * contrat déclenchent un renvoi ; les alertes se lisent à la revue. */
export type Controleur = (json: unknown) => string[];

export function controleurPourSkill(skill: string, entree: unknown): Controleur | undefined {
  if (skill === "plan-h3") {
    const e = (entree ?? {}) as { registre?: { code: string; type: string }[]; repliques?: { texte: string }[] };
    const ctx = {
      registre: (e.registre ?? []).map((a) => ({ code: a.code, type: a.type })),
      repliques: (e.repliques ?? []).map((r) => ({ texte: r.texte })),
      corpusExemples: corpusExemplesPlanH3(),
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
  return undefined;
}
