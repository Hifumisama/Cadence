"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { genererPriseReplique } from "@/app/repliques/generation-actions";
import { useTaches } from "@/components/taches/TachesProvider";
import { estActive, tachesDeAsset } from "@/lib/taches";
import { supprimerPriseReplique, uploaderPriseReplique } from "@/app/repliques/actions";
import { LIBELLE_STATUT_REPLIQUE } from "@/lib/repliques";
import type { RepliqueVue } from "@/lib/queries-repliques";
import { DeposerFichier } from "./DeposerFichier";
import { Icone } from "@/components/ui/Icone";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** Une réplique en ligne (étape 4) : le texte, la prise et sa durée mesurée,
 * « Générer » (la voix de référence clonée dit le texte ; la prise remplace la précédente) et « Importer ». Une seule rangée — la
 * fiche complète de la réplique (statut, plans, édition) reste au catalogue. */
export function RepliqueLigne({ r, voixId }: { r: RepliqueVue; voixId: number }) {
  const router = useRouter();
  const { taches } = useTaches();
  const [pending, startTransition] = useTransition();
  const [lancement, startLancement] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  // La prise arrive en arrière-plan (le worker la pose sur la réplique) : quand plus aucune génération de cette voix n'est active, la page se recharge.
  const enCours = tachesDeAsset(taches, voixId).some(estActive);
  const etaitEnCours = useRef(false);
  useEffect(() => {
    if (etaitEnCours.current && !enCours) router.refresh();
    etaitEnCours.current = enCours;
  }, [enCours, router]);

  const generer = () =>
    startLancement(async () => {
      const res = await genererPriseReplique(r.id);
      setRetour(res.ok ? { ok: true, texte: "Génération lancée." } : { ok: false, texte: res.erreur });
    });

  return (
    <li className={`rep-ligne v-${r.statut}`}>
      <span className="tiny-note num rep-ligne-ep">E{two(r.episodeNumero)}</span>
      <div className="rep-ligne-txt">
        <span className="dlg-who">{r.locuteur.label}</span>
        <p className="dlg-line">{r.texte}</p>
        {r.priseObsolete ? <span className="vstat over">prise à refaire — le texte a changé</span> : null}
        {retour && !retour.ok ? <span className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)" }}>{retour.texte}</span> : null}
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
        <button type="button" className="btn btn-primary btn-mini" onClick={generer} disabled={lancement} title={retour?.texte ?? (r.fichier ? "Régénérer la prise (remplace l'actuelle)" : "Générer la prise avec la voix de référence")}>
          {lancement ? "…" : "Générer"}
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
