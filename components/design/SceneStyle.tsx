"use client";

import { useState } from "react";
import { deposerImageStyleLibre } from "@/app/nouveau/actions";
import { referencesNommees } from "@/lib/projects/design";
import { urlMiniature } from "@/lib/thumbnails";
import { FAMILLES_STYLES } from "@/lib/styles/showcase";
import { EnteteScene } from "./Scenes";
import type { PropsScene, StyleVue } from "./types";

/** Style scene (ticket 06, 2026-11-24, mock-up C): one scrolling row per family, each style shown by its showcase image (16:9, its name
 * painted in), and « Créer mon style » at the end. Below, for a free style only, its two fields and the optional
 * image (a library style's prompts are read in the Brief). */

const urlStyle = (fichier: string) => `/api/media/styles/${fichier}`;

function Apercu({ fichier, classe = "", etiquette, ratio, largeur = 768 }: { fichier: string | null; classe?: string; etiquette?: string; ratio?: string; largeur?: 96 | 192 | 384 | 768 }) {
  return (
    <span className={`cn-apercu${fichier ? "" : " is-vide"} ${classe}`} style={{ display: "block", ...(ratio ? { aspectRatio: ratio } : {}) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the image comes from media storage, already resized by the route */}
      {fichier ? <img src={urlMiniature(urlStyle(fichier), largeur)} alt="" loading="lazy" decoding="async" /> : null}
      {etiquette ? <em>{etiquette}</em> : null}
    </span>
  );
}

export function SceneStyle({ etat, maj, styles }: PropsScene & { styles: StyleVue[] }) {
  const libreChoisi = etat.style?.source === "libre";
  const choisiId = etat.style?.source === "bibliotheque" ? etat.style.styleId : null;
  const choisir = (id: string) => maj((e) => ({ ...e, style: { source: "bibliotheque", styleId: id } }));
  const nouveauStyle = () => maj((e) => (e.style?.source === "libre" ? e : { ...e, style: { source: "libre", nom: "", promptImage: "", clause: "" } }));
  const familles = FAMILLES_STYLES.map((nom) => ({ nom, styles: styles.filter((s) => s.famille === nom) })).filter((f) => f.styles.length);

  return (
    <>
      <EnteteScene acte="Acte 04" titre={<>Quel <em>style graphique</em> pour ce film ?</>} />

      {familles.map((f, k) => (
        <section key={f.nom} className="cn-rangee" aria-label={f.nom}>
          <p className="cn-rangee-titre">{f.nom} <small>{f.styles.length} style{f.styles.length > 1 ? "s" : ""}</small></p>
          <div className="cn-defile" role="list">
            {f.styles.map((s) => (
              <button key={s.id} type="button" role="listitem" className="cn-carte cn-carte-style" aria-pressed={s.id === choisiId} aria-label={s.nom} onClick={() => choisir(s.id)}>
                <Apercu fichier={s.apercu ? `${s.id}/apercu.webp` : null} ratio="16 / 9" etiquette={s.apercu ? undefined : s.nom} />
                {s.id === choisiId ? <span className="cn-carte-coche">Choisi</span> : null}
              </button>
            ))}
            {k === familles.length - 1 ? (
              <button type="button" role="listitem" className="cn-carte-creer" aria-pressed={libreChoisi} onClick={nouveauStyle}>
                <b>+ Créer mon style</b>
                <span>Décris-le avec tes mots, avec une image si tu veux.</span>
              </button>
            ) : null}
          </div>
        </section>
      ))}

      {/* The prompts of a library style are read in the Brief: only the free style shows its form here (test feedback 2026-11-24). */}
      {libreChoisi ? (
        <div className="cn-style-choisi" aria-label="Mon style">
          <DetailLibre etat={etat} maj={maj} />
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
