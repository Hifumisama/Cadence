"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demanderAjoutScene } from "@/app/demandes/actions";
import { Icone } from "@/components/ui/Icon";
import type { PlaceScene } from "@/lib/tasks/requests";

/** Where the scene will be born, as the Scénario page knows it: its place in the film and its label for the screen. */
export type CibleAjoutScene = {
  place: PlaceScene;
  /** « Après III · La Fuite » ou « Au début du film ». */
  apres: string;
};

/** Adds a scene to the film, with the agent: we say in one sentence what it should tell (or nothing: the agent proposes what follows), we launch, and that's all.
 * The popup closes right away: the writing becomes a line in the task queue, the scene and its clips are added to the film without review, and we
 * reread them in the page. Same gesture as « Ajouter un plan ». */
export function AjouterScene({
  projectId,
  episodeId,
  cible,
  onFermer,
  onLance,
}: {
  projectId: number;
  episodeId: number;
  /** The popup is open when a target is given. */
  cible: CibleAjoutScene | null;
  onFermer: () => void;
  /** The request is posted (the writing continues in the background). */
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

  // Open: Escape closes it, focus moves to the field. The page background stays navigable (no scroll lock).
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
