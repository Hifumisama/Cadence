"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { creerScene } from "@/app/scenario/actions";
import { Icone } from "@/components/ui/Icone";
import { ChampsGenreScene } from "./ChampsGenreScene";

/** Création d'une scène, dans un tiroir qui glisse depuis la droite. C'est la carte « + » en fin de bandeau qui l'ouvre (`ouvert`), la page décide de la
 * suite (`onCree` : ouvrir la scène créée). */
export function NouveauSceneForm({
  episodeId,
  ouvert,
  onFermer,
  onCree,
}: {
  episodeId: number;
  ouvert: boolean;
  onFermer: () => void;
  onCree: (sceneId: number | null) => void;
}) {
  const [titre, setTitre] = useState("");
  const [fonction, setFonction] = useState("");
  const [genre, setGenre] = useState("");
  const [ambiance, setAmbiance] = useState("");
  const [pending, startTransition] = useTransition();
  const champTitre = useRef<HTMLInputElement>(null);

  // Ouvert : Échap ferme, le fond de page ne défile plus, le focus passe au titre.
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && !pending && onFermer();
    const defilement = document.body.style.overflow;
    document.addEventListener("keydown", echap);
    document.body.style.overflow = "hidden";
    champTitre.current?.focus();
    return () => {
      document.removeEventListener("keydown", echap);
      document.body.style.overflow = defilement;
    };
  }, [ouvert, pending, onFermer]);

  if (!ouvert) return null;

  const onCreer = () => {
    if (!titre.trim()) return;
    startTransition(async () => {
      const id = await creerScene(episodeId, { titre, fonction, genre: genre || null, ambiance });
      setTitre("");
      setFonction("");
      setGenre("");
      setAmbiance("");
      onFermer();
      onCree(id);
    });
  };

  return createPortal(
    <div className="sc-tiroir-fond" onClick={pending ? undefined : onFermer}>
      <aside className="sc-tiroir" role="dialog" aria-modal="true" aria-label="Nouvelle scène" onClick={(e) => e.stopPropagation()}>
        <header className="sc-tiroir-hd">
          <div>
            <span className="sc-tiroir-etiquette">Création</span>
            <h2>Nouvelle scène</h2>
            <p>Elle naît vide, à la suite des autres : les plans s&rsquo;y rattachent ensuite.</p>
          </div>
          <button type="button" className="sc-tiroir-fermer" onClick={onFermer} disabled={pending} aria-label="Fermer">
            <Icone nom="fermer" taille={18} />
          </button>
        </header>
        <div className="sc-tiroir-corps">
          <div className="form-grid">
            <div className="field-group wide">
              <label htmlFor="nouvelle-scene-titre">Titre</label>
              <input
                id="nouvelle-scene-titre"
                ref={champTitre}
                className="field"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Ex. Le Labyrinthe"
                onKeyDown={(e) => e.key === "Enter" && onCreer()}
              />
            </div>
            <div className="field-group wide">
              <label htmlFor="nouvelle-scene-fonction">Fonction</label>
              <textarea id="nouvelle-scene-fonction" className="field" rows={3} value={fonction} onChange={(e) => setFonction(e.target.value)} />
              <span className="tiny-note">Ce que la scène fait dans le récit.</span>
            </div>
            <ChampsGenreScene genre={genre} ambiance={ambiance} onGenre={setGenre} onAmbiance={setAmbiance} />
          </div>
        </div>
        <footer className="sc-tiroir-pied">
          <button className="btn btn-gold" type="button" onClick={onCreer} disabled={pending || !titre.trim()}>
            {pending ? "Création…" : "Créer la scène"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onFermer} disabled={pending}>
            Annuler
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
