"use client";

import "../conception/conception.css";
import "../conception/demarrage.css";
import "../conception/avancee.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { arreterCreationProjet, reprendreCreationProjet } from "@/app/creation/actions";
import { SYMBOLE_SOUS_TACHE } from "@/lib/agents/agents-display";
import type { PlanIntent, SuiviFichePlan, VueCreation } from "@/lib/agents/creation-view";
import { IntentsAvantFiches } from "./IntentsBeforeSheets";
import { motDuTon, type Conception } from "@/lib/projects/design";
import { minutesSecondes, teinteAmbiance } from "@/lib/projects/design-ui";
import { BoutonGenererImages, useEtatImages } from "@/components/images/ProjectImages";
import { phraseCompteImages, type EtatImages } from "@/lib/assets/project-images";
import { AfficheProjet, type StyleAffiche } from "./ClapScene";
import { RubanConception } from "./DesignRibbon";
import { EnteteScene } from "./Scenes";

const LIBELLES: Record<VueCreation["etapes"][number]["statut"], string> = {
  a_venir: "en attente",
  en_cours: "en cours",
  fait: "terminé",
  passe: "rien à faire",
  echoue: "en échec",
};

const NOMS_ETAPES = ["Format", "Genre & ton", "Durée", "Langue", "Style", "Mise en scène", "Scénario", "Clap", "Avancée"];

/** Scene 8 of the design: the preparation's progress, step by step (the installer, lib/agents/creation.ts). Same data and same
 * polling as the old page; only the presentation changes: the design ribbon, the project's poster, the percentage on one
 * line and round linked steps. Never colour alone: each state has its label. `conception` is null for a project created
 * before the design (the page then has neither ribbon nor poster). */
