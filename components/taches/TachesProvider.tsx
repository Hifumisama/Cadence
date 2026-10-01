"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { annulerTache, marquerToutVu, marquerVu, retirerTaches, viderFile as viderFileServeur, viderListe as viderListeServeur } from "@/app/taches/actions";
import { etatNotifications } from "@/lib/notifications-navigateur";
import type { ResumeTaches, Tache } from "@/lib/taches";

/** Un seul sondage de `/api/taches` pour toute l'application, placé dans le
 * layout racine : il survit aux navigations (le Topbar, lui, se remonte à chaque
 * page). Cadence : 3 s tant qu'une tâche est active ou que le panneau est
 * ouvert, 20 s sinon ; tout de suite au retour de l'onglet. Pas de SSE : pour un
 * seul utilisateur, une latence de 3 s ne se voit pas. */

const INTERVALLE_ACTIF_MS = 3000;
const INTERVALLE_REPOS_MS = 20000;

const RESUME_VIDE: ResumeTaches = { actives: 0, enCours: 0, enFile: 0, echecsNonVus: 0, terminesNonVus: 0 };

type Contexte = {
  taches: Tache[];
  resume: ResumeTaches;
  /** Vrai une fois la première réponse reçue (évite d'agir sur un état vide). */
  pret: boolean;
  panneauOuvert: boolean;
  setPanneauOuvert: (v: boolean) => void;
  rafraichir: () => Promise<void>;
  /** Marque des tâches vues, tout de suite à l'écran puis en base. */
  marquerVuLocal: (cles: string[]) => void;
  marquerToutVuLocal: () => void;
  /** Annule une tâche : en attente, elle devient annulée tout de suite ; en cours,
   * « annulation demandée » s'affiche le temps que le worker interrompe ComfyUI. */
  annuler: (cle: string) => void;
  /** Retire de la file tout ce qui attend (ce qui tourne continue). */
  viderFile: () => void;
  /** Retire des tâches finies de la liste (✕) : masquées, rien n'est supprimé. */
  retirer: (cles: string[]) => void;
  /** Vide une catégorie de la liste : les terminées, ou les échecs et annulations. */
  viderListe: (categorie: "terminees" | "echecs") => void;
};

const Ctx = createContext<Contexte>({
  taches: [],
  resume: RESUME_VIDE,
  pret: false,
  panneauOuvert: false,
  setPanneauOuvert: () => undefined,
  rafraichir: async () => undefined,
  marquerVuLocal: () => undefined,
  marquerToutVuLocal: () => undefined,
  annuler: () => undefined,
  viderFile: () => undefined,
  retirer: () => undefined,
  viderListe: () => undefined,
});

export function useTaches(): Contexte {
  return useContext(Ctx);
}

function recompter(taches: Tache[]): ResumeTaches {
  const actif = (x: Tache) => x.statut === "en_attente" || x.statut === "en_cours";
  return {
    actives: taches.filter(actif).length,
    enCours: taches.filter((x) => x.statut === "en_cours").length,
    enFile: taches.filter((x) => x.statut === "en_attente").length,
    echecsNonVus: taches.filter((x) => x.statut === "echoue" && x.vuAt == null).length,
    terminesNonVus: taches.filter((x) => x.statut === "termine" && x.vuAt == null).length,
  };
}

