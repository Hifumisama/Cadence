"use client";

import { useState } from "react";
import type { GenerationVivante } from "@/components/assets/GenerationDialog";
import type { GenreTache } from "@/lib/taches";

const DERRIERE: Record<GenreTache, string> = { image: "une image", video: "une vidéo", llm: "un agent" };
const ACTIFS = ["en_attente", "en_cours"];

/** Les essais d'un test de voix (audio ou vidéo), du plus récent au plus ancien : ceux qui attendent ou tournent (avec leur rang
 * dans la file, leur progression, l'annulation), ceux qui sont prêts (un lecteur, « Utiliser », « Supprimer »), ceux qui ont
 * échoué. Le suivi vit aussi dans l'icône du bandeau : fermer cette page n'interrompt rien. */
export function CandidatsTest({
  nature,
  generations,
  occupe,
  onAdopter,
  onSupprimer,
  onAnnuler,
  libelleMode,
  libelleAdopter,
}: {
  nature: "audio" | "video";
  generations: GenerationVivante[];
  occupe: boolean;
  onAdopter: (id: number) => void;
  onSupprimer: (id: number) => void;
  onAnnuler: (g: GenerationVivante) => void;
  /** Libellé facultatif du mode d'un essai (le test vidéo n'en a plus : un seul mode, sans upscale). */
  libelleMode?: (g: GenerationVivante) => string | null;
  /** Libellé du geste d'adoption (« Garder celle-ci » pour une voix de référence) ; à défaut, « Utiliser comme audio / vidéo de test ». */
  libelleAdopter?: string;
}) {
  const [confirmer, setConfirmer] = useState<number | null>(null);
  if (generations.length === 0) return <p className="tiny-note">Aucun essai pour l&rsquo;instant.</p>;

  return (
    <ul className="test-essais">
      {generations.map((g, i) => {
        const actif = ACTIFS.includes(g.statut);
        const mode = libelleMode?.(g) ?? null;
        return (
          <li key={g.id} className={`test-essai st-${g.statut}`}>
            <div className="test-essai-hd">
              <span className="num">n°{generations.length - i}</span>
              {mode ? <span className="tiny-note">{mode}</span> : null}
              <span className="tiny-note">
                {g.statut === "en_attente"
                  ? `En file${g.position ? ` · n°${g.position}` : ""}${g.derriere ? ` · derrière ${DERRIERE[g.derriere]}` : ""}`
                  : g.statut === "en_cours"
                    ? g.progression?.etape
                      ? g.progression.etape
                      : "En cours…"
                    : g.statut === "annulee"
                      ? "Annulé"
                      : g.statut === "echoue"
                        ? "Échoué"
                        : ""}
              </span>
            </div>

            {actif ? (
              <>
                {g.progression ? (
                  <progress className="gd-bar" value={g.progression.valeur} max={g.progression.max} aria-label="Progression" />
                ) : (
                  <progress className="gd-bar" aria-label="Génération en cours" />
                )}
                {g.annulationDemandee ? (
                  <p className="tiny-note" role="status" style={{ color: "var(--or-glow)" }}>
                    Annulation demandée… ComfyUI est en train de s&rsquo;arrêter.
                  </p>
                ) : confirmer === g.id ? (
                  <div className="gd-row" role="group" aria-label="Confirmer l'annulation">
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => { setConfirmer(null); onAnnuler(g); }}>
                      Oui, annuler
                    </button>
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => setConfirmer(null)}>
                      Non
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-ghost btn-mini" onClick={() => (g.statut === "en_cours" ? setConfirmer(g.id) : onAnnuler(g))}>
                    {g.statut === "en_cours" ? "Annuler" : "Retirer de la file"}
                  </button>
                )}
              </>
            ) : g.statut === "termine" && g.src ? (
              <>
                {nature === "audio" ? (
                  <audio controls preload="none" src={g.src} className="voix-audio-ref" />
                ) : (
                  <video controls preload="none" src={g.src} className="test-video" />
                )}
                <div className="gd-row">
                  <button type="button" className="btn btn-primary btn-mini" onClick={() => onAdopter(g.id)} disabled={occupe}>
                    {libelleAdopter ?? (nature === "audio" ? "Utiliser comme audio de test" : "Utiliser comme vidéo de test")}
                  </button>
                  <button type="button" className="btn btn-ghost btn-mini" onClick={() => onSupprimer(g.id)} disabled={occupe}>
                    Supprimer
                  </button>
                </div>
              </>
            ) : g.statut === "echoue" ? (
              <>
                <p className="tiny-note gd-echec" role="alert">
                  {g.erreur ? g.erreur.slice(0, 220) : "Échec sans message."}
                </p>
                <button type="button" className="btn btn-ghost btn-mini" onClick={() => onSupprimer(g.id)} disabled={occupe}>
                  Retirer
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => onSupprimer(g.id)} disabled={occupe}>
                Retirer
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