export function AvanceeScene({
  projectId,
  nomProjet,
  initial,
  imagesInitial,
  conception,
  style,
  miseEnScene,
  plansInitial,
  suiviInitial,
}: {
  projectId: number;
  nomProjet: string;
  /** The clips and their intents (lib/agents/creation-view.ts): the end screen of phase 1 has them re-read before writing the sheets. */
  plansInitial: PlanIntent[];
  /** The latest sheet request of each clip (`lireSuiviFiches`): the intents screen follows « Écrire les fiches » clip by clip. */
  suiviInitial: SuiviFichePlan[];
  /** The project's staging in a few words (`resumeMiseEnScene`), for the ribbon. */
  miseEnScene: string;
  initial: VueCreation | null;
  /** Where the reference images stand (lib/assets/project-images.ts): the final clap says what is really done. */
  imagesInitial: EtatImages;
  conception: Conception | null;
  style: StyleAffiche;
}) {
  const [vue, setVue] = useState<VueCreation | null>(initial);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Step detail: collapsed when all is well, opened by default while it works or when it has failed (unless chosen otherwise).
  const [depliees, setDepliees] = useState<Record<string, boolean>>({});
  // Once the preparation is finished: the big clap (« Voir le projet ») replaces the list, which a small button brings back. As long as some clips
  // have no sheet, the intents screen comes first (« Plus tard » leads to the clap); a button always brings it back.
  const [affichage, setAffichage] = useState<"clap" | "etapes" | "intents" | null>(null);
  const enVol = useRef(false);
  const { etat: images, recharger: rechargerImages } = useEtatImages(projectId, imagesInitial);
  // The clap only says « tout est prêt » if there is nothing to illustrate or if all the images exist.
  const imagesAFaire = images != null && images.sansImage > 0;

  const charger = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch(`/api/creation/${projectId}`, { cache: "no-store" });
      if (res.ok) setVue(((await res.json()) as { creation: VueCreation | null }).creation);
    } catch {
      /* server restarting: next round */
    } finally {
      enVol.current = false;
    }
  }, [projectId]);

  const enCours = vue?.statut === "en_cours";
  useEffect(() => {
    const t = setInterval(() => void charger(), enCours ? 2000 : 8000);
    return () => clearInterval(t);
  }, [charger, enCours]);

  const agir = (action: () => Promise<{ ok: boolean; erreur?: string }>) =>
    startTransition(async () => {
      setErreur(null);
      const r = await action();
      if (!r.ok) setErreur(r.erreur ?? "L'action a échoué.");
      await charger();
    });

  const ambiance = useMemo(
    () => (conception ? ({ "--cn-hue": teinteAmbiance(conception.genres), "--cn-lum": (1 - conception.ton / 100).toFixed(2) } as CSSProperties) : undefined),
    [conception],
  );
  const resumes = conception
    ? ["Film", `${conception.genres.join("/")} · ${motDuTon(conception.ton)}`, minutesSecondes(conception.dureeSecondes), conception.langue, style.nom, miseEnScene, "fait", "fait"]
    : [];

  const pct = vue && vue.total ? Math.round((vue.faites / vue.total) * 100) : 0;
  const etapeCourante = vue?.etapes.find((e) => e.statut === "en_cours" || e.statut === "echoue");
  const termine = vue?.statut === "termine";
  // Sheets to write: decided by the clips (clips without a sheet), not by creation (sheets are per-clip requests, outside creation).
  const fichesAEcrire = termine && vue != null && vue.plansSansFiche > 0;
  const titre = !vue
    ? <>Pas encore de <em>préparation</em>.</>
    : { en_cours: <>La préparation <em>avance</em>.</>, termine: fichesAEcrire ? <>Le scénario est <em>prêt</em>.</> : <>Le projet est <em>prêt</em>.</>, echoue: <>La préparation est <em>interrompue</em>.</>, arretee: <>La préparation est <em>arrêtée</em>.</> }[vue.statut];
  const affichageEffectif = affichage ?? (fichesAEcrire ? "intents" : "clap");
  const vueIntents = termine && affichageEffectif === "intents";
  const vueClap = termine && affichageEffectif === "clap";
  const nomAffiche = nomProjet === "Sans titre" ? "Ton projet" : nomProjet;
  const faits = vue?.etapes.filter((e) => e.statut === "fait" && e.resultat).map((e) => e.resultat as string) ?? [];

  return (
    <div className="cn-salle" style={ambiance}>
      <div className="cn-ambiance" aria-hidden="true"><i /><i /></div>
      {conception ? (
        <RubanConception cadres={NOMS_ETAPES.map((nom, i) => ({ nom, resume: i === 8 ? (vue ? `${vue.faites}/${vue.total}` : "") : (resumes[i] ?? ""), etat: i === 8 ? "courant" : "fait" }))} />
      ) : null}

      <div className="cn-scene">
        <EnteteScene
          acte={conception ? "Acte 09" : "Installateur"}
          titre={titre}
          sous="Chaque étape est écrite puis appliquée toute seule. Tu relis ensuite le résultat là où il se trouve (épisodes, registre, plans) et tu retouches ce qui doit l’être."
        />
        <div className="cn-avancee">
          <div className="cn-av-gauche">
            {conception ? <AfficheProjet conception={conception} style={style} titre={nomProjet === "Sans titre" ? "" : nomProjet} /> : null}
            <p className="cn-grand-pct" aria-label={`${pct} pour cent`}>{pct} %</p>
            <p className="cn-av-sous">{vue?.statut === "termine" ? (fichesAEcrire ? "Scénario prêt · fiches à écrire" : "Préparation terminée") : etapeCourante ? `${etapeCourante.statut === "echoue" ? "En échec" : "En cours"} : ${etapeCourante.libelle}` : vue ? "En attente" : "Rien n’est lancé"}</p>
            {vue ? <p className="cn-av-compte">{vue.faites} / {vue.total} étapes</p> : null}
          </div>

          <div className="cn-av-droite">
            {!vue ? (
              <p className="cn-note" style={{ margin: 0 }}>Aucune préparation pour ce projet. Parle de ton projet au scénariste, puis lance la préparation depuis le clap.</p>
            ) : vueIntents ? (
              <IntentsAvantFiches
                projectId={projectId}
                initial={plansInitial}
                suiviInitial={suiviInitial}
                onLancees={() => {
                  setAffichage("intents"); // stays on the tracking, even when all the sheets have been launched
                  void charger();
                }}
                onPlusTard={() => setAffichage("clap")}
              />
            ) : vueClap && imagesAFaire && images ? (
              // Preparation finished but reference images not done: the clap says so and points to what comes next (not a block link: it carries buttons).
              <div className="cn-grand-clap cn-grand-clap-suite">
                <span className="cn-grand-clap-haut" aria-hidden="true" />
                <span className="cn-grand-clap-corps">
                  <small>Préparation terminée</small>
                  <b>{nomAffiche}</b>
                  <span>
                    {phraseCompteImages(images)}
                    {images.enFile > 0 ? ` · ${images.enFile} en file ou en cours` : ""}. Les épisodes, les plans et le registre sont en place ; il reste à fabriquer les images de référence, qui donnent l’ambiance du projet.
                  </span>
                  {faits.length > 0 ? <span className="cn-grand-clap-puces">{faits.slice(0, 5).map((f) => <i key={f}>{f}</i>)}</span> : null}
                  <span className="cn-clap-actions">
                    <Link href={`/p/${projectId}/assets`} className="btn btn-gold">Fabriquer les images</Link>
                    <BoutonGenererImages projectId={projectId} etat={images} recharger={rechargerImages} />
                    <Link href={`/p/${projectId}`} className="cn-lien">Voir le projet</Link>
                  </span>
                </span>
              </div>
            ) : vueClap ? (
              <Link href={`/p/${projectId}`} className="cn-grand-clap" aria-label={`Voir le projet ${nomAffiche}`}>
                <span className="cn-grand-clap-haut" aria-hidden="true" />
                <span className="cn-grand-clap-corps">
                  <small>Tout est prêt</small>
                  <b>{nomAffiche}</b>
                  <span>Les épisodes, les plans, les personnages et les décors sont en place. À toi de relire, de retoucher, puis de tourner.</span>
                  {faits.length > 0 ? <span className="cn-grand-clap-puces">{faits.slice(0, 5).map((f) => <i key={f}>{f}</i>)}</span> : null}
                  <em>Voir le projet →</em>
                </span>
              </Link>
            ) : (
              <ol className="cn-etapes" aria-label="Avancement de la préparation">
                {vue.etapes.map((e, i) => (
                  <li key={e.cle} className={`cn-etape s-${e.statut}`} aria-current={etapeCourante?.cle === e.cle ? "step" : undefined}>
                    <span className="cn-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                    <span className="cn-etape-corps">
                      <b>{e.libelle}</b>
                      <span>{e.resultat ?? e.detail}</span>
                      {e.erreur ? <span className="cn-erreur" role="alert">{e.erreur}</span> : null}
                      {e.activite ? <span role="status">{e.activite}</span> : null}
                      {e.statut === "en_cours" ? <span className="cn-progres" aria-hidden="true" /> : null}
                      {e.sousTaches.length > 0 ? (
                        <button
                          type="button"
                          className="cn-lien cn-deplier"
                          aria-expanded={depliees[e.cle] ?? (e.statut === "en_cours" || e.statut === "echoue")}
                          onClick={() => setDepliees((d) => ({ ...d, [e.cle]: !(d[e.cle] ?? (e.statut === "en_cours" || e.statut === "echoue")) }))}
                        >
                          {(depliees[e.cle] ?? (e.statut === "en_cours" || e.statut === "echoue")) ? "Masquer le détail" : `Voir le détail (${e.sousTaches.length})`}
                        </button>
                      ) : null}
                      {e.sousTaches.length > 0 && (depliees[e.cle] ?? (e.statut === "en_cours" || e.statut === "echoue")) ? (
                        <ul className="cn-sous" aria-label={`Détail : ${e.libelle}`}>
                          {e.sousTaches.map((s, k) => (
                            <li key={`${s.libelle}-${k}`}>
                              <span aria-hidden="true">{SYMBOLE_SOUS_TACHE[s.statut]}</span>
                              <span>{s.libelle}</span>
                              <span>{s.detail}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </span>
                    <span className="cn-badge">{LIBELLES[e.statut]}</span>
                  </li>
                ))}
              </ol>
            )}

            {erreur ? <p className="cn-erreur" role="alert">{erreur}</p> : null}
            <div className="cn-av-actions">
              {vue?.statut === "en_cours" ? <button type="button" className="btn" disabled={pending} onClick={() => agir(() => arreterCreationProjet(projectId))}>Arrêter</button> : null}
              {vue && (vue.statut === "echoue" || vue.statut === "arretee") ? (
                <button type="button" className="btn btn-gold" disabled={pending} onClick={() => agir(() => reprendreCreationProjet(projectId))}>
                  {vue.statut === "echoue" ? "Reprendre depuis l’étape en échec" : "Reprendre"}
                </button>
              ) : null}
              {termine && !vueIntents ? (
                <button type="button" className={fichesAEcrire ? "btn btn-gold" : "btn"} onClick={() => setAffichage("intents")}>
                  {fichesAEcrire ? "Relire les intents et écrire les fiches" : "Intents et fiches des plans"}
                </button>
              ) : null}
              {termine ? (
                <button type="button" className="btn" onClick={() => setAffichage(vueClap ? "etapes" : "clap")}>
                  {vueClap ? "Revoir les étapes" : "Retour au clap"}
                </button>
              ) : null}
              {termine && !vueClap ? <Link href={`/p/${projectId}`} className="btn btn-gold">Voir le projet</Link> : null}
              {conception && !vue ? <Link href={`/p/${projectId}/demarrage`} className="btn btn-gold">Retourner à la conception</Link> : null}
              <span className="cn-note">Tu peux quitter cette page : la préparation continue sur le serveur. Il n’y a pas de point de retour : pour tout défaire, supprime le projet.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
