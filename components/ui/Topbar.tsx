import Link from "next/link";
import type { ReactNode } from "react";
import { BoutonAgentGlobal } from "@/components/agents/BoutonAgentGlobal";
import { PastilleLlm } from "@/components/llm/PastilleLlm";
import { IndicateurTaches } from "@/components/taches/IndicateurTaches";
import { TopbarTabs } from "./TopbarTabs";

/** Bandeau — le fil d'Ariane (`trail`) remplace le texte fixe "Les Yeux de
 * Rubis · S01" d'origine (2026-09-28) : chaque écran construit le sien
 * selon sa profondeur dans Projet → Saison → Épisode. `tabsBase`, quand
 * fourni, affiche les onglets Scénario/Assets/Plans sous ce préfixe
 * d'URL — absent sur l'Accueil et la Vue série, qui ne sont "dans" aucun
 * épisode. */
export function Topbar({
  trail,
  tabs,
}: {
  trail: ReactNode;
  tabs?: { projectId: number; episodeBase: string };
}) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <div className="brand">
          <Link href="/" className="wordmark" title="Retour aux projets">
            Cadence
          </Link>
          <nav className="trail" aria-label="Fil d'Ariane">
            {trail}
          </nav>
        </div>
        {tabs ? <TopbarTabs projectId={tabs.projectId} episodeBase={tabs.episodeBase} /> : null}
        <BoutonAgentGlobal />
        <PastilleLlm />
        <IndicateurTaches />
      </div>
    </header>
  );
}
