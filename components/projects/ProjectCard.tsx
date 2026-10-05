import Link from "next/link";
import type { ProjectListItem } from "@/lib/queries";
import { Poster } from "@/components/ui/Poster";
import { totalBuckets } from "@/lib/phase";

export function ProjectCard({ projet }: { projet: ProjectListItem }) {
  const estSerie = projet.type === "serie";
  const total = totalBuckets(projet.buckets);

  return (
    <Link href={`/p/${projet.id}`} className="proj-card" aria-label={projet.nom}>
      <Poster src={projet.posterSrc} titre={projet.nom} cleRepli={`projet:${projet.id}`} taille="card" />
      <span className="proj-body">
        <span className="hd">
          <span className="type-tag">{estSerie ? "Série" : "OneShot"}</span>
        </span>
        <span className="stats">
          {estSerie ? (
            <>
              <span>
                <b>{projet.saisons.length}</b>
                saison{projet.saisons.length > 1 ? "s" : ""}
              </span>
              <span>
                <b>{projet.episodes.length}</b>
                épisode{projet.episodes.length > 1 ? "s" : ""}
              </span>
            </>
          ) : null}
          <span>
            <b>{total}</b>plans
          </span>
          <span>
            <b>{projet.nbAssets}</b>assets
          </span>
        </span>
        <span className="ft">
          {estSerie ? "Voir les saisons" : "Ouvrir le pipeline"}
          <span className="go">→</span>
        </span>
      </span>
    </Link>
  );
}
