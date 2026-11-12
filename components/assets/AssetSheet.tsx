"use client";

import "./assets.css";
import "@/components/brief/brief.css";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { definirValidation, modifierChampAsset, renommerAsset, supprimerAsset } from "@/app/assets/actions";
import { dupliquerAsset, retirerImageAsset } from "@/app/assets/essai-actions";
import { ICONE_TYPE_ASSET, Icone } from "@/components/ui/Icon";
import { LIBELLE_STATUT, LIBELLE_TYPE_ASSET, type LigneRegistre } from "@/lib/assets/registry-types";

/* ---------------------------------------------------------------------------------------------------------------
   The sheet of an asset is a stack of blocks, like the brief: a read block becomes an inline editor when clicked,
   one edit at a time (the context below holds the key of the block being edited).
   --------------------------------------------------------------------------------------------------------------- */

type Edition = { enCours: string | null; ouvrir: (cle: string) => void; fermer: () => void };
const EditionContext = createContext<Edition>({ enCours: null, ouvrir: () => {}, fermer: () => {} });

export function FicheProvider({ children }: { children: ReactNode }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const fermer = useCallback(() => setEnCours(null), []);
  return <EditionContext.Provider value={{ enCours, ouvrir: setEnCours, fermer }}>{children}</EditionContext.Provider>;
}

/** The « modifier » (edit) icon of a block: the WHOLE BLOCK is clickable (the button extends to the whole parent
 * `.bf-cliquable`, see brief.css). Stays a real button: keyboard focus, accessible name. */
function ZoneModifier({ cle, libelle }: { cle: string; libelle: string }) {
  const { enCours, ouvrir } = useContext(EditionContext);
  const verrou = enCours != null;
  return (
    <button type="button" className="bf-zone" aria-label={`Modifier : ${libelle}`} title={verrou ? "Enregistre ou annule la modification en cours" : "Modifier"} onClick={() => ouvrir(cle)} disabled={verrou}>
      <Icone nom="modifier" taille={18} />
    </button>
  );
}

/** A text of the sheet (description, prompt): read, then edited in place on click. Each block saves on its own. */
function BlocTexte({
  assetId,
  champ,
  libelle,
  valeur,
  vide,
  mono = false,
  nu = false,
  meta,
  children,
}: {
  assetId: number;
  champ: "description" | "promptGeneration";
  libelle: string;
  valeur: string;
  /** Placeholder text when the field is empty. */
  vide: string;
  mono?: boolean;
  /** No frame: the block lives in another card (the description, in the header). */
  nu?: boolean;
  /** Small note to the right of the title. */
  meta?: string;
  /** Tools under the text (read-only). */
  children?: ReactNode;
}) {
  const { enCours, fermer } = useContext(EditionContext);
  const edition = enCours === champ;
  const [saisie, setSaisie] = useState(valeur);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, startTransition] = useTransition();
  const id = `fiche-${champ}`;

  // On opening, the input restarts from the saved value.
  useEffect(() => {
    if (edition) {
      setSaisie(valeur);
      setErreur(null);
    }
  }, [edition, valeur]);

  const enregistrer = () =>
    startTransition(async () => {
      const r = await modifierChampAsset(assetId, { [champ]: saisie });
      if (r.ok) fermer();
      else setErreur(r.erreur);
    });

  if (edition) {
    return (
      <div className="as-edition">
        <div className="bf-editeur">
          <div className="bf-champ">
            <label htmlFor={id}>{libelle}</label>
            <textarea
              id={id}
              className={`field${mono ? " is-mono" : ""}`}
              autoFocus
              rows={mono ? 8 : 4}
              value={saisie}
              spellCheck
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") fermer();
                else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enregistrer();
              }}
            />
          </div>
          {erreur ? (
            <p className="bf-erreur" role="alert">
              {erreur}
            </p>
          ) : null}
          <div className="bf-editeur-ft">
            <button type="button" className="bf-btn bf-btn-or bf-press" onClick={enregistrer} disabled={envoi}>
              {envoi ? "…" : "Enregistrer"}
            </button>
            <button type="button" className="bf-btn bf-press" onClick={fermer} disabled={envoi}>
              Annuler
            </button>
            <span className="bf-aide" style={{ marginLeft: "auto" }}>
              Échap annule · Ctrl+Entrée enregistre
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`as-lecture bf-cliquable${nu ? " is-nu" : ""}`}>
      <div className="as-tete">
        <span className="bf-etiquette">{libelle}</span>
        {meta ? <span className="bf-aide">{meta}</span> : null}
        <ZoneModifier cle={champ} libelle={libelle} />
      </div>
      {valeur.trim() ? <p className={`as-texte${mono ? " is-mono" : ""}`}>{valeur}</p> : <p className="as-vide-texte">{vide}</p>}
      {children ? <div className="as-outils-bloc">{children}</div> : null}
    </div>
  );
}


