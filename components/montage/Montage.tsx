"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PE, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ajouterAuMontage,
  choisirRenduEntree,
  dupliquerEntree,
  exporterEpisode,
  recalerMontage,
  reordonnerMontage,
  retirerEntree,
  rognerEntree,
} from "@/app/montage/actions";
import { deplacerPlan } from "@/app/scenario/actions";
import {
  construireClips,
  deplacer,
  differeDuScenario,
  DUREE_MIN_CLIP,
  entreesDecalees,
  familleStatut,
  formatTemps,
  indexA,
  indexInsertion,
  inserer,
  pad2,
  plansHorsMontage,
  recaler,
  type EntreeMontage,
  type FamilleStatut,
  type PlanMontage,
  type SceneMontage,
} from "@/lib/montage/montage";
import type { ExportMontage } from "@/lib/montage/queries-montage";
import { useLecture } from "./usePlayback";
import { TableMontage, teinte, type ModeTable } from "./TableMontage";
import { Inspecteur } from "./Inspector";
import { Manuel } from "./Manual";

const FAMILLES: { cle: FamilleStatut; libelle: string; couleur: string }[] = [
  { cle: "termine", libelle: "Terminé", couleur: "var(--or)" },
  { cle: "encours", libelle: "En cours", couleur: "var(--or-glow)" },
  { cle: "echoue", libelle: "Échoué", couleur: "var(--ecarlate-glow)" },
  { cle: "attente", libelle: "En attente", couleur: "var(--ink-4)" },
];

type Resultat = { ok: true } | { ok: false; erreur: string };

/** The Montage page (docs/PLAN_MONTAGE.md, mockup docs/maquettes/montage.html): continuous player of the retained renders, inspector of the
 * selected clip, edit table (two orders), « Hors montage » strip, shortcuts manual. Each gesture updates the local state right away
 * (optimistic) then calls its action; revalidation returns the database state, which replaces the local state. */
