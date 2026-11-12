"use client";

import "./scenario.css"; // la popup d'ajout d'un plan et le message du bas d'écran sont ceux de la page Tournage
import "./lecture.css";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { modifierTextePlan } from "@/app/scenario/actions";
import { retirerPlan } from "@/app/plans/actions";
import { Vignette } from "@/components/plan/Vignette";
import { useTaches } from "@/components/taches/TachesProvider";
import { Icone } from "@/components/ui/Icone";
import { blocsDeLecture } from "@/lib/clips/intent-reading";
import { cleDemande } from "@/lib/tasks/tasks";
import { LIBELLE_INTENTION_CHANGEE, minutage, type AjoutEnCours, type AjoutSceneEnCours } from "@/lib/clips/screenplay-view";
import { AjouterPlan, type CibleAjoutPlan } from "./AjouterPlan";

/** Un plan tel que la vue Lecture le montre : son texte AFFICHÉ (`intentAffichee`), jamais la description brute. */
export type PlanLecture = {
  /** Clé technique, pour supprimer le plan : jamais affichée ni mise dans une adresse (l'identifiant public est `uuid`). */
  id: number;
  uuid: string;
  position: number;
  titre: string;
  texte: string;
  duree: number;
  debut: number;
  intentionChangee: "fiche" | "rendu" | null;
  href: string;
  /** La vidéo dont on tire l'image du plan (rendu retenu, sinon dernier rendu terminé) ; null tant que rien n'est généré. */
  src: string | null;
};

export type SceneLecture = {
  cle: string;
  titre: string;
  numero: string | null;
  /** Ce que la scène fait dans le récit (une phrase), s'il est écrit. */
  fonction: string | null;
  ambiance: string | null;
  duree: number;
  plans: PlanLecture[];
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Le scénario à lire, UNE SCÈNE À LA FOIS (un film de dix scènes ne se fait pas défiler d'un trait) : le sommaire de gauche change de scène, qui s'écrit au
 * format de script. Les plans sont des repères dans la marge (position, durée, minutage) ; cliquer sur le texte d'un plan l'ouvre en
 * édition (Ctrl+Entrée enregistre, Échap annule). Les autres scènes restent montées (masquées) : un texte en cours d'édition ne se perd pas en changeant de scène.
 * La scène affichée est dans l'URL (`?scene=`), comme sur la page Tournage.
 *
 * Les plans se décident ici comme sur le Tournage : un « + » entre deux plans et en fin de scène ouvre la même popup (l'agent écrit le plan, qui garde sa place en bloc
 * fantôme pendant l'écriture), et « Supprimer » retire le plan (sa fiche et ses essais avec lui). C'est la même donnée : un plan ajouté ici apparaît au Tournage « pas encore tourné ». */
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
  /** Le plan en cours d'écriture (« Ajouter un plan »), ou null. */
  ajout: AjoutEnCours | null;
  /** La scène en cours d'écriture, ou null : un seul ajout à la fois par film, plan ou scène. */
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

  // Un plan en cours d'écriture : la page garde son bloc fantôme tant que la tâche est active. Quand la file ne l'a plus (finie, échouée, annulée), on recharge la
  // page : le plan est là, ou le bloc disparaît. Même principe que la page Tournage.
  const enEcriture = ajout ?? ajoutScene;
  useEffect(() => {
    if (!enEcriture || !tachesPretes) return;
    const active = taches.some((t) => t.cle === cleDemande(enEcriture.id) && (t.statut === "en_attente" || t.statut === "en_cours"));
    if (active || Date.now() - dernierRefresh.current < 3000) return;
    dernierRefresh.current = Date.now();
    router.refresh();
  }, [enEcriture, taches, tachesPretes, router]);

  // Le sommaire reste visible sous l'en-tête collant de l'application, dont la hauteur change selon la largeur de l'écran (onglets sur une ou deux lignes).
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
    // L'adresse garde la scène (partage, rechargement) sans repasser par le serveur.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("scene", cle);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* l'URL n'est qu'un confort */
    }
    haut.current?.scrollIntoView({ block: "start" });
  };

  const nbPlans = scenes.reduce((n, s) => n + s.plans.length, 0);
  const total = scenes.reduce((n, s) => n + s.duree, 0);

  // La place d'un nouveau plan : juste avant le plan `i` de la scène `si` (i = nombre de plans : à la fin). Au début d'une scène, la place est « après le dernier plan des
  // scènes qui la précèdent » (ou au début du film) : la même règle que sur la page Tournage.
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

  // Le plan en cours d'écriture garde sa place dans la scène : un bloc fantôme à l'endroit où il sera ajouté (-1 : pas dans cette scène).
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

  // Supprimer un plan retire aussi sa fiche et tous ses essais (cascade) ; un plan encore cité comme référence ne part qu'avec « Forcer » (comme sur le Tournage).
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

  // Le texte arrive du serveur (après un enregistrement, un « Itérer » ailleurs) : on repart de lui hors édition.
  useEffect(() => {
    if (!edition) setBrouillon(plan.texte);
  }, [plan.texte, edition]);

  // Le champ s'ouvre à la hauteur de son texte et reçoit le curseur à la fin.
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
        {/* L'image du plan, quand un rendu existe : la première image de la vidéo, sans rien stocker. Sans rendu, pas de cadre vide. */}
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
