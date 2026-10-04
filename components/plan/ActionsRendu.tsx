"use client";

import { useState, useTransition } from "react";
import { rendreFinalAvecRendu, retenirRendu } from "@/app/plans/actions";

/** Ce qu'on peut faire d'un rendu de l'historique : le reprendre comme référence du plan (sa seed, sa durée, et si on veut son
 * prompt), ou l'envoyer directement en rendu final. Même seed + même prompt + mêmes références + même durée = même résultat :
 * c'est ce qui fait que l'upscale reproduit la prévisualisation choisie. */
export function ActionsRendu({
  planId,
  jobId,
  promptChange,
  aUnPrompt,
  estSeedDuPlan,
}: {
  planId: number;
  jobId: number;
  /** Le prompt du plan a changé depuis ce rendu. */
  promptChange: boolean;
  aUnPrompt: boolean;
  /** Le plan utilise déjà la seed de ce rendu. */
  estSeedDuPlan: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [restaurer, setRestaurer] = useState(promptChange && aUnPrompt);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const lancer = (final: boolean) =>
    startTransition(async () => {
      const r = final ? await rendreFinalAvecRendu(planId, jobId, restaurer) : await retenirRendu(planId, jobId, restaurer);
      setMessage(
        r.ok
          ? { ok: true, texte: final ? "Rendu final lancé avec ce rendu." : "Seed reprise : le prochain rendu le reproduira." }
          : { ok: false, texte: r.erreur },
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {promptChange && aUnPrompt ? (
        <label className="tiny-note" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <input type="checkbox" checked={restaurer} onChange={(e) => setRestaurer(e.target.checked)} />
          <span>
            Le prompt a changé depuis ce rendu : restaurer aussi son prompt (sinon le résultat ne sera pas identique).
          </span>
        </label>
      ) : null}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => lancer(true)} title="Reprend la seed, la durée (et le prompt si coché) de ce rendu, puis lance le rendu final avec upscale.">
          {pending ? "..." : "Rendu final avec celui-ci"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => lancer(false)} title="Le plan reprend la seed de ce rendu ; le prochain Prévisualiser ou Rendu final le reproduira.">
          {estSeedDuPlan && !(promptChange && restaurer) ? "Seed déjà utilisée" : "Utiliser cette seed"}
        </button>
      </div>
      {message ? (
        <span className="tiny-note" role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "var(--or)" : "var(--ecarlate-glow)" }}>
          {message.texte}
        </span>
      ) : null}
    </div>
  );
}