/** The sheet title: the asset's name (editable on click). Renaming never touches the code (the identifier, shown next to the type). */
function NomAsset({ assetId, libelle }: { assetId: number; libelle: string }) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState(libelle);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, startTransition] = useTransition();

  const enregistrer = () =>
    startTransition(async () => {
      if (saisie.trim() === libelle) return setEdition(false);
      const r = await renommerAsset(assetId, saisie);
      if (r.ok) {
        setEdition(false);
        router.refresh();
      } else setErreur(r.erreur);
    });

  return (
    <>
      {edition ? (
        <input
          className="nom-champ"
          value={saisie}
          autoFocus
          maxLength={120}
          aria-label="Nom de l'asset"
          onChange={(e) => setSaisie(e.target.value)}
          onBlur={enregistrer}
          onKeyDown={(e) => {
            if (e.key === "Enter") enregistrer();
            else if (e.key === "Escape") {
              setSaisie(libelle);
              setEdition(false);
            }
          }}
          disabled={envoi}
        />
      ) : (
        <button
          type="button"
          className="nom-btn"
          title="Renommer (l'identifiant ne change pas)"
          onClick={() => {
            setSaisie(libelle);
            setErreur(null);
            setEdition(true);
          }}
        >
          <h1>{libelle}</h1>
          <span className="crayon">
            <Icone nom="modifier" taille={18} />
          </span>
        </button>
      )}
      {erreur ? (
        <span className="bf-erreur" role="alert">
          {erreur}
        </span>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
   Header: type and identifier, name, status (computed), actions — all visible —, description, appearances.
   --------------------------------------------------------------------------------------------------------------- */

export function EnteteAsset({
  projectId,
  assetId,
  code,
  libelle,
  type,
  statut,
  critique,
  description,
  aImage,
  blocageSuppression,
  redirectTo,
  children,
}: {
  /** Rendered under the description (the appearances). */
  children?: React.ReactNode;
  projectId: number;
  assetId: number;
  code: string;
  /** The displayed name (label, otherwise the readable code). */
  libelle: string;
  type: string;
  statut: LigneRegistre["statut"];
  critique: boolean;
  description: string;
  /** The asset has a file (it can be removed). */
  aImage: boolean;
  /** Why deletion is blocked, or null. */
  blocageSuppression: string | null;
  redirectTo: string;
}) {
  const router = useRouter();
  const [confirmer, setConfirmer] = useState<"supprimer" | "retirer" | null>(null);
  const [reflet, setReflet] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The status is computed; only validation is decided (and importing a file counts as validation).
  const basculerValidation = () =>
    startTransition(async () => {
      const valider = statut !== "valide";
      const r = await definirValidation(assetId, valider);
      if (r.ok) {
        setReflet(valider);
        router.refresh();
      } else setErreur(r.erreur);
    });

  const supprimer = () =>
    startTransition(async () => {
      const r = await supprimerAsset(assetId);
      if (r.ok) router.push(redirectTo);
      else setErreur(r.erreur);
    });

  const dupliquer = () =>
    startTransition(async () => {
      const r = await dupliquerAsset(assetId);
      if (r.ok) router.push(`/p/${projectId}/assets/${r.code}`);
      else setErreur(r.erreur);
    });

  const retirer = () =>
    startTransition(async () => {
      const r = await retirerImageAsset(assetId);
      setConfirmer(null);
      if (r.ok) router.refresh();
      else setErreur(r.erreur);
    });

  return (
    <section id="as-haut" className="tete" aria-label="Fiche de l'asset">
      <div>
        <div className="sur-titre">
          <span className="type">
            <Icone nom={ICONE_TYPE_ASSET[type] ?? "autre"} taille={14} />
            {LIBELLE_TYPE_ASSET[type] ?? type}
          </span>
          <span className="code" title="Identifiant technique : il ne change pas, même si le nom change">
            {code}
          </span>
        </div>
        <div className="nom">
          <NomAsset assetId={assetId} libelle={libelle} />
        </div>
        <div className="desc">
          <BlocTexte assetId={assetId} champ="description" libelle="Description" valeur={description} nu vide="Aucune description. Clique pour en écrire une." />
        </div>
      </div>

      <div className="etat-zone">
        <div className="etats">
          {critique ? (
            <span className="critique" title="Cité par assez de plans d'un épisode pour qu'une retouche se voie partout">
              <Icone nom="alerte" taille={13} />
              Critique
            </span>
          ) : null}
          <span key={`${statut}-${reflet}`} className={`pilule ${statut}${reflet && statut === "valide" ? " reflet" : ""}`}>
            <i />
            {LIBELLE_STATUT[statut]}
          </span>
        </div>
        <div className="actions-tete">
          {statut === "en_cours" ? (
            <button type="button" className="btn btn-trait btn-sm" onClick={basculerValidation} disabled={pending}>
              <Icone nom="valide" taille={15} /> Valider l&rsquo;image
            </button>
          ) : statut === "valide" ? (
            <button type="button" className="btn btn-fant btn-sm" onClick={basculerValidation} disabled={pending}>
              Retirer la validation
            </button>
          ) : null}
          <button type="button" className="btn btn-fant btn-sm" onClick={dupliquer} disabled={pending} title="Une copie à retoucher sans toucher à l'original">
            <Icone nom="copier" taille={15} /> Dupliquer
          </button>
          {aImage ? (
            confirmer === "retirer" ? (
              <span className="confirme-ligne">
                <button type="button" className="btn btn-danger btn-sm" onClick={retirer} disabled={pending}>
                  Retirer pour de bon
                </button>
                <button type="button" className="btn btn-fant btn-sm" onClick={() => setConfirmer(null)}>
                  Garder
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-fant btn-sm" onClick={() => setConfirmer("retirer")} disabled={pending} title="Efface l'image : le prochain essai repartira de zéro">
                <Icone nom="effacer" taille={15} /> Retirer l&rsquo;image
              </button>
            )
          ) : null}
          {confirmer === "supprimer" ? (
            <span className="confirme-ligne">
              <button type="button" className="btn btn-danger btn-sm" onClick={supprimer} disabled={pending}>
                {pending ? "…" : `Supprimer ${code}`}
              </button>
              <button type="button" className="btn btn-fant btn-sm" onClick={() => setConfirmer(null)}>
                Garder
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmer("supprimer")} disabled={pending || blocageSuppression != null}>
              <Icone nom="supprimer" taille={15} /> Supprimer
            </button>
          )}
        </div>
        {blocageSuppression ? <p className="refus">{blocageSuppression}</p> : null}
        {erreur ? (
          <p className="bf-erreur" role="alert">
            {erreur}
          </p>
        ) : null}
      </div>

      {children}
    </section>
  );
}
