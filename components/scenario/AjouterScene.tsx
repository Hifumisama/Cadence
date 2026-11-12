"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demanderAjoutScene } from "@/app/demandes/actions";
import { Icone } from "@/components/ui/Icone";
import type { PlaceScene } from "@/lib/tasks/demandes";

/** Où la scène va naître, tel que la page Scénario le sait : la place dans le film et son libellé pour l'écran. */
export type CibleAjoutScene = {
  place: PlaceScene;
  /** « Après III · La Fuite » ou « Au début du film ». */
  apres: string;
};

/** Ajouter une scène au film, avec l'agent : on dit en une phrase ce qu'elle doit raconter (ou rien : l'agent propose la suite), on lance, et c'est tout.
 * La popup se referme tout de suite : l'écriture devient une ligne de la file des tâches, la scène et ses plans sont ajoutés au film sans relecture, et on les
 * relit dans la page. Même geste que « Ajouter un plan ». */
export function AjouterScene({
  projectId,
  episodeId,
  cible,
  onFermer,
  onLance,
}: {
  projectId: number;
  episodeId: number;
  /** La popup est ouverte quand une cible est donnée. */
  cible: CibleAjoutScene | null;
  onFermer: () => void;
  /** La demande est posée (l'écriture continue en arrière-plan). */
  onLance: () => void;
}) {
  const [consigne, setConsigne] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef<HTMLTextAreaElement>(null);
  const ouvert = cible != null;
  const fermer = () => {
    if (!envoi) onFermer();
  };
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;

  // Ouverte : Échap ferme, le focus passe au champ. Le fond de page reste navigable (aucun verrou de défilement).
  useEffect(() => {
    if (!ouvert) return;
    setErreur(null);
    champ.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermerRef.current();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [ouvert]);

  if (!cible) return null;

  const lancer = async () => {
    if (envoi) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await demanderAjoutScene(projectId, episodeId, { consigne: consigne.trim(), place: cible.place, apres: cible.apres });
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setConsigne("");
      onFermer();
      onLance();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setEnvoi(false);
    }
  };

  return createPortal(
    <div className="sc-popup-fond" onClick={fermer}>
      <div className="sc-popup" role="dialog" aria-modal="true" aria-labelledby="ajout-scene-titre" onClick={(e) => e.stopPropagation()}>
        <header className="sc-popup-hd">
          <div>
            <span className="sc-tiroir-etiquette">Nouvelle scène</span>
            <h2 id="ajout-scene-titre">Que raconte-t-elle ?</h2>
          </div>
          <button type="button" className="sc-tiroir-fermer" onClick={fermer} disabled={envoi} aria-label="Fermer">
            <Icone nom="fermer" taille={18} />
          </button>
        </header>

        <ul className="sc-ajout-lieu">
          <li>
            <span>Place</span>
            <b>{cible.apres}</b>
          </li>
        </ul>

        <div className="sc-ajout-champ">
          <label htmlFor="ajout-scene-consigne">Ton idée pour cette scène</label>
          <textarea
            id="ajout-scene-consigne"
            ref={champ}
            className="field"
            rows={5}
            value={consigne}
            onChange={(e) => setConsigne(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void lancer();
              }
            }}
            placeholder="Ex. Elle rejoint la vieille serre au lever du jour et y retrouve la lampe qu'elle croyait perdue. (Laisse vide : l'agent propose la suite.)"
          />
          <p className="tiny-note">
            L&rsquo;agent lit le brief et les scènes voisines pour raccorder, écrit la scène avec ses plans et l&rsquo;ajoute au film ; tu la relis ensuite. Vide, il propose lui-même la suite. Ctrl + Entrée pour lancer.
          </p>
        </div>

        {erreur ? (
          <p className="sc-ajout-erreur" role="alert">
            {erreur}
          </p>
        ) : null}

        <footer className="sc-popup-pied">
          <button type="button" className="btn btn-gold" onClick={() => void lancer()} disabled={envoi}>
            {envoi ? "Lancement…" : consigne.trim() ? "Écrire la scène" : "Proposer une scène"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={fermer} disabled={envoi}>
            Annuler
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
