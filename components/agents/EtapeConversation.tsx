"use client";

import { useEffect, useRef, useState } from "react";
import { envoyerMessage, genererBrief } from "@/app/agents/actions";
import type { ContexteEtape } from "@/components/agents/contexte";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { estTacheActive } from "@/lib/agents-affichage";
import { Icone } from "@/components/ui/Icone";

/** Étape « Conversation » (profondeur complète). Un fil de messages ; chaque tour de l'agent
 * est une tâche de la file. AUCUN cadrage ici (portée, estimation) : il vit au niveau du
 * bouton « Générer la proposition ». Le briefing se remplit au fil de la conversation (fiche de notes tenue par le code) :
 * dès que l'essentiel est dit, un bloc « Briefing prêt » propose d'y passer, sans interdire de continuer à discuter. */
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

  // Le briefing existe dès que la fiche est complète et se met à jour à chaque message ensuite : il est « à jour » quand il date
  // d'après le dernier message de l'utilisateur.
  const dernierMessageAt = [...conv.messages].reverse().find((m) => m.role === "user")?.at ?? "";
  const briefAJour = ctx.brief?.statut === "brouillon" && ctx.brief.updatedAt >= dernierMessageAt;
  const briefExiste = ctx.brief?.statut === "brouillon";

  const versBrief = () => {
    // Un brouillon à jour : on l'ouvre. Sinon (passage en force avant que la fiche soit complète) on fige la fiche telle qu'elle
    // est en brouillon (immédiat, sans modèle), puis on l'ouvre.
    if (briefAJour) {
      ctx.aller("brief");
      return;
    }
    void ctx.lancer(() => genererBrief(conv.uuid), () => ctx.aller("brief"));
  };

  return (
    <div className="ag-etape-corps">
      <div className="ag-fil-messages" role="log" aria-live="polite" aria-label="Conversation avec l'agent">
        {conv.messages.length === 0 ? (
          <p className="ag-vide">
            Donne ton idée à l&rsquo;agent, même en une phrase. Il te posera des questions pour la creuser avec toi : le briefing se
            remplit au fil de la conversation, tu le relis et le corriges ensuite.
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
            J&rsquo;écris le briefing à partir de ta conversation : une à deux minutes. La conversation reprend dès qu&rsquo;il est prêt.
          </p>
          <EtatTacheAgent tache={tache} />
        </>
      ) : null}
      {tache && tache.statut === "echoue" ? <EtatTacheAgent tache={tache} /> : null}

      {conv.briefPret && !actif ? (
        <div className="ag-pret" role="status">
          <div>
            <strong>Briefing prêt</strong>
            <p className="tiny-note">
              Tout l&rsquo;essentiel est dit : le briefing est rempli d&rsquo;après la conversation. Tu peux le relire et passer à la suite, ou
              continuer à discuter pour l&rsquo;affiner : il se met à jour à chaque message.
              {conv.resteADefinir.length > 0 ? ` L'agent a encore ${conv.resteADefinir.length} point${conv.resteADefinir.length > 1 ? "s" : ""} à creuser avec toi, si tu veux.` : ""}
            </p>
          </div>
          <button type="button" className="btn btn-gold" onClick={versBrief} disabled={occupe}>
            Étape suivante : voir le briefing →
          </button>
        </div>
      ) : conv.messages.length > 0 && !actif ? (
        <p className="tiny-note">
          Le briefing n&rsquo;est pas encore complet : l&rsquo;agent creuse ce qu&rsquo;il manque.{" "}
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
          placeholder={conv.messages.length <= 1 ? "Ex. Un phare dont le sel recouvre tout, une gardienne qui ne dort plus…" : "Réponds à l'agent, ou précise ce que tu veux."}
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
