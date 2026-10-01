"use client";

import { useState } from "react";
import { annulerLot, relancerSousTache } from "@/app/agents/actions";
import type { ContexteEtape } from "@/components/agents/contexte";
import { SYMBOLE_SOUS_TACHE, avancementLot, libelleEtatSousTache, sousTacheRelancable } from "@/lib/agents-affichage";
import type { VueProposition, VueSousTache } from "@/lib/agents/types";

/** La liste des sous-tâches d'un lot (un épisode chacune) : état, jetons, échec, relance. Servie
 * pendant la génération (avec la progression et l'annulation du lot) ET dans la revue (pour relancer
 * l'épisode qui a échoué ou à refaire, avec un retour libre). */
export function ListeSousTaches({ prop, ctx, lectureSeule = false }: { prop: VueProposition; ctx: ContexteEtape; lectureSeule?: boolean }) {
  const lot = prop.lot!;
  return (
    <ul className="ag-lot" aria-label="Sous-tâches du lot">
      {lot.sousTaches.map((s) => (
        <LigneSousTache key={s.cle} s={s} prop={prop} ctx={ctx} relancable={!lectureSeule && sousTacheRelancable(s)} />
      ))}
    </ul>
  );
}

function LigneSousTache({ s, prop, ctx, relancable }: { s: VueSousTache; prop: VueProposition; ctx: ContexteEtape; relancable: boolean }) {
  const [retour, setRetour] = useState<string | null>(null);
  const relancer = () =>
    void ctx.lancer(
      () => relancerSousTache(prop.uuid, s.cle, retour?.trim() || undefined),
      () => setRetour(null),
    );
  const echec = s.statut === "echoue";
  return (
    <li className={`ag-lot-ligne s-${s.statut}`}>
      <span className="ag-lot-symbole" aria-hidden="true">
        {SYMBOLE_SOUS_TACHE[s.statut]}
      </span>
      <span className="ag-lot-corps">
        <span className="ag-lot-nom">{s.libelle}</span>
        <span className={`ag-lot-etat tiny-note${echec ? " ag-lot-echec" : ""}`} title={s.erreur ?? undefined}>
          {libelleEtatSousTache(s)}
          {s.relancee ? " · relancée" : ""}
        </span>
        {retour !== null ? (
          <span className="ag-lot-retour">
            <label className="tiny-note" htmlFor={`ag-retour-${s.cle}`}>
              Ton retour (facultatif)
            </label>
            <textarea
              id={`ag-retour-${s.cle}`}
              className="field"
              rows={2}
              value={retour}
              onChange={(e) => setRetour(e.target.value)}
              placeholder="Ex. Moins de dialogue, plus de silence."
            />
            <span className="gd-row">
              <button type="button" className="btn btn-primary btn-mini" onClick={relancer} disabled={ctx.occupe}>
                Relancer
              </button>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setRetour(null)} disabled={ctx.occupe}>
                Annuler
              </button>
            </span>
          </span>
        ) : null}
      </span>
      {relancable && retour === null ? (
        <button
          type="button"
          className="btn btn-ghost btn-mini"
          onClick={() => (echec || s.statut === "annulee" ? void ctx.lancer(() => relancerSousTache(prop.uuid, s.cle)) : setRetour(""))}
          disabled={ctx.occupe}
          title={echec || s.statut === "annulee" ? "Relancer cette sous-tâche" : "Refaire cet épisode, avec un retour"}
        >
          {echec || s.statut === "annulee" ? "Relancer" : "Refaire…"}
        </button>
      ) : null}
    </li>
  );
}

/** Pendant la génération d'un lot : la progression « 3/12 », la liste des sous-tâches, l'annulation. */
export function EtapeLotEnCours({ prop, ctx }: { prop: VueProposition; ctx: ContexteEtape }) {
  const lot = prop.lot!;
  const av = avancementLot(lot);
  const [confirmer, setConfirmer] = useState(false);
  const enCours = lot.sousTaches.some((s) => s.statut === "en_cours");
  const annuler = () => void ctx.lancer(() => annulerLot(prop.uuid), () => setConfirmer(false));

  return (
    <div className="ag-etape-corps">
      <p className="ag-vide">
        L&rsquo;agent écrit les épisodes un par un. Tu peux fermer cette fenêtre : le lot continue, et le panneau des générations te prévient quand il est prêt.
      </p>
      <div className="ag-tache">
        <progress className="gd-bar" value={av.valeur} max={av.max} aria-label="Avancement du lot" />
        <div className="gd-row gd-row-between">
          <span className="gd-prog num">{av.texte}</span>
          {confirmer ? (
            <span className="gd-row" role="group" aria-label="Confirmer l'annulation du lot">
              <button type="button" className="btn btn-ghost btn-mini" onClick={annuler} disabled={ctx.occupe}>
                Oui, annuler le lot
              </button>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setConfirmer(false)}>
                Non
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-mini"
              onClick={() => (enCours ? setConfirmer(true) : annuler())}
              disabled={ctx.occupe}
              title="Les épisodes déjà écrits restent relisibles"
            >
              Annuler le lot
            </button>
          )}
        </div>
      </div>
      <ListeSousTaches prop={prop} ctx={ctx} lectureSeule />
    </div>
  );
}
