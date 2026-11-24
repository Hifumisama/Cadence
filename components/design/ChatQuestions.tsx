"use client";

import { useId, useState } from "react";
import { messageReponses, type QuestionsCarte } from "@/lib/agents/chat-questions";

/** The screenwriter's grouped questions as a card under its message (mock-up C2, 2026-11-18): one subject, up to three questions, each with
 * its quick answers (one pick, click again to unpick) and ALWAYS an « Autre » field; one « Répondre » sends everything as one message. A question
 * left empty is not sent (the screenwriter takes it up later). Read only once the conversation went on. */
export function ChatQuestions({ carte, actions, envoyer }: { carte: QuestionsCarte; /** Last message, nothing running. */ actions: boolean; envoyer: (texte: string) => void }) {
  const id = useId();
  const n = carte.questions.length;
  const [choisies, setChoisies] = useState<string[]>(() => Array(n).fill(""));
  const [autres, setAutres] = useState<string[]>(() => Array(n).fill(""));
  // The free field wins over a quick answer: writing in « Autre » unpicks the chip.
  const reponses = carte.questions.map((_, i) => autres[i]!.trim() || choisies[i]!);
  const message = messageReponses(carte, reponses);

  const choisir = (i: number, r: string) => {
    setChoisies((c) => c.map((x, k) => (k === i ? (x === r ? "" : r) : x)));
    setAutres((a) => a.map((x, k) => (k === i ? "" : x)));
  };
  const ecrire = (i: number, t: string) => {
    setAutres((a) => a.map((x, k) => (k === i ? t : x)));
    if (t.trim()) setChoisies((c) => c.map((x, k) => (k === i ? "" : x)));
  };

  return (
    <form
      className={`cq${actions ? "" : " is-repondu"}`}
      aria-label={`${carte.sujet} : ${n} question${n > 1 ? "s" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (actions && message) envoyer(message);
      }}
    >
      <div className="cq-tete">
        <b>{carte.sujet}</b>
        <span className="cq-meta">{n} question{n > 1 ? "s" : ""}</span>
      </div>
      {/* The questions scroll inside the card (test feedback 2026-11-23): its title and « Répondre » stay in view. */}
      <div className="cq-corps">
      {carte.questions.map((q, i) => (
        <fieldset key={i} className="cq-question" disabled={!actions}>
          <legend><span className="cq-num">{i + 1}.</span> {q.question}</legend>
          {q.reponses.length ? (
            <div className="cq-rapides">
              {q.reponses.map((r) => (
                <button key={r} type="button" className="cq-puce" aria-pressed={choisies[i] === r} onClick={() => choisir(i, r)}>{r}</button>
              ))}
            </div>
          ) : null}
          <label className="cq-autre" htmlFor={`${id}-${i}`}>
            <span className="cq-autre-libelle">{q.reponses.length ? "Autre" : "Ta réponse"}</span>
            <input id={`${id}-${i}`} type="text" value={autres[i]} placeholder={q.reponses.length ? "Ou dis-le avec tes mots" : "En quelques mots"} onChange={(e) => ecrire(i, e.target.value)} />
          </label>
        </fieldset>
      ))}
      </div>
      {actions ? (
        <div className="cq-pied">
          <button type="submit" className="btn cq-repondre" disabled={!message}>Répondre</button>
          <span className="cq-meta">Tu peux laisser une question vide : il la reprendra.</span>
        </div>
      ) : null}
    </form>
  );
}
