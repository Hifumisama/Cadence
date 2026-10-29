"use client";

import { useLayoutEffect, useRef, useState, useTransition, type RefObject } from "react";
import { deplacerPlan } from "@/app/scenario/actions";

export const MIME_PLAN = "application/x-cadence-plan";
export const MIME_SCENE = "application/x-cadence-scene";

/* ---- Animation des déplacements -------------------------------------------
 * Après un dépôt, la page est re-rendue côté serveur et les éléments sautent à
 * leur nouvelle place. À chaque rendu on compare la position de l'élément à
 * celle du rendu précédent et on le fait glisser de l'ancienne vers la nouvelle
 * (technique « FLIP »). Les positions viennent de `offsetTop`, insensible aux
 * transformations en cours (et donc au défilement). Verticale seulement : la
 * liste s'anime, la grille de vignettes (qui revient à la ligne) non. */

const mouvementReduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const hautAbsolu = (el: HTMLElement) => {
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
};

/** Dernier élément déposé : il reçoit un bref halo doré une fois arrivé à sa place. */
let dernierDepose: string | null = null;
export const marquerDepose = (cle: string) => {
  dernierDepose = cle;
};

function useGlissement(ref: RefObject<HTMLElement | null>, cle: string, actif: boolean) {
  const precedent = useRef<number | null>(null);
  const premierRendu = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    const premier = premierRendu.current;
    premierRendu.current = false;
    if (!el || !actif) return;
    if (el.offsetParent === null) {
      precedent.current = null;
      return;
    }
    const y = hautAbsolu(el);
    const avant = precedent.current;
    precedent.current = y;
    const deplace = avant !== null && Math.abs(avant - y) > 1;
    if (mouvementReduit()) return;
    if (deplace) {
      el.animate([{ transform: `translateY(${avant - y}px)` }, { transform: "translateY(0)" }], {
        duration: 340,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
    if (dernierDepose === cle && (deplace || premier)) {
      dernierDepose = null;
      el.animate(
        [
          { backgroundColor: "rgba(201, 162, 75, 0.22)", boxShadow: "inset 2px 0 0 #c9a24b" },
          { backgroundColor: "rgba(201, 162, 75, 0)", boxShadow: "inset 2px 0 0 rgba(201, 162, 75, 0)" },
        ],
        { duration: 1200, easing: "ease-out", delay: 120 },
      );
    }
  });
}

/** Aperçu du glissement : le fantôme natif du navigateur est semi-transparent et
 * non stylable, on le masque (image vide) et on promène un clone opaque, mis en
 * forme par `.apercu-drag`, qui suit le curseur. `dragover` donne la position
 * sur tous les navigateurs ; le clone est retiré à la fin du glissement ou au
 * dépôt (en capture : les cibles arrêtent la propagation). */
export function demarrerApercu(e: React.DragEvent, source: HTMLElement) {
  e.dataTransfer.setDragImage(document.createElement("canvas"), 0, 0);
  const r = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove("is-drag", "drop-avant", "drop-apres", "drop-g", "drop-d");
  clone.classList.add("apercu-drag");
  clone.style.width = `${r.width}px`;
  document.body.appendChild(clone);
  const dx = e.clientX - r.left;
  const dy = e.clientY - r.top;
  const place = (x: number, y: number) => {
    clone.style.transform = `translate(${x - dx}px, ${y - dy}px) rotate(1deg)`;
  };
  place(e.clientX, e.clientY);
  const suit = (ev: DragEvent) => {
    if (ev.clientX || ev.clientY) place(ev.clientX, ev.clientY);
  };
  const fin = () => {
    clone.remove();
    document.removeEventListener("dragover", suit);
    document.removeEventListener("dragend", fin, true);
    document.removeEventListener("drop", fin, true);
  };
  document.addEventListener("dragover", suit);
  document.addEventListener("dragend", fin, true);
  document.addEventListener("drop", fin, true);
}

/** Marque l'élément comme « en cours de glissement » après le démarrage du drag :
 * changer l'apparence tout de suite figerait l'image fantôme déjà atténuée. */
export function useEnGlissement() {
  const [enDrag, setEnDrag] = useState(false);
  return {
    enDrag,
    debut: () => setTimeout(() => setEnDrag(true), 0),
    fin: () => setEnDrag(false),
  };
}

export type ChargePlan = { planId: number; sceneId: number | null };

export const lire = <T,>(e: React.DragEvent, mime: string): T | null => {
  try {
    return JSON.parse(e.dataTransfer.getData(mime)) as T;
  } catch {
    return null;
  }
};

/** Un plan déplaçable et cible de dépôt, dans une liste (`axe` "y") ou une grille de vignettes (`axe` "x"). Déposer sur sa première moitié
 * (haute, ou gauche) place le plan glissé AVANT celui-ci, sur la seconde APRÈS (donc avant `suivantId`, ou en fin de scène s'il n'y en a
 * pas). Un clic le sélectionne (`onClick`), c'est à l'appelant de décider de la suite : ouvrir la fiche, déplier… */
export function PlanDeplacable({
  planId,
  sceneId,
  suivantId,
  axe,
  className,
  selectionne,
  onClick,
  onDoubleClick,
  onKeyDown,
  children,
}: {
  planId: number;
  sceneId: number | null;
  suivantId: number | null;
  axe: "x" | "y";
  className: string;
  selectionne: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const [repere, setRepere] = useState<"avant" | "apres" | null>(null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const { enDrag, debut, fin } = useEnGlissement();
  useGlissement(ref, `plan:${planId}`, axe === "y");

  const cote = (e: React.DragEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const avant = axe === "x" ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    return avant ? "avant" : "apres";
  };
  // Le repère d'insertion : un trait doré en haut/en bas (liste) ou à gauche/à droite (grille).
  const classeRepere = repere ? (axe === "x" ? (repere === "avant" ? " drop-g" : " drop-d") : ` drop-${repere}`) : "";

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selectionne}
      tabIndex={0}
      data-plan={planId}
      className={`${className}${selectionne ? " is-sel" : ""}${classeRepere}${enDrag ? " is-drag" : ""}`}
      draggable
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_PLAN, JSON.stringify({ planId, sceneId } satisfies ChargePlan));
        e.dataTransfer.effectAllowed = "move";
        demarrerApercu(e, e.currentTarget);
        debut();
      }}
      onDragEnd={fin}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MIME_PLAN)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setRepere(cote(e));
      }}
      onDragLeave={() => setRepere(null)}
      onDrop={(e) => {
        const c = lire<ChargePlan>(e, MIME_PLAN);
        setRepere(null);
        if (!c) return;
        e.preventDefault();
        e.stopPropagation();
        if (c.planId === planId) return;
        const avant = cote(e) === "avant" ? planId : suivantId;
        if (avant === c.planId) return;
        marquerDepose(`plan:${c.planId}`);
        startTransition(() => deplacerPlan(c.planId, sceneId, avant));
      }}
    >
      {children}
    </div>
  );
}
