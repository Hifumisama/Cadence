import { chargerBriefPlan, type SurchargeBrief } from "../lib/h3ir/brief-clip";
import type { ResultatBrief } from "../lib/h3ir/brief";
import { compilerAvecRelances, ErreurCompilation, reglagesH3ir, type EnveloppeH3ir, type LanceurPython, type ResultatCompilation } from "../lib/h3ir/compiler";
import { SKILL_H3IR, SKILL_TRADUCTION, type CompilationReduite, type EntreeH3ir, type ResultatH3ir } from "../lib/h3ir/result";
import { executerSkill, type OptionsExecution } from "../lib/llm/execute";
import { messageRetouche, passagesChanges, SKILL_RETOUCHE, verifierRetouche, type EntreeRetouche, type ResultatRetouche, type SortieRetouche } from "../lib/h3ir/retouch";
import { ORDRE_SECTIONS } from "../lib/clips/prompt";

/** The « clip sheet » task with the Open H3 IR compiler (virtual skill `plan-h3ir`, no folder under agents/skills): launched by `traiterTacheLlm`
 * in place of `executerSkill`. Three steps, under the same GPU lock as an ordinary LLM call:
 *  1. the clip's brief (lib/h3ir/brief-clip.ts): refused → the run fails with the reason, nothing is written;
 *  2. the intent is translated into English by the skill `traduction-intent` (once, not at each retry);
 *  3. the compilation, with seed retries (lib/h3ir/compiler.ts).
 * The result is what is stored in `agent_runs.resultat` (BriefIn sent, original and translated intent, reduced envelope, attempts); the conversion into
 * a sheet is done separately (worker/agents/postProcessing.ts, lib/h3ir/conversion.ts). */

export { SKILL_H3IR, SKILL_TRADUCTION };
export type { CompilationReduite, EntreeH3ir, ResultatH3ir };

export type DepsH3ir = {
  executer?: typeof executerSkill;
  charger?: (
    projectId: number,
    planUuid: string,
    options: { shots?: number | null; director?: string | null; creativity?: string | null },
    surcharge?: SurchargeBrief,
  ) => Promise<ResultatBrief | null>;
  lancer?: LanceurPython;
  env?: Record<string, string | undefined>;
};

export type OptionsH3ir = {
  modele: string;
  signal: AbortSignal;
  enregistrer?: OptionsExecution["enregistrer"];
  /** What the task is doing right now (« Traduction de l'intent… », « Compilation, essai 2/3… »), shown in place of the text stream. */
  surEtape?: (texte: string) => void;
};

export function lireEntreeH3ir(entree: unknown): EntreeH3ir {
  const e = entree as Partial<EntreeH3ir> | null;
  if (!e || typeof e.planUuid !== "string") throw new Error("Tâche Open H3 IR sans plan.");
  // « Itérer » decisions to compile in place of what is in the database (description, duration, references, clip settings): only when the task carries them.
  const description = typeof e.description === "string" && e.description.trim() ? e.description : null;
  const duree = typeof e.dureeSecondes === "number" && Number.isInteger(e.dureeSecondes) ? e.dureeSecondes : null;
  const codes = (v: unknown): string[] => (Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && !!c.trim()) : []);
  const references = e.references ? { ajouter: codes(e.references.ajouter), retirer: codes(e.references.retirer) } : null;
  const r = e.reglagesPlan;
  const reglagesPlan = r && (typeof r.creativite === "string" || typeof r.styleCamera === "string") ? { creativite: typeof r.creativite === "string" ? r.creativite : null, styleCamera: typeof r.styleCamera === "string" ? r.styleCamera : null } : null;
  const retouche = lireRetouche(e.retouche);
  return {
    planUuid: e.planUuid,
    shots: e.shots ?? null,
    director: e.director ?? null,
    creativity: e.creativity ?? null,
    ...(description ? { description } : {}),
    ...(duree != null ? { dureeSecondes: duree } : {}),
    ...(references && references.ajouter.length + references.retirer.length > 0 ? { references } : {}),
    ...(reglagesPlan ? { reglagesPlan } : {}),
    ...(retouche ? { retouche } : {}),
  };
}

function lireRetouche(v: unknown): EntreeRetouche | null {
  const r = v as Partial<EntreeRetouche> | null | undefined;
  if (!r || typeof r !== "object" || typeof r.consigne !== "string" || typeof r.numeroRendu !== "number" || !r.sections || typeof r.descriptionApres !== "string") return null;
  const sections = Object.fromEntries(ORDRE_SECTIONS.map((nom) => [nom, typeof r.sections![nom] === "string" ? r.sections![nom] : ""])) as EntreeRetouche["sections"];
  const repliques = Array.isArray(r.repliques) ? r.repliques.filter((x): x is { nom: string; texte: string } => !!x && typeof x.nom === "string" && typeof x.texte === "string") : [];
  return { numeroRendu: r.numeroRendu, consigne: r.consigne, sections, repliques, descriptionApres: r.descriptionApres, ...(typeof r.descriptionAvant === "string" && r.descriptionAvant.trim() ? { descriptionAvant: r.descriptionAvant } : {}) };
}

