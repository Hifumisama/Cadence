"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { supprimerAsset } from "@/app/assets/actions";
import { LIBELLE_ETAT_FICHE, type EtatFiche } from "@/lib/voix";
import { Icone } from "@/components/ui/Icone";

// Une seule référence joue à la fois dans la liste.
let carteActive: { stop: () => void } | null = null;

const CLASSE_ETAT: Record<EtatFiche, string> = { a_creer: "b-attente", a_valider: "b-rejoue", validee: "b-termine" };

const NB_BARRES = 34;

/** Une onde décorative, la même pour une même voix (hauteurs tirées du nom) : elle ne représente pas le signal, elle donne à la
 * carte son ligne de lecture et s'anime pendant l'écoute. */
function hauteursOnde(graine: string): number[] {
  let s = 7;
  for (const c of graine) s = (s * 31 + c.charCodeAt(0)) % 233280;
  return Array.from({ length: NB_BARRES }, () => {
    s = (s * 9301 + 49297) % 233280;
    return 14 + Math.round((s / 233280) * 86);
  });
}

/** Carte d'une fiche vocale, en largeur : le nom et sa pastille d'état (libellé texte en plus de la couleur) sur une ligne, la
 * langue, le personnage et le nombre de répliques dessous, la réplique d'écoute en citation (la « signature vocale »), puis une
 * ligne de lecture : ▶ + onde + « Commencer » / « Reprendre » + la corbeille. ▶ écoute la voix de référence sans quitter la liste.
 * La corbeille ouvre une confirmation dans la carte, qui dit d'avance ce que la suppression change (ou pourquoi elle est bloquée,
 * mêmes règles que la fiche : `verdictSuppressionVoix`). Le code de la voix n'apparaît pas. */
export function VoixCard({
  assetId,
  href,
  nom,
  etat,
  critique,
  langue,
  personnageNom,
  refText,
  referenceSrc,
  referenceFichier,
  nbRepliques,
  suppression,
}: {
  assetId: number;
  href: string;
  nom: string;
  etat: EtatFiche;
  critique: boolean;
  /** Libellé français de la langue (« Français »). */
  langue: string;
  personnageNom: string | null;
  refText: string;
  referenceSrc: string | null;
  referenceFichier: string | null;
  nbRepliques: number;
  suppression: { bloque: boolean; raison: string | null; avertissement: string | null };
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [joue, setJoue] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const barres = useMemo(() => hauteursOnde(nom), [nom]);
  const handle = useRef({
    stop: () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      setJoue(false);
    },
  });

  const basculer = () => {
    const a = audioRef.current;
    if (!a) return;
    if (joue) {
      handle.current.stop();
      carteActive = null;
      return;
    }
    if (carteActive && carteActive !== handle.current) carteActive.stop();
    carteActive = handle.current;
    void a.play().then(() => setJoue(true)).catch(() => setJoue(false));
  };

  const ouvrirConfirmation = () => {
    handle.current.stop();
    setErreur(null);
    setConfirme(true);
  };

  const supprimer = () =>
    startTransition(async () => {
      const r = await supprimerAsset(assetId);
      if (r.ok) router.refresh();
      else setErreur(r.erreur);
    });

  return (
    <article className={`voix-card${etat === "validee" ? " is-figee" : ""}${joue ? " is-joue" : ""}`}>
      <div className="voix-card-hd">
        <h2 className="voix-card-nom">{nom}</h2>
        <span className={`badge ${CLASSE_ETAT[etat]}`}>
          <i />
          {LIBELLE_ETAT_FICHE[etat]}
        </span>
      </div>

      <p className="voix-card-meta tiny-note">
        <span>{langue}</span>
        <span aria-hidden="true">·</span>
        <span>{personnageNom ? personnageNom : "Voix directe"}</span>
        {nbRepliques > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="num">
              {nbRepliques} réplique{nbRepliques > 1 ? "s" : ""}
            </span>
          </>
        ) : null}
        {critique ? <span className="crit-tag">Critique</span> : null}
      </p>

      <blockquote className={`voix-card-regle${refText.trim() ? "" : " is-vide"}`}>
        {refText.trim() ? `« ${refText.trim()} »` : "Pas encore de réplique d'écoute."}
      </blockquote>

      {confirme ? (
        <div className="voix-card-conf" role="group" aria-label={`Supprimer la voix ${nom}`}>
          {suppression.bloque ? (
            <>
              <p>{suppression.raison}</p>
              <button type="button" className="btn" onClick={() => setConfirme(false)}>
                Compris
              </button>
            </>
          ) : (
            <>
              <p>
                Supprimer définitivement <b>{nom}</b> ?{suppression.avertissement ? ` ${suppression.avertissement}` : ""}
              </p>
              <span className="voix-card-conf-actions">
                <button type="button" className="btn btn-danger" onClick={supprimer} disabled={pending}>
                  {pending ? "…" : "Supprimer"}
                </button>
                <button type="button" className="btn" onClick={() => setConfirme(false)} disabled={pending}>
                  Annuler
                </button>
              </span>
            </>
          )}
          {erreur ? <p className="tiny-note" style={{ color: "var(--ecarlate-glow)", margin: 0 }}>{erreur}</p> : null}
        </div>
      ) : (
        <div className="voix-card-ref">
          {referenceSrc ? (
            <>
              <button type="button" className="asset-card-play voix-card-play" onClick={basculer} aria-pressed={joue} aria-label={joue ? `Arrêter la voix de ${nom}` : `Écouter la voix de référence de ${nom}`}>
                {joue ? <Icone nom="arret" taille={16} /> : <Icone nom="lecture" taille={16} />}
              </button>
              <audio ref={audioRef} src={referenceSrc} preload="none" onEnded={() => setJoue(false)} />
              <div className="voix-card-onde" aria-hidden="true">
                {barres.map((h, k) => (
                  <i key={k} style={{ height: `${h}%`, animationDelay: `${k * 37}ms` }} />
                ))}
              </div>
            </>
          ) : (
            <span className="tiny-note" style={{ flex: 1 }}>{referenceFichier ? "Référence introuvable" : "Pas de voix de référence"}</span>
          )}
          <Link href={href} className={`btn voix-card-ouvrir${etat === "a_creer" ? " btn-primary" : ""}`}>
            {etat === "a_creer" ? "Commencer" : "Reprendre"}
          </Link>
          <button type="button" className="voix-card-sup" onClick={ouvrirConfirmation} aria-label={`Supprimer la voix ${nom}`} title="Supprimer cette voix">
            <Icone nom="supprimer" taille={18} />
          </button>
        </div>
      )}
    </article>
  );
}
