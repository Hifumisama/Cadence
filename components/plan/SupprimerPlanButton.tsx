"use client";

import { useState, useTransition } from "react";
import { supprimerPlan } from "@/app/plans/[numero]/actions";

export function SupprimerPlanButton({
  planId,
  planNumero,
  shotsHref,
}: {
  planId: number;
  planNumero: number;
  shotsHref: string;
}) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const onSupprimer = (force: boolean) => {
    if (!window.confirm(
      force
        ? `Forcer la suppression du plan ${planNumero} ? Les références d'assets et voix de dialogue encore liées seront détachées (les assets eux-mêmes restent dans le registre). Cette action est irréversible.`
        : `Supprimer définitivement le plan ${planNumero} ?`,
    )) return;
    setErreur(null);
    startTransition(async () => {
      const resultat = await supprimerPlan(planId, shotsHref, force);
      if (resultat && !resultat.ok) setErreur(resultat.erreur);
      // Succès : supprimerPlan redirige côté serveur, pas de retour ici.
    });
  };

  return (
    <span>
      <button className="btn btn-danger" type="button" onClick={() => onSupprimer(false)} disabled={pending}>
        {pending ? "..." : "Supprimer"}
      </button>
      {erreur ? (
        <p className="tiny-note" style={{ color: "var(--ecarlate-glow)", marginTop: 6 }}>
          {erreur}{" "}
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => onSupprimer(true)}
            disabled={pending}
            style={{ marginLeft: 6 }}
          >
            Forcer
          </button>
        </p>
      ) : null}
    </span>
  );
}