/** « Partir de cet essai »: the instruction is played on the attempt's prompt (skill `retouche-prompt`). Two attempts (the second receives the defects of the first);
 * `null` when the skill judges that everything must be redone: the compilation then takes over. A retouch that stays invalid fails with its defects: better to say so
 * than to recompile silently and lose the render we start from. */
async function retoucherPrompt(
  e: EntreeRetouche,
  run: { projectId: number; planUuid: string },
  options: OptionsH3ir,
  executer: typeof executerSkill,
): Promise<{ resultat: ResultatRetouche; modele: string; usage: { entree: number; sortie: number } } | { refonte: string; usage: { entree: number; sortie: number } }> {
  let defauts: string[] = [];
  const usage = { entree: 0, sortie: 0 };
  for (let essai = 1; essai <= 2; essai++) {
    options.surEtape?.(essai === 1 ? `Retouche du prompt de l'essai n°${e.numeroRendu}…` : "Retouche du prompt : seconde tentative…");
    const message = defauts.length
      ? [messageRetouche(e), "PROBLEMS TO FIX (your previous answer was rejected):", ...defauts.map((d) => `- ${d}`)].join("\n\n")
      : messageRetouche(e);
    const r = await executer(SKILL_RETOUCHE, message, { projectId: run.projectId, modele: options.modele, temperature: 0.1, signal: options.signal, enregistrer: options.enregistrer });
    usage.entree += r.usage.entree;
    usage.sortie += r.usage.sortie;
    const sortie = r.json as SortieRetouche;
    if (sortie.refonte === true) return { refonte: String(sortie.raison ?? "").trim() || "la consigne demande de refaire le plan", usage };
    defauts = verifierRetouche(e.sections, sortie, e.repliques);
    if (defauts.length === 0) {
      return {
        resultat: {
          moteur: "retouche",
          planUuid: run.planUuid,
          depuisNumero: e.numeroRendu,
          sections: sortie.sections,
          passages: passagesChanges(e.sections, sortie.sections),
          modifications: (sortie.modifications ?? []).filter((m) => typeof m === "string" && m.trim()),
          modeleRetouche: r.modele,
        },
        modele: r.modele,
        usage,
      };
    }
  }
  throw new Error(`La retouche du prompt de l'essai n°${e.numeroRendu} n'est pas valable : ${defauts.join(" ; ")}. Rien n'a été écrit.`);
}

/** Reduces the envelope: the whole prompt is redundant (the sections rebuild it), the rest serves the sheet and understanding a failure. */
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
): Promise<{ json: ResultatH3ir | ResultatRetouche; modele: string; usage: { entree: number; sortie: number } }> {
  if (run.projectId == null) throw new Error("Tâche Open H3 IR sans projet.");
  const entree = lireEntreeH3ir(run.entree);
  const executer = deps.executer ?? executerSkill;
  const charger = deps.charger ?? chargerBriefPlan;

  // Starting from an attempt: we retouch its prompt. Only a « refonte » (or the absence of a prompt) leaves room for the compilation.
  let usageRetouche = { entree: 0, sortie: 0 };
  if (entree.retouche) {
    const r = await retoucherPrompt(entree.retouche, { projectId: run.projectId, planUuid: entree.planUuid }, options, executer);
    if ("resultat" in r) return { json: r.resultat, modele: r.modele, usage: r.usage };
    usageRetouche = r.usage;
    options.surEtape?.(`Le prompt de l'essai ne se retouche pas (${r.refonte}) : recompilation.`);
  }

  options.surEtape?.("Préparation du brief…");
  const surcharge: SurchargeBrief | undefined =
    entree.description || entree.dureeSecondes != null || entree.references || entree.reglagesPlan
      ? {
          description: entree.description ?? null,
          dureeSecondes: entree.dureeSecondes ?? null,
          ...(entree.references ? { references: entree.references } : {}),
          ...(entree.reglagesPlan ? { reglages: entree.reglagesPlan } : {}),
        }
      : undefined;
  const r = await charger(run.projectId, entree.planUuid, { shots: entree.shots, director: entree.director, creativity: entree.creativity }, surcharge);
  if (!r) throw new Error("Plan introuvable.");
  if (!r.brief) throw new Error(r.refus ?? "Le brief Open H3 IR est refusé.");
  const brief = r.brief;

  // The config is read BEFORE the LLM: a missing Python fails straight away, without having taken the GPU for nothing.
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
    usage: { entree: traduction.usage.entree + usageRetouche.entree, sortie: traduction.usage.sortie + usageRetouche.sortie },
  };
}

/** The translated text, ready for the compiler: a straight quote would be read there as text to display on screen. */
export function nettoyerIntent(brut: unknown): string {
  return typeof brut === "string" ? brut.replace(/"/g, "'").trim() : "";
}
