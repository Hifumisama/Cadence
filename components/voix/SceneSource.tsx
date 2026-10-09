"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { adopterSourceVoix, enregistrerVoix, lancerExtractionVoix } from "@/app/voix/actions";
import { supprimerGeneration } from "@/app/assets/generation-actions";
import { METHODE_VOIX_SOURCE } from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";
import { FENETRE_SOURCE_MAX_SECONDES, FENETRE_SOURCE_MIN_SECONDES, checksReference, raisonFenetreInvalide, type ImpactReference } from "@/lib/voix";
import { CandidatsTest } from "./CandidatsTest";
import { useChangementReference } from "./ConfirmationReference";
import { useGenerationsVoix } from "./useGenerationsVoix";

const METHODES: string[] = [METHODE_VOIX_SOURCE];
const estActif = (g: { statut: string }) => g.statut === "en_attente" || g.statut === "en_cours";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const virgule = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** Scène 3 (voix fournie) — « Quelle voix cloner ? » On dépose un audio ou une vidéo (jusqu'à 300 Mo, par une route dédiée), on choisit
 * une FENÊTRE de 30 secondes au plus (jamais le fichier entier), on lance l'extraction : la voix est isolée (musique et bruits
 * retirés) et transcrite. Le résultat est une candidate : on l'écoute, on corrige la transcription AU MOT PRÈS (c'est une entrée du
 * clonage, jamais écrite par l'IA), puis on l'utilise comme voix de référence. Changer une référence qui a déjà des prises demande
 * confirmation. */
