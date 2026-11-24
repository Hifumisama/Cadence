import type { EtatAssistant } from "@/lib/projects/design-ui";
import type { FamilleStyle } from "@/lib/styles/showcase";

/** A library style as the page shows it: only the ready-to-use styles (with their short clause). */
export type StyleVue = {
  id: string;
  nom: string;
  /** The family it is shown in (`lib/styles/showcase.ts`). */
  famille: FamilleStyle;
  /** Long prompt (images). */
  descriptor: string;
  /** Short clause (video). */
  clause: string;
  /** Its showcase image (`data/styles/<id>/apercu.webp`) exists. */
  apercu: boolean;
};

export type MajEtat = (f: (e: EtatAssistant) => EtatAssistant) => void;
export type PropsScene = { etat: EtatAssistant; maj: MajEtat };
