import { controlerDureeScenario, controlerStructureScenario } from "../agents/scenario-controles";
import { controlerTraitement } from "../agents/traitement";
import { contexteDepuisEntree, controlerSortieIterationPlan, type SortieIterationPlan } from "../agents/iteration-plan";
import { problemesDeRelecture, type EntreeRelecture, type SortieRelecture } from "../agents/relecture";
import { contexteReferencesDepuisEntree, controlerReferences, type SortieInventaire } from "../agents/inventaire";
import { corrigerCodesReferencesPlan, problemesReferencesPlan, SKILL_REFERENCES_PLAN, type EntreeSkillReferencesPlan, type SortieReferencesPlan } from "../agents/references-plan";

/** Contrôles SÉMANTIQUES d'un skill, appliqués à une sortie qui respecte déjà le schéma : ce que le
 * schéma ne sait pas dire (un code d'asset recopié de travers, un timecode qui recule…). S'il en trouve,
 * l'exécuteur renvoie UNE fois le modèle avec la liste ; si le défaut persiste, la sortie est gardée et
 * ses problèmes apparaîtront dans la revue (jamais de JSON réparé en silence). Seules les ERREURS de
 * contrat déclenchent un renvoi ; les alertes se lisent à la revue. */
export type Controleur = (json: unknown) => string[];

export function controleurPourSkill(skill: string, entree: unknown): Controleur | undefined {
  if (skill === SKILL_REFERENCES_PLAN) {
    // Des codes connus (un mot de liaison mal recopié est rapproché d'abord), ni son ni voix, 6 images et 2 manquants au plus, un manquant qui ne double pas l'existant.
    const e = (entree ?? {}) as EntreeSkillReferencesPlan;
    if (!Array.isArray(e.candidats)) return undefined;
    const ctx: EntreeSkillReferencesPlan = { ...e, assetsProposesParLeLot: e.assetsProposesParLeLot ?? [] };
    const codes = [...ctx.candidats.map((c) => c.code), ...ctx.assetsProposesParLeLot.map((a) => a.code)];
    return (json) => problemesReferencesPlan(corrigerCodesReferencesPlan(json as SortieReferencesPlan, codes).sortie, ctx);
  }
  if (skill === "iteration-plan") {
    // L'entrée est celle que le worker envoie (texte, durée réelle comprise), jamais la planche d'images.
    const ctx = contexteDepuisEntree(entree);
    return (json) =>
      controlerSortieIterationPlan(json as SortieIterationPlan, ctx)
        .filter((p) => p.niveau === "erreur")
        .map((p) => p.message);
  }
  if (skill === "relecture-scenario") {
    // Des corrections minimales, sans renvoi à un autre plan, qui gardent le récit, les mots de l'auteur et la durée : un défaut = un renvoi.
    const e = (entree ?? {}) as EntreeRelecture;
    if (!Array.isArray(e.plans)) return undefined;
    return (json) => problemesDeRelecture(json as SortieRelecture, e).map((x) => x.message);
  }
  if (skill === "inventaire-assets") {
    // Les références de chaque plan (2026-11-09) : codes connus (registre, assets déjà proposés, assets de la réponse), aucun son, 6 images au plus,
    // une entrée par plan. Ce que le code corrige seul (doublon, second décor, second visage, keyframe non citée) n'est qu'une alerte.
    return (json) => {
      const sortie = json as SortieInventaire;
      return controlerReferences(sortie, contexteReferencesDepuisEntree(entree, sortie))
        .problemes.filter((p) => p.niveau === "erreur")
        .map((p) => p.message);
    };
  }
  if (skill === "traitement-episode") {
    const vise = ((entree ?? {}) as { nombreDeScenes?: { min: number; max: number } }).nombreDeScenes;
    if (!vise) return undefined;
    return (json) => controlerTraitement(json as Parameters<typeof controlerTraitement>[0], vise);
  }
  if (skill === "scenario-scene") {
    // Les durées sont ramenées à la cible par le code (ajusterDureesScene) : seule la structure des descriptions est contrôlée, comme pour un épisode.
    return (json) => controlerStructureScenario({ scenes: [{ plans: (json as { plans?: { titre?: string; description?: string }[] }).plans }] });
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
