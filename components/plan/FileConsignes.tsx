"use client";

import { useState, useTransition } from "react";
import { bougerConsigne, corrigerConsigne, lancerLesConsignes, listerConsignes, retirerConsigne } from "@/app/consignes/actions";
import type { ConsigneEnAttente } from "@/lib/consignes";

/** Les consignes EN ATTENTE d'un plan (docs/PLAN_FILE_CONSIGNES.md) : des brouillons empilés sans attendre le rendu, modifiables tant qu'ils ne sont
 * pas lancés. « Lancer » les fusionne en UNE itération (un passage de l'agent, un rendu) ; elle se suit dans le panneau des tâches. */
export function FileConsignes({
  planId,
  file,
  onChange,
  bloque,
}: {
  planId: number;
  file: ConsigneEnAttente[];
  onChange: (file: ConsigneEnAttente[]) => void;
  /** Un essai ou une itération est déjà en cours sur ce plan : on peut empiler, pas encore lancer. */
  bloque: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [edition, setEdition] = useState<{ id: number; texte: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (file.length === 0 && !info && !erreur) return null;

  const relire = async () => onChange(await listerConsignes(planId));

  const agir = (fn: () => Promise<{ ok: boolean; erreur?: string }>, apres?: () => void) => {
    setErreur(null);
    setInfo(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErreur(r.erreur ?? "Quelque chose a échoué.");
      else apres?.();
      await relire();
    });
  };

  const lancer = () =>
    agir(
      async () => {
        const r = await lancerLesConsignes(planId);
        if (r.ok) setInfo(r.nb > 1 ? `${r.nb} consignes lancées en une seule itération : suis-la dans le panneau des tâches.` : "Itération lancée : suis-la dans le panneau des tâches.");
        return r;
      },
    );

  return (
    <div className="tm-file" aria-label="Consignes en attente">
      {file.length > 0 ? (
        <>
          <p className="tm-file-titre">
            Consignes en attente <small>({file.length}) · modifiables jusqu&rsquo;au lancement, appliquées ensemble en un seul rendu</small>
          </p>
          <ol className="tm-file-liste">
            {file.map((c, i) => (
              <li key={c.id}>
                {edition?.id === c.id ? (
                  <>
                    <textarea className="tm-consigne" rows={2} value={edition.texte} onChange={(e) => setEdition({ id: c.id, texte: e.target.value })} />
                    <span className="tm-file-actions">
                      <button type="button" className="tm-lien" disabled={pending} onClick={() => agir(() => corrigerConsigne(c.id, edition.texte), () => setEdition(null))}>
                        Enregistrer
                      </button>
                      <button type="button" className="tm-lien" onClick={() => setEdition(null)}>
                        Annuler
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="tm-file-texte">{c.texte}</span>
                    {Object.keys(c.reglages).length ? (
                      <small className="tm-file-reglages">
                        {[
                          c.reglages.dureeGenerationSecondes != null ? `${c.reglages.dureeGenerationSecondes} s` : null,
                          c.reglages.fps != null ? `${c.reglages.fps} fps` : null,
                          c.reglages.seed ? `seed ${c.reglages.seed}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    ) : null}
                    <span className="tm-file-actions">
                      <button type="button" className="tm-lien" disabled={pending || i === 0} aria-label="Monter" onClick={() => agir(() => bougerConsigne(c.id, -1))}>
                        ↑
                      </button>
                      <button type="button" className="tm-lien" disabled={pending || i === file.length - 1} aria-label="Descendre" onClick={() => agir(() => bougerConsigne(c.id, 1))}>
                        ↓
                      </button>
                      <button type="button" className="tm-lien" disabled={pending} onClick={() => setEdition({ id: c.id, texte: c.texte })}>
                        Modifier
                      </button>
                      <button type="button" className="tm-lien" disabled={pending} onClick={() => agir(() => retirerConsigne(c.id))}>
                        Retirer
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
          <div className="tm-actions">
            <button
              type="button"
              className="btn tm-btn-itere"
              disabled={pending || bloque}
              onClick={lancer}
              title={bloque ? "Un essai ou une itération est déjà en cours sur ce plan : lance tes consignes quand il sera fini." : undefined}
            >
              {file.length > 1 ? `Lancer les ${file.length} consignes` : "Lancer la consigne"}
            </button>
          </div>
        </>
      ) : null}
      {info ? (
        <p className="tiny-note" role="status">
          {info}
        </p>
      ) : null}
      {erreur ? (
        <p className="tm-erreur" role="alert">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
