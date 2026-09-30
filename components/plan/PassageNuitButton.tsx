"use client";

import { useState, useTransition } from "react";
import { lancerPassageNuit } from "@/app/plans/actions";

/** Déclenche le "passage nuit" (CDC page 4) — confirmation à deux temps
 * plutôt qu'un window.confirm : ce bouton met potentiellement des dizaines
 * de rendus upscale en file d'un coup, une vraie dépense de temps ComfyUI,
 * pas une action à un clic accidentel près. */
export function PassageNuitButton({
  episodeId,
  nPrevisualise,
}: {
  episodeId: number;
  nPrevisualise: number;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState(false);
  const [resultat, setResultat] = useState<{ n: number; bloques: number } | null>(null);

  if (nPrevisualise === 0) return null;

  const onLancer = () => {
    if (!confirmation) {
      setConfirmation(true);
      return;
    }
    startTransition(async () => {
      setResultat(await lancerPassageNuit(episodeId));
      setConfirmation(false);
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        className={confirmation ? "btn btn-danger" : "btn btn-ghost"}
        onClick={onLancer}
        onBlur={() => setConfirmation(false)}
        disabled={pending}
        title="Relance en rendu final (upscale) tous les plans prévisualisés de l'épisode"
      >
        {pending
          ? "Lancement..."
          : confirmation
            ? `Confirmer — ${nPrevisualise} plan${nPrevisualise > 1 ? "s" : ""}`
            : `Passage nuit (upscale en masse) · ${nPrevisualise}`}
      </button>
      {resultat !== null ? (
        <span className="tiny-note">
          {resultat.n} job{resultat.n > 1 ? "s" : ""} mis en file
          {resultat.bloques > 0
            ? ` · ${resultat.bloques} plan${resultat.bloques > 1 ? "s" : ""} sauté${resultat.bloques > 1 ? "s" : ""} (dialogues à corriger)`
            : ""}
          .
        </span>
      ) : null}
    </div>
  );
}
