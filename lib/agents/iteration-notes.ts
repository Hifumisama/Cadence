import type { DecisionsAffichees } from "./types";

/** Ce que l'itération d'un plan montre à l'écran, sans aucune dépendance serveur : `lib/clips/clip-sheet.ts` est lu par des composants client, et
 * `lib/agents/iteration-clip.ts` tire du code serveur (compilateur, node:child_process). Les deux éléments ci-dessous vivent donc ici, et
 * `iteration-clip.ts` les réexporte. */

/** Début du résumé d'une proposition qui ne recompile rien (postTraitement) : la décision d'« Itérer » s'arrête là (lib/clips/clip-sheet.ts). */
export const PREFIXE_SANS_ECRITURE = "Diagnostic sans écriture.";

/** Les décisions en phrases courtes, gardées sur l'essai qu'elles produisent (`jobs.alertes_iteration`). */
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
