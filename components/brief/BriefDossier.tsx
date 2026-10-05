"use client";

import "./brief.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { modifierChampBrief } from "@/app/agents/actions";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { Icone } from "@/components/ui/Icone";
import { decompterStatuts } from "@/lib/agents-affichage";
import { SECTIONS_BRIEF, type StatutChamp, type VueBrief } from "@/lib/agents/types";
import { Sommaire, type EntreeSommaire } from "./Sommaire";
import { TiroirBrief } from "./TiroirBrief";
import { PROVENANCE, provenanceElement, provenanceSection, type Edition, type Provenance } from "./types";

type Objet = Record<string, unknown>;

/** Sections dont la valeur est une liste d'objets éditée élément par élément (voir FORMULAIRES_LISTE). */
const FORMULAIRES = ["episodes", "personnages", "lieux", "rimes", "progressions", "pieges"];

function Prov({ etat }: { etat: Provenance }) {
  return (
    <span className={`bf-prov is-${etat}`}>
      <span aria-hidden="true">{PROVENANCE[etat].symbole}</span> {PROVENANCE[etat].libelle}
    </span>
  );
}

/** L'icône « modifier » d'un bloc, sans cadre : c'est le BLOC ENTIER qui est cliquable (le bouton s'étend à tout le
 * parent `.bf-cliquable`, voir brief.css). Reste un vrai bouton : focus clavier, nom accessible, lecteur d'écran. */
