"use client";

import "./scenario.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deplacerPlan, deplacerScene } from "@/app/scenario/actions";
import { frappeEnCours } from "@/components/plan/PelliculePlans";
import { Vignette } from "@/components/plan/Vignette";
import { Icone } from "@/components/ui/Icone";
import { StatusBadge, statusNodeClass } from "@/components/ui/StatusBadge";
import { LIBELLE_ETAT_PLAN } from "@/lib/fiche-plan";
import { LIBELLE_GENRE, genreOuNull } from "@/lib/scene-genres";
import { cleScene, minutage, romain, type PlanVue, type SceneVue } from "@/lib/scenario-vue";
import { MIME_PLAN, MIME_SCENE, PlanDeplacable, demarrerApercu, lire, marquerDepose, useEnGlissement, type ChargePlan } from "./GlisserDeposer";
import { ModifierSceneButton } from "./ModifierSceneButton";
import { NouveauPlanForm } from "./NouveauPlanForm";
import { NouveauSceneForm } from "./NouveauSceneForm";
import { SupprimerSceneButton } from "./SupprimerSceneButton";

type Vue = "vignettes" | "liste";
const CLE_VUE = "cadence:scenario-vue";
const CLE_DESCRIPTIONS = "cadence:scenario-descriptions";

const pad = (n: number) => String(n).padStart(2, "0");
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** La page Scénario : un bandeau de scènes (une seule ouverte à la fois), l'en-tête de la scène ouverte, puis ses plans en vignettes ou en liste.
 * Un clic sélectionne un plan et en montre la description ; un double-clic ou Entrée ouvre sa fiche. Tout est côté client : changer de scène est
 * instantané, et le choix reste dans l'URL (`?scene=`). */
