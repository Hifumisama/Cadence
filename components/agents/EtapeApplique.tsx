"use client";

import { nouvelleConversation } from "@/app/agents/actions";
import { ChoixEpisodes } from "@/components/agents/ChoixEpisodes";
import type { ContexteEtape } from "@/components/agents/contexte";
import { resumeCompteurs } from "@/lib/agents-affichage";

/** Étape « Appliqué » : ce qui a été écrit dans le projet. Pas de point de retour pour
 * l'instant : on le dit. « Nouvelle demande » ouvre une conversation neuve sur la même cible
 * (elle écrase l'ancienne). */
export function EtapeApplique({ ctx, onFermer }: { ctx: ContexteEtape; onFermer: () => void }) {
  const { prop, conv, dernierResultat, occupe } = ctx;
  const partielle = (dernierResultat?.statut ?? prop?.statut) === "partielle";
  const appliques = dernierResultat?.appliques ?? prop?.groupes.flatMap((g) => g.changements).filter((c) => c.appliqueAt != null).length ?? 0;
  const ecartes = dernierResultat?.ecartes ?? prop?.compteurs.ecartes ?? 0;
  const refuses = dernierResultat?.refuses ?? prop?.compteurs.refuses ?? 0;

  // Étape suivante du pipeline : après le squelette d'une création de projet, « Continuer » propose
  // d'écrire les scénarios des épisodes (un lot). Pas proposé quand c'est déjà ce qu'on vient d'appliquer.
  const peutContinuer = conv.profondeur === "complete" && conv.portee === "projet" && prop?.skill !== "scenarios";

  const nouvelle = () => {
    void ctx.lancer(() => nouvelleConversation(conv.projectId, conv.portee, ctx.demande.cible ?? (conv.cibleId != null ? { id: conv.cibleId } : null), conv.profondeur));
  };

  return (
    <div className="ag-etape-corps">
      <div className="ag-applique" role="status">
        <p className="ag-applique-titre">{partielle ? "Appliquée en partie" : "Appliquée"}</p>
        <p>
          {appliques} changement{appliques > 1 ? "s" : ""} écrit{appliques > 1 ? "s" : ""} dans le projet
          {ecartes > 0 ? ` · ${ecartes} écarté${ecartes > 1 ? "s" : ""}` : ""}
          {refuses > 0 ? ` · ${refuses} refusé${refuses > 1 ? "s" : ""}` : ""}.
        </p>
        {prop ? <p className="tiny-note">{resumeCompteurs(prop.compteurs)}</p> : null}
        <p className="tiny-note">Il n&rsquo;y a pas de point de retour pour l&rsquo;instant : pour revenir en arrière, modifie les éléments à la main.</p>
      </div>
      {peutContinuer ? (
        <div className="ag-continuer">
          <ChoixEpisodes ctx={ctx} saisonId={null} titre="Continuer : écrire les scénarios des épisodes" />
        </div>
      ) : null}
      <div className="gd-row">
        <button type="button" className={peutContinuer ? "btn btn-ghost" : "btn btn-gold"} onClick={onFermer}>
          Fermer
        </button>
        <button type="button" className="btn btn-ghost" onClick={nouvelle} disabled={occupe} title="Une conversation neuve sur la même cible (elle écrase l'ancienne)">
          Nouvelle demande
        </button>
      </div>
    </div>
  );
}
