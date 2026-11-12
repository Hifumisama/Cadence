import type { DecisionsAffichees } from "./types";

/** What a clip's iteration shows on screen, with no server dependency: `lib/clips/clip-sheet.ts` is read by client components, and
 * `lib/agents/iteration-clip.ts` pulls in server code (compiler, node:child_process). The two elements below therefore live here, and
 * `iteration-clip.ts` re-exports them. */

/** Start of the summary of a proposal that recompiles nothing (postTraitement): the "Itérer" decision stops there (lib/clips/clip-sheet.ts). */
export const PREFIXE_SANS_ECRITURE = "Diagnostic sans écriture.";

/** The decisions in short sentences, kept on the attempt they produce (`jobs.alertes_iteration`). */
export function notesDecisions(a: DecisionsAffichees | null): string[] {
  if (!a) return [];
  const notes: string[] = [];
  if (a.intent) notes.push("Intent du plan réécrit par l'agent (l'ancien reste dans l'essai précédent).");
  if (a.duree) notes.push(`Durée : ${a.duree.avant} s → ${a.duree.apres} s.`);
  if (a.referencesAjoutees.length || a.referencesRetirees.length) {
    notes.push(`Références : ${[...a.referencesAjoutees.map((c) => `+ ${c}`), ...a.referencesRetirees.map((c) => `− ${c}`)].join(", ")}.`);
  }
  for (const r of a.reglages) notes.push(`${r.libelle} du plan : ${r.avant} → ${r.apres}.`);
  if (a.manquants.length) notes.push(`${a.manquants.map((m) => m.code).join(", ")} créé${a.manquants.length > 1 ? "s" : ""} par l'itération, image générée et ajouté${a.manquants.length > 1 ? "s" : ""} aux références avant la recompilation.`);
  return notes;
}
