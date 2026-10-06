"use client";

import { useState } from "react";
import {
  ETAT_CHAMP,
  decompterStatuts,
  depuisSaisie,
  groupesBrief,
  typeEdition,
  valeurEnTexte,
  versSaisie,
} from "@/lib/agents-affichage";
import { STATUTS_CHAMP, type SectionBrief, type StatutChamp, type VueBrief } from "@/lib/agents/types";
import { Icone } from "@/components/ui/Icone";

/** Le brief en sections repliables par groupe, avec TROIS états explicites (jamais la
 * couleur seule : un symbole et un libellé) : ● fourni (or), ○ déduit (blanc),
 * ◇ à valider (blanc, souligné en pointillés). Chaque section est éditable (✎) : la
 * corriger la passe à « fourni ». Partagé par la popup (étape Brief) et la page du brief. */
export function BriefSections({
  brief,
  onModifier,
  desactive = false,
}: {
  brief: VueBrief;
  /** Renvoie un message d'erreur, ou null si la section a été enregistrée. Absent : lecture seule. */
  onModifier?: (cle: string, valeur: unknown) => Promise<string | null>;
  desactive?: boolean;
}) {
  const nombres = decompterStatuts(brief.sections);
  return (
    <div className="ag-brief">
      <Legende nombres={nombres} />
      {groupesBrief(brief.sections).map((g) => (
        <section key={g.groupe} className="ag-brief-groupe" aria-label={g.groupe}>
          <h3 className="ag-brief-titre">{g.groupe}</h3>
          {g.sections.map((s) => (
            <Section key={s.cle} s={s} onModifier={onModifier} desactive={desactive} />
          ))}
        </section>
      ))}
    </div>
  );
}

/** Style : un nom (« animation 2D ») et la clause (anglais), au lieu d'un objet JSON. La saisie reste
 * la chaîne JSON {nom, clause} que `depuisSaisie("style", …)` relit. */
export function ChampsStyle({ saisie, onChange, libelle }: { saisie: string; onChange: (v: string) => void; libelle: string }) {
  let v: { nom?: string; clause?: string } = {};
  try {
    v = JSON.parse(saisie) as { nom?: string; clause?: string };
  } catch {
    v = {};
  }
  const maj = (cle: "nom" | "clause", valeur: string) => onChange(JSON.stringify({ nom: v.nom ?? "", clause: v.clause ?? "", [cle]: valeur }));
  return (
    <div className="ag-style-champs">
      <label className="tiny-note" htmlFor="ag-style-nom">
        Style nommé
      </label>
      <input id="ag-style-nom" className="field" value={v.nom ?? ""} onChange={(e) => maj("nom", e.target.value)} aria-label={`${libelle} : style nommé`} />
      <label className="tiny-note" htmlFor="ag-style-clause">
        Clause de style
      </label>
      <textarea id="ag-style-clause" className="field" rows={3} value={v.clause ?? ""} onChange={(e) => maj("clause", e.target.value)} aria-label={`${libelle} : clause de style`} spellCheck={false} />
    </div>
  );
}

/** Les sections qui sont des LISTES d'objets (épisodes, personnages…) : un formulaire par élément au lieu d'un JSON
 * brut. La saisie reste la chaîne JSON que `depuisSaisie` relit et que le serveur valide contre le sous-schéma de la
 * section : le formulaire ne fait que la produire. Les champs que le formulaire ne montre pas (le `statut` d'un
 * personnage) sont conservés tels quels. */
