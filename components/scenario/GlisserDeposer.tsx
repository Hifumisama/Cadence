"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { deplacerPlan, deplacerScene } from "@/app/scenario/actions";

const MIME_PLAN = "application/x-cadence-plan";
const MIME_SCENE = "application/x-cadence-scene";

const EVT_ACCORDEON = "cadence:scenes-accordeon";
const cleReplie = (sceneId: number | null) => `cadence:scene-replie:${sceneId ?? "sans"}`;

type Accordeon = { replie: boolean; basculer: () => void };
const AccordeonContext = createContext<Accordeon>({ replie: false, basculer: () => {} });

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
      {replie ? "▸" : "▾"}
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
      {toutReplie ? "Tout déplier" : "Tout replier"}
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

  const cote = (e: React.DragEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "avant" : "apres";
  };

  return (
    <Link
      href={href}
      className={`${className}${repere ? ` drop-${repere}` : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_PLAN, JSON.stringify({ planId, sceneId } satisfies ChargePlan));
        e.dataTransfer.effectAllowed = "move";
      }}
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
  return (
    <span
      className="scene-poignee"
      draggable
      title="Glisser pour réordonner la scène"
      aria-label="Réordonner la scène"
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_SCENE, JSON.stringify({ sceneId }));
        e.dataTransfer.effectAllowed = "move";
        const bloc = e.currentTarget.closest(".scene");
        if (bloc) e.dataTransfer.setDragImage(bloc, 16, 16);
      }}
    >
      ⠿
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
    <AccordeonContext.Provider value={{ replie, basculer: () => appliquer(!replie) }}>
    <div
      className={`scene${replie ? " is-replie" : ""}${survol ? " is-drop" : ""}${pending ? " is-pending" : ""}${repereScene ? ` drop-scene-${repereScene}` : ""}`}
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
          startTransition(() => deplacerScene(c.sceneId, avant));
        }
      }}
    >
      {children}
    </div>
    </AccordeonContext.Provider>
  );
}
