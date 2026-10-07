import Link from "next/link";
import type { ProjectListItem } from "@/lib/queries";
import { Poster } from "@/components/ui/Poster";
import { PHASES, phaseDe, totalBuckets, type Phase } from "@/lib/phase";

/** État affiché sur la carte, dérivé des statuts de plans (jamais saisi). « Vide » parle au
 * système, pas à l'utilisateur : sur la carte, un projet sans plan est « À démarrer ». */
const ETAT_CARTE: Record<Phase, { label: string; classe: string }> = {
  vide: { label: "À démarrer", classe: "is-vide" },
  ecriture: { label: PHASES.ecriture.label, classe: "is-ecriture" },
  fiches: { label: PHASES.fiches.label, classe: "is-ecriture" },
  prod: { label: PHASES.prod.label, classe: "is-prod" },
  fini: { label: PHASES.fini.label, classe: "is-fini" },
};

export function ProjectCard({ projet }: { projet: ProjectListItem }) {
  const estSerie = projet.type === "serie";
  const total = totalBuckets(projet.buckets);
  const etat = ETAT_CARTE[phaseDe(projet.buckets)];
  // Des plans mais aucun asset : le projet ne peut pas avancer, on le fait remarquer.
  const sansAsset = total > 0 && projet.nbAssets === 0;

  return (
    <Link href={projet.conceptionEnCours ? `/p/${projet.id}/demarrage` : `/p/${projet.id}`} className="proj-card" aria-label={projet.conceptionEnCours ? `${projet.nom} : reprendre la conception` : projet.nom}>
      <Poster src={projet.posterSrc} titre={projet.nom} cleRepli={`projet:${projet.id}`} taille="card" />
      <span className="proj-body">
        <span className="hd">
          <span className="type-tag">{estSerie ? "Série" : "OneShot"}</span>
          <span className={`etat ${projet.conceptionEnCours ? "is-ecriture" : etat.classe}`}>{projet.conceptionEnCours ? "Conception en cours" : etat.label}</span>
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
            <b>{total}</b>plan{total > 1 ? "s" : ""}
          </span>
          <span className={sansAsset ? "is-zero" : undefined} title={sansAsset ? "Ce projet a des plans mais aucun asset" : undefined}>
            <b>{projet.nbAssets}</b>asset{projet.nbAssets > 1 ? "s" : ""}
          </span>
        </span>
        <span className="ft">
          {projet.conceptionEnCours ? "Reprendre la conception" : estSerie ? "Voir les saisons" : "Ouvrir"}
          <span className="go">→</span>
        </span>
      </span>
    </Link>
  );
}
