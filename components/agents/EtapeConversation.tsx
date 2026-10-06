"use client";

import { useEffect, useRef, useState } from "react";
import { envoyerMessage, genererBrief } from "@/app/agents/actions";
import type { ContexteEtape } from "@/components/agents/contexte";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { estTacheActive } from "@/lib/agents-affichage";
import { Icone } from "@/components/ui/Icone";

/** Étape « Conversation » (profondeur complète). Un fil de messages ; chaque tour de l'agent
 * est une tâche de la file. AUCUN cadrage ici (portée, estimation) : il vit au niveau du
 * bouton « Générer la proposition ». Quand l'agent estime avoir de quoi écrire le brief, un
 * bloc « Briefing prêt » propose d'y passer. */
export function EtapeConversation({ ctx }: { ctx: ContexteEtape }) {
  const { conv, occupe } = ctx;
  const [texte, setTexte] = useState("");
  const fin = useRef<HTMLDivElement>(null);
  const tache = conv.tache;
  const actif = estTacheActive(tache);
  const tourEnCours = actif && tache?.but === "tour";
  const briefEnCours = actif && tache?.but === "brief";

  // Le fil défile vers le dernier message.
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [conv.messages.length, tourEnCours]);

  const envoyer = () => {
    const t = texte.trim();
    if (!t || occupe || actif) return;
    void ctx.lancer(() => envoyerMessage(conv.uuid, t), () => setTexte(""));
  };

  // Le briefing s'écrit seul en arrière-plan dès que l'agent est prêt, puis se met à jour à l'ouverture : il est « à jour »
  // quand il date d'après le dernier message de l'utilisateur.
  const dernierMessageAt = [...conv.messages].reverse().find((m) => m.role === "user")?.at ?? "";
  const briefAJour = ctx.brief?.statut === "brouillon" && ctx.brief.updatedAt >= dernierMessageAt;
  const briefExiste = ctx.brief?.statut === "brouillon";

  const versBrief = () => {
    // Un brouillon à jour : on l'ouvre. Sinon on le (ré)écrit à partir de la conversation, en partant du brouillon courant.
    if (briefAJour) {
      ctx.aller("brief");
      return;
    }
    void ctx.lancer(() => genererBrief(conv.uuid));
  };

  return (
    <div className="ag-etape-corps">
      <div className="ag-fil-messages" role="log" aria-live="polite" aria-label="Conversation avec l'agent">
        {conv.messages.length === 0 ? (
          <p className="ag-vide">
            Donne ton idée à l&rsquo;agent, même en une phrase. Il te posera des questions pour la creuser avec toi, puis rédigera un
            briefing que tu pourras relire et corriger.
          </p>
        ) : null}
        {conv.messages.map((m, i) => (
          <div key={`${m.at}-${i}`} className={`ag-msg ag-msg-${m.role}`}>
            <span className="ag-msg-qui">{m.role === "user" ? "Toi" : <>Agent <Icone nom="agent" taille={14} /></>}</span>
            <p>{m.content}</p>
          </div>
        ))}
        {tourEnCours ? (
          <div className="ag-msg ag-msg-assistant ag-msg-attente">
            <span className="ag-msg-qui">Agent <Icone nom="agent" taille={14} /></span>
            <EtatTacheAgent tache={tache} />
          </div>
        ) : null}
        <div ref={fin} />
      </div>

      {conv.resteADefinir.length > 0 ? (
        <aside className="ag-reste" aria-label="Ce qu'il reste à définir">
          <p className="ag-reste-titre">
            Ce qu&rsquo;il reste à définir <span className="num">({conv.resteADefinir.length})</span>
          </p>
          <ul>
            {conv.resteADefinir.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="tiny-note">L&rsquo;agent met cette liste à jour à chaque réponse : réponds-lui ici, dans la conversation.</p>
        </aside>
      ) : null}

      {briefEnCours ? (
        <>
          <p className="tiny-note" role="status">
            J&rsquo;écris une première version du briefing à partir de ta conversation : une à deux minutes. La conversation reprend dès qu&rsquo;elle est prête.
          </p>
          <EtatTacheAgent tache={tache} />
        </>
      ) : null}
      {tache && tache.statut === "echoue" ? <EtatTacheAgent tache={tache} /> : null}

      {conv.briefPret && !actif ? (
        <div className="ag-pret" role="status">
          <div>
            <strong>{conv.resteADefinir.length > 0 ? (briefExiste ? "Une première version du briefing est écrite" : "Une première version du briefing est possible") : "Briefing prêt"}</strong>
            <p className="tiny-note">
              {conv.resteADefinir.length > 0
                ? `${briefExiste ? "Le briefing s'est écrit à partir de la conversation et l'agent s'en sert pour creuser." : "L'agent a de quoi écrire une première version du briefing."} Il lui reste ${conv.resteADefinir.length} question${conv.resteADefinir.length > 1 ? "s" : ""} : réponds-y ici, le briefing se met à jour quand tu l'ouvres.`
                : briefExiste
                  ? "Tout est tranché : le briefing se met à jour à l'ouverture. Tu le relis et le valides avant que le projet soit créé."
                  : "Tout est tranché : l'agent peut écrire le briefing définitif. Tu le relis et le valides avant que le projet soit créé."}
            </p>
          </div>
          <button type="button" className="btn btn-gold" onClick={versBrief} disabled={occupe}>
            {briefAJour ? "Voir le briefing →" : briefExiste ? "Mettre à jour et voir le briefing →" : conv.resteADefinir.length > 0 ? "Générer la première version →" : "Générer le briefing →"}
          </button>
        </div>
      ) : conv.messages.length > 0 && !actif ? (
        <p className="tiny-note">
          L&rsquo;agent n&rsquo;a pas encore dit que le briefing est prêt.{" "}
          <button type="button" className="ag-lien" onClick={versBrief} disabled={occupe}>
            {briefExiste ? "Voir le briefing quand même" : "Passer au briefing quand même"}
          </button>
        </p>
      ) : null}

      <div className="ag-saisie">
        <label className="gd-lbl" htmlFor="ag-message">
          Ton message
        </label>
        <textarea
          id="ag-message"
          className="field"
          rows={3}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              envoyer();
            }
          }}
          placeholder={conv.messages.length === 0 ? "Ex. Un phare dont le sel recouvre tout, une gardienne qui ne dort plus…" : "Réponds à l'agent, ou précise ce que tu veux."}
          disabled={actif}
        />
        <div className="gd-row gd-row-between">
          <span className="tiny-note">Ctrl + Entrée pour envoyer.</span>
          <button type="button" className="btn btn-gold" onClick={envoyer} disabled={!texte.trim() || occupe || actif}>
            {occupe ? "…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
