import type { PromptSection } from "./clip-checks";

// Canonical order of the MiniMax H3 format — see
// docs/references/h3-guide-fullref.md.
export const ORDRE_SECTIONS = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const;

export type NomSection = (typeof ORDRE_SECTIONS)[number];

/** Assembles the final prompt submitted to ComfyUI: concatenates the 6 sections in
 * the order of the H3 format. No style clause injected here — tested in
 * production (2026-09-29) with no measurable effect on the video, unlike
 * the reference images; the clip sheet already carries the style at the start of
 * detailed_description when one is needed. */
export function assemblerPrompt(sections: PromptSection[]): string {
  const parSection = new Map(sections.map((s) => [s.section, s.contenu]));
  return ORDRE_SECTIONS.map((nom) => `${nom}:\n${parSection.get(nom) ?? ""}`).join("\n\n");
}

/** Removes a ```text ... ``` wrapper (or a bare ``` ... ```) around a
 * pasted prompt, and normalises the line endings. */
export function extraireBlocPrompt(brut: string): string {
  const texte = brut.replace(/\r\n/g, "\n").trim();
  const fence = texte.match(/^```(?:text)?\n([\s\S]*?)\n```$/);
  return (fence ? fence[1] : texte) ?? "";
}

/** Checks that the 6 canonical headers are all present, once
 * each. Does not check their order: decouperSections() finds them by
 * their name, not by their position. */
export function validerPromptColle(texte: string): { erreurs: string[] } {
  const erreurs: string[] = [];
  for (const section of ORDRE_SECTIONS) {
    const occurrences = texte.match(new RegExp(`(^|\\n)${section}:\\n`, "g")) ?? [];
    if (occurrences.length === 0) erreurs.push(`section manquante : ${section}`);
    else if (occurrences.length > 1) erreurs.push(`section en double : ${section}`);
  }
  return { erreurs };
}

/** Splits a pasted H3 prompt into its 6 sections. Best-effort: call
 * validerPromptColle() before for a text guaranteed complete. */
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
