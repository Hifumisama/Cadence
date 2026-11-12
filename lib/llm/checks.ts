import { controlerDureeScenario, controlerStructureScenario } from "../agents/screenplay-checks";
import { controlerTraitement } from "../agents/treatment";
import { contexteDepuisEntree, controlerSortieIterationPlan, type SortieIterationPlan } from "../agents/iteration-clip";
import { problemesDeRelecture, type EntreeRelecture, type SortieRelecture } from "../agents/review";
import { contexteReferencesDepuisEntree, controlerReferences, type SortieInventaire } from "../agents/inventory";
import { corrigerCodesReferencesPlan, problemesReferencesPlan, SKILL_REFERENCES_PLAN, type EntreeSkillReferencesPlan, type SortieReferencesPlan } from "../agents/references-clip";

/** SEMANTIC checks of a skill, applied to an output that already respects the schema: what the
 * schema cannot express (an asset code copied wrongly, a timecode going backwards…). If it finds some,
 * the executor sends the model back ONCE with the list; if the defect persists, the output is kept and
 * its problems will appear in the review (never silently repaired JSON). Only CONTRACT ERRORS trigger
 * a resend; warnings are read in the review. */
export type Controleur = (json: unknown) => string[];

export function controleurPourSkill(skill: string, entree: unknown): Controleur | undefined {
  if (skill === SKILL_REFERENCES_PLAN) {
    // Known codes (a misquoted linking word is matched first), no sound or voice, 6 images and 2 missing at most, a missing one that does not duplicate the existing one.
    const e = (entree ?? {}) as EntreeSkillReferencesPlan;
    if (!Array.isArray(e.candidats)) return undefined;
    const ctx: EntreeSkillReferencesPlan = { ...e, assetsProposesParLeLot: e.assetsProposesParLeLot ?? [] };
    const codes = [...ctx.candidats.map((c) => c.code), ...ctx.assetsProposesParLeLot.map((a) => a.code)];
    return (json) => problemesReferencesPlan(corrigerCodesReferencesPlan(json as SortieReferencesPlan, codes).sortie, ctx);
  }
  if (skill === "iteration-plan") {
    // The input is the one the worker sends (text, actual duration included), never the contact sheet of images.
    const ctx = contexteDepuisEntree(entree);
    return (json) =>
      controlerSortieIterationPlan(json as SortieIterationPlan, ctx)
        .filter((p) => p.niveau === "erreur")
        .map((p) => p.message);
  }
  if (skill === "relecture-scenario") {
    // Minimal corrections, without a pointer to another clip, that keep the story, the author's words and the duration: one defect = one resend.
    const e = (entree ?? {}) as EntreeRelecture;
    if (!Array.isArray(e.plans)) return undefined;
    return (json) => problemesDeRelecture(json as SortieRelecture, e).map((x) => x.message);
  }
  if (skill === "inventaire-assets") {
    // Each clip's references (2026-11-09): known codes (registry, assets already proposed, assets of the answer), no sound, 6 images at most,
    // one entry per clip. What the code fixes alone (duplicate, second set, second face, uncited keyframe) is only a warning.
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
    // Durations are brought back to the target by the code (ajusterDureesScene): only the structure of the descriptions is checked, as for an episode.
    return (json) => controlerStructureScenario({ scenes: [{ plans: (json as { plans?: { titre?: string; description?: string }[] }).plans }] });
  }
  if (skill === "scenario-episode") {
    // Only a WHOLE episode screenplay is compared to the target duration (a clip to insert or correct is only a piece of it).
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
