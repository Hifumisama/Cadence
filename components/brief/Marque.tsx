import { PROVENANCE, type Provenance } from "./types";

const DESCRIPTIONS: Record<Provenance, string> = {
  fourni: "écrit ou corrigé par toi",
  deduit: "tiré de ton pitch par l'agent",
  confirmer: "l'agent n'est pas sûr",
};

/** La provenance d'un bloc, en discret : une petite marque à gauche du titre (le CSS la place devant, `order: -1`).
 * Jamais la couleur seule : chaque état a sa FORME (disque plein, anneau, losange) et un nom accessible, rappelé par
 * l'infobulle. « Fourni » est l'état normal, il se fait oublier ; « à confirmer » est le seul qui accroche l'œil. */
export function Marque({ etat }: { etat: Provenance }) {
  return (
    <span className={`bf-marque is-${etat}`} title={`${PROVENANCE[etat].libelle} : ${DESCRIPTIONS[etat]}`}>
      <span className="bf-sr">{PROVENANCE[etat].libelle}</span>
    </span>
  );
}
