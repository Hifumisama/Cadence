"use client";

import { useEffect, useRef, useState } from "react";
import { envoyerMessage, relancerAccroche } from "@/app/agents/actions";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { estTacheActive } from "@/lib/agents-affichage";
import type { NoteAffichee } from "@/lib/agents/fiche-affichage";
import type { VueConversation } from "@/lib/agents/types";
import { EnteteScene } from "./Scenes";

/** Scène « Scénario » : l'entretien avec le scénariste. Le moteur est celui de l'entretien d'entrée existant (fiche de notes tenue par le
 * code, un tour de l'agent = une tâche de la file) ; seule la présentation change : un fil de messages, et à côté la fiche de notes, qui se
 * remplit au fil de la conversation et dont chaque note longue se déplie. Ce que la conception a déjà posé n'y figure pas. */
export function ScenarioScene({ conv, rafraichir }: { conv: VueConversation; rafraichir: () => Promise<void> }) {
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>({});
  const fin = useRef<HTMLDivElement>(null);
  const tache = conv.tache;
  const actif = estTacheActive(tache);
  const tourEnCours = actif && tache?.but === "tour";
  const dejaCommence = conv.messages.some((m) => m.role === "user");

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [conv.messages.length, tourEnCours, tache?.fluxTexte]);

  const envoyer = async () => {
    const t = texte.trim();
    if (!t || occupe || actif) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await envoyerMessage(conv.uuid, t);
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

  /** L'accroche n'a pas pu s'écrire (modèle injoignable, sortie refusée) : la conversation est vide, on la relance. */
  const relancer = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      const r = await relancerAccroche(conv.uuid);
      if (!r.ok) setErreur(r.erreur);
      await rafraichir();
    } finally {
      setOccupe(false);
    }
  };

  const manque = conv.notes.filter((n) => n.requis && n.statut === "absent").length;

  return (
    <>
      <EnteteScene acte="Acte 06" titre={<>Raconte-moi l’<em>histoire</em>.</>} sous="Le cadre est posé. Reste l’essentiel : ce que tu veux raconter. Réponds comme tu le sens, même en vrac : le scénariste s’occupe du reste." />
      <div className="cn-entretien">
        <div className="cn-chat">
          <div className="cn-agent-tete">
            <span className="cn-monogramme" aria-hidden="true">S</span>
            <div><b>Votre scénariste</b><span>écrit avec vous, une question à la fois</span></div>
          </div>
          <div className="cn-fil" role="log" aria-live="polite" aria-label="Conversation avec le scénariste">
            {conv.messages.map((m, i) => (
              <p key={`${m.at}-${i}`} className={`cn-msg ${m.role === "user" ? "is-moi" : "is-agent"}`}>{m.content}</p>
            ))}
            {tourEnCours ? <div className="cn-msg-attente"><EtatTacheAgent tache={tache} /></div> : null}
            {tache && tache.statut === "echoue" ? <div className="cn-msg-attente"><EtatTacheAgent tache={tache} /></div> : null}
            {conv.messages.length === 0 && !actif ? (
              <p className="cn-msg is-agent">Le scénariste n’a pas pu se présenter. <button type="button" className="cn-lien" disabled={occupe} onClick={() => void relancer()}>Réessayer</button></p>
            ) : null}
            <div ref={fin} />
          </div>
          <div className="cn-saisie">
            <textarea
              rows={3}
              value={texte}
              disabled={actif}
              aria-label="Ta réponse"
              placeholder={dejaCommence ? "Réponds au scénariste, ou précise ce que tu veux." : "Ex. Une cartographe retrouve la carte de son père, qui dessine une ville qui n’existe pas encore…"}
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void envoyer();
                }
              }}
            />
            <div className="cn-saisie-bas">
              <span className="cn-note" style={{ margin: 0 }}>Entrée pour envoyer, Maj + Entrée pour un retour à la ligne.</span>
              <button type="button" className="btn btn-gold" disabled={!texte.trim() || occupe || actif} onClick={() => void envoyer()}>{occupe ? "…" : "Envoyer"}</button>
            </div>
            {erreur ? <p className="cn-erreur" role="alert">{erreur}</p> : null}
          </div>
        </div>

        <aside className="cn-fiche" aria-label="Fiche de notes">
          <h2>Fiche de notes</h2>
          <ol className="cn-notes">
            {conv.notes.map((n, k) => (
              <Note
                key={n.cle}
                note={n}
                courante={n.requis && n.statut === "absent" && conv.notes.findIndex((x) => x.requis && x.statut === "absent") === k}
                ouverte={!!ouvertes[n.cle]}
                bascule={() => setOuvertes((o) => ({ ...o, [n.cle]: !o[n.cle] }))}
              />
            ))}
          </ol>
          {conv.resteADefinir.length > 0 ? (
            <>
              <p className="cn-fiche-pied" style={{ marginBottom: 4 }}>Le scénariste veut encore creuser :</p>
              <ul className="cn-reste">{conv.resteADefinir.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          ) : null}
          {conv.briefPret && !actif ? (
            <div className="cn-pret" role="status">
              <b>Le scénariste a l’essentiel.</b>
              <span>Tu peux voir le clap, ou continuer à discuter pour affiner : les notes se mettent à jour à chaque message.</span>
            </div>
          ) : (
            <p className="cn-fiche-pied">{dejaCommence ? (manque ? `Il reste ${manque} sujet${manque > 1 ? "s" : ""} à aborder.` : "Le scénariste vérifie les derniers points.") : "Ce que le scénariste retient apparaît ici, en direct. Rien n’est figé : tout se corrige ensuite."}</p>
          )}
        </aside>
      </div>
    </>
  );
}

function Note({ note, courante, ouverte, bascule }: { note: NoteAffichee; courante: boolean; ouverte: boolean; bascule: () => void }) {
  const long = note.texte.length > 80 || note.texte.includes("\n");
  const classe = note.statut !== "absent" ? "is-fait" : courante ? "is-courant" : "";
  return (
    <li className={`${classe}${note.requis ? "" : " is-extra"}`.trim()}>
      <b>{note.libelle}</b>
      <span className={long && !ouverte ? "is-court" : ""}>{note.texte || (courante ? "en cours…" : "à venir")}</span>
      {long ? <button type="button" className="cn-lien" aria-expanded={ouverte} onClick={bascule}>{ouverte ? "Réduire" : "Tout lire"}</button> : null}
    </li>
  );
}
