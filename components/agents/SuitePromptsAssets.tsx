"use client";

import { useEffect, useState } from "react";
import { genererPromptsAssetsCrees } from "@/app/agents/actions";
import { assetsCreesSansPromptVue, estimerRegistreVue } from "@/app/agents/lecture";
import { useAgents } from "@/components/agents/AgentsProvider";
import type { ContexteEtape } from "@/components/agents/contexte";
import { libelleEstimation } from "@/lib/agents-affichage";
import type { EstimationGeneration } from "@/lib/agents/types";

/** Après l'application d'une fiche de plan : « Continuer : écrire les prompts des assets créés ». Les assets
 * manquants que la fiche a CRÉÉS n'ont qu'une description ; leurs prompts d'image s'écrivent ici, en lot
 * (`prompt-asset`, un asset à la fois), dans la conversation du PROJET (seule portée qui modifie un asset
 * existant) : la popup s'y rend pour suivre le lot. Jamais lancé tout seul. Rien à proposer : rien d'affiché. */
export function SuitePromptsAssets({ ctx }: { ctx: ContexteEtape }) {
  const { prop, occupe } = ctx;
  const { ouvrirAgent } = useAgents();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [estimation, setEstimation] = useState<EstimationGeneration | null>(null);

  useEffect(() => {
    if (!prop) return;
    let annule = false;
    assetsCreesSansPromptVue(prop.uuid)
      .then((l) => {
        if (annule) return;
        setCodes(l.map((a) => a.code));
        if (l.length) estimerRegistreVue(l.length).then((e) => !annule && setEstimation(e)).catch(() => undefined);
      })
      .catch(() => setCodes([]));
    return () => {
      annule = true;
    };
  }, [prop]);

  if (!prop || !codes || codes.length === 0) return null;

  const lancer = () =>
    void ctx.lancer(
      () => genererPromptsAssetsCrees(prop.uuid),
      (r) => {
        if (r.ok && "conversationUuid" in r) ouvrirAgent({ conversationUuid: r.conversationUuid, projectId: ctx.conv.projectId });
      },
    );

  return (
    <div className="ag-etape-corps ag-eps">
      <div>
        <h3 className="ag-eps-titre">Continuer : écrire les prompts des assets créés</h3>
        <p className="tiny-note">
          {codes.length === 1 ? "Un asset a été créé" : `${codes.length} assets ont été créés`} sans prompt d&rsquo;image : <span className="num">{codes.join(", ")}</span>. L&rsquo;agent écrit leurs prompts un par un (en partant
          du parent quand il y en a un) ; tu relis ensuite, dans la conversation du projet.
        </p>
      </div>
      <div className="ag-lancer">
        <span className="tiny-note ag-estimation" role="status">
          {estimation ? libelleEstimation(estimation) : "…"}
        </span>
        <button type="button" className="btn btn-gold" onClick={lancer} disabled={occupe}>
          {occupe ? "…" : `Écrire les prompts (${codes.length})`}
        </button>
      </div>
    </div>
  );
}
