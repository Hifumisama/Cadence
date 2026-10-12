"use client";

import { Fragment, useId, useRef, useState } from "react";
import { envoyerMessage, relancerAccroche, repondreAuChoix } from "@/app/agents/actions";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { estTacheActive } from "@/lib/agents-affichage";
import { estDecider } from "@/lib/agents/choix";
import type { NoteAffichee } from "@/lib/agents/fiche-affichage";
import type { Choix, VueConversation } from "@/lib/agents/types";
import { useDefilementBas } from "@/components/ui/useDefilementBas";
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

  // Suit le flux sans arracher l'ascenseur à qui est remonté lire.
  useDefilementBas(fin, `${tourEnCours}${tache?.fluxTexte ?? ""}`, conv.messages.length);

  /** Une réponse par carte : même chemin que le texte libre (un tour de l'agent), le serveur formule le message. */
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
              <Fragment key={`${m.at}-${i}`}>
                <p className={`cn-msg ${m.role === "user" ? "is-moi" : "is-agent"}`}>{m.content}</p>
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

/** Cartes de choix proposées par le scénariste, sous son message. Actives seulement sur le dernier message (`disponibles`) ; une fois
 * répondu (clic ou texte libre), elles restent dans le fil, figées : la carte retenue est mise en évidence (`choisis`, porté par le message
 * de l'utilisateur). Choix simple : un clic envoie. Choix multiple : on coche, puis « Valider » envoie une seule réponse. */
function CartesChoix({ choix, choisis, disponibles, repondre }: { choix: Choix; choisis: string[]; disponibles: boolean; repondre: (libelles: string[]) => void }) {
  const [coches, setCoches] = useState<string[]>([]);
  const titre = useId();
  const figee = !disponibles;

  // « Je te laisse décider » ne se mêle pas aux autres options d'une liste.
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

function Note({ note, courante, ouverte, bascule }:{ note: NoteAffichee; courante: boolean; ouverte: boolean; bascule: () => void }) {
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
