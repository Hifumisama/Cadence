"use client";


/** Where the clip sheets stand, in one line of the screenplay bar: « 12/14 fiches écrites », and the action that follows (« Écrire les 2 fiches »)
 * as long as drafts remain. A clip is born as a draft; it goes into production when its sheet (the video prompt) is written. */
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
