"use client";

import { useMemo, useState } from "react";
import { deposerImageStyleLibre } from "@/app/nouveau/actions";
import { referencesNommees } from "@/lib/conception";
import { urlMiniature } from "@/lib/miniatures";
import { AXES_FILTRE, filtrerStyles, valeursFiltre, type AxeFiltre } from "@/lib/styles/filtres";
import { SUJETS_APERCU, type SujetApercu } from "@/lib/styles/sujets";
import { EnteteScene } from "./Scenes";
import type { PropsScene, StyleVue } from "./types";

/** Scène du style : la bibliothèque (galerie défilante ou liste, filtres, recherche) et le style libre. Un réglage « Sujet » change
 * d'un coup l'image de TOUS les styles (même scène partout : la seule différence est le style). Un style de la bibliothèque
 * se choisit tel quel (ses deux prompts s'affichent, sans pouvoir les modifier) ; le style libre, c'est deux champs de texte (le prompt
 * image et la clause courte) et, si on veut, une image 2:3. */

const LIBELLES_AXES: Record<AxeFiltre, string> = { medium: "Famille", rendu: "Rendu", palette: "Palette", epoque: "Époque", ambiance: "Ambiance" };
const AXES_AFFINER = AXES_FILTRE.filter((a) => a !== "medium");

const urlStyle = (fichier: string) => `/api/media/styles/${fichier}`;

/** Forme de la galerie selon le format du sujet : les cartes s'élargissent pour les scènes en paysage. */
const formeDe = (s: SujetApercu) => (s.aspect === "2:3" ? "portrait" : s.aspect === "1:1" ? "carre" : "paysage");
const ratioCss = (s: SujetApercu) => s.aspect.replace(":", " / ");

