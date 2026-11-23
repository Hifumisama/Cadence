"use client";

import { Fragment, useId, useRef, useState } from "react";
import { envoyerMessage, relancerAccroche, repondreAuChoix, trancherChangement } from "@/app/agents/actions";
import { EtatTacheAgent } from "@/components/agents/AgentTaskState";
import { estTacheActive } from "@/lib/agents/agents-display";
import { estDecider, messageAutresPalettes } from "@/lib/agents/choice";
import { etatSequence, messageValiderSequence } from "@/lib/agents/chat-sequence";
import type { NoteAffichee } from "@/lib/agents/sheet-display";
import type { Choix, VueConversation } from "@/lib/agents/types";
import { useDefilementBas } from "@/components/ui/useScrollToBottom";
import { EnteteScene } from "./Scenes";
import { ChatSequence } from "./ChatSequence";
import { ChatChange } from "./ChatChange";
import { ChatQuestions } from "./ChatQuestions";
import { traceMessage, type ViaMessage } from "@/lib/agents/chat-trace";
import { messageDecision } from "@/lib/agents/chat-change";
import { MESSAGE_ARRET } from "@/lib/agents/sheet";
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

  const envoyer = async (impose?: string, via?: ViaMessage) => {
    const t = (impose ?? texte).trim();
    if (!t || occupe || actif) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await envoyerMessage(conv.uuid, t, impose !== undefined ? via : undefined);
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

  /** A choice on the change card: the server settles the sheet (and the frame) and sends the answer. */
  const trancher = async (index: number, choix: "garder" | "nouveau") => {
    if (occupe || actif) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await trancherChangement(conv.uuid, index, choix);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      await rafraichir();
    } catch {
      setErreur("Le choix n’a pas pu être envoyé.");
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
  const essentielsOuverts = conv.notes.filter((n) => n.requis && !essentielRegle(n, conv.synopsis?.sequence.missing ?? 0)).map((n) => (COURT[n.cle] ?? n.libelle).toLowerCase());
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
                {/* A card's button sent this answer: the card's « ✓ » line already says it. */}
                {m.decision ? null : m.via ? (
                  <p className="cn-trace">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L19 8" /></svg>
                    {traceMessage(m.via, m.content)}
                  </p>
                ) : <p className={`cn-msg ${m.role === "user" ? "is-moi" : "is-agent"}`}>{m.content}</p>}
                {m.sequence ? (
                  <ChatSequence
                    sequence={m.sequence}
                    etat={etatSequence(m.sequence, i === derniereSequence, sequenceNotes)}
                    dureeSecondes={conv.synopsis?.sequence.durationSeconds ?? null}
                    actions={i === conv.messages.length - 1 && !actif && !occupe}
                    valider={(fort) => void envoyer(messageValiderSequence(fort), "sequence")}
                    proposerSuite={(t) => void envoyer(t, "suite")}
                    changer={changerMoment}
                  />
                ) : null}
                {m.changement ? (
                  <ChatChange
                    carte={m.changement}
                    actions={i === conv.messages.length - 1 && !actif && !occupe}
                    garder={() => void trancher(i, "garder")}
                    prendre={() => void trancher(i, "nouveau")}
                    melanger={() => {
                      setTexte((t) => t || messageDecision(m.changement!, "melange"));
                      saisie.current?.focus();
                    }}
                  />
                ) : null}
                {m.questions ? (
                  <ChatQuestions
                    key={`q-${m.at}`}
                    carte={m.questions}
                    actions={i === conv.messages.length - 1 && !actif && !occupe}
                    envoyer={(t) => void envoyer(t, "questions")}
                  />
                ) : null}
                {m.choix ? (
                  <CartesChoix
                    choix={m.choix}
                    choisis={conv.messages[i + 1]?.choisis ?? []}
                    disponibles={i === conv.messages.length - 1 && !actif && !occupe}
                    repondre={(libelles) => void repondre(libelles)}
                    autres={() => void envoyer(messageAutresPalettes(m.choix!), "autres")}
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
            {dejaCommence && !conv.briefPret ? (
              <TerminerEntretien manquants={essentielsOuverts} desactive={occupe || actif} terminer={() => void envoyer(MESSAGE_ARRET, "arret")} />
            ) : null}
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
function CartesChoix({ choix, choisis, disponibles, repondre, autres }: { choix: Choix; choisis: string[]; disponibles: boolean; repondre: (libelles: string[]) => void; /** « Propose-m'en d'autres » (palette cards). */ autres?: () => void }) {
  const palette = choix.options.some((o) => o.couleurs?.length);
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
              {o.couleurs?.length ? (
                <span className="cn-nuancier" role="img" aria-label={`Couleurs : ${o.couleurs.map((c) => c.nom).join(", ")}`}>
                  {o.couleurs.map((c) => <span key={c.nom} style={{ background: c.hex }} title={c.nom} />)}
                </span>
              ) : null}
              <b>{o.libelle}</b>
              {o.matieres ? <small>{o.matieres}</small> : null}
              {o.description ? <small>{o.description}</small> : null}
              {o.couleurs?.length ? <small className="cn-nuancier-noms">{o.couleurs.map((c) => c.nom).join(" · ")}</small> : null}
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
      {palette && !figee && autres ? <button type="button" className="btn cn-choix-autres" onClick={autres}>Propose-m’en d’autres</button> : null}
      {!figee ? <p className="cn-choix-pied">Tu peux aussi écrire ta propre réponse ci-dessous.</p> : null}
    </div>
  );
}

const COURT: Record<string, string> = {
  arc: "Histoire",
  fin: "Fin",
  genreTon: "Genre",
  style: "Style",
  rythme: "Rythme",
  dureeEpisodeSecondes: "Durée",
  moments: "Moments",
  personnages: "Héros",
  titre: "Titre",
};

/** An essential is settled: said or left to the screenwriter (the moments: all there). */
const essentielRegle = (n: NoteAffichee, momentsManquants: number): boolean => (n.statut === "fourni" || n.statut === "delegue") && (n.cle !== "moments" || momentsManquants === 0);

/** « Terminer l'entretien » (test feedback 2026-11-23): the reliable way to stop, whatever is missing. When essentials are still open, a
 * confirmation in place says the screenwriter will propose them; otherwise one click ends it. */
function TerminerEntretien({ manquants, desactive, terminer }: { manquants: string[]; desactive: boolean; terminer: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  if (confirmer && manquants.length > 0) {
    return (
      <div className="cn-terminer is-confirmer" role="group" aria-label="Terminer l’entretien">
        <p>Il manque encore : {manquants.join(", ")}. Le scénariste les proposera, tu pourras tout corriger dans le Brief.</p>
        <div className="cn-terminer-actions">
          <button type="button" className="btn" onClick={() => setConfirmer(false)}>Continuer</button>
          <button type="button" className="btn btn-gold" disabled={desactive} onClick={terminer}>Terminer</button>
        </div>
      </div>
    );
  }
  return (
    <div className="cn-terminer">
      <button type="button" className="cn-lien" disabled={desactive} onClick={() => (manquants.length > 0 ? setConfirmer(true) : terminer())}>Terminer l’entretien</button>
    </div>
  );
}

/** The essentials as a gauge and chips: done (said or left to the screenwriter) or still to settle. The detail is in the Synopsis. */
function Avancement({ notes, momentsManquants }: { notes: NoteAffichee[]; momentsManquants: number }) {
  const requis = notes.filter((n) => n.requis);
  if (requis.length === 0) return null;
  const regle = (n: NoteAffichee) => essentielRegle(n, momentsManquants);
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
