import { decouperSections, ORDRE_SECTIONS, validerPromptColle, type NomSection } from "../clips/prompt";
import { normaliserReplique, separerDescription } from "./brief";

/** « Partir de cet essai »: the directive plays on the PROMPT of the attempt (`jobs.prompt_utilise`), not on a recompilation. The skill `retouche-prompt`
 * (agents/skills/retouche-prompt) makes the smallest retouch of it; this file, PURE, prepares its input and checks its output (labels, lines word for word,
 * extent of the retouch). The worker calls it from worker/h3ir.ts; if the skill judges that everything must be redone (`refonte`), the Open H3 IR compilation takes over. */

export const SKILL_RETOUCHE = "retouche-prompt";

export type SectionsPrompt = Record<NomSection, string>;

/** What the task carries to retouch (`EntreeH3ir.retouche`). */
export type EntreeRetouche = {
  /** The number of the attempt we start from. */
  numeroRendu: number;
  consigne: string;
  /** The six sections of this attempt's prompt. */
  sections: SectionsPrompt;
  /** The lines the prompt must carry once retouched (those of the wanted clip description), `Nom | texte`. */
  repliques: { nom: string; texte: string }[];
  /** The clip's description as it will be after the retouch (French), given to the skill as a reference. */
  descriptionApres: string;
  /** The clip's description as it was at the attempt we start from, when it differs from the one after: the difference between the two says what to carry over. */
  descriptionAvant?: string;
};

export type SortieRetouche = {
  refonte: boolean;
  raison: string;
  sections: SectionsPrompt;
  modifications: string[];
};

/** What the task stores in `agent_runs.resultat` when the retouch succeeded (distinct from `ResultatH3ir` by `moteur`). */
export type ResultatRetouche = {
  moteur: "retouche";
  planUuid: string;
  depuisNumero: number;
  sections: SectionsPrompt;
  /** The sections that changed, with the text before / after (for the review). */
  passages: { section: string; avant: string; apres: string }[];
  modifications: string[];
  modeleRetouche: string;
};

export const estResultatRetouche = (r: unknown): r is ResultatRetouche => !!r && typeof r === "object" && (r as { moteur?: unknown }).moteur === "retouche";

/** The six sections of an assembled prompt (`jobs.prompt_utilise`); null if it is not complete. */
export function sectionsDuPrompt(prompt: string | null | undefined): SectionsPrompt | null {
  const texte = (prompt ?? "").replace(/\r\n/g, "\n").trim();
  if (!texte || validerPromptColle(texte).erreurs.length > 0) return null;
  const s = decouperSections(texte);
  return s.summary.trim() && s.detailed_description.trim() ? s : null;
}

/** The lines of a clip description, ready to compare with the prompt (same normalisation as the Open H3 IR brief). */
export function repliquesDeDescription(description: string): { nom: string; texte: string }[] {
  return separerDescription(description)
    .repliques.map((r) => ({ nom: r.nom.trim(), texte: normaliserReplique(r.texte) }))
    .filter((r) => r.texte);
}

/** The single message the skill receives. */
export function messageRetouche(e: EntreeRetouche): string {
  const prompt = ORDRE_SECTIONS.map((nom) => `${nom}:\n${e.sections[nom] ?? ""}`).join("\n\n");
  return [
    `INSTRUCTION:\n${e.consigne.trim()}`,
    ...(e.descriptionAvant?.trim() && e.descriptionAvant.trim() !== e.descriptionApres.trim()
      ? [`PLAN DESCRIPTION BEFORE (the render the prompt comes from):\n${e.descriptionAvant.trim()}`]
      : []),
    `PLAN DESCRIPTION NOW:\n${e.descriptionApres.trim()}`,
    `SPOKEN LINES REQUIRED:\n${e.repliques.length ? e.repliques.map((r) => `${r.nom} | ${r.texte}`).join("\n") : "(none)"}`,
    `PROMPT:\n${prompt}`,
  ].join("\n\n");
}

/** Comparable form of a line of speech: spaces reduced, final full stop ignored (the compiler itself puts one after « l'Air »; `!`, `?` and `…` count). */
const canon = (s: string) => normaliserReplique(s).replace(/\s+/g, " ").replace(/\.+$/, "").trim();
const LABELS = /<(?:Subject|Picture|Audio|Video)\s*\d+>/gi;

/** The speech of a prompt: the content of each `<d>…</d>`, without the language tag `[French]`. */
function parolesDesSections(sections: SectionsPrompt): string[] {
  const out: string[] = [];
  for (const nom of ORDRE_SECTIONS) {
    for (const m of (sections[nom] ?? "").matchAll(/<d>\s*(?:\[[^\]]*\]\s*)?([\s\S]*?)<\/d>/gi)) out.push(canon(m[1] ?? ""));
  }
  return out;
}

