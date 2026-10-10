"use client";

import "../conception/conception.css";
import "../conception/demarrage.css";
import "./revision.css";
import { useRouter } from "next/navigation";
import { useDefilementBas } from "@/components/ui/useDefilementBas";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  abandonnerRevisionAction,
  annulerRendusDuPlanAction,
  appliquerRevisionAction,
  envoyerMessageRevisionAction,
  lireVueRevisionAction,
  ouvrirRevisionAction,
  reconfirmerDecisionAction,
  relancerTourRevisionAction,
  retirerDecisionAction,
} from "@/app/revision/actions";
import { useAgents } from "@/components/agents/AgentsProvider";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { Glissiere } from "@/components/conception/Glissiere";
import { estTacheActive } from "@/lib/agents-affichage";
import { resumerChantier, type Segment } from "@/lib/agents/revision/affichage";
import { fmtDuree } from "@/lib/agents/revision/format";
import type { EtatRevision } from "@/lib/agents/revision/revision-db";
import type { EtatTache } from "@/lib/agents/types";
import { FicheDecisions } from "./FicheDecisions";

type Vue = { etat: EtatRevision; tache: EtatTache | null };

const AMBIANCE = { "--cn-hue": 42, "--cn-lum": 0.5 } as CSSProperties;

function Phrase({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.fort || s.rouge ? (
          <b key={i} className={s.rouge ? "rv-rouge" : undefined}>
            {s.t}
          </b>
        ) : (
          <span key={i}>{s.t}</span>
        ),
      )}
    </>
  );
}

/** La salle du réalisateur : la conversation libre d'un épisode (à gauche), la fiche des décisions (à droite, dès la première décision), la
 * barre du bas avec la glissière « Action ! ». Le serveur fait foi : l'écran relit l'état toutes les 2 s tant qu'une tâche (analyse, puis
 * réponse) est active, et au retour de focus. Ce que l'utilisateur tape n'est jamais touché par un rafraîchissement. Maquette :
 * docs/maquettes/revision-episode.html ; décisions : docs/FRICTIONS.md, 2026-10-09 (révision d'épisode). */
