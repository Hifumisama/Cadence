"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition, type RefObject } from "react";
import { deplacerPlan, deplacerScene } from "@/app/scenario/actions";
import { Icone } from "@/components/ui/Icone";

const MIME_PLAN = "application/x-cadence-plan";
const MIME_SCENE = "application/x-cadence-scene";

const EVT_ACCORDEON = "cadence:scenes-accordeon";
const cleReplie = (sceneId: number | null) => `cadence:scene-replie:${sceneId ?? "sans"}`;

type Accordeon = { replie: boolean; basculer: () => void; glisseScene: (v: boolean) => void };
const AccordeonContext = createContext<Accordeon>({ replie: false, basculer: () => {}, glisseScene: () => {} });

/* ---- Animation des déplacements -------------------------------------------
 * Après un dépôt, la page est re-rendue côté serveur et les éléments sautent à
 * leur nouvelle place. À chaque rendu on compare la position de l'élément à
 * celle du rendu précédent et on le fait glisser de l'ancienne vers la nouvelle
 * (technique « FLIP »). Les positions viennent de `offsetTop`, insensible aux
 * transformations en cours (et donc au défilement). */

const mouvementReduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const hautAbsolu = (el: HTMLElement) => {
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
};

/** Dernier élément déposé : il reçoit un bref halo doré une fois arrivé à sa place. */
let dernierDepose: string | null = null;

function useGlissement(ref: RefObject<HTMLElement | null>, cle: string, dansScene: boolean) {
  const precedent = useRef<number | null>(null);
  const premierRendu = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    const premier = premierRendu.current;
    premierRendu.current = false;
    if (!el) return;
    if (el.offsetParent === null) {
      precedent.current = null; // scène repliée : pas de position à comparer
      return;
    }
    // Un plan se mesure par rapport à sa scène : quand c'est la scène qui bouge,
    // seule elle glisse, ses plans suivent sans double animation.
    const scene = dansScene ? el.closest<HTMLElement>(".scene") : null;
    const y = hautAbsolu(el) - (scene ? hautAbsolu(scene) : 0);
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
function demarrerApercu(e: React.DragEvent, source: HTMLElement) {
  e.dataTransfer.setDragImage(document.createElement("canvas"), 0, 0);
  const r = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove("is-drag", "drop-avant", "drop-apres");
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
function useEnGlissement() {
  const [enDrag, setEnDrag] = useState(false);
  return {
    enDrag,
    debut: () => setTimeout(() => setEnDrag(true), 0),
    fin: () => setEnDrag(false),
  };
}

/** Chevron de l'en-tête d'une scène : replie / déplie son contenu (accordéon). */
export function BasculeScene({ titre }: { titre: string }) {
  const { replie, basculer } = useContext(AccordeonContext);
  return (
    <button
      type="button"
      className="scene-bascule"
      aria-expanded={!replie}
      aria-label={`${replie ? "Déplier" : "Replier"} la scène ${titre}`}
      title={replie ? "Déplier" : "Replier"}
      onClick={basculer}
    >
      <Icone nom={replie ? "droite" : "bas"} />
    </button>
  );
}

/** Contenu d'une scène (description + plans), masqué quand elle est repliée.
 * Masqué et non démonté : la scène reste une cible de dépôt pour les plans. */
export function CorpsScene({ children }: { children: React.ReactNode }) {
  const { replie } = useContext(AccordeonContext);
  return <div hidden={replie}>{children}</div>;
}

/** « Tout replier » / « Tout déplier » : pilote toutes les scènes de la page. */
export function ControleAccordeon() {
  // Un seul bouton : il propose toujours l'action inverse de la dernière envoyée (les scènes gardent
  // aussi leur état individuel, on ne peut donc pas le déduire d'ici).
  const [toutReplie, setToutReplie] = useState(false);
  const basculer = () => {
    const replie = !toutReplie;
    window.dispatchEvent(new CustomEvent(EVT_ACCORDEON, { detail: { replie } }));
    setToutReplie(replie);
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm queue-toggle" onClick={basculer}>
      <Icone nom={toutReplie ? "deplierTout" : "replierTout"} taille={15} /> {toutReplie ? "Tout déplier" : "Tout replier"}
    </button>
  );
}

type ChargePlan = { planId: number; sceneId: number | null };

const lire = <T,>(e: React.DragEvent, mime: string): T | null => {
  try {
    return JSON.parse(e.dataTransfer.getData(mime)) as T;
  } catch {
    return null;
  }
};

/** Un plan de la frise : déplaçable, et cible de dépôt. Déposer sur sa moitié
 * haute place le plan glissé AVANT celui-ci, sur sa moitié basse APRÈS (donc
 * avant `suivantId`, ou en fin de scène s'il n'y en a pas). Reste un lien :
 * un clic simple ouvre toujours la fiche de plan. */
export function PlanShotLink({
  planId,
  sceneId,
  suivantId,
  href,
  className,
  children,
}: {
  planId: number;
  sceneId: number | null;
  suivantId: number | null;
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  const [repere, setRepere] = useState<"avant" | "apres" | null>(null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLAnchorElement>(null);
  const { enDrag, debut, fin } = useEnGlissement();
  useGlissement(ref, `plan:${planId}`, true);

  const cote = (e: React.DragEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "avant" : "apres";
  };

  return (
    <Link
      href={href}
      ref={ref}
      className={`${className}${repere ? ` drop-${repere}` : ""}${enDrag ? " is-drag" : ""}`}
      draggable
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
        dernierDepose = `plan:${c.planId}`;
        startTransition(() => deplacerPlan(c.planId, sceneId, avant));
      }}
    >
      {children}
    </Link>
  );
}

/** Poignée pour réordonner les scènes : on la saisit, on dépose sur une autre
 * scène (moitié haute = avant, moitié basse = après). */
export function PoigneeScene({ sceneId }: { sceneId: number }) {
  const { glisseScene } = useContext(AccordeonContext);
  return (
    <span
      className="scene-poignee"
      draggable
      title="Glisser pour réordonner la scène"
      aria-label="Réordonner la scène"
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_SCENE, JSON.stringify({ sceneId }));
        e.dataTransfer.effectAllowed = "move";
        // Aperçu : l'en-tête de la scène (la scène entière serait énorme).
        const entete = e.currentTarget.closest<HTMLElement>(".scene-top");
        if (entete) demarrerApercu(e, entete);
        setTimeout(() => glisseScene(true), 0);
      }}
      onDragEnd={() => glisseScene(false)}
    >
      <Icone nom="poignee" taille={18} />
    </span>
  );
}

