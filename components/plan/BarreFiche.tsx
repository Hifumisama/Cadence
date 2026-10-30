"use client";

import { LotUpscaleButton } from "@/components/plan/LotUpscaleButton";
import { ToutesPrevisualisationsButton } from "@/components/plan/ToutesPrevisualisationsButton";

/** La barre du haut de la fiche : l'avancée vers l'upscale (« 3 / 6 prêts à upscaler »), « Lancer l'upscale » (une fenêtre pour composer le lot : les plans
 * prêts sont cochés, ceux dont la fiche a changé se régénèrent s'ils sont cochés) et « Générer les prévisualisations (N) » pour les plans sans rendu.
 * */
export function BarreFiche({
  episodeId,
  prets,
  total,
  nbManquants,
}: {
  episodeId: number;
  prets: number;
  total: number;
  nbManquants: number;
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
      <ToutesPrevisualisationsButton episodeId={episodeId} nbManquants={nbManquants} className="btn" />
    </div>
  );
}
