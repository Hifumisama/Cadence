import { controlerSortiePlanH3, type SortiePlanH3 } from "../agents/plan-h3-controles";

/** Contrôles SÉMANTIQUES d'un skill, appliqués à une sortie qui respecte déjà le schéma : ce que le
 * schéma ne sait pas dire (un code d'asset recopié de travers, un timecode qui recule…). S'il en trouve,
 * l'exécuteur renvoie UNE fois le modèle avec la liste ; si le défaut persiste, la sortie est gardée et
 * ses problèmes apparaîtront dans la revue (jamais de JSON réparé en silence). Seules les ERREURS de
 * contrat déclenchent un renvoi ; les alertes se lisent à la revue. */
export type Controleur = (json: unknown) => string[];

export function controleurPourSkill(skill: string, entree: unknown): Controleur | undefined {
  if (skill === "plan-h3") {
    const e = (entree ?? {}) as { registre?: { code: string }[]; repliques?: { texte: string }[] };
    const ctx = { codesRegistre: (e.registre ?? []).map((a) => a.code), repliques: (e.repliques ?? []).map((r) => ({ texte: r.texte })) };
    return (json) =>
      controlerSortiePlanH3(json as SortiePlanH3, ctx)
        .filter((p) => p.niveau === "erreur")
        .map((p) => p.message);
  }
  return undefined;
}
