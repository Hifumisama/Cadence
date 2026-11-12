import { FILMS_STYLE } from "./examples";
import { STYLE_AUCUN, MISES_EN_SCENE, type ChoixMiseEnScene } from "./settings";
import { STYLES_CAMERA } from "./styles-camera";

/** Recognise a staging at a glance, WITHOUT video: for each choice, a pictogram (the camera gesture or the ambience), three keywords and a « Rappelle » line.
 * PURE module (no disk access): the interface uses it when the demo has no fixed image, and in every case for the keywords. The directors cite their films
 * (FILMS_STYLE, lib/h3ir/examples.ts); the custom profiles cite no title (decision of the card) but a film genre. */

/** The pictograms drawn by components/design/StagingVisual.tsx (one simple SVG per key). */
export const PICTOS = ["aucun", "pas", "eclair", "vent", "orbite", "fixe", "ombre", "travelling", "symetrie", "echelle", "manuel", "flou", "rayons"] as const;
export type Picto = (typeof PICTOS)[number];

export type ApercuStyle = { picto: Picto; mots: readonly [string, string, string]; rappelle: string };

export const APERCU_STYLE: Record<ChoixMiseEnScene, ApercuStyle> = {
  cameron: { picto: "travelling", mots: ["Grand spectacle", "Caméra puissante", "Lumière bleutée"], rappelle: "" },
  tarantino: { picto: "orbite", mots: ["Dialogues", "Tension lente", "Gros plans d'objets"], rappelle: "" },
  anderson: { picto: "symetrie", mots: ["Symétrie", "Pastel", "Cadre de conte"], rappelle: "" },
  villeneuve: { picto: "echelle", mots: ["Immensité", "Silence", "Teintes sourdes"], rappelle: "" },
  bigelow: { picto: "manuel", mots: ["Caméra portée", "Réalisme", "Sous tension"], rappelle: "" },
  wong: { picto: "flou", mots: ["Néons", "Ralenti flou", "Nostalgie"], rappelle: "" },
  spielberg: { picto: "rayons", mots: ["Émerveillement", "Visages saisis", "Contre-jour"], rappelle: "" },
  claymation: { picto: "pas", mots: ["Saccadé", "Caméra de table", "Lumière chaude"], rappelle: "les films en pâte à modeler et en stop-motion" },
  "anime-nerveux": { picto: "eclair", mots: ["Poses extrêmes", "Accélérations", "Caméra ample"], rappelle: "les anime d'action et de combat" },
  "anime-contemplatif": { picto: "vent", mots: ["Lenteur", "Vent et nature", "Silences"], rappelle: "les anime doux et contemplatifs" },
  "3d-cinema": { picto: "orbite", mots: ["Jeu expressif", "Caméra fluide", "Orchestre"], rappelle: "les films d'animation 3D grand public" },
  sitcom: { picto: "fixe", mots: ["Plan large fixe", "Lumière plate", "Sans musique"], rappelle: "les comédies de situation filmées en studio" },
  horreur: { picto: "ombre", mots: ["Plans fixes", "Cadre décentré", "Lumière rare"], rappelle: "les films d'horreur lents, où l'attente fait peur" },
};

/** « Aucun style »: the AI decides. */
const APERCU_AUCUN: ApercuStyle = { picto: "aucun", mots: ["L'IA décide", "Selon ta description", "Selon tes images"], rappelle: "" };

/** The « Rappelle … » line of a choice: the director's films, or the film genre of a custom profile. Empty for « aucun ». */
export function rappelleDe(id: string): string {
  if (id === STYLE_AUCUN) return "";
  if (!(MISES_EN_SCENE as readonly string[]).includes(id)) return "";
  const choix = id as ChoixMiseEnScene;
  if ((STYLES_CAMERA as readonly string[]).includes(choix)) return FILMS_STYLE[choix as (typeof STYLES_CAMERA)[number]].slice(0, 3).join(" · ");
  return APERCU_STYLE[choix].rappelle;
}

/** What the card shows for an identifier: « aucun », a known choice, or nothing (unknown identifier). */
export function apercuDe(id: string): ApercuStyle | null {
  if (id === STYLE_AUCUN) return APERCU_AUCUN;
  return (MISES_EN_SCENE as readonly string[]).includes(id) ? APERCU_STYLE[id as ChoixMiseEnScene] : null;
}
