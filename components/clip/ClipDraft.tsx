"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { appliquerIterationEtGenerer, ecrireSections, figerEtLancer } from "@/app/plans/actions";

/** The clip sheet panels that receive the « gel » sweep when a render starts. */
const PANNEAUX_GEL = ["fp-refs", "fp-prompt"];
const DUREE_SCEAU_MS = 5000;

type Serveur = { sections: Record<string, string>; duree: number; fps: number; seed: string | null };
export type ModeRendu = "previsualiser" | "final" | "variante";
export type EssaiLance = { consigne?: string | null; depuisNumero?: number | null };
export type ResultatLancement = { ok: true; numeroRendu: number } | { ok: false; erreur: string };
/** `notes`: what the agent or the checks reported when applying the correction (kept on the created attempt). */
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
  /** Resolution of the next render (0,2 / 0,3 / 0,4 MP: lib/renders/resolution-video.ts). */
  seed: string | null;
  setDuree: (v: number) => void;
  setFps: (v: number) => void;
  setSeed: (v: string) => void;
  /** Labels of what differs from the frozen clip (« 2 sections », « durée »…); empty = everything is frozen. */
  modifications: string[];
  annuler: () => void;
  /** Discards the draft without writing anything (after a prompt paste, which replaces everything server-side). */
  abandonner: () => void;
  figer: (mode: ModeRendu) => void;
  /** Like `figer`, but we wait for the result and the attempt keeps its directive and the attempt it starts from (clip sheet « table de montage »). */
  lancer: (mode: ModeRendu, essai?: EssaiLance) => Promise<ResultatLancement>;
  /** Applies the agent's correction and creates the attempt in one transaction (« Itérer », « Appliquer et générer »). */
  lancerIteration: (propositionUuid: string, essai: { consigne: string | null; depuisNumero: number | null }) => Promise<ResultatIteration>;
  /** The settings tweaked by hand (duration, FPS, seed), that « Itérer » hands to its request (written with the attempt). */
  reglagesRetouches: () => { dureeGenerationSecondes?: number; fps?: number; seed?: string };
  /** The attempt of a request has just started (render created): same acknowledgement as a launch (« gel » sweep, seal, draft handed back to the server). */
  accuserLancement: (numeroRendu: number) => void;
  /** Writes the modified sections, runs `fn`, then reloads the server content: for the actions that rewrite the
   * prompt server-side (add / remove a reference) and would overwrite a draft. */
  avecSectionsEcrites: <T,>(fn: () => Promise<T>) => Promise<T>;
  occupe: boolean;
  /** Number of the render that has just been frozen, as long as the seal is displayed. */
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

/** The clip sheet's draft (user feedback 2026-10-05: no more autosave). We write nothing until we launch a
 * render: launching FREEZES the prompt and all the settings at once. Each value is derived: the draft if we touched it and it
 * differs from the server, the server otherwise — a page reload (render tracking) therefore never loses an entry. */
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

  /** Freezes the draft then creates the job; the « gel » sweep and the seal follow. Returns the server result. */
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

  /** « Gel » sweep on the panels, then seal for 5 s: the time for the render to take its place in the queue. */
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

  /** End of « Itérer »: the agent's correction is applied AND the attempt created in a single server-side transaction (`appliquerIterationEtGenerer`).
   * The settings tweaked by hand (duration, FPS, seed) go along; the sections, for their part, were written before the agent. */
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

  const accuserLancement = (numeroRendu: number) => {
    nettoyer();
    apresLancement(numeroRendu);
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
    accuserLancement,
    avecSectionsEcrites,
    occupe: pending || sceau != null,
    sceau,
    erreur,
    prochainRendu,
  };

  return <BrouillonCtx.Provider value={valeur}>{children}</BrouillonCtx.Provider>;
}
