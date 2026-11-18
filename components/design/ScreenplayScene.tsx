"use client";

import { Fragment, useId, useRef, useState } from "react";
import { envoyerMessage, relancerAccroche, repondreAuChoix } from "@/app/agents/actions";
import { EtatTacheAgent } from "@/components/agents/AgentTaskState";
import { estTacheActive } from "@/lib/agents/agents-display";
import { estDecider } from "@/lib/agents/choice";
import { MESSAGE_VALIDER_SEQUENCE, etatSequence } from "@/lib/agents/chat-sequence";
import type { NoteAffichee } from "@/lib/agents/sheet-display";
import type { Choix, VueConversation } from "@/lib/agents/types";
import { useDefilementBas } from "@/components/ui/useScrollToBottom";
import { EnteteScene } from "./Scenes";
import { ChatSequence } from "./ChatSequence";
import { FilmSynopsis } from "./FilmSynopsis";

/** « Scénario » scene: the interview with the screenwriter. The engine is that of the existing intake interview (notes sheet kept by the
 * code, one turn of the agent = one task in the queue); only the presentation changes: a thread of messages, and beside it the notes sheet, which
 * fills in as the conversation goes on and whose long notes each expand. What the design has already set does not appear there. */
export function ScenarioScene({ conv, rafraichir }: { conv: VueConversation; rafraichir: () => Promise<void> }) {
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLTextAreaElement>(null);
  const tache = conv.tache;
  const actif = estTacheActive(tache);
  const tourEnCours = actif && tache?.but === "tour";
  const dejaCommence = conv.messages.some((m) => m.role === "user");

  // Follows the stream without pulling the scroll away from whoever has scrolled up to read.
  useDefilementBas(fin, `${tourEnCours}${tache?.fluxTexte ?? ""}`, conv.messages.length);

  /** One reply per card: same path as free text (one turn of the agent), the server formulates the message. */
  const repondre = async (libelles: string[]) => {
    if (occupe || actif) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await repondreAuChoix(conv.uuid, libelles);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      await rafraichir();
    } catch {
      setErreur("La réponse n’a pas pu être envoyée.");
    } finally {
      setOccupe(false);
    }
  };

  const envoyer = async (impose?: string) => {
    const t = (impose ?? texte).trim();
    if (!t || occupe || actif) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await envoyerMessage(conv.uuid, t);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      if (impose === undefined) setTexte("");
      await rafraichir();
    } catch {
      setErreur("Le message n’a pas pu être envoyé.");
    } finally {
      setOccupe(false);
    }
  };

  /** The hook could not be written (model unreachable, output refused): the conversation is empty, so we relaunch it. */
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
  // The proposed sequences: the last card is the live one; the notes tell whether it was validated (lib/agents/chat-sequence.ts).
  const derniereSequence = conv.messages.reduce((k, m, i) => (m.sequence ? i : k), -1);
  const sequenceNotes = { moments: conv.synopsis?.sequence.moments.map((m) => m.text) ?? [], tranche: conv.synopsis ? ["fourni", "delegue"].includes(conv.synopsis.sequence.status) : false };
  const changerMoment = () => {
    setTexte((t) => t || "Je change le moment ");
    saisie.current?.focus();
  };

  return (
    <>
      <EnteteScene acte="Acte 07" titre={<>Raconte-moi l’<em>histoire</em>.</>} sous="Le cadre est posé. Reste l’essentiel : ce que tu veux raconter. Réponds comme tu le sens, même en vrac : le scénariste s’occupe du reste." />
      <div className="cn-entretien">
        <div className="cn-chat">
          <div className="cn-agent-tete">
            <span className="cn-monogramme" aria-hidden="true">S</span>
            <div><b>Votre scénariste</b><span>écrit avec vous, une question à la fois</span></div>
          </div>
          <div className="cn-fil" role="log" aria-live="polite" aria-label="Conversation avec le scénariste">
            {conv.messages.map((m, i) => (
              <Fragment key={`${m.at}-${i}`}>
                <p className={`cn-msg ${m.role === "user" ? "is-moi" : "is-agent"}`}>{m.content}</p>
                {m.sequence ? (
                  <ChatSequence
                    sequence={m.sequence}
                    etat={etatSequence(m.sequence, i === derniereSequence, sequenceNotes)}
                    dureeSecondes={conv.synopsis?.sequence.durationSeconds ?? null}
                    actions={i === conv.messages.length - 1 && !actif && !occupe}
                    valider={() => void envoyer(MESSAGE_VALIDER_SEQUENCE)}
                    changer={changerMoment}
                  />
                ) : null}
                {m.choix ? (
                  <CartesChoix
                    choix={m.choix}
                    choisis={conv.messages[i + 1]?.choisis ?? []}
                    disponibles={i === conv.messages.length - 1 && !actif && !occupe}
                    repondre={(libelles) => void repondre(libelles)}
                  />
                ) : null}
              </Fragment>
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
              ref={saisie}
              rows={3}
              value={texte}
              disabled={actif}
              aria-label="Ta réponse"
              placeholder={dejaCommence ? "Réponds librement, ou point par point : 1. … 2. …" : "Ex. Une cartographe retrouve la carte de son père, qui dessine une ville qui n’existe pas encore…"}
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

        <aside className="cn-rail" aria-label="Où on en est">
          {conv.synopsis ? <FilmSynopsis synopsis={conv.synopsis} resteADefinir={conv.resteADefinir} /> : null}
          <Avancement notes={conv.notes} momentsManquants={conv.synopsis?.sequence.missing ?? 0} />
          {conv.resteADefinir.length > 0 ? (
            <div className="cn-rail-bloc">
              <p className="cn-rail-titre">Reste à creuser</p>
              <ul className="cn-rail-reste">{conv.resteADefinir.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ) : null}
          {conv.briefPret && !actif ? (
            <div className="cn-pret" role="status">
              <b>Le scénariste a l’essentiel.</b>
              <span>Tu peux voir le clap, ou continuer à discuter pour affiner : les notes se mettent à jour à chaque message.</span>
            </div>
          ) : (
            <p className="cn-fiche-pied">{dejaCommence ? (manque ? `Il reste ${manque} sujet${manque > 1 ? "s" : ""} à aborder.` : "Le scénariste vérifie les derniers points.") : "Ce que le scénariste retient se lit dans le Synopsis, en direct. Rien n’est figé : tout se corrige ensuite."}</p>
          )}
        </aside>
      </div>
    </>
  );
}

/** Choice cards offered by the screenwriter, under his message. Active only on the last message (`disponibles`); once answered (click or free text),
 * they stay in the thread, frozen: the retained card is highlighted (`choisis`, carried by the user's message). Single choice: a click sends.
 * Multiple choice: you tick, then « Valider » sends a single reply. */
function CartesChoix({ choix, choisis, disponibles, repondre }: { choix: Choix; choisis: string[]; disponibles: boolean; repondre: (libelles: string[]) => void }) {
  const [coches, setCoches] = useState<string[]>([]);
  const titre = useId();
  const figee = !disponibles;

  // « Je te laisse décider » does not mix with the other options of a list.
  const basculer = (libelle: string) =>
    setCoches((c) => {
      if (c.includes(libelle)) return c.filter((x) => x !== libelle);
      if (estDecider(libelle)) return [libelle];
      return [...c.filter((x) => !estDecider(x)), libelle];
    });

  return (
    <div className={`cn-choix${figee ? " is-fige" : ""}`} role="group" aria-labelledby={choix.question ? titre : undefined} aria-label={choix.question ? undefined : "Réponses proposées"}>
      {choix.question ? <p id={titre} className="cn-choix-question">{choix.question}</p> : null}
      <ul className="cn-choix-liste">
        {choix.options.map((o) => {
          const retenue = figee ? choisis.includes(o.libelle) : choix.multiple ? coches.includes(o.libelle) : false;
          const contenu = (
            <>
              <b>{o.libelle}</b>
              {o.description ? <small>{o.description}</small> : null}
            </>
          );
          return (
            <li key={o.libelle}>
              {choix.multiple ? (
                <label className={`cn-choix-carte${retenue ? " is-choisie" : ""}`}>
                  <input type="checkbox" disabled={figee} checked={retenue} onChange={() => basculer(o.libelle)} />
                  <span className="cn-choix-texte">{contenu}</span>
                </label>
              ) : (
                <button type="button" className={`cn-choix-carte${retenue ? " is-choisie" : ""}`} disabled={figee} aria-pressed={retenue} onClick={() => repondre([o.libelle])}>
                  {contenu}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {choix.multiple && !figee ? (
        <button type="button" className="btn btn-gold cn-choix-valider" disabled={coches.length === 0} onClick={() => repondre(coches)}>Valider</button>
      ) : null}
      {!figee ? <p className="cn-choix-pied">Tu peux aussi écrire ta propre réponse ci-dessous.</p> : null}
    </div>
  );
}

const COURT: Record<string, string> = { arc: "Histoire", fin: "Fin", moments: "Moments", personnages: "Héros", titre: "Titre" };

/** The essentials as a gauge and chips: done (said or left to the screenwriter) or still to settle. The detail is in the Synopsis. */
function Avancement({ notes, momentsManquants }: { notes: NoteAffichee[]; momentsManquants: number }) {
  const requis = notes.filter((n) => n.requis);
  if (requis.length === 0) return null;
  const regle = (n: NoteAffichee) => (n.statut === "fourni" || n.statut === "delegue") && (n.cle !== "moments" || momentsManquants === 0);
  const faits = requis.filter(regle).length;
  return (
    <div className="cn-rail-bloc">
      <p className="cn-rail-titre cn-rail-ligne"><span>L’essentiel</span><span>{faits} / {requis.length}</span></p>
      <div className="cn-jauge" role="progressbar" aria-label="L’essentiel tranché" aria-valuemin={0} aria-valuemax={requis.length} aria-valuenow={faits}>
        <span style={{ width: `${(100 * faits) / requis.length}%` }} />
      </div>
      <ul className="cn-pastilles">
        {requis.map((n) => (
          <li key={n.cle} className={regle(n) ? "is-fait" : ""}>{COURT[n.cle] ?? n.libelle}{regle(n) ? " ✓" : ""}</li>
        ))}
      </ul>
    </div>
  );
}
