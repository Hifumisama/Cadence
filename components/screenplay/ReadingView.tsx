"use client";

import "../scenario/scenario.css"; // the add-clip popup and the bottom-of-screen message are those of the Tournage page
import "../scenario/lecture.css";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { modifierTextePlan } from "@/app/scenario/actions";
import { retirerPlan } from "@/app/plans/actions";
import { Vignette } from "@/components/clip/Thumbnail";
import { useTaches } from "@/components/tasks/TasksProvider";
import { Icone } from "@/components/ui/Icon";
import { blocsDeLecture } from "@/lib/clips/intent-reading";
import { cleDemande } from "@/lib/tasks/tasks";
import { LIBELLE_INTENTION_CHANGEE, minutage, type AjoutEnCours, type AjoutSceneEnCours } from "@/lib/clips/screenplay-view";
import { AjouterPlan, type CibleAjoutPlan } from "./AddClip";

/** A clip as the Lecture view shows it: its DISPLAYED text (`intentAffichee`), never the raw description. */
export type PlanLecture = {
  /** Technical key, to delete the clip: never displayed nor put in an address (the public identifier is `uuid`). */
  id: number;
  uuid: string;
  position: number;
  titre: string;
  texte: string;
  duree: number;
  debut: number;
  intentionChangee: "fiche" | "rendu" | null;
  href: string;
  /** The video the clip's image is taken from (selected render, otherwise last finished render); null as long as nothing is generated. */
  src: string | null;
};

export type SceneLecture = {
  cle: string;
  titre: string;
  numero: string | null;
  /** What the scene does in the narrative (one sentence), if written. */
  fonction: string | null;
  ambiance: string | null;
  duree: number;
  plans: PlanLecture[];
};

const pad = (n: number) => String(n).padStart(2, "0");

/** The screenplay to read, ONE SCENE AT A TIME (a ten-scene film cannot be scrolled through in one go): the summary on the left switches scene, which is written in
 * script format. The clips are markers in the margin (position, duration, timing); clicking the text of a clip opens it in
 * edit mode (Ctrl+Entrée saves, Échap cancels). The other scenes stay mounted (hidden): a text being edited is not lost when switching scene.
 * The displayed scene is in the URL (`?scene=`), as on the Tournage page.
 *
 * Clips are decided here as on the Tournage: a « + » between two clips and at the end of a scene opens the same popup (the agent writes the clip, which keeps its place as a ghost
 * block while it is being written), and « Supprimer » removes the clip (its sheet and its attempts with it). It is the same data: a clip added here appears on the Tournage as « pas encore tourné ». */
