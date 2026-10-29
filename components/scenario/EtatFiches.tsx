import { BoutonAgent } from "@/components/agents/BoutonAgent";
import type { DemandeAgent } from "@/components/agents/AgentsProvider";

/** Où en sont les fiches de plan, en une ligne de la barre du scénario : « 12/14 fiches écrites », et le geste qui suit (« Écrire les 2 fiches »)
 * tant qu'il reste des brouillons. Un plan naît en brouillon ; il entre en production quand sa fiche (le prompt vidéo) est écrite. */
export function EtatFiches({ nbPlans, nbDeveloppes, demande }: { nbPlans: number; nbDeveloppes: number; demande: DemandeAgent }) {
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
        <BoutonAgent
          className="btn btn-gold btn-sm"
          libelle={nbBrouillons > 1 ? `Écrire les ${nbBrouillons} fiches` : "Écrire la fiche"}
          titre="L'agent écrit la fiche (prompt vidéo) de chaque plan choisi, un par un ; tu relis avant que rien ne soit écrit"
          demande={demande}
        />
      ) : null}
    </span>
  );
}
