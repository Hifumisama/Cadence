"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

/** Durée de l'animation de sélection avant de naviguer (ms). Court : la carte touchée confirme
 * le tap, ce n'est pas une transition de page. Nulle si l'utilisateur réduit les animations. */
const DELAI_MS = 240;

/** Grille des cartes projet. Un tap (ou un clic) sur une carte la met en avant — halo doré, les
 * autres s'estompent — puis ouvre le projet. Rien ne dépend du survol : ça doit marcher au
 * doigt sur tablette. Les cartes restent rendues côté serveur (`children`) ; on intercepte le
 * clic en phase de capture, avant celui de `Link`, pour retarder la navigation. Les clics qui
 * ouvrent ailleurs (Ctrl/Cmd/Maj/clic milieu) gardent leur comportement natif. */
export function GrilleProjets({ children }: { children: ReactNode }) {
  const router = useRouter();
  const grille = useRef<HTMLDivElement>(null);
  const enCours = useRef(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reinitialiser = () => {
    enCours.current = false;
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    const g = grille.current;
    if (!g) return;
    delete g.dataset.choix;
    g.querySelector(".is-choisie")?.classList.remove("is-choisie");
  };

  // Retour arrière (bfcache) : la grille revient dans l'état où on l'a quittée, sélection comprise.
  useEffect(() => {
    window.addEventListener("pageshow", reinitialiser);
    return () => {
      window.removeEventListener("pageshow", reinitialiser);
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, []);

  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const carte = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.proj-card");
    const href = carte?.getAttribute("href");
    if (!carte || !href || !grille.current) return;
    e.preventDefault();
    if (enCours.current) return;
    enCours.current = true;
    carte.classList.add("is-choisie");
    grille.current.dataset.choix = "";
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    minuteur.current = setTimeout(() => router.push(href), reduit ? 0 : DELAI_MS);
  };

  return (
    <div ref={grille} className="proj-grid" onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
