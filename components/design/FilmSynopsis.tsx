"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatTime } from "@/lib/agents/sequence-display";
import type { EntreeSynopsis, SynopsisFilm } from "@/lib/agents/sheet-display";
import { FilmSequence } from "./FilmSequence";

const RYTHMES: Record<string, string> = { lent: "lent", mesure: "mesuré", soutenu: "soutenu", rapide: "rapide", variable: "variable" };

/** « Synopsis du film » button and its large popup, read like a film sheet (mock-up « Maquettes entretien », 2026-11-18): title, the story
 * in a few lines and the frame as tags; then the sequence on the left (by acts or direct clips), characters, places and what remains on the
 * right. No poster: it only exists once the brief is validated. Native modal <dialog>: focus kept inside, Escape and a click on the backdrop
 * close it. */
export function FilmSynopsis({ synopsis, resteADefinir = [] }: { synopsis: SynopsisFilm; resteADefinir?: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titreId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const s = synopsis;
  const duree = [s.dureeSecondes !== null ? formatTime(s.dureeSecondes) : "", RYTHMES[s.rythme] ?? s.rythme].filter(Boolean).join(" · ");
  const sansPoint = (t: string) => t.trim().replace(/[\s.;,]+$/, "");
  const etiquettes = [sansPoint(s.genreTon), duree, sansPoint(s.style), s.langue ? `Dialogues en ${s.langue.toLowerCase()}` : ""].filter(Boolean);

  return (
    <>
      <button type="button" className="btn fsy-ouvrir" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
        Synopsis du film
      </button>
      <dialog ref={ref} className="fsy" aria-labelledby={titreId} onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && setOpen(false)}>
        {open ? (
          <>
            <header className="fsy-tete">
              <div className="fsy-entete">
                <p className="fsy-sur">Synopsis du film</p>
                <h2 id={titreId}>{s.titre || "Sans titre pour l’instant"}</h2>
                {s.arc ? <p className="fsy-pitch">{s.arc}</p> : <p className="fsy-discret">L’histoire n’est pas encore racontée.</p>}
                {s.fin ? <p className="fsy-discret">La fin : {s.fin.charAt(0).toLowerCase() + s.fin.slice(1)}</p> : null}
                <ul className="fsy-etiquettes">
                  {etiquettes.map((e) => <li key={e}>{e}</li>)}
                  <li className={s.musique ? "" : "is-manque"} title={s.musique || undefined}>{s.musique ? "Musique notée" : "Musique : à proposer"}</li>
                </ul>
              </div>
              <button type="button" className="fsy-fermer" onClick={() => setOpen(false)} aria-label="Fermer le synopsis">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </header>
            <div className="fsy-corps">
              <section className="fsy-colonne fsy-sequence">
                <h3>La séquence</h3>
                <FilmSequence sequence={s.sequence} vueInitiale="acts" />
              </section>
              <div className="fsy-colonne">
                <Bloc titre="Personnages" vide={s.personnages.length === 0}><Entrees liste={s.personnages} /></Bloc>
                <Bloc titre={s.lieux.length > 1 ? "Lieux" : "Lieu"} vide={s.lieux.length === 0}><Entrees liste={s.lieux} /></Bloc>
                {s.elements.length ? <Bloc titre="Effets visuels et objets"><Entrees liste={s.elements} /></Bloc> : null}
                {s.univers ? <Bloc titre="Univers"><p className="fsy-texte">{s.univers}</p></Bloc> : null}
                {s.musique ? <Bloc titre="Musique"><p className="fsy-texte" lang="en">{s.musique}</p></Bloc> : null}
                {s.episodes.length ? <Bloc titre="Épisodes"><Entrees liste={s.episodes} /></Bloc> : null}
                {resteADefinir.length ? (
                  <Bloc titre="Reste à définir">
                    <ul className="fsy-reste">{resteADefinir.map((x) => <li key={x}>{x}</li>)}</ul>
                  </Bloc>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </dialog>
    </>
  );
}

function Bloc({ titre, vide = false, children }: { titre: string; vide?: boolean; children: ReactNode }) {
  return (
    <section className="fsy-bloc">
      <h3>{titre}</h3>
      {vide ? <p className="fsy-discret">Pas encore abordé.</p> : children}
    </section>
  );
}

function Entrees({ liste }: { liste: EntreeSynopsis[] }) {
  return (
    <ul className="fsy-entrees">
      {liste.map((e, i) => (
        <li key={`${e.nom}-${i}`}>
          {e.nom ? <b>{e.nom}</b> : null}
          {e.detail ? <span>{e.detail}</span> : null}
          {e.extra || e.nuancier?.length ? (
            <span className="fsy-extra">
              {e.extra}
              {e.nuancier?.length ? (
                <span className="fsy-nuancier" role="img" aria-label={`Couleurs : ${e.nuancier.map((c) => c.nom).join(", ")}`}>
                  {e.nuancier.map((c) => <span key={c.nom} style={{ background: c.hex }} title={c.nom} />)}
                </span>
              ) : null}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
