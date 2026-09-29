"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ProjectHierarchy } from "@/lib/queries";
import { agregerPhases, phaseDe, statutAgrege } from "@/lib/phase";
import { Poster } from "@/components/ui/Poster";
import { PhaseBadge } from "@/components/projects/PhaseBadge";
import { StatusBadge, statusNodeClass } from "@/components/ui/StatusBadge";
import { SaisonEditModal } from "@/components/projects/SaisonEditModal";
import { SupprimerSaisonButton } from "@/components/projects/SupprimerSaisonButton";
import { creerEpisode } from "@/app/projects/actions";

type Saison = ProjectHierarchy["saisons"][number];

function two(n: number): string {
  return String(n).padStart(2, "0");
}

export function SaisonSection({ projectId, saison }: { projectId: number; saison: Saison }) {
  const [ouvert, setOuvert] = useState(true);
  const [pending, startTransition] = useTransition();

  const phaseSaison = agregerPhases(saison.episodes.map((e) => phaseDe(e.buckets)));
  const nbPlansSaison = saison.episodes.reduce((acc, e) => acc + e.nbPlans, 0);
  const plage = nbPlansSaison > 0 ? `${nbPlansSaison} plan${nbPlansSaison > 1 ? "s" : ""}` : "aucun plan";

  return (
    <section className="saison" data-open={ouvert}>
      <button type="button" className="saison-hd" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
        <span className="chev">▶</span>
        <Poster src={saison.posterSrc} titre={saison.titre} cleRepli={`saison:${saison.id}`} taille="sm" />
        <span className="sno">S{two(saison.numero)}</span>
        <span className="stitle">{saison.titre}</span>
        <hr className="zellige-rule" />
        <span className="srange">
          {saison.episodes.length} épisode{saison.episodes.length > 1 ? "s" : ""} · {plage}
          {phaseSaison.detail ? ` · ${phaseSaison.detail}` : ""}
        </span>
        <PhaseBadge agregee={phaseSaison} />
      </button>

      {ouvert ? (
        <div className="saison-bd">
          <div className="form-actions" style={{ marginBottom: "var(--sp-3)" }} onClick={(e) => e.stopPropagation()}>
            <SaisonEditModal saisonId={saison.id} titre={saison.titre} posterSrc={saison.posterSrc} />
            <SupprimerSaisonButton saisonId={saison.id} titre={saison.titre} />
          </div>

          <div className="frise">
            {saison.episodes.map((episode) => {
              const statut = statutAgrege(episode.buckets);
              const phase = phaseDe(episode.buckets);
              return (
                <Link
                  key={episode.id}
                  href={`/p/${projectId}/e/${episode.id}/scenario`}
                  className={`shot ep-row ${statusNodeClass(statut)}`}
                >
                  <span className="node" />
                  <Poster src={episode.posterSrc} titre={episode.titre} cleRepli={`episode:${episode.id}`} taille="mini" />
                  <span className="shot-title">
                    <span className="shot-no" style={{ marginRight: 8 }}>E{two(episode.numero)}</span>
                    {episode.titre}
                    <span className="shot-meta">
                      <span>{episode.nbPlans ? `${episode.nbPlans} plan${episode.nbPlans > 1 ? "s" : ""}` : "aucun plan"}</span>
                    </span>
                  </span>
                  <span className="shot-right">
                    <PhaseBadge agregee={{ phase, detail: null, bornes: [0, 0] }} />
                    <StatusBadge statut={statut} />
                  </span>
                </Link>
              );
            })}
            {saison.episodes.length === 0 ? (
              <p className="tiny-note" style={{ padding: "var(--sp-3) var(--sp-4)" }}>Aucun épisode dans cette saison.</p>
            ) : null}
          </div>

          <div className="add-ep">
            <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => startTransition(() => creerEpisode(saison.id))}>
              + Épisode
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
