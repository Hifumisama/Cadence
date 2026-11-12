/** Le texte d'un plan mis en forme de scénario pour la vue Lecture : des paragraphes d'action et des répliques. Pur, testé.
 *
 * Une ligne `NOM : « texte »` est une réplique (le même motif que lib/plans/intent.ts et lib/h3ir/brief.ts) ; le reste, regroupé par paragraphes (une ligne vide
 * sépare deux paragraphes), est de l'action. Rien n'est réécrit : la mise en forme est de l'affichage, l'édition se fait toujours sur le texte brut. */

export type BlocLecture = { type: "action"; texte: string } | { type: "replique"; perso: string; texte: string };

const REPLIQUE = /^[ \t  ]*([^:«»\n]{1,60}?)[ \t  ]*:[ \t  ]*«[ \t  ]*([\s\S]*?)[ \t  ]*»[ \t  ]*$/;

export function blocsDeLecture(intent: string | null | undefined): BlocLecture[] {
  const blocs: BlocLecture[] = [];
  let paragraphe: string[] = [];
  const vider = () => {
    if (paragraphe.length > 0) blocs.push({ type: "action", texte: paragraphe.join(" ") });
    paragraphe = [];
  };
  for (const ligne of (intent ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const t = ligne.trim();
    if (!t) {
      vider();
      continue;
    }
    const m = REPLIQUE.exec(ligne);
    if (m) {
      vider();
      blocs.push({ type: "replique", perso: m[1]!.trim(), texte: m[2]!.trim() });
    } else {
      paragraphe.push(t);
    }
  }
  vider();
  return blocs;
}