export function VueScenario({
  projectId,
  episodeId,
  groupes,
  sceneInitiale,
}: {
  projectId: number;
  episodeId: number;
  groupes: SceneVue[];
  sceneInitiale: string | null;
}) {
  const router = useRouter();
  const [cle, setCle] = useState<string>(() => (sceneInitiale && groupes.some((g) => cleScene(g.id) === sceneInitiale) ? sceneInitiale : cleScene(groupes[0]?.id ?? null)));
  const [planSel, setPlanSel] = useState<number | null>(null);
  const aDesImages = groupes.some((g) => g.plans.some((p) => p.src));
  const [vue, setVue] = useState<Vue>(aDesImages ? "vignettes" : "liste");
  const [descriptions, setDescriptions] = useState(false);
  const [, startTransition] = useTransition();
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

  const choisirScene = (k: string) => {
    setCle(k);
    setPlanSel(null);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}?scene=${k}`);
    } catch {
      // l'URL n'est qu'un confort
    }
  };

  // La scène ouverte se recentre dans le bandeau ; le focus la suit quand on navigue au clavier dans le bandeau.
  useEffect(() => {
    const onglet = rail.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    onglet?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    if (focusRail.current) {
      focusRail.current = false;
      onglet?.focus();
    }
  }, [cleCourante]);

  // Le plan sélectionné reste visible quand on le change aux flèches.
  useEffect(() => {
    if (planSel == null) return;
    document.querySelector<HTMLElement>(`[data-plan="${planSel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [planSel]);

  // ← → (et ↑ ↓ en liste) passent d'un plan à l'autre.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (!courant || courant.plans.length === 0 || frappeEnCours(e)) return;
      if ((e.target as HTMLElement | null)?.closest?.('[role="tab"]')) return;
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
  }, [courant, planSel, vue]);

  if (!courant) {
    return (
      <div className="sc">
        <div className="queue">
          <NouveauPlanForm projectId={projectId} episodeId={episodeId} scenesOptions={[]} />
          <NouveauSceneForm episodeId={episodeId} />
        </div>
        <p className="tiny-note" style={{ marginTop: "var(--sp-6)" }}>
          Aucun plan en base. Lancer <code>npm run db:import</code> pour importer l&rsquo;épisode 1 depuis le markdown existant, ou créer un plan à la main ci-dessus.
        </p>
      </div>
    );
  }

  const scenesReelles = groupes.filter((g) => g.id != null);
  const nbPlans = groupes.reduce((acc, g) => acc + g.plans.length, 0);
  const dureeTotale = groupes.reduce((acc, g) => acc + g.duree, 0);
  const genre = genreOuNull(courant.genre);
  const estSans = courant.id == null;

  const ouvrir = (p: PlanVue) => router.push(p.href);
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

  // Déposer un plan dans un espace vide de la scène ouverte : il passe en dernier.
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
        <NouveauSceneForm episodeId={episodeId} />
        <span className="sc-total num">
          {pluriel(scenesReelles.length, "scène")} · {pluriel(nbPlans, "plan")} · {minutage(dureeTotale)}
        </span>
      </div>

      <nav className="sc-rail-zone" aria-label="Scènes">
        <button type="button" className="tm-reel-nav" aria-label="Scène précédente" disabled={indexCourant <= 0} onClick={() => choisirScene(cleScene(groupes[indexCourant - 1]!.id))}>
          ‹
        </button>
        <div className="sc-rail" role="tablist" aria-label="Scènes du film" ref={rail}>
          {groupes.map((g, i) => (
            <CarteScene
              key={cleScene(g.id)}
              g={g}
              numero={g.id != null ? romain(i + 1) : null}
              actif={cleScene(g.id) === cleCourante}
              suivantId={groupes[i + 1]?.id ?? null}
              onChoisir={() => choisirScene(cleScene(g.id))}
              onKeyDown={(e) => surClavierRail(e, i)}
            />
          ))}
        </div>
        <button type="button" className="tm-reel-nav" aria-label="Scène suivante" disabled={indexCourant >= groupes.length - 1} onClick={() => choisirScene(cleScene(groupes[indexCourant + 1]!.id))}>
          ›
        </button>
      </nav>

      <section className="sc-entete" aria-label={`Scène : ${courant.titre}`}>
        <div className="sc-entete-titre">
          {!estSans ? <span className="sc-roman">{romain(indexCourant + 1)}</span> : null}
          <h2>{courant.titre}</h2>
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
          {!estSans && !genre && !courant.ambiance ? <li className="sc-chip is-vide">Genre et ambiance non définis : « Modifier » pour les ajouter</li> : null}
          <li className="sc-chip">
            <span>Plans</span>
            <b className="num">{courant.plans.length}</b>
          </li>
          <li className="sc-chip">
            <span>Durée</span>
            <b className="num">{minutage(courant.duree)}</b>
          </li>
        </ul>
      </section>

      <div className="queue sc-plans-barre">
        <NouveauPlanForm
          key={cleCourante}
          projectId={projectId}
          episodeId={episodeId}
          scenesOptions={scenesReelles.map((g) => ({ id: g.id!, titre: g.titre }))}
          sceneInitiale={courant.id}
        />
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
        {courant.plans.length === 0 ? (
          <p className="sc-vide">{estSans ? "Aucun plan sans scène." : "Aucun plan dans cette scène : crée-en un, ou glisses-en un depuis une autre scène sur sa carte."}</p>
        ) : vue === "vignettes" ? (
          <div className="sc-grille" role="listbox" aria-label="Plans de la scène">
            {courant.plans.map((p, i) => (
              <PlanDeplacable
                key={p.id}
                planId={p.id}
                sceneId={courant.id}
                suivantId={courant.plans[i + 1]?.id ?? null}
                axe="x"
                className={`sc-cadre etat-${p.etat}`}
                selectionne={p.id === planSel}
                onClick={() => setPlanSel(p.id)}
                onDoubleClick={() => ouvrir(p)}
                onKeyDown={surClavierPlan(p)}
              >
                <span className="tm-cadre-img sc-img">
                  <Vignette src={p.src} />
                  {!p.src && p.description ? <span className="sc-extrait">{p.description}</span> : null}
                  <span className="sc-pos num">{pad(p.position)}</span>
                  <span className={`tm-cadre-etat is-${p.etat}`} title={LIBELLE_ETAT_PLAN[p.etat]}>
                    {p.etat === "pret" ? "✓" : ""}
                  </span>
                </span>
                <span className="sc-cadre-nom">{p.titre}</span>
                <span className="sc-cadre-temps num">
                  {minutage(p.debut)} · {p.duree} s
                </span>
              </PlanDeplacable>
            ))}
          </div>
        ) : (
          <div className="frise sc-liste" role="listbox" aria-label="Plans de la scène">
            {courant.plans.map((p, i) => (
              <PlanDeplacable
                key={p.id}
                planId={p.id}
                sceneId={courant.id}
                suivantId={courant.plans[i + 1]?.id ?? null}
                axe="y"
                className={`shot ${statusNodeClass(p.statut)}`}
                selectionne={p.id === planSel}
                onClick={() => setPlanSel(p.id)}
                onDoubleClick={() => ouvrir(p)}
                onKeyDown={surClavierPlan(p)}
              >
                <span className="node" />
                <span className="shot-no">{pad(p.position)}</span>
                <span className="shot-title">
                  {p.titre}
                  {p.id === planSel ? (
                    <span className="sc-ligne-detail" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                      <span className="sc-description">{p.description ?? "Pas encore de description."}</span>
                      <span className="sc-actions">
                        <button type="button" className="btn btn-gold btn-sm" onClick={() => ouvrir(p)}>
                          Ouvrir la fiche →
                        </button>
                        <DeplacerVers planId={p.id} sceneId={courant.id} groupes={groupes} />
                      </span>
                    </span>
                  ) : descriptions && p.description ? (
                    <span className="shot-desc">{p.description}</span>
                  ) : null}
                </span>
                <span className="shot-right">
                  <span className="shot-duree num" title="Minutage de départ dans le film">
                    {minutage(p.debut)}
                  </span>
                  <span className="shot-duree num" title="Durée de montage">
                    {p.duree} s
                  </span>
                  {p.statut !== "brouillon" ? <StatusBadge statut={p.statut} /> : null}
                </span>
              </PlanDeplacable>
            ))}
          </div>
        )}
      </div>

      {vue === "vignettes" && courant.plans.length > 0 ? (
        plan ? (
          <aside className="sc-detail" aria-live="polite">
            <div className="sc-detail-hd">
              <span className="sc-detail-pos num">{pad(plan.position)}</span>
              <h3>{plan.titre}</h3>
              <span className="sc-detail-meta num">
                {minutage(plan.debut)} · {plan.duree} s · {LIBELLE_ETAT_PLAN[plan.etat]}
              </span>
            </div>
            <p className={`sc-description${plan.description ? "" : " is-vide"}`}>{plan.description ?? "Pas encore de description."}</p>
            <div className="sc-actions">
              <button type="button" className="btn btn-gold" onClick={() => ouvrir(plan)}>
                Ouvrir la fiche →
              </button>
              <DeplacerVers planId={plan.id} sceneId={courant.id} groupes={groupes} />
            </div>
          </aside>
        ) : (
          <p className="sc-astuce">Clique sur un plan pour lire sa description · double-clic ou Entrée pour ouvrir sa fiche · ← → pour passer d&rsquo;un plan à l&rsquo;autre.</p>
        )
      ) : null}
    </div>
  );
}

