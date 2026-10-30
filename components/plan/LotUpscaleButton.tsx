"use client";

import { useEffect, useState, useTransition } from "react";
import { listerUpscales, lancerUpscaleEpisode, type PlanUpscalable } from "@/app/plans/actions";

const s = (n: number) => (n > 1 ? "s" : "");
const lancable = (p: PlanUpscalable) => p.etat === "pret" || p.etat === "modifie";
const LIBELLE: Record<PlanUpscalable["etat"], string> = {
  pret: "prêt",
  modifie: "fiche modifiée",
  final: "déjà en rendu final",
  en_file: "déjà en file",
  non_pret: "pas de prévisualisation retenue",
};

/** « Lancer l'upscale » : une fenêtre liste les plans de l'épisode, pour composer le lot. Les plans prêts (leur prévisualisation retenue est encore celle de la
 * fiche) sont cochés d'office et partent du latent de cette prévisualisation ; ceux dont la fiche a changé depuis ne le sont pas : les cocher, c'est accepter de les
 * régénérer (génération, upscale et finition) avec leur fiche d'aujourd'hui. Les autres sont grisés. */
export function LotUpscaleButton({ episodeId, prets }: { episodeId: number; prets: number }) {
  const [pending, startTransition] = useTransition();
  const [liste, setListe] = useState<PlanUpscalable[] | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
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
      setMessage(null);
      setErreur(null);
      try {
        const l = await listerUpscales(episodeId);
        setCoches(new Set(l.filter((p) => p.etat === "pret").map((p) => p.uuid)));
        setListe(l);
      } catch {
        setErreur("Impossible de lire les plans.");
      }
    });

  const lancer = () =>
    startTransition(async () => {
      try {
        const r = await lancerUpscaleEpisode(episodeId, [...coches]);
        const notes = [r.n > 0 ? `${r.n} rendu${s(r.n)} final${r.n > 1 ? "aux" : ""} mis en file` : "Rien à lancer"];
        if (r.dejaFinal) notes.push(`${r.dejaFinal} déjà en rendu final ou importé${s(r.dejaFinal)}`);
        if (r.dejaEnFile) notes.push(`${r.dejaEnFile} déjà en file`);
        if (r.bloques) notes.push(`${r.bloques} sauté${s(r.bloques)} (essai à revoir)`);
        setMessage(`${notes.join(" · ")}.`);
      } catch {
        setErreur("Le lancement de l'upscale a échoué.");
      }
      setListe(null);
    });

  const basculer = (uuid: string) =>
    setCoches((c) => {
      const n = new Set(c);
      if (!n.delete(uuid)) n.add(uuid);
      return n;
    });
  const cocher = (filtre: (p: PlanUpscalable) => boolean) => setCoches(new Set((liste ?? []).filter(filtre).map((p) => p.uuid)));

  const nPrets = liste?.filter((p) => p.etat === "pret").length ?? 0;
  const nLancables = liste?.filter(lancable).length ?? 0;
  const nRegeneres = liste?.filter((p) => p.etat === "modifie" && coches.has(p.uuid)).length ?? 0;

  return (
    <>
      <button type="button" className="btn tm-btn-or" disabled={pending || prets === 0} onClick={ouvrir} title="Choisis les plans dont on lance le rendu final (upscale et finition).">
        {pending && !liste ? "Lecture…" : "Lancer l'upscale"}
      </button>
      {message ? (
        <span className="tiny-note tm-top-note" role="status">
          {message}
        </span>
      ) : null}
      {erreur ? (
        <span className="tiny-note tm-top-note" role="alert" style={{ color: "var(--ecarlate-glow)" }}>
          {erreur}
        </span>
      ) : null}

      {liste ? (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) setListe(null); }}>
          <div className="modal-box" role="dialog" aria-modal="true" aria-label="Lancer l'upscale">
            <div className="modal-hd">
              <h2>Lancer l&rsquo;upscale</h2>
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
                    Les plans prêts partent du latent de leur prévisualisation retenue. Un plan dont la fiche a changé depuis n&rsquo;est pas coché : le cocher, c&rsquo;est
                    accepter de le régénérer avec sa fiche d&rsquo;aujourd&rsquo;hui avant l&rsquo;upscale (plus long).
                  </p>
                  <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => cocher((p) => p.etat === "pret")}>
                      Seulement les prêts ({nPrets})
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
                      const regenere = p.etat === "modifie" && coches.has(p.uuid);
                      return (
                        <li key={p.uuid}>
                          <label
                            style={{ display: "grid", gridTemplateColumns: "auto auto minmax(0, 1fr) auto", gap: 10, alignItems: "baseline", padding: "6px 4px", opacity: ok ? 1 : 0.5, cursor: ok ? "pointer" : "default" }}
                            title={p.raison ?? undefined}
                          >
                            <input type="checkbox" checked={ok && coches.has(p.uuid)} disabled={!ok || pending} onChange={() => basculer(p.uuid)} />
                            <span className="shot-no">{String(p.position).padStart(2, "0")}</span>
                            <span>{p.titre}</span>
                            <span className="tiny-note" style={regenere ? { color: "var(--or-glow)" } : undefined}>
                              {regenere ? "fiche modifiée · sera régénéré" : LIBELLE[p.etat]}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 16 }}>
                {nRegeneres > 0 ? <span className="tiny-note">{nRegeneres} plan{s(nRegeneres)} régénéré{s(nRegeneres)} avant l&rsquo;upscale</span> : null}
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setListe(null)}>
                  Annuler
                </button>
                <button type="button" className="btn btn-gold" disabled={pending || coches.size === 0} onClick={lancer}>
                  {pending ? "Lancement…" : `Lancer ${coches.size} rendu${s(coches.size)} final${coches.size > 1 ? "aux" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