export function VueLecture({
  projectId,
  episodeId,
  scenes,
  sceneInitiale,
  ajout,
  ajoutScene,
}: {
  projectId: number;
  episodeId: number;
  scenes: SceneLecture[];
  sceneInitiale: string | null;
  /** The clip being written (« Ajouter un plan »), or null. */
  ajout: AjoutEnCours | null;
  /** The scene being written, or null: only one addition at a time per film, clip or scene. */
  ajoutScene: AjoutSceneEnCours | null;
}) {
  const router = useRouter();
  const [courante, setCourante] = useState(() => (scenes.some((s) => s.cle === sceneInitiale) ? sceneInitiale! : (scenes[0]?.cle ?? "")));
  const [marges, setMarges] = useState(true);
  const [cibleAjout, setCibleAjout] = useState<CibleAjoutPlan | null>(null);
  const [signal, setSignal] = useState<string | null>(null);
  const haut = useRef<HTMLElement>(null);
  const { taches, pret: tachesPretes } = useTaches();
  const dernierRefresh = useRef(0);
  const occupe = ajout != null || ajoutScene != null;

  useEffect(() => {
    if (!signal) return;
    const t = setTimeout(() => setSignal(null), 6000);
    return () => clearTimeout(t);
  }, [signal]);

  // A clip being written: the page keeps its ghost block as long as the task is active. When the queue no longer has it (finished, failed, cancelled), we reload the
  // page: the clip is there, or the block disappears. Same principle as the Tournage page.
  const enEcriture = ajout ?? ajoutScene;
  useEffect(() => {
    if (!enEcriture || !tachesPretes) return;
    const active = taches.some((t) => t.cle === cleDemande(enEcriture.id) && (t.statut === "en_attente" || t.statut === "en_cours"));
    if (active || Date.now() - dernierRefresh.current < 3000) return;
    dernierRefresh.current = Date.now();
    router.refresh();
  }, [enEcriture, taches, tachesPretes, router]);

  // The summary stays visible under the application's sticky header, whose height changes with the screen width (tabs on one or two lines).
  useEffect(() => {
    const barre = document.querySelector<HTMLElement>(".topbar");
    const racine = haut.current?.closest<HTMLElement>(".sl");
    if (!barre || !racine) return;
    const mesurer = () => racine.style.setProperty("--sl-haut", `${Math.ceil(barre.getBoundingClientRect().height) + 16}px`);
    mesurer();
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(mesurer);
    o.observe(barre);
    return () => o.disconnect();
  }, []);

  const nomScene = (s: SceneLecture) => (s.numero ? `${s.numero}. ${s.titre}` : s.titre);

  const aller = (cle: string) => {
    setCourante(cle);
    // The address keeps the scene (sharing, reloading) without going through the server again.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("scene", cle);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* the URL is only a convenience */
    }
    haut.current?.scrollIntoView({ block: "start" });
  };

  const nbPlans = scenes.reduce((n, s) => n + s.plans.length, 0);
  const total = scenes.reduce((n, s) => n + s.duree, 0);

  // The place of a new clip: right before clip `i` of scene `si` (i = number of clips: at the end). At the start of a scene, the place is « after the last clip of the
  // scenes before it » (or at the start of the film): the same rule as on the Tournage page.
  const choisirPlace = (si: number, i: number) => {
    const s = scenes[si]!;
    const avant = i > 0 ? s.plans[i - 1] : scenes.slice(0, si).reverse().flatMap((g) => g.plans.slice(-1))[0];
    setCibleAjout({
      insertion: avant ? { apresPlanUuid: avant.uuid } : { debut: true },
      sceneId: s.cle === "sans" ? null : Number(s.cle),
      scene: nomScene(s),
      apres: avant ? `Après le plan ${pad(avant.position)} · ${avant.titre}` : "Au début du film",
    });
  };

  // The clip being written keeps its place in the scene: a ghost block at the spot where it will be added (-1: not in this scene).
  const placeFantome = (s: SceneLecture): number => {
    if (!ajout || ajout.sceneId !== (s.cle === "sans" ? null : Number(s.cle))) return -1;
    const position = ajout.position;
    return "apresPlanUuid" in position ? s.plans.findIndex((p) => p.uuid === position.apresPlanUuid) + 1 : 0;
  };
  const fantome = (
    <div className="sl-fantome" role="status" aria-label="Plan en cours d'écriture">
      <span className="sl-pouls" aria-hidden="true" />
      <div>
        <b>Écriture du plan…</b>
        <p>{ajout?.consigne}</p>
        <small>suivi dans la file des tâches</small>
      </div>
    </div>
  );
  const inserer = (si: number, i: number, libelle: string) => (
    <button type="button" className="sl-insere" disabled={occupe} onClick={() => choisirPlace(si, i)} title={occupe ? "Un ajout est déjà en cours d'écriture" : libelle} aria-label={libelle}>
      <Icone nom="ajouter" taille={14} />
      <span>Ajouter un plan ici</span>
    </button>
  );

  return (
    <div className="sl">
      <nav className="sl-sommaire" aria-label="Scènes">
        <p className="sl-sommaire-titre">Scènes</p>
        <p className="sl-sommaire-total num">
          {scenes.length} scène{scenes.length > 1 ? "s" : ""} · {nbPlans} plan{nbPlans > 1 ? "s" : ""} · {minutage(total)}
        </p>
        {scenes.map((s) => {
          const aRefaire = s.plans.filter((p) => p.intentionChangee).length;
          return (
            <button key={s.cle} type="button" className="sl-sommaire-lien" aria-current={s.cle === courante ? "true" : undefined} onClick={() => aller(s.cle)}>
              <span>{nomScene(s)}</span>
              <small className="num">
                {minutage(s.duree)} · {s.plans.length} plan{s.plans.length > 1 ? "s" : ""}
                {aRefaire > 0 ? <em className="sl-sommaire-refaire"> · {aRefaire} texte{aRefaire > 1 ? "s" : ""} modifié{aRefaire > 1 ? "s" : ""}</em> : null}
              </small>
            </button>
          );
        })}
        <label className="sl-option">
          <input type="checkbox" checked={marges} onChange={(e) => setMarges(e.target.checked)} /> Repères de plan
        </label>
      </nav>

      <article className={`sl-script${marges ? "" : " sans-reperes"}`} aria-label="Scénario" ref={haut}>
        {scenes.map((s, si) => (
          <section key={s.cle} id={`lecture-${s.cle}`} className="sl-scene" hidden={s.cle !== courante}>
            <header className="sl-entete">
              {s.numero ? (
                <span className="sl-numero" aria-hidden="true">
                  {s.numero}
                </span>
              ) : null}
              <div className="sl-entete-texte">
                <h2>{s.titre}</h2>
                {s.fonction ? <p className="sl-fonction">{s.fonction}</p> : null}
                <ul className="sl-meta">
                  {s.ambiance ? (
                    <li>
                      <span>Ambiance</span> <b>{s.ambiance}</b>
                    </li>
                  ) : null}
                  <li>
                    <span>Durée</span> <b className="num">{minutage(s.duree)}</b>
                  </li>
                  {s.plans[0] ? (
                    <li>
                      <span>Début</span> <b className="num">{minutage(s.plans[0].debut)}</b>
                    </li>
                  ) : null}
                  <li>
                    <b className="num">{s.plans.length}</b> <span>plan{s.plans.length > 1 ? "s" : ""}</span>
                  </li>
                </ul>
              </div>
            </header>
            {s.plans.length === 0 && placeFantome(s) < 0 ? (
              <div className="sl-scene-vide">
                <p className="sl-vide">Aucun plan dans cette scène.</p>
                {inserer(si, 0, "Ajouter un plan à cette scène")}
              </div>
            ) : null}
            {s.plans.map((p, i) => (
              <Fragment key={p.uuid}>
                {placeFantome(s) === i ? fantome : null}
                {inserer(si, i, i === 0 ? "Ajouter un plan au début de la scène" : `Ajouter un plan avant le plan ${pad(p.position)}`)}
                <PlanALire plan={p} />
              </Fragment>
            ))}
            {placeFantome(s) === s.plans.length ? fantome : null}
            {s.plans.length > 0 ? inserer(si, s.plans.length, "Ajouter un plan à la fin de la scène") : null}
          </section>
        ))}
      </article>

      <AjouterPlan
        projectId={projectId}
        episodeId={episodeId}
        cible={cibleAjout}
        onFermer={() => setCibleAjout(null)}
        onLance={() => setSignal("Plan en cours d'écriture : suivi dans la file des tâches.")}
      />
      {signal ? (
        <div className="sc-toast" role="status">
          <span>{signal}</span>
        </div>
      ) : null}
    </div>
  );
}