type ChampListe = { cle: string; libelle: string; type: "texte" | "long" | "bool" };
export const FORMULAIRES_LISTE: Record<string, { element: string; champs: ChampListe[]; nouveau: Record<string, unknown> }> = {
  episodes: {
    element: "Épisode",
    champs: [
      { cle: "titre", libelle: "Titre", type: "texte" },
      { cle: "resume", libelle: "Ce que l'épisode raconte", type: "long" },
      { cle: "portee", libelle: "Chapitres ou arc couverts (facultatif)", type: "texte" },
    ],
    nouveau: { titre: "", resume: "" },
  },
  personnages: {
    element: "Personnage",
    champs: [
      { cle: "nom", libelle: "Nom", type: "texte" },
      { cle: "role", libelle: "Rôle", type: "texte" },
      { cle: "age", libelle: "Âge apparent (ex. adolescente, 15 ans)", type: "texte" },
      { cle: "apparence", libelle: "Apparence : ce qu'on voit (corps, visage, cheveux, tenue)", type: "long" },
      { cle: "reconnaissable", libelle: "Ce qui le rend reconnaissable", type: "long" },
      { cle: "gestuelle", libelle: "Gestuelle : comment il bouge ou agit (facultatif)", type: "long" },
      { cle: "voix", libelle: "Impression vocale (s'il parle)", type: "texte" },
    ],
    nouveau: { nom: "", role: "", age: "", apparence: "", reconnaissable: "" },
  },
  lieux: {
    element: "Lieu",
    champs: [
      { cle: "nom", libelle: "Nom", type: "texte" },
      { cle: "description", libelle: "Description", type: "long" },
    ],
    nouveau: { nom: "", description: "" },
  },
  rimes: {
    element: "Rime",
    champs: [
      { cle: "description", libelle: "Les deux moments qui se répondent et ce qui se répète", type: "long" },
      { cle: "souligner", libelle: "À souligner à l'image", type: "bool" },
    ],
    nouveau: { description: "", souligner: false },
  },
  progressions: {
    element: "Progression",
    champs: [
      { cle: "quoi", libelle: "Ce qui évolue", type: "texte" },
      { cle: "evolution", libelle: "Comment", type: "long" },
    ],
    nouveau: { quoi: "", evolution: "" },
  },
  pieges: {
    element: "Piège",
    champs: [
      { cle: "cliche", libelle: "Ce que les modèles produisent par défaut", type: "long" },
      { cle: "formulationPositive", libelle: "Ce qu'on décrit à la place (jamais une négation)", type: "long" },
    ],
    nouveau: { cliche: "", formulationPositive: "" },
  },
};

function ListeObjets({ cle, saisie, onChange, libelle }: { cle: string; saisie: string; onChange: (v: string) => void; libelle: string }) {
  const f = FORMULAIRES_LISTE[cle]!;
  let liste: Record<string, unknown>[] = [];
  try {
    const v = JSON.parse(saisie) as unknown;
    if (Array.isArray(v)) liste = v as Record<string, unknown>[];
  } catch {
    liste = [];
  }
  const maj = (suite: Record<string, unknown>[]) => onChange(JSON.stringify(suite));
  const modifier = (i: number, champ: string, valeur: unknown) => maj(liste.map((x, k) => (k === i ? { ...x, [champ]: valeur } : x)));
  return (
    <div className="ag-liste-objets">
      {liste.length === 0 ? <p className="tiny-note">Aucun élément.</p> : null}
      {liste.map((x, i) => (
        <fieldset key={i} className="ag-liste-element">
          <legend>
            {f.element} {i + 1}
          </legend>
          {f.champs.map((c) => {
            const id = `ag-${cle}-${i}-${c.cle}`;
            if (c.type === "bool") {
              return (
                <label key={c.cle} className="ag-case" htmlFor={id}>
                  <input id={id} type="checkbox" checked={x[c.cle] === true} onChange={(e) => modifier(i, c.cle, e.target.checked)} />
                  <span>{c.libelle}</span>
                </label>
              );
            }
            const valeur = typeof x[c.cle] === "string" ? (x[c.cle] as string) : "";
            return (
              <div key={c.cle} className="ag-liste-champ">
                <label className="tiny-note" htmlFor={id}>
                  {c.libelle}
                </label>
                {c.type === "long" ? (
                  <textarea id={id} className="field" rows={2} value={valeur} onChange={(e) => modifier(i, c.cle, e.target.value)} aria-label={`${libelle} ${i + 1} : ${c.libelle}`} />
                ) : (
                  <input id={id} className="field" value={valeur} onChange={(e) => modifier(i, c.cle, e.target.value)} aria-label={`${libelle} ${i + 1} : ${c.libelle}`} />
                )}
              </div>
            );
          })}
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => maj(liste.filter((_, k) => k !== i))}>
            Retirer {f.element.toLowerCase()} {i + 1}
          </button>
        </fieldset>
      ))}
      <button type="button" className="btn btn-ghost btn-mini" onClick={() => maj([...liste, { ...f.nouveau }])}>
        <Icone nom="ajouter" taille={15} /> Ajouter {f.element.toLowerCase()}
      </button>
    </div>
  );
}

