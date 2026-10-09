/** Règle d'écriture du TEXTE d'une réplique, partagée par l'action serveur (`modifierReplique`,
 * app/repliques/actions.ts) et l'applicateur des propositions (lib/agents/applicateurs/replique.ts) :
 * une seule règle, pour que la main et l'agent ne divergent jamais. Pur, testé. */

export const nettoyerTexteReplique = (t: string): string => t.replace(/\r\n/g, "\n").trim();

export type ModificationTexte =
  | { ok: false; erreur: string }
  | {
      ok: true;
      /** Le texte a réellement changé (sinon `set` est vide : rien à écrire). */
      texteChange: boolean;
      /** Les colonnes de `repliques` à écrire. */
      set: { texte?: string; statut?: string };
    };

/** Un texte modifié laisse les plans qui citent la réplique en alerte (le contrôle verbatim les
 * voit « différente ») et rend la prise obsolète (`priseObsolete`, lib/repliques.ts) ; une prise
 * VALIDÉE repasse « posée » : elle ne dit plus le texte. */
export function changerTexteReplique(actuelle: { texte: string; statut: string }, nouveau: string): ModificationTexte {
  const texte = nettoyerTexteReplique(nouveau);
  if (!texte) return { ok: false, erreur: "Le texte de la réplique est vide." };
  if (texte === actuelle.texte) return { ok: true, texteChange: false, set: {} };
  return { ok: true, texteChange: true, set: actuelle.statut === "validee" ? { texte, statut: "prise_posee" } : { texte } };
}
