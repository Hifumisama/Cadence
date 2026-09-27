import type { PromptSection } from "./plan-checks";

// Ordre canonique du format MiniMax H3 — voir
// .claude/skills/fiche-de-plan/references/h3-guide-fullref.md.
const ORDRE_SECTIONS = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
] as const;

/** Assemble le prompt final soumis à ComfyUI : préfixe la clause de style
 * globale à detailed_description (la concaténation n'existe pas côté
 * ComfyUI dans le graphe actuel — voir le plan d'implémentation, section
 * "Contradiction de documentation") puis concatène les sections dans
 * l'ordre du format H3. */
export function assemblerPrompt(
  sections: PromptSection[],
  clauseStyle: string,
): string {
  const parSection = new Map(sections.map((s) => [s.section, s.contenu]));

  return ORDRE_SECTIONS.map((nom) => {
    const contenu = parSection.get(nom) ?? "";
    if (nom === "detailed_description" && contenu.trim().length > 0) {
      return `${nom}:\n${clauseStyle} ${contenu}`;
    }
    return `${nom}:\n${contenu}`;
  }).join("\n\n");
}
