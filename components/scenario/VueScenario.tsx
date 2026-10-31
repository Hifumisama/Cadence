"use client";

import "./scenario.css";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { deplacerPlan, deplacerScene } from "@/app/scenario/actions";
import { useAgents, type DemandeAgent } from "@/components/agents/AgentsProvider";
import { frappeEnCours } from "@/components/plan/PelliculePlans";
import { Vignette } from "@/components/plan/Vignette";
import { GenererFiche } from "@/components/plan/GenererFiche";
import { useTaches } from "@/components/taches/TachesProvider";
import { Icone } from "@/components/ui/Icone";
import { posterBackgroundImage } from "@/lib/poster";
import { LIBELLE_GENRE, genreOuNull } from "@/lib/scene-genres";
import { cleDemande } from "@/lib/taches";
import { LIBELLE_ETAT, cleScene, minutage, romain, type AjoutEnCours, type AjoutSceneEnCours, type PlanVue, type SceneVue } from "@/lib/scenario-vue";
import { MIME_PLAN, MIME_SCENE, PlanDeplacable, demarrerApercu, lire, marquerDepose, useEnGlissement, type ChargePlan } from "./GlisserDeposer";
import { AjouterPlan, type CibleAjoutPlan } from "./AjouterPlan";
import { EtatFiches } from "./EtatFiches";
import { ModifierSceneButton } from "./ModifierSceneButton";
import { AjouterScene, type CibleAjoutScene } from "./AjouterScene";
import { SupprimerSceneButton } from "./SupprimerSceneButton";

type Vue = "vignettes" | "liste";
const CLE_VUE = "cadence:scenario-vue";
const CLE_DESCRIPTIONS = "cadence:scenario-descriptions";

const pad = (n: number) => String(n).padStart(2, "0");
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
/** Les retours à la ligne d'une description n'ont pas de place dans un extrait de vignette. */
const aplatir = (t: string) => t.replace(/\s*\n+\s*/g, " · ");
/** Le point de la frise d'une ligne suit l'état dérivé (le même que dans la grille), pas le statut de la fiche. */
const NOEUD = { brouillon: "st-brouillon", iteration: "st-encours", pret: "st-termine" } as const;
const libellePlan = (p: PlanVue) => `Plan ${p.position}, ${p.titre}, ${LIBELLE_ETAT[p.etat].toLowerCase()}`;

/** Le message au bas de l'écran. Avec `cle` et `planId`, un lien « Voir » mène à ce plan (déplacement vers une autre scène). */
type Signal = { texte: string; cle?: string; planId?: number };

/** La page Scénario : un bandeau de scènes (une seule ouverte à la fois), l'en-tête de la scène ouverte, puis ses plans en vignettes ou en liste.
 * Un clic sélectionne un plan et en montre la description ; un double-clic ou Entrée ouvre sa fiche. Tout est côté client : changer de scène est
 * instantané, et le choix reste dans l'URL (`?scene=`). */
