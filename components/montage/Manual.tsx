"use client";

import { useEffect, useRef } from "react";

/** Shortcuts help of the Montage page: a discreet « ? » button and a modal (the « ? » key also toggles it). Closed by default. */
export function Manuel({ ouvert, basculer }: { ouvert: boolean; basculer: (v: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    else if (!ouvert && d.open) d.close();
  }, [ouvert]);
  return (
    <>
      <button type="button" className="mt-aide" onClick={() => basculer(true)} title="Raccourcis clavier (touche ?)" aria-label="Raccourcis clavier">
        ?
      </button>
      <dialog ref={ref} className="mt-manuel" onClose={() => basculer(false)} onClick={(e) => e.target === ref.current && basculer(false)}>
        <h2 className="mt-manuel-titre">Raccourcis du Montage</h2>
      <div className="mt-manuel-bd">
        <div>
          <h3>Lecture</h3>
          <ul className="mt-keys">
            <li>
              <kbd>Espace</kbd> lecture / pause
            </li>
            <li>
              <kbd>K</kbd> pause
            </li>
            <li>
              <kbd>J</kbd> <kbd>L</kbd> reculer / avancer d’une seconde (<kbd>Maj</kbd> : cinq)
            </li>
            <li>
              <kbd>←</kbd> <kbd>→</kbd> plan précédent / suivant
            </li>
            <li>
              <kbd>Début</kbd> retour au début de l’épisode
            </li>
            <li>
              <kbd>F</kbd> mode cinéma plein écran (<kbd>Échap</kbd> pour quitter)
            </li>
          </ul>
        </div>
        <div>
          <h3>Rognage</h3>
          <ul className="mt-keys">
            <li>
              <kbd>I</kbd> poser le début du plan sous la tête de lecture
            </li>
            <li>
              <kbd>O</kbd> poser la fin du plan sous la tête de lecture
            </li>
            <li>
              <kbd>R</kbd> remettre le plan entier
            </li>
            <li>
              <kbd>S</kbd> aimantation (demi-seconde et tête de lecture)
            </li>
          </ul>
        </div>
        <div>
          <h3>Table</h3>
          <ul className="mt-keys">
            <li>
              <kbd>M</kbd> basculer entre Montage final et Ordre des scènes
            </li>
            <li>
              <kbd>D</kbd> dupliquer le plan sélectionné
            </li>
            <li>
              <kbd>Suppr</kbd> retirer du montage (le plan et ses rendus restent en base)
            </li>
            <li>
              <kbd>+</kbd> <kbd>-</kbd> zoom de la table
            </li>
            <li>
              <kbd>?</kbd> afficher / masquer cette aide
            </li>
          </ul>
        </div>
        <p className="mt-manuel-note">
          Le rognage est non destructif : le rendu reste entier, seuls le début et la fin sont mémorisés, et ils s’appliquent à la lecture et à
          l’export. Les plans sans rendu apparaissent hachurés avec leur durée prévue. Deux ordres coexistent : « Ordre des scènes » suit le
          scénario, « Montage final » est le rendu réel, que l’on réordonne, rogne et complète librement. Pour retirer un plan du montage,
          glissez-le jusqu’au bandeau « Hors montage » ; pour l’y remettre, glissez-le sur la table.
        </p>
      </div>
      </dialog>
    </>
  );
}
