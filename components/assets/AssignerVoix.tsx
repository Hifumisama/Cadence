"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { assignerVoixAuPersonnage } from "@/app/voix/actions";
import { Icone } from "@/components/ui/Icone";

/** « Voix » d'un personnage au registre : le lien est calculé depuis le casting
 * (voix_fiches.personnageId) et n'existe qu'à cet endroit — ce composant ne
 * fait que l'écrire, il ne le stocke pas ailleurs. Un personnage a au plus
 * une voix ; assigner une autre voix remplace la précédente. */
export function AssignerVoix({
  projectId,
  personnageId,
  voixActuelle,
  voixLibres,
  nbRepliques,
}: {
  projectId: number;
  personnageId: number;
  voixActuelle: { id: number; code: string } | null;
  /** Voix du catalogue qui n'ont pas encore de personnage. */
  voixLibres: { id: number; code: string }[];
  nbRepliques: number;
}) {
  const [pending, startTransition] = useTransition();
  const [choix, setChoix] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);

  const ecrire = (voixId: number | null) =>
    startTransition(async () => {
      const r = await assignerVoixAuPersonnage(personnageId, voixId);
      setErreur(r.ok ? null : r.erreur);
      if (r.ok) {
        setChoix("");
        setEdition(false);
      }
    });

  return (
    <div className="field-group">
      <label>Voix (casting vocal)</label>
      {voixActuelle && !edition ? (
        <div className="voix-lien">
          <Link href={`/p/${projectId}/voix/${voixActuelle.code}`} className="voix-chip">
            <Icone nom="musique" taille={13} /> {voixActuelle.code}
          </Link>
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => setEdition(true)} disabled={pending}>
            Changer
          </button>
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => ecrire(null)} disabled={pending}>
            Détacher
          </button>
        </div>
      ) : (
        <div className="voix-lien">
          <select className="field" value={choix} onChange={(e) => setChoix(e.target.value)} disabled={pending} aria-label="Voix à assigner">
            <option value="">— choisir une voix du catalogue</option>
            {voixLibres.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-gold btn-mini" onClick={() => ecrire(Number(choix))} disabled={pending || !choix}>
            Assigner
          </button>
          {edition ? (
            <button type="button" className="btn btn-ghost btn-mini" onClick={() => setEdition(false)} disabled={pending}>
              Annuler
            </button>
          ) : null}
          <Link href={`/p/${projectId}/voix`} className="tiny-note" style={{ color: "var(--ink-3)" }}>
            Catalogue →
          </Link>
        </div>
      )}
      {erreur ? <span className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</span> : null}
      <span className="tiny-note">
        {voixActuelle
          ? `${nbRepliques} réplique${nbRepliques > 1 ? "s" : ""} portée${nbRepliques > 1 ? "s" : ""} — elles prennent cette voix.`
          : `Sans voix : ses ${nbRepliques} réplique${nbRepliques > 1 ? "s" : ""} restent écrites, en attendant le casting.`}
      </span>
    </div>
  );
}
