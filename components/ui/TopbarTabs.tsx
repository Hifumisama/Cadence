"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Onglets Scénario/Assets/Plans. Scénario et Plans vivent sous l'épisode
 * courant (`episodeBase`, ex. `/p/3/e/9`) ; Assets vit au niveau du PROJET
 * (`/p/3/assets`), jamais sous un épisode précis — le registre est partagé
 * par toute la série (retour utilisateur 2026-09-28 : "super important que
 * l'on puisse accéder à assets depuis la vue projet"). Remplace l'ancien
 * TopbarNav.tsx, qui codait `/scenario` etc. en dur. */
export function TopbarTabs({ projectId, episodeBase }: { projectId: number; episodeBase: string }) {
  const pathname = usePathname();
  const assetsHref = `/p/${projectId}/assets`;
  const suffixeEpisode = pathname.startsWith(episodeBase) ? pathname.slice(episodeBase.length) : "";
  const segmentsEpisode = suffixeEpisode.split("/").filter(Boolean);
  const surAssets = pathname === assetsHref || pathname.startsWith(`${assetsHref}/`);
  const segmentActif = surAssets ? "assets" : (segmentsEpisode[0] ?? "");

  const onglets = [
    { seg: "scenario", label: "Scénario", href: `${episodeBase}/scenario` },
    { seg: "assets", label: "Assets", href: assetsHref },
    { seg: "plans", label: "Plans", href: `${episodeBase}/plans` },
  ];

  return (
    <nav className="tabs" aria-label="Écrans">
      {onglets.map((o) => (
        <Link key={o.seg} href={o.href} className="tab" aria-selected={segmentActif === o.seg}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
