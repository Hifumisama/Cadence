"use client";

import "./brief.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { modifierChampBrief } from "@/app/agents/actions";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import { construireCode, slugifyCode } from "@/lib/assetCode";
import { urlMiniature } from "@/lib/miniatures";
import { SECTIONS_BRIEF, type VueBrief } from "@/lib/agents/types";
import { EditeurBrief } from "./EditeurBrief";
import { Sommaire, type EntreeSommaire } from "./Sommaire";
import { StyleBrief, type StyleBriefVue } from "./StyleBrief";
import { memeEdition, type Edition } from "./types";

type Objet = Record<string, unknown>;

/** Un personnage ou un décor du registre, tel que le brief le montre (lecture seule). */
export type EntreeRegistre = { code: string; type: "personnage" | "decor"; description: string; src: string | null };

/** « DEC_le_monde_de_l_avatar » → « Le monde de l avatar » : le nom lisible d'un asset que le brief ne connaît pas. */
const nomDepuisCode = (code: string): string => {
  const brut = code.replace(/^[A-Z]+_/, "").replace(/_/g, " ").trim();
  return brut ? brut[0]!.toUpperCase() + brut.slice(1) : code;
};

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

/** Les choix de la conception : les changer, c'est refaire le projet (la langue touche tous les dialogues, la durée tout le découpage…). Figés une fois
 * l'entretien passé : lecture seule ici. */
const IDENTITE_FIGEE = ["langueDialogues", "dureeEpisodeSecondes", "genreTon"];

/** La page du brief : un dossier de production lisible d'un coup d'œil. Une page de LECTURE, avec une correction MANUELLE sur place (un clic sur
 * un bloc le passe en édition, une seule modification à la fois) du titre, de l'arc, des personnages et des lieux (quand ils ne viennent pas
 * du registre) et des notes. Le style est fixé à la conception ; le résumé des scènes se lit seulement. */
