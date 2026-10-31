"use client";

import { useState, useTransition } from "react";
import { supprimerPlan } from "@/app/plans/actions";
import { Icone } from "@/components/ui/Icone";

export function SupprimerPlanButton({
  planId,
  position,
  plansHref,
  libelle,
}: {
  planId: number;
  position: number;
  plansHref: string;
  /** Un texte à côté de la poubelle (dans un menu) ; sans lui, l'icône seule. */
  libelle?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const onSupprimer = (force: boolean) => {
    if (!window.confirm(
      force
        ? `Forcer la suppression du plan ${position} ? Les références d'assets et voix de dialogue encore liées seront détachées (les assets eux-mêmes restent dans le registre). Cette action est irréversible.`
        : `Supprimer définitivement le plan ${position} ?`,
    )) return;
    setErreur(null);
    startTransition(async () => {
      const resultat = await supprimerPlan(planId, plansHref, force);
      if (resultat && !resultat.ok) setErreur(resultat.erreur);
      // Succès : supprimerPlan redirige côté serveur, pas de retour ici.
    });
  };

  return (
    <span>
      <button className={libelle ? "btn btn-danger btn-sm" : "btn btn-danger btn-icone"} type="button" onClick={() => onSupprimer(false)} disabled={pending} title="Supprimer le plan" aria-label={`Supprimer le plan ${position}`}>
        <Icone nom={pending ? "encours" : "supprimer"} taille={16} />
        {libelle ? <span> {libelle}</span> : null}
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
