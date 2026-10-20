import Link from "next/link";
import type { ReactNode } from "react";
import { PastilleLlm } from "@/components/llm/PastilleLlm";
import { IndicateurTaches } from "@/components/taches/IndicateurTaches";
import { TopbarTabs } from "./TopbarTabs";

/** Bandeau à deux niveaux (2026-10-18) : marque, fil d'Ariane (`trail`) et statuts (LLM, file
 * de générations) au-dessus ; les onglets en dessous, posés sur le filet or. Chaque écran
 * construit son fil d'Ariane selon sa profondeur dans Projet → Épisode. `tabs`, quand
 * fourni, affiche les onglets Brief/Scénario/Assets/Plans sous ce préfixe d'URL — absent sur
 * l'Accueil et la Vue série, qui ne sont "dans" aucun épisode.
 * d'onglet : on l'ouvre depuis le scénario (FRICTIONS, 2026-10-18). */
export function Topbar({
  trail,
  tabs,
}: {
  trail: ReactNode;
  tabs?: { projectId: number; episodeBase: string };
}) {
  return (
    <header className="topbar">
      <div className={`topbar-in${tabs ? " avec-onglets" : ""}`}>
        <div className="tb-brand">
          <svg className="tb-mark" viewBox="0 0 28 28" fill="none" strokeLinejoin="round" aria-hidden="true">
            <path className="tb-mark-ext" d="M14 2 20.5 7.5 26 14l-5.5 6.5L14 26l-6.5-5.5L2 14l5.5-6.5z" />
            <rect className="tb-mark-int" x="7.5" y="7.5" width="13" height="13" transform="rotate(45 14 14)" />
            <circle className="tb-mark-coeur" cx="14" cy="14" r="2.2" />
          </svg>
          <Link href="/" className="wordmark" title="Retour aux projets">
            Cadence
          </Link>
        </div>
        <nav className="trail" aria-label="Fil d'Ariane">
          {trail}
        </nav>
        <div className="tb-status">
          <PastilleLlm />
          <IndicateurTaches />
        </div>
        {tabs ? <TopbarTabs projectId={tabs.projectId} episodeBase={tabs.episodeBase} /> : null}
      </div>
    </header>
  );
}
