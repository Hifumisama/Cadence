"use client";

import { useRef, useState } from "react";
import { useBrouillon } from "@/components/plan/BrouillonPlan";

// Bornes imposées par H3 : pas de génération plus courte ni plus longue.
const DUREE_MIN = 5;
const DUREE_MAX = 15;

function seedAuHasard(): string {
  let s = String(1 + Math.floor(Math.random() * 9));
  for (let i = 0; i < 14; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** La console de rendu : durée, FPS, seed et les trois façons de lancer. Rien n'est enregistré avant le lancement, qui fige le
 * prompt et tous les réglages du plan d'un coup (BrouillonPlan). */
export function ConsoleRendu({ timecodeMusique }: { timecodeMusique: string | null }) {
  const b = useBrouillon();
  const dernierRendu = b.prochainRendu - 1;
  const [rotation, setRotation] = useState(0);
  const [defile, setDefile] = useState<string | null>(null);
  const iv = useRef<ReturnType<typeof setInterval> | null>(null);
  const modifie = b.modifications.length > 0;

  const tirer = () => {
    setRotation((r) => r + 720);
    let tours = 0;
    if (iv.current) clearInterval(iv.current);
    iv.current = setInterval(() => {
      tours++;
      if (tours > 12) {
        if (iv.current) clearInterval(iv.current);
        setDefile(null);
        b.setSeed(seedAuHasard());
        return;
      }
      setDefile(seedAuHasard());
    }, 45);
  };

  return (
    <section className="panel fp-console" id="fp-console" aria-label="Rendu">
      <div className="panel-hd">
        <h2>Rendu</h2>
        <div className={`fp-etat${modifie ? " is-mod" : ""}`} role="status">
          <span className="fp-etat-point" aria-hidden="true" />
          {modifie ? (
            <span>
              Non figé : {b.modifications.join(", ")}{" "}
              <button type="button" className="fp-lien" onClick={b.annuler}>
                tout annuler
              </button>
            </span>
          ) : (
            <span>{dernierRendu > 0 ? `Figé : identique au rendu n°${dernierRendu}` : "Figé"}</span>
          )}
        </div>
      </div>

      <div className="fp-reglages">
        <div className="fp-champ fp-champ-duree">
          <label htmlFor="fp-duree">
            Durée de génération <span className="num fp-valeur">{b.duree} s</span>
          </label>
          <input
            id="fp-duree"
            type="range"
            className="slider"
            min={DUREE_MIN}
            max={DUREE_MAX}
            step={1}
            value={Math.min(DUREE_MAX, Math.max(DUREE_MIN, b.duree))}
            onChange={(e) => b.setDuree(Number(e.target.value))}
          />
          <div className="slider-bornes num" aria-hidden="true">
            <span>{DUREE_MIN} s</span>
            <span>{DUREE_MAX} s</span>
          </div>
        </div>
        <div className="fp-champ">
          <label htmlFor="fp-fps">FPS</label>
          <input
            id="fp-fps"
            type="number"
            className="field field-mono"
            min={1}
            value={b.fps}
            onChange={(e) => b.setFps(Number(e.target.value))}
          />
        </div>
        <div className="fp-champ">
          <label>Seed</label>
          <div className="fp-seed">
            <span className="num fp-seed-valeur">{defile ?? b.seed ?? "—"}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={tirer} title="Tirer une nouvelle seed" aria-label="Tirer une nouvelle seed">
              <span className="fp-de" style={{ transform: `rotate(${rotation}deg)` }}>
                ⟳
              </span>
            </button>
          </div>
        </div>
      </div>

      {timecodeMusique ? (
        <p className="fp-musique">
          Musique <span className="num">{timecodeMusique}</span>
        </p>
      ) : null}

      <div className="fp-lancer">
        <button
          type="button"
          className="btn fp-go fp-go-principal"
          disabled={b.occupe}
          onClick={() => b.figer("previsualiser")}
          title="Fige le prompt, les références et ces réglages, puis lance une prévisualisation basse résolution."
        >
          <span>{b.occupe ? "Figé…" : "Figer et prévisualiser"}</span>
          <small>rendu n°{b.prochainRendu}</small>
        </button>
        <button
          type="button"
          className="btn fp-go fp-go-final"
          disabled={b.occupe}
          onClick={() => b.figer("final")}
          title="Fige tout, puis rend avec upscale."
        >
          Rendu final
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm fp-variante"
          disabled={b.occupe}
          onClick={() => b.figer("variante")}
          title="Tire une nouvelle seed (autre rendu, même prompt) puis prévisualise."
        >
          Nouvelle variante
        </button>
      </div>
      {b.erreur ? (
        <p className="tiny-note fp-erreur" role="alert">
          {b.erreur}
        </p>
      ) : null}
      <p className="fp-aide">
        Rien n&rsquo;est enregistré avant de lancer : lancer fige le prompt et tous les réglages du plan, c&rsquo;est ce qui rend chaque
        rendu reproductible.
      </p>
    </section>
  );
}
