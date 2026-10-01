"use client";

import { useEffect, useRef, useState } from "react";
import { envoyerMessage, genererBrief } from "@/app/agents/actions";
import type { ContexteEtape } from "@/components/agents/contexte";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { estTacheActive } from "@/lib/agents-affichage";

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

  const versBrief = () => {
    // Un brouillon existe déjà et l'étape l'a atteint : on y retourne sans le régénérer.
    if (ctx.brief && conv.etape !== "conversation") {
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
            Décris ton projet à l&rsquo;agent : l&rsquo;idée, le ton, les personnages, ce que tu veux éviter. Il te posera quelques
            questions, puis rédigera un briefing que tu pourras relire et corriger.
          </p>
        ) : null}
        {conv.messages.map((m, i) => (
          <div key={`${m.at}-${i}`} className={`ag-msg ag-msg-${m.role}`}>
            <span className="ag-msg-qui">{m.role === "user" ? "Toi" : "Agent ✦"}</span>
            <p>{m.content}</p>
          </div>
        ))}
        {tourEnCours ? (
          <div className="ag-msg ag-msg-assistant ag-msg-attente">
            <span className="ag-msg-qui">Agent ✦</span>
            <EtatTacheAgent tache={tache} />
          </div>
        ) : null}
        <div ref={fin} />
      </div>

      {briefEnCours ? <EtatTacheAgent tache={tache} /> : null}
      {tache && tache.statut === "echoue" ? <EtatTacheAgent tache={tache} /> : null}

      {conv.briefPret && !actif ? (
        <div className="ag-pret" role="status">
          <div>
            <strong>Briefing prêt</strong>
            <p className="tiny-note">L&rsquo;agent a de quoi écrire le brief de ce projet. Tu pourras le relire et le corriger avant d&rsquo;aller plus loin.</p>
          </div>
          <button type="button" className="btn btn-gold" onClick={versBrief} disabled={occupe}>
            Vers le briefing →
          </button>
        </div>
      ) : conv.messages.length > 0 && !actif ? (
        <p className="tiny-note">
          L&rsquo;agent n&rsquo;a pas encore dit que le briefing est prêt.{" "}
          <button type="button" className="ag-lien" onClick={versBrief} disabled={occupe}>
            Passer au briefing quand même
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
