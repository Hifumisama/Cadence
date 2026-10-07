import type { FiltresStyle } from "@/lib/styles/filtres";
import type { EtatAssistant } from "@/lib/conception-ui";

/** Un style de la bibliothèque tel que la page le montre : seulement les styles prêts à l'emploi (avec leur clause courte). */
export type StyleVue = {
  id: string;
  nom: string;
  categories: string[];
  filtres: FiltresStyle;
  /** Prompt long (images). */
  descriptor: string;
  /** Clause courte (vidéo). */
  clause: string;
  /** Sujets d'aperçu (`lib/styles/sujets.ts`) dont l'image a été générée (`data/styles/<id>/<sujet>.webp`). */
  images: string[];
};

export type MajEtat = (f: (e: EtatAssistant) => EtatAssistant) => void;
export type PropsScene = { etat: EtatAssistant; maj: MajEtat };
