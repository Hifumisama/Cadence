import type { Aspect } from "../asset-generation";

/** Les scènes de présentation d'un style : les mêmes pour tous les styles, pour que la seule différence entre deux images
 * soit le style. Chaque scène teste autre chose (personnage, matières, effet lumineux, anatomie non humaine, décor et
 * atmosphère, mouvement). Fichier sans dépendance lourde : le client l'importe. La scène est un prompt de SUJET seul (aucun mot
 * de rendu, aucun nom de médium) : le style arrive à part, par le nœud « style » du workflow d'image. */

export type SujetApercu = {
  /** Identifiant stable : nom de fichier de l'image (`styles/<style>/<id>.webp`). */
  id: string;
  libelle: string;
  /** Ce que la scène permet de juger. */
  teste: string;
  aspect: Aspect;
  /** Largeur finale de l'image enregistrée (px). */
  largeur: number;
  scene: string;
};

export const SUJETS_APERCU: readonly SujetApercu[] = [
  {
    id: "lecture",
    libelle: "Lecture",
    teste: "personnage, peau, tissus, lumière douce",
    aspect: "2:3",
    largeur: 640,
    scene:
      "A young woman with shoulder-length hair, wearing a long knitted cardigan, sits in a worn leather armchair reading an open book. Tall wooden bookshelves full of books rise behind her, and warm light from a tall window falls across the pages. Medium shot, vertical composition.",
  },
  {
    id: "nature-morte",
    libelle: "Nature morte",
    teste: "matières et accessoires",
    aspect: "1:1",
    largeur: 768,
    scene:
      "A still life on a rough wooden table: a ceramic pitcher, three ripe pears, a glass of water, a folded linen cloth, a brass candlestick with a lit candle and a small sprig of wildflowers in a jar. Soft side light from the left, a plain wall behind, square composition.",
  },
  {
    id: "boule-de-feu",
    libelle: "Boule de feu",
    teste: "effet, lumière émissive",
    aspect: "1:1",
    largeur: 768,
    scene:
      "A blazing fireball hurtling through the air toward the viewer, a bright molten core wrapped in swirling flames, trailing sparks, embers and curling smoke. Dark empty night sky behind it, the fireball centered in the frame.",
  },
  {
    id: "creature",
    libelle: "Créature",
    teste: "poils, écailles, anatomie non humaine",
    aspect: "3:2",
    largeur: 900,
    scene:
      "A large wolf-like creature with curved dragon horns and scaled shoulders stands on a mossy boulder in a misty forest clearing at dawn, head turned toward the viewer, its breath visible in the cold air. Full body in frame.",
  },
  {
    id: "rue-de-nuit",
    libelle: "Rue de nuit",
    teste: "décor, reflets, atmosphère",
    aspect: "16:9",
    largeur: 1024,
    scene:
      "A narrow city street at night in heavy rain. The wet pavement reflects glowing neon signs and lit shop windows, a few pedestrians walk under umbrellas, steam rises from a street grate, cars are parked along the curb. Wide establishing shot.",
  },
  {
    id: "coup-de-pied",
    libelle: "Coup de pied",
    teste: "mouvement, dynamique du corps",
    aspect: "16:9",
    largeur: 1024,
    scene:
      "A woman in a white martial-arts uniform with a black belt performs a high side kick, seen in strict side profile, her leg fully extended and her hair whipping behind her. An empty training hall with a polished wooden floor and tall windows. Whole body in frame, wide shot.",
  },
] as const;

export const IDS_SUJETS = SUJETS_APERCU.map((s) => s.id);

export function sujetParId(id: string): SujetApercu | null {
  return SUJETS_APERCU.find((s) => s.id === id) ?? null;
}

/** Le prompt complet d'une image de présentation (ce que voit l'utilisateur) : la scène, puis le style. */
export function promptApercu(sujet: Pick<SujetApercu, "scene">, descriptor: string): string {
  return `${sujet.scene} ${descriptor}`;
}

/** L'aperçu qui sert de toile de fond à l'affiche du clap (recadrée en 3:2) : un décor neutre, sans personnage. */
export const SUJET_AFFICHE_CLAP = "rue-de-nuit";