/** « Déplacer vers… » : le déplacement d'un plan vers une autre scène au clavier ou au doigt (le glisser-déposer sur la carte de la scène reste possible). */
function DeplacerVers({ planId, sceneId, groupes }: { planId: number; sceneId: number | null; groupes: SceneVue[] }) {
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
          const v = e.target.value;
          if (!v) return;
          startTransition(() => deplacerPlan(planId, v === "sans" ? null : Number(v), null));
        }}
      >
        <option value="">Choisir une scène…</option>
        {autres.map((g) => (
          <option key={cleScene(g.id)} value={cleScene(g.id)}>
            {g.titre}
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
  actif,
  suivantId,
  onChoisir,
  onKeyDown,
}: {
  g: SceneVue;
  numero: string | null;
  actif: boolean;
  suivantId: number | null;
  onChoisir: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const [repere, setRepere] = useState<"g" | "d" | null>(null);
  const [recoitPlan, setRecoitPlan] = useState(false);
  const [, startTransition] = useTransition();
  const { enDrag, debut, fin } = useEnGlissement();
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
      tabIndex={actif ? 0 : -1}
      className={`sc-carte${actif ? " is-on" : ""}${g.id == null ? " is-sans" : ""}${recoitPlan ? " is-drop" : ""}${repere ? ` drop-${repere}` : ""}${enDrag ? " is-drag" : ""}`}
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
        debut();
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
          marquerDepose(`plan:${c.planId}`);
          startTransition(() => deplacerPlan(c.planId, g.id, null));
        }
      }}
    >
      {numero ? <span className="sc-carte-n">{numero}</span> : <Icone nom="autre" taille={16} />}
      <span className="sc-carte-titre">{g.titre}</span>
      <span className="sc-carte-meta num">
        {pluriel(g.plans.length, "plan")} · {minutage(g.duree)}
      </span>
    </div>
  );
}
