import Link from "next/link";
import { TYPES_ASSET } from "@/lib/assetCode";

const LIBELLES: Record<string, string> = {
  personnage: "Personnage",
  decor: "Décor",
  voix: "Voix",
  prop: "Prop",
  vfx: "VFX",
  sfx: "SFX",
  keyframe: "Keyframe",
  oth: "OTH",
};

/** Filtres par type via l'URL (?type=decor) : rendu serveur, partageable, pas
 * de JS client. Les types sans aucun sujet restent affichés (compteur à 0)
 * pour que la barre ne bouge pas d'un projet à l'autre. */
export function AssetFiltres({
  base,
  actif,
  compteurs,
  total,
}: {
  base: string;
  actif: string | null;
  compteurs: Record<string, number>;
  total: number;
}) {
  return (
    <nav className="asset-filtres" aria-label="Filtrer par type">
      <Link href={base} className={`asset-filtre${actif === null ? " is-actif" : ""}`}>
        Tous <span className="n">{total}</span>
      </Link>
      {TYPES_ASSET.map((t) => (
        <Link
          key={t}
          href={`${base}?type=${t}`}
          className={`asset-filtre${actif === t ? " is-actif" : ""}${(compteurs[t] ?? 0) === 0 ? " is-vide" : ""}`}
        >
          {LIBELLES[t] ?? t} <span className="n">{compteurs[t] ?? 0}</span>
        </Link>
      ))}
    </nav>
  );
}
