"use client";

import "./assets.css";
import "@/components/brief/brief.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { modifierChampAsset, supprimerAsset, updateAssetStatut } from "@/app/assets/actions";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { Icone } from "@/components/ui/Icone";
import { CANDIDATS_GARDES } from "@/lib/asset-generation";
import { LIBELLE_METHODE, methodeApplicable } from "@/lib/assetCode";
import { urlMiniature } from "@/lib/miniatures";
import type { GenerationVue } from "@/lib/queries-generations";
import { LIBELLE_STATUT, LIBELLE_TYPE_ASSET, type LigneRegistre } from "@/lib/registre-types";

/* ---------------------------------------------------------------------------------------------------------------
   La fiche d'un asset est une pile de blocs, comme le brief : un bloc de lecture devient un éditeur sur place quand on
   le clique, une seule modification à la fois (le contexte ci-dessous tient la clé du bloc en cours d'édition).
   --------------------------------------------------------------------------------------------------------------- */

type Edition = { enCours: string | null; ouvrir: (cle: string) => void; fermer: () => void };
const EditionContext = createContext<Edition>({ enCours: null, ouvrir: () => {}, fermer: () => {} });

export function FicheProvider({ children }: { children: ReactNode }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const fermer = useCallback(() => setEnCours(null), []);
  return <EditionContext.Provider value={{ enCours, ouvrir: setEnCours, fermer }}>{children}</EditionContext.Provider>;
}

/** L'icône « modifier » d'un bloc : c'est le BLOC ENTIER qui est cliquable (le bouton s'étend à tout le parent
 * `.bf-cliquable`, voir brief.css). Reste un vrai bouton : focus clavier, nom accessible. */
function ZoneModifier({ cle, libelle }: { cle: string; libelle: string }) {
  const { enCours, ouvrir } = useContext(EditionContext);
  const verrou = enCours != null;
  return (
    <button type="button" className="bf-zone" aria-label={`Modifier : ${libelle}`} title={verrou ? "Enregistre ou annule la modification en cours" : "Modifier"} onClick={() => ouvrir(cle)} disabled={verrou}>
      <Icone nom="modifier" taille={18} />
    </button>
  );
}

/** Un texte de la fiche (description, prompt) : lecture, puis édition sur place au clic. Chaque bloc s'enregistre seul. */
export function BlocTexte({
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
  /** Texte d'invite quand le champ est vide. */
  vide: string;
  mono?: boolean;
  /** Sans cadre : le bloc vit dans une autre carte (la description, dans l'en-tête). */
  nu?: boolean;
  /** Petite précision à droite du titre. */
  meta?: string;
  /** Outils sous le texte (en lecture seulement). */
  children?: ReactNode;
}) {
  const { enCours, fermer } = useContext(EditionContext);
  const edition = enCours === champ;
  const [saisie, setSaisie] = useState(valeur);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, startTransition] = useTransition();
  const id = `fiche-${champ}`;

  // À l'ouverture, la saisie repart de la valeur enregistrée.
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

/** Ferme un menu au clic ailleurs et sur Échap. */
function useFermetureExterieure(ref: RefObject<HTMLElement | null>, ouvert: boolean, fermer: () => void) {
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) fermer();
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert, fermer, ref]);
}

/* ---------------------------------------------------------------------------------------------------------------
   En-tête : code, type, criticité, statut, agent, actions — et la description, modifiable au clic.
   --------------------------------------------------------------------------------------------------------------- */

