"use client";

import { useRouter } from "next/navigation";
import { modifierChampBrief } from "@/app/agents/actions";
import { BriefSections } from "@/components/agents/BriefSections";
import type { VueBrief } from "@/lib/agents/types";

/** Le brief du projet hors popup : mêmes sections, mêmes trois états, même édition. Corriger
 * une section l'enregistre et la passe à « fourni ». C'est le document de RÉFÉRENCE : il peut
 * aussi évoluer par une proposition de l'agent (nouvelle scène → durée, décors…). */
export function BriefEditeur({ projectId, brief }: { projectId: number; brief: VueBrief }) {
  const router = useRouter();
  const modifier = async (cle: string, valeur: unknown): Promise<string | null> => {
    try {
      const r = await modifierChampBrief(projectId, cle, valeur);
      if (!r.ok) return r.erreur;
      router.refresh();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erreur inattendue.";
    }
  };
  return <BriefSections brief={brief} onModifier={modifier} />;
}
