"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tabs Brief/Scénario/Tournage/Assets/Montage. Scénario, Tournage and Montage live under the current episode
 * (`episodeBase`, e.g. `/p/3/e/9`); Assets lives at the PROJECT level
 * (`/p/3/assets`), never under a specific episode — the registry is shared
 * by the whole series (user feedback 2026-09-28: "super important that
 * we can access assets from the project view"). Replaces the former
 * TopbarNav.tsx, which hard-coded `/scenario` etc. */
export function TopbarTabs({ projectId, episodeBase }: { projectId: number; episodeBase: string }) {
  const pathname = usePathname();
  const assetsHref = `/p/${projectId}/assets`;
  // Project brief (2026-10-02): the project's reference, at the same level as Assets.
  const briefHref = `/p/${projectId}/brief`;
  const suffixeEpisode = pathname.startsWith(episodeBase) ? pathname.slice(episodeBase.length) : "";
  const segmentsEpisode = suffixeEpisode.split("/").filter(Boolean);
  const surAssets = pathname === assetsHref || pathname.startsWith(`${assetsHref}/`);
  const surBrief = pathname === briefHref || pathname.startsWith(`${briefHref}/`);
  const segmentActif = surAssets ? "assets" : surBrief ? "brief" : (segmentsEpisode[0] ?? "");

  const onglets = [
    { seg: "brief", label: "Brief", href: briefHref },
    { seg: "scenario", label: "Scénario", href: `${episodeBase}/scenario` },
    // Since 2026-11-13: Assets comes before Tournage (assets are prepared before shooting).
    { seg: "assets", label: "Assets", href: assetsHref },
    // Since 2026-11-10: Scénario = the text to read (script format), Tournage = the working filmstrip (sheets, renders) which was the former Scénario page.
    { seg: "tournage", label: "Tournage", href: `${episodeBase}/tournage` },
    { seg: "montage", label: "Montage", href: `${episodeBase}/montage` },
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
