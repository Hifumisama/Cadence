"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demanderAjoutPlan } from "@/app/demandes/actions";
import { Icone } from "@/components/ui/Icone";

/** Où le plan va naître, tel que la page Scénario le sait : la place dans l'épisode (après un plan, ou au début), la scène (null = « Sans scène »)
 * et leurs noms pour l'écran. */
export type CibleAjoutPlan = {
  insertion: { apresPlanUuid: string } | { debut: true };
  sceneId: number | null;
  /** « III · La Fuite ». */
  scene: string;
  /** « Après le plan 07 · Le seuil » ou « Au début du film ». */
  apres: string;
};

/** Ajouter un plan à la scène ouverte, avec l'agent : on décrit ce qui se passe, on lance, et c'est tout. La popup se referme tout de suite : l'écriture
 * devient une ligne de la file des tâches (suivi, annulation), le plan est ajouté à la scène sans relecture, et on le relit dans sa fiche. */
export function AjouterPlan({
  projectId,
  episodeId,
  cible,
  onFermer,
  onLance,
}: {
  projectId: number;
  episodeId: number;
  /** La popup est ouverte quand une cible est donnée. */
  cible: CibleAjoutPlan | null;
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
