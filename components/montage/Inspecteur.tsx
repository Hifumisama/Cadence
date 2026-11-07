"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ilYa } from "@/lib/temps-relatif";
import { pad2, type Clip, type GenreRendu } from "@/lib/montage";

const GENRE: Record<GenreRendu, string> = { "aperçu": "Prévisualisation", final: "Rendu final", import: "Vidéo importée" };

/** L'inspecteur du clip sélectionné : statut, alertes (périmé, échec), rendu retenu POUR CETTE ENTRÉE, rognage, duplication/retrait, et le
 * lien vers l'atelier du plan (`/montage/<uuid>`). */
export function Inspecteur({
  clip,
  index,
  nb,
  base,
  choisirRendu,
  remettreEntier,
  dupliquer,
  retirer,
}: {
  clip: Clip | null;
  index: number;
  nb: number;
  base: string;
  choisirRendu: (renduId: number) => void;
  remettreEntier: () => void;
  dupliquer: () => void;
  retirer: () => void;
}) {
  if (!clip) {
    return (
      <aside className="mt-insp" aria-live="polite">
        <p className="tiny-note">Aucun plan dans cet épisode pour l’instant : écrivez le scénario, les plans apparaîtront ici.</p>
      </aside>
    );
  }
  const { plan, rendu, entree } = clip;
  const entier = clip.debut <= 0.001 && entree.fin == null;
  const href = `${base}/montage/${plan.uuid}`;
  return (
    <aside className="mt-insp" aria-live="polite">
      <div>
        <span className="mt-no num">
          Plan {pad2(index + 1)} sur {nb}
          {plan.position !== index + 1 ? ` · sc. ${pad2(plan.position)}` : ""}
        </span>
        <h2>{plan.titre}</h2>
      </div>
      <div className="mt-row">
        <StatusBadge statut={plan.statut} />
      </div>
      {plan.perime ? <div className="mt-warn">Rendu périmé ({plan.perime}) : une référence ou le contenu du plan a changé depuis le dernier rendu. Relancer pour en tenir compte.</div> : null}
      {plan.erreur ? <div className="mt-warn is-err">{plan.erreur}</div> : null}
      {rendu ? (
        <>
          <div>
            <p className="mt-sec">Rendu retenu</p>
            <div className="mt-rendus" role="radiogroup" aria-label="Rendu retenu pour ce plan du montage">
              {plan.rendus.map((r) => (
                <button key={r.id} type="button" className="mt-rendu" role="radio" aria-checked={r.id === rendu.id} onClick={() => r.id !== rendu.id && choisirRendu(r.id)}>
                  <span className="mt-dot" />
                  <span>
                    n°{r.numeroRendu} · {GENRE[r.genre]}
                    <small>{ilYa(r.creeLe)}</small>
                  </span>
                  <span className="mt-rendu-d num">{r.dureeSecondes.toFixed(1)} s</span>
                </button>
              ))}
            </div>
            {entree.renduRetenuId == null ? <p className="mt-note">Choix par défaut : l’essai retenu du plan, sinon son rendu le plus récent.</p> : null}
          </div>
          <div>
            <p className="mt-sec">Rognage</p>
            <div className="mt-inout">
              <div>
                <small>Début</small>
                <b className="num">{clip.debut.toFixed(1)} s</b>
              </div>
              <div>
                <small>Fin</small>
                <b className="num">{clip.fin.toFixed(1)} s</b>
              </div>
              <div>
                <small>Durée</small>
                <b className="num">{clip.duree.toFixed(1)} s</b>
              </div>
            </div>
            <div className="mt-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-ghost btn-mini" disabled={entier} onClick={remettreEntier}>
                Remettre le plan entier <kbd>R</kbd>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-warn is-neutre">
          Pas encore de rendu. Le plan occupe sa durée prévue ({plan.dureePrevue.toFixed(1)} s) pour que la table reflète tout l’épisode ; il sera ignoré à l’export.
        </div>
      )}
      <div>
        <p className="mt-sec">Dans le montage</p>
        <div className="mt-row">
          <button type="button" className="btn btn-ghost btn-mini" onClick={dupliquer}>
            Dupliquer <kbd>D</kbd>
          </button>
          <button type="button" className="btn btn-ghost btn-mini" onClick={retirer}>
            Retirer du montage <kbd>Suppr</kbd>
          </button>
        </div>
        <p className="mt-note">Retirer ou dupliquer n’efface aucun rendu : seule l’entrée du montage change.</p>
      </div>
      <div>
        <p className="mt-sec">Atelier du plan</p>
        <div className="mt-row">
          <Link href={href} className="btn btn-gold btn-mini">
            Ouvrir l’atelier du plan →
          </Link>
        </div>
        <p className="mt-path num">/montage/{plan.uuid}</p>
      </div>
    </aside>
  );
}
