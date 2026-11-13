"use client";

import "../scenario/scenario.css";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { deplacerPlan, deplacerScene } from "@/app/scenario/actions";
import { retirerPlan } from "@/app/plans/actions";
import { frappeEnCours } from "@/components/clip/ClipsFilmstrip";
import { Vignette } from "@/components/clip/Thumbnail";
import { GenererFiche } from "@/components/clip/GenerateSheet";
import { useTaches } from "@/components/tasks/TasksProvider";
import { Icone } from "@/components/ui/Icon";
import { posterBackgroundImage } from "@/lib/posters/poster";
import type { DemoDispo } from "@/lib/h3ir/demos";
import { LIBELLE_CREATIVITE, RESUME_STYLE_CAMERA, STYLE_AUCUN, infobulleChoix, creativiteOuNull, styleCameraOuNull, type ReglagesBruts } from "@/lib/h3ir/settings";
import { cleDemande } from "@/lib/tasks/tasks";
import { intentAffichee } from "@/lib/clips/intent";
import { LIBELLE_ETAT, LIBELLE_INTENTION_CHANGEE, cleScene, minutage, romain, type AjoutEnCours, type AjoutSceneEnCours, type PlanVue, type SceneVue } from "@/lib/clips/screenplay-view";
import { MIME_PLAN, MIME_SCENE, PlanDeplacable, demarrerApercu, lire, marquerDepose, useEnGlissement, type ChargePlan } from "./DragDrop";
import { AjouterPlan, type CibleAjoutPlan } from "./AddClip";
import { EtatFiches } from "./SheetsState";
import { ToutesPrevisualisationsButton } from "@/components/clip/AllPreviewsButton";
import { EcrireFiches } from "./WriteSheets";
import { ModifierSceneButton } from "./EditSceneButton";
import { AjouterScene, type CibleAjoutScene } from "./AddScene";
import { SupprimerSceneButton } from "./DeleteSceneButton";

type Vue = "vignettes" | "liste";
const CLE_VUE = "cadence:scenario-vue";
const CLE_DESCRIPTIONS = "cadence:scenario-descriptions";

const pad = (n: number) => String(n).padStart(2, "0");
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
/** Line breaks in a description have no place in a thumbnail excerpt. The displayed intent hides the « Consigne de l'auteur » and
 * the former « État en fin de plan » (lib/clips/intent.ts). */
const aplatir = (t: string) => intentAffichee(t).replace(/\s*\n+\s*/g, " · ");
/** The dot on a row's filmstrip follows the derived state (the same as in the grid), not the sheet's status. */
const NOEUD = { brouillon: "st-brouillon", iteration: "st-encours", pret: "st-termine" } as const;
const libellePlan = (p: PlanVue) => `Plan ${p.position}, ${p.titre}, ${LIBELLE_ETAT[p.etat].toLowerCase()}${p.intentionChangee ? `, ${LIBELLE_INTENTION_CHANGEE[p.intentionChangee].toLowerCase()}` : ""}`;

/** The « texte modifié » marker: the clip's text has changed since its sheet or its last render (never regenerated on its own). */
const RepereIntention = ({ p }: { p: PlanVue }) => (p.intentionChangee ? <span className="sc-intention" title={LIBELLE_INTENTION_CHANGEE[p.intentionChangee]}>Texte modifié</span> : null);

/** Where a clip stands before any render: « Intention seule » (sheet not developed yet) or « Fiche rédigée » (developed, not rendered).
 * Once a render exists, the derived state (iteration / ready) takes over. */
const RepereFiche = ({ p }: { p: PlanVue }) =>
  p.etat === "brouillon" ? (
    <span className="sc-etat" title={p.statut === "brouillon" ? "La fiche du plan n'est pas encore écrite" : "La fiche est écrite, aucun rendu lancé"}>
      {p.statut === "brouillon" ? "Intention seule" : "Fiche rédigée"}
    </span>
  ) : null;

/** The message at the bottom of the screen. With `cle` and `planId`, a « Voir » link leads to this clip (move to another scene). */
type Signal = { texte: string; cle?: string; planId?: number };

/** The Scénario page: a band of scenes (only one open at a time), the header of the open scene, then its clips as thumbnails or as a list.
 * A click selects a clip and shows its description; a double-click or Enter opens its sheet. Everything is client-side: switching scene is
 * instant, and the choice stays in the URL (`?scene=`). */
