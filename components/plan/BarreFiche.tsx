"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { lancerUpscaleEpisode } from "@/app/plans/actions";
import { ToutesPrevisualisationsButton } from "@/components/plan/ToutesPrevisualisationsButton";

const s = (n: number) => (n > 1 ? "s" : "");

/** La barre du haut de la fiche : l'avancée vers l'upscale (« 3 / 6 prêts à upscaler »), « Lancer l'upscale » quand TOUS les plans sont
 * prêts (il reprend l'essai retenu de chaque plan, en rendu final), « Générer les prévisualisations (N) » pour les plans sans rendu, et
 * « Demander au réalisateur » (son écran de révision d'épisode, centré sur ce plan). */
export function BarreFiche({
  episodeId,
  prets,
  total,
  nbManquants,
  hrefRealisateur,
}: {
  episodeId: number;
  prets: number;
  total: number;
  nbManquants: number;
  hrefRealisateur: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirme, setConfirme] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tousPrets = total > 0 && prets === total;

  useEffect(() => () => void (minuteur.current && clearTimeout(minuteur.current)), []);

  const lancer = () => {
    if (!confirme) {
      // Confirmation en deux temps (jamais window.confirm) : l'upscale occupe la machine pour longtemps.
      setConfirme(true);
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => setConfirme(false), 4000);
      return;
    }
    setConfirme(false);
    startTransition(async () => {
      try {
        const r = await lancerUpscaleEpisode(episodeId);
        const notes = [r.n > 0 ? `${r.n} rendu${s(r.n)} final${r.n > 1 ? "aux" : ""} mis en file` : "Rien à lancer"];
        if (r.dejaFinal) notes.push(`${r.dejaFinal} déjà en rendu final ou importé${s(r.dejaFinal)}`);
        if (r.dejaEnFile) notes.push(`${r.dejaEnFile} déjà en file`);
        if (r.bloques) notes.push(`${r.bloques} sauté${s(r.bloques)} (dialogues ou essai à revoir)`);
        setMessage(`${notes.join(" · ")}.`);
      } catch {
        setMessage("Le lancement de l'upscale a échoué.");
      }
    });
  };

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
      {tousPrets ? (
        <button type="button" className="btn tm-btn-or" disabled={pending} onClick={lancer} title="Rendu final de l'essai retenu de chaque plan, avec upscale.">
          {pending ? "Lancement…" : confirme ? `Confirmer : ${total} rendus finaux` : "Lancer l'upscale"}
        </button>
      ) : null}
      <ToutesPrevisualisationsButton episodeId={episodeId} nbManquants={nbManquants} className="btn" />
      <Link
        href={hrefRealisateur}
        className="btn tm-btn-ligne"
        title="Le réalisateur travaille sur tout l'épisode : couper, déplacer, réécrire une scène. Il s'ouvre sur ce plan."
      >
        Demander au réalisateur
      </Link>
      {message ? (
        <span className="tiny-note tm-top-note" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
