"use client";

import "./brief.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { modifierChampBrief } from "@/app/agents/actions";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { Icone } from "@/components/ui/Icone";
import { decompterStatuts } from "@/lib/agents-affichage";
import { SECTIONS_BRIEF, type StatutChamp, type VueBrief } from "@/lib/agents/types";
import { EditeurBrief } from "./EditeurBrief";
import { Sommaire, type EntreeSommaire } from "./Sommaire";
import { PROVENANCE, memeEdition, provenanceElement, provenanceSection, type Edition, type Provenance } from "./types";

type Objet = Record<string, unknown>;

/** Où se trouve, dans la page, le bloc d'une section du brief (pour y faire défiler depuis « À confirmer »). */
const ANCRES: Record<string, string> = {
  titre: "bf-haut",
  arc: "bf-haut",
  genreTon: "bf-haut",
  langueDialogues: "bf-haut",
  dureeEpisodeSecondes: "bf-haut",
  style: "bf-style",
  episodes: "bf-episodes",
  personnages: "bf-personnages",
  lieux: "bf-lieux",
  continuite: "bf-contraintes",
  rimes: "bf-contraintes",
  progressions: "bf-contraintes",
  pieges: "bf-contraintes",
  notes: "bf-notes",
};
/** Listes d'objets éditées élément par élément (voir FORMULAIRES_LISTE). */
const LISTES_OBJETS = ["episodes", "personnages", "lieux", "rimes", "progressions", "pieges"];

function Prov({ etat }: { etat: Provenance }) {
  return (
    <span className={`bf-prov is-${etat}`}>
      <span aria-hidden="true">{PROVENANCE[etat].symbole}</span> {PROVENANCE[etat].libelle}
    </span>
  );
}

/** L'icône « modifier » d'un bloc, sans cadre : c'est le BLOC ENTIER qui est cliquable (le bouton s'étend à tout le
 * parent `.bf-cliquable`, voir brief.css) et il passe en édition sur place. Reste un vrai bouton : focus clavier, nom accessible. */
function Zone({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="bf-zone" aria-label={`Modifier : ${label}`} title={disabled ? "Enregistre ou annule la modification en cours" : "Modifier"} onClick={onClick} disabled={disabled}>
      <Icone nom="modifier" taille={18} />
    </button>
  );
}

function BoutonAjouter({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="bf-btn bf-press" onClick={onClick} disabled={disabled}>
      <Icone nom="ajouter" taille={16} /> {label}
    </button>
  );
}

function TitreSection({ id, titre, children }: { id: string; titre: string; children?: React.ReactNode }) {
  return (
    <div className="bf-section-hd">
      <h2 id={id}>{titre}</h2>
      <hr className="bf-rule" />
      {children}
    </div>
  );
}

/** La page du brief : un dossier de production lisible d'un coup d'œil. Un clic sur un bloc le passe en édition SUR PLACE
 * (une seule modification à la fois) ; ce que l'agent n'a pas pu trancher, ses ajouts et ses questions sont réunis dans
 * « Notes de l'agent », sous « D'où vient ce brief ». */
