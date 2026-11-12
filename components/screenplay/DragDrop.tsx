"use client";

import { useLayoutEffect, useRef, useState, useTransition, type RefObject } from "react";
import { deplacerPlan } from "@/app/scenario/actions";

export const MIME_PLAN = "application/x-cadence-plan";
export const MIME_SCENE = "application/x-cadence-scene";

/* ---- Movement animation -------------------------------------------
 * After a drop, the page is re-rendered on the server and the elements jump to
 * their new place. On each render we compare the element's position with
 * that of the previous render and slide it from the old one to the new one
 * (« FLIP » technique, on both axes: the thumbnail grid wraps back to the
 * line). Positions come from `offsetTop` / `offsetLeft`, insensitive to the
 * transformations in progress (and therefore to scrolling). We only animate after a
 * drop: unfolding a row's detail shifts the following ones, without animating them. */

const mouvementReduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const positionAbsolue = (el: HTMLElement) => {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
};

/** Last dropped element: it receives a brief golden halo once it has reached its place. The two markers reset on their own, so that a drop without
 * server-side effect does not arm a halo that would appear later. */
let dernierDepose: string | null = null;
let depotRecent = false;
export const marquerDepose = (cle: string) => {
  dernierDepose = cle;
  depotRecent = true;
  setTimeout(() => {
    if (dernierDepose === cle) dernierDepose = null;
    depotRecent = false;
  }, 4000);
};

function useGlissement(ref: RefObject<HTMLElement | null>, cle: string) {
  const precedent = useRef<{ x: number; y: number } | null>(null);
  const premierRendu = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    const premier = premierRendu.current;
    premierRendu.current = false;
    if (!el) return;
    if (el.offsetParent === null) {
      precedent.current = null;
      return;
    }
    const pos = positionAbsolue(el);
    const avant = precedent.current;
    precedent.current = pos;
    if (!depotRecent || mouvementReduit()) return;
    const deplace = avant !== null && (Math.abs(avant.x - pos.x) > 1 || Math.abs(avant.y - pos.y) > 1);
    if (deplace) {
      el.animate([{ transform: `translate(${avant.x - pos.x}px, ${avant.y - pos.y}px)` }, { transform: "translate(0, 0)" }], {
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

/** Drag preview: the browser's native ghost is semi-transparent and
 * not stylable, so we hide it (empty image) and carry an opaque clone, styled by
 * `.apercu-drag`, which follows the cursor. `dragover` gives the position
 * in all browsers; the clone is removed at the end of the drag or at the
 * drop (in capture: the targets stop propagation). */
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

/** Marks the element as "being dragged" after the drag starts:
 * changing its look right away would freeze the already faded ghost image. */
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

/** A movable clip and drop target, in a list (`axe` "y") or a thumbnail grid (`axe` "x"). Dropping on its first half
 * (top, or left) places the dragged clip BEFORE it, on the second half AFTER (so before `suivantId`, or at the end of the scene if there is none
 * ). A click selects it (`onClick`); it is up to the caller to decide what follows: open the sheet, unfold… */
export function PlanDeplacable({
  planId,
  sceneId,
  suivantId,
  axe,
  className,
  libelle,
  selectionne,
  tabIndex,
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
  /** Accessible name of the clip (position, title, state). */
  libelle: string;
  selectionne: boolean;
  /** Roaming tab order: only one clip of the scene is a tab stop (the selected one, otherwise the first). */
  tabIndex: 0 | -1;
  onClick: () => void;
  onDoubleClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const [repere, setRepere] = useState<"avant" | "apres" | null>(null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const { enDrag, debut, fin } = useEnGlissement();
  useGlissement(ref, `plan:${planId}`);

  const cote = (e: React.DragEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const avant = axe === "x" ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    return avant ? "avant" : "apres";
  };
  // The insertion marker: a golden line at the top/bottom (list) or left/right (grid).
  const classeRepere = repere ? (axe === "x" ? (repere === "avant" ? " drop-g" : " drop-d") : ` drop-${repere}`) : "";

  return (
    <div
      ref={ref}
      role="button"
      aria-pressed={selectionne}
      aria-label={libelle}
      tabIndex={tabIndex}
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
