"use client";

import { useRef, useState, useTransition } from "react";
import { decoderAudio, encoderWav, formaterSecondes } from "@/lib/audio-trim";
import { Icone } from "@/components/ui/Icone";

/** Référence fournie : on dépose un audio, on règle début et fin pour qu'il
 * ait la taille exacte de la réplique, on l'écoute, puis on le dépose rogné
 * (WAV). Le rognage se fait dans le navigateur — le serveur reçoit déjà la
 * bonne taille. */
export function TrimAudio({
  action,
  aDejaUneReference,
}: {
  action: (formData: FormData) => Promise<void>;
  aDejaUneReference: boolean;
}) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [nom, setNom] = useState("");
  const [debut, setDebut] = useState(0);
  const [fin, setFin] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const [joue, setJoue] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const lecture = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null);

  const arreter = () => {
    lecture.current?.src.stop();
    void lecture.current?.ctx.close();
    lecture.current = null;
    setJoue(false);
  };

  const charger = async (f: File | undefined) => {
    if (!f) return;
    arreter();
    setErreur(null);
    try {
      const b = await decoderAudio(f);
      setBuffer(b);
      setNom(f.name.replace(/\.[^.]+$/, ""));
      setDebut(0);
      setFin(b.duration);
    } catch {
      setBuffer(null);
      setErreur("Ce fichier ne se décode pas dans le navigateur — essaie un WAV ou un FLAC.");
    }
  };

  const ecouter = () => {
    if (!buffer) return;
    if (joue) {
      arreter();
      return;
    }
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (lecture.current?.src === src) arreter();
    };
    src.start(0, debut, fin - debut);
    lecture.current = { ctx, src };
    setJoue(true);
  };

  const deposer = () => {
    if (!buffer) return;
    arreter();
    const blob = encoderWav(buffer, debut, fin);
    const fd = new FormData();
    fd.set("fichier", new File([blob], `${nom || "reference"}.wav`, { type: "audio/wav" }));
    startTransition(async () => {
      try {
        await action(fd);
        setBuffer(null);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec du dépôt.");
      }
    });
  };

  if (!buffer) {
    return (
      <div>
        <div
          className={`zone-depot${survol ? " is-survol" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            void charger(e.dataTransfer.files?.[0]);
          }}
        >
          {aDejaUneReference ? "Déposer un autre audio (remplace la référence)" : "Glisser l'audio de référence ici, ou cliquer"}
          <span className="tiny-note">FLAC ou WAV, jamais MP3 · il se rogne juste après</span>
          <input ref={inputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => void charger(e.target.files?.[0])} />
        </div>
        {erreur ? <p className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)", marginTop: 6 }}>{erreur}</p> : null}
      </div>
    );
  }

  const duree = buffer.duration;
  const pas = 0.01;
  return (
    <div className="trim">
      <div className="trim-hd">
        <span className="num">{nom}</span>
        <span className="tiny-note">durée d&rsquo;origine {formaterSecondes(duree)}</span>
        <span style={{ flex: 1 }} />
        <span className="vstat fit">{formaterSecondes(fin - debut)} gardées</span>
      </div>
      <div className="trim-double">
        <div className="trim-piste" />
        <div className="trim-select" style={{ left: `${(debut / duree) * 100}%`, right: `${100 - (fin / duree) * 100}%` }} />
        <input
          type="range"
          aria-label="Début"
          min={0}
          max={duree}
          step={pas}
          value={debut}
          onChange={(e) => setDebut(Math.min(Number(e.target.value), fin - 0.1))}
        />
        <input
          type="range"
          aria-label="Fin"
          min={0}
          max={duree}
          step={pas}
          value={fin}
          onChange={(e) => setFin(Math.max(Number(e.target.value), debut + 0.1))}
        />
      </div>
      <div className="trim-bornes tiny-note num">
        <span>début {formaterSecondes(debut)}</span>
        <span>fin {formaterSecondes(fin)}</span>
      </div>
      <div className="rep-actions">
        <button type="button" className="btn btn-ghost btn-mini" onClick={ecouter} disabled={pending}>
          {joue ? <><Icone nom="arret" taille={14} /> Arrêter</> : <><Icone nom="lecture" taille={14} /> Écouter la sélection</>}
        </button>
        <button type="button" className="btn btn-gold btn-mini" onClick={deposer} disabled={pending}>
          {pending ? "Envoi…" : "Rogner et utiliser comme référence"}
        </button>
        <button type="button" className="btn btn-ghost btn-mini" onClick={() => { arreter(); setBuffer(null); }} disabled={pending}>
          Annuler
        </button>
      </div>
      {erreur ? <p className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</p> : null}
    </div>
  );
}
