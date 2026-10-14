"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Onglets Brief/Scénario/Assets/Plans/Réalisateur. Scénario et Plans vivent sous l'épisode
 * courant (`episodeBase`, ex. `/p/3/e/9`) ; Assets vit au niveau du PROJET
 * (`/p/3/assets`), jamais sous un épisode précis — le registre est partagé
 * par toute la série (retour utilisateur 2026-09-28 : "super important que
 * l'on puisse accéder à assets depuis la vue projet"). Remplace l'ancien
 * TopbarNav.tsx, qui codait `/scenario` etc. en dur. */
export function TopbarTabs({ projectId, episodeBase, brouillon = 0 }: { projectId: number; episodeBase: string; brouillon?: number }) {
  const pathname = usePathname();
  const assetsHref = `/p/${projectId}/assets`;
  // Brief du projet (2026-10-02) : la référence du projet, au même niveau que Assets.
  const briefHref = `/p/${projectId}/brief`;
  // Réalisateur (2026-10) : la révision de l'épisode, une salle plein cadre hors du layout d'épisode (`/p/<projet>/realisateur/<épisode>`).
  const episodeId = /\/e\/(\d+)\/?$/.exec(episodeBase)?.[1] ?? null;
  const realisateurHref = episodeId ? `/p/${projectId}/realisateur/${episodeId}` : null;
  const surRealisateur = pathname.startsWith(`/p/${projectId}/realisateur`);
  const suffixeEpisode = pathname.startsWith(episodeBase) ? pathname.slice(episodeBase.length) : "";
  const segmentsEpisode = suffixeEpisode.split("/").filter(Boolean);
  const surAssets = pathname === assetsHref || pathname.startsWith(`${assetsHref}/`);
  const surBrief = pathname === briefHref || pathname.startsWith(`${briefHref}/`);
  const segmentActif = surRealisateur ? "realisateur" : surAssets ? "assets" : surBrief ? "brief" : (segmentsEpisode[0] ?? "");

  const onglets = [
    { seg: "brief", label: "Brief", href: briefHref },
    { seg: "scenario", label: "Scénario", href: `${episodeBase}/scenario` },
    { seg: "assets", label: "Assets", href: assetsHref },
    { seg: "plans", label: "Plans", href: `${episodeBase}/plans` },
    ...(realisateurHref ? [{ seg: "realisateur", label: "Réalisateur", href: realisateurHref }] : []),
  ];

  return (
    <nav className="tabs" aria-label="Écrans">
      {onglets.map((o) => (
        <Link key={o.seg} href={o.href} className="tab" aria-selected={segmentActif === o.seg}>
          {o.label}
          {o.seg === "realisateur" && brouillon > 0 ? (
            <span className="tab-pastille" title={`${brouillon} décision${brouillon > 1 ? "s" : ""} en cours`}>
              {brouillon}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
