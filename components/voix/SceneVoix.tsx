"use client";

import type { ReactNode } from "react";
import { useAssistantVoix } from "./AssistantVoix";

/** Scène 3 : le timbre (voix décrite) ou la source (voix fournie), selon l'origine choisie à la scène 2. Les deux restent montés (une
 * saisie en cours ne se perd pas quand on change d'avis) ; seul celui de l'origine courante se voit. */
export function SceneVoix({ timbre, source }: { timbre: ReactNode; source: ReactNode }) {
  const { source: origine } = useAssistantVoix();
  return (
    <>
      <div hidden={origine !== "design"}>{timbre}</div>
      <div hidden={origine !== "reference"}>{source}</div>
    </>
  );
}
