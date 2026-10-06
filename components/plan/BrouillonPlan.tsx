"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { ecrireSections, figerEtLancer } from "@/app/plans/actions";

/** Les panneaux de la Fiche de plan qui reçoivent le balayage « gel » quand un rendu part. */
const PANNEAUX_GEL = ["fp-console", "fp-refs", "fp-prompt", "fp-dialogues"];
const DUREE_SCEAU_MS = 5000;

type Serveur = { sections: Record<string, string>; duree: number; fps: number; seed: string | null };
export type ModeRendu = "previsualiser" | "final" | "variante";

type Ctx = {
  sectionVue: (section: string) => string;
  sectionModifiee: (section: string) => boolean;
  sectionFigee: (section: string) => string;
  setSection: (section: string, contenu: string) => void;
  revenirSection: (section: string) => void;
  nbSectionsModifiees: number;
  duree: number;
  fps: number;
  seed: string | null;
  setDuree: (v: number) => void;
  setFps: (v: number) => void;
  setSeed: (v: string) => void;
  /** Libellés de ce qui diffère du plan figé (« 2 sections », « durée »…) ; vide = tout est figé. */
  modifications: string[];
  annuler: () => void;
  /** Abandonne le brouillon sans rien écrire (après un collage de prompt, qui remplace tout côté serveur). */
  abandonner: () => void;
  figer: (mode: ModeRendu) => void;
  /** Écrit les sections modifiées, exécute `fn`, puis reprend le contenu du serveur : pour les gestes qui réécrivent le
   * prompt côté serveur (ajouter / retirer une référence) et écraseraient un brouillon. */
  avecSectionsEcrites: <T,>(fn: () => Promise<T>) => Promise<T>;
  occupe: boolean;
  /** Numéro du rendu qui vient d'être figé, tant que le sceau est affiché. */
  sceau: number | null;
  erreur: string | null;
  prochainRendu: number;
};

const BrouillonCtx = createContext<Ctx | null>(null);

export function useBrouillon(): Ctx {
  const c = useContext(BrouillonCtx);
  if (!c) throw new Error("useBrouillon hors BrouillonProvider");
  return c;
}

/** Le brouillon de la Fiche de plan (retour utilisateur 2026-10-05 : plus d'autosave). On n'écrit rien tant qu'on ne lance pas de
 * rendu : lancer FIGE le prompt et tous les réglages d'un coup. Chaque valeur est dérivée : brouillon si on l'a touchée et qu'elle
 * diffère du serveur, serveur sinon — un rechargement de la page (suivi des rendus) ne perd donc jamais une saisie. */
export function BrouillonProvider({
  planId,
  serveur,
  prochainRendu,
  children,
}: {
  planId: number;
  serveur: Serveur;
  prochainRendu: number;
  children: ReactNode;
}) {
  const [sections, setSections] = useState<Record<string, string>>({});
  const [duree, setDureeBrut] = useState<number | null>(null);
  const [fps, setFpsBrut] = useState<number | null>(null);
  const [seed, setSeedBrut] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sceau, setSceau] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dureeVue = duree ?? serveur.duree;
  const fpsVue = fps ?? serveur.fps;
  const seedVue = seed ?? serveur.seed;

  const sectionModifiee = useCallback(
    (s: string) => sections[s] !== undefined && sections[s] !== (serveur.sections[s] ?? ""),
    [sections, serveur.sections],
  );
  const sectionVue = useCallback((s: string) => sections[s] ?? serveur.sections[s] ?? "", [sections, serveur.sections]);
  const sectionFigee = useCallback((s: string) => serveur.sections[s] ?? "", [serveur.sections]);

  const modifiees = useMemo(
    () => Object.keys(sections).filter((s) => sections[s] !== (serveur.sections[s] ?? "")),
    [sections, serveur.sections],
  );
  const dureeModifiee = dureeVue !== serveur.duree;
  const fpsModifie = fpsVue !== serveur.fps;
  const seedModifiee = seed != null && seed !== serveur.seed;

  const modifications = useMemo(() => {
    const m: string[] = [];
    if (modifiees.length) m.push(`${modifiees.length} section${modifiees.length > 1 ? "s" : ""}`);
    if (dureeModifiee) m.push("durée");
    if (fpsModifie) m.push("FPS");
    if (seedModifiee) m.push("seed");
    return m;
  }, [modifiees.length, dureeModifiee, fpsModifie, seedModifiee]);

  const nettoyer = () => {
    setSections({});
    setDureeBrut(null);
    setFpsBrut(null);
    setSeedBrut(null);
  };

  const brouillonModifie = (): Record<string, string> => Object.fromEntries(modifiees.map((s) => [s, sections[s]!]));

  const figer = (mode: ModeRendu) => {
    if (pending || sceau != null) return;
    setErreur(null);
    startTransition(async () => {
      const r = await figerEtLancer(
        planId,
        {
          sections: brouillonModifie(),
          ...(dureeModifiee ? { dureeGenerationSecondes: dureeVue } : {}),
          ...(fpsModifie ? { fps: fpsVue } : {}),
          ...(seedModifiee && seedVue ? { seed: seedVue } : {}),
        },
        mode,
      );
      nettoyer();
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      // Balayage « gel » sur les panneaux, puis sceau pendant 5 s : le temps que le rendu se place dans la file.
      for (const id of PANNEAUX_GEL) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.remove("fp-gel");
        void el.offsetWidth;
        el.classList.add("fp-gel");
      }
      setSceau(r.numeroRendu);
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => setSceau(null), DUREE_SCEAU_MS);
    });
  };

  const avecSectionsEcrites = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const aEcrire = brouillonModifie();
    if (Object.keys(aEcrire).length) await ecrireSections(planId, aEcrire);
    try {
      return await fn();
    } finally {
      setSections({});
    }
  };

  const valeur: Ctx = {
    sectionVue,
    sectionModifiee,
    sectionFigee,
    setSection: (s, c) => setSections((p) => ({ ...p, [s]: c })),
    revenirSection: (s) =>
      setSections((p) => {
        const reste = { ...p };
        delete reste[s];
        return reste;
      }),
    nbSectionsModifiees: modifiees.length,
    duree: dureeVue,
    fps: fpsVue,
    seed: seedVue,
    setDuree: setDureeBrut,
    setFps: setFpsBrut,
    setSeed: setSeedBrut,
    modifications,
    annuler: nettoyer,
    abandonner: nettoyer,
    figer,
    avecSectionsEcrites,
    occupe: pending || sceau != null,
    sceau,
    erreur,
    prochainRendu,
  };

  return <BrouillonCtx.Provider value={valeur}>{children}</BrouillonCtx.Provider>;
}