export function Montage(props: {
  episodeId: number;
  base: string;
  eyebrow: string;
  plans: PlanMontage[];
  scenes: SceneMontage[];
  entrees: EntreeMontage[];
  dernierExport: ExportMontage | null;
  outils: ReactNode;
}) {
  const router = useRouter();
  const { episodeId } = props;

  // Local state, re-synced to the database on each revalidation (new props).
  const [source, setSource] = useState({ plans: props.plans, entrees: props.entrees });
  const [plans, setPlans] = useState(props.plans);
  const [entrees, setEntrees] = useState(props.entrees);
  if (source.plans !== props.plans || source.entrees !== props.entrees) {
    setSource({ plans: props.plans, entrees: props.entrees });
    setPlans(props.plans);
    setEntrees(props.entrees);
  }

  const [selId, setSelId] = useState<number | null>(null);
  const [mode, setModeEtat] = useState<ModeTable>("mt");
  const [pps, setPpsEtat] = useState(44);
  const [aimant, setAimant] = useState(true);
  const [cinema, setCinema] = useState(false);
  const [inactif, setInactif] = useState(false);
  const [manuel, setManuel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [depot, setDepot] = useState<number | null>(null);
  const [fantome, setFantome] = useState<{ x: number; y: number; texte: string } | null>(null);
  const [binSurvol, setBinSurvol] = useState(false);
  const [tableSurvol, setTableSurvol] = useState(false);
  const [exportEnvoi, setExportEnvoi] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const binRef = useRef<HTMLElement>(null);
  const lecteurRef = useRef<HTMLDivElement>(null);
  const vraiPleinEcran = useRef(false);

  const clips = useMemo(() => construireClips(entrees, plans), [entrees, plans]);
  const ordreScenario = useMemo(() => plans.map((p) => p.id), [plans]);
  const hors = useMemo(() => plansHorsMontage(plans, entrees), [plans, entrees]);
  const decalees = useMemo(() => entreesDecalees(entrees, ordreScenario), [entrees, ordreScenario]);
  const differe = useMemo(() => differeDuScenario(entrees, ordreScenario), [entrees, ordreScenario]);
  const { copies, nbEntreesParPlan } = useMemo(() => {
    const vus = new Map<number, number>();
    const c = new Set<number>();
    for (const e of entrees) {
      if (vus.has(e.planId)) c.add(e.id);
      vus.set(e.planId, (vus.get(e.planId) ?? 0) + 1);
    }
    return { copies: c, nbEntreesParPlan: vus };
  }, [entrees]);

  const L = useLecture(clips);
  const selTrouve = clips.findIndex((c) => c.entree.id === selId);
  const sel = selTrouve >= 0 ? selTrouve : Math.max(0, L.indexCourant);
  const clipSel = clips[sel] ?? null;

  const montrer = useCallback((m: string) => setToast(m), []);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(h);
  }, [toast]);

  /** Records a gesture; on refusal, the message is shown and the page takes back the database state. */
  const enregistrer = useCallback(
    async (p: Promise<Resultat>, succes?: string) => {
      try {
        const r = await p;
        if (!r.ok) {
          montrer(r.erreur);
          router.refresh();
        } else if (succes) montrer(succes);
      } catch {
        montrer("Enregistrement impossible : la page a été rechargée.");
        router.refresh();
      }
    },
    [montrer, router],
  );
  const enAttente = (ids: number[]) => {
    if (ids.some((id) => id < 0)) {
      montrer("Un instant : le montage s’enregistre.");
      return true;
    }
    return false;
  };

  // --- Selection and playback ---
  const selectionner = useCallback((k: number, chercher = false) => {
    const c = clips[Math.min(Math.max(0, k), clips.length - 1)];
    if (!c) return;
    setSelId(c.entree.id);
    if (chercher) L.allerA(L.starts[clips.indexOf(c)]!);
  }, [clips, L]);
  /** Positioning (ruler, J/L): the selection follows the playhead. */
  const allerA = useCallback(
    (t: number) => {
      L.allerA(t);
      const k = clips.length ? indexA(Math.min(Math.max(0, t), L.total), L.starts) : -1;
      if (k >= 0) setSelId(clips[k]!.entree.id);
    },
    [L, clips],
  );

  // --- Gestures on the edit ---
  const deplacerClip = (k: number, vers: number) => {
    const nouv = deplacer(entrees, k, vers);
    if (enAttente(nouv.map((e) => e.id))) return;
    setEntrees(nouv);
    setSelId(entrees[k]!.id);
    void enregistrer(reordonnerMontage(episodeId, nouv.map((e) => e.id)), `Plan déplacé en position ${pad2(vers + 1)}. Les positions se recalculent, les plans gardent leur identité.`);
  };

  const rogner = (k: number, debut: number, fin: number, fini: boolean) => {
    const c = clips[k];
    if (!c?.rendu) return;
    const finStockee = fin >= c.rendu.dureeSecondes - 1e-3 ? null : fin;
    setEntrees((es) => es.map((e) => (e.id === c.entree.id ? { ...e, debut, fin: finStockee } : e)));
    if (fini && !enAttente([c.entree.id])) void enregistrer(rognerEntree(c.entree.id, debut, finStockee));
  };

  const remettreEntier = () => {
    const c = clipSel;
    if (!c?.rendu || enAttente([c.entree.id])) return;
    setEntrees((es) => es.map((e) => (e.id === c.entree.id ? { ...e, debut: 0, fin: null } : e)));
    void enregistrer(rognerEntree(c.entree.id, 0, null));
  };

  const choisirRendu = (renduId: number) => {
    const c = clipSel;
    if (!c || enAttente([c.entree.id])) return;
    const r = c.plan.rendus.find((x) => x.id === renduId);
    setEntrees((es) => es.map((e) => (e.id === c.entree.id ? { ...e, renduRetenuId: renduId } : e)));
    void enregistrer(choisirRenduEntree(c.entree.id, renduId), `Rendu n°${r?.numeroRendu ?? "?"} retenu pour ce plan du montage : à la lecture et à l’export, c’est celui-ci.`);
  };

  const dupliquer = () => {
    if (mode === "sc") return montrer("Repassez en « Montage final » pour modifier le montage.");
    const c = clipSel;
    if (!c || enAttente([c.entree.id])) return;
    const temp = -Date.now();
    setEntrees((es) => inserer(es, { ...c.entree, id: temp }, sel + 1));
    setSelId(temp);
    void (async () => {
      const r = await dupliquerEntree(c.entree.id);
      if (r.ok) {
        setSelId(r.id);
        montrer("Plan dupliqué : même plan, même rendu, avec son propre rognage. Rien n’est copié sur disque. Vous pouvez retenir un autre rendu sur la copie.");
      } else await enregistrer(Promise.resolve(r));
    })();
  };

  const retirer = (k = sel) => {
    if (mode === "sc") return montrer("Repassez en « Montage final » pour modifier le montage.");
    const c = clips[k];
    if (!c || enAttente([c.entree.id])) return;
    if (entrees.length <= 1) return montrer("Gardez au moins un plan dans le montage.");
    const reste = entrees.some((e) => e.planId === c.plan.id && e.id !== c.entree.id);
    L.jouer(false);
    setEntrees((es) => es.filter((e) => e.id !== c.entree.id));
    const voisin = clips[k + 1] ?? clips[k - 1];
    setSelId(voisin?.entree.id ?? null);
    void enregistrer(
      retirerEntree(c.entree.id),
      reste ? "Copie retirée du montage." : `« ${c.plan.titre} » retiré du montage. Le plan et ses rendus sont conservés dans « Hors montage ».`,
    );
  };

  const ajouter = (p: PlanMontage, index: number) => {
    const temp = -Date.now();
    setEntrees((es) => inserer(es, { id: temp, planId: p.id, renduRetenuId: null, debut: 0, fin: null }, index));
    setSelId(temp);
    void (async () => {
      const r = await ajouterAuMontage(episodeId, p.id, index);
      if (r.ok) {
        setSelId(r.id);
        montrer(`« ${p.titre} » ajouté au montage en position ${pad2(index + 1)}.`);
      } else await enregistrer(Promise.resolve(r));
    })();
  };

  const recalerSurScenario = () => {
    const nouv = recaler(entrees, ordreScenario);
    if (enAttente(nouv.map((e) => e.id))) return;
    setEntrees(nouv);
    void enregistrer(recalerMontage(episodeId), "Montage recalé sur l’ordre des scènes. Les rognages et les rendus retenus sont conservés.");
  };

  const deplacerScenario = (k: number, vers: number) => {
    const p = plans[k]!;
    const nouv = deplacer(plans, k, vers);
    const voisin = nouv[vers - 1] ?? nouv[vers + 1];
    const sceneId = voisin ? voisin.sceneId : p.sceneId;
    const apres = nouv[vers + 1] ?? null;
    setPlans(nouv.map((x) => (x.id === p.id ? { ...x, sceneId } : x)).map((x, i) => ({ ...x, position: i + 1 })));
    const sc = sceneId != null ? props.scenes.findIndex((s) => s.id === sceneId) + 1 : 0;
    void enregistrer(
      deplacerPlan(p.id, sceneId, apres?.id ?? null).then(() => ({ ok: true as const })),
      `Ordre des scènes mis à jour : « ${p.titre} » est maintenant ${sc ? `en scène ${sc}` : "sans scène"}. Le montage final n’est pas modifié.`,
    );
  };

  // --- Trimming by keyboard (I / O) ---
  const poserBord = (bord: "i" | "o") => {
    const k = L.indexCourant;
    const c = clips[k];
    if (!c) return;
    if (!c.rendu) return montrer("Ce plan n’a pas de rendu à rogner.");
    const local = L.t - L.starts[k]! + c.debut;
    setSelId(c.entree.id);
    if (bord === "i") rogner(k, Math.min(local, c.fin - DUREE_MIN_CLIP), c.fin, true);
    else rogner(k, c.debut, Math.max(local, c.debut + DUREE_MIN_CLIP), true);
  };

  // --- Display mode, zoom ---
  const setMode = (m: ModeTable) => {
    L.jouer(false);
    setModeEtat(m);
  };
  const setPps = (n: number) => setPpsEtat(Math.min(120, Math.max(16, n)));

  // --- Cinema mode: full screen (Fullscreen API), fallback to full frame if the browser refuses ---
  const basculerCinema = useCallback((on: boolean) => {
    setCinema(on);
    const el = lecteurRef.current;
    if (on && el?.requestFullscreen) {
      el.requestFullscreen()
        .then(() => (vraiPleinEcran.current = true))
        .catch(() => (vraiPleinEcran.current = false));
    } else if (!on && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    const fin = () => {
      if (!document.fullscreenElement && vraiPleinEcran.current) {
        vraiPleinEcran.current = false;
        setCinema(false);
      }
    };
    document.addEventListener("fullscreenchange", fin);
    return () => document.removeEventListener("fullscreenchange", fin);
  }, []);
  useEffect(() => {
    if (!cinema) {
      setInactif(false);
      return;
    }
    document.body.style.overflow = "hidden";
    let h = setTimeout(() => setInactif(true), 2500);
    const reveil = () => {
      setInactif(false);
      clearTimeout(h);
      h = setTimeout(() => setInactif(true), 2500);
    };
    document.addEventListener("mousemove", reveil);
    return () => {
      document.body.style.overflow = "";
      clearTimeout(h);
      document.removeEventListener("mousemove", reveil);
    };
  }, [cinema]);

  // --- Keyboard ---
  const clavier = useRef<(e: KeyboardEvent) => void>(() => undefined);
  clavier.current = (e: KeyboardEvent) => {
    const cible = e.target instanceof Element ? e.target : null;
    if (cible?.closest("input, textarea, select, [contenteditable='true']") || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const pas = e.shiftKey ? 5 : 1;
    let pris = true;
    if (k === " ") {
      if (cible?.closest("button, a, summary")) return;
      L.jouer(!L.lecture);
    } else if (k === "k" || k === "K") L.jouer(false);
    else if (k === "j" || k === "J") allerA(L.t - pas);
    else if (k === "l" || k === "L") allerA(L.t + pas);
    else if (k === "ArrowLeft") selectionner(sel - 1, true);
    else if (k === "ArrowRight") selectionner(sel + 1, true);
    else if (k === "Home") allerA(0);
    else if (k === "i" || k === "I") poserBord("i");
    else if (k === "o" || k === "O") poserBord("o");
    else if (k === "r" || k === "R") remettreEntier();
    else if (k === "s" || k === "S") setAimant((v) => !v);
    else if (k === "+" || k === "=") setPps(pps + 8);
    else if (k === "-") setPps(pps - 8);
    else if (k === "?") setManuel((v) => !v);
    else if (k === "f" || k === "F") basculerCinema(!cinema);
    else if (k === "m" || k === "M") setMode(mode === "mt" ? "sc" : "mt");
    else if (k === "Escape" && cinema) basculerCinema(false);
    else if (k === "d" || k === "D") dupliquer();
    else if (k === "Delete" || k === "Backspace") retirer();
    else pris = false;
    if (pris) e.preventDefault();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => clavier.current(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // --- « Hors montage » → table: drag a clip to add it ---
  const surBin = (e: PE<HTMLDivElement>, p: PlanMontage) => {
    if (e.button !== 0 || mode !== "mt") return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let bouge = false;
    let cible: number | null = null;
    const mv = (ev: PointerEvent) => {
      if (!bouge && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!bouge) {
        bouge = true;
        L.jouer(false);
      }
      setFantome({ x: ev.clientX, y: ev.clientY, texte: p.titre });
      const sc = scrollerRef.current;
      if (!sc) return;
      const r = sc.getBoundingClientRect();
      const dessus = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      setTableSurvol(dessus);
      if (dessus) {
        const seconde = (ev.clientX - r.left + sc.scrollLeft) / pps;
        cible = indexInsertion(L.durees, seconde);
        setDepot((L.starts[cible] ?? L.total) * pps);
      } else {
        cible = null;
        setDepot(null);
      }
    };
    const up = () => {
      document.removeEventListener("pointermove", mv);
      document.removeEventListener("pointerup", up);
      setFantome(null);
      setTableSurvol(false);
      setDepot(null);
      if (bouge && cible != null) ajouter(p, cible);
    };
    document.addEventListener("pointermove", mv);
    document.addEventListener("pointerup", up);
  };

  // --- Export ---
  const exp = props.dernierExport;
  const exportActif = exp?.statut === "en_attente" || exp?.statut === "en_cours";
  useEffect(() => {
    if (!exportActif) return;
    const h = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(h);
  }, [exportActif, router]);
  const exporter = async () => {
    setExportEnvoi(true);
    try {
      const r = await exporterEpisode(episodeId);
      if (!r.ok) montrer(r.erreur);
      else
        montrer(
          `Export de l’épisode : ${r.nbSegments} rendu${r.nbSegments > 1 ? "s" : ""} retenu${r.nbSegments > 1 ? "s" : ""} mis bout à bout, ${formatTemps(r.dureeSecondes)}${
            r.nbIgnores ? `. ${r.nbIgnores} plan${r.nbIgnores > 1 ? "s" : ""} ignoré${r.nbIgnores > 1 ? "s" : ""} (sans rendu ou en échec).` : "."
          }`,
        );
    } finally {
      setExportEnvoi(false);
    }
  };

  // --- Header: total duration and statuses ---
  const sansRendu = clips.filter((c) => c.prevu).length;
  const comptes = new Map<FamilleStatut, number>();
  for (const c of clips) comptes.set(familleStatut(c.plan.statut), (comptes.get(familleStatut(c.plan.statut)) ?? 0) + 1);
  const nPerimes = clips.filter((c) => c.plan.perime).length;

  const courant = L.courant;
  const progression = L.total ? (L.t / L.total) * 100 : 0;

  return (
    <div className="mt">
      <header className="mt-hd">
        <div className="mt-hd-titre">
          <p className="eyebrow">{props.eyebrow}</p>
          <h1>Montage</h1>
        </div>
        <div className="mt-hd-meta">
          <div className="mt-total" title="Somme des durées retenues (rognages appliqués). Les plans sans rendu comptent pour leur durée prévue.">
            <b className="num">{formatTemps(L.total)}</b>
            <span>
              {clips.length} plan{clips.length > 1 ? "s" : ""}
              {sansRendu ? ` · ${sansRendu} sans rendu (durée prévue)` : ""}
            </span>
          </div>
          {FAMILLES.filter((f) => comptes.get(f.cle)).map((f) => (
            <span key={f.cle} className="mt-pill" style={{ "--c": f.couleur } as CSSProperties}>
              <i />
              <b className="num">{comptes.get(f.cle)}</b> {f.libelle}
            </span>
          ))}
          {nPerimes ? (
            <span className="mt-pill" style={{ "--c": "var(--or-glow)" } as CSSProperties}>
              <i />
              <b className="num">{nPerimes}</b> périmé{nPerimes > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        <div className="mt-outils">
          {props.outils}
          <button type="button" className="btn btn-gold" onClick={exporter} disabled={exportEnvoi || exportActif || clips.length === 0}>
            {exportActif ? "Export en cours…" : "Exporter l’épisode"}
          </button>
        </div>
      </header>
      {exp ? (
        <p className="mt-export" role="status">
          {exp.statut === "termine" && exp.src ? (
            <>
              Dernier export prêt : {exp.nbSegments} plan{exp.nbSegments > 1 ? "s" : ""}
              {exp.dureeSecondes != null ? `, ${formatTemps(exp.dureeSecondes)}` : ""}
              {exp.nbIgnores ? ` (${exp.nbIgnores} ignoré${exp.nbIgnores > 1 ? "s" : ""})` : ""}.{" "}
              <a href={exp.src} target="_blank" rel="noreferrer">
                Regarder
              </a>{" "}
              ·{" "}
              <a href={exp.src} download={`${props.eyebrow.replace(/[\\/:*?"<>|]+/g, "-")}.mp4`}>
                Télécharger
              </a>
            </>
          ) : exp.statut === "echoue" ? (
            <span className="is-err">Le dernier export a échoué : {exp.erreur ?? "erreur inconnue"}</span>
          ) : (
            <>Export {exp.statut === "en_cours" ? "en cours d’encodage" : "en file : le worker le prend dès qu’il est libre"} ({exp.nbSegments} plans)…</>
          )}
        </p>
      ) : null}

      <section className="mt-stage">
        <div ref={lecteurRef} className={`mt-lecteur${cinema ? " is-cinema" : ""}${cinema && inactif ? " is-inactif" : ""}`}>
          <div className="mt-ecran" aria-label="Lecteur de l’épisode" onClick={() => L.jouer(!L.lecture)}>
            {[L.videoA, L.videoB].map((ref, i) => (
              <video
                key={i}
                ref={ref}
                className={L.courantLisible ? (L.actif === i ? "is-visible" : "is-dessous") : undefined}
                playsInline
                preload="auto"
                onError={(e) => L.signalerIllisible(e.currentTarget)}
              />
            ))}
            {!courant ? (
              <div className="mt-carton">
                <b>Épisode vide</b>
                <span>Aucun plan dans le montage.</span>
              </div>
            ) : L.courantIllisible ? (
              <div className="mt-carton is-err">
                <b>Rendu illisible</b>
                <span>Le fichier de ce rendu ne se lit pas (supprimé du disque ?). La lecture continue.</span>
              </div>
            ) : !courant.rendu ? (
              <div className="mt-carton">
                <b>Pas encore de rendu</b>
                <span>Durée prévue {courant.plan.dureePrevue.toFixed(1)} s</span>
              </div>
            ) : null}
            {courant ? (
              <div className="mt-hud">
                <span className="mt-hud-t">{courant.plan.titre}</span>
                <span className="mt-hud-p num">
                  Plan {pad2(L.indexCourant + 1)}
                  {courant.rendu ? ` · rendu n°${courant.rendu.numeroRendu}` : ""} · {(L.t - L.starts[L.indexCourant]! + courant.debut).toFixed(1)} s
                </span>
              </div>
            ) : null}
          </div>
          <div className="mt-ctrl">
            <div
              className="mt-prog"
              aria-label="Progression de l’épisode"
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const mv = (x: number) => allerA((Math.min(1, Math.max(0, (x - r.left) / r.width))) * L.total);
                mv(e.clientX);
                const m = (ev: PointerEvent) => mv(ev.clientX);
                const up = () => {
                  document.removeEventListener("pointermove", m);
                  document.removeEventListener("pointerup", up);
                };
                document.addEventListener("pointermove", m);
                document.addEventListener("pointerup", up);
              }}
            >
              <div style={{ width: `${progression}%` }} />
            </div>
            <div className="mt-transport">
              <button type="button" className="btn btn-ghost" title="Plan précédent (←)" aria-label="Plan précédent" onClick={() => selectionner(sel - 1, true)}>
                ⏮
              </button>
              <button type="button" className="btn btn-ghost" title="Lecture / pause (Espace)" aria-label={L.lecture ? "Pause" : "Lecture"} onClick={() => L.jouer(!L.lecture)}>
                {L.lecture ? "⏸" : "▶"}
              </button>
              <button type="button" className="btn btn-ghost" title="Plan suivant (→)" aria-label="Plan suivant" onClick={() => selectionner(sel + 1, true)}>
                ⏭
              </button>
              <span className="mt-timecode num">
                {formatTemps(L.t)} <small>/ {formatTemps(L.total)}</small>
              </span>
              <span className="mt-sp" />
              <button type="button" className="btn btn-ghost" title="Mode cinéma (F)" onClick={() => basculerCinema(!cinema)}>
                {cinema ? (
                  <>
                    Quitter <kbd>Échap</kbd>
                  </>
                ) : (
                  <>
                    Cinéma <kbd>F</kbd>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        <Inspecteur
          clip={clipSel}
          index={sel}
          nb={clips.length}
          base={props.base}
          choisirRendu={choisirRendu}
          remettreEntier={remettreEntier}
          dupliquer={dupliquer}
          retirer={() => retirer()}
        />
      </section>

      <div className={tableSurvol ? "mt-survol" : undefined}>
        <TableMontage
          mode={mode}
          setMode={setMode}
          clips={clips}
          starts={L.starts}
          durees={L.durees}
          total={L.total}
          plans={plans}
          scenes={props.scenes}
          decalees={decalees}
          copies={copies}
          nbEntreesParPlan={nbEntreesParPlan}
          differe={differe}
          pps={pps}
          setPps={setPps}
          aimant={aimant}
          setAimant={setAimant}
          t={L.t}
          lecture={L.lecture}
          sel={sel}
          live={L.indexCourant}
          depot={depot}
          setDepot={setDepot}
          scrollerRef={scrollerRef}
          binRef={binRef}
          setBinSurvol={setBinSurvol}
          setFantome={setFantome}
          pause={() => L.jouer(false)}
          selectionner={(k) => selectionner(k)}
          allerA={allerA}
          deplacer={deplacerClip}
          retirer={retirer}
          rogner={rogner}
          deplacerScenario={deplacerScenario}
          recaler={recalerSurScenario}
        />
      </div>

      {mode === "mt" ? (
        <section ref={binRef} className={`mt-bin${binSurvol ? " is-survol" : ""}`} aria-label="Plans hors montage">
          <h2>
            Hors montage <span className="num">{hors.length}</span>
          </h2>
          <p>
            Glissez un plan sur la table pour l’ajouter au montage, ou un clip de la table jusqu’ici pour le retirer. Ces plans existent toujours
            avec tous leurs rendus ; ils n’apparaissent ni dans le lecteur ni à l’export.
          </p>
          {hors.length === 0 ? (
            <p>Aucun plan hors montage pour l’instant. Déposez ici un clip de la table : son rendu n’est jamais supprimé.</p>
          ) : (
            <div className="mt-bin-list">
              {hors.map((p) => (
                <div key={p.uuid} className="mt-bin-item" style={{ "--h": teinte(p.uuid) } as CSSProperties} onPointerDown={(e) => surBin(e, p)}>
                  <i />
                  <span className="mt-bin-tx">
                    <b>{p.titre}</b>
                    <small className="num">
                      sc. {pad2(p.position)} · {p.dureePrevue.toFixed(1)} s
                      {p.rendus.length ? ` · ${p.rendus.length} rendu${p.rendus.length > 1 ? "s" : ""}` : " · pas de rendu"}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <Manuel ouvert={manuel} basculer={setManuel} />

      {fantome ? (
        <div className="mt-fantome" style={{ left: fantome.x + 12, top: fantome.y + 12 }}>
          {fantome.texte}
        </div>
      ) : null}
      <div className={`mt-toast${toast ? " is-on" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}