export function BriefDossier({
  projectId,
  nomProjet,
  brief,
  style,
  serie = false,
  identiteFigee = false,
  registre = [],
}: {
  projectId: number;
  nomProjet: string;
  brief: VueBrief;
  style: StyleBriefVue;
  /** Série : le résumé se lit par épisode. Film : un résumé des scènes, sans vocabulaire d'épisode. */
  serie?: boolean;
  identiteFigee?: boolean;
  registre?: EntreeRegistre[];
}) {
  const router = useRouter();
  const c = brief.contenu;
  const donnees = c as unknown as Record<string, unknown>;
  const [edition, setEdition] = useState<Edition | null>(null);
  const [occupe, setOccupe] = useState(false);

  const libelle = (cle: string) => SECTIONS_BRIEF.find((s) => s.cle === cle)?.libelle ?? cle;
  const liste = (cle: string): Objet[] => (Array.isArray(donnees[cle]) ? (donnees[cle] as Objet[]) : []);
  const texte = (v: unknown) => (typeof v === "string" ? v : "");

  const personnages = liste("personnages");
  const lieux = liste("lieux");
  const episodes = liste("episodes");
  const resumes = episodes.map((e) => texte(e.resume).trim()).filter(Boolean);
  const notes = texte(donnees.notes);

  // Le registre fait foi dès qu'il existe : lieux = décors, personnages = personnages du registre (le brief ne garde que ce qu'il y ajoute : rôle, voix…).
  const decors = registre.filter((a) => a.type === "decor");
  const persosRegistre = registre.filter((a) => a.type === "personnage");
  const codePerso = (p: Objet) => construireCode("personnage", slugifyCode(texte(p.nom)));
  const briefParCode = new Map(personnages.map((p, i) => [codePerso(p), { p, i }] as const));
  const apparies = new Set(persosRegistre.filter((a) => briefParCode.has(a.code)).map((a) => briefParCode.get(a.code)!.i));
  const lieuxViaRegistre = decors.length > 0;
  const persosViaRegistre = persosRegistre.length > 0;

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
  const retirer = (e: Edition): Promise<string | null> =>
    e.type === "element"
      ? enregistrer(
          e.cle,
          liste(e.cle).filter((_, i) => i !== e.index),
        )
      : Promise.resolve(null);

  // --- Édition sur place ---
  const S = (cle: string): Edition => ({ type: "section", cle, titre: libelle(cle) });
  const E = (cle: string, index: number): Edition => ({ type: "element", cle, index });
  const enCours = (e: Edition) => memeEdition(edition, e);
  const verrou = occupe || edition !== null;
  const editeur = (e: Edition) => (
    <EditeurBrief key={`${e.type}-${e.cle}-${e.type === "section" ? "" : e.index}`} edition={e} contenu={c} onFermer={() => setEdition(null)} onEnregistrer={enregistrer} onRetirer={retirer} />
  );

  const carteRegistre = (a: EntreeRegistre, nom: string, complement?: React.ReactNode) => (
    <article key={a.code} className="bf-carte bf-reveal bf-registre">
      <Link href={`/p/${projectId}/assets/${a.code}`} className="bf-registre-lien" aria-label={`Ouvrir ${nom} dans le registre`}>
        <span className={`bf-registre-vignette${a.src ? "" : " is-vide"}`} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- stockage média, redimensionné par la route */}
          {a.src ? <img src={urlMiniature(a.src, 192)} alt="" loading="lazy" decoding="async" /> : (nom.trim()[0] ?? "?").toUpperCase()}
        </span>
        <span className="bf-registre-corps">
          <h3>{nom}</h3>
          {complement}
          <p>{a.description || "Pas encore de description."}</p>
        </span>
      </Link>
    </article>
  );
  const lienRegistre = (
    <Link href={`/p/${projectId}/assets`} className="bf-btn bf-press">
      Ouvrir le registre
    </Link>
  );

  const faits: { cle: string; label: string; valeur: string }[] = [
    { cle: "langueDialogues", label: "Langue des dialogues", valeur: texte(c.langueDialogues) },
    { cle: "dureeEpisodeSecondes", label: serie ? "Durée d'un épisode" : "Durée", valeur: c.dureeEpisodeSecondes ? `${c.dureeEpisodeSecondes} s` : "" },
    { cle: "genreTon", label: "Genre et ton", valeur: texte(c.genreTon) },
  ];

  const entrees: EntreeSommaire[] = [
    { id: "bf-haut", label: "Vue d'ensemble" },
    { id: "bf-style", label: "Style" },
    { id: "bf-resume", label: "Résumé des scènes", ...(serie ? { compte: episodes.length } : {}) },
    { id: "bf-personnages", label: "Personnages", compte: persosViaRegistre ? persosRegistre.length + personnages.filter((_, i) => !apparies.has(i)).length : personnages.length },
    { id: "bf-lieux", label: "Lieux", compte: lieuxViaRegistre ? decors.length : lieux.length },
    { id: "bf-notes", label: "Notes du projet" },
  ];

  return (
    <div className="bf-page">
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
                    <Zone label="l'arc" onClick={() => setEdition(S("arc"))} disabled={verrou} />
                  </div>
                  <p className="bf-arc">{texte(c.arc) || "Pas encore d'arc."}</p>
                </div>
              )}

              <div className="bf-faits bf-in bf-d4">
                {faits.map((f) =>
                  enCours(S(f.cle)) && !(identiteFigee && IDENTITE_FIGEE.includes(f.cle)) ? (
                    <div key={f.cle} className="bf-fait bf-edition">
                      {editeur(S(f.cle))}
                    </div>
                  ) : (
                    <div key={f.cle} className="bf-fait bf-cliquable">
                      <div className="bf-tete">
                        <span className="bf-etiquette">{f.label}</span>
                        {identiteFigee && IDENTITE_FIGEE.includes(f.cle) ? (
                          <span className="bf-fige" title="Choisi à la conception : le changer reviendrait à refaire le projet.">fixé</span>
                        ) : (
                          <Zone label={f.label} onClick={() => setEdition(S(f.cle))} disabled={verrou} />
                        )}
                      </div>
                      <span className={`bf-fait-valeur${f.valeur ? "" : " is-vide"}`}>{f.valeur || "À définir"}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>

          <section id="bf-style" className="bf-section" aria-labelledby="bf-t-style">
            <TitreSection id="bf-t-style" titre="Style" />
            <StyleBrief style={style} />
          </section>

          <section id="bf-resume" className="bf-section" aria-labelledby="bf-t-resume">
            <TitreSection id="bf-t-resume" titre="Résumé des scènes" />
            {resumes.length === 0 && (!serie || episodes.length === 0) ? <p className="bf-vide">Pas encore de résumé.</p> : null}
            {serie ? (
              <div className="bf-pile">
                {episodes.map((e, i) => (
                  <article key={i} className="bf-carte bf-reveal bf-resume">
                    <span className="bf-etiquette">Épisode {i + 1}</span>
                    {texte(e.titre).trim() ? <h3>{texte(e.titre)}</h3> : null}
                    <p>{texte(e.resume).trim() || "Pas encore de résumé."}</p>
                  </article>
                ))}
              </div>
            ) : resumes.length > 0 ? (
              <article className="bf-carte bf-reveal bf-resume">
                {resumes.map((r, i) => (
                  <p key={i}>{r}</p>
                ))}
              </article>
            ) : null}
          </section>

          <section id="bf-personnages" className="bf-section" aria-labelledby="bf-t-personnages">
            <TitreSection id="bf-t-personnages" titre="Personnages">
              {persosViaRegistre ? lienRegistre : <BoutonAjouter label="Ajouter" onClick={() => setEdition(E("personnages", personnages.length))} disabled={verrou} />}
            </TitreSection>
            {persosViaRegistre ? <p className="bf-aide">Vue du registre : c&rsquo;est là que les personnages se modifient (description, image, voix).</p> : null}
            {personnages.length === 0 && !persosViaRegistre && !enCours(E("personnages", 0)) ? <p className="bf-vide">Aucun personnage dans le brief.</p> : null}
            <div className="bf-grille">
              {persosRegistre.map((a) => {
                const lie = briefParCode.get(a.code)?.p;
                return carteRegistre(a, lie ? texte(lie.nom) || nomDepuisCode(a.code) : nomDepuisCode(a.code), lie && texte(lie.role) ? <p className="bf-registre-role">{texte(lie.role)}</p> : undefined);
              })}
              {personnages.map((p, i) =>
                persosViaRegistre && apparies.has(i) ? null : enCours(E("personnages", i)) ? (
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
              {lieuxViaRegistre ? lienRegistre : <BoutonAjouter label="Ajouter" onClick={() => setEdition(E("lieux", lieux.length))} disabled={verrou} />}
            </TitreSection>
            {lieuxViaRegistre ? <p className="bf-aide">Vue du registre : les lieux sont les décors, et c&rsquo;est là qu&rsquo;ils se modifient.</p> : null}
            {lieux.length === 0 && !lieuxViaRegistre && !enCours(E("lieux", 0)) ? <p className="bf-vide">Aucun lieu dans le brief.</p> : null}
            <div className="bf-grille">
              {lieuxViaRegistre ? decors.map((a) => carteRegistre(a, nomDepuisCode(a.code))) : null}
              {(lieuxViaRegistre ? [] : lieux).map((l, i) =>
                enCours(E("lieux", i)) ? (
                  <article key={i} id={`bf-lieux-${i}`} className="bf-carte bf-edition">
                    {editeur(E("lieux", i))}
                  </article>
                ) : (
                  <article key={i} id={`bf-lieux-${i}`} className="bf-carte bf-cliquable bf-reveal">
                    <header className="bf-perso-hd">
                      <div className="bf-tete">
                        <h3>{texte(l.nom) || "Sans nom"}</h3>
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