function labelsDe(sections: SectionsPrompt): string[] {
  const l: string[] = [];
  for (const nom of ORDRE_SECTIONS) for (const m of (sections[nom] ?? "").matchAll(LABELS)) l.push(m[0].replace(/\s+/g, "").toLowerCase());
  return l.sort();
}

/** Share of the text that changes between two versions: everything that remains between the common prefix and suffix, relative to the size of the text before. */
export function etenduePassage(avant: string, apres: string): number {
  if (avant === apres) return 0;
  let p = 0;
  while (p < avant.length && p < apres.length && avant[p] === apres[p]) p++;
  let s = 0;
  while (s < avant.length - p && s < apres.length - p && avant[avant.length - 1 - s] === apres[apres.length - 1 - s]) s++;
  return Math.max(avant.length - p - s, apres.length - p - s) / Math.max(avant.length, 1);
}

/** Beyond this, a section has been rewritten and not retouched. */
const ETENDUE_MAX_SECTION = 0.5;

/** Checks what the skill returned; an empty list = the retouch is acceptable. */
export function verifierRetouche(base: SectionsPrompt, sortie: SortieRetouche, repliques: { texte: string }[]): string[] {
  const p: string[] = [];
  const s = sortie.sections;
  for (const nom of ORDRE_SECTIONS) if (typeof s?.[nom] !== "string") p.push(`la section « ${nom} » manque`);
  if (p.length) return p;
  if (!s.summary.trim() || !s.detailed_description.trim()) p.push("le résumé ou la description détaillée est vide");

  const a = labelsDe(base).join(" ");
  const b = labelsDe(s).join(" ");
  if (a !== b) p.push(`les étiquettes <Subject>/<Picture>/<Audio> ne sont plus les mêmes (avant : ${a || "aucune"} ; après : ${b || "aucune"})`);

  const attendues = repliques.map((r) => canon(r.texte)).sort();
  const presentes = parolesDesSections(s).sort();
  for (const t of attendues) {
    const n = presentes.filter((x) => x === t).length;
    if (n !== 1) p.push(n === 0 ? `la réplique « ${t} » n'est pas reprise mot pour mot dans un bloc <d>` : `la réplique « ${t} » est dite ${n} fois`);
  }
  for (const t of presentes) if (!attendues.includes(t)) p.push(`la parole « ${t} » n'est pas dans les répliques voulues`);

  const changees = ORDRE_SECTIONS.filter((nom) => s[nom] !== base[nom]);
  if (changees.length === 0) p.push("rien n'a été changé dans le prompt");
  for (const nom of changees) {
    const e = etenduePassage(base[nom], s[nom]);
    if (base[nom].length > 300 && e > ETENDUE_MAX_SECTION) p.push(`la section « ${nom} » est réécrite en grande partie (${Math.round(e * 100)} % du texte), pas retouchée`);
  }
  return p;
}

/** The sections that changed, with before / after. */
export function passagesChanges(base: SectionsPrompt, apres: SectionsPrompt): { section: string; avant: string; apres: string }[] {
  return ORDRE_SECTIONS.filter((nom) => base[nom] !== apres[nom]).map((nom) => ({ section: nom, avant: base[nom], apres: apres[nom] }));
}

export type EssaiDeDepart = { prompt: string | null; description: string | null; duree: number | null };

/** « Partir de cet essai »: what do we do with the decisions of « Itérer »? A retouch of the attempt's prompt when the decisions touch ONLY the description (neither duration,
 * nor references, nor settings) and the attempt kept a complete prompt, its duration and a description. Otherwise `retouche` is null and the decisions are
 * recompiled as before. When it is possible, the clip starts again from the attempt's state: its description (if the decisions give none) and its duration go with its prompt. */
export function preparerDepart(
  decisions: { description: string | null; duree: number | null; references: boolean; reglages: boolean },
  depuisNumero: number | null | undefined,
  essai: EssaiDeDepart | null | undefined,
  consigne: string,
  dureeValide: (n: number) => boolean,
): { retouche: EntreeRetouche | null; description: string | null; duree: number | null } {
  const inchange = { retouche: null, description: decisions.description, duree: decisions.duree };
  if (depuisNumero == null || decisions.references || decisions.reglages || decisions.duree != null || !essai) return inchange;
  const sections = sectionsDuPrompt(essai.prompt);
  const duree = essai.duree != null && Number.isInteger(essai.duree) && dureeValide(essai.duree) ? essai.duree : null;
  const description = decisions.description ?? ((essai.description ?? "").trim() || null);
  if (!sections || duree == null || !description) return inchange;
  return { retouche: { numeroRendu: depuisNumero, consigne: consigne.trim(), sections, repliques: repliquesDeDescription(description), descriptionApres: description, ...((essai.description ?? "").trim() && (essai.description ?? "").trim() !== description.trim() ? { descriptionAvant: essai.description!.trim() } : {}) }, description, duree };
}