function Apercu({ fichier, classe = "", etiquette, ratio }: { fichier: string | null; classe?: string; etiquette?: string; ratio?: string }) {
  return (
    <span className={`cn-apercu${fichier ? "" : " is-vide"} ${classe}`} style={{ display: "block", ...(ratio ? { aspectRatio: ratio } : {}) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- l'image vient du stockage média, déjà redimensionnée par la route */}
      {fichier ? <img src={urlMiniature(urlStyle(fichier), 384)} alt="" loading="lazy" decoding="async" /> : null}
      {etiquette ? <em>{etiquette}</em> : null}
    </span>
  );
}

type Entree = { id: string; nom: string; sous: string; fichier: string | null; libre: boolean; style?: StyleVue };

export function SceneStyle({ etat, maj, styles }: PropsScene & { styles: StyleVue[] }) {
  const [recherche, setRecherche] = useState("");
  const [famille, setFamille] = useState<string | null>(null);
  const [affiner, setAffiner] = useState(false);
  const [axes, setAxes] = useState<Partial<Record<AxeFiltre, string[]>>>({});
  const [agrandi, setAgrandi] = useState<Entree | null>(null);
  const [sujetId, setSujetId] = useState(SUJETS_APERCU[0]!.id);
  const sujet = SUJETS_APERCU.find((s) => s.id === sujetId) ?? SUJETS_APERCU[0]!;
  const fichierDe = (s: StyleVue) => (s.images.includes(sujet.id) ? `${s.id}/${sujet.id}.webp` : null);

  const criteres = useMemo(() => ({ recherche, filtres: { ...axes, ...(famille ? { medium: [famille] } : {}) } }), [recherche, axes, famille]);
  const visibles = useMemo(() => filtrerStyles(styles, criteres), [styles, criteres]);
  const familles = useMemo(() => valeursFiltre(styles, "medium"), [styles]);
  const nbAffinages = Object.values(axes).reduce((n, v) => n + (v?.length ?? 0), 0);

  const entrees: Entree[] = [
    { id: "__libre", nom: "Style libre", sous: "Tes deux prompts, ton image", fichier: etat.style?.source === "libre" ? (etat.style.image ?? null) : null, libre: true },
    ...visibles.map((s) => ({ id: s.id, nom: s.nom, sous: s.filtres.medium, fichier: fichierDe(s), libre: false, style: s })),
  ];
  const choisi = (en: Entree) => (en.libre ? etat.style?.source === "libre" : etat.style?.source === "bibliotheque" && etat.style.styleId === en.id);
  /** Un clic choisit le style ; un second clic sur le style déjà choisi l'agrandit. */
  const cliquer = (en: Entree) => {
    if (choisi(en)) {
      if (en.fichier) setAgrandi(en);
      return;
    }
    maj((e) => {
      if (!en.libre) return { ...e, style: { source: "bibliotheque", styleId: en.id } };
      return e.style?.source === "libre" ? e : { ...e, style: { source: "libre", nom: "", promptImage: "", clause: "" } };
    });
  };
  const bascule = (axe: AxeFiltre, valeur: string) =>
    setAxes((a) => {
      const courantes = a[axe] ?? [];
      return { ...a, [axe]: courantes.includes(valeur) ? courantes.filter((v) => v !== valeur) : [...courantes, valeur] };
    });

  const selection = etat.style?.source === "bibliotheque" ? styles.find((s) => s.id === (etat.style as { styleId: string }).styleId) : null;

  return (
    <>
      <EnteteScene acte="Acte 05" titre={<>Quelle <em>image</em> pour cette histoire ?</>} sous="Un rendu, pas un sujet : ces styles tiennent sur un personnage, un décor ou un objet." />

      <div className="cn-style-mise">
        <div className="cn-style-gauche">
          <div className="cn-sujets" role="group" aria-label="Sujet des aperçus">
            <span className="cn-sujets-titre">Sujet</span>
            {SUJETS_APERCU.map((s) => (
              <button key={s.id} type="button" className="cn-puce" aria-pressed={s.id === sujet.id} title={s.teste} onClick={() => setSujetId(s.id)}>
                {s.libelle}
              </button>
            ))}
            <span className="cn-sujets-note">{sujet.teste}</span>
          </div>

          <div className="cn-filtres">
            <div className="cn-filtres-ligne">
              <input type="search" placeholder="Chercher un style…" aria-label="Chercher un style" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              <button type="button" className="cn-puce" aria-pressed={famille === null} onClick={() => setFamille(null)}>Tous<small>{styles.length}</small></button>
              {familles.map((m) => (
                <button key={m.valeur} type="button" className="cn-puce" aria-pressed={famille === m.valeur} onClick={() => setFamille(famille === m.valeur ? null : m.valeur)}>
                  {m.valeur}<small>{m.effectif}</small>
                </button>
              ))}
              <button type="button" className="cn-puce" aria-expanded={affiner} onClick={() => setAffiner((v) => !v)}>
                Affiner{nbAffinages ? <small>{nbAffinages}</small> : null}
              </button>
            </div>
            {affiner ? (
              <>
                {AXES_AFFINER.map((axe) => (
                  <div key={axe} className="cn-axe">
                    <span>{LIBELLES_AXES[axe]}</span>
                    <div className="cn-filtres-ligne">
                      {valeursFiltre(styles, axe).map((v) => (
                        <button key={v.valeur} type="button" className="cn-puce" aria-pressed={(axes[axe] ?? []).includes(v.valeur)} onClick={() => bascule(axe, v.valeur)}>
                          {v.valeur}<small>{v.effectif}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {nbAffinages ? <div><button type="button" className="cn-lien" onClick={() => setAxes({})}>Effacer les filtres</button></div> : null}
              </>
            ) : null}
          </div>

          {visibles.length === 0 ? <p className="cn-aucun">Aucun style de la bibliothèque ne correspond. Le style libre reste disponible.</p> : null}
          <div className="cn-galerie-panneau">
            <div className="cn-galerie" role="list" data-forme={formeDe(sujet)} style={{ ["--ar" as string]: ratioCss(sujet) }}>
              {entrees.map((en) => (
                <button key={en.id} type="button" role="listitem" className="cn-carte" aria-pressed={choisi(en)} title={choisi(en) && en.fichier ? "Cliquer encore pour agrandir" : undefined} onClick={() => cliquer(en)}>
                  <Apercu fichier={en.fichier} etiquette={en.fichier ? undefined : "pas d’aperçu"} />
                  <span className="cn-carte-corps"><b>{en.nom}</b><span>{en.sous}</span></span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="cn-style-droite" aria-label="Style choisi">
          {etat.style?.source === "libre" ? (
            <DetailLibre etat={etat} maj={maj} />
          ) : selection ? (
            <div className="cn-detail">
              <div className="cn-champs">
                <h3>{selection.nom}</h3>
                {selection.images.includes(sujet.id) ? (
                  <button type="button" className="cn-grand" aria-label="Agrandir l’aperçu" onClick={() => setAgrandi({ id: selection.id, nom: selection.nom, sous: selection.filtres.medium, fichier: fichierDe(selection), libre: false, style: selection })}>
                    <Apercu fichier={fichierDe(selection)} ratio={ratioCss(sujet)} />
                  </button>
                ) : null}
                <label className="cn-champ">Prompt image (génère les images de référence)<textarea readOnly rows={6} value={selection.descriptor} /></label>
                <label className="cn-champ">Clause courte envoyée à la vidéo<textarea readOnly rows={3} value={selection.clause} /></label>
                <p className="cn-note" style={{ margin: 0 }}>Les styles de la bibliothèque ne se modifient pas : pour écrire les tiens, choisis « Style libre ».</p>
              </div>
              <Usage />
            </div>
          ) : (
            <p className="cn-vide-style">Choisis un style : son aperçu et ses deux prompts (l’un pour les images, l’autre pour la vidéo) s’affichent ici. Un second clic sur le style choisi l’agrandit.</p>
          )}
        </aside>
      </div>

      {agrandi ? (
        <div className="cn-lightbox" role="dialog" aria-modal="true" aria-label={`Aperçu du style ${agrandi.nom}`} onClick={() => setAgrandi(null)} onKeyDown={(e) => e.key === "Escape" && setAgrandi(null)}>
          <div className="cn-lightbox-corps" data-forme={formeDe(sujet)} onClick={(e) => e.stopPropagation()}>
            <Apercu fichier={agrandi.fichier} ratio={ratioCss(sujet)} etiquette={agrandi.fichier ? undefined : "pas d’aperçu"} />
            <b>{agrandi.nom}</b>
            <span>{agrandi.sous}</span>
            {agrandi.style ? (
              <div className="cn-sujets" role="group" aria-label="Sujet de l’aperçu">
                {SUJETS_APERCU.map((s) => (
                  <button key={s.id} type="button" className="cn-puce" aria-pressed={s.id === sujet.id} onClick={() => { setSujetId(s.id); setAgrandi({ ...agrandi, fichier: agrandi.style!.images.includes(s.id) ? `${agrandi.id}/${s.id}.webp` : null }); }}>
                    {s.libelle}
                  </button>
                ))}
              </div>
            ) : null}
            <button type="button" className="btn" autoFocus onClick={() => setAgrandi(null)}>Fermer</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Usage() {
  return (
    <div className="cn-usage">
      <div><b>Prompt image → images.</b> Génère les images de référence (personnages, lieux). Ce sont elles qui portent le style dans la vidéo.</div>
      <div><b>Clause courte → vidéo.</b> Ouvre chaque description de plan : le rendu seulement, jamais le cadrage ni l’action.</div>
    </div>
  );
}

function DetailLibre({ etat, maj }: PropsScene) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const style = etat.style?.source === "libre" ? etat.style : null;
  if (!style) return null;
  const modifier = (patch: Partial<typeof style>) => maj((e) => (e.style?.source === "libre" ? { ...e, style: { ...e.style, ...patch } } : e));
  const refs = referencesNommees(`${style.promptImage} ${style.clause}`);

  const deposer = async (fichier: File | undefined) => {
    if (!fichier) return;
    setEnvoi(true);
    setErreur(null);
    const f = new FormData();
    f.set("fichier", fichier);
    try {
      const r = await deposerImageStyleLibre(f);
      if (r.ok) modifier({ image: r.image });
      else setErreur(r.erreur);
    } catch {
      setErreur("L’envoi de l’image a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="cn-detail">
      <div className="cn-champs">
        <h3>Style libre</h3>
        <label className="cn-champ">Nom (facultatif)<input type="text" value={style.nom} maxLength={120} onChange={(e) => modifier({ nom: e.target.value })} placeholder="Style libre" /></label>
        <label className="cn-champ">Prompt image : le style complet, en anglais (génère les images de référence)<textarea rows={6} value={style.promptImage} onChange={(e) => modifier({ promptImage: e.target.value })} /></label>
        <label className="cn-champ">Clause courte : 1 à 2 phrases sur le rendu, en anglais (ouvre chaque plan vidéo)<textarea rows={3} value={style.clause} onChange={(e) => modifier({ clause: e.target.value })} /></label>
        {refs.length ? <p className="cn-erreur" role="alert">Référence nommée détectée : « {refs.join(", ")} ». On décrit la technique, pas un auteur ou un studio.</p> : null}
        {!style.promptImage.trim() || !style.clause.trim() ? <p className="cn-note" style={{ margin: 0 }}>Les deux prompts sont nécessaires pour continuer.</p> : null}
      </div>
      <div className="cn-usage">
        <Usage />
        <div>
          <b>Image de présentation (2:3, facultative).</b> Elle illustre le style, plus tard sur l’affiche du projet.
          <div className="cn-libre-zone">
            <div className="cn-libre-img">
              <Apercu fichier={style.image ?? null} />
              {style.image ? <button type="button" className="cn-lien" onClick={() => modifier({ image: undefined })}>Retirer l’image</button> : null}
            </div>
            <input type="file" accept="image/*" aria-label="Image de présentation du style" disabled={envoi} onChange={(e) => void deposer(e.target.files?.[0])} />
          </div>
          {envoi ? <p className="cn-note">Envoi…</p> : null}
          {erreur ? <p className="cn-erreur" role="alert">{erreur}</p> : null}
        </div>
      </div>
    </div>
  );
}
