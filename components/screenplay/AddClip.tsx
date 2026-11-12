"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demanderAjoutPlan } from "@/app/demandes/actions";
import { Icone } from "@/components/ui/Icon";

/** Where the clip will be born, as the Scénario page knows it: its place in the episode (after a clip, or at the start), the scene (null = « Sans scène »)
 * and their names for the screen. */
export type CibleAjoutPlan = {
  insertion: { apresPlanUuid: string } | { debut: true };
  sceneId: number | null;
  /** « III · La Fuite ». */
  scene: string;
  /** « Après le plan 07 · Le seuil » ou « Au début du film ». */
  apres: string;
};

/** Adds a clip to the open scene, with the agent: we describe what happens, we launch, and that's all. The popup closes right away: the writing
 * becomes a line in the task queue (tracking, cancellation), the clip is added to the scene without review, and we reread it in its sheet. */
export function AjouterPlan({
  projectId,
  episodeId,
  cible,
  onFermer,
  onLance,
}: {
  projectId: number;
  episodeId: number;
  /** The popup is open when a target is given. */
  cible: CibleAjoutPlan | null;
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
    const c = consigne.trim();
    if (!c || envoi) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await demanderAjoutPlan(projectId, episodeId, { consigne: c, position: cible.insertion, sceneId: cible.sceneId, scene: cible.scene });
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
      <div className="sc-popup" role="dialog" aria-modal="true" aria-labelledby="ajout-plan-titre" onClick={(e) => e.stopPropagation()}>
        <header className="sc-popup-hd">
          <div>
            <span className="sc-tiroir-etiquette">Nouveau plan</span>
            <h2 id="ajout-plan-titre">Que se passe-t-il ?</h2>
          </div>
          <button type="button" className="sc-tiroir-fermer" onClick={fermer} disabled={envoi} aria-label="Fermer">
            <Icone nom="fermer" taille={18} />
          </button>
        </header>

        <ul className="sc-ajout-lieu">
          <li>
            <span>Scène</span>
            <b>{cible.scene}</b>
          </li>
          <li>
            <span>Place</span>
            <b>{cible.apres}</b>
          </li>
        </ul>

        <div className="sc-ajout-champ">
          <label htmlFor="ajout-plan-consigne">Décris le plan</label>
          <textarea
            id="ajout-plan-consigne"
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
            placeholder="Ex. Elle découvre la lampe éteinte ; plan serré sur sa main qui hésite avant de l'allumer."
          />
          <p className="tiny-note">
            Une phrase suffit : l&rsquo;agent lit le brief, la scène et les plans voisins pour raccorder. Le plan est ajouté tout seul à la scène ; tu le relis dans sa fiche. Ctrl + Entrée pour lancer.
          </p>
        </div>

        {erreur ? (
          <p className="sc-ajout-erreur" role="alert">
            {erreur}
          </p>
        ) : null}

        <footer className="sc-popup-pied">
          <button type="button" className="btn btn-gold" onClick={() => void lancer()} disabled={envoi || !consigne.trim()}>
            {envoi ? "Lancement…" : "Écrire le plan"}
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
