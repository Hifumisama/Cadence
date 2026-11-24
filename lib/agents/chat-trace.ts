/** The messages a chat CARD sends in the user's name (2026-11-18, user feedback: « ça fait bizarre de voir des répliques écrites
 * automatiquement »): the models read their full text, the screen shows a discreet « ✓ » line instead of a bubble. Pure. */

/** Which card sent the message. */
export const VIAS = ["sequence", "questions", "choix", "autres", "suite", "arret", "synopsis"] as const;
export type ViaMessage = (typeof VIAS)[number];
export const estVia = (v: unknown): v is ViaMessage => (VIAS as readonly unknown[]).includes(v);

/** The discreet line shown instead of the bubble. */
export function traceMessage(via: ViaMessage, contenu: string): string {
  switch (via) {
    case "sequence": {
      const m = /temps fort\s*:\s*moment\s*(\d+)/i.exec(contenu);
      return `Séquence validée${m ? ` · temps fort : moment ${m[1]}` : ""}`;
    }
    case "questions": {
      // « La lettre — 1. Des plis marqués ? Des plis bien marqués » → « Des plis bien marqués »
      const reponses = contenu
        .split("\n")
        .map((l) => l.replace(/^.*?\?\s*/, "").trim())
        .filter(Boolean);
      return `Réponses envoyées : ${reponses.join(" · ")}`;
    }
    case "choix":
      return `Choisi : ${contenu.replace(/\s*\(couleurs\s*:[^)]*\)/gi, "")}`;
    case "autres":
      return "Autres propositions demandées";
    case "suite":
      return "Suite de la séquence demandée";
    case "synopsis":
      return "Synopsis validé";
    case "arret":
      return "Entretien terminé : le scénariste complète ce qui manque";
  }
}
