"use client";

import { modifierChampBrief } from "@/app/agents/actions";
import { BriefSections } from "@/components/agents/BriefSections";
import { BoutonCreerTout } from "@/components/agents/BoutonCreerTout";
import type { ContexteEtape } from "@/components/agents/contexte";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { estTacheActive } from "@/lib/agents-affichage";

/** Étape « Brief » (profondeur complète) : le brief en sections, éditable (corriger une
 * section la passe à « fourni »). Le CADRAGE (portée, estimation, file) est ici, au niveau du
 * bouton « Générer la proposition ». « Revenir à l'échange » reprend la conversation sans rien
 * perdre : on peut redemander un brief après avoir précisé. */
export function EtapeBrief({ ctx }: { ctx: ContexteEtape }) {
  const { conv, brief, occupe } = ctx;
  const actif = estTacheActive(conv.tache);
  const propositionEnCours = ctx.prop != null && ctx.prop.statut !== "rejetee";

  const modifier = async (cle: string, valeur: unknown): Promise<string | null> => {
    try {
      const r = await modifierChampBrief(conv.projectId, cle, valeur);
      if (!r.ok) return r.erreur;
      await ctx.rafraichir();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erreur inattendue.";
    }
  };

  if (!brief) {
    return (
      <div className="ag-etape-corps">
        {actif ? <EtatTacheAgent tache={conv.tache} /> : <p className="ag-vide">Aucun brief pour l&rsquo;instant. Retourne à la conversation pour en demander un.</p>}
        <div className="gd-row">
          <button type="button" className="btn btn-ghost" onClick={() => ctx.aller("conversation")}>
            ← Revenir à l&rsquo;échange
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ag-etape-corps">
      <div className="gd-row gd-row-between">
        <p className="tiny-note ag-brief-note">
          {brief.statut === "brouillon" ? "Brouillon : rien n'est écrit dans le projet tant que tu n'as pas appliqué la proposition." : "Brief de référence du projet."}
        </p>
        <button type="button" className="btn btn-ghost btn-mini" onClick={() => ctx.aller("conversation")}>
          ← Revenir à l&rsquo;échange
        </button>
      </div>

      {brief.statut === "brouillon" && conv.resteADefinir.length > 0 ? (
        <div className="ag-reste" role="status">
          <p className="ag-reste-titre">Première version du briefing</p>
          <p className="tiny-note">L&rsquo;agent te pose encore {conv.resteADefinir.length} question{conv.resteADefinir.length > 1 ? "s" : ""} dans la conversation :</p>
          <ul>
            {conv.resteADefinir.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <BriefSections brief={brief} onModifier={modifier} desactive={occupe} />

      {propositionEnCours ? (
        <p className="tiny-note">
          Une proposition existe déjà.{" "}
          <button type="button" className="ag-lien" onClick={() => ctx.aller("proposition")}>
            La voir
          </button>
        </p>
      ) : null}

      <EtatTacheAgent tache={conv.tache} />

      <div className="ag-lancer">
        <span className="tiny-note ag-estimation">
          Le projet est créé une fois le briefing validé : structure, scénarios, registre d&rsquo;assets, voix et fiches de plan s&rsquo;enchaînent, avec le détail sur une page dédiée.
        </span>
        {conv.resteADefinir.length > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={() => ctx.aller("conversation")} disabled={occupe}>
            Répondre aux questions
          </button>
        ) : null}
        <BoutonCreerTout projectId={conv.projectId} libelle="Valider le briefing et créer le projet" desactive={occupe || actif} />
      </div>
    </div>
  );
}
