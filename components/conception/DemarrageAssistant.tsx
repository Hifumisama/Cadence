"use client";

import "./conception.css";
import "./demarrage.css";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { lireConversationVue } from "@/app/agents/lecture";
import { estTacheActive } from "@/lib/agents-affichage";
import type { VueConversation } from "@/lib/agents/types";
import type { Conception } from "@/lib/conception";
import { ETAPES_ASSISTANT, minutesSecondes, teinteAmbiance } from "@/lib/conception-ui";
import { motDuTon } from "@/lib/conception";
import { ClapScene, type StyleAffiche } from "./ClapScene";
import { RubanConception } from "./RubanConception";
import { ScenarioScene } from "./ScenarioScene";

/** La suite de la conception, une fois le projet créé : le scénario (entretien avec le scénariste) puis le clap, dans le même ruban de
 * pellicule que les cinq choix (qui sont faits : ils s'affichent en résumé, sans pouvoir être rejoués ici ; le brief reste modifiable
 * depuis la page du projet). La huitième étape, l'avancée de la préparation, est la page de l'installateur. Plan :
 * docs/PLAN_CONCEPTION_PROJET.md. */

const ETAPES = [...ETAPES_ASSISTANT, "Scénario", "Clap", "Avancée"] as const;
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

      <div className={`cn-scene${recule ? " is-recule" : ""}`} key={etape}>
        {etape === SCENARIO ? <ScenarioScene conv={conv} rafraichir={rafraichir} /> : null}
        {etape === CLAP ? <ClapScene projectId={projectId} nomProjet={nomProjet} conception={conception} style={style} notes={conv.notes} pret={pret} /> : null}
      </div>

      <div className="cn-nav">
        <button type="button" className="btn" disabled={etape === SCENARIO} onClick={() => aller(etape - 1)}>Retour à l’entretien</button>
        {etape === SCENARIO ? (
          <button type="button" className="btn btn-gold" disabled={!peutClap} onClick={() => aller(CLAP)}>Voir le clap</button>
        ) : null}
        {etape === SCENARIO && parle && !conv.briefPret && !actif ? <span className="cn-note" style={{ margin: 0 }}>Le scénariste n’a pas tout, mais tu peux passer au clap quand même.</span> : null}
      </div>
    </div>
  );
}
