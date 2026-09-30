"use client";

import { useState, useTransition } from "react";
import { creerReplique } from "@/app/repliques/actions";
import type { OptionsLocuteur } from "@/lib/queries-repliques";
import { SelecteurLocuteur } from "./SelecteurLocuteur";

/** Nouvelle réplique : le texte et le locuteur, dans un épisode. Sert à trois
 * endroits — le casting (épisode à choisir), la fiche de plan (épisode fixé,
 * avec `planId` : la réplique est aussitôt liée au plan) — sans jamais
 * demander de voix : elle se déduit du locuteur. */
export function NouvelleRepliqueForm({
  projectId,
  options,
  episodes,
  episodeIdFixe,
  planId,
  locuteurInitial = "",
  compact = false,
}: {
  projectId: number;
  options: OptionsLocuteur;
  /** Épisodes proposés quand `episodeIdFixe` n'est pas donné. */
  episodes?: { id: number; label: string }[];
  episodeIdFixe?: number;
  planId?: number;
  locuteurInitial?: string;
  compact?: boolean;
}) {
  const [texte, setTexte] = useState("");
  const [locuteur, setLocuteur] = useState(locuteurInitial);
  const [episodeId, setEpisodeId] = useState(String(episodeIdFixe ?? episodes?.[0]?.id ?? ""));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const valide = texte.trim() && locuteur && episodeId;

  const creer = () =>
    startTransition(async () => {
      const r = await creerReplique(projectId, Number(episodeId), { texte, locuteur, planId });
      if (r.ok) {
        setTexte("");
        setMessage(r.note ? { ok: true, texte: r.note } : null);
      } else {
        setMessage({ ok: false, texte: r.erreur });
      }
    });

  return (
    <form
      className={`rep-nouvelle${compact ? " is-compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (valide) creer();
      }}
    >
      <textarea
        className="field"
        rows={compact ? 2 : 3}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder="Le texte de la réplique, tel qu'il sera cité dans le prompt et dit dans la prise."
        disabled={pending}
        aria-label="Texte de la réplique"
      />
      <div className="rep-nouvelle-ligne">
        <SelecteurLocuteur options={options} value={locuteur} onChange={setLocuteur} disabled={pending} />
        {episodeIdFixe == null && episodes ? (
          <select className="field" value={episodeId} onChange={(e) => setEpisodeId(e.target.value)} disabled={pending} aria-label="Épisode">
            {episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.label}
              </option>
            ))}
          </select>
        ) : null}
        <span style={{ flex: 1 }} />
        {message ? (
          <span className="tiny-note" role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
            {message.texte}
          </span>
        ) : null}
        <button type="submit" className="btn btn-primary btn-mini" disabled={pending || !valide}>
          {pending ? "…" : planId != null ? "Créer et lier au plan" : "Créer la réplique"}
        </button>
      </div>
    </form>
  );
}
