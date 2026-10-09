"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { doublerReplique } from "@/app/repliques/generation-actions";
import { encoderWavMono } from "@/lib/audio-trim";

/** Durée maximale d'une prise dans la cabine : une réplique tient en quelques secondes, et un WAV mono de 40 s reste loin des 10 Mo. */
const DUREE_MAX_S = 40;
/** Plafond d'une Server Action (next.config.mjs, 10 Mo) : un fichier déposé plus gros serait refusé à l'envoi. */
const TAILLE_MAX_PRISE = 10 * 1024 * 1024;

const virgule = (n: number) => n.toFixed(1).replace(".", ",");

/** La cabine de doublage : la réplique en grand (téléprompter), un bouton d'enregistrement, une jauge de durée. On joue la réplique au
 * micro du navigateur (ou on dépose un audio), on se réécoute, puis « Doubler avec cette voix » envoie la prise : la voix de référence la
 * redit avec NOTRE intonation et NOTRE rythme, et le résultat remplace la prise de la réplique. Le micro n'est jamais ouvert ailleurs
 * qu'ici, et le flux est libéré dès qu'on s'arrête ou qu'on ferme. */
export function CabineDoublage({
  repliqueId,
  texte,
  direction,
  dureePriseActuelle,
  onFermer,
  onLancee,
}: {
  repliqueId: number;
  texte: string;
  /** Précision de jeu à afficher sous la réplique, si on en connaît une. */
  direction?: string | null;
  /** Durée mesurée de la prise actuelle (repère sur la jauge), ou null. */
  dureePriseActuelle: number | null;
  onFermer: () => void;
  onLancee: () => void;
}) {
  const [enregistre, setEnregistre] = useState(false);
  const [ecoule, setEcoule] = useState(0);
  const [prise, setPrise] = useState<{ fichier: File; url: string; duree: number | null } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [envoi, startEnvoi] = useTransition();
  const flux = useRef<MediaStream | null>(null);
  const enregistreur = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const horloge = useRef<ReturnType<typeof setInterval> | null>(null);
  const debut = useRef(0);
  const boutonRec = useRef<HTMLButtonElement>(null);
  const urlCourante = useRef<string | null>(null);

  const liberer = () => {
    if (horloge.current) clearInterval(horloge.current);
    horloge.current = null;
    flux.current?.getTracks().forEach((t) => t.stop());
    flux.current = null;
  };

  // Fermer ou quitter libère le micro ; Échap ferme. Le parent repasse une fonction neuve à chaque rendu (le suivi des tâches le
  // refait souvent) : elle est lue par une référence, sinon l'effet se referait et couperait l'enregistrement en cours.
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  useEffect(() => {
    boutonRec.current?.focus();
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (enregistreur.current?.state === "recording") enregistreur.current.stop();
        liberer();
        fermer.current();
      }
    };
    window.addEventListener("keydown", touche);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", touche);
      document.body.style.overflow = "";
      liberer();
      if (urlCourante.current) URL.revokeObjectURL(urlCourante.current);
    };
  }, []);

  const garderPrise = (fichier: File, duree: number | null) => {
    if (urlCourante.current) URL.revokeObjectURL(urlCourante.current);
    const url = URL.createObjectURL(fichier);
    urlCourante.current = url;
    setPrise({ fichier, url, duree });
  };

  const arreter = () => {
    if (enregistreur.current?.state === "recording") enregistreur.current.stop();
  };

  const demarrer = async () => {
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return setMessage({ ok: false, texte: "Ce navigateur ne peut pas enregistrer. Dépose un fichier audio à la place." });
    }
    try {
      flux.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setMessage({ ok: false, texte: "Le micro n’est pas accessible : autorise-le dans le navigateur, ou dépose un fichier audio." });
    }
    morceaux.current = [];
    const rec = new MediaRecorder(flux.current);
    enregistreur.current = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && morceaux.current.push(e.data);
    rec.onstop = async () => {
      const duree = (performance.now() - debut.current) / 1000;
      liberer();
      setEnregistre(false);
      try {
        // Le navigateur enregistre en WebM/Opus : on décode et on réécrit en WAV mono, que ComfyUI lit partout.
        const ctx = new AudioContext();
        const brut = await new Blob(morceaux.current, { type: rec.mimeType }).arrayBuffer();
        const audio = await ctx.decodeAudioData(brut);
        void ctx.close();
        garderPrise(new File([encoderWavMono(audio)], "prise.wav", { type: "audio/wav" }), audio.duration);
      } catch {
        setMessage({ ok: false, texte: `La prise n’a pas pu être lue (${virgule(duree)} s). Refais-la, ou dépose un fichier audio.` });
      }
    };
    debut.current = performance.now();
    setEcoule(0);
    setPrise(null);
    rec.start();
    setEnregistre(true);
    horloge.current = setInterval(() => {
      const s = (performance.now() - debut.current) / 1000;
      setEcoule(s);
      if (s >= DUREE_MAX_S) arreter();
    }, 100);
  };

  const deposer = (f: File | undefined) => {
    if (!f) return;
    if (f.size > TAILLE_MAX_PRISE) return setMessage({ ok: false, texte: `Fichier trop volumineux (${(f.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_PRISE / 1024 / 1024} Mo).` });
    setMessage(null);
    garderPrise(f, null);
  };

  const doubler = () => {
    if (!prise) return;
    startEnvoi(async () => {
      const fd = new FormData();
      fd.append("prise", prise.fichier);
      const r = await doublerReplique(repliqueId, fd);
      if (r.ok) onLancee();
      else setMessage({ ok: false, texte: r.erreur });
    });
  };

  const mesure = prise?.duree ?? (enregistre ? ecoule : 0);
  const echelle = Math.max(dureePriseActuelle ?? 0, 8) * 1.25;
  const trop = dureePriseActuelle != null && mesure > dureePriseActuelle;

  return (
    <div className="av-cabine" role="dialog" aria-modal="true" aria-labelledby="av-cab-titre">
      <button type="button" className="btn av-ferme" onClick={() => { arreter(); liberer(); onFermer(); }}>
        Fermer · Échap
      </button>
      <div className="av-cab-corps">
        <p className="cn-acte" id="av-cab-titre" style={{ margin: 0 }}>
          Cabine de doublage
        </p>
        <div className="av-tele">{texte}</div>
        {direction ? <div className="cn-acte" style={{ margin: 0 }}>{direction}</div> : null}
        <div>
          <div className="av-jauge" aria-hidden="true">
            <i className={trop ? "is-trop" : ""} style={{ width: `${Math.min(100, (mesure / echelle) * 100)}%` }} />
            {dureePriseActuelle != null ? <b style={{ left: `${Math.min(100, (dureePriseActuelle / echelle) * 100)}%` }} /> : null}
          </div>
          <div className="av-jauge-lg">
            <span>0 s</span>
            <span>{dureePriseActuelle != null ? `Prise actuelle : ${virgule(dureePriseActuelle)} s` : "Pas de prise pour comparer"}</span>
          </div>
        </div>
        <div className="av-cab-rec">
          <button ref={boutonRec} type="button" className={`av-rec${enregistre ? " is-on" : ""}`} aria-label={enregistre ? "Arrêter l’enregistrement" : prise ? "Refaire la prise" : "Enregistrer"} onClick={enregistre ? arreter : demarrer} />
          <div>
            <div className="av-chrono">{enregistre ? `Enregistrement · ${virgule(ecoule)} s` : prise?.duree != null ? `${virgule(prise.duree)} s jouées` : prise ? "Fichier prêt" : "Prêt"}</div>
            <div className="cn-note" style={{ margin: 0 }} aria-live="polite">
              {trop ? `Plus long de ${virgule(mesure - (dureePriseActuelle ?? 0))} s que la prise actuelle : refais plus vite, ou le plan sera à rallonger.` : "Ton intonation et ton rythme sont gardés ; seule la voix change. Reste proche du registre de la voix cible."}
            </div>
          </div>
          {prise ? <audio controls src={prise.url} aria-label="Ta prise" /> : null}
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            Ou déposer un audio
            <input type="file" accept="audio/*" hidden onChange={(e) => deposer(e.target.files?.[0])} />
          </label>
          <button type="button" className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={doubler} disabled={!prise || enregistre || envoi}>
            {envoi ? "Envoi…" : "Doubler avec cette voix"}
          </button>
        </div>
        {message ? (
          <p className={`av-retour ${message.ok ? "is-ok" : "is-erreur"}`} role={message.ok ? "status" : "alert"}>
            {message.texte}
          </p>
        ) : null}
      </div>
    </div>
  );
}
