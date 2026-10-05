"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { redigerPromptAffiche, reglerTitreAffiche } from "@/app/affiches/actions";
import { Icone } from "@/components/ui/Icone";
import type { CibleAffiche } from "@/lib/affiches";

/** Les deux réglages de l'affiche, avant de lancer la génération : écrire le titre dans l'image (ligne de titre du prompt) et
 * faire rédiger le prompt par l'agent (titre, résumé, ton, personnage principal). */
export function ReglagesAffiche({
  cible,
  id,
  titreDansImage,
  personnage,
}: {
  cible: CibleAffiche;
  id: number;
  titreDansImage: boolean;
  /** Le personnage principal retenu, et si son image sert de première source. */
  personnage: { nom: string; aImage: boolean } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  const basculer = (actif: boolean) =>
    startTransition(async () => {
      const r = await reglerTitreAffiche(cible, id, actif);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
      router.refresh();
    });

  const rediger = () =>
    startTransition(async () => {
      setRetour(null);
      const r = await redigerPromptAffiche(cible, id);
      setRetour(
        r.ok
          ? { ok: true, texte: r.remarques.length > 0 ? `Prompt rédigé. À noter : ${r.remarques.join(" ")}` : "Prompt rédigé : relis-le dans la fenêtre de génération." }
          : { ok: false, texte: r.erreur },
      );
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
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={rediger} aria-busy={pending}>
          <Icone nom="agent" taille={16} /> {pending ? "L'agent rédige…" : "Rédiger le prompt avec l'agent"}
        </button>
        <small>
          {personnage
            ? personnage.aImage
              ? `Le personnage principal (${personnage.nom}) sert de point de départ : son image est la première source.`
              : `Le personnage principal (${personnage.nom}) est décrit dans le prompt, mais il n'a pas encore d'image : la cohérence sera moindre.`
            : "Aucun personnage principal repéré dans le registre : l'agent compose à partir du résumé."}
        </small>
      </div>

      {retour ? (
        <p className={retour.ok ? "aff-retour" : "aff-retour is-erreur"} role="status">
          {retour.texte}
        </p>
      ) : null}
    </div>
  );
}
