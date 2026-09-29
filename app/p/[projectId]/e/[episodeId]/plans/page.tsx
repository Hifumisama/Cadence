import Link from "next/link";
import { getPlansList } from "@/lib/queries";
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

export default async function PlansPage({
  params,
}: {
  params: Promise<{ projectId: string; episodeId: string }>;
}) {
  const { projectId, episodeId } = await params;
  const base = `/p/${projectId}/e/${episodeId}`;
  const plans = await getPlansList(Number(episodeId));

  const comptes = new Map<string, number>();
  for (const s of plans) {
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
          <h1>Plans</h1>
          <p>Tous les plans de cet épisode dans l&rsquo;ordre, sans remise à zéro.</p>
        </div>
      </div>

      {plans.length > 0 ? (
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

      <div className="frise">
        {plans.map((plan) => (
          <Link
            key={plan.uuid}
            href={`${base}/plans/${plan.uuid}`}
            className={`shot ${statusNodeClass(plan.statut)}`}
          >
            <span className="node" />
            <span className="shot-no">{String(plan.position).padStart(2, "0")}</span>
            <span className="shot-title">
              {plan.titre}
              {plan.dernierJob?.erreur ? (
                <span className="shot-meta">
                  <span style={{ color: "var(--ecarlate-glow)" }}>
                    Tentative {plan.dernierJob.tentative} : {plan.dernierJob.erreur}
                  </span>
                </span>
              ) : null}
            </span>
            <span className="shot-right">
              <StatusBadge statut={plan.statut} />
            </span>
          </Link>
        ))}
      </div>

      {plans.length === 0 ? (
        <p className="tiny-note" style={{ marginTop: "var(--sp-6)" }}>
          Aucun plan en base. Lancer <code>npm run db:import</code> pour importer
          l&rsquo;épisode 1 depuis le markdown existant.
        </p>
      ) : null}
    </div>
  );
}
