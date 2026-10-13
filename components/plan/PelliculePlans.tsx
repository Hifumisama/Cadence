"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { Vignette } from "@/components/plan/Vignette";
import { LIBELLE_ETAT_PLAN, type EtatPlan } from "@/lib/fiche-plan";

export type CadrePlan = {
  uuid: string;
  /** Rang dans l'épisode (« 04 ») : ce qu'on affiche, jamais un identifiant. */
  position: number;
  titre: string;
  etat: EtatPlan;
  /** Source de la vignette (essai retenu, sinon dernier essai terminé), null sans rendu. */
  src: string | null;
  href: string;
};

/** Les touches qui ne doivent pas naviguer : on écrit, ou une fenêtre modale est ouverte. */
export function frappeEnCours(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName?.toLowerCase();
  return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || tag === "textarea" || tag === "input" || tag === "select" || !!t?.isContentEditable || !!document.querySelector("dialog[open], .modal-overlay");
}

/** La pellicule des PLANS de l'épisode, collée en bas de la fiche : un cadre par plan, dans l'ordre `plans.ordre` (la position affichée est
 * le rang, pas un identifiant), avec son état (brouillon pointillé, en itération écarlate, prêt à upscaler or). ‹ › et les flèches ← → passent
 * d'un plan à l'autre. Ne pas confondre avec la colonne des essais d'UN plan (PlateauEssais). */
export function PelliculePlans({ plans, courant }: { plans: CadrePlan[]; courant: string }) {
  const router = useRouter();
  const reel = useRef<HTMLDivElement>(null);
  const i = plans.findIndex((p) => p.uuid === courant);

  const aller = useCallback(
    (k: number) => {
      const p = plans[k];
      if (p) router.push(p.href, { scroll: false });
    },
    [plans, router],
  );

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (frappeEnCours(e)) return;
      if (e.key === "ArrowRight") aller(i + 1);
      else if (e.key === "ArrowLeft") aller(i - 1);
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [aller, i]);

  // Le cadre courant au centre de la pellicule (sans faire défiler la page).
  useEffect(() => {
    const r = reel.current;
    const el = r?.querySelector<HTMLElement>("[aria-current='page']");
    if (r && el) r.scrollTo({ left: el.offsetLeft - r.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
  }, [courant, plans.length]);

  return (
    <nav className="tm-reel-zone" aria-label="Plans de l'épisode">
      <button type="button" className="tm-reel-nav" aria-label="Plan précédent" disabled={i <= 0} onClick={() => aller(i - 1)}>
        ‹
      </button>
      <div className="tm-reel" ref={reel}>
        {plans.map((p) => (
          <Link
            key={p.uuid}
            href={p.href}
            scroll={false}
            className={`tm-cadre${p.uuid === courant ? " is-on" : ""}${p.src ? "" : " is-vide"}`}
            aria-current={p.uuid === courant ? "page" : undefined}
            aria-label={`Plan ${p.position}, ${p.titre}, ${LIBELLE_ETAT_PLAN[p.etat].toLowerCase()}`}
          >
            <span className="tm-cadre-img">
              <Vignette src={p.src} />
              <span className="tm-cadre-pos num">{String(p.position).padStart(2, "0")}</span>
              <span className={`tm-cadre-etat is-${p.etat}`} aria-hidden="true">
                {p.etat === "pret" ? "✓" : ""}
              </span>
            </span>
            <span className="tm-cadre-nom">{p.titre}</span>
          </Link>
        ))}
      </div>
      <button type="button" className="tm-reel-nav" aria-label="Plan suivant" disabled={i < 0 || i >= plans.length - 1} onClick={() => aller(i + 1)}>
        ›
      </button>
    </nav>
  );
}
