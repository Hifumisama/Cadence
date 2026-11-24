"use client";

import type { CarteChangement, ChoixChangement } from "@/lib/agents/chat-change";

const DECIDE: Record<ChoixChangement, string> = { garder: "Ancienne version gardée", nouveau: "Nouvelle idée prise", melange: "Mélange proposé" };

/** The « changement de direction » card under the screenwriter's message (mock-up C1, 2026-11-18): before → now, what taking the new idea does,
 * and two choices (test feedback 2026-11-23: the « mélange » button was unclear; a mix is simply written in the chat). Read only once chosen, or
 * once the conversation went on. */
export function ChatChange({
  carte,
  actions,
  garder,
  prendre,
}: {
  carte: CarteChangement;
  /** The buttons work (last message, nothing running, not chosen yet). */
  actions: boolean;
  garder: () => void;
  prendre: () => void;
}) {
  const sujets = [...new Set(carte.points.map((p) => p.sujet ?? p.libelle))].join(" · ");
  // The exact subject of each line (« Mia (personnage) · tenue ») is shown as soon as it says more than the title.
  const precis = (p: CarteChangement["points"][number]) => carte.points.length > 1 || (p.sujet !== undefined && p.libelle !== p.sujet);
  const decide = carte.choix ? DECIDE[carte.choix] : null;
  return (
    <section className={`cc${decide || !actions ? " is-tranche" : ""}`} aria-label="Changement de direction">
      <div className="cc-tete">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="cc-icone"><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>
        <b>Changement de direction</b>
        <span className="cc-meta">· {sujets}</span>
        {carte.points.some((p) => p.cadre) ? <span className="cc-pastille">cadre du film</span> : null}
      </div>
      <div className="cc-corps">
        {carte.points.map((p) => (
          <div key={`${p.cle}-${p.libelle}`} className="cc-ligne">
            <div className="cc-cote">
              <span className="cc-etiquette">Avant{precis(p) ? ` · ${p.libelle}` : ""}</span>
              <span className="cc-valeur is-avant">{p.avant}</span>
            </div>
            <span className="cc-fleche" aria-hidden="true">→</span>
            <div className="cc-cote is-apres">
              <span className="cc-etiquette">Maintenant{precis(p) ? ` · ${p.libelle}` : ""}</span>
              <span className="cc-valeur">{p.apres}</span>
            </div>
          </div>
        ))}
      </div>
      {carte.aRevoir.length ? (
        <div className="cc-revoir">
          <p>Si tu prends la nouvelle idée :</p>
          <ul>{carte.aRevoir.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      ) : null}
      <div className="cc-pied">
        {decide ? (
          <span className="cc-decide is-choisi">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L19 8" /></svg>
            {decide}
          </span>
        ) : actions ? (
          <>
            <button type="button" className="btn" onClick={garder}>Garder l’ancienne</button>
            <button type="button" className="btn cc-prendre" onClick={prendre}>Prendre la nouvelle</button>
          </>
        ) : (
          <span className="cc-decide">Tranché dans la conversation.</span>
        )}
      </div>
    </section>
  );
}
