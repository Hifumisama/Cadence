"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { supprimerScene } from "@/app/scenario/actions";

/** Menu « ⋯ » d'une scène : la suppression, destructive, ne reste pas à côté de « Modifier » en permanence. */
export function SupprimerSceneButton({ sceneId, titre }: { sceneId: number; titre: string }) {
  const [pending, startTransition] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: Event) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const onSupprimer = () => {
    setOuvert(false);
    if (!window.confirm(`Supprimer la scène "${titre}" ? Ses plans passeront en "sans scène".`)) return;
    startTransition(() => supprimerScene(sceneId));
  };

  return (
    <span className="menu-plus" ref={racine}>
      <button
        className="btn btn-ghost btn-sm menu-plus-btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Plus d'actions pour la scène ${titre}`}
        onClick={() => setOuvert((v) => !v)}
        disabled={pending}
      >
        ⋯
      </button>
      {ouvert ? (
        <span className="menu-plus-liste" role="menu">
          <button className="menu-plus-item is-danger" type="button" role="menuitem" onClick={onSupprimer}>
            Supprimer la scène
          </button>
        </span>
      ) : null}
    </span>
  );
}