function Legende({ nombres }: { nombres: Record<StatutChamp, number> }) {
  return (
    <ul className="ag-legende" aria-label="Légende des états">
      {STATUTS_CHAMP.filter((st) => st !== "a_valider" || nombres[st] > 0).map((st) => (
        <li key={st} className={`ag-etat-${st}`} title={ETAT_CHAMP[st].description}>
          <span className="ag-symbole" aria-hidden="true">
            {ETAT_CHAMP[st].symbole}
          </span>
          <span>
            {ETAT_CHAMP[st].libelle} <span className="num">({nombres[st]})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({
  s,
  onModifier,
  desactive,
}: {
  s: SectionBrief;
  onModifier?: (cle: string, valeur: unknown) => Promise<string | null>;
  desactive: boolean;
}) {
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const etat = ETAT_CHAMP[s.statut];
  const type = typeEdition(s.cle);

  const ouvrir = () => {
    setSaisie(versSaisie(s.cle, s.valeur));
    setErreur(null);
    setEdition(true);
  };

  const enregistrer = async () => {
    const lu = depuisSaisie(s.cle, saisie);
    if (!lu.ok) {
      setErreur(lu.erreur);
      return;
    }
    setEnvoi(true);
    const message = await onModifier?.(s.cle, lu.valeur);
    setEnvoi(false);
    if (message) setErreur(message);
    else setEdition(false);
  };

  return (
    <details className={`ag-section ag-etat-${s.statut}`} open={s.statut === "a_valider" || edition || undefined}>
      <summary>
        <Icone nom="droite" className="ag-chevron" />
        <span className="ag-symbole" aria-hidden="true">
          {etat.symbole}
        </span>
        <span className="ag-section-nom">{s.libelle}</span>
        <span className="ag-section-etat">{etat.libelle}</span>
      </summary>
      <div className="ag-section-corps">
        {edition ? (
          <>
            {type === "style" ? (
              <ChampsStyle saisie={saisie} onChange={setSaisie} libelle={s.libelle} />
            ) : type === "json" && FORMULAIRES_LISTE[s.cle] ? (
              <ListeObjets cle={s.cle} saisie={saisie} onChange={setSaisie} libelle={s.libelle} />
            ) : (
              <textarea
                className="field"
                rows={type === "texte" || type === "nombre" ? 2 : type === "libre" ? 5 : 8}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                aria-label={`Modifier : ${s.libelle}`}
                spellCheck={type !== "json"}
              />
            )}
            <p className="tiny-note">
              {type === "lignes"
                ? "Un élément par ligne."
                : type === "json" && !FORMULAIRES_LISTE[s.cle]
                  ? "Format structuré (JSON) : le serveur le vérifie avant de l'enregistrer."
                  : type === "style"
                    ? "La clause de style est ajoutée telle quelle aux prompts d'images du projet (en anglais, une ou deux phrases)."
                    : null}
            </p>
            {erreur ? (
              <p className="tiny-note ag-erreur" role="alert">
                {erreur}
              </p>
            ) : null}
            <div className="gd-row">
              <button type="button" className="btn btn-primary btn-mini" onClick={enregistrer} disabled={envoi || desactive}>
                {envoi ? "…" : "Enregistrer"}
              </button>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setEdition(false)} disabled={envoi}>
                Annuler
              </button>
              <span className="tiny-note">Enregistrer passe cette section à « fourni ».</span>
            </div>
          </>
        ) : (
          <>
            <p className="ag-valeur">{valeurEnTexte(s.valeur)}</p>
            {onModifier ? (
              <button type="button" className="ag-modifier" onClick={ouvrir} disabled={desactive} aria-label={`Modifier : ${s.libelle}`}>
                <Icone nom="modifier" taille={14} /> Modifier
              </button>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
