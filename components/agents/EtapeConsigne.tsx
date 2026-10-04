"use client";

import { useEffect, useMemo, useState } from "react";
import { genererProposition } from "@/app/agents/actions";
import { apercuContexteVue, listerPlansEpisode } from "@/app/agents/lecture";
import { CadrageGeneration } from "@/components/agents/CadrageGeneration";
import { ChoixEpisodes } from "@/components/agents/ChoixEpisodes";
import type { ContexteEtape } from "@/components/agents/contexte";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { estTacheActive, two } from "@/lib/agents-affichage";
import type { CibleDemandee, ContexteUtilise, Position } from "@/lib/agents/types";

const LIBELLE_CONTEXTE: Record<ContexteUtilise["type"], string> = {
  brief: "Brief",
  projet: "Projet",
  saison: "Saison",
  episode: "Épisode",
  plan: "Plan",
  asset: "Asset",
  registre: "Registre",
  voix: "Voix",
};

type ChoixPosition = "debut" | "fin" | `apres:${string}`;

/** Étape « Consigne » (profondeur courte) : une intention en une ligne, le contexte que
 * l'agent lira tout seul (ligne dépliable), et — quand la demande peut créer un plan — la
 * POSITION d'insertion (un champ de la demande, pas un « + » dans la navigation). */
