import { BoutonAgent } from "@/components/agents/BoutonAgent";
import type { DemandeAgent } from "@/components/agents/AgentsProvider";

const RAYON = 30;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

function formaterDuree(secondes: number): string {
  if (secondes < 60) return `${secondes} s`;
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return s ? `${m} min ${String(s).padStart(2, "0")} s` : `${m} min`;
}

/** État du scénario : où en sont les plans, et le geste logique qui suit. Un anneau (plans dont la fiche
 * est écrite sur le total) plutôt qu'une barre multi-segments : un seul message, lisible sans légende.
 * Les compteurs gardent leur libellé écrit en toutes lettres à côté du chiffre. L'action « Écrire les
 * fiches » vit ici parce qu'elle découle de cet état — elle n'apparaît que s'il reste des brouillons. */
export function EtatPlans({
  nbPlans,
  nbDeveloppes,
  nbScenes,
  dureeSecondes,
  demandeFiches,
}: {
  nbPlans: number;
  nbDeveloppes: number;
  nbScenes: number;
  dureeSecondes: number;
  demandeFiches: DemandeAgent;
}) {
  const nbBrouillons = nbPlans - nbDeveloppes;
  const ratio = nbPlans > 0 ? nbDeveloppes / nbPlans : 0;

  return (
    <section className="etat-plans" aria-label="État des plans">
      <svg className="etat-anneau" viewBox="0 0 76 76" role="img" aria-label={`${nbDeveloppes} plans développés sur ${nbPlans}`}>
        <circle cx="38" cy="38" r={RAYON} className="piste" />
        {ratio > 0 ? (
          <circle
            cx="38"
            cy="38"
            r={RAYON}
            className="avance"
            strokeDasharray={`${ratio * CIRCONFERENCE} ${CIRCONFERENCE}`}
            transform="rotate(-90 38 38)"
          />
        ) : null}
        <text x="38" y="40" textAnchor="middle" className="centre-v">
          {nbDeveloppes}
        </text>
        <text x="38" y="55" textAnchor="middle" className="centre-k">
          sur {nbPlans}
        </text>
      </svg>

      <div className="etat-corps">
        <p className="etat-titre">
          {nbPlans === 0
            ? "Aucun plan pour l'instant"
            : nbBrouillons === 0
              ? "Toutes les fiches de plan sont écrites"
              : `${nbDeveloppes} plan${nbDeveloppes > 1 ? "s" : ""} sur ${nbPlans} ${nbDeveloppes > 1 ? "ont" : "a"} sa fiche`}
        </p>
        <p className="etat-aide">Un plan naît en brouillon ; il entre en production quand sa fiche (le prompt vidéo) est écrite.</p>
        <ul className="etat-puces">
          <li className={nbBrouillons > 0 ? "is-brouillon" : undefined}>
            <b>{nbBrouillons}</b> brouillon{nbBrouillons > 1 ? "s" : ""}
          </li>
          <li className={nbDeveloppes > 0 ? "is-developpe" : undefined}>
            <b>{nbDeveloppes}</b> développé{nbDeveloppes > 1 ? "s" : ""}
          </li>
          <li>
            <b>{nbScenes}</b> scène{nbScenes > 1 ? "s" : ""}
          </li>
          {dureeSecondes > 0 ? (
            <li title="Somme des durées de montage">
              <b>~{formaterDuree(dureeSecondes)}</b> de montage
            </li>
          ) : null}
        </ul>
      </div>

      {nbBrouillons > 0 ? (
        <div className="etat-action">
          <BoutonAgent
            className="btn btn-gold"
            libelle={nbBrouillons > 1 ? `Écrire les ${nbBrouillons} fiches` : "Écrire la fiche"}
            titre="L'agent écrit la fiche (prompt vidéo) de chaque plan choisi, un par un ; tu relis avant que rien ne soit écrit"
            demande={demandeFiches}
          />
        </div>
      ) : null}
    </section>
  );
}