function Zone({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="bf-zone" aria-label={`Modifier : ${label}`} title="Modifier" onClick={onClick} disabled={disabled}>
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

/** La page du brief : un dossier de production lisible d'un coup d'œil (au lieu de 16 sections repliées). Chaque bloc
 * s'édite dans un tiroir en cliquant dessus ; les éléments que l'agent n'a pas pu trancher remontent dans « À confirmer ». */
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
  const continuite = lignes("continuite");
  const inventions = lignes("inventions");
  const questions = lignes("questionsOuvertes");
  const notes = texte(donnees.notes);

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
  const retirerElement = (cle: string, index: number) =>
    enregistrer(
      cle,
      liste(cle).filter((_, i) => i !== index),
    );
  const confirmer = (e: Edition) => (e.type === "element" ? confirmerElement(e.cle, e.index) : confirmerSection(e.cle));

  const modifierSection = (cle: string) => setEdition({ type: "section", cle, titre: libelle(cle) });
  const modifierElement = (cle: string, index: number) => setEdition({ type: "element", cle, index });

  // Ce que l'agent n'a pas pu trancher : éléments « incertains », sections à valider, ajouts de l'agent.
  const aConfirmer: { cle: string; type: string; titre: string; detail: string; confirmer?: () => Promise<string | null>; ouvrir: () => void; action: string }[] = [];
  personnages.forEach((p, i) => {
    if (p.statut === "incertain")
      aConfirmer.push({ cle: `p${i}`, type: "Personnage", titre: texte(p.nom), detail: "L'agent n'est pas sûr du rôle ni de la voix.", confirmer: () => confirmerElement("personnages", i), ouvrir: () => modifierElement("personnages", i), action: "Confirmer" });
  });
  lieux.forEach((l, i) => {
    if (l.statut === "incertain")
      aConfirmer.push({ cle: `l${i}`, type: "Lieu", titre: texte(l.nom), detail: "Description à valider.", confirmer: () => confirmerElement("lieux", i), ouvrir: () => modifierElement("lieux", i), action: "Confirmer" });
  });
  for (const s of brief.sections) {
    if (s.statut === "a_valider" && !["personnages", "lieux", "inventions"].includes(s.cle))
      aConfirmer.push({
        cle: `s-${s.cle}`,
        type: "Section",
        titre: s.libelle,
        detail: "Inventée ou incertaine : à relire.",
        confirmer: () => confirmerSection(s.cle),
        ouvrir: () => (liste(s.cle).length && FORMULAIRES.includes(s.cle) ? modifierElement(s.cle, 0) : modifierSection(s.cle)),
        action: "Confirmer",
      });
  }
  if (inventions.length > 0)
    aConfirmer.push({
      cle: "inv",
      type: "Notes de l'agent",
      titre: `${inventions.length} élément${inventions.length > 1 ? "s" : ""} ajouté${inventions.length > 1 ? "s" : ""} par l'agent`,
      detail: "Absent de ton pitch : à garder ou à retirer.",
      ouvrir: () => document.getElementById("bf-agent")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      action: "Passer en revue",
    });

  const faits: { cle: string; label: string; valeur: string }[] = [
    { cle: "langueDialogues", label: "Langue des dialogues", valeur: texte(c.langueDialogues) },
    { cle: "dureeEpisodeSecondes", label: "Durée d'un épisode", valeur: c.dureeEpisodeSecondes ? `${c.dureeEpisodeSecondes} s` : "" },
    { cle: "genreTon", label: "Genre et ton", valeur: texte(c.genreTon) },
    { cle: "style", label: "Style", valeur: texte(c.style?.nom) },
  ];

  const entrees: EntreeSommaire[] = [
    { id: "bf-haut", label: "Vue d'ensemble" },
    ...(aConfirmer.length > 0 ? [{ id: "bf-confirmer", label: "À confirmer", aConfirmer: true }] : []),
    { id: "bf-style", label: "Style" },
    { id: "bf-episodes", label: "Épisodes", compte: episodes.length },
    { id: "bf-personnages", label: "Personnages", compte: personnages.length },
    { id: "bf-lieux", label: "Lieux", compte: lieux.length },
    { id: "bf-contraintes", label: "Contraintes" },
    { id: "bf-agent", label: "Notes de l'agent", compte: inventions.length },
    { id: "bf-notes", label: "Notes du projet" },
  ];

  // Tiroir ouvert : l'élément ou la section visé.
  let titreTiroir = "";
  let tiroirAConfirmer = false;
  if (edition?.type === "section") {
    titreTiroir = edition.titre;
    tiroirAConfirmer = statut(edition.cle) === "a_valider";
  } else if (edition?.type === "element") {
    const x = liste(edition.cle)[edition.index];
    titreTiroir = texte(x?.nom) || texte(x?.titre) || "cet élément";
    tiroirAConfirmer = x?.statut === "incertain";
  }

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

              <div className="bf-titre-ligne bf-cliquable bf-in bf-d2">
                <h1>{c.titre || nomProjet}</h1>
                <Zone label="le titre" onClick={() => modifierSection("titre")} disabled={occupe} />
              </div>
              <span className="bf-filet" aria-hidden="true" />

              <div className="bf-arc-bloc bf-cliquable bf-in bf-d3">
                <div className="bf-tete">
                  <span className="bf-etiquette">L&rsquo;arc</span>
                  <Prov etat={provenanceSection(statut("arc"))} />
                  <Zone label="l'arc" onClick={() => modifierSection("arc")} disabled={occupe} />
                </div>
                <p className="bf-arc">{texte(c.arc) || "Pas encore d'arc."}</p>
              </div>

              <div className="bf-faits bf-in bf-d4">
                {faits.map((f) => (
                  <div key={f.cle} className="bf-fait bf-cliquable">
                    <div className="bf-tete">
                      <span className="bf-etiquette">{f.label}</span>
                      <Prov etat={provenanceSection(statut(f.cle))} />
                      <Zone label={f.label} onClick={() => modifierSection(f.cle)} disabled={occupe} />
                    </div>
                    <span className={`bf-fait-valeur${f.valeur ? "" : " is-vide"}`}>{f.valeur || "À définir"}</span>
                  </div>
                ))}
              </div>
            </div>

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
          </section>

          {aConfirmer.length > 0 ? (
            <section id="bf-confirmer" className="bf-confirmer bf-in bf-d5" aria-labelledby="bf-h-confirmer">
              <div className="bf-confirmer-hd">
                <h2 id="bf-h-confirmer">
                  <span className="bf-pulse" aria-hidden="true">◇</span> À confirmer
                </h2>
                <p>L&rsquo;agent n&rsquo;est pas sûr de ces éléments, ou les a ajoutés de lui-même.</p>
              </div>
              <div className="bf-confirmer-liste">
                {aConfirmer.map((a) => (
                  <div key={a.cle} className={`bf-confirmer-ligne${a.confirmer ? " bf-cliquable" : ""}`}>
                    <span className="bf-etiquette bf-confirmer-type">{a.type}</span>
                    <span className="bf-confirmer-texte">
                      {a.titre}
                      <small>{a.detail}</small>
                    </span>
                    <span className="bf-confirmer-actions">
                      <button type="button" className="bf-btn bf-btn-or bf-press" disabled={occupe} onClick={() => (a.confirmer ? agir(a.confirmer) : a.ouvrir())}>
                        {a.action}
                      </button>
                      {a.confirmer ? <Zone label={a.titre} onClick={a.ouvrir} disabled={occupe} /> : null}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section id="bf-style" className="bf-section" aria-labelledby="bf-t-style">
            <TitreSection id="bf-t-style" titre="Style" />
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
                  <Zone label="le style et sa clause" onClick={() => modifierSection("style")} disabled={occupe} />
                </div>
                <p lang="en" className="bf-clause">
                  {texte(c.style?.clause) || "—"}
                </p>
              </div>
            </div>
          </section>

          <section id="bf-episodes" className="bf-section" aria-labelledby="bf-t-episodes">
            <TitreSection id="bf-t-episodes" titre="Épisodes">
              <BoutonAjouter label="Ajouter" onClick={() => modifierElement("episodes", episodes.length)} disabled={occupe} />
            </TitreSection>
            {episodes.length === 0 ? <p className="bf-vide">Aucun épisode dans le brief.</p> : null}
            <div className="bf-pile">
              {episodes.map((e, i) => (
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
                  <Zone label={texte(e.titre) || `épisode ${i + 1}`} onClick={() => modifierElement("episodes", i)} disabled={occupe} />
                </article>
              ))}
            </div>
          </section>

          <section id="bf-personnages" className="bf-section" aria-labelledby="bf-t-personnages">
            <TitreSection id="bf-t-personnages" titre="Personnages">
              <BoutonAjouter label="Ajouter" onClick={() => modifierElement("personnages", personnages.length)} disabled={occupe} />
            </TitreSection>
            {personnages.length === 0 ? <p className="bf-vide">Aucun personnage dans le brief.</p> : null}
            <div className="bf-grille">
              {personnages.map((p, i) => (
                <article key={i} className="bf-carte bf-cliquable bf-reveal">
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
                    <Zone label={texte(p.nom) || `personnage ${i + 1}`} onClick={() => modifierElement("personnages", i)} disabled={occupe} />
                  </header>
                  <dl className="bf-def">
                    <dt>Reconnaissable</dt>
                    <dd>{texte(p.reconnaissable) || "—"}</dd>
                    <dt>Voix</dt>
                    <dd>{texte(p.voix) || "—"}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section id="bf-lieux" className="bf-section" aria-labelledby="bf-t-lieux">
            <TitreSection id="bf-t-lieux" titre="Lieux">
              <BoutonAjouter label="Ajouter" onClick={() => modifierElement("lieux", lieux.length)} disabled={occupe} />
            </TitreSection>
            {lieux.length === 0 ? <p className="bf-vide">Aucun lieu dans le brief.</p> : null}
            <div className="bf-grille">
              {lieux.map((l, i) => (
                <article key={i} className="bf-carte bf-cliquable bf-reveal">
                  <header className="bf-perso-hd">
                    <div className="bf-tete">
                      <h3>{texte(l.nom) || "Sans nom"}</h3>
                      <Prov etat={provenanceElement(l.statut, provenanceSection(statut("lieux")))} />
                    </div>
                    <Zone label={texte(l.nom) || `lieu ${i + 1}`} onClick={() => modifierElement("lieux", i)} disabled={occupe} />
                  </header>
                  <p>{texte(l.description)}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="bf-contraintes" className="bf-section" aria-labelledby="bf-t-contraintes">
            <TitreSection id="bf-t-contraintes" titre="Contraintes" />
            <div className="bf-grille bf-grille-large">
              <article className="bf-carte bf-cliquable bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Règles de continuité</h3>
                  <Prov etat={provenanceSection(statut("continuite"))} />
                  <Zone label="les règles de continuité" onClick={() => modifierSection("continuite")} disabled={occupe} />
                </header>
                <p className="bf-aide">Ce qui doit rester identique d&rsquo;un plan à l&rsquo;autre.</p>
                {continuite.length === 0 ? <p className="bf-vide">Aucune règle.</p> : null}
                <ul className="bf-puces">
                  {continuite.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </article>

              <article className="bf-carte bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Rimes</h3>
                  <Prov etat={provenanceSection(statut("rimes"))} />
                  <span className="bf-pousse">
                    <BoutonAjouter label="Ajouter" onClick={() => modifierElement("rimes", rimes.length)} disabled={occupe} />
                  </span>
                </header>
                <p className="bf-aide">Deux moments qui se répondent à l&rsquo;image.</p>
                {rimes.length === 0 ? <p className="bf-vide">Aucune rime.</p> : null}
                {rimes.map((r, i) => (
                  <div key={i} className="bf-ligne bf-cliquable">
                    <div>
                      <p>{texte(r.description)}</p>
                      <p className="bf-aide">
                        À souligner à l&rsquo;image : <b>{r.souligner === true ? "oui" : "non"}</b>
                      </p>
                    </div>
                    <Zone label={`rime ${i + 1}`} onClick={() => modifierElement("rimes", i)} disabled={occupe} />
                  </div>
                ))}
              </article>

              <article className="bf-carte bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Progressions</h3>
                  <Prov etat={provenanceSection(statut("progressions"))} />
                  <span className="bf-pousse">
                    <BoutonAjouter label="Ajouter" onClick={() => modifierElement("progressions", progressions.length)} disabled={occupe} />
                  </span>
                </header>
                <p className="bf-aide">Ce qui évolue au fil de l&rsquo;épisode.</p>
                {progressions.length === 0 ? <p className="bf-vide">Aucune progression.</p> : null}
                {progressions.map((p, i) => (
                  <div key={i} className="bf-ligne bf-cliquable">
                    <div>
                      <p className="bf-or">{texte(p.quoi)}</p>
                      <p>{texte(p.evolution)}</p>
                    </div>
                    <Zone label={texte(p.quoi) || `progression ${i + 1}`} onClick={() => modifierElement("progressions", i)} disabled={occupe} />
                  </div>
                ))}
              </article>

              <article className="bf-carte bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Pièges</h3>
                  <Prov etat={provenanceSection(statut("pieges"))} />
                  <span className="bf-pousse">
                    <BoutonAjouter label="Ajouter" onClick={() => modifierElement("pieges", pieges.length)} disabled={occupe} />
                  </span>
                </header>
                <p className="bf-aide">Ce que les modèles font par défaut, et ce qu&rsquo;on décrit à la place.</p>
                {pieges.length === 0 ? <p className="bf-vide">Aucun piège.</p> : null}
                {pieges.map((p, i) => (
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
                    <Zone label={`piège ${i + 1}`} onClick={() => modifierElement("pieges", i)} disabled={occupe} />
                  </div>
                ))}
              </article>
            </div>
          </section>

          <section id="bf-agent" className="bf-section" aria-labelledby="bf-t-agent">
            <TitreSection id="bf-t-agent" titre="Notes de l'agent" />
            <div className="bf-grille bf-grille-large">
              <article className="bf-carte bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Ce que l&rsquo;agent a ajouté</h3>
                </header>
                <p className="bf-aide">Absent de ton pitch : à retirer si ça ne te convient pas.</p>
                {inventions.length === 0 ? <p className="bf-vide">Rien d&rsquo;ajouté.</p> : null}
                {inventions.map((t, i) => (
                  <div key={i} className="bf-ligne">
                    <p>{t}</p>
                    <button
                      type="button"
                      className="bf-zone is-retirer"
                      aria-label={`Retirer : ${t}`}
                      title="Retirer"
                      disabled={occupe}
                      onClick={() =>
                        agir(() =>
                          enregistrer(
                            "inventions",
                            inventions.filter((_, k) => k !== i),
                          ),
                        )
                      }
                    >
                      <Icone nom="fermer" taille={18} />
                    </button>
                  </div>
                ))}
              </article>
              <article className="bf-carte bf-cliquable bf-reveal">
                <header className="bf-carte-hd">
                  <h3>Questions encore ouvertes</h3>
                  <Zone label="les questions ouvertes" onClick={() => modifierSection("questionsOuvertes")} disabled={occupe} />
                </header>
                <p className="bf-aide">Ce que l&rsquo;agent aimerait te demander.</p>
                {questions.length === 0 ? <p className="bf-vide">Aucune question en suspens.</p> : null}
                <ul className="bf-puces">
                  {questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section id="bf-notes" className="bf-section" aria-labelledby="bf-t-notes">
            <TitreSection id="bf-t-notes" titre="Notes du projet" />
            {notes.trim() ? (
              <article className="bf-carte bf-cliquable bf-reveal bf-notes">
                <p>{notes}</p>
                <Zone label="les notes du projet" onClick={() => modifierSection("notes")} disabled={occupe} />
              </article>
            ) : (
              <div className="bf-vide-boite">
                <p>Rien pour l&rsquo;instant. Ces notes sont à toi : l&rsquo;agent ne les écrit jamais, mais il les relit chaque fois qu&rsquo;il travaille sur ton projet.</p>
                <BoutonAjouter label="Ajouter une note" onClick={() => modifierSection("notes")} disabled={occupe} />
              </div>
            )}
          </section>
        </div>
      </div>

      {edition ? (
        <TiroirBrief
          key={edition.type === "section" ? `s-${edition.cle}` : `e-${edition.cle}-${edition.index}`}
          edition={edition}
          contenu={c}
          titre={titreTiroir}
          etatAConfirmer={tiroirAConfirmer}
          onFermer={() => setEdition(null)}
          onEnregistrer={enregistrer}
          onRetirer={retirerElement}
          onConfirmer={confirmer}
        />
      ) : null}
    </div>
  );
}
