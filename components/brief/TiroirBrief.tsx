"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChampsStyle, FORMULAIRES_LISTE } from "@/components/agents/BriefSections";
import { Icone } from "@/components/ui/Icone";
import { depuisSaisie, typeEdition, versSaisie } from "@/lib/agents-affichage";
import type { BriefContenu } from "@/lib/agents/types";
import type { Edition } from "./types";

type Liste = Record<string, unknown>[];
const AVEC_STATUT = ["personnages", "lieux"];

/** Le tiroir d'édition : un `<dialog>` modal (focus piégé, Échap, fond cliquable), plein écran sur téléphone. Il modifie
 * UNE section, ou UN élément d'une liste ; l'enregistrement passe le tout à « fourni » (comme l'ancien éditeur). */
export function TiroirBrief({
  edition,
  contenu,
  titre,
  etatAConfirmer,
  onFermer,
  onEnregistrer,
  onRetirer,
  onConfirmer,
}: {
  edition: Edition;
  contenu: BriefContenu;
  titre: string;
  /** L'élément (ou la section) est à confirmer : on propose « Confirmer tel quel ». */
  etatAConfirmer: boolean;
  onFermer: () => void;
  onEnregistrer: (cle: string, valeur: unknown) => Promise<string | null>;
  onRetirer: (cle: string, index: number) => Promise<string | null>;
  onConfirmer: (edition: Edition) => Promise<string | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idBase = useId();
  const donnees = contenu as unknown as Record<string, unknown>;
  const formulaire = edition.type === "element" ? FORMULAIRES_LISTE[edition.cle] : undefined;
  const liste: Liste = edition.type === "element" && Array.isArray(donnees[edition.cle]) ? (donnees[edition.cle] as Liste) : [];
  const existant = edition.type === "element" ? liste[edition.index] : undefined;

  const [saisie, setSaisie] = useState(() => (edition.type === "section" ? versSaisie(edition.cle, donnees[edition.cle]) : ""));
  const [champs, setChamps] = useState<Record<string, unknown>>(() => ({ ...(existant ?? formulaire?.nouveau ?? {}) }));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [retraitDemande, setRetraitDemande] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

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
      // Une correction à la main vaut confirmation : le personnage ou le lieu passe à « fourni ».
      if (AVEC_STATUT.includes(edition.cle)) nettoye.statut = "fourni";
      const suite = edition.index < liste.length ? liste.map((x, i) => (i === edition.index ? nettoye : x)) : [...liste, nettoye];
      return onEnregistrer(edition.cle, suite);
    });

  const type = edition.type === "section" ? typeEdition(edition.cle) : null;
  const ajout = edition.type === "element" && edition.index >= liste.length;

  return (
    <dialog
      ref={ref}
      className="bf-tiroir"
      aria-labelledby={`${idBase}-titre`}
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <div className="bf-tiroir-corps">
        <header className="bf-tiroir-hd">
          <div>
            <span className="bf-etiquette">{edition.type === "element" ? (formulaire?.element ?? "Élément") : "Section"}</span>
            <h2 id={`${idBase}-titre`}>{ajout ? `Ajouter : ${formulaire?.element.toLowerCase()}` : `Modifier : ${titre}`}</h2>
          </div>
          <button type="button" className="bf-icone-btn bf-press" aria-label="Fermer" onClick={() => ref.current?.close()}>
            <Icone nom="fermer" taille={18} />
          </button>
        </header>

        <div className="bf-tiroir-bd">
          {etatAConfirmer && !ajout ? (
            <div className="bf-confirmer-box">
              <span className="bf-prov is-confirmer">
                <span aria-hidden="true">◇</span> À confirmer
              </span>
              <p>L&rsquo;agent n&rsquo;est pas sûr de cet élément. Si tout te va, confirme-le sans rien changer.</p>
              <button type="button" className="bf-btn bf-btn-or bf-press" disabled={envoi} onClick={() => terminer(() => onConfirmer(edition))}>
                Confirmer tel quel
              </button>
            </div>
          ) : null}

          {edition.type === "section" ? (
            type === "style" ? (
              <ChampsStyle saisie={saisie} onChange={setSaisie} libelle={titre} />
            ) : (
              <div className="bf-champ">
                <label htmlFor={`${idBase}-s`}>{titre}</label>
                {type === "nombre" ? (
                  <input id={`${idBase}-s`} className="field" inputMode="numeric" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
                ) : (
                  <textarea
                    id={`${idBase}-s`}
                    className="field"
                    rows={type === "texte" ? 3 : type === "libre" ? 6 : 8}
                    value={saisie}
                    onChange={(e) => setSaisie(e.target.value)}
                    spellCheck={type !== "json"}
                  />
                )}
                {type === "lignes" ? <p className="bf-aide">Un élément par ligne.</p> : null}
              </div>
            )
          ) : (
            formulaire?.champs.map((c) => {
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
                    <textarea id={id} className="field" rows={3} value={valeur} onChange={(e) => setChamps({ ...champs, [c.cle]: e.target.value })} />
                  ) : (
                    <input id={id} className="field" value={valeur} onChange={(e) => setChamps({ ...champs, [c.cle]: e.target.value })} />
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
          <p className="bf-aide">Enregistrer marque ceci comme fourni.</p>
        </div>

        <footer className="bf-tiroir-ft">
          <button type="button" className="bf-btn bf-btn-or bf-press" onClick={enregistrer} disabled={envoi}>
            {envoi ? "…" : ajout ? "Ajouter" : "Enregistrer"}
          </button>
          <button type="button" className="bf-btn bf-press" onClick={() => ref.current?.close()} disabled={envoi}>
            Annuler
          </button>
          {edition.type === "element" && !ajout ? (
            retraitDemande ? (
              <button type="button" className="bf-btn-texte is-danger" disabled={envoi} onClick={() => terminer(() => onRetirer(edition.cle, edition.index))}>
                Oui, retirer
              </button>
            ) : (
              <button type="button" className="bf-btn-texte is-danger" disabled={envoi} onClick={() => setRetraitDemande(true)}>
                Retirer {formulaire?.element.toLowerCase()}
              </button>
            )
          ) : null}
        </footer>
      </div>
    </dialog>
  );
}
