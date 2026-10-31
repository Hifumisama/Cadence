"use client";

import { LotUpscaleButton } from "@/components/plan/LotUpscaleButton";

/** La barre du haut de la fiche : l'avancée vers l'upscale (« 3 / 6 prêts à upscaler ») et « Lancer l'upscale » (une fenêtre pour composer le lot : les
 * plans prêts sont cochés, ceux dont la fiche a changé se régénèrent s'ils sont cochés). C'est le seul endroit d'où l'upscale part. Générer les
 * prévisualisations manquantes se fait depuis la page des plans. */
export function BarreFiche({
  episodeId,
  prets,
  total,
}: {
  episodeId: number;
  prets: number;
  total: number;
}) {
  return (
    <div className="tm-top">
      <div className="tm-avance" aria-live="polite">
        <span className="num">
          {prets} / {total}
        </span>{" "}
        prêt{prets > 1 ? "s" : ""} à upscaler
        <span className="tm-barre" role="presentation">
          <i style={{ width: `${total ? Math.round((100 * prets) / total) : 0}%` }} />
        </span>
      </div>
      <LotUpscaleButton episodeId={episodeId} prets={prets} />
    </div>
  );
}
