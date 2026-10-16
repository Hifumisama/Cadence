"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { donnerSuiteIteration } from "@/app/agents/actions";
import type { ResultatSuite } from "@/lib/iteration-suite";
import { appliquerIterationEtGenerer, ecrireSections, figerEtLancer } from "@/app/plans/actions";

/** Les panneaux de la Fiche de plan qui reçoivent le balayage « gel » quand un rendu part. */
const PANNEAUX_GEL = ["fp-console", "fp-refs", "fp-prompt"];
const DUREE_SCEAU_MS = 5000;

type Serveur = { sections: Record<string, string>; duree: number; fps: number; seed: string | null };
export type ModeRendu = "previsualiser" | "final" | "variante";
export type EssaiLance = { consigne?: string | null; depuisNumero?: number | null };
export type ResultatLancement = { ok: true; numeroRendu: number } | { ok: false; erreur: string };
/** `notes` : ce que l'agent ou les contrôles ont signalé en appliquant la correction (gardé sur l'essai créé). */
export type ResultatIteration = { ok: true; numeroRendu: number; notes: string[] } | { ok: false; erreur: string };

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
  /** Comme `figer`, mais on attend le résultat et l'essai garde sa consigne et l'essai dont il part (fiche de plan « table de montage »). */
  lancer: (mode: ModeRendu, essai?: EssaiLance) => Promise<ResultatLancement>;
  /** Applique la correction de l'agent et crée l'essai en une transaction (« Itérer », « Appliquer et générer »). */
  lancerIteration: (propositionUuid: string, essai: { consigne: string | null; depuisNumero: number | null }) => Promise<ResultatIteration>;
  /** Les réglages retouchés à la main (durée, FPS, seed), tels que « Itérer » les confie à la suite côté serveur. */
  reglagesRetouches: () => { dureeGenerationSecondes?: number; fps?: number; seed?: string };
  /** Donne la suite d'« Itérer » (réécriture, ou application + essai) et, si l'essai part, joue le même accusé que `lancerIteration`. */
  lancerSuite: (runUuid: string) => Promise<ResultatSuite>;
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

  /** Fige le brouillon puis crée le job ; le balayage « gel » et le sceau suivent. Renvoie le résultat du serveur. */
  const executer = async (mode: ModeRendu, essai: EssaiLance = {}): Promise<ResultatLancement> => {
    setErreur(null);
    const r = await figerEtLancer(
      planId,
      {
        sections: brouillonModifie(),
        ...(dureeModifiee ? { dureeGenerationSecondes: dureeVue } : {}),
        ...(fpsModifie ? { fps: fpsVue } : {}),
        ...(seedModifiee && seedVue ? { seed: seedVue } : {}),
      },
      mode,
      essai,
    );
    nettoyer();
    if (!r.ok) {
      setErreur(r.erreur);
      return r;
    }
    apresLancement(r.numeroRendu);
    return r;
  };

  /** Balayage « gel » sur les panneaux, puis sceau pendant 5 s : le temps que le rendu se place dans la file. */
  const apresLancement = (numeroRendu: number) => {
    for (const id of PANNEAUX_GEL) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.remove("fp-gel");
      void el.offsetWidth;
      el.classList.add("fp-gel");
    }
    setSceau(numeroRendu);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setSceau(null), DUREE_SCEAU_MS);
  };

  /** Fin d'« Itérer » : la correction de l'agent est appliquée ET l'essai créé en une seule transaction côté serveur (`appliquerIterationEtGenerer`).
   * Les réglages retouchés à la main (durée, FPS, seed) partent avec ; les sections, elles, ont été écrites avant l'agent. */
  const lancerIteration = async (propositionUuid: string, essai: { consigne: string | null; depuisNumero: number | null }): Promise<ResultatIteration> => {
    if (pending || sceau != null) return { ok: false, erreur: "Un lancement vient de partir : attends une seconde." };
    setErreur(null);
    const r = await appliquerIterationEtGenerer(planId, propositionUuid, essai, {
      ...(dureeModifiee ? { dureeGenerationSecondes: dureeVue } : {}),
      ...(fpsModifie ? { fps: fpsVue } : {}),
      ...(seedModifiee && seedVue ? { seed: seedVue } : {}),
    });
    if (!r.ok) {
      setErreur(r.erreur);
      return r;
    }
    nettoyer();
    apresLancement(r.numeroRendu);
    return r;
  };

  const reglagesRetouches = () => ({
    ...(dureeModifiee ? { dureeGenerationSecondes: dureeVue } : {}),
    ...(fpsModifie ? { fps: fpsVue } : {}),
    ...(seedModifiee && seedVue ? { seed: seedVue } : {}),
  });

  /** Fin d'« Itérer » côté serveur : le worker ferait la même chose si la page n'était plus là (lib/iteration-suite.ts). */
  const lancerSuite = async (runUuid: string): Promise<ResultatSuite> => {
    setErreur(null);
    const r = await donnerSuiteIteration(runUuid);
    if (!r.ok) {
      setErreur(r.erreur);
      return r;
    }
    if (r.etape === "essai") {
      nettoyer();
      apresLancement(r.numeroRendu);
    }
    return r;
  };

  const figer = (mode: ModeRendu) => {
    if (pending || sceau != null) return;
    startTransition(async () => {
      await executer(mode);
    });
  };

  const lancer = async (mode: ModeRendu, essai?: EssaiLance): Promise<ResultatLancement> => {
    if (pending || sceau != null) return { ok: false, erreur: "Un lancement vient de partir : attends une seconde." };
    return executer(mode, essai);
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
    lancer,
    lancerIteration,
    reglagesRetouches,
    lancerSuite,
    avecSectionsEcrites,
    occupe: pending || sceau != null,
    sceau,
    erreur,
    prochainRendu,
  };

  return <BrouillonCtx.Provider value={valeur}>{children}</BrouillonCtx.Provider>;
}
