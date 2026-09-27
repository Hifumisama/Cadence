import Link from "next/link";
import { getShotsList } from "@/lib/queries";
import { StatusBadge, statusNodeClass } from "@/components/ui/StatusBadge";

export const dynamic = "force-dynamic";

const TALLY_ORDER = ["termine", "en_cours", "echoue", "rejoue", "en_attente"] as const;
const TALLY_LABEL: Record<string, string> = {
  termine: "Terminés",
  en_cours: "En cours",
  echoue: "Échoué",
  rejoue: "Rejoué",
  en_attente: "En attente",
};
const TALLY_CLASS: Record<string, string> = {
  termine: "is-termine",
  en_cours: "is-encours",
  echoue: "is-echoue",
  rejoue: "is-rejoue",
  en_attente: "is-attente",
};

export default async function ShotsPage() {
  const shots = await getShotsList();

  const comptes = new Map<string, number>();
  for (const s of shots) {
    const cle = s.statut === "previsualise" ? "en_cours" : s.statut;
    comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
  }

  return (
    <div>
      <div className="screen-hd">
        <div>
          <p className="eyebrow" style={{ margin: "0 0 6px" }}>
            Frise de production
          </p>
          <h1>Shots</h1>
          <p>
            Tous les plans de la série dans l&rsquo;ordre, sans remise à zéro par
            épisode.
          </p>
        </div>
      </div>

      {shots.length > 0 ? (
        <div className="tally">
          {TALLY_ORDER.map((cle) =>
            comptes.get(cle) ? (
              <div key={cle} className={`tally-item ${TALLY_CLASS[cle]}`}>
                <span className="v">{comptes.get(cle)}</span>
                <span className="k">{TALLY_LABEL[cle]}</span>
              </div>
            ) : null,
          )}
        </div>
      ) : null}

      <div className="zellige-sep">
        <span className="eyebrow">Épisode 1 — L&rsquo;auberge</span>
        <hr className="zellige-rule" />
      </div>

      <div className="frise">
        {shots.map((shot) => (
          <Link
            key={shot.numero}
            href={`/plans/${shot.numero}`}
            className={`shot ${statusNodeClass(shot.statut)}`}
          >
            <span className="node" />
            <span className="shot-no">{String(shot.numero).padStart(3, "0")}</span>
            <span className="shot-title">
              {shot.titre}
              {shot.dernierJob?.erreur ? (
                <span className="shot-meta">
                  <span style={{ color: "var(--ecarlate-glow)" }}>
                    Tentative {shot.dernierJob.tentative} : {shot.dernierJob.erreur}
                  </span>
                </span>
              ) : null}
            </span>
            <span className="shot-right">
              <StatusBadge statut={shot.statut} />
            </span>
          </Link>
        ))}
      </div>

      {shots.length === 0 ? (
        <p className="tiny-note" style={{ marginTop: "var(--sp-6)" }}>
          Aucun plan en base. Lancer <code>npm run db:import</code> pour importer
          l&rsquo;épisode 1 depuis le markdown existant.
        </p>
      ) : null}
    </div>
  );
}