export function EtapeConsigne({ ctx }: { ctx: ContexteEtape }) {
  const { conv, demande, occupe } = ctx;
  const [consigne, setConsigne] = useState(conv.consigne);
  const [contexte, setContexte] = useState<ContexteUtilise[] | null>(null);
  const [plansEpisode, setPlansEpisode] = useState<{ uuid: string; titre: string; rang: number }[]>([]);
  // L'épisode concerné : celui du point d'entrée, ou la cible de la conversation rouverte depuis le header.
  const episodeId = demande.episodeId ?? (conv.portee === "episode" ? conv.cibleId : null);
  const peutInserer = (conv.portee === "episode" || conv.portee === "plan") && episodeId != null;
  // Un épisode se demande de deux façons : écrire son scénario (rien d'autre à préciser) ou y AJOUTER
  // un plan à une position. Par défaut : le scénario d'un épisode encore vide, l'ajout sinon.
  const [mode, setMode] = useState<"scenario" | "plan" | null>(null)
  const [choix, setChoix] = useState<ChoixPosition>(
    conv.portee === "plan" && demande.planUuid ? `apres:${demande.planUuid}` : "fin",
  );

  const cible: CibleDemandee | null = demande.cible ?? (conv.cibleId != null ? { id: conv.cibleId } : null);

  useEffect(() => {
    let annule = false;
    apercuContexteVue(conv.projectId, conv.portee, cible)
      .then((c) => {
        if (!annule) setContexte(c);
      })
      .catch(() => {
        if (!annule) setContexte([]);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.projectId, conv.portee, conv.cibleId]);

  useEffect(() => {
    if (!peutInserer || episodeId == null) return;
    let annule = false;
    listerPlansEpisode(episodeId)
      .then((p) => {
        if (!annule) setPlansEpisode(p);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [peutInserer, episodeId]);

  const modeEffectif: "scenario" | "plan" = conv.portee === "episode" ? (mode ?? (plansEpisode.length === 0 ? "scenario" : "plan")) : "plan";
  const position = useMemo<Position | undefined>(() => {
    if (!peutInserer || modeEffectif !== "plan") return undefined;
    if (choix === "debut") return { debut: true };
    if (choix === "fin") return { fin: true };
    return { apresPlanUuid: choix.slice("apres:".length) };
  }, [choix, peutInserer, modeEffectif]);

  const actif = estTacheActive(conv.tache) || estTacheActive(ctx.prop?.tache);
  const propositionEnCours = ctx.prop != null && ctx.prop.statut !== "rejetee";

  const scenarioEpisode = conv.portee === "episode" && modeEffectif === "scenario";
  const generer = () => {
    const c = consigne.trim();
    if ((!c && !scenarioEpisode) || occupe || actif) return;
    void ctx.lancer(() => genererProposition(conv.uuid, { consigne: c || undefined, position }));
  };

  // Depuis le projet ou une saison : écrire les scénarios de plusieurs épisodes d'un coup (un lot).
  if (conv.portee === "projet" || conv.portee === "saison") {
    return (
      <>
        <ChoixEpisodes ctx={ctx} saisonId={conv.portee === "saison" ? conv.cibleId : null} />
        <div className="ag-etape-corps">
          <EtatTacheAgent tache={conv.tache} />
        </div>
      </>
    );
  }

  return (
    <div className="ag-etape-corps">
      {conv.portee === "episode" ? (
        <div className="gd-grp">
          <span className="gd-lbl">Que veux-tu ?</span>
          <div className="gd-seg" role="group" aria-label="Type de demande">
            <button type="button" aria-pressed={modeEffectif === "scenario"} onClick={() => setMode("scenario")} disabled={actif}>
              Écrire le scénario
              <small>scènes, plans, répliques</small>
            </button>
            <button type="button" aria-pressed={modeEffectif === "plan"} onClick={() => setMode("plan")} disabled={actif}>
              Ajouter un plan
              <small>à une position</small>
            </button>
          </div>
          {modeEffectif === "scenario" && plansEpisode.length > 0 ? (
            <p className="tiny-note">Cet épisode a déjà {plansEpisode.length} plan{plansEpisode.length > 1 ? "s" : ""} : les modifications iront en section « risque d&rsquo;écrasement », les plans nouveaux s&rsquo;ajoutent à la fin ; rien n&rsquo;est supprimé.</p>
          ) : null}
        </div>
      ) : null}

      <div className="gd-grp">
        <label className="gd-lbl" htmlFor="ag-consigne">
          {scenarioEpisode ? "Ta demande (facultatif)" : "Ta demande"}
        </label>
        <textarea
          id="ag-consigne"
          className="field"
          rows={4}
          value={consigne}
          onChange={(e) => setConsigne(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              generer();
            }
          }}
          placeholder={scenarioEpisode ? "Ex. Garde un rythme lent ; pas plus de deux répliques par plan." : "Ex. Regard plus dur, cheveux courts. Ou : ajoute un plan où elle découvre la lampe éteinte."}
          disabled={actif}
        />
        <p className="tiny-note">{scenarioEpisode ? "Sans consigne, l'agent écrit le scénario complet de l'épisode." : "Une phrase suffit : l'agent lit le contexte tout seul."} Ctrl + Entrée pour lancer.</p>
      </div>

      <details className="ag-contexte">
        <summary>
          Contexte utilisé <span className="num">({contexte == null ? "…" : contexte.length})</span>
        </summary>
        {contexte && contexte.length > 0 ? (
          <ul>
            {contexte.map((c, i) => (
              <li key={`${c.type}-${c.ref ?? i}`}>
                <span className="ag-contexte-type">{LIBELLE_CONTEXTE[c.type]}</span> {c.libelle}
              </li>
            ))}
          </ul>
        ) : (
          <p className="tiny-note">{contexte == null ? "Lecture du contexte…" : "L'agent ne lira rien d'autre que ta demande."}</p>
        )}
      </details>

      {peutInserer && modeEffectif === "plan" ? (
        <div className="gd-grp">
          <label className="gd-lbl" htmlFor="ag-position">
            Position d&rsquo;un nouveau plan
          </label>
          <select id="ag-position" className="field" value={choix} onChange={(e) => setChoix(e.target.value as ChoixPosition)} disabled={actif}>
            <option value="debut">Au début de l&rsquo;épisode</option>
            {plansEpisode.map((p) => (
              <option key={p.uuid} value={`apres:${p.uuid}`}>
                Après le plan {two(p.rang)} · {p.titre}
              </option>
            ))}
            <option value="fin">À la fin de l&rsquo;épisode</option>
          </select>
          <p className="tiny-note">Ne sert que si ta demande ajoute un plan. Les plans suivants changent de rang : la revue te le montre.</p>
        </div>
      ) : null}

      {propositionEnCours ? (
        <p className="tiny-note">
          Une proposition existe déjà pour cette demande.{" "}
          <button type="button" className="ag-lien" onClick={() => ctx.aller("proposition")}>
            La voir
          </button>
        </p>
      ) : null}

      <EtatTacheAgent tache={conv.tache} />

      <div className="ag-lancer">
        <CadrageGeneration conversationUuid={conv.uuid} libelle={conv.cibleLibelle} rafraichissement={conv.tache?.statut} />
        <button type="button" className="btn btn-gold" onClick={generer} disabled={(!consigne.trim() && !scenarioEpisode) || occupe || actif}>
          {occupe ? "…" : scenarioEpisode ? "Écrire le scénario" : "Générer la proposition"}
        </button>
      </div>
    </div>
  );
}
