"use client";

import "./conception.css";
import "./demarrage.css";
import "./avancee.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { arreterCreationProjet, reprendreCreationProjet } from "@/app/creation/actions";
import { SYMBOLE_SOUS_TACHE } from "@/lib/agents-affichage";
import type { VueCreation } from "@/lib/agents/creation-vue";
import { motDuTon, type Conception } from "@/lib/conception";
import { minutesSecondes, teinteAmbiance } from "@/lib/conception-ui";
import { AfficheProjet, type StyleAffiche } from "./ClapScene";
import { RubanConception } from "./RubanConception";
import { EnteteScene } from "./Scenes";

const LIBELLES: Record<VueCreation["etapes"][number]["statut"], string> = {
  a_venir: "en attente",
  en_cours: "en cours",
  fait: "terminé",
  passe: "rien à faire",
  echoue: "en échec",
};

const NOMS_ETAPES = ["Format", "Genre & ton", "Durée", "Langue", "Style", "Scénario", "Clap", "Avancée"];

/** Scène 8 de la conception : l'avancée de la préparation, étape par étape (l'installateur, lib/agents/creation.ts). Même données et même
 * sondage que l'ancienne page ; seule la présentation change : le ruban de la conception, l'affiche du projet, le pourcentage sur une
 * ligne et des étapes rondes reliées. Jamais la couleur seule : chaque état a son libellé. `conception` est null pour un projet créé
 * avant la conception (la page n'a alors ni ruban ni affiche). */
export function AvanceeScene({
  projectId,
  nomProjet,
  initial,
  conception,
  style,
}: {
  projectId: number;
  nomProjet: string;
  initial: VueCreation | null;
  conception: Conception | null;
  style: StyleAffiche;
}) {
  const [vue, setVue] = useState<VueCreation | null>(initial);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const enVol = useRef(false);

  const charger = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch(`/api/creation/${projectId}`, { cache: "no-store" });
      if (res.ok) setVue(((await res.json()) as { creation: VueCreation | null }).creation);
    } catch {
      /* serveur qui redémarre : au prochain tour */
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
    ? [conception.format === "serie" ? "Série" : "Film", `${conception.genres.join("/")} · ${motDuTon(conception.ton)}`, minutesSecondes(conception.dureeSecondes), conception.langue, style.nom, "fait", "fait"]
    : [];

  const pct = vue && vue.total ? Math.round((vue.faites / vue.total) * 100) : 0;
  const titre = !vue ? <>Pas encore de <em>préparation</em>.</> : { en_cours: <>La préparation <em>avance</em>.</>, termine: <>Le projet est <em>prêt</em>.</>, echoue: <>La préparation est <em>interrompue</em>.</>, arretee: <>La préparation est <em>arrêtée</em>.</> }[vue.statut];
  const etapeCourante = vue?.etapes.find((e) => e.statut === "en_cours" || e.statut === "echoue");

  return (
    <div className="cn-salle" style={ambiance}>
      <div className="cn-ambiance" aria-hidden="true"><i /><i /></div>
      {conception ? (
        <RubanConception cadres={NOMS_ETAPES.map((nom, i) => ({ nom, resume: i === 7 ? (vue ? `${vue.faites}/${vue.total}` : "") : (resumes[i] ?? ""), etat: i === 7 ? "courant" : "fait" }))} />
      ) : null}

      <div className="cn-scene">
        <EnteteScene
          acte={conception ? "Acte 08" : "Installateur"}
          titre={titre}
          sous="Chaque étape est écrite puis appliquée toute seule. Tu relis ensuite le résultat là où il se trouve (épisodes, registre, plans) et tu retouches ce qui doit l’être."
        />
        <div className="cn-avancee">
          <div className="cn-av-gauche">
            {conception ? <AfficheProjet conception={conception} style={style} titre={nomProjet === "Sans titre" ? "" : nomProjet} /> : null}
            <p className="cn-grand-pct" aria-label={`${pct} pour cent`}>{pct} %</p>
            <p className="cn-av-sous">{vue?.statut === "termine" ? "Préparation terminée" : etapeCourante ? `${etapeCourante.statut === "echoue" ? "En échec" : "En cours"} : ${etapeCourante.libelle}` : vue ? "En attente" : "Rien n’est lancé"}</p>
            {vue ? <p className="cn-av-compte">{vue.faites} / {vue.total} étapes</p> : null}
          </div>

          <div className="cn-av-droite">
            {!vue ? (
              <p className="cn-note" style={{ margin: 0 }}>Aucune préparation pour ce projet. Parle de ton projet au scénariste, puis lance la préparation depuis le clap.</p>
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
                      {e.statut === "en_cours" ? <span className="cn-barre" aria-hidden="true" /> : null}
                      {e.sousTaches.length > 0 ? (
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
              {vue?.statut === "termine" ? <Link href={`/p/${projectId}`} className="btn btn-gold">Voir le projet</Link> : null}
              {conception && !vue ? <Link href={`/p/${projectId}/demarrage`} className="btn btn-gold">Retourner à la conception</Link> : null}
              <span className="cn-note">Tu peux quitter cette page : la préparation continue sur le serveur. Il n’y a pas de point de retour : pour tout défaire, supprime le projet.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
