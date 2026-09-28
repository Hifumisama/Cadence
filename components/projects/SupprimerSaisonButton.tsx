"use client";

import { useState, useTransition } from "react";
import { supprimerSaison } from "@/app/projects/actions";

export function SupprimerSaisonButton({ saisonId, titre }: { saisonId: number; titre: string }) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const onSupprimer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Supprimer définitivement la saison "${titre}" ?`)) return;
    setErreur(null);
    startTransition(async () => {
      const resultat = await supprimerSaison(saisonId);
      if (!resultat.ok) {
        if (window.confirm(`${resultat.erreur}\n\nForcer la suppression avec tout son contenu ?`)) {
          const force = await supprimerSaison(saisonId, true);
          if (!force.ok) setErreur(force.erreur);
        }
      }
    });
  };

  return (
    <span>
      <button className="btn btn-danger" type="button" onClick={onSupprimer} disabled={pending}>
        {pending ? "..." : "Supprimer"}
      </button>
      {erreur ? <p className="tiny-note" style={{ color: "var(--ecarlate-glow)", marginTop: 6 }}>{erreur}</p> : null}
    </span>
  );
}
