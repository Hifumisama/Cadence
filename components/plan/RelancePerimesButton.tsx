"use client";

import { useState, useTransition } from "react";
import { relancerPlansPerimes } from "@/app/plans/actions";

/** « Relancer les périmés » : même confirmation à deux temps que le passage nuit (chaque plan relancé est un rendu ComfyUI). */
export function RelancePerimesButton({ episodeId, nPerimes }: { episodeId: number; nPerimes: number }) {
  const [pending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState(false);
  const [resultat, setResultat] = useState<{ n: number; bloques: number; dejaEnFile: number } | null>(null);

  if (nPerimes === 0 && resultat === null) return null;

  const onLancer = () => {
    if (!confirmation) {
      setConfirmation(true);
      return;
    }
    startTransition(async () => {
      setResultat(await relancerPlansPerimes(episodeId));
      setConfirmation(false);
    });
  };

  const s = (n: number) => (n > 1 ? "s" : "");
  const notes: string[] = [];
  if (resultat) {
    notes.push(`${resultat.n} rendu${s(resultat.n)} mis en file`);
    if (resultat.dejaEnFile > 0) notes.push(`${resultat.dejaEnFile} déjà en file`);
    if (resultat.bloques > 0) notes.push(`${resultat.bloques} sauté${s(resultat.bloques)} (dialogues à corriger)`);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {nPerimes > 0 ? (
        <button
          type="button"
          className={confirmation ? "btn btn-danger" : "btn btn-ghost"}
          onClick={onLancer}
          onBlur={() => setConfirmation(false)}
          disabled={pending}
          title="Relance, avec leur seed et dans leur mode, les plans dont une référence a changé depuis le dernier rendu"
        >
          {pending
            ? "Lancement..."
            : confirmation
              ? `Confirmer — ${nPerimes} plan${s(nPerimes)}`
              : `Relancer les périmés · ${nPerimes}`}
        </button>
      ) : null}
      {resultat ? <span className="tiny-note">{notes.join(" · ")}.</span> : null}
    </div>
  );
}
