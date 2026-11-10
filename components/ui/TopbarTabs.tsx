"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Onglets Brief/Scénario/Tournage/Assets/Montage. Scénario, Tournage et Montage vivent sous l'épisode
 * courant (`episodeBase`, ex. `/p/3/e/9`) ; Assets vit au niveau du PROJET
 * (`/p/3/assets`), jamais sous un épisode précis — le registre est partagé
 * par toute la série (retour utilisateur 2026-09-28 : "super important que
 * l'on puisse accéder à assets depuis la vue projet"). Remplace l'ancien
 * TopbarNav.tsx, qui codait `/scenario` etc. en dur. */
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
    // Depuis le 2026-11-10 : Scénario = le texte à lire (format de script), Tournage = la frise de travail (fiches, rendus) qui était l'ancienne page Scénario.
    { seg: "tournage", label: "Tournage", href: `${episodeBase}/tournage` },
    { seg: "assets", label: "Assets", href: assetsHref },
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