function PlanALire({ plan }: { plan: PlanLecture }) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(plan.texte);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [suppression, startSuppression] = useTransition();
  const [erreurSuppression, setErreurSuppression] = useState<string | null>(null);
  const champ = useRef<HTMLTextAreaElement>(null);

  // Deleting a clip also removes its sheet and all its attempts (cascade); a clip still cited as a reference only goes with « Forcer » (as on the Tournage).
  const supprimer = (force: boolean) => {
    const question = force
      ? `Forcer la suppression du plan ${pad(plan.position)} ? Ses références d'assets seront détachées (les assets eux-mêmes restent dans le registre). Irréversible.`
      : `Supprimer définitivement le plan ${pad(plan.position)} · ${plan.titre} ? Sa fiche et ses essais sont supprimés avec lui. Irréversible.`;
    if (!window.confirm(question)) return;
    setErreurSuppression(null);
    startSuppression(async () => {
      const r = await retirerPlan(plan.id, force);
      if (!r.ok) setErreurSuppression(r.erreur);
      else router.refresh();
    });
  };

  // The text comes from the server (after a save, an « Itérer » elsewhere): we restart from it outside edit mode.
  useEffect(() => {
    if (!edition) setBrouillon(plan.texte);
  }, [plan.texte, edition]);

  // The field opens at the height of its text and receives the cursor at the end.
  useEffect(() => {
    const c = champ.current;
    if (!edition || !c) return;
    c.style.height = "auto";
    c.style.height = `${c.scrollHeight}px`;
  }, [edition, brouillon]);
  useEffect(() => {
    if (edition) {
      const c = champ.current;
      c?.focus();
      c?.setSelectionRange(c.value.length, c.value.length);
    }
  }, [edition]);

  const enregistrer = () => {
    if (brouillon.trim() === plan.texte.trim()) {
      setEdition(false);
      return;
    }
    setErreur(null);
    startTransition(async () => {
      const r = await modifierTextePlan(plan.uuid, brouillon);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setEdition(false);
      router.refresh();
    });
  };
  const annuler = () => {
    setBrouillon(plan.texte);
    setErreur(null);
    setEdition(false);
  };

  const blocs = blocsDeLecture(plan.texte);

  return (
    <div className="sl-plan" data-intention={plan.intentionChangee ?? undefined}>
      <div className="sl-corps">
        {edition ? (
          <div className="sl-edition">
            <textarea
              ref={champ}
              className="sl-champ"
              aria-label={`Texte du plan ${pad(plan.position)}`}
              value={brouillon}
              disabled={pending}
              onChange={(e) => setBrouillon(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  enregistrer();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  annuler();
                }
              }}
            />
            <div className="sl-edition-pied">
              <button type="button" className="btn btn-gold btn-sm" disabled={pending} onClick={enregistrer}>
                {pending ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={annuler}>
                Annuler
              </button>
              <small>Ctrl+Entrée enregistre · Échap annule</small>
            </div>
            {erreur ? (
              <p className="sl-erreur" role="alert">
                {erreur}
              </p>
            ) : null}
          </div>
        ) : (
          <div
            className="sl-lisible"
            role="button"
            tabIndex={0}
            aria-label={`Modifier le texte du plan ${pad(plan.position)}`}
            onClick={() => setEdition(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setEdition(true);
              }
            }}
          >
            {blocs.length === 0 ? <p className="sl-action sl-vide">Pas encore de description. Clique pour l&rsquo;écrire.</p> : null}
            {blocs.map((b, i) =>
              b.type === "action" ? (
                <p key={i} className="sl-action">
                  {b.texte}
                </p>
              ) : (
                <div key={i} className="sl-replique">
                  <p className="sl-perso">{b.perso}</p>
                  <p className="sl-parole">{b.texte}</p>
                </div>
              ),
            )}
          </div>
        )}
      </div>
      <aside className="sl-repere" aria-label={`Plan ${pad(plan.position)}`}>
        {/* The clip's image, when a render exists: the first frame of the video, without storing anything. Without a render, no empty frame. */}
        {plan.src ? (
          <a className="sl-image" href={plan.href} title="Ouvrir l'atelier du plan" tabIndex={-1}>
            <Vignette src={plan.src} />
          </a>
        ) : null}
        <a className="sl-repere-pos" href={plan.href} title="Ouvrir l'atelier du plan">
          Plan {pad(plan.position)}
        </a>
        <span className="sl-repere-titre">{plan.titre}</span>
        <span className="num">
          {minutage(plan.debut)} · {plan.duree} s
        </span>
        {plan.intentionChangee ? <span className="sl-intention">{LIBELLE_INTENTION_CHANGEE[plan.intentionChangee]}</span> : null}
        <button type="button" className="sl-supprimer" onClick={() => supprimer(false)} disabled={suppression} aria-label={`Supprimer le plan ${pad(plan.position)}`}>
          <Icone nom={suppression ? "encours" : "supprimer"} taille={14} /> Supprimer
        </button>
        {erreurSuppression ? (
          <span className="sl-erreur" role="alert">
            {erreurSuppression}{" "}
            <button type="button" className="sl-forcer" onClick={() => supprimer(true)} disabled={suppression}>
              Forcer
            </button>
          </span>
        ) : null}
      </aside>
    </div>
  );
}
