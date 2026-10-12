"use client";

import { useId, useState } from "react";
import { FORMULAIRES_LISTE } from "@/components/agents/BriefSections";
import { depuisSaisie, typeEdition, versSaisie } from "@/lib/agents-affichage";
import type { BriefContenu } from "@/lib/agents/types";
import type { Edition } from "./types";

type Liste = Record<string, unknown>[];
const AVEC_STATUT = ["personnages", "lieux"];

/** Sections dont la saisie tient sur une seule ligne (les autres : zone de texte). */
const UNE_LIGNE = ["titre", "langueDialogues", "genreTon", "dureeEpisodeSecondes"];

/** L'éditeur EN LIGNE : il prend la place du contenu du bloc cliqué (plus de panneau latéral). Il modifie une valeur
 * simple ou UN élément d'une liste d'objets (personnage, lieu). Enregistrer marque la section comme « fournie » (côté serveur).
 * Échap annule, Ctrl/Cmd + Entrée enregistre. */
export function EditeurBrief({
  edition,
  contenu,
  onFermer,
  onEnregistrer,
  onRetirer,
}: {
  edition: Edition;
  contenu: BriefContenu;
  onFermer: () => void;
  onEnregistrer: (cle: string, valeur: unknown) => Promise<string | null>;
  onRetirer: (edition: Edition) => Promise<string | null>;
}) {
  const idBase = useId();
  const donnees = contenu as unknown as Record<string, unknown>;
  const formulaire = edition.type === "element" ? FORMULAIRES_LISTE[edition.cle] : undefined;
  const objets: Liste = edition.type === "element" && Array.isArray(donnees[edition.cle]) ? (donnees[edition.cle] as Liste) : [];
  const ajout = edition.type === "element" && edition.index >= objets.length;

  const [saisie, setSaisie] = useState(() => (edition.type === "section" ? versSaisie(edition.cle, donnees[edition.cle]) : ""));
  const [champs, setChamps] = useState<Record<string, unknown>>(() => ({ ...(edition.type === "element" ? (objets[edition.index] ?? formulaire?.nouveau ?? {}) : {}) }));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [retraitDemande, setRetraitDemande] = useState(false);

  const terminer = async (action: () => Promise<string | null>) => {
    setEnvoi(true);
    setErreur(null);
    const message = await action();
    setEnvoi(false);
    if (message) setErreur(message);
    else onFermer();
  };

  const enregistrer = () =>
    terminer(async () => {
      if (edition.type === "section") {
        const lu = depuisSaisie(edition.cle, saisie);
        if (!lu.ok) return lu.erreur;
        return onEnregistrer(edition.cle, lu.valeur);
      }
      const premier = formulaire?.champs[0];
      if (premier && premier.type !== "bool" && !String(champs[premier.cle] ?? "").trim()) return `« ${premier.libelle} » est obligatoire.`;
      const nettoye: Record<string, unknown> = { ...champs };
      for (const c of formulaire?.champs ?? []) if (typeof nettoye[c.cle] === "string") nettoye[c.cle] = (nettoye[c.cle] as string).trim();
      // Une correction à la main : le personnage ou le lieu passe à « fourni ».
      if (AVEC_STATUT.includes(edition.cle)) nettoye.statut = "fourni";
      const suite = edition.index < objets.length ? objets.map((x, i) => (i === edition.index ? nettoye : x)) : [...objets, nettoye];
      return onEnregistrer(edition.cle, suite);
    });

  const type = edition.type === "section" ? typeEdition(edition.cle) : null;
  const uneLigne = edition.type === "section" && UNE_LIGNE.includes(edition.cle);

  return (
    <div
      className="bf-editeur"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !envoi) {
          e.stopPropagation();
          onFermer();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !envoi) {
          e.preventDefault();
          void enregistrer();
        }
      }}
    >
      {edition.type === "section" ? (
        <div className="bf-champ">
          <label htmlFor={`${idBase}-s`}>{edition.titre}</label>
          {uneLigne ? (
            <input id={`${idBase}-s`} className="field" autoFocus inputMode={type === "nombre" ? "numeric" : undefined} value={saisie} onChange={(e) => setSaisie(e.target.value)} />
          ) : (
            <textarea id={`${idBase}-s`} className="field" autoFocus rows={edition.cle === "arc" ? 4 : 5} value={saisie} onChange={(e) => setSaisie(e.target.value)} spellCheck />
          )}
        </div>
      ) : (
        formulaire?.champs.map((c, i) => {
          const id = `${idBase}-${c.cle}`;
          if (c.type === "bool") {
            return (
              <label key={c.cle} className="bf-case" htmlFor={id}>
                <input id={id} type="checkbox" checked={champs[c.cle] === true} onChange={(e) => setChamps({ ...champs, [c.cle]: e.target.checked })} />
                <span>{c.libelle}</span>
              </label>
            );
          }
          const valeur = typeof champs[c.cle] === "string" ? (champs[c.cle] as string) : "";
          return (
            <div key={c.cle} className="bf-champ">
              <label htmlFor={id}>{c.libelle}</label>
              {c.type === "long" ? (
                <textarea id={id} className="field" autoFocus={i === 0} rows={3} value={valeur} onChange={(e) => setChamps({ ...champs, [c.cle]: e.target.value })} />
              ) : (
                <input id={id} className="field" autoFocus={i === 0} value={valeur} onChange={(e) => setChamps({ ...champs, [c.cle]: e.target.value })} />
              )}
            </div>
          );
        })
      )}

      {erreur ? (
        <p className="bf-erreur" role="alert">
          {erreur}
        </p>
      ) : null}

      <div className="bf-editeur-ft">
        <button type="button" className="bf-btn bf-btn-or bf-press" onClick={enregistrer} disabled={envoi}>
          {envoi ? "…" : ajout ? "Ajouter" : "Enregistrer"}
        </button>
        <button type="button" className="bf-btn bf-press" onClick={onFermer} disabled={envoi}>
          Annuler
        </button>
        {edition.type === "element" && !ajout ? (
          retraitDemande ? (
            <button type="button" className="bf-btn-texte is-danger" disabled={envoi} onClick={() => terminer(() => onRetirer(edition))}>
              Oui, retirer
            </button>
          ) : (
            <button type="button" className="bf-btn-texte is-danger" disabled={envoi} onClick={() => setRetraitDemande(true)}>
              Retirer
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
