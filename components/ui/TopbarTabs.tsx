"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Onglets Brief/Scénario/Assets/Plans. Scénario et Plans vivent sous l'épisode
 * courant (`episodeBase`, ex. `/p/3/e/9`) ; Assets vit au niveau du PROJET
 * (`/p/3/assets`), jamais sous un épisode précis — le registre est partagé
 * par toute la série (retour utilisateur 2026-09-28 : "super important que
 * l'on puisse accéder à assets depuis la vue projet"). Remplace l'ancien
 * TopbarNav.tsx, qui codait `/scenario` etc. en dur. L'onglet « Réalisateur »
 * a été retiré le 2026-10-18 (la salle s'ouvre depuis le scénario) : sur sa
 * page, aucun onglet n'est actif. */
export function TopbarTabs({ projectId, episodeBase }: { projectId: number; episodeBase: string }) {
  const pathname = usePathname();
  const assetsHref = `/p/${projectId}/assets`;
  // Brief du projet (2026-10-02) : la référence du projet, au même niveau que Assets.
  const briefHref = `/p/${projectId}/brief`;
  const suffixeEpisode = pathname.startsWith(episodeBase) ? pathname.slice(episodeBase.length) : "";
  const segmentsEpisode = suffixeEpisode.split("/").filter(Boolean);
  const surAssets = pathname === assetsHref || pathname.startsWith(`${assetsHref}/`);
  const surBrief = pathname === briefHref || pathname.startsWith(`${briefHref}/`);
  const segmentActif = surAssets ? "assets" : surBrief ? "brief" : (segmentsEpisode[0] ?? "");

  const onglets = [
    { seg: "brief", label: "Brief", href: briefHref },
    { seg: "scenario", label: "Scénario", href: `${episodeBase}/scenario` },
    { seg: "assets", label: "Assets", href: assetsHref },
    { seg: "plans", label: "Plans", href: `${episodeBase}/plans` },
  ];

  return (
    <nav className="tabs" aria-label="Écrans">
      {onglets.map((o) => (
        <Link key={o.seg} href={o.href} className="tab" aria-selected={segmentActif === o.seg} aria-current={segmentActif === o.seg ? "page" : undefined}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
