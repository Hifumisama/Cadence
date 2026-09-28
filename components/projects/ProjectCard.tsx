import Link from "next/link";
import type { ProjectListItem } from "@/lib/queries";
import { Poster } from "@/components/ui/Poster";
import { totalBuckets } from "@/lib/phase";

export function ProjectCard({ projet }: { projet: ProjectListItem }) {
  const estSerie = projet.type === "serie";
  const total = totalBuckets(projet.buckets);
  const { termine, actif, attente, brouillon } = projet.buckets;

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
        {total > 0 ? (
          <span className="mix" role="img" aria-label={`${termine} terminés, ${actif} actifs, ${attente} en attente, ${brouillon} brouillons`}>
            {termine ? <span className="m-t" style={{ width: `${(termine / total) * 100}%` }} /> : null}
            {actif ? <span className="m-e" style={{ width: `${(actif / total) * 100}%` }} /> : null}
            {attente ? <span className="m-a" style={{ width: `${(attente / total) * 100}%` }} /> : null}
            {brouillon ? <span className="m-b" style={{ width: `${(brouillon / total) * 100}%` }} /> : null}
          </span>
        ) : null}
        <span className="ft">
          {estSerie ? "Voir les saisons" : "Ouvrir le pipeline"}
          <span className="go">→</span>
        </span>
      </span>
    </Link>
  );
}