export function VueScenario({
  projectId,
  episodeId,
  reglagesProjet,
  demos,
  groupes,
  sceneInitiale,
  ajout,
  ajoutScene,
  fiches,
}: {
  projectId: number;
  episodeId: number;
  /** Creativity and staging style of the project (Open H3 IR): what a scene inherits when it sets nothing. */
  reglagesProjet: ReglagesBruts;
  /** The staging demo videos (lib/media.ts, `demosMiseEnScene`), for the scenes' style window. */
  demos?: Record<string, DemoDispo>;
  groupes: SceneVue[];
  sceneInitiale: string | null;
  /** A clip being written (« Ajouter un plan »), or null. */
  ajout: AjoutEnCours | null;
  /** A scene being written (« Nouvelle scène »), or null. Only one addition at a time per film: clip or scene. */
  ajoutScene: AjoutSceneEnCours | null;
  /** The state of the film's clip sheets (« Écrire les fiches » opens a popup). */
  fiches: { nbPlans: number; nbDeveloppes: number };
}) {
  const router = useRouter();
  const { taches, pret: tachesPretes } = useTaches();
  const [cle, setCle] = useState<string>(() => (sceneInitiale && groupes.some((g) => cleScene(g.id) === sceneInitiale) ? sceneInitiale : cleScene(groupes[0]?.id ?? null)));
  const [planSel, setPlanSel] = useState<number | null>(null);
  const aDesImages = groupes.some((g) => g.plans.some((p) => p.src));
  const [vue, setVue] = useState<Vue>(aDesImages ? "vignettes" : "liste");
  const [descriptions, setDescriptions] = useState(false);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [cibleScene, setCibleScene] = useState<CibleAjoutScene | null>(null);
  const [cibleAjout, setCibleAjout] = useState<CibleAjoutPlan | null>(null);
  /** The « Ajouter un plan » tool is active: « + » buttons appear between the clips, and we click the one where the clip should be born. */
  const [modeAjout, setModeAjout] = useState(false);
  /** The « Écrire les fiches » popup is open. */
  const [fichesOuvert, setFichesOuvert] = useState(false);
  const [, startTransition] = useTransition();
  const dernierRefresh = useRef(0);
  const rail = useRef<HTMLDivElement>(null);
  const focusRail = useRef(false);

  // Remembered settings (read after mounting: no hydration mismatch).
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CLE_VUE);
      if (v === "vignettes" || v === "liste") setVue(v);
      setDescriptions(window.localStorage.getItem(CLE_DESCRIPTIONS) === "1");
    } catch {
      // storage unavailable: default settings
    }
  }, []);
  const changerVue = (v: Vue) => {
    setVue(v);
    try {
      window.localStorage.setItem(CLE_VUE, v);
    } catch {
      // ignored
    }
  };
  const basculerDescriptions = () => {
    setDescriptions((d) => {
      try {
        window.localStorage.setItem(CLE_DESCRIPTIONS, d ? "0" : "1");
      } catch {
        // ignored
      }
      return !d;
    });
  };

  const courant = groupes.find((g) => cleScene(g.id) === cle) ?? groupes[0];
  const cleCourante = courant ? cleScene(courant.id) : null;
  const indexCourant = courant ? groupes.indexOf(courant) : -1;
  const plan = courant?.plans.find((p) => p.id === planSel) ?? null;
  const idTabulation = plan?.id ?? courant?.plans[0]?.id ?? null;

  const choisirScene = (k: string) => {
    setCle(k);
    setPlanSel(null);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}?scene=${k}`);
    } catch {
      // the URL is only a convenience
    }
  };

  /** « III · La Fuite », ou « Sans scène ». */
  const libelleScene = (g: SceneVue) => (g.id != null ? `${romain(groupes.indexOf(g) + 1)} · ${g.titre}` : g.titre);
  /** A clip has just changed scene: it disappears from this one, and we say where it went (and lead there with one click). */
  const signaler = (planId: number, cible: SceneVue) => setSignal({ texte: `Plan déplacé vers ${libelleScene(cible)}`, cle: cleScene(cible.id), planId });
  useEffect(() => {
    if (!signal) return;
    const t = setTimeout(() => setSignal(null), 7000);
    return () => clearTimeout(t);
  }, [signal]);

  // A clip being written: the page keeps its ghost card as long as the task is active. When the queue no longer has it (finished, failed,
  // cancelled), we reload the page: the clip is there, or the card disappears. Same principle as the tracking of renders on the clip sheet.
  const enEcriture = ajout ?? ajoutScene;
  useEffect(() => {
    if (!enEcriture || !tachesPretes) return;
    const active = taches.some((t) => t.cle === cleDemande(enEcriture.id) && (t.statut === "en_attente" || t.statut === "en_cours"));
    if (active || Date.now() - dernierRefresh.current < 3000) return;
    dernierRefresh.current = Date.now();
    router.refresh();
  }, [enEcriture, taches, tachesPretes, router]);

  // The open scene re-centers in the band; focus follows it when navigating the band by keyboard.
  useEffect(() => {
    const onglet = rail.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    onglet?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    if (focusRail.current) {
      focusRail.current = false;
      onglet?.focus();
    }
  }, [cleCourante]);

  // The selected clip stays visible when changed with the arrows, and focus follows it (Enter always opens the selected clip).
  useEffect(() => {
    if (planSel == null) return;
    const el = document.querySelector<HTMLElement>(`[data-plan="${planSel}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    const actif = document.activeElement;
    if (actif instanceof HTMLElement && actif !== el && actif.matches("[data-plan]")) el.focus({ preventScroll: true });
  }, [planSel]);

  // ← → (and ↑ ↓ in list) move from one clip to another; Escape deselects.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (!courant || frappeEnCours(e)) return;
      if ((e.target as HTMLElement | null)?.closest?.('[role="tab"]')) return;
      if (e.key === "Escape") {
        if (modeAjout) setModeAjout(false);
        else if (planSel != null) setPlanSel(null);
        return;
      }
      if (courant.plans.length === 0) return;
      const i = courant.plans.findIndex((p) => p.id === planSel);
      const suivant = e.key === "ArrowRight" || (vue === "liste" && i !== -1 && e.key === "ArrowDown");
      const precedent = e.key === "ArrowLeft" || (vue === "liste" && i !== -1 && e.key === "ArrowUp");
      if (!suivant && !precedent) return;
      e.preventDefault();
      const k = i === -1 ? 0 : Math.min(courant.plans.length - 1, Math.max(0, i + (suivant ? 1 : -1)));
      setPlanSel(courant.plans[k]!.id);
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [courant, planSel, vue, modeAjout]);

  if (!courant) {
    return (
      <div className="sc">
        <div className="queue">
          <button className="btn btn-gold" type="button" disabled={ajoutScene != null} onClick={() => setCibleScene({ place: { debut: true }, apres: "Au début du film" })}>
            <Icone nom="ajouter" taille={15} /> {ajoutScene ? "Scène en cours d'écriture…" : "Nouvelle scène"}
          </button>
        </div>
        <AjouterScene projectId={projectId} episodeId={episodeId} cible={cibleScene} onFermer={() => setCibleScene(null)} onLance={() => setSignal({ texte: "Scène en cours d'écriture : suivi dans la file des tâches." })} />
        <p className="tiny-note" style={{ marginTop: "var(--sp-6)" }}>
          Ce film n&rsquo;a encore aucune scène. Un projet créé depuis « Nouveau projet » arrive avec son scénario : si celui-ci est vide, la première scène peut s&rsquo;écrire d&rsquo;ici.
        </p>
      </div>
    );
  }

  const scenesReelles = groupes.filter((g) => g.id != null);
  const nbPlans = groupes.reduce((acc, g) => acc + g.plans.length, 0);
  const dureeTotale = groupes.reduce((acc, g) => acc + g.duree, 0);
  const creativiteScene = creativiteOuNull(courant.creativite);
  const styleScene = styleCameraOuNull(courant.styleCamera);
  const estSans = courant.id == null;
  // Starting timing of each scene in the film (sum of the durations of the scenes before it).
  const debuts = groupes.map((_, i) => groupes.slice(0, i).reduce((acc, g) => acc + g.duree, 0));
  const precedente = groupes[indexCourant - 1];
  const suivante = groupes[indexCourant + 1];

  // « Nouvelle scène »: a « + » in each gap of the band, the large card at the end of the film strip. Only one addition at a time per film (clip or scene).
  const dernierReel = scenesReelles[scenesReelles.length - 1] ?? null;
  const occupe = ajout != null || ajoutScene != null;
  const fenteScene = (place: CibleAjoutScene["place"], apres: string) => (
    <button
      key={"debut" in place ? "fente-debut" : `fente-${place.apresSceneId}`}
      type="button"
      className="sc-fente-scene"
      disabled={occupe}
      aria-label={`Nouvelle scène : ${apres.toLowerCase()}`}
      title={occupe ? "Un ajout est déjà en cours d'écriture" : `Nouvelle scène · ${apres}`}
      onClick={() => setCibleScene({ place, apres })}
    >
      <Icone nom="ajouter" taille={14} />
    </button>
  );
  const carteSceneFantome = (
    <div className="sc-carte is-fantome" role="status" aria-label="Scène en cours d'écriture" key="scene-fantome">
      <span className="sc-fantome-pouls" aria-hidden="true" />
      <span className="sc-carte-bas">
        <span className="sc-carte-titre">Scène en cours d&rsquo;écriture…</span>
        <span className="sc-carte-meta">{ajoutScene?.consigne || "Proposition de l'agent"}</span>
      </span>
    </div>
  );

  const ouvrir = (p: PlanVue) => router.push(p.href);

  // « Ajouter un plan » is a TOOL: the button makes « + » buttons appear between the clips, we click the one where the clip should be born, and the popup opens
  // on that place. An empty scene has only one possible place: the button opens the popup directly. `i` = the clip BEFORE which we insert (i = number of
  // clips: at the end). At the start of a scene, the place is « after the last clip of the scenes before it » (or at the start of the film).
  const choisirPlace = (i: number) => {
    const avant = i > 0 ? courant.plans[i - 1] : groupes.slice(0, indexCourant).reverse().flatMap((g) => g.plans.slice(-1))[0];
    setCibleAjout({
      insertion: avant ? { apresPlanUuid: avant.uuid } : { debut: true },
      sceneId: courant.id,
      scene: libelleScene(courant),
      apres: avant ? `Après le plan ${pad(avant.position)} · ${avant.titre}` : "Au début du film",
    });
    setModeAjout(false);
  };
  const basculerAjout = () => {
    if (courant.plans.length === 0) choisirPlace(0);
    else setModeAjout((m) => !m);
  };

  // The clip being written keeps its place in the scene: a ghost card, at the spot where it will be added (-1: not in this scene).
  const ancre = ajout && "apresPlanUuid" in ajout.position ? ajout.position.apresPlanUuid : null;
  const fantome = ajout && ajout.sceneId === courant.id ? (ancre ? courant.plans.findIndex((p) => p.uuid === ancre) + 1 : 0) : -1;
  const carteFantome = (
    <div className="sc-cadre is-fantome" role="status" aria-label="Plan en cours d'écriture">
      <span className="tm-cadre-img sc-img">
        <span className="sc-fantome-pouls" aria-hidden="true" />
        <span className="sc-extrait">{ajout?.consigne}</span>
      </span>
      <span className="sc-cadre-nom">Écriture du plan…</span>
      <span className="sc-cadre-temps">suivi dans la file des tâches</span>
    </div>
  );
  const ligneFantome = (
    <div className="sc-ligne-fantome" role="status">
      <span className="sc-fantome-pouls" aria-hidden="true" />
      <span>Écriture du plan…</span>
      <span className="sc-ligne-fantome-note">{ajout?.consigne}</span>
    </div>
  );
  /** A « + » between two thumbnails (on the left edge of thumbnail i, or to the right of the last one). */
  const fenteCadre = (i: number, cote: "gauche" | "droite") => (
    <button key={`${cote}-${i}`} type="button" className={`sc-fente is-${cote}`} aria-label={i < courant.plans.length ? `Insérer un plan avant le plan ${pad(courant.plans[i]!.position)}` : "Insérer un plan à la fin de la scène"} onClick={() => choisirPlace(i)}>
      <Icone nom="ajouter" taille={16} />
    </button>
  );
  /** A « + » between two rows of the list. */
  const fenteLigne = (i: number) => (
    <button key={`fente-${i}`} type="button" className="sc-fente-ligne" aria-label={i < courant.plans.length ? `Insérer un plan avant le plan ${pad(courant.plans[i]!.position)}` : "Insérer un plan à la fin de la scène"} onClick={() => choisirPlace(i)}>
      <Icone nom="ajouter" taille={15} /> Insérer ici
    </button>
  );
  const surClavierPlan = (p: PlanVue) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      ouvrir(p);
    } else if (e.key === " ") {
      e.preventDefault();
      setPlanSel(p.id);
    }
  };

  const surClavierRail = (e: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    const cible = e.key === "ArrowRight" ? groupes[i + 1] : e.key === "ArrowLeft" ? groupes[i - 1] : e.key === "Home" ? groupes[0] : e.key === "End" ? groupes[groupes.length - 1] : undefined;
    if (!cible) return;
    e.preventDefault();
    focusRail.current = true;
    choisirScene(cleScene(cible.id));
  };

  // Go to the adjacent scene from the bottom of the page: we scroll back up to the band.
  // Dropping a clip in an empty area of the open scene: it goes last.
  const deposerEnFin = (e: React.DragEvent) => {
    const c = lire<ChargePlan>(e, MIME_PLAN);
    if (!c) return;
    e.preventDefault();
    marquerDepose(`plan:${c.planId}`);
    startTransition(() => deplacerPlan(c.planId, courant.id, null));
  };

  return (
    <div className="sc">
      <div className="queue sc-outils">
        <EtatFiches nbPlans={fiches.nbPlans} nbDeveloppes={fiches.nbDeveloppes} onEcrire={() => setFichesOuvert(true)} />
        {fiches.nbDeveloppes > 0 ? <ToutesPrevisualisationsButton episodeId={episodeId} /> : null}
        <span className="sc-total num">
          {pluriel(scenesReelles.length, "scène")} · {pluriel(nbPlans, "plan")} · {minutage(dureeTotale)}
        </span>
      </div>

      <nav className="sc-rail-zone" aria-label="Scènes">
        <button type="button" className="tm-reel-nav" aria-label="Scène précédente" disabled={!precedente} onClick={() => precedente && choisirScene(cleScene(precedente.id))}>
          ‹
        </button>
        <div className="sc-rail" ref={rail}>
          <div className="sc-rail-liste" role="tablist" aria-label="Scènes du film">
            {ajoutScene && "debut" in ajoutScene.place ? carteSceneFantome : null}
            {groupes.length > 0 && groupes[0]!.id != null ? fenteScene({ debut: true }, "Au début du film") : null}
            {groupes.map((g, i) => (
              <Fragment key={cleScene(g.id)}>
                <CarteScene
                  g={g}
                  numero={g.id != null ? romain(i + 1) : null}
                  debut={debuts[i] ?? 0}
                  actif={cleScene(g.id) === cleCourante}
                  suivantId={groupes[i + 1]?.id ?? null}
                  onChoisir={() => choisirScene(cleScene(g.id))}
                  onKeyDown={(e) => surClavierRail(e, i)}
                  onRecu={(planId) => signaler(planId, g)}
                />
                {ajoutScene && g.id != null && "apresSceneId" in ajoutScene.place && ajoutScene.place.apresSceneId === g.id ? carteSceneFantome : null}
                {/* Between two scenes: a « + ». After the last one, the large « Nouvelle scène » card (below) takes over. */}
                {g.id != null && i < scenesReelles.length - 1 ? fenteScene({ apresSceneId: g.id }, `Après ${libelleScene(g)}`) : null}
              </Fragment>
            ))}
          </div>
          <button
            type="button"
            className="sc-carte-plus"
            disabled={occupe}
            title={occupe ? "Un ajout est déjà en cours d'écriture" : "Ajouter une scène à la fin du film"}
            onClick={() => setCibleScene(dernierReel ? { place: { apresSceneId: dernierReel.id! }, apres: `Après ${libelleScene(dernierReel)}` } : { place: { debut: true }, apres: "Au début du film" })}
          >
            <Icone nom="ajouter" taille={22} />
            <span>Nouvelle scène</span>
          </button>
        </div>
        <button type="button" className="tm-reel-nav" aria-label="Scène suivante" disabled={!suivante} onClick={() => suivante && choisirScene(cleScene(suivante.id))}>
          ›
        </button>
      </nav>

      <div id="sc-panneau" role="tabpanel" aria-label={`Scène : ${courant.titre}`} className="sc-panneau">
        <section className="sc-entete">
          <div className="sc-entete-titre">
            {!estSans ? <span className="sc-roman">{romain(indexCourant + 1)}</span> : null}
            <h2>{courant.titre}</h2>
            <span className="sc-entete-meta num">
              {pluriel(courant.plans.length, "plan")} · {minutage(courant.duree)}
            </span>
            {courant.id != null ? (
              <span className="sc-entete-actions">
                <ModifierSceneButton
                  key={courant.id}
                  sceneId={courant.id}
                  titre={courant.titre}
                  fonction={courant.fonction ?? ""}
                  ambiance={courant.ambiance ?? ""}
                  creativite={courant.creativite ?? ""}
                  styleCamera={courant.styleCamera ?? ""}
                  reglagesProjet={reglagesProjet}
                  demos={demos}
                />
                <SupprimerSceneButton sceneId={courant.id} titre={courant.titre} />
              </span>
            ) : null}
          </div>
          {estSans ? (
            <p className="sc-fonction">Les plans qui ne sont dans aucune scène. Dépose un plan ici pour le détacher de sa scène.</p>
          ) : courant.fonction ? (
            <p className="sc-fonction">{courant.fonction}</p>
          ) : null}
          {courant.ambiance || creativiteScene || styleScene ? (
            <ul className="sc-chips">
              {creativiteScene ? (
                <li className="sc-chip" title="Créativité propre à cette scène (Open H3 IR) ; sinon elle hérite du projet">
                  <span>Créativité</span>
                  <b>{LIBELLE_CREATIVITE[creativiteScene]}</b>
                </li>
              ) : null}
              {styleScene ? (
                <li className="sc-chip" title="Style de mise en scène propre à cette scène (Open H3 IR) ; sinon elle hérite du projet">
                  <span>Mise en scène</span>
                  <b title={styleScene === STYLE_AUCUN ? undefined : infobulleChoix(styleScene)}>{styleScene === STYLE_AUCUN ? "Aucun style" : RESUME_STYLE_CAMERA[styleScene]}</b>
                </li>
              ) : null}
              {courant.ambiance ? (
                <li className="sc-chip is-ambiance">
                  <span>Ambiance</span>
                  <b>{courant.ambiance}</b>
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>

        <div className="queue sc-plans-barre">
          <button
            type="button"
            className={`btn btn-sm ${modeAjout ? "btn-gold" : "btn-ghost"}`}
            aria-pressed={modeAjout}
            disabled={occupe}
            title={occupe ? "Un ajout est déjà en cours d'écriture" : undefined}
            onClick={basculerAjout}
          >
            <Icone nom={modeAjout ? "fermer" : "ajouter"} taille={15} /> {modeAjout ? "Choisis la place du plan" : "Ajouter un plan"}
          </button>
          <div className="sc-reglages">
            {vue === "liste" ? (
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={descriptions} onClick={basculerDescriptions}>
                {descriptions ? "Masquer les descriptions" : "Afficher les descriptions"}
              </button>
            ) : null}
            <div className="sc-bascule" role="group" aria-label="Affichage des plans">
              <button type="button" aria-pressed={vue === "vignettes"} onClick={() => changerVue("vignettes")} title="Vignettes">
                <Icone nom="grille" taille={16} /> <span>Vignettes</span>
              </button>
              <button type="button" aria-pressed={vue === "liste"} onClick={() => changerVue("liste")} title="Liste">
                <Icone nom="liste" taille={16} /> <span>Liste</span>
              </button>
            </div>
          </div>
        </div>

        <div
          key={`${cleCourante}-${vue}`}
          className="sc-plans"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(MIME_PLAN)) e.preventDefault();
          }}
          onDrop={deposerEnFin}
        >
          {courant.plans.length === 0 && fantome < 0 ? (
            <div className="sc-vide">
              <p>{estSans ? "Aucun plan sans scène." : "Aucun plan dans cette scène : l'agent peut en écrire un, ou tu peux en glisser un depuis une autre scène sur sa carte."}</p>
              {!estSans ? (
                <button type="button" className="btn btn-gold" onClick={() => choisirPlace(0)} disabled={occupe} title={occupe ? "Un ajout est déjà en cours d'écriture" : undefined}>
                  <Icone nom="ajouter" taille={15} /> Ajouter un plan
                </button>
              ) : null}
            </div>
          ) : vue === "vignettes" ? (
            <div className={`sc-grille${modeAjout ? " is-ajout" : ""}`} role="group" aria-label="Plans de la scène">
              {courant.plans.map((p, i) => (
                <Fragment key={p.id}>
                  {fantome === i ? <div className="sc-case">{carteFantome}</div> : null}
                  <div className="sc-case">
                  {modeAjout ? fenteCadre(i, "gauche") : null}
                  {modeAjout && i === courant.plans.length - 1 ? fenteCadre(i + 1, "droite") : null}
                <PlanDeplacable
                  planId={p.id}
                  sceneId={courant.id}
                  suivantId={courant.plans[i + 1]?.id ?? null}
                  axe="x"
                  className={`sc-cadre etat-${p.etat}`}
                  libelle={libellePlan(p)}
                  selectionne={p.id === planSel}
                  tabIndex={p.id === idTabulation ? 0 : -1}
                  onClick={() => setPlanSel(p.id)}
                  onDoubleClick={() => ouvrir(p)}
                  onKeyDown={surClavierPlan(p)}
                >
                  <span className={`tm-cadre-img sc-img${!p.src && p.description ? " is-texte" : ""}`}>
                    <Vignette src={p.src} />
                    {!p.src ? <span className={`sc-extrait${p.description ? "" : " is-vide"}`}>{p.description ? aplatir(p.description) : "Sans description"}</span> : null}
                    <span className="sc-pos num">{pad(p.position)}</span>
                    <span className={`tm-cadre-etat is-${p.etat}`} aria-hidden="true">
                      {p.etat === "pret" ? "✓" : ""}
                    </span>
                  </span>
                  <span className="sc-cadre-nom">{p.titre}</span>
                  <span className="sc-cadre-temps num">
                    {minutage(p.debut)} · {p.duree} s
                  </span>
                  <RepereFiche p={p} />
                  <RepereIntention p={p} />
                </PlanDeplacable>
                  </div>
                </Fragment>
              ))}
              {fantome === courant.plans.length ? <div className="sc-case">{carteFantome}</div> : null}
            </div>
          ) : (
            <div className="frise sc-liste" role="group" aria-label="Plans de la scène">
              {courant.plans.map((p, i) => (
                <div key={p.id} className="sc-ligne">
                  {modeAjout ? fenteLigne(i) : null}
                  {fantome === i ? ligneFantome : null}
                  <PlanDeplacable
                    planId={p.id}
                    sceneId={courant.id}
                    suivantId={courant.plans[i + 1]?.id ?? null}
                    axe="y"
                    className={`shot ${NOEUD[p.etat]}`}
                    libelle={libellePlan(p)}
                    selectionne={p.id === planSel}
                    tabIndex={p.id === idTabulation ? 0 : -1}
                    onClick={() => setPlanSel(p.id)}
                    onDoubleClick={() => ouvrir(p)}
                    onKeyDown={surClavierPlan(p)}
                  >
                    <span className="node" />
                    <span className="shot-no">{pad(p.position)}</span>
                    <span className="shot-title">
                      {p.titre}
                      {descriptions && p.description && p.id !== planSel ? <span className="shot-desc">{aplatir(p.description)}</span> : null}
                    </span>
                    <span className="shot-right">
                      <span className="shot-duree num" title="Minutage de départ dans le film">
                        {minutage(p.debut)}
                      </span>
                      <span className="shot-duree num" title="Durée de montage">
                        {p.duree} s
                      </span>
                      <RepereIntention p={p} />
                      <RepereFiche p={p} />
                      {p.etat !== "brouillon" ? <span className={`sc-etat is-${p.etat}`}>{p.etat === "pret" ? "✓ Prêt" : "En itération"}</span> : null}
                    </span>
                  </PlanDeplacable>
                </div>
              ))}
              {modeAjout ? fenteLigne(courant.plans.length) : null}
              {fantome === courant.plans.length ? ligneFantome : null}
            </div>
          )}
        </div>
      </div>

      <AjouterScene projectId={projectId} episodeId={episodeId} cible={cibleScene} onFermer={() => setCibleScene(null)} onLance={() => setSignal({ texte: "Scène en cours d'écriture : suivi dans la file des tâches." })} />

      {plan ? <TiroirPlan key={plan.id} projectId={projectId} plan={plan} onFermer={() => setPlanSel(null)} onOuvrir={() => ouvrir(plan)} /> : null}

      <EcrireFiches
        projectId={projectId}
        groupes={groupes}
        ouvert={fichesOuvert}
        onFermer={() => setFichesOuvert(false)}
        onLance={(n) => setSignal({ texte: `${n > 1 ? `${n} fiches en cours d'écriture` : "Fiche en cours d'écriture"} : suivi dans la file des tâches.` })}
      />

      <AjouterPlan
        projectId={projectId}
        episodeId={episodeId}
        cible={cibleAjout}
        onFermer={() => setCibleAjout(null)}
        onLance={() => setSignal({ texte: "Plan en cours d'écriture : suivi dans la file des tâches." })}
      />

      {signal ? (
        <div className="sc-toast" role="status">
          <span>{signal.texte}</span>
          {signal.cle != null && signal.planId != null ? (
            <button
              type="button"
              onClick={() => {
                choisirScene(signal.cle!);
                setPlanSel(signal.planId!);
                setSignal(null);
              }}
            >
              Voir
            </button>
          ) : null}
          <button type="button" className="sc-toast-fermer" aria-label="Fermer" onClick={() => setSignal(null)}>
            <Icone nom="fermer" taille={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The drawer of the selected clip, on the right: its full description, writing or opening its sheet, its deletion. It blocks nothing: the grid stays clickable, another clip takes its place, Escape closes it. Moving to another scene
 * is done by dragging the clip onto the scene's card. */
function TiroirPlan({
  projectId,
  plan,
  onFermer,
  onOuvrir,
}: {
  projectId: number;
  plan: PlanVue;
  onFermer: () => void;
  onOuvrir: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  /** A clip is born as a draft; it has no sheet (video prompt) until the agent writes it. */
  const sansFiche = plan.statut === "brouillon";
  const supprimer = (force: boolean) => {
    const question = force
      ? `Forcer la suppression du plan ${pad(plan.position)} ? Ses références d'assets seront détachées (les assets eux-mêmes restent dans le registre). Irréversible.`
      : `Supprimer définitivement le plan ${pad(plan.position)} · ${plan.titre} ?`;
    if (!window.confirm(question)) return;
    setErreur(null);
    startTransition(async () => {
      const r = await retirerPlan(plan.id, force);
      if (!r.ok) setErreur(r.erreur);
      else onFermer();
    });
  };

  return (
    <aside className="sc-tiroir-plan" aria-label={`Plan ${pad(plan.position)} : ${plan.titre}`}>
      <div className="sc-tiroir-hd">
        <span className="sc-tiroir-etiquette">Plan {pad(plan.position)}</span>
        <button type="button" className="sc-tiroir-fermer" aria-label="Fermer le tiroir" onClick={onFermer}>
          <Icone nom="fermer" taille={16} />
        </button>
      </div>
      <h3>{plan.titre}</h3>
      <span className="sc-detail-meta num">
        {minutage(plan.debut)} · {plan.duree} s · {LIBELLE_ETAT[plan.etat]}
      </span>
      <RepereIntention p={plan} />
      {plan.src ? <video className="sc-tiroir-video" src={`${plan.src}#t=0.1`} controls loop muted playsInline preload="metadata" aria-label={`Aperçu du plan ${pad(plan.position)}`} /> : null}
      <p className={`sc-description${intentAffichee(plan.description) ? "" : " is-vide"}`}>{intentAffichee(plan.description) || "Pas encore de description."}</p>
      <div className="sc-actions">
        {sansFiche ? <GenererFiche projectId={projectId} planUuid={plan.uuid} demandeEnCours={plan.ficheEnCours} /> : null}
        <button type="button" className={`btn ${sansFiche ? "btn-ghost" : "btn-gold"} btn-sm`} onClick={onOuvrir}>
          {sansFiche ? "Ouvrir le plan →" : "Ouvrir la fiche →"}
        </button>
      </div>
      <div className="sc-tiroir-pied">
        <button type="button" className="btn btn-danger btn-icone" onClick={() => supprimer(false)} disabled={pending} title="Supprimer le plan" aria-label={`Supprimer le plan ${pad(plan.position)}`}>
          <Icone nom="supprimer" taille={16} />
        </button>
      </div>
      {erreur ? (
        <p className="tiny-note sc-tiroir-erreur" role="alert">
          {erreur}{" "}
          <button type="button" className="btn btn-danger btn-sm" onClick={() => supprimer(true)} disabled={pending}>
            Forcer
          </button>
        </p>
      ) : null}
    </aside>
  );
}

/** A scene in the band: opens on click, moves by drag and drop (the cards reorder among themselves), and receives the clips dropped on it. */
function CarteScene({
  g,
  numero,
  debut,
  actif,
  suivantId,
  onChoisir,
  onKeyDown,
  onRecu,
}: {
  g: SceneVue;
  numero: string | null;
  /** Starting timing of the scene in the film. */
  debut: number;
  actif: boolean;
  suivantId: number | null;
  onChoisir: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** A clip has just been dropped on this card. */
  onRecu: (planId: number) => void;
}) {
  const [repere, setRepere] = useState<"g" | "d" | null>(null);
  const [recoitPlan, setRecoitPlan] = useState(false);
  const [recu, setRecu] = useState(false);
  const [, startTransition] = useTransition();
  const { enDrag, debut: debutDrag, fin } = useEnGlissement();
  const reinit = () => {
    setRepere(null);
    setRecoitPlan(false);
  };
  const cote = (e: React.DragEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? "g" : "d";
  };

  return (
    <div
      role="tab"
      aria-selected={actif}
      aria-controls="sc-panneau"
      tabIndex={actif ? 0 : -1}
      className={`sc-carte${actif ? " is-on" : ""}${g.id == null ? " is-sans" : ""}${recoitPlan ? " is-drop" : ""}${recu ? " is-recu" : ""}${repere ? ` drop-${repere}` : ""}${enDrag ? " is-drag" : ""}`}
      onClick={onChoisir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChoisir();
        } else onKeyDown(e);
      }}
      draggable={g.id != null}
      onDragStart={(e) => {
        if (g.id == null) return;
        e.dataTransfer.setData(MIME_SCENE, JSON.stringify({ sceneId: g.id }));
        e.dataTransfer.effectAllowed = "move";
        demarrerApercu(e, e.currentTarget);
        debutDrag();
      }}
      onDragEnd={fin}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(MIME_SCENE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setRepere(g.id == null ? "g" : cote(e));
        } else if (e.dataTransfer.types.includes(MIME_PLAN)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setRecoitPlan(true);
        }
      }}
      onDragLeave={reinit}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes(MIME_SCENE)) {
          e.preventDefault();
          const c = lire<{ sceneId: number }>(e, MIME_SCENE);
          const avant = g.id == null ? null : cote(e) === "g" ? g.id : suivantId;
          reinit();
          if (!c || c.sceneId === g.id || c.sceneId === avant) return;
          marquerDepose(`scene:${c.sceneId}`);
          startTransition(() => deplacerScene(c.sceneId, avant));
        } else if (e.dataTransfer.types.includes(MIME_PLAN)) {
          e.preventDefault();
          const c = lire<ChargePlan>(e, MIME_PLAN);
          reinit();
          if (!c || c.sceneId === g.id) return;
          setRecu(true);
          setTimeout(() => setRecu(false), 1400);
          onRecu(c.planId);
          startTransition(() => deplacerPlan(c.planId, g.id, null));
        }
      }}
    >
      {/* Never a clip image on a scene card: it would be confused with the thumbnails of the clips just below. A gradient specific to the scene, nothing more. */}
      <span className="sc-carte-fond" style={{ backgroundImage: posterBackgroundImage(`scene:${cleScene(g.id)}`) }} aria-hidden="true" />
      <span className="sc-carte-voile" aria-hidden="true" />
      {numero ? <span className="sc-carte-n">{numero}</span> : null}
      <span className="sc-carte-bas">
        <span className="sc-carte-titre">{g.titre}</span>
        <span className="sc-carte-meta num">
          {minutage(debut)} · {pluriel(g.plans.length, "plan")}
        </span>
      </span>
    </div>
  );
}