export function TachesProvider({ children }: { children: ReactNode }) {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [resume, setResume] = useState<ResumeTaches>(RESUME_VIDE);
  const [pret, setPret] = useState(false);
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  const actif = resume.actives > 0;
  const rapide = actif || panneauOuvert;
  const rapideRef = useRef(rapide);
  rapideRef.current = rapide;
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVol = useRef(false);

  const charger = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch("/api/taches", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { taches: Tache[]; resume: ResumeTaches };
        setTaches(data.taches);
        setResume(data.resume);
        setPret(true);
      }
    } catch {
      // serveur de dev qui redémarre, réseau coupé : on réessaie au prochain tour
    } finally {
      enVol.current = false;
    }
  }, []);

  // Une seule boucle : un minuteur qu'on replanifie après chaque tour, selon le
  // rythme du moment (rapide / repos). Onglet caché : on saute le tour.
  const planifier = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      // Onglet caché : on saute le tour, SAUF si les notifications natives sont actives (il
      // faut bien voir la fin d'une tâche pour la signaler ; le navigateur ralentit seul les
      // minuteurs d'un onglet en arrière-plan).
      if (document.visibilityState === "visible" || (rapideRef.current && etatNotifications() === "active")) await charger();
      planifier();
    }, rapideRef.current ? INTERVALLE_ACTIF_MS : INTERVALLE_REPOS_MS);
  }, [charger]);

  useEffect(() => {
    void charger();
    planifier();
    const reveil = () => {
      if (document.visibilityState !== "visible") return;
      void charger();
      planifier();
    };
    document.addEventListener("visibilitychange", reveil);
    window.addEventListener("focus", reveil);
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
      document.removeEventListener("visibilitychange", reveil);
      window.removeEventListener("focus", reveil);
    };
  }, [charger, planifier]);

  // Une tâche arrive ou le panneau s'ouvre : on passe au rythme rapide tout de
  // suite, sans attendre la fin d'un long repos.
  const dernierRapide = useRef(rapide);
  useEffect(() => {
    if (dernierRapide.current === rapide) return;
    dernierRapide.current = rapide;
    if (rapide) {
      void charger();
      planifier();
    }
  }, [rapide, charger, planifier]);

  // Titre de l'onglet : « (n) » devant tant que des tâches sont actives.
  useEffect(() => {
    const prefixe = resume.actives > 0 ? `(${resume.actives}) ` : "";
    const appliquer = () => {
      const base = document.title.replace(/^\(\d+\) /, "");
      const voulu = prefixe + base;
      if (document.title !== voulu) document.title = voulu;
    };
    appliquer();
    // Next réécrit le titre à chaque navigation : on le réapplique.
    const titre = document.querySelector("title");
    if (!titre) return;
    const obs = new MutationObserver(appliquer);
    obs.observe(titre, { childList: true, characterData: true, subtree: true });
    return () => {
      obs.disconnect();
      document.title = document.title.replace(/^\(\d+\) /, "");
    };
  }, [resume.actives]);

  const tachesRef = useRef(taches);
  tachesRef.current = taches;

  const appliquerVu = useCallback((suite: Tache[]) => {
    setTaches(suite);
    setResume(recompter(suite));
  }, []);

  const marquerVuLocal = useCallback(
    (cles: string[]) => {
      const maintenant = new Date().toISOString();
      appliquerVu(tachesRef.current.map((x) => (cles.includes(x.cle) && x.vuAt == null ? { ...x, vuAt: maintenant } : x)));
      void marquerVu(cles).then(charger);
    },
    [appliquerVu, charger],
  );

  const marquerToutVuLocal = useCallback(() => {
    const maintenant = new Date().toISOString();
    appliquerVu(
      tachesRef.current.map((x) => (x.statut !== "en_attente" && x.statut !== "en_cours" && x.vuAt == null ? { ...x, vuAt: maintenant } : x)),
    );
    void marquerToutVu().then(charger);
  }, [appliquerVu, charger]);

  const annuler = useCallback(
    (cle: string) => {
      const maintenant = new Date().toISOString();
      appliquerVu(
        tachesRef.current.map((x) => {
          if (x.cle !== cle) return x;
          // Un lot garde ce qui est déjà terminé : on ne le range pas « annulé » avant la réponse du serveur.
          if (cle.startsWith("lot:")) return { ...x, annulationDemandee: true };
          if (x.statut === "en_attente") return { ...x, statut: "annulee", finishedAt: maintenant, positionFile: null };
          if (x.statut === "en_cours") return { ...x, annulationDemandee: true };
          return x;
        }),
      );
      void annulerTache(cle).then(charger);
    },
    [appliquerVu, charger],
  );

  const viderFile = useCallback(() => {
    const maintenant = new Date().toISOString();
    // Les lots gardent leur état jusqu'à la réponse du serveur (une sous-tâche peut tourner) ;
    // le reste est retiré tout de suite à l'écran.
    appliquerVu(
      tachesRef.current.map((x) =>
        x.statut === "en_attente" && !x.cle.startsWith("lot:") ? { ...x, statut: "annulee", finishedAt: maintenant, positionFile: null } : x,
      ),
    );
    void viderFileServeur().then(charger);
  }, [appliquerVu, charger]);

  const retirer = useCallback(
    (cles: string[]) => {
      const actif = (x: Tache) => x.statut === "en_attente" || x.statut === "en_cours";
      appliquerVu(tachesRef.current.filter((x) => !(cles.includes(x.cle) && !actif(x))));
      void retirerTaches(cles).then(charger);
    },
    [appliquerVu, charger],
  );

  const viderListe = useCallback(
    (categorie: "terminees" | "echecs") => {
      const dans = (x: Tache) => (categorie === "terminees" ? x.statut === "termine" : x.statut === "echoue" || x.statut === "annulee");
      appliquerVu(tachesRef.current.filter((x) => !dans(x)));
      void viderListeServeur(categorie).then(charger);
    },
    [appliquerVu, charger],
  );

  const valeur = useMemo<Contexte>(
    () => ({ taches, resume, pret, panneauOuvert, setPanneauOuvert, rafraichir: charger, marquerVuLocal, marquerToutVuLocal, annuler, viderFile, retirer, viderListe }),
    [taches, resume, pret, panneauOuvert, charger, marquerVuLocal, marquerToutVuLocal, annuler, viderFile, retirer, viderListe],
  );

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}
