import type { PromptSection } from "./plan-checks";

// Ordre canonique du format MiniMax H3 — voir
// .claude/skills/fiche-de-plan/references/h3-guide-fullref.md.
export const ORDRE_SECTIONS = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const;

export type NomSection = (typeof ORDRE_SECTIONS)[number];

/** Assemble le prompt final soumis à ComfyUI : concatène les 6 sections dans
 * l'ordre du format H3. Pas de clause de style injectée ici — testé en
 * production (2026-09-29) sans effet mesurable sur la vidéo, contrairement
 * aux images de référence ; la fiche de plan porte déjà le style au début de
 * detailed_description quand il en faut un. */
export function assemblerPrompt(sections: PromptSection[]): string {
  const parSection = new Map(sections.map((s) => [s.section, s.contenu]));
  return ORDRE_SECTIONS.map((nom) => `${nom}:\n${parSection.get(nom) ?? ""}`).join("\n\n");
}

/** Retire un habillage ```text ... ``` (ou ``` ... ``` nu) autour d'un
 * prompt collé, et normalise les fins de ligne. */
export function extraireBlocPrompt(brut: string): string {
  const texte = brut.replace(/\r\n/g, "\n").trim();
  const fence = texte.match(/^```(?:text)?\n([\s\S]*?)\n```$/);
  return (fence ? fence[1] : texte) ?? "";
}

/** Vérifie que les 6 en-têtes canoniques sont tous présents, une seule fois
 * chacun. Ne vérifie pas leur ordre : decouperSections() les retrouve par
 * leur nom, pas par leur position. */
export function validerPromptColle(texte: string): { erreurs: string[] } {
  const erreurs: string[] = [];
  for (const section of ORDRE_SECTIONS) {
    const occurrences = texte.match(new RegExp(`(^|\\n)${section}:\\n`, "g")) ?? [];
    if (occurrences.length === 0) erreurs.push(`section manquante : ${section}`);
    else if (occurrences.length > 1) erreurs.push(`section en double : ${section}`);
  }
  return { erreurs };
}

/** Découpe un prompt H3 collé en ses 6 sections — même logique que l'import
 * historique depuis FICHE_DE_PLAN_S01_maya.md (scripts/import-markdown.ts),
 * partagée ici pour ne pas diverger. Best-effort : appeler
 * validerPromptColle() avant pour un texte garanti complet. */
export function decouperSections(texte: string): Record<NomSection, string> {
  const resultat = {} as Record<NomSection, string>;
  for (const [idx, section] of ORDRE_SECTIONS.entries()) {
    const suivante = ORDRE_SECTIONS[idx + 1];
    const regex = new RegExp(`${section}:\\n([\\s\\S]*?)${suivante ? `\\n${suivante}:` : "$"}`);
    const match = texte.match(regex);
    resultat[section] = match?.[1]?.trim() ?? "";
  }
  return resultat;
}