export function VueScenario({
  projectId,
  episodeId,
  groupes,
  sceneInitiale,
  ajout,
  ajoutScene,
  fiches,
}: {
  projectId: number;
  episodeId: number;
  groupes: SceneVue[];
  sceneInitiale: string | null;
  /** Un plan en cours d'écriture (« Ajouter un plan »), ou null. */
  ajout: AjoutEnCours | null;
  /** Une scène en cours d'écriture (« Nouvelle scène »), ou null. Un seul ajout à la fois par film : plan ou scène. */
  ajoutScene: AjoutSceneEnCours | null;
  /** L'état des fiches de plan du film et la demande « Écrire les fiches ». */
  fiches: { nbPlans: number; nbDeveloppes: number; demande: DemandeAgent };
}) {
  const router = useRouter();
  const { ouvrirAgent } = useAgents();
  const { taches, pret: tachesPretes } = useTaches();
  const [cle, setCle] = useState<string>(() => (sceneInitiale && groupes.some((g) => cleScene(g.id) === sceneInitiale) ? sceneInitiale : cleScene(groupes[0]?.id ?? null)));
  const [planSel, setPlanSel] = useState<number | null>(null);
  const aDesImages = groupes.some((g) => g.plans.some((p) => p.src));
  const [vue, setVue] = useState<Vue>(aDesImages ? "vignettes" : "liste");
  const [descriptions, setDescriptions] = useState(false);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [cibleScene, setCibleScene] = useState<CibleAjoutScene | null>(null);
  const [cibleAjout, setCibleAjout] = useState<CibleAjoutPlan | null>(null);
  /** L'outil « Ajouter un plan » est actif : des « + » s'affichent entre les plans, on clique celui où le plan doit naître. */
  const [modeAjout, setModeAjout] = useState(false);
  const [, startTransition] = useTransition();
  const dernierRefresh = useRef(0);
  const rail = useRef<HTMLDivElement>(null);
  const focusRail = useRef(false);

  // Réglages mémorisés (lus après le montage : pas d'écart d'hydratation).
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CLE_VUE);
      if (v === "vignettes" || v === "liste") setVue(v);
      setDescriptions(window.localStorage.getItem(CLE_DESCRIPTIONS) === "1");
    } catch {
      // stockage indisponible : réglages par défaut
    }
  }, []);
  const changerVue = (v: Vue) => {
    setVue(v);
    try {
      window.localStorage.setItem(CLE_VUE, v);
    } catch {
      // ignoré
    }
  };
  const basculerDescriptions = () => {
    setDescriptions((d) => {
      try {
        window.localStorage.setItem(CLE_DESCRIPTIONS, d ? "0" : "1");
      } catch {
        // ignoré
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
      // l'URL n'est qu'un confort
    }
  };

  /** « III · La Fuite », ou « Sans scène ». */
  const libelleScene = (g: SceneVue) => (g.id != null ? `${romain(groupes.indexOf(g) + 1)} · ${g.titre}` : g.titre);
  /** Un plan vient de changer de scène : il disparaît de celle-ci, on dit où il est parti (et on y mène d'un clic). */
  const signaler = (planId: number, cible: SceneVue) => setSignal({ texte: `Plan déplacé vers ${libelleScene(cible)}`, cle: cleScene(cible.id), planId });
  useEffect(() => {
    if (!signal) return;
    const t = setTimeout(() => setSignal(null), 7000);
    return () => clearTimeout(t);
  }, [signal]);

  // Un plan en cours d'écriture : la page garde sa carte fantôme tant que la tâche est active. Quand la file ne l'a plus (finie, échouée,
  // annulée), on recharge la page : le plan est là, ou la carte disparaît. Même principe que le suivi des rendus de la fiche de plan.
  const enEcriture = ajout ?? ajoutScene;
  useEffect(() => {
    if (!enEcriture || !tachesPretes) return;
    const active = taches.some((t) => t.cle === cleDemande(enEcriture.id) && (t.statut === "en_attente" || t.statut === "en_cours"));
    if (active || Date.now() - dernierRefresh.current < 3000) return;
    dernierRefresh.current = Date.now();
    router.refresh();
  }, [enEcriture, taches, tachesPretes, router]);

  // La scène ouverte se recentre dans le bandeau ; le focus la suit quand on navigue au clavier dans le bandeau.
  useEffect(() => {
    const onglet = rail.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    onglet?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    if (focusRail.current) {
      focusRail.current = false;
      onglet?.focus();
    }
  }, [cleCourante]);

  // Le plan sélectionné reste visible quand on le change aux flèches, et le focus le suit (Entrée ouvre toujours le plan sélectionné).
  useEffect(() => {
    if (planSel == null) return;
    const el = document.querySelector<HTMLElement>(`[data-plan="${planSel}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    const actif = document.activeElement;
    if (actif instanceof HTMLElement && actif !== el && actif.matches("[data-plan]")) el.focus({ preventScroll: true });
  }, [planSel]);

  // ← → (et ↑ ↓ en liste) passent d'un plan à l'autre ; Échap désélectionne.
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
          <button className="btn btn-gold" type="button" onClick={() => ouvrirAgent({ projectId, portee: "episode", cible: { id: episodeId }, profondeur: "courte", libelle: "Scénario", episodeId })}>
            Écrire le scénario
          </button>
          <button className="btn btn-ghost" type="button" disabled={ajoutScene != null} onClick={() => setCibleScene({ place: { debut: true }, apres: "Au début du film" })}>
            <Icone nom="ajouter" taille={15} /> {ajoutScene ? "Scène en cours d'écriture…" : "Nouvelle scène"}
          </button>
        </div>
        <AjouterScene projectId={projectId} episodeId={episodeId} cible={cibleScene} onFermer={() => setCibleScene(null)} onLance={() => setSignal({ texte: "Scène en cours d'écriture : suivi dans la file des tâches." })} />
        <p className="tiny-note" style={{ marginTop: "var(--sp-6)" }}>
          Aucun plan en base. L&rsquo;agent peut écrire le scénario, ou lancer <code>npm run db:import</code> pour importer l&rsquo;épisode 1 depuis le markdown existant.
        </p>
      </div>
    );
  }

  const scenesReelles = groupes.filter((g) => g.id != null);
  const nbPlans = groupes.reduce((acc, g) => acc + g.plans.length, 0);
  const dureeTotale = groupes.reduce((acc, g) => acc + g.duree, 0);
  const genre = genreOuNull(courant.genre);
  const estSans = courant.id == null;
  // Minutage de départ de chaque scène dans le film (somme des durées des scènes qui précèdent).
  const debuts = groupes.map((_, i) => groupes.slice(0, i).reduce((acc, g) => acc + g.duree, 0));
  const precedente = groupes[indexCourant - 1];
  const suivante = groupes[indexCourant + 1];

  // « Nouvelle scène » : un « + » dans chaque intervalle du bandeau, la grande carte en fin de pellicule. Un seul ajout à la fois par film (plan ou scène).
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

  // « Ajouter un plan » est un OUTIL : le bouton fait apparaître des « + » entre les plans, on clique celui où le plan doit naître, et la popup s'ouvre
  // sur cette place. Une scène vide n'a qu'une place possible : le bouton ouvre la popup directement. `i` = le plan AVANT lequel on insère (i = nombre de
  // plans : à la fin). Au début d'une scène, la place est « après le dernier plan des scènes qui la précèdent » (ou au début du film).
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

  // Le plan en cours d'écriture garde sa place dans la scène : une carte fantôme, à l'endroit où il sera ajouté (-1 : pas dans cette scène).
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
  /** Un « + » entre deux vignettes (sur le bord gauche de la vignette i, ou à droite de la dernière). */
  const fenteCadre = (i: number, cote: "gauche" | "droite") => (
    <button key={`${cote}-${i}`} type="button" className={`sc-fente is-${cote}`} aria-label={i < courant.plans.length ? `Insérer un plan avant le plan ${pad(courant.plans[i]!.position)}` : "Insérer un plan à la fin de la scène"} onClick={() => choisirPlace(i)}>
      <Icone nom="ajouter" taille={16} />
    </button>
  );
  /** Un « + » entre deux lignes de la liste. */
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

  // Aller à la scène d'à côté depuis le bas de la page : on remonte au bandeau.
  // Déposer un plan dans un espace vide de la scène ouverte : il passe en dernier.
  const deposerEnFin = (e: React.DragEvent) => {
    const c = lire<ChargePlan>(e, MIME_PLAN);
    if (!c) return;
    e.preventDefault();
    marquerDepose(`plan:${c.planId}`);
    startTransition(() => deplacerPlan(c.planId, courant.id, null));
  };

  const detail = (p: PlanVue, entete: boolean) => (
    <DetailPlan
      projectId={projectId}
      plan={p}
      plans={courant.plans}
      sceneId={courant.id}
      groupes={groupes}
      entete={entete}
      libelleScene={libelleScene}
      onOuvrir={() => ouvrir(p)}
      onDeplace={(cible) => signaler(p.id, cible)}
    />
  );

  return (
    <div className="sc">
      <div className="queue sc-outils">
        <EtatFiches nbPlans={fiches.nbPlans} nbDeveloppes={fiches.nbDeveloppes} demande={fiches.demande} />
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
                {/* Entre deux scènes : un « + ». Après la dernière, la grande carte « Nouvelle scène » (plus bas) prend le relais. */}
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
                <ModifierSceneButton key={courant.id} sceneId={courant.id} titre={courant.titre} fonction={courant.fonction ?? ""} genre={courant.genre ?? ""} ambiance={courant.ambiance ?? ""} />
                <SupprimerSceneButton sceneId={courant.id} titre={courant.titre} />
              </span>
            ) : null}
          </div>
          {estSans ? (
            <p className="sc-fonction">Les plans qui ne sont dans aucune scène. Dépose un plan ici pour le détacher de sa scène.</p>
          ) : courant.fonction ? (
            <p className="sc-fonction">{courant.fonction}</p>
          ) : null}
          {genre || courant.ambiance ? (
            <ul className="sc-chips">
              {genre ? (
                <li className="sc-chip is-genre">
                  <span>Genre</span>
                  <b>{LIBELLE_GENRE[genre]}</b>
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
                      {p.etat !== "brouillon" ? <span className={`sc-etat is-${p.etat}`}>{p.etat === "pret" ? "✓ Prêt" : "En itération"}</span> : null}
                    </span>
                  </PlanDeplacable>
                  {p.id === planSel ? <div className="sc-ligne-detail">{detail(p, false)}</div> : null}
                </div>
              ))}
              {modeAjout ? fenteLigne(courant.plans.length) : null}
              {fantome === courant.plans.length ? ligneFantome : null}
            </div>
          )}
        </div>

        <div className="sc-detail-zone" aria-live="polite">
          {vue === "vignettes" && plan ? detail(plan, true) : null}
        </div>

      </div>

      <AjouterScene projectId={projectId} episodeId={episodeId} cible={cibleScene} onFermer={() => setCibleScene(null)} onLance={() => setSignal({ texte: "Scène en cours d'écriture : suivi dans la file des tâches." })} />

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

/** Ce que l'on fait d'un plan sélectionné : le lire, ouvrir sa fiche, le décaler d'un cran dans sa scène (sans glisser-déposer : tablette, clavier),
 * le changer de scène. `entete` : le panneau sous la grille de vignettes reprend le titre ; en liste, la ligne le porte déjà. */
function DetailPlan({
  projectId,
  plan,
  plans,
  sceneId,
  groupes,
  entete,
  libelleScene,
  onOuvrir,
  onDeplace,
}: {
  projectId: number;
  plan: PlanVue;
  plans: PlanVue[];
  sceneId: number | null;
  groupes: SceneVue[];
  entete: boolean;
  libelleScene: (g: SceneVue) => string;
  onOuvrir: () => void;
  onDeplace: (cible: SceneVue) => void;
}) {
  const [pending, startTransition] = useTransition();
  const i = plans.findIndex((p) => p.id === plan.id);
  /** Un plan naît en brouillon ; il n'a de fiche (prompt vidéo) qu'une fois écrite par l'agent. */
  const sansFiche = plan.statut === "brouillon";
  const decaler =(avantId: number | null) => {
    marquerDepose(`plan:${plan.id}`);
    startTransition(() => deplacerPlan(plan.id, sceneId, avantId));
  };

  return (
    <div className={entete ? "sc-detail" : "sc-detail-ligne"}>
      {entete ? (
        <div className="sc-detail-hd">
          <span className="sc-detail-pos num">{pad(plan.position)}</span>
          <h3>{plan.titre}</h3>
          <span className="sc-detail-meta num">
            {minutage(plan.debut)} · {plan.duree} s · {LIBELLE_ETAT[plan.etat]}
          </span>
        </div>
      ) : null}
      <p className={`sc-description${plan.description ? "" : " is-vide"}`}>{plan.description ?? "Pas encore de description."}</p>
      <div className="sc-actions">
        {sansFiche ? <GenererFiche projectId={projectId} planUuid={plan.uuid} demandeEnCours={plan.ficheEnCours} /> : null}
        <button type="button" className={`btn ${sansFiche ? "btn-ghost" : "btn-gold"} btn-sm`} onClick={onOuvrir}>
          {sansFiche ? "Ouvrir le plan →" : "Ouvrir la fiche →"}
        </button>
        <span className="sc-ordre" role="group" aria-label="Changer la place du plan">
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending || i <= 0} onClick={() => decaler(plans[i - 1]!.id)}>
            ‹ Avant
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending || i < 0 || i >= plans.length - 1} onClick={() => decaler(plans[i + 2]?.id ?? null)}>
            Après ›
          </button>
        </span>
        <DeplacerVers planId={plan.id} sceneId={sceneId} groupes={groupes} libelleScene={libelleScene} onDeplace={onDeplace} />
      </div>
    </div>
  );
}

/** « Déplacer vers… » : le déplacement d'un plan vers une autre scène au clavier ou au doigt (le glisser-déposer sur la carte de la scène reste possible). */
function DeplacerVers({
  planId,
  sceneId,
  groupes,
  libelleScene,
  onDeplace,
}: {
  planId: number;
  sceneId: number | null;
  groupes: SceneVue[];
  libelleScene: (g: SceneVue) => string;
  onDeplace: (cible: SceneVue) => void;
}) {
  const [pending, startTransition] = useTransition();
  const autres = groupes.filter((g) => g.id !== sceneId);
  if (autres.length === 0) return null;
  return (
    <label className="sc-deplacer">
      <span>Déplacer vers</span>
      <select
        value=""
        disabled={pending}
        onChange={(e) => {
          const cible = autres.find((g) => cleScene(g.id) === e.target.value);
          if (!cible) return;
          onDeplace(cible);
          startTransition(() => deplacerPlan(planId, cible.id, null));
        }}
      >
        <option value="">Choisir une scène…</option>
        {autres.map((g) => (
          <option key={cleScene(g.id)} value={cleScene(g.id)}>
            {libelleScene(g)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Une scène dans le bandeau : s'ouvre au clic, se déplace par glisser-déposer (les cartes se réordonnent entre elles), et reçoit les plans glissés dessus. */
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
  /** Minutage de départ de la scène dans le film. */
  debut: number;
  actif: boolean;
  suivantId: number | null;
  onChoisir: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Un plan vient d'être déposé sur cette carte. */
  onRecu: (planId: number) => void;
}) {
  const [repere, setRepere] = useState<"g" | "d" | null>(null);
  const [recoitPlan, setRecoitPlan] = useState(false);
  const [recu, setRecu] = useState(false);
  const [, startTransition] = useTransition();
  const { enDrag, debut: debutDrag, fin } = useEnGlissement();
  const genre = genreOuNull(g.genre);
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
      {/* Jamais d'image de plan sur une carte de scène : on la confondrait avec les vignettes des plans juste en dessous. Un dégradé propre à la scène, rien de plus. */}
      <span className="sc-carte-fond" style={{ backgroundImage: posterBackgroundImage(`scene:${cleScene(g.id)}`) }} aria-hidden="true" />
      <span className="sc-carte-voile" aria-hidden="true" />
      {numero ? <span className="sc-carte-n">{numero}</span> : null}
      <span className="sc-carte-bas">
        <span className="sc-carte-titre">{g.titre}</span>
        <span className="sc-carte-meta num">
          {minutage(debut)} · {pluriel(g.plans.length, "plan")}
          {genre ? ` · ${LIBELLE_GENRE[genre]}` : ""}
        </span>
      </span>
    </div>
  );
}
