import { decouperSections, ORDRE_SECTIONS, validerPromptColle, type NomSection } from "../plans/prompt";
import { normaliserReplique, separerDescription } from "./brief";

/** « Partir de cet essai » : la consigne se joue sur le PROMPT de l'essai (`jobs.prompt_utilise`), pas sur une recompilation. Le skill `retouche-prompt`
 * (agents/skills/retouche-prompt) en fait la plus petite retouche ; ce fichier, PUR, prépare son entrée et vérifie sa sortie (labels, répliques mot pour mot,
 * étendue de la retouche). Le worker l'appelle depuis worker/h3ir.ts ; si le skill juge qu'il faut tout refaire (`refonte`), la compilation d'Open H3 IR prend le relais. */

export const SKILL_RETOUCHE = "retouche-prompt";

export type SectionsPrompt = Record<NomSection, string>;

/** Ce que la tâche porte pour retoucher (`EntreeH3ir.retouche`). */
export type EntreeRetouche = {
  /** Le numéro de l'essai dont on part. */
  numeroRendu: number;
  consigne: string;
  /** Les six sections du prompt de cet essai. */
  sections: SectionsPrompt;
  /** Les répliques que le prompt doit porter une fois retouché (celles de la description voulue du plan), `Nom | texte`. */
  repliques: { nom: string; texte: string }[];
  /** La description du plan telle qu'elle sera après la retouche (français), donnée au skill comme référence. */
  descriptionApres: string;
  /** La description du plan telle qu'elle était à l'essai dont on part, quand elle diffère de celle d'après : c'est la différence entre les deux qui dit quoi reporter. */
  descriptionAvant?: string;
};

export type SortieRetouche = {
  refonte: boolean;
  raison: string;
  sections: SectionsPrompt;
  modifications: string[];
};

/** Ce que la tâche range dans `agent_runs.resultat` quand la retouche a abouti (distinct de `ResultatH3ir` par `moteur`). */
export type ResultatRetouche = {
  moteur: "retouche";
  planUuid: string;
  depuisNumero: number;
  sections: SectionsPrompt;
  /** Les sections qui ont changé, avec le texte avant / après (pour la revue). */
  passages: { section: string; avant: string; apres: string }[];
  modifications: string[];
  modeleRetouche: string;
};

export const estResultatRetouche = (r: unknown): r is ResultatRetouche => !!r && typeof r === "object" && (r as { moteur?: unknown }).moteur === "retouche";

/** Les six sections d'un prompt assemblé (`jobs.prompt_utilise`) ; null s'il n'est pas complet. */
export function sectionsDuPrompt(prompt: string | null | undefined): SectionsPrompt | null {
  const texte = (prompt ?? "").replace(/\r\n/g, "\n").trim();
  if (!texte || validerPromptColle(texte).erreurs.length > 0) return null;
  const s = decouperSections(texte);
  return s.summary.trim() && s.detailed_description.trim() ? s : null;
}

/** Les répliques d'une description de plan, prêtes à comparer au prompt (même normalisation que le brief d'Open H3 IR). */
export function repliquesDeDescription(description: string): { nom: string; texte: string }[] {
  return separerDescription(description)
    .repliques.map((r) => ({ nom: r.nom.trim(), texte: normaliserReplique(r.texte) }))
    .filter((r) => r.texte);
}

/** Le message unique que reçoit le skill. */
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

/** Forme comparable d'une parole : espaces réduits, point final ignoré (le compilateur lui-même en met un à « l'Air » ; `!`, `?` et `…` comptent). */
const canon = (s: string) => normaliserReplique(s).replace(/\s+/g, " ").replace(/\.+$/, "").trim();
const LABELS = /<(?:Subject|Picture|Audio|Video)\s*\d+>/gi;

/** Les paroles d'un prompt : le contenu de chaque `<d>…</d>`, sans l'étiquette de langue `[French]`. */
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

/** Part du texte qui change entre deux versions : tout ce qui reste entre le préfixe et le suffixe communs, rapporté à la taille du texte d'avant. */
export function etenduePassage(avant: string, apres: string): number {
  if (avant === apres) return 0;
  let p = 0;
  while (p < avant.length && p < apres.length && avant[p] === apres[p]) p++;
  let s = 0;
  while (s < avant.length - p && s < apres.length - p && avant[avant.length - 1 - s] === apres[apres.length - 1 - s]) s++;
  return Math.max(avant.length - p - s, apres.length - p - s) / Math.max(avant.length, 1);
}

/** Au-delà, une section a été réécrite et non retouchée. */
const ETENDUE_MAX_SECTION = 0.5;

/** Contrôle ce que le skill a rendu ; une liste vide = la retouche est acceptable. */
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

/** Les sections qui ont changé, avec avant / après. */
export function passagesChanges(base: SectionsPrompt, apres: SectionsPrompt): { section: string; avant: string; apres: string }[] {
  return ORDRE_SECTIONS.filter((nom) => base[nom] !== apres[nom]).map((nom) => ({ section: nom, avant: base[nom], apres: apres[nom] }));
}

export type EssaiDeDepart = { prompt: string | null; description: string | null; duree: number | null };

/** « Partir de cet essai » : que fait-on des décisions d'« Itérer » ? Une retouche du prompt de l'essai quand les décisions ne touchent QUE la description (ni durée,
 * ni références, ni réglages) et que l'essai a gardé un prompt complet, sa durée et une description. Sinon `retouche` est null et les décisions se recompilent
 * comme avant. Quand elle est possible, le plan repart de l'état de l'essai : sa description (si les décisions n'en donnent pas) et sa durée vont avec son prompt. */
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