export function BriefDossier({ projectId, nomProjet, brief }: { projectId: number; nomProjet: string; brief: VueBrief }) {
  const router = useRouter();
  const c = brief.contenu;
  const donnees = c as unknown as Record<string, unknown>;
  const [edition, setEdition] = useState<Edition | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [alerte, setAlerte] = useState<string | null>(null);

  const statut = (cle: string): StatutChamp => brief.sections.find((s) => s.cle === cle)?.statut ?? "deduit";
  const libelle = (cle: string) => SECTIONS_BRIEF.find((s) => s.cle === cle)?.libelle ?? cle;
  const liste = (cle: string): Objet[] => (Array.isArray(donnees[cle]) ? (donnees[cle] as Objet[]) : []);
  const lignes = (cle: string): string[] => (Array.isArray(donnees[cle]) ? (donnees[cle] as unknown[]).map(String) : []);
  const nombres = decompterStatuts(brief.sections);
  const texte = (v: unknown) => (typeof v === "string" ? v : "");

  const personnages = liste("personnages");
  const lieux = liste("lieux");
  const episodes = liste("episodes");
  const rimes = liste("rimes");
  const progressions = liste("progressions");
  const pieges = liste("pieges");
  const notes = texte(donnees.notes);

  // --- Écritures (tout passe par modifierChampBrief : la section écrite passe à « fourni ») ---
  const enregistrer = async (cle: string, valeur: unknown): Promise<string | null> => {
    setOccupe(true);
    try {
      const r = await modifierChampBrief(projectId, cle, valeur);
      if (!r.ok) return r.erreur;
      router.refresh();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erreur inattendue.";
    } finally {
      setOccupe(false);
    }
  };
  const agir = async (action: () => Promise<string | null>) => {
    setAlerte(null);
    const message = await action();
    if (message) setAlerte(message);
  };
  const confirmerElement = (cle: string, index: number) => enregistrer(cle, liste(cle).map((x, i) => (i === index ? { ...x, statut: "fourni" } : x)));
  const confirmerSection = (cle: string) => enregistrer(cle, donnees[cle]);
  const retirer = (e: Edition): Promise<string | null> => {
    if (e.type === "element")
      return enregistrer(
        e.cle,
        liste(e.cle).filter((_, i) => i !== e.index),
      );
    if (e.type === "ligne")
      return enregistrer(
        e.cle,
        lignes(e.cle).filter((_, i) => i !== e.index),
      );
    return Promise.resolve(null);
  };
  const confirmer = (e: Edition): Promise<string | null> => (e.type === "element" ? confirmerElement(e.cle, e.index) : e.type === "section" ? confirmerSection(e.cle) : Promise.resolve(null));

  // --- Édition sur place ---
  const S = (cle: string): Edition => ({ type: "section", cle, titre: libelle(cle) });
  const E = (cle: string, index: number): Edition => ({ type: "element", cle, index });
  const L = (cle: string, index: number): Edition => ({ type: "ligne", cle, index });
  const enCours = (e: Edition) => memeEdition(edition, e);
  const verrou = occupe || edition !== null;
  const aConfirmerEdition = (e: Edition) => (e.type === "element" ? liste(e.cle)[e.index]?.statut === "incertain" : e.type === "section" ? statut(e.cle) === "a_valider" : false);
  const editeur = (e: Edition) => (
    <EditeurBrief
      key={`${e.type}-${e.cle}-${e.type === "section" ? "" : e.index}`}
      edition={e}
      contenu={c}
      etatAConfirmer={aConfirmerEdition(e)}
      onFermer={() => setEdition(null)}
      onEnregistrer={enregistrer}
      onRetirer={retirer}
      onConfirmer={confirmer}
    />
  );
  const aller = (id: string) => {
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "center" }), 30);
  };

  /** Lignes de texte (continuité, ajouts de l'agent, questions) : même mécanique que les autres listes, une ligne à la fois. */
  const lignesJSX = (cle: string, vide: string) => {
    const items = lignes(cle);
    return (
      <>
        {items.length === 0 && !enCours(L(cle, 0)) ? <p className="bf-vide">{vide}</p> : null}
        {items.map((t, i) =>
          enCours(L(cle, i)) ? (
            <div key={i} className="bf-ligne bf-edition-ligne">
              {editeur(L(cle, i))}
            </div>
          ) : (
            <div key={i} className="bf-ligne bf-cliquable">
              <p className="bf-puce">{t}</p>
              <Zone label={t} onClick={() => setEdition(L(cle, i))} disabled={verrou} />
            </div>
          ),
        )}
        {enCours(L(cle, items.length)) ? <div className="bf-ligne bf-edition-ligne">{editeur(L(cle, items.length))}</div> : null}
      </>
    );
  };

  // Ce que l'agent n'a pas pu trancher : éléments « incertains » et sections à valider.
  const aConfirmer: { cle: string; type: string; titre: string; detail: string; confirmer: () => Promise<string | null>; ouvrir: () => void }[] = [];
  personnages.forEach((p, i) => {
    if (p.statut === "incertain")
      aConfirmer.push({
        cle: `p${i}`,
        type: "Personnage",
        titre: texte(p.nom),
        detail: "L'agent n'est pas sûr du rôle ni de la voix.",
        confirmer: () => confirmerElement("personnages", i),
        ouvrir: () => {
          setEdition(E("personnages", i));
          aller(`bf-personnages-${i}`);
        },
      });
  });
  lieux.forEach((l, i) => {
    if (l.statut === "incertain")
      aConfirmer.push({
        cle: `l${i}`,
        type: "Lieu",
        titre: texte(l.nom),
        detail: "Description à valider.",
        confirmer: () => confirmerElement("lieux", i),
        ouvrir: () => {
          setEdition(E("lieux", i));
          aller(`bf-lieux-${i}`);
        },
      });
  });
  for (const s of brief.sections) {
    if (s.statut === "a_valider" && !["personnages", "lieux", "inventions", "questionsOuvertes"].includes(s.cle))
      aConfirmer.push({
        cle: `s-${s.cle}`,
        type: "Section",
        titre: s.libelle,
        detail: "Inventée ou incertaine : à relire.",
        confirmer: () => confirmerSection(s.cle),
        ouvrir: () => {
          if (LISTES_OBJETS.includes(s.cle) && liste(s.cle).length > 0) setEdition(E(s.cle, 0));
          else if (!["continuite"].includes(s.cle)) setEdition(S(s.cle));
          aller(ANCRES[s.cle] ?? "bf-haut");
        },
      });
  }

  const faits: { cle: string; label: string; valeur: string }[] = [
    { cle: "langueDialogues", label: "Langue des dialogues", valeur: texte(c.langueDialogues) },
    { cle: "dureeEpisodeSecondes", label: "Durée d'un épisode", valeur: c.dureeEpisodeSecondes ? `${c.dureeEpisodeSecondes} s` : "" },
    { cle: "genreTon", label: "Genre et ton", valeur: texte(c.genreTon) },
  ];

  const inventions = lignes("inventions");
  const entrees: EntreeSommaire[] = [
    { id: "bf-haut", label: "Vue d'ensemble" },
    { id: "bf-agent", label: "Notes de l'agent", ...(aConfirmer.length > 0 ? { aConfirmer: true } : { compte: inventions.length + lignes("questionsOuvertes").length }) },
    { id: "bf-style", label: "Style" },
    { id: "bf-episodes", label: "Épisodes", compte: episodes.length },
    { id: "bf-personnages", label: "Personnages", compte: personnages.length },
    { id: "bf-lieux", label: "Lieux", compte: lieux.length },
    { id: "bf-contraintes", label: "Contraintes" },
    { id: "bf-notes", label: "Notes du projet" },
  ];

  return (
    <div className="bf-page">
      {alerte ? (
        <p className="bf-erreur" role="alert">
          {alerte}
        </p>
      ) : null}

      <div className="bf-layout">
        <Sommaire entrees={entrees} />

        <div className="bf-contenu">
          <section id="bf-haut" className="bf-hero">
            <div className="bf-hero-texte">
              <p className="bf-etiquette bf-in bf-d1">Brief du projet · {brief.statut === "brouillon" ? "brouillon" : `version ${brief.version}`}</p>

              {enCours(S("titre")) ? (
                <div className="bf-edition bf-bloc">{editeur(S("titre"))}</div>
              ) : (
                <div className="bf-titre-ligne bf-cliquable bf-in bf-d2">
                  <h1>{c.titre || nomProjet}</h1>
                  <Zone label="le titre" onClick={() => setEdition(S("titre"))} disabled={verrou} />
                </div>
              )}
              <span className="bf-filet" aria-hidden="true" />

              {enCours(S("arc")) ? (
                <div className="bf-edition bf-bloc">{editeur(S("arc"))}</div>
              ) : (
                <div className="bf-arc-bloc bf-cliquable bf-in bf-d3">
                  <div className="bf-tete">
                    <span className="bf-etiquette">L&rsquo;arc</span>
                    <Prov etat={provenanceSection(statut("arc"))} />
                    <Zone label="l'arc" onClick={() => setEdition(S("arc"))} disabled={verrou} />
                  </div>
                  <p className="bf-arc">{texte(c.arc) || "Pas encore d'arc."}</p>
                </div>
              )}

              <div className="bf-faits bf-in bf-d4">
                {faits.map((f) =>
                  enCours(S(f.cle)) ? (
                    <div key={f.cle} className="bf-fait bf-edition">
                      {editeur(S(f.cle))}
                    </div>
                  ) : (
                    <div key={f.cle} className="bf-fait bf-cliquable">
                      <div className="bf-tete">
                        <span className="bf-etiquette">{f.label}</span>
                        <Prov etat={provenanceSection(statut(f.cle))} />
                        <Zone label={f.label} onClick={() => setEdition(S(f.cle))} disabled={verrou} />
                      </div>
                      <span className={`bf-fait-valeur${f.valeur ? "" : " is-vide"}`}>{f.valeur || "À définir"}</span>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="bf-colonne">
              <aside className="bf-provenance bf-in bf-d3">
                <h2>D&rsquo;où vient ce brief</h2>
                <div className="bf-chiffres">
                  <div>
                    <span className="bf-pop">{nombres.fourni}</span>
                    <span>sections fournies par toi</span>
                  </div>
                  <div>
                    <span className="bf-pop is-neutre">{nombres.deduit}</span>
                    <span>déduites par l&rsquo;agent</span>
                  </div>
                </div>
                <ul className="bf-legende">
                  <li>
                    <span aria-hidden="true" className="is-fourni">●</span>
                    <span>
                      <b>Fourni</b> : écrit ou corrigé par toi.
                    </span>
                  </li>
                  <li>
                    <span aria-hidden="true">○</span>
                    <span>
                      <b>Déduit</b> : tiré de ton pitch par l&rsquo;agent.
                    </span>
                  </li>
                  <li>
                    <span aria-hidden="true" className="is-confirmer">◇</span>
                    <span>
                      <b>À confirmer</b> : l&rsquo;agent n&rsquo;est pas sûr.
                    </span>
                  </li>
                </ul>
                <div className="bf-aside-actions">
                  <BoutonAgent
                    className="bf-btn bf-btn-or bf-btn-grand bf-press"
                    libelle="Reprendre avec l'agent"
                    demande={{ projectId, portee: "projet", cible: null, profondeur: "complete", libelle: nomProjet }}
                  />
                  <p className="bf-aide">Corriger une section la marque comme fournie.</p>
                </div>
              </aside>

              <section id="bf-agent" className="bf-agent bf-in bf-d4" aria-labelledby="bf-t-agent">
                <header className="bf-agent-hd">
                  <h2 id="bf-t-agent">Notes de l&rsquo;agent</h2>
                  {aConfirmer.length > 0 ? (
                    <span className="bf-prov is-confirmer">
                      <span className="bf-pulse" aria-hidden="true">◇</span> {aConfirmer.length} à confirmer
                    </span>
                  ) : null}
                </header>

                {aConfirmer.length > 0 ? (
                  <div className="bf-agent-groupe">
                    <h3>À confirmer</h3>
                    <p className="bf-aide">L&rsquo;agent n&rsquo;est pas sûr de ces éléments.</p>
                    {aConfirmer.map((a) => (
                      <div key={a.cle} className="bf-confirmer-ligne bf-cliquable">
                        <span className="bf-confirmer-texte">
                          <span className="bf-etiquette">{a.type}</span>
                          {a.titre}
                          <small>{a.detail}</small>
                        </span>
                        <span className="bf-confirmer-actions">
                          <button type="button" className="bf-btn bf-btn-or bf-press" disabled={verrou} onClick={() => agir(a.confirmer)}>
                            Confirmer
                          </button>
                          <Zone label={a.titre} onClick={a.ouvrir} disabled={verrou} />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="bf-agent-groupe">
                  <div className="bf-carte-hd">
                    <h3>Ce que l&rsquo;agent a ajouté</h3>
                    <span className="bf-pousse">
                      <BoutonAjouter label="Ajouter" onClick={() => setEdition(L("inventions", inventions.length))} disabled={verrou} />
                    </span>
                  </div>
                  <p className="bf-aide">Absent de ton pitch : à garder ou à retirer.</p>
                  {lignesJSX("inventions", "Rien d'ajouté.")}
                </div>

                <div className="bf-agent-groupe">
                  <div className="bf-carte-hd">
                    <h3>Questions encore ouvertes</h3>
                    <span className="bf-pousse">
                      <BoutonAjouter label="Ajouter" onClick={() => setEdition(L("questionsOuvertes", lignes("questionsOuvertes").length))} disabled={verrou} />
                    </span>
                  </div>
                  <p className="bf-aide">Ce que l&rsquo;agent aimerait te demander.</p>
                  {lignesJSX("questionsOuvertes", "Aucune question en suspens.")}
                </div>
              </section>
            </div>
          </section>

          <section id="bf-style" className="bf-section" aria-labelledby="bf-t-style">
            <TitreSection id="bf-t-style" titre="Style" />
            {enCours(S("style")) ? (
              <div className="bf-carte bf-edition">{editeur(S("style"))}</div>
            ) : (
              <div className="bf-carte bf-cliquable bf-reveal bf-style">
                <div className="bf-style-nom">
                  <div className="bf-tete">
                    <span className="bf-etiquette">Style nommé</span>
                    <Prov etat={provenanceSection(statut("style"))} />
                  </div>
                  <span className="bf-style-titre">{texte(c.style?.nom) || "Sans nom"}</span>
                  <p className="bf-aide">La clause est ajoutée aux prompts de génération d&rsquo;images.</p>
                </div>
                <div className="bf-style-clause">
                  <div className="bf-tete">
                    <span className="bf-etiquette">Clause de style (anglais)</span>
                    <Zone label="le style et sa clause" onClick={() => setEdition(S("style"))} disabled={verrou} />
                  </div>
                  <p lang="en" className="bf-clause">
                    {texte(c.style?.clause) || "—"}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section id="bf-episodes" className="bf-section" aria-labelledby="bf-t-episodes">
            <TitreSection id="bf-t-episodes" titre="Épisodes">
              <BoutonAjouter label="Ajouter" onClick={() => setEdition(E("episodes", episodes.length))} disabled={verrou} />
            </TitreSection>
            {episodes.length === 0 && !enCours(E("episodes", 0)) ? <p className="bf-vide">Aucun épisode dans le brief.</p> : null}
            <div className="bf-pile">
              {episodes.map((e, i) =>
                enCours(E("episodes", i)) ? (
                  <article key={i} className="bf-carte bf-edition">
                    {editeur(E("episodes", i))}
                  </article>
                ) : (
                  <article key={i} className="bf-carte bf-cliquable bf-reveal bf-episode">
                    <span className="bf-episode-no">E{String(i + 1).padStart(2, "0")}</span>
                    <div className="bf-episode-corps">
                      <div className="bf-tete">
                        <h3>{texte(e.titre) || "Sans titre"}</h3>
                        <Prov etat={provenanceSection(statut("episodes"))} />
                      </div>
                      <p>{texte(e.resume)}</p>
                      {texte(e.portee) ? <p className="bf-aide">{texte(e.portee)}</p> : null}
                    </div>
                    <Zone label={texte(e.titre) || `épisode ${i + 1}`} onClick={() => setEdition(E("episodes", i))} disabled={verrou} />
                  </article>
                ),
              )}
              {enCours(E("episodes", episodes.length)) ? <article className="bf-carte bf-edition">{editeur(E("episodes", episodes.length))}</article> : null}
            </div>
          </section>

          <section id="bf-personnages" className="bf-section" aria-labelledby="bf-t-personnages">
            <TitreSection id="bf-t-personnages" titre="Personnages">
              <BoutonAjouter label="Ajouter" onClick={() => setEdition(E("personnages", personnages.length))} disabled={verrou} />
            </TitreSection>
            {personnages.length === 0 && !enCours(E("personnages", 0)) ? <p className="bf-vide">Aucun personnage dans le brief.</p> : null}
            <div className="bf-grille">
              {personnages.map((p, i) =>
                enCours(E("personnages", i)) ? (
                  <article key={i} id={`bf-personnages-${i}`} className="bf-carte bf-edition">
                    {editeur(E("personnages", i))}
                  </article>
                ) : (
                  <article key={i} id={`bf-personnages-${i}`} className="bf-carte bf-cliquable bf-reveal">
                    <header className="bf-perso-hd">
                      <span className="bf-monogramme" aria-hidden="true">
                        {(texte(p.nom).trim()[0] ?? "?").toUpperCase()}
                      </span>
                      <div>
                        <div className="bf-tete">
                          <h3>{texte(p.nom) || "Sans nom"}</h3>
                          <Prov etat={provenanceElement(p.statut, provenanceSection(statut("personnages")))} />
                        </div>
                        <p>{texte(p.role)}</p>
                      </div>
                      <Zone label={texte(p.nom) || `personnage ${i + 1}`} onClick={() => setEdition(E("personnages", i))} disabled={verrou} />
                    </header>
                    <dl className="bf-def">
                      <dt>Reconnaissable</dt>
                      <dd>{texte(p.reconnaissable) || "—"}</dd>
                      <dt>Voix</dt>
                      <dd>{texte(p.voix) || "—"}</dd>
                    </dl>
                  </article>
                ),
              )}
              {enCours(E("personnages", personnages.length)) ? <article className="bf-carte bf-edition">{editeur(E("personnages", personnages.length))}</article> : null}
            </div>
          </section>

          <section id="bf-lieux" className="bf-section" aria-labelledby="bf-t-lieux">
            <TitreSection id="bf-t-lieux" titre="Lieux">
              <BoutonAjouter label="Ajouter" onClick={() => setEdition(E("lieux", lieux.length))} disabled={verrou} />
            </TitreSection>
            {lieux.length === 0 && !enCours(E("lieux", 0)) ? <p className="bf-vide">Aucun lieu dans le brief.</p> : null}
            <div className="bf-grille">
              {lieux.map((l, i) =>
                enCours(E("lieux", i)) ? (
                  <article key={i} id={`bf-lieux-${i}`} className="bf-carte bf-edition">
                    {editeur(E("lieux", i))}
                  </article>
                ) : (
                  <article key={i} id={`bf-lieux-${i}`} className="bf-carte bf-cliquable bf-reveal">
                    <header className="bf-perso-hd">
                      <div className="bf-tete">
                        <h3>{texte(l.nom) || "Sans nom"}</h3>
                        <Prov etat={provenanceElement(l.statut, provenanceSection(statut("lieux")))} />
                      </div>
                      <Zone label={texte(l.nom) || `lieu ${i + 1}`} onClick={() => setEdition(E("lieux", i))} disabled={verrou} />
                    </header>
                    <p>{texte(l.description)}</p>
                  </article>
                ),
              )}
              {enCours(E("lieux", lieux.length)) ? <article className="bf-carte bf-edition">{editeur(E("lieux", lieux.length))}</article> : null}
            </div>
          </section>

          <section id="bf-contraintes" className="bf-section" aria-labelledby="bf-t-contraintes">
            <TitreSection id="bf-t-contraintes" titre="Contraintes" />
            <div className="bf-grille bf-grille-large">
              <article className="bf-carte bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Règles de continuité</h3>
                  <Prov etat={provenanceSection(statut("continuite"))} />
                  <span className="bf-pousse">
                    <BoutonAjouter label="Ajouter" onClick={() => setEdition(L("continuite", lignes("continuite").length))} disabled={verrou} />
                  </span>
                </header>
                <p className="bf-aide">Ce qui doit rester identique d&rsquo;un plan à l&rsquo;autre.</p>
                {lignesJSX("continuite", "Aucune règle.")}
              </article>

              <article className="bf-carte bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Rimes</h3>
                  <Prov etat={provenanceSection(statut("rimes"))} />
                  <span className="bf-pousse">
                    <BoutonAjouter label="Ajouter" onClick={() => setEdition(E("rimes", rimes.length))} disabled={verrou} />
                  </span>
                </header>
                <p className="bf-aide">Deux moments qui se répondent à l&rsquo;image.</p>
                {rimes.length === 0 && !enCours(E("rimes", 0)) ? <p className="bf-vide">Aucune rime.</p> : null}
                {rimes.map((r, i) =>
                  enCours(E("rimes", i)) ? (
                    <div key={i} className="bf-ligne bf-edition-ligne">
                      {editeur(E("rimes", i))}
                    </div>
                  ) : (
                    <div key={i} className="bf-ligne bf-cliquable">
                      <div>
                        <p>{texte(r.description)}</p>
                        <p className="bf-aide">
                          À souligner à l&rsquo;image : <b>{r.souligner === true ? "oui" : "non"}</b>
                        </p>
                      </div>
                      <Zone label={`rime ${i + 1}`} onClick={() => setEdition(E("rimes", i))} disabled={verrou} />
                    </div>
                  ),
                )}
                {enCours(E("rimes", rimes.length)) ? <div className="bf-ligne bf-edition-ligne">{editeur(E("rimes", rimes.length))}</div> : null}
              </article>

              <article className="bf-carte bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Progressions</h3>
                  <Prov etat={provenanceSection(statut("progressions"))} />
                  <span className="bf-pousse">
                    <BoutonAjouter label="Ajouter" onClick={() => setEdition(E("progressions", progressions.length))} disabled={verrou} />
                  </span>
                </header>
                <p className="bf-aide">Ce qui évolue au fil de l&rsquo;épisode.</p>
                {progressions.length === 0 && !enCours(E("progressions", 0)) ? <p className="bf-vide">Aucune progression.</p> : null}
                {progressions.map((p, i) =>
                  enCours(E("progressions", i)) ? (
                    <div key={i} className="bf-ligne bf-edition-ligne">
                      {editeur(E("progressions", i))}
                    </div>
                  ) : (
                    <div key={i} className="bf-ligne bf-cliquable">
                      <div>
                        <p className="bf-or">{texte(p.quoi)}</p>
                        <p>{texte(p.evolution)}</p>
                      </div>
                      <Zone label={texte(p.quoi) || `progression ${i + 1}`} onClick={() => setEdition(E("progressions", i))} disabled={verrou} />
                    </div>
                  ),
                )}
                {enCours(E("progressions", progressions.length)) ? <div className="bf-ligne bf-edition-ligne">{editeur(E("progressions", progressions.length))}</div> : null}
              </article>

              <article className="bf-carte bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Pièges</h3>
                  <Prov etat={provenanceSection(statut("pieges"))} />
                  <span className="bf-pousse">
                    <BoutonAjouter label="Ajouter" onClick={() => setEdition(E("pieges", pieges.length))} disabled={verrou} />
                  </span>
                </header>
                <p className="bf-aide">Ce que les modèles font par défaut, et ce qu&rsquo;on décrit à la place.</p>
                {pieges.length === 0 && !enCours(E("pieges", 0)) ? <p className="bf-vide">Aucun piège.</p> : null}
                {pieges.map((p, i) =>
                  enCours(E("pieges", i)) ? (
                    <div key={i} className="bf-ligne bf-edition-ligne">
                      {editeur(E("pieges", i))}
                    </div>
                  ) : (
                    <div key={i} className="bf-ligne bf-cliquable">
                      <div className="bf-piege">
                        <p>
                          <span className="bf-etiquette">À éviter</span>
                          {texte(p.cliche)}
                        </p>
                        <p>
                          <span className="bf-etiquette">À faire plutôt</span>
                          {texte(p.formulationPositive)}
                        </p>
                      </div>
                      <Zone label={`piège ${i + 1}`} onClick={() => setEdition(E("pieges", i))} disabled={verrou} />
                    </div>
                  ),
                )}
                {enCours(E("pieges", pieges.length)) ? <div className="bf-ligne bf-edition-ligne">{editeur(E("pieges", pieges.length))}</div> : null}
              </article>
            </div>
          </section>

          <section id="bf-notes" className="bf-section" aria-labelledby="bf-t-notes">
            <TitreSection id="bf-t-notes" titre="Notes du projet" />
            {enCours(S("notes")) ? (
              <div className="bf-carte bf-edition">{editeur(S("notes"))}</div>
            ) : notes.trim() ? (
              <article className="bf-carte bf-cliquable bf-reveal bf-notes">
                <p>{notes}</p>
                <Zone label="les notes du projet" onClick={() => setEdition(S("notes"))} disabled={verrou} />
              </article>
            ) : (
              <div className="bf-vide-boite">
                <p>Rien pour l&rsquo;instant. Ces notes sont à toi : l&rsquo;agent ne les écrit jamais, mais il les relit chaque fois qu&rsquo;il travaille sur ton projet.</p>
                <BoutonAjouter label="Ajouter une note" onClick={() => setEdition(S("notes"))} disabled={verrou} />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