export function SalleRevision({
  projectId,
  episodeId,
  numeroEpisode,
  titreEpisode,
  initial,
  amorce,
  planCible,
}: {
  projectId: number;
  episodeId: number;
  numeroEpisode: number;
  titreEpisode: string;
  initial: Vue;
  /** Début de message proposé (venu d'un plan : « À propos du plan 07 … »), jamais envoyé tout seul. */
  amorce: string;
  /** Le plan d'où l'on vient (uuid), ou null : on y revient une fois le chantier appliqué, sauf s'il a été supprimé. */
  planCible: string | null;
}) {
  const router = useRouter();
  const { ouvrirAgent } = useAgents();
  const [vue, setVue] = useState<Vue>(initial);
  const [uuid, setUuid] = useState(initial.etat.conversationUuid);
  const [texte, setTexte] = useState(amorce);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [appliquant, setAppliquant] = useState(false);
  const sequence = useRef(0);
  const fin = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLTextAreaElement>(null);

  const { etat, tache } = vue;
  const actif = estTacheActive(tache);
  const ouverte = etat.ouverte;
  const aDesDecisions = etat.decisions.length > 0 || etat.appliquees.length > 0;
  const dernier = etat.messages.at(-1);

  const rafraichir = useCallback(
    async (cible?: string) => {
      const n = ++sequence.current;
      try {
        const v = await lireVueRevisionAction(cible ?? uuid);
        if (v && n === sequence.current) setVue(v);
      } catch {
        /* le serveur redémarre : au prochain tour */
      }
    },
    [uuid],
  );

  // Un rendu à annuler se libère quand le worker s'arrête : on relit tant qu'une décision attend cela.
  const attendRendu = etat.ouverte && etat.decisions.some((d) => d.rendusActifs.length > 0);
  useEffect(() => {
    if (!actif && !attendRendu) return;
    const t = setInterval(() => void rafraichir(), 2000);
    return () => clearInterval(t);
  }, [actif, attendRendu, rafraichir]);

  useEffect(() => {
    const focus = () => void rafraichir();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [rafraichir]);

  useDefilementBas(fin, `${actif}${tache?.fluxTexte ?? ""}`, etat.messages.length);

  // Une amorce venue d'un plan place le curseur au bout, prête à continuer la phrase.
  useEffect(() => {
    if (amorce && saisie.current) {
      saisie.current.focus();
      saisie.current.setSelectionRange(amorce.length, amorce.length);
    }
  }, [amorce]);

  const resume = useMemo(
    () =>
      resumerChantier(
        etat.decisions.map((d) => ({ id: d.id, statut: d.statut, aReverifier: d.aReverifier, operations: d.operations, ecrasements: d.ecrasements })),
        etat.duree.avecBrouillon,
        etat.duree.objectif,
      ),
    [etat.decisions, etat.duree.avecBrouillon, etat.duree.objectif],
  );

  const envoyer = async () => {
    const t = texte.trim();
    if (!t || occupe || actif || !ouverte) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await envoyerMessageRevisionAction(uuid, t);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setTexte("");
      await rafraichir();
    } catch {
      setErreur("Le message n’a pas pu être envoyé.");
    } finally {
      setOccupe(false);
    }
  };

  const agir = async (action: () => Promise<{ ok: boolean; erreur?: string }>) => {
    setOccupe(true);
    setErreur(null);
    try {
      const r = await action();
      if (!r.ok) setErreur(r.erreur ?? "L’action a échoué.");
      await rafraichir();
    } catch {
      setErreur("L’action n’a pas pu aboutir.");
    } finally {
      setOccupe(false);
    }
  };

  const appliquer = async () => {
    if (appliquant) return;
    setAppliquant(true);
    setErreur(null);
    try {
      // La glissière rouge VAUT confirmation d'écrasement : la barre a dit, juste avant, ce qui serait écrasé.
      const supprime = etat.decisions.some((d) => d.operations.some((o) => o.type === "couper_plan" && o.planUuid === planCible));
      const r = await appliquerRevisionAction(uuid, resume.danger);
      if (!r.ok) {
        setErreur(r.erreur);
        await rafraichir();
        return;
      }
      // La conversation est close : on retourne là d'où l'on vient (le plan, s'il existe encore ; sinon le scénario de l'épisode).
      if (r.suite?.erreur) {
        // Le chantier est appliqué ; seule la réécriture des fiches n'a pas pu être lancée : on le dit et on reste ici.
        setErreur(`Chantier appliqué, mais la réécriture des fiches n'a pas pu être lancée : ${r.suite.erreur}`);
        await rafraichir();
        router.refresh();
        return;
      }
      router.push(planCible && !supprime ? `/p/${projectId}/e/${episodeId}/plans/${planCible}` : `/p/${projectId}/e/${episodeId}/scenario`);
      // Des fiches à relire : la popup des agents (globale) reprend la conversation de l'épisode, où le lot de fiches attend d'être relu.
      if (r.suite) ouvrirAgent({ projectId, portee: "episode", cible: { id: episodeId }, episodeId, libelle: `Épisode ${numeroEpisode} · ${titreEpisode}` });
    } catch {
      setErreur("L’application a échoué.");
    } finally {
      setAppliquant(false);
    }
  };

  const nouvelle = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      const r = await ouvrirRevisionAction(projectId, episodeId);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setUuid(r.conversationUuid);
      setTexte("");
      await rafraichir(r.conversationUuid);
      router.refresh();
    } finally {
      setOccupe(false);
    }
  };

  const acte = `Épisode ${String(numeroEpisode).padStart(2, "0")} · ${titreEpisode} · ${fmtDuree(etat.duree.actuelle)}${etat.duree.objectif != null ? ` · visé ${fmtDuree(etat.duree.objectif)}` : ""}`;

  return (
    <div className="cn-salle" style={AMBIANCE}>
      <div className="cn-ambiance" aria-hidden="true">
        <i />
        <i />
      </div>

      <div className="cn-scene rv-scene-page">
        <p className="cn-acte">{acte}</p>
        <h1 className="cn-titre">
          Discute avec le <em>réalisateur</em>
        </h1>
        <p className="cn-sous">
          Dis-lui ce qui ne va pas, ou ce que tu veux changer, comme tu le dirais à quelqu’un. Il vérifie la cohérence avant de toucher à quoi que ce soit, et rien n’est écrit tant que tu n’as pas glissé pour appliquer.
        </p>

        <div className={`cn-entretien rv-entretien${aDesDecisions ? " avec" : ""}`}>
          <section className="cn-chat" aria-label="Conversation avec le réalisateur">
            <div className="cn-agent-tete">
              <span className="cn-monogramme" aria-hidden="true">
                R
              </span>
              <div>
                <b>Le réalisateur</b>
                <span>il voit l’épisode et le brouillon</span>
              </div>
            </div>
            <div className="cn-fil" role="log" aria-live="polite" aria-label="Conversation avec le réalisateur">
              {etat.messages.map((m, i) => (
                <p key={`${m.at}-${i}`} className={`cn-msg ${m.role === "user" ? "is-moi" : "is-agent"}`}>
                  {m.content}
                </p>
              ))}
              {actif ? (
                <div className="cn-msg-attente">
                  <EtatTacheAgent tache={tache} />
                </div>
              ) : null}
              {!actif && ouverte && dernier?.role === "user" ? (
                <div className="cn-msg-attente">
                  {tache && (tache.statut === "echoue" || tache.statut === "annulee") ? <EtatTacheAgent tache={tache} /> : <span>Le réalisateur n’a pas répondu.</span>}{" "}
                  <button type="button" className="cn-lien" disabled={occupe} onClick={() => void agir(() => relancerTourRevisionAction(uuid))}>
                    Réessayer
                  </button>
                </div>
              ) : null}
              <div ref={fin} />
            </div>

            {ouverte ? (
              <div className="cn-saisie">
                <textarea
                  ref={saisie}
                  rows={3}
                  value={texte}
                  disabled={actif}
                  aria-label="Ton message au réalisateur"
                  placeholder="Dis-lui ce que tu ressens, ou ce que tu veux changer."
                  onChange={(e) => setTexte(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void envoyer();
                    }
                  }}
                />
                <div className="cn-saisie-bas">
                  <span className="cn-note" style={{ margin: 0 }}>
                    Entrée pour envoyer, Maj + Entrée pour un retour à la ligne.
                  </span>
                  {aDesDecisions ? (
                    <button type="button" className="cn-lien is-sobre" disabled={occupe || actif} onClick={() => void agir(() => abandonnerRevisionAction(uuid))}>
                      Abandonner le brouillon
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-gold" disabled={!texte.trim() || occupe || actif} onClick={() => void envoyer()}>
                    {occupe ? "…" : "Envoyer"}
                  </button>
                </div>
                {erreur ? (
                  <p className="cn-erreur" role="alert">
                    {erreur}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="cn-saisie rv-ferme">
                <b>Conversation terminée</b>
                <span>Le chantier est appliqué. Une prochaine révision ouvrira une conversation neuve, à partir de l’épisode tel qu’il est maintenant.</span>
                <button type="button" className="btn btn-gold" disabled={occupe} onClick={() => void nouvelle()}>
                  Nouvelle révision
                </button>
                {erreur ? (
                  <p className="cn-erreur" role="alert">
                    {erreur}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {aDesDecisions ? (
            <FicheDecisions
              etat={etat}
              occupe={occupe || actif}
              onRetirer={(d) => void agir(() => retirerDecisionAction(uuid, d))}
              onRelu={(d) => void agir(() => reconfirmerDecisionAction(uuid, d))}
              onAnnulerRendu={(p) => void agir(() => annulerRendusDuPlanAction(uuid, p))}
            />
          ) : null}
        </div>

        {etat.pistes.length > 0 && ouverte && !actif ? (
          <p className="cn-note rv-pistes-note">
            {etat.pistes.length} piste{etat.pistes.length > 1 ? "s" : ""} en attente de ton choix : dis laquelle garder, ou combine-les.
          </p>
        ) : null}
      </div>

      <div className="cn-barre" role="group" aria-label="Appliquer le chantier">
        <span className="cn-barre-texte" aria-live="polite">
          {ouverte ? (
            <Phrase segments={resume.segments} />
          ) : (
            <>
              <b>Chantier appliqué.</b> Cette conversation est terminée.
            </>
          )}
        </span>
        {ouverte ? (
          <Glissiere
            libelle={resume.danger ? "Glisse : écraser et appliquer" : "Glisse pour appliquer"}
            action
            danger={resume.danger && !resume.inerte && !actif}
            desactive={resume.inerte || actif}
            occupe={appliquant}
            onValider={() => void appliquer()}
          />
        ) : (
          <button type="button" className="btn btn-gold" disabled={occupe} onClick={() => void nouvelle()}>
            Nouvelle révision
          </button>
        )}
      </div>
    </div>
  );
}
