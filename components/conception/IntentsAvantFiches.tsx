"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { lireIntentsProjet, modifierIntentPlan } from "@/app/creation/actions";
import type { PlanIntent } from "@/lib/agents/creation-vue";

const pad = (n: number) => String(n).padStart(2, "0");

/** Fin de la phase 1 de la préparation (lib/agents/creation.ts) : les intents des plans (leur description), à relire AVANT d'écrire les fiches — une
 * fiche écrite sur un intent faux coûte un rendu et une itération pour rien. Un plan sans fiche se corrige ici ; un plan qui a déjà sa fiche se lit, et
 * se retouche dans son atelier. « Écrire les fiches » lance la phase 2 pour tous les plans sans fiche ; « Plus tard » les laisse (chaque fiche reste
 * possible plan par plan depuis l'atelier, ou en lot depuis la page Scénario). */
export function IntentsAvantFiches({
  projectId,
  initial,
  enCours,
  onEcrire,
  onPlusTard,
}: {
  projectId: number;
  initial: PlanIntent[];
  /** Une action est en vol (lancement de la phase 2). */
  enCours: boolean;
  onEcrire: () => void;
  onPlusTard: () => void;
}) {
  const [plans, setPlans] = useState<PlanIntent[]>(initial);
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [erreurs, setErreurs] = useState<Record<string, string | null>>({});
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const [pending, demarrer] = useTransition();

  // La page a pu être chargée pendant la phase 1 (plans pas encore écrits) : on relit les plans à l'ouverture.
  useEffect(() => {
    let vivant = true;
    void lireIntentsProjet(projectId).then((l) => {
      if (vivant) setPlans(l);
    });
    return () => {
      vivant = false;
    };
  }, [projectId]);

  const sansFiche = plans.filter((p) => !p.aUneFiche).length;
  const modifies = Object.keys(brouillons).filter((u) => brouillons[u] !== plans.find((p) => p.uuid === u)?.description);

  const enregistrer = (uuid: string) =>
    demarrer(async () => {
      const texte = brouillons[uuid] ?? "";
      const r = await modifierIntentPlan(projectId, uuid, texte);
      if (!r.ok) {
        setErreurs((e) => ({ ...e, [uuid]: r.erreur }));
        return;
      }
      setErreurs((e) => ({ ...e, [uuid]: null }));
      setPlans(await lireIntentsProjet(projectId));
      setBrouillons((b) => {
        const n = { ...b };
        delete n[uuid];
        return n;
      });
      setEnregistre(uuid);
      setTimeout(() => setEnregistre((x) => (x === uuid ? null : x)), 1500);
    });

  let sceneAffichee: string | null | undefined;
  return (
    <div className="cn-intents">
      <div className="cn-intents-tete">
        <b>Relis les intents avant d&rsquo;écrire les fiches</b>
        <span>
          Le scénario est écrit et relu. Chaque fiche met en images l&rsquo;intent de son plan : corrige ici ce qui est faux, pendant que les images de référence se fabriquent. Open H3 IR
          compile ensuite chaque fiche (créativité et style de mise en scène compris) ; plan-h3 choisit d&rsquo;abord les références des plans qui n&rsquo;en ont pas.
        </span>
      </div>
      <ul className="cn-intents-liste" aria-label="Intents des plans">
        {plans.map((p) => {
          const entete = p.scene !== sceneAffichee;
          sceneAffichee = p.scene;
          const valeur = brouillons[p.uuid] ?? p.description;
          const change = valeur !== p.description;
          return (
            <li key={p.uuid}>
              {entete && p.scene ? <div className="cn-intents-scene">{p.scene}</div> : null}
              <div className="cn-intent">
                <div className="cn-intent-hd">
                  <span className="num">{pad(p.position)}</span>
                  <b>{p.titre}</b>
                  <Link href={p.atelierHref} className="cn-lien">
                    Ouvrir l&rsquo;atelier
                  </Link>
                </div>
                {p.aUneFiche ? (
                  <>
                    <p>{p.description || "(pas d'intent)"}</p>
                    <div className="cn-intent-pied">Fiche déjà écrite : l&rsquo;intent se corrige dans l&rsquo;atelier (« Itérer » réécrit la fiche avec).</div>
                  </>
                ) : (
                  <>
                    <textarea
                      aria-label={`Intent du plan ${pad(p.position)} · ${p.titre}`}
                      value={valeur}
                      onChange={(e) => setBrouillons((b) => ({ ...b, [p.uuid]: e.target.value }))}
                    />
                    <div className="cn-intent-pied">
                      {change ? (
                        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => enregistrer(p.uuid)}>
                          Enregistrer
                        </button>
                      ) : enregistre === p.uuid ? (
                        <span role="status">Enregistré</span>
                      ) : null}
                      {erreurs[p.uuid] ? (
                        <span className="cn-erreur" role="alert">
                          {erreurs[p.uuid]}
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="cn-clap-actions">
        <button
          type="button"
          className="btn btn-gold"
          disabled={enCours || pending || modifies.length > 0}
          title={modifies.length > 0 ? "Enregistre d'abord les intents modifiés" : undefined}
          onClick={onEcrire}
        >
          {sansFiche > 0 ? `Écrire les fiches (${sansFiche} plan${sansFiche > 1 ? "s" : ""})` : "Écrire les fiches"}
        </button>
        <button type="button" className="btn" disabled={enCours} onClick={onPlusTard}>
          Plus tard
        </button>
        {modifies.length > 0 ? <span className="cn-note">{modifies.length} intent{modifies.length > 1 ? "s" : ""} modifié{modifies.length > 1 ? "s" : ""}, pas encore enregistré{modifies.length > 1 ? "s" : ""}.</span> : null}
      </div>
    </div>
  );
}