export function EnteteAsset({
  projectId,
  assetId,
  code,
  type,
  statut,
  critique,
  description,
  departCode,
  blocageSuppression,
  redirectTo,
  casting,
}: {
  projectId: number;
  assetId: number;
  code: string;
  type: string;
  statut: LigneRegistre["statut"];
  critique: boolean;
  description: string;
  /** Asset dont l'image sert de départ à celui-ci, ou null. */
  departCode: string | null;
  /** Pourquoi la suppression est bloquée, ou null. */
  blocageSuppression: string | null;
  redirectTo: string;
  /** Lien vers le casting (asset de type voix), sinon null. */
  casting: string | null;
}) {
  const router = useRouter();
  const [crit, setCrit] = useState(critique);
  const [statutLocal, setStatutLocal] = useState(statut);
  const [menu, setMenu] = useState<"statut" | "plus" | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const statutRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCrit(critique), [critique]);
  useEffect(() => setStatutLocal(statut), [statut]);

  const fermerStatut = useCallback(() => setMenu((m) => (m === "statut" ? null : m)), []);
  const fermerPlus = useCallback(() => {
    setMenu((m) => (m === "plus" ? null : m));
    setConfirmer(false);
  }, []);
  useFermetureExterieure(statutRef, menu === "statut", fermerStatut);
  useFermetureExterieure(plusRef, menu === "plus", fermerPlus);

  const basculerCritique = () => {
    const suivant = !crit;
    setCrit(suivant);
    startTransition(async () => {
      const r = await modifierChampAsset(assetId, { critique: suivant });
      if (!r.ok) {
        setCrit(!suivant);
        setErreur(r.erreur);
      }
    });
  };

  const choisirStatut = (s: LigneRegistre["statut"]) => {
    setMenu(null);
    setStatutLocal(s);
    startTransition(() => updateAssetStatut(assetId, s));
  };

  const supprimer = () =>
    startTransition(async () => {
      const r = await supprimerAsset(assetId);
      if (r.ok) router.push(redirectTo);
      else setErreur(r.erreur);
    });

  return (
    <section id="as-haut" className="as-haut">
      <div className="as-titre-ligne">
        <h1>{code}</h1>
        <span className="as-etiquette">{LIBELLE_TYPE_ASSET[type] ?? type}</span>
        {departCode ? (
          <Link className="as-etiquette" href={`/p/${projectId}/assets/${departCode}`} title="L'image de cet asset est partie de celle-ci" style={{ color: "var(--or-glow)", borderColor: "var(--or-soft)", textDecoration: "none" }}>
            à partir de {departCode}
          </Link>
        ) : null}
        <button type="button" className="as-critique" aria-pressed={crit} onClick={basculerCritique} title="Un asset critique est signalé en rouge dans le registre">
          <i />
          {crit ? "Critique" : "Marquer critique"}
        </button>

        <div className="as-droite">
          {casting ? (
            <Link href={casting} className="btn btn-gold btn-sm">
              Modifier au casting
            </Link>
          ) : null}
          <div className="as-menu" ref={statutRef}>
            <button type="button" className={`as-pilule is-${statutLocal}`} aria-haspopup="menu" aria-expanded={menu === "statut"} onClick={() => setMenu(menu === "statut" ? null : "statut")}>
              <i />
              {LIBELLE_STATUT[statutLocal]}
              <Icone nom="bas" taille={13} />
            </button>
            {menu === "statut" ? (
              <div className="as-popover" role="menu">
                {(["a_produire", "en_cours", "valide"] as const).map((s) => (
                  <button key={s} type="button" role="menuitem" className={`as-option is-${s}`} onClick={() => choisirStatut(s)}>
                    <i />
                    {LIBELLE_STATUT[s]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <BoutonAgent
            className="btn btn-gold btn-sm"
            demande={{ projectId, portee: "asset", cible: { code }, profondeur: "courte", libelle: code }}
            titre="Demander à l'agent de réécrire la fiche ou le prompt de cet asset"
          />
          <div className="as-menu" ref={plusRef}>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={menu === "plus"} onClick={() => setMenu(menu === "plus" ? null : "plus")}>
              <Icone nom="plus" taille={16} />
            </button>
            {menu === "plus" ? (
              <div className="as-popover" role="menu">
                {confirmer ? (
                  <div className="as-confirm">
                    <span>Supprimer définitivement {code} ?</span>
                    <div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmer(false)} disabled={pending}>
                        Annuler
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={supprimer} disabled={pending}>
                        {pending ? "…" : "Supprimer"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" role="menuitem" className="as-option is-danger" disabled={blocageSuppression != null} onClick={() => setConfirmer(true)}>
                    <Icone nom="supprimer" taille={15} />
                    <span>
                      Supprimer
                      {blocageSuppression ? <small>{blocageSuppression}</small> : null}
                    </span>
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {erreur ? (
        <p className="bf-erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      <div className="as-desc">
        <BlocTexte assetId={assetId} champ="description" libelle="Description" valeur={description} nu vide="Aucune description. Clique pour en écrire une." />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
   Génération : réglages (méthode, durée d'un son), bouton de lancement, rendus.
   --------------------------------------------------------------------------------------------------------------- */

export function ReglagesAsset({
  assetId,
  type,
  methodeGeneration,
  departCode,
  dureeSecondes,
  promptVide,
  children,
}: {
  assetId: number;
  type: string;
  methodeGeneration: string | null;
  departCode: string | null;
  dureeSecondes: number | null;
  promptVide: boolean;
  /** Le bouton « Générer… » (fenêtre de génération), posé par la page. */
  children: ReactNode;
}) {
  const [methode, setMethode] = useState(methodeGeneration ?? "");
  const [duree, setDuree] = useState(dureeSecondes != null ? String(dureeSecondes) : "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => setMethode(methodeGeneration ?? ""), [methodeGeneration]);
  useEffect(() => setDuree(dureeSecondes != null ? String(dureeSecondes) : ""), [dureeSecondes]);

  const enregistrer = (champs: Parameters<typeof modifierChampAsset>[1]) =>
    startTransition(async () => {
      const r = await modifierChampAsset(assetId, champs);
      setErreur(r.ok ? null : r.erreur);
    });

  return (
    <div className="as-carte-bloc">
      <div className="as-tete">
        <span className="bf-etiquette">Réglages</span>
      </div>
      <dl className="as-reglages">
        {methodeApplicable(type) ? (
          <>
            <dt>Méthode</dt>
            <dd>
              <select
                className="field"
                value={methode}
                aria-label="Méthode de fabrication"
                onChange={(e) => {
                  setMethode(e.target.value);
                  enregistrer({ methodeGeneration: e.target.value || null });
                }}
              >
                <option value="">— génération (par défaut)</option>
                <option value="generation">{LIBELLE_METHODE.generation}</option>
                <option value="edition">{LIBELLE_METHODE.edition}</option>
              </select>
            </dd>
          </>
        ) : null}
        {departCode ? (
          <>
            <dt>Départ</dt>
            <dd>image de {departCode}</dd>
          </>
        ) : null}
        {type === "sfx" ? (
          <>
            <dt>Durée</dt>
            <dd>
              <input
                className="field"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={duree}
                aria-label="Durée du son en secondes"
                placeholder="ex. 4"
                style={{ width: 96 }}
                onChange={(e) => setDuree(e.target.value)}
                onBlur={() => enregistrer({ dureeSecondes: duree.trim() === "" ? null : Number(duree.replace(",", ".")) })}
              />
              <span className="bf-aide">secondes</span>
            </dd>
          </>
        ) : null}
      </dl>
      <p className="bf-aide">
        {methode === "edition"
          ? "Édition : l'image part d'une ou plusieurs images existantes (jusqu'à 3), choisies dans la fenêtre de génération."
          : "Génération : l'image se fabrique de zéro à partir du prompt."}
      </p>
      {erreur ? (
        <p className="bf-erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      <div className="as-lancer">
        {children}
        <small>{promptVide ? "Écris d'abord un prompt." : "La fenêtre propose le mode, les images sources et le format."}</small>
      </div>
    </div>
  );
}

/** Les candidats déjà générés : on en adopte un (il remplace l'image et le prompt de l'asset) ou on le jette. La
 * provenance de chacun est dite : les images sources qui l'ont produit. */
export function RendusAsset({ generations }: { generations: GenerationVue[] }) {
  const termines = generations.filter((g) => g.statut === "termine" && g.src);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const adopter = (id: number) =>
    startTransition(async () => {
      const r = await adopterGeneration(id);
      setRetour(r.ok ? { ok: true, texte: "Image et prompt adoptés : l'asset repasse « en cours », à revalider." } : { ok: false, texte: r.erreur });
    });
  const jeter = (id: number) =>
    startTransition(async () => {
      const r = await supprimerGeneration(id);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
    });

  return (
    <div className="as-carte-bloc">
      <div className="as-tete">
        <span className="bf-etiquette">Candidats</span>
        <span className="bf-aide">
          {termines.length}/{CANDIDATS_GARDES}
        </span>
      </div>
      {termines.length === 0 ? (
        <p className="bf-aide" style={{ fontSize: 14 }}>
          Aucun candidat pour l&rsquo;instant. Chaque génération arrive ici : tu choisis lequel devient l&rsquo;image de l&rsquo;asset.
        </p>
      ) : (
        <ul className="as-rendus">
          {termines.map((g) => (
            <li key={g.id}>
              <span className="as-vignette">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlMiniature(g.src!, 192)} alt="" loading="lazy" decoding="async" />
              </span>
              <span className="as-d">
                <span suppressHydrationWarning>{new Date(g.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <small>
                  {g.methode === "edition"
                    ? `à partir de ${g.sources.length ? g.sources.join(" + ") : "images"}`
                    : `${g.aspect} · ${String(g.megapixels).replace(".", ",")} MP · texte seul`}
                </small>
              </span>
              <span className="as-acts">
                <button type="button" className="btn btn-gold btn-sm" onClick={() => adopter(g.id)} disabled={pending}>
                  Utiliser
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => jeter(g.id)} disabled={pending} aria-label="Supprimer ce candidat" title="Supprimer ce candidat">
                  <Icone nom="supprimer" taille={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {retour ? (
        <p className="as-retour" role={retour.ok ? "status" : "alert"} style={{ color: retour.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
          {retour.texte}
        </p>
      ) : null}
    </div>
  );
}

/** Copie un texte dans le presse-papiers (le retour se lit sur le bouton lui-même). */
export function BoutonCopier({ texte, libelle = "Copier" }: { texte: string; libelle?: string }) {
  const [etat, setEtat] = useState<"repos" | "ok" | "echec">("repos");
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setEtat("ok");
    } catch {
      setEtat("echec");
    }
    window.setTimeout(() => setEtat("repos"), 1600);
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copier} disabled={!texte.trim()}>
      <Icone nom={etat === "ok" ? "valide" : "copier"} taille={14} /> {etat === "ok" ? "Copié" : etat === "echec" ? "Copie impossible" : libelle}
    </button>
  );
}
