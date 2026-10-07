"use client";

import "./conception.css";
import "./demarrage.css";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { lireConversationVue } from "@/app/agents/lecture";
import { estTacheActive } from "@/lib/agents-affichage";
import type { VueConversation } from "@/lib/agents/types";
import type { Conception } from "@/lib/conception";
import { ETAPES_CONCEPTION, minutesSecondes, teinteAmbiance } from "@/lib/conception-ui";
import { motDuTon } from "@/lib/conception";
import { lireAfficheClap, preparerAfficheClap } from "@/app/affiches/clap-actions";
import { ClapScene, type AfficheEtat, type StyleAffiche } from "./ClapScene";
import { RubanConception } from "./RubanConception";
import { ScenarioScene } from "./ScenarioScene";

/** La suite de la conception, une fois le projet créé : le scénario (entretien avec le scénariste) puis le clap, dans le même ruban de
 * pellicule que les cinq choix (qui sont faits : ils s'affichent en résumé, sans pouvoir être rejoués ici ; le brief reste modifiable
 * depuis la page du projet). La huitième étape, l'avancée de la préparation, est la page de l'installateur. Plan :
 * docs/PLAN_CONCEPTION_PROJET.md. */

const ETAPES = ETAPES_CONCEPTION;
const SCENARIO = 5;
const CLAP = 6;

function resumesFaits(c: Conception, nomStyle: string): string[] {
  return [c.format === "serie" ? "Série" : "Film", `${c.genres.join("/")} · ${motDuTon(c.ton)}`, minutesSecondes(c.dureeSecondes), c.langue, nomStyle];
}

export function DemarrageAssistant({
  projectId,
  nomProjet,
  convInitiale,
  conception,
  style,
}: {
  projectId: number;
  nomProjet: string;
  convInitiale: VueConversation;
  conception: Conception;
  style: StyleAffiche;
}) {
  const [conv, setConv] = useState(convInitiale);
  const [etape, setEtape] = useState(SCENARIO);
  const [recule, setRecule] = useState(false);
  const [affiche, setAffiche] = useState<AfficheEtat | null>(null);

  const rafraichir = useCallback(async () => {
    try {
      const c = await lireConversationVue(convInitiale.uuid);
      if (c) setConv(c);
    } catch {
      /* le serveur redémarre : au prochain tour */
    }
  }, [convInitiale.uuid]);

  // Tant qu'un tour du scénariste tourne, on relit l'état ; sinon on se repose.
  const actif = estTacheActive(conv.tache);
  useEffect(() => {
    if (!actif) return;
    const t = setInterval(() => void rafraichir(), 2000);
    return () => clearInterval(t);
  }, [actif, rafraichir]);

  // Le clap lit la fiche à jour : au retour sur l'onglet, une relecture.
  useEffect(() => {
    const focus = () => void rafraichir();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [rafraichir]);

  const parle = conv.messages.some((m) => m.role === "user");
  const pret = parle; // arriver au clap vaut accord : l'installateur part de ce qui a été dit
  const peutClap = parle && !actif;
  const aller = (i: number) => {
    if (i < SCENARIO || i > CLAP || i === etape || (i === CLAP && !peutClap)) return;
    setRecule(i < etape);
    setEtape(i);
  };

  // L'affiche : préparée à l'ARRIVÉE sur le clap (pas avant), et refaite seulement si ce qui la nourrit a changé depuis la dernière fois
  // (le serveur compare l'empreinte). Un aller-retour sans rien changer ne relance rien.
  const preparer = useCallback(
    (force: boolean) => {
      preparerAfficheClap(projectId, force).then(setAffiche).catch(() => setAffiche({ etat: "echec", src: null }));
    },
    [projectId],
  );
  useEffect(() => {
    if (etape === CLAP) preparer(false);
  }, [etape, preparer]);
  const afficheEnCours = affiche?.etat === "en_cours";
  useEffect(() => {
    if (!afficheEnCours) return;
    const t = setInterval(() => lireAfficheClap(projectId).then(setAffiche).catch(() => undefined), 2500);
    return () => clearInterval(t);
  }, [afficheEnCours, projectId]);

  const resumes = useMemo(() => resumesFaits(conception, style.nom), [conception, style.nom]);
  const ambiance = useMemo(
    () => ({ "--cn-hue": teinteAmbiance(conception.genres), "--cn-lum": (1 - conception.ton / 100).toFixed(2) }) as CSSProperties,
    [conception.genres, conception.ton],
  );

  return (
    <div className="cn-salle" style={ambiance}>
      <div className="cn-ambiance" aria-hidden="true"><i /><i /></div>
      <RubanConception
        cadres={ETAPES.map((nom, i) => ({
          nom,
          resume: i < SCENARIO ? (resumes[i] ?? "") : i === SCENARIO && parle ? "en cours" : "",
          etat: i < SCENARIO ? "fait" : i === etape ? "courant" : i > CLAP ? "futur" : "actif",
          onClick: i === SCENARIO || (i === CLAP && peutClap) ? () => aller(i) : undefined,
        }))}
      />

      <div className="cn-barre" role="group" aria-label="Avancer dans la conception">
        {etape === CLAP ? <button type="button" className="btn" onClick={() => aller(SCENARIO)}>← Retour à l’entretien</button> : null}
        <span className="cn-barre-texte" aria-live="polite">
          {etape === CLAP ? (
            <>Relis la planche, donne un titre, puis <b>lance la préparation</b> en bas de page.</>
          ) : !parle ? (
            <>Raconte ton histoire au scénariste : <b>le clap s’ouvrira ensuite</b>.</>
          ) : actif ? (
            <>Le scénariste écrit… <b>le clap t’attend juste après</b>.</>
          ) : conv.briefPret ? (
            <><b>Le scénariste a l’essentiel</b> : le clap t’attend.</>
          ) : (
            <>Il manque encore quelques points, mais <b>tu peux passer au clap</b> quand tu veux.</>
          )}
        </span>
        {etape === SCENARIO ? (
          <button type="button" className="btn btn-gold cn-clap" disabled={!peutClap} onClick={() => aller(CLAP)}>Voir le clap →</button>
        ) : null}
      </div>

      <div className={`cn-scene${recule ? " is-recule" : ""}`} key={etape}>
        {etape === SCENARIO ? <ScenarioScene conv={conv} rafraichir={rafraichir} /> : null}
        {etape === CLAP ? <ClapScene projectId={projectId} nomProjet={nomProjet} conception={conception} style={style} notes={conv.notes} pret={pret} affiche={affiche} reessayer={() => preparer(true)} /> : null}
      </div>

    </div>
  );
}
