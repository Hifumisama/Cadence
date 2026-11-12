import type { FiltresStyle } from "@/lib/styles/filters";
import type { EtatAssistant } from "@/lib/projects/design-ui";

/** A library style as the page shows it: only the ready-to-use styles (with their short clause). */
export type StyleVue = {
  id: string;
  nom: string;
  categories: string[];
  filtres: FiltresStyle;
  /** Long prompt (images). */
  descriptor: string;
  /** Short clause (video). */
  clause: string;
  /** Preview subjects (`lib/styles/subjects.ts`) whose image has been generated (`data/styles/<id>/<sujet>.webp`). */
  images: string[];
};

export type MajEtat = (f: (e: EtatAssistant) => EtatAssistant) => void;
export type PropsScene = { etat: EtatAssistant; maj: MajEtat };