export function SceneSource({
  assetId,
  sourceSrc,
  sourceEstVideo,
  refText,
  referenceFichier,
  referenceSrc,
  generations,
  generationInitiale,
  impact,
}: {
  assetId: number;
  sourceSrc: string | null;
  sourceEstVideo: boolean;
  refText: string;
  referenceFichier: string | null;
  referenceSrc: string | null;
  generations: GenerationVue[];
  generationInitiale: string | null;
  impact: ImpactReference;
}) {
  const router = useRouter();
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const fichierInput = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(sourceSrc);
  const [video, setVideo] = useState(sourceEstVideo);
  const [survol, setSurvol] = useState(false);
  const [envoi, setEnvoi] = useState<number | null>(null);
  const [duree, setDuree] = useState<number | null>(null);
  const [debut, setDebut] = useState(0);
  const [longueur, setLongueur] = useState(FENETRE_SOURCE_MAX_SECONDES);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [lancement, startLancement] = useTransition();
  const [pending, startTransition] = useTransition();
  const [actuelle, setActuelle] = useState(refText);
  const [nouvelle, setNouvelle] = useState<{ id: number; texte: string; modifie: boolean } | null>(null);

  const { vivantes, annuler } = useGenerationsVoix({ assetId, generations, generationInitiale, methodes: METHODES, etape: "voix" });
  const { changer, dialogue } = useChangementReference({ assetId, aDejaUneReference: referenceFichier != null, impact });

  const enCours = vivantes.filter(estActif);
  const echecs = vivantes.filter((g) => g.statut === "echoue" || g.statut === "annulee");
  const terminees = vivantes.filter((g) => g.statut === "termine" && g.src);
  const derniere = terminees[0] ?? null;

  // La transcription de la dernière extraction préremplit le champ, tant qu'on n'y a pas touché.
  useEffect(() => {
    if (!derniere) return setNouvelle(null);
    setNouvelle((n) => (n && n.id === derniere.id && n.modifie ? n : { id: derniere.id, texte: derniere.texteReference ?? "", modifie: false }));
  }, [derniere?.id, derniere?.texteReference]); // eslint-disable-line react-hooks/exhaustive-deps

  const fin = debut + longueur;
  const raison = useMemo(() => raisonFenetreInvalide(debut, fin) ?? (duree != null && fin > duree + 0.05 ? "La fenêtre dépasse la fin du fichier." : null), [debut, fin, duree]);

  const surMetadonnees = () => {
    const d = media.current?.duration;
    if (d && Number.isFinite(d)) {
      setDuree(d);
      setDebut(0);
      setLongueur(Math.min(FENETRE_SOURCE_MAX_SECONDES, Math.floor(d)));
    }
  };

  const deposer = (f: File | null | undefined) => {
    if (!f) return;
    setRetour(null);
    setEnvoi(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/voix/${assetId}/source`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setEnvoi(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => {
      setEnvoi(null);
      setRetour({ ok: false, texte: "Envoi interrompu : vérifie la connexion et dépose le fichier à nouveau." });
    };
    xhr.onload = () => {
      setEnvoi(null);
      let rep: { ok?: boolean; erreur?: string; src?: string; video?: boolean } = {};
      try {
        rep = JSON.parse(xhr.responseText);
      } catch {
        /* réponse illisible : message générique ci-dessous */
      }
      if (xhr.status >= 200 && xhr.status < 300 && rep.ok && rep.src) {
        setSrc(rep.src);
        setVideo(!!rep.video);
        setDuree(null);
        router.refresh();
      } else setRetour({ ok: false, texte: rep.erreur ?? `Envoi refusé (${xhr.status}).` });
    };
    const fd = new FormData();
    fd.append("fichier", f);
    xhr.send(fd);
  };

  const ecouterFenetre = () => {
    const m = media.current;
    if (!m) return;
    m.currentTime = debut;
    void m.play();
    const arreter = () => {
      if (m.currentTime >= fin) {
        m.pause();
        m.removeEventListener("timeupdate", arreter);
      }
    };
    m.addEventListener("timeupdate", arreter);
  };

  const extraire = () =>
    startLancement(async () => {
      media.current?.pause();
      const r = await lancerExtractionVoix(assetId, { debut, fin });
      setRetour(r.ok ? { ok: true, texte: r.position > 1 ? `Extraction ajoutée à la file, position ${r.position}.` : "Extraction lancée. Tu peux quitter la page : le suivi est dans l’icône du bandeau." } : { ok: false, texte: r.erreur });
      if (r.ok) router.refresh();
    });

  const utiliser = () => {
    if (!derniere || !nouvelle) return;
    startTransition(async () => {
      const r = await changer(() => adopterSourceVoix(derniere.id, nouvelle.texte));
      setRetour(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.erreur });
      if (r.ok) router.refresh();
    });
  };

  const retirer = (id: number) =>
    startTransition(async () => {
      const r = await supprimerGeneration(id);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
      if (r.ok) router.refresh();
    });

  const enregistrerTranscription = () => {
    if (actuelle.trim() === refText.trim()) return;
    startTransition(async () => {
      const r = await enregistrerVoix(assetId, { refText: actuelle });
      setRetour(r.ok ? { ok: true, texte: "Transcription enregistrée." } : { ok: false, texte: r.erreur });
      if (r.ok) router.refresh();
    });
  };

  const checks = checksReference({ fichier: referenceFichier, refText });

  return (
    <>
      <p className="cn-acte">Scène 3 · La source</p>
      <h2 className="cn-titre">
        Quelle voix <em>cloner</em> ?
      </h2>

      {!src ? (
        <>
          <button
            type="button"
            className={`av-depot${survol ? " is-survol" : ""}`}
            onClick={() => fichierInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              deposer(e.dataTransfer.files[0]);
            }}
            disabled={envoi != null}
          >
            <b>{envoi != null ? `Envoi en cours · ${envoi} %` : "Dépose un audio ou une vidéo"}</b>
            <small>Tu choisiras ensuite une fenêtre de {FENETRE_SOURCE_MAX_SECONDES} secondes au plus</small>
          </button>
          <input ref={fichierInput} type="file" accept="audio/*,video/*" hidden onChange={(e) => deposer(e.target.files?.[0])} aria-label="Fichier audio ou vidéo" />
          {envoi != null ? <div className="av-prog" role="progressbar" aria-valuenow={envoi} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${envoi}%` }} /></div> : null}
        </>
      ) : (
        <>
          {video ? (
            <video ref={media} className="av-media" src={src} controls preload="metadata" onLoadedMetadata={surMetadonnees} />
          ) : (
            <audio ref={media} className="av-media" style={{ maxHeight: 60 }} src={src} controls preload="metadata" onLoadedMetadata={surMetadonnees} />
          )}
          <div className="av-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={() => fichierInput.current?.click()} disabled={envoi != null}>
              {envoi != null ? `Envoi · ${envoi} %` : "Changer de fichier"}
            </button>
            <input ref={fichierInput} type="file" accept="audio/*,video/*" hidden onChange={(e) => deposer(e.target.files?.[0])} aria-label="Remplacer le fichier" />
          </div>

          <div className="av-fenetre" role="group" aria-label="Fenêtre à extraire">
            <label>
              <span>Début</span>
              <input
                type="range"
                min={0}
                max={duree != null ? Math.max(0, Math.floor(duree - FENETRE_SOURCE_MIN_SECONDES)) : 3600}
                step={0.5}
                value={debut}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  setDebut(d);
                  if (duree != null) setLongueur((l) => Math.max(FENETRE_SOURCE_MIN_SECONDES, Math.min(l, Math.floor(duree - d))));
                }}
              />
              <output>{mmss(debut)}</output>
            </label>
            <label>
              <span>Durée</span>
              <input
                type="range"
                min={FENETRE_SOURCE_MIN_SECONDES}
                max={duree != null ? Math.max(FENETRE_SOURCE_MIN_SECONDES, Math.min(FENETRE_SOURCE_MAX_SECONDES, Math.floor(duree - debut))) : FENETRE_SOURCE_MAX_SECONDES}
                step={0.5}
                value={longueur}
                onChange={(e) => setLongueur(Number(e.target.value))}
              />
              <output>{virgule(longueur)} s</output>
            </label>
            <span className="cn-note" style={{ margin: 0 }}>
              {mmss(debut)} → {mmss(fin)} · {FENETRE_SOURCE_MAX_SECONDES} s au maximum{duree != null ? ` · fichier de ${mmss(duree)}` : " · durée du fichier inconnue (format non lisible ici : règle la fenêtre à l’oreille)"}
            </span>
          </div>
          <div className="av-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={ecouterFenetre} disabled={duree == null}>
              ▶ Écouter la fenêtre
            </button>
            <button type="button" className="btn btn-primary" onClick={extraire} disabled={lancement || raison != null || enCours.length > 0} title={raison ?? undefined}>
              {lancement ? "…" : "Extraire la voix et transcrire"}
            </button>
            {raison ? <span className="av-pill is-manque">{raison}</span> : null}
          </div>
        </>
      )}

      {retour ? (
        <p className={`av-retour ${retour.ok ? "is-ok" : "is-erreur"}`} role={retour.ok ? "status" : "alert"}>
          {retour.texte}
        </p>
      ) : null}

      {enCours.length > 0 || echecs.length > 0 ? (
        <div style={{ maxWidth: 820, marginTop: 18 }}>
          <CandidatsTest nature="audio" generations={[...enCours, ...echecs]} occupe={pending} onAdopter={() => undefined} onSupprimer={retirer} onAnnuler={annuler} />
        </div>
      ) : null}

      {derniere && nouvelle ? (
        <div className="av-candidate">
          <p className="av-alerte">
            <b>Doit correspondre au mot près.</b> La reconnaissance vocale se trompe sur les mots liés et les liaisons. Écoute la voix isolée, puis corrige le texte.
          </p>
          <audio controls preload="none" src={derniere.src ?? undefined} aria-label="Voix isolée" />
          <label htmlFor="av-transcr" className="cn-note" style={{ display: "block" }}>
            Transcription
          </label>
          <div className="av-transcr" style={{ marginTop: 6 }}>
            <textarea
              id="av-transcr"
              value={nouvelle.texte}
              onChange={(e) => setNouvelle({ id: derniere.id, texte: e.target.value, modifie: true })}
              placeholder="Ce que dit la voix, mot pour mot."
            />
          </div>
          <div className="av-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={utiliser} disabled={pending || !nouvelle.texte.trim()}>
              {referenceFichier ? "Remplacer ma voix par celle-ci" : "Utiliser cette voix"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => retirer(derniere.id)} disabled={pending}>
              Jeter
            </button>
          </div>
        </div>
      ) : null}

      {referenceFichier ? (
        <div className="av-ref">
          <p className="av-bloc-titre">Voix actuelle</p>
          {referenceSrc ? <audio controls preload="none" src={referenceSrc} aria-label="Voix de référence actuelle" /> : <p className="cn-note">Référence introuvable sur le stockage ({referenceFichier}).</p>}
          <label htmlFor="av-trans-actuelle" className="cn-note" style={{ display: "block", marginTop: 10 }}>
            Sa transcription, au mot près
          </label>
          <div className="av-transcr" style={{ marginTop: 6 }}>
            <textarea id="av-trans-actuelle" value={actuelle} onChange={(e) => setActuelle(e.target.value)} onBlur={enregistrerTranscription} />
          </div>
          {checks.length > 0 ? (
            <ul className="av-notes">
              {checks.map((c) => (
                <li key={c.titre} className={c.niveau}>
                  <b>{c.titre}.</b> {c.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {dialogue}
    </>
  );
}
