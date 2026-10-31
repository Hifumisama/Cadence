"use client";


/** Où en sont les fiches de plan, en une ligne de la barre du scénario : « 12/14 fiches écrites », et le geste qui suit (« Écrire les 2 fiches »)
 * tant qu'il reste des brouillons. Un plan naît en brouillon ; il entre en production quand sa fiche (le prompt vidéo) est écrite. */
export function EtatFiches({ nbPlans, nbDeveloppes, onEcrire }: { nbPlans: number; nbDeveloppes: number; onEcrire: () => void }) {
  if (nbPlans === 0) return null;
  const nbBrouillons = nbPlans - nbDeveloppes;
  return (
    <span className="sc-fiches">
      <span className={`sc-fiches-etat${nbBrouillons === 0 ? " is-complet" : ""}`} title="Un plan naît en brouillon ; il entre en production quand sa fiche (le prompt vidéo) est écrite.">
        <b className="num">
          {nbDeveloppes}/{nbPlans}
        </b>{" "}
        fiche{nbDeveloppes > 1 ? "s" : ""} écrite{nbDeveloppes > 1 ? "s" : ""}
      </span>
      {nbBrouillons > 0 ? (
        <button
          type="button"
          className="btn btn-gold btn-sm"
          onClick={onEcrire}
          title="L'agent écrit la fiche (prompt vidéo) des plans choisis, en arrière-plan ; tu les relis ensuite dans chaque plan"
        >
          {nbBrouillons > 1 ? `Écrire les ${nbBrouillons} fiches` : "Écrire la fiche"}
        </button>
      ) : null}
    </span>
  );
}
