"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TopbarNav() {
  const pathname = usePathname();
  const surScenario = pathname === "/scenario";
  const surAssets = pathname.startsWith("/assets");
  const surShots = pathname === "/shots";
  const surFiche = pathname.startsWith("/plans/");

  return (
    <nav className="tabs" aria-label="Écrans">
      <Link href="/scenario" className="tab" aria-selected={surScenario}>
        Scénario
      </Link>
      <Link href="/assets" className="tab" aria-selected={surAssets}>
        Assets
      </Link>
      <Link href="/shots" className="tab" aria-selected={surShots}>
        Shots
      </Link>
      {surFiche ? (
        <span className="tab" aria-selected="true">
          Fiche de plan <span className="num">{pathname.split("/")[2]}</span>
        </span>
      ) : null}
    </nav>
  );
}
