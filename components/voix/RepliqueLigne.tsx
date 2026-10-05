"use client";

import { useTransition } from "react";
import { supprimerPriseReplique, uploaderPriseReplique } from "@/app/repliques/actions";
import { LIBELLE_STATUT_REPLIQUE } from "@/lib/repliques";
import type { RepliqueVue } from "@/lib/queries-repliques";
import { DeposerFichier } from "./DeposerFichier";
import { Icone } from "@/components/ui/Icone";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** Une réplique en ligne (étape 4) : le texte, la prise et sa durée mesurée,
 * « Générer » (pas encore branché) et « Importer ». Une seule rangée — la
 * fiche complète de la réplique (statut, plans, édition) reste au catalogue. */
export function RepliqueLigne({ r }: { r: RepliqueVue }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className={`rep-ligne v-${r.statut}`}>
      <span className="tiny-note num rep-ligne-ep">E{two(r.episodeNumero)}</span>
      <div className="rep-ligne-txt">
        <span className="dlg-who">{r.locuteur.label}</span>
        <p className="dlg-line">{r.texte}</p>
        {r.priseObsolete ? <span className="vstat over">prise à refaire — le texte a changé</span> : null}
      </div>
      <div className="rep-ligne-prise">
        {r.audioSrc ? <audio controls preload="none" src={r.audioSrc} className="rep-audio" /> : <span className="tiny-note">pas de prise</span>}
      </div>
      <div className="rep-ligne-mesure">
        {r.fichier ? (
          r.dureeSecondes != null ? <span className="vstat fit">{r.dureeSecondes} s</span> : <span className="vstat tbd">à mesurer</span>
        ) : null}
        <span className={`rep-statut s-${r.statut}`}>{LIBELLE_STATUT_REPLIQUE[r.statut as keyof typeof LIBELLE_STATUT_REPLIQUE] ?? r.statut}</span>
      </div>
      <div className="rep-ligne-actions">
        <button type="button" className="btn btn-primary btn-mini" disabled title="La génération vocale n'est pas encore branchée">
          Générer
        </button>
        <DeposerFichier action={(fd) => uploaderPriseReplique(r.id, fd)} label="Importer" remplacer={r.fichier != null} />
        {r.fichier ? (
          <button
            type="button"
            className="btn btn-ghost btn-mini"
            onClick={() => startTransition(async () => { await supprimerPriseReplique(r.id); })}
            disabled={pending}
            title="Retirer la prise"
          aria-label="Retirer la prise"
          >
            <Icone nom="fermer" />
          </button>
        ) : null}
      </div>
    </li>
  );
}
