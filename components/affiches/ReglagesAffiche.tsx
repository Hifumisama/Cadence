"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reglerTitreAffiche } from "@/app/affiches/actions";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import type { CibleAffiche } from "@/lib/affiches";

/** Les deux réglages de l'affiche, avant de lancer la génération : écrire le titre dans l'image (ligne de titre du prompt) et
 * demander le prompt à l'agent. L'agent suit le même parcours que pour un asset : une consigne, le contexte lu, une proposition
 * à relire et à accepter (elle remplace le prompt de l'affiche). */
export function ReglagesAffiche({
  cible,
  id,
  projectId,
  assetCode,
  libelle,
  titreDansImage,
  personnage,
}: {
  cible: CibleAffiche;
  id: number;
  projectId: number;
  assetCode: string;
  libelle: string;
  titreDansImage: boolean;
  /** Le personnage principal retenu, et si son image sert de première source. */
  personnage: { nom: string; aImage: boolean } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = (actif: boolean) =>
    startTransition(async () => {
      const r = await reglerTitreAffiche(cible, id, actif);
      setErreur(r.ok ? null : r.erreur);
      router.refresh();
    });

  return (
    <div className="aff-reglages">
      <label className="aff-case">
        <input type="checkbox" checked={titreDansImage} disabled={pending} onChange={(e) => basculer(e.target.checked)} />
        <span>
          Écrire le titre dans l&rsquo;image
          <small>
            {titreDansImage
              ? "Le modèle dessine le titre : il n'est pas superposé une seconde fois. Un titre renommé demande une nouvelle image."
              : "Sinon le titre se superpose à l'affichage, net et toujours à jour."}
          </small>
        </span>
      </label>

      <div className="aff-agent">
        <BoutonAgent
          className="btn btn-ghost"
          libelle="Demander le prompt à l'agent"
          titre="L'agent lit le titre, le résumé, le ton et le personnage principal, puis propose un prompt que tu relis avant de l'accepter"
          demande={{ projectId, portee: "asset", cible: { code: assetCode }, profondeur: "courte", libelle }}
        />
        <small>
          {personnage
            ? personnage.aImage
              ? `Le personnage principal (${personnage.nom}) sert de point de départ : son image est la première source.`
              : `Le personnage principal (${personnage.nom}) est décrit dans le prompt, mais il n'a pas encore d'image : la cohérence sera moindre.`
            : "Aucun personnage principal repéré dans le registre : l'agent compose à partir du résumé."}
        </small>
      </div>

      {erreur ? (
        <p className="aff-retour is-erreur" role="status">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
