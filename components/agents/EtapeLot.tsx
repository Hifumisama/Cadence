"use client";

import { useState } from "react";
import { annulerLot, relancerSousTache } from "@/app/agents/actions";
import type { ContexteEtape } from "@/components/agents/contexte";
import { SYMBOLE_SOUS_TACHE, avancementLot, libelleEtatSousTache, motsDuLot, sousTacheRelancable } from "@/lib/agents-affichage";
import type { VueProposition, VueSousTache } from "@/lib/agents/types";

/** La liste des sous-tâches d'un lot (un épisode chacune) : état, jetons, échec, relance. Servie
 * pendant la génération (avec la progression et l'annulation du lot) ET dans la revue (pour relancer
 * l'épisode qui a échoué ou à refaire, avec un retour libre). */
export function ListeSousTaches({
  prop,
  ctx,
  lectureSeule = false,
  seulementEchecs = false,
}: {
  prop: VueProposition;
  ctx: ContexteEtape;
  lectureSeule?: boolean;
  /** Pendant la génération : on ne relance que ce qui a échoué ou été annulé (« Refaire » attend la revue). */
  seulementEchecs?: boolean;
}) {
  const lot = prop.lot!;
  return (
    <ul className="ag-lot" aria-label="Sous-tâches du lot">
      {lot.sousTaches.map((s) => (
        <LigneSousTache key={s.cle} s={s} prop={prop} ctx={ctx} relancable={!lectureSeule && (seulementEchecs ? s.statut === "echoue" || s.statut === "annulee" : sousTacheRelancable(s))} />
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
          title={echec || s.statut === "annulee" ? "Relancer cette sous-tâche" : `Refaire ${motsDuLot(prop.skill).ceci}, avec un retour`}
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
        L&rsquo;agent {motsDuLot(prop.skill).travail}. Tu peux fermer cette fenêtre : le lot continue, et le panneau des générations te prévient quand il est prêt.
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
              title={`${motsDuLot(prop.skill).dejaFaits} restent relisibles`}
            >
              Annuler le lot
            </button>
          )}
        </div>
      </div>
      <ListeSousTaches prop={prop} ctx={ctx} seulementEchecs />
    </div>
  );
}

/** Relance d'un coup toutes les sous-tâches échouées ou annulées d'un lot (un lot entièrement échoué, par
 * exemple serveur LLM injoignable, se remet en route sans repasser par chaque ligne). */
export function BoutonRelancerEchecs({ prop, ctx }: { prop: VueProposition; ctx: ContexteEtape }) {
  const cibles = (prop.lot?.sousTaches ?? []).filter((s) => s.statut === "echoue" || s.statut === "annulee");
  if (cibles.length === 0) return null;
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={ctx.occupe}
      onClick={() =>
        void ctx.lancer(async () => {
          for (const s of cibles) {
            const r = await relancerSousTache(prop.uuid, s.cle);
            if (!r.ok) return r;
          }
          return { ok: true as const };
        })
      }
    >
      Relancer {cibles.length > 1 ? `les ${cibles.length} sous-tâches` : "la sous-tâche"} en échec
    </button>
  );
}