/** Zone de dépôt d'une scène (`sceneId` null = « sans scène »).
 * - un plan déposé hors d'un autre plan va à la fin de la scène (ou est détaché) ;
 * - une scène déposée se place avant/après celle-ci (`suivantSceneId` = la scène
 *   d'après, null si c'est la dernière) ; sur « sans scène » : en dernier. */
export function ZoneScene({
  sceneId,
  suivantSceneId,
  children,
}: {
  sceneId: number | null;
  suivantSceneId: number | null;
  children: React.ReactNode;
}) {
  const [survol, setSurvol] = useState(false);
  const [repereScene, setRepereScene] = useState<"avant" | "apres" | null>(null);
  const [pending, startTransition] = useTransition();
  const [replie, setReplie] = useState(false);
  const [enDrag, setEnDrag] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useGlissement(ref, `scene:${sceneId}`, false);
  // dragenter/dragleave se déclenchent aussi sur les enfants : on compte.
  const profondeur = useRef(0);

  // État replié mémorisé par scène (localStorage, best-effort) et piloté par
  // le bouton global. Lu après le montage pour ne pas créer d'écart d'hydratation.
  useEffect(() => {
    try {
      setReplie(window.localStorage.getItem(cleReplie(sceneId)) === "1");
    } catch {
      // stockage indisponible : la scène reste dépliée
    }
    const surEvenement = (e: Event) => appliquer((e as CustomEvent<{ replie: boolean }>).detail.replie);
    window.addEventListener(EVT_ACCORDEON, surEvenement);
    return () => window.removeEventListener(EVT_ACCORDEON, surEvenement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId]);

  const appliquer = (valeur: boolean) => {
    setReplie(valeur);
    try {
      window.localStorage.setItem(cleReplie(sceneId), valeur ? "1" : "0");
    } catch {
      // ignoré
    }
  };

  const estPlan = (e: React.DragEvent) => e.dataTransfer.types.includes(MIME_PLAN);
  const estScene = (e: React.DragEvent) => e.dataTransfer.types.includes(MIME_SCENE);
  const cote = (e: React.DragEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "avant" : "apres";
  };
  const reinit = () => {
    profondeur.current = 0;
    setSurvol(false);
    setRepereScene(null);
  };

  return (
    <AccordeonContext.Provider value={{ replie, basculer: () => appliquer(!replie), glisseScene: setEnDrag }}>
    <div
      ref={ref}
      className={`scene${enDrag ? " is-drag" : ""}${replie ? " is-replie" : ""}${survol ? " is-drop" : ""}${pending ? " is-pending" : ""}${repereScene ? ` drop-scene-${repereScene}` : ""}`}
      onDragEnter={(e) => {
        if (!estPlan(e) && !estScene(e)) return;
        profondeur.current += 1;
        if (estPlan(e)) setSurvol(true);
      }}
      onDragOver={(e) => {
        if (estPlan(e)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        } else if (estScene(e)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setRepereScene(sceneId == null ? "avant" : cote(e));
        }
      }}
      onDragLeave={(e) => {
        if (!estPlan(e) && !estScene(e)) return;
        profondeur.current = Math.max(0, profondeur.current - 1);
        if (profondeur.current === 0) reinit();
      }}
      onDrop={(e) => {
        if (estPlan(e)) {
          e.preventDefault();
          const c = lire<ChargePlan>(e, MIME_PLAN);
          reinit();
          if (c) startTransition(() => deplacerPlan(c.planId, sceneId, null));
        } else if (estScene(e)) {
          e.preventDefault();
          const c = lire<{ sceneId: number }>(e, MIME_SCENE);
          const avant = sceneId == null ? null : cote(e) === "avant" ? sceneId : suivantSceneId;
          reinit();
          if (!c || c.sceneId === sceneId || c.sceneId === avant) return;
          dernierDepose = `scene:${c.sceneId}`;
          startTransition(() => deplacerScene(c.sceneId, avant));
        }
      }}
    >
      {children}
    </div>
    </AccordeonContext.Provider>
  );
}
