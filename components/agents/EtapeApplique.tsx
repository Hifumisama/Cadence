"use client";

import { nouvelleConversation } from "@/app/agents/actions";
import { ChoixAssets } from "@/components/agents/ChoixAssets";
import { ChoixEpisodes } from "@/components/agents/ChoixEpisodes";
import { ChoixInventaire } from "@/components/agents/ChoixInventaire";
import { ChoixPlans } from "@/components/agents/ChoixPlans";
import { SuitePromptsAssets } from "@/components/agents/SuitePromptsAssets";
import { ChoixVoix } from "@/components/agents/ChoixVoix";
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

  // Étapes suivantes du pipeline, une à la fois (validation manuelle à chaque revue) : après le
  // squelette d'une création de projet, « Continuer » propose d'écrire les scénarios des épisodes
  // (un lot) ; après les scénarios, de créer le registre d'assets (un autre lot) ; après le registre, l'INVENTAIRE
  // des assets que les plans réclament (avant les fiches : sans lui chaque fiche invente ses accessoires, d'où les
  // doublons), dont les prompts s'écrivent ensuite ; puis de créer les voix des personnages qui parlent ; ensuite
  // d'écrire les fiches de plan (un lot), puis les prompts des assets que les fiches ont créés. Jamais ce qu'on
  // vient d'appliquer.
  const surProjet = conv.profondeur === "complete" && conv.portee === "projet";
  const etapeFaite = prop?.skill;
  // Après une fiche (un plan ou un lot, quelle que soit la portée) : écrire les prompts des assets qu'elle a créés.
  const ficheFaite = etapeFaite === "plan-h3" || etapeFaite === "fiches";
  const continuerScenarios = surProjet && !["scenarios", "registre", "inventaire-assets", "voix", "fiches", "plan-h3", "prompts-assets"].includes(etapeFaite ?? "");
  const continuerRegistre = surProjet && etapeFaite === "scenarios";
  const continuerInventaire = surProjet && etapeFaite === "registre";
  // Après l'inventaire (ou les prompts qui le suivent) : les voix. Les prompts des assets créés par l'inventaire se proposent à côté.
  const inventaireFait = surProjet && etapeFaite === "inventaire-assets";
  const continuerVoix = surProjet && (inventaireFait || etapeFaite === "prompts-assets");
  const continuerFiches = surProjet && etapeFaite === "voix";
  const peutContinuer = continuerScenarios || continuerRegistre || continuerInventaire || continuerVoix || continuerFiches;

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
          {continuerFiches ? (
            <ChoixPlans ctx={ctx} titre="Continuer : écrire les fiches de plan" />
          ) : continuerVoix ? (
            <>
              {inventaireFait ? <SuitePromptsAssets ctx={ctx} /> : null}
              <ChoixVoix ctx={ctx} titre="Continuer : créer les voix des personnages qui parlent" />
            </>
          ) : continuerInventaire ? (
            <>
              <ChoixInventaire ctx={ctx} titre="Continuer : faire l'inventaire des assets" />
              <details className="ag-contexte">
                <summary>Passer l&rsquo;inventaire : créer les voix directement</summary>
                <ChoixVoix ctx={ctx} />
              </details>
            </>
          ) : continuerRegistre ? (
            <ChoixAssets ctx={ctx} titre="Continuer : créer le registre d'assets" />
          ) : (
            <ChoixEpisodes ctx={ctx} saisonId={null} titre="Continuer : écrire les scénarios des épisodes" />
          )}
        </div>
      ) : null}
      {etapeFaite === "iteration-plan" ? (
        <p className="tiny-note" role="status">
          Le prompt est corrigé : relance une génération du plan pour vérifier
          {prop?.diagnostic?.verification ? ` (à regarder : ${prop.diagnostic.verification})` : ""}. Si le symptôme persiste, « Corriger après visionnage » repartira de cet historique.
        </p>
      ) : null}
      {ficheFaite ? (
        <div className="ag-continuer">
          <SuitePromptsAssets ctx={ctx} />
          <details className="ag-contexte">
            <summary>{conv.portee === "plan" ? "Réécrire la fiche de ce plan" : "Écrire d'autres fiches, ou en réécrire"}</summary>
            <ChoixPlans ctx={ctx} />
          </details>
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
