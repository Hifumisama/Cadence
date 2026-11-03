import { chargerBriefPlan } from "../lib/h3ir/brief-plan";
import type { ResultatBrief } from "../lib/h3ir/brief";
import { compilerAvecRelances, ErreurCompilation, reglagesH3ir, type EnveloppeH3ir, type LanceurPython, type ResultatCompilation } from "../lib/h3ir/compilateur";
import { SKILL_H3IR, SKILL_TRADUCTION, type CompilationReduite, type EntreeH3ir, type ResultatH3ir } from "../lib/h3ir/resultat";
import { executerSkill, type OptionsExecution } from "../lib/llm/executer";

/** La tâche « fiche de plan » avec le compilateur Open H3 IR (skill virtuel `plan-h3ir`, pas de dossier sous agents/skills) : lancée par `traiterTacheLlm`
 * à la place d'`executerSkill`. Trois temps, sous le même verrou GPU qu'un appel LLM ordinaire :
 *  1. le brief du plan (lib/h3ir/brief-plan.ts) : refusé → le run échoue avec la raison, rien n'est écrit ;
 *  2. l'intent est traduit en anglais par le skill `traduction-intent` (une seule fois, pas à chaque relance) ;
 *  3. la compilation, avec relances de seed (lib/h3ir/compilateur.ts).
 * Le résultat est ce qui est stocké dans `agent_runs.resultat` (BriefIn envoyé, intent d'origine et traduit, enveloppe réduite, tentatives) ; la conversion en
 * fiche est faite à part (worker/agents/postTraitement.ts, lib/h3ir/conversion.ts). */

export { SKILL_H3IR, SKILL_TRADUCTION };
export type { CompilationReduite, EntreeH3ir, ResultatH3ir };

export type DepsH3ir = {
  executer?: typeof executerSkill;
  charger?: (projectId: number, planUuid: string, options: { shots?: number | null; director?: string | null; creativity?: string | null }) => Promise<ResultatBrief | null>;
  lancer?: LanceurPython;
  env?: Record<string, string | undefined>;
};

export type OptionsH3ir = {
  modele: string;
  signal: AbortSignal;
  enregistrer?: OptionsExecution["enregistrer"];
  /** Ce que la tâche fait en ce moment (« Traduction de l'intent… », « Compilation, essai 2/3… »), montré à la place du flux de texte. */
  surEtape?: (texte: string) => void;
};

export function lireEntreeH3ir(entree: unknown): EntreeH3ir {
  const e = entree as Partial<EntreeH3ir> | null;
  if (!e || typeof e.planUuid !== "string") throw new Error("Tâche Open H3 IR sans plan.");
  return { planUuid: e.planUuid, shots: e.shots ?? null, director: e.director ?? null, creativity: e.creativity ?? null };
}

/** Réduit l'enveloppe : le prompt entier est redondant (les sections le recomposent), le reste sert à la fiche et à comprendre un échec. */
export function reduireEnveloppe(e: EnveloppeH3ir): CompilationReduite {
  return {
    status: e.status ?? null,
    source: e.source ?? null,
    mode: e.ir?.mode ?? null,
    promptTokens: e.ir?.prompt_tokens ?? null,
    sections: e.ir?.sections ?? {},
    manifest: e.ir?.manifest ?? [],
    diagnostics: e.ir?.diagnostics ?? [],
    dureeEffectiveSecondes: e.ir?.target?.effective_seconds ?? null,
  };
}

export async function executerH3ir(
  run: { projectId: number | null; entree: unknown },
  options: OptionsH3ir,
  deps: DepsH3ir = {},
): Promise<{ json: ResultatH3ir; modele: string; usage: { entree: number; sortie: number } }> {
  if (run.projectId == null) throw new Error("Tâche Open H3 IR sans projet.");
  const entree = lireEntreeH3ir(run.entree);
  const executer = deps.executer ?? executerSkill;
  const charger = deps.charger ?? chargerBriefPlan;

  options.surEtape?.("Préparation du brief…");
  const r = await charger(run.projectId, entree.planUuid, { shots: entree.shots, director: entree.director, creativity: entree.creativity });
  if (!r) throw new Error("Plan introuvable.");
  if (!r.brief) throw new Error(r.refus ?? "Le brief Open H3 IR est refusé.");
  const brief = r.brief;

  // La config est lue AVANT le LLM : un Python introuvable échoue tout de suite, sans avoir pris de GPU pour rien.
  const reglages = reglagesH3ir(options.modele, deps.env ?? process.env);

  options.surEtape?.("Traduction de l'intent en anglais…");
  const intentFrancais = brief.intent;
  const traduction = await executer(SKILL_TRADUCTION, intentFrancais, {
    projectId: run.projectId,
    modele: options.modele,
    temperature: 0.1,
    signal: options.signal,
    enregistrer: options.enregistrer,
  });
  const intentAnglais = nettoyerIntent((traduction.json as { intent?: unknown }).intent);
  if (!intentAnglais) throw new ErreurCompilation("La traduction de l'intent est vide.");

  const compilation: ResultatCompilation = await compilerAvecRelances(
    { ...brief, intent: intentAnglais },
    {
      reglages,
      signal: options.signal,
      lancer: deps.lancer,
      surTentative: (n, sur) => options.surEtape?.(`Compilation Open H3 IR (essai ${n}/${sur})… une à deux minutes par essai.`),
    },
  );

  return {
    json: {
      moteur: "h3ir",
      planUuid: entree.planUuid,
      brief: { ...brief, intent: intentAnglais, seed: compilation.seedUtilisee },
      intentFrancais,
      intentAnglais,
      liens: r.liens,
      avertissements: r.avertissements,
      compilation: reduireEnveloppe(compilation.enveloppe),
      fichiers: compilation.fichiers,
      tentatives: compilation.tentatives,
      seedUtilisee: compilation.seedUtilisee,
      modeleTraduction: traduction.modele,
    },
    modele: traduction.modele,
    usage: traduction.usage,
  };
}

/** Le texte traduit, prêt pour le compilateur : un guillemet droit y serait lu comme du texte à afficher à l'écran. */
export function nettoyerIntent(brut: unknown): string {
  return typeof brut === "string" ? brut.replace(/"/g, "'").trim() : "";
}
