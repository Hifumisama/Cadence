import { chargerBriefPlan, type SurchargeBrief } from "../lib/h3ir/brief-plan";
import type { ResultatBrief } from "../lib/h3ir/brief";
import { compilerAvecRelances, ErreurCompilation, reglagesH3ir, type EnveloppeH3ir, type LanceurPython, type ResultatCompilation } from "../lib/h3ir/compilateur";
import { SKILL_H3IR, SKILL_TRADUCTION, type CompilationReduite, type EntreeH3ir, type ResultatH3ir } from "../lib/h3ir/resultat";
import { executerSkill, type OptionsExecution } from "../lib/llm/executer";
import { messageRetouche, passagesChanges, SKILL_RETOUCHE, verifierRetouche, type EntreeRetouche, type ResultatRetouche, type SortieRetouche } from "../lib/h3ir/retouche";
import { ORDRE_SECTIONS } from "../lib/plans/prompt";

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
  /** Ce que la tâche fait en ce moment (« Traduction de l'intent… », « Compilation, essai 2/3… »), montré à la place du flux de texte. */
  surEtape?: (texte: string) => void;
};

export function lireEntreeH3ir(entree: unknown): EntreeH3ir {
  const e = entree as Partial<EntreeH3ir> | null;
  if (!e || typeof e.planUuid !== "string") throw new Error("Tâche Open H3 IR sans plan.");
  // Décisions d'« Itérer » à compiler à la place de ce qui est en base (description, durée, références, réglages du plan) : seulement quand la tâche en porte.
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

/** « Partir de cet essai » : la consigne se joue sur le prompt de l'essai (skill `retouche-prompt`). Deux tentatives (la seconde reçoit les défauts de la première) ;
 * `null` quand le skill juge qu'il faut tout refaire : la compilation prend alors le relais. Une retouche qui reste invalide échoue avec ses défauts : mieux vaut le dire
 * que de recompiler en silence et perdre le rendu dont on part. */
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
): Promise<{ json: ResultatH3ir | ResultatRetouche; modele: string; usage: { entree: number; sortie: number } }> {
  if (run.projectId == null) throw new Error("Tâche Open H3 IR sans projet.");
  const entree = lireEntreeH3ir(run.entree);
  const executer = deps.executer ?? executerSkill;
  const charger = deps.charger ?? chargerBriefPlan;

  // Partir d'un essai : on retouche son prompt. Seule une « refonte » (ou l'absence de prompt) laisse la place à la compilation.
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
    usage: { entree: traduction.usage.entree + usageRetouche.entree, sortie: traduction.usage.sortie + usageRetouche.sortie },
  };
}

/** Le texte traduit, prêt pour le compilateur : un guillemet droit y serait lu comme du texte à afficher à l'écran. */
export function nettoyerIntent(brut: unknown): string {
  return typeof brut === "string" ? brut.replace(/"/g, "'").trim() : "";
}
