"use client";

import { useEffect, useState, useTransition } from "react";
import { listerPrevisualisations, lancerPrevisualisations, type PlanPrevisualisation } from "@/app/plans/actions";

type Resultat = { n: number; bloques: number; dejaEnFile: number };

const s = (n: number) => (n > 1 ? "s" : "");
const lancable = (p: PlanPrevisualisation) => p.etat === "neuf" || p.etat === "rendu";

/** « Toutes les prévisualisations » : une fenêtre liste les plans de l'épisode, pour choisir exactement ce qu'on (re)rend. Les plans sans
 * rendu sont cochés d'office ; ceux qui en ont déjà un ne le sont pas (les cocher en fait un NOUVEAU rendu : l'historique garde les anciens) ;
 * ceux déjà en file ou aux dialogues bloquants sont grisés. */
export function ToutesPrevisualisationsButton({
  episodeId,
  nbManquants,
  className = "btn btn-ghost",
}: {
  episodeId: number;
  /** Fiche de plan : le nombre de plans sans aucun rendu. Quand il est donné, le bouton le montre (« Générer les prévisualisations (3) »)
   * et se désactive à zéro ; absent, c'est le bouton « Toutes les prévisualisations » de la frise des plans. */
  nbManquants?: number;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [liste, setListe] = useState<PlanPrevisualisation[] | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!liste) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setListe(null);
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [liste]);

  const ouvrir = () =>
    startTransition(async () => {
      setResultat(null);
      setErreur(null);
      try {
        const l = await listerPrevisualisations(episodeId);
        setCoches(new Set(l.filter((p) => p.etat === "neuf").map((p) => p.uuid)));
        setListe(l);
      } catch {
        setErreur("Impossible de lire les plans.");
      }
    });

  const lancer = () =>
    startTransition(async () => {
      try {
        setResultat(await lancerPrevisualisations(episodeId, [...coches]));
        setListe(null);
      } catch {
        setErreur("Le lancement a échoué.");
        setListe(null);
      }
    });

  const basculer = (uuid: string) =>
    setCoches((c) => {
      const n = new Set(c);
      if (!n.delete(uuid)) n.add(uuid);
      return n;
    });
  const cocher = (filtre: (p: PlanPrevisualisation) => boolean) => setCoches(new Set((liste ?? []).filter(filtre).map((p) => p.uuid)));

  const nNeufs = liste?.filter((p) => p.etat === "neuf").length ?? 0;
  const nLancables = liste?.filter(lancable).length ?? 0;
  const nRefaits = liste?.filter((p) => p.etat === "rendu" && coches.has(p.uuid)).length ?? 0;

  const notes: string[] = [];
  if (resultat) {
    notes.push(resultat.n > 0 ? `${resultat.n} prévisualisation${s(resultat.n)} mise${s(resultat.n)} en file` : "Rien à lancer");
    if (resultat.dejaEnFile > 0) notes.push(`${resultat.dejaEnFile} déjà en file`);
    if (resultat.bloques > 0) notes.push(`${resultat.bloques} sauté${s(resultat.bloques)} (dialogues à corriger)`);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <button
        type="button"
        className={className}
        disabled={pending || nbManquants === 0}
        onClick={ouvrir}
        title="Choisis les plans dont on lance la prévisualisation (sans upscale) : ceux sans rendu sont cochés d'office."
      >
        {pending && !liste
          ? "Lecture..."
          : nbManquants === undefined
            ? "Toutes les prévisualisations"
            : nbManquants === 0
              ? "Prévisualisations générées"
              : `Générer les prévisualisations (${nbManquants})`}
      </button>
      {resultat ? <span className="tiny-note">{notes.join(" · ")}.</span> : null}
      {erreur ? (
        <span className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)" }}>
          {erreur}
        </span>
      ) : null}

      {liste ? (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) setListe(null); }}>
          <div className="modal-box" role="dialog" aria-modal="true" aria-label="Lancer les prévisualisations">
            <div className="modal-hd">
              <h2>Toutes les prévisualisations</h2>
              <button type="button" className="modal-close" aria-label="Fermer" disabled={pending} onClick={() => setListe(null)}>
                ×
              </button>
            </div>
            <div className="modal-bd">
              {liste.length === 0 ? (
                <p className="tiny-note">Aucun plan développé dans cet épisode.</p>
              ) : (
                <>
                  <p className="tiny-note" style={{ marginTop: 0 }}>
                    Les plans sans rendu sont cochés. Cocher un plan qui a déjà un rendu en lance un nouveau (les anciens restent dans l&rsquo;historique).
                  </p>
                  <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => cocher((p) => p.etat === "neuf")}>
                      Seulement les nouveaux ({nNeufs})
                    </button>
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => cocher(lancable)}>
                      Tout cocher ({nLancables})
                    </button>
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => setCoches(new Set())}>
                      Rien
                    </button>
                  </div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                    {liste.map((p) => {
                      const ok = lancable(p);
                      return (
                        <li key={p.uuid}>
                          <label
                            style={{ display: "grid", gridTemplateColumns: "auto auto minmax(0, 1fr) auto", gap: 10, alignItems: "baseline", padding: "6px 4px", opacity: ok ? 1 : 0.5, cursor: ok ? "pointer" : "default" }}
                            title={p.raison ?? undefined}
                          >
                            <input type="checkbox" checked={ok && coches.has(p.uuid)} disabled={!ok || pending} onChange={() => basculer(p.uuid)} />
                            <span className="shot-no">{String(p.position).padStart(2, "0")}</span>
                            <span>{p.titre}</span>
                            <span className="tiny-note" style={p.etat === "rendu" && coches.has(p.uuid) ? { color: "var(--or-glow)" } : undefined}>
                              {p.etat === "neuf" ? "sans rendu" : p.etat === "rendu" ? (coches.has(p.uuid) ? "déjà un rendu · sera refait" : "déjà un rendu") : p.etat === "en_file" ? "déjà en file" : "dialogues à corriger"}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 16 }}>
                {nRefaits > 0 ? <span className="tiny-note">{nRefaits} rendu{s(nRefaits)} existant{s(nRefaits)} refait{s(nRefaits)}</span> : null}
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setListe(null)}>
                  Annuler
                </button>
                <button type="button" className="btn btn-gold" disabled={pending || coches.size === 0} onClick={lancer}>
                  {pending ? "Lancement..." : `Lancer ${coches.size} prévisualisation${s(coches.size)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
