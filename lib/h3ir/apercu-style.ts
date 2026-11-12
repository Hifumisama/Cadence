import { FILMS_STYLE } from "./exemples";
import { STYLE_AUCUN, MISES_EN_SCENE, type ChoixMiseEnScene } from "./reglages";
import { STYLES_CAMERA } from "./styles-camera";

/** Reconnaître une mise en scène d'un coup d'œil, SANS vidéo : pour chaque choix, un pictogramme (le geste de caméra ou l'ambiance), trois mots-clés et une ligne « Rappelle ».
 * Module PUR (aucun accès disque) : l'interface l'utilise quand la démo n'a pas d'image fixe, et dans tous les cas pour les mots-clés. Les réalisateurs citent leurs films
 * (FILMS_STYLE, lib/h3ir/exemples.ts) ; les profils perso ne citent aucun titre (décision de la carte) mais un genre de film. */

/** Les pictogrammes dessinés par components/conception/VisuelMise.tsx (un SVG simple par clé). */
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

/** « Aucun style » : l'IA décide. */
const APERCU_AUCUN: ApercuStyle = { picto: "aucun", mots: ["L'IA décide", "Selon ta description", "Selon tes images"], rappelle: "" };

/** La ligne « Rappelle … » d'un choix : les films du réalisateur, ou le genre de film d'un profil perso. Vide pour « aucun ». */
export function rappelleDe(id: string): string {
  if (id === STYLE_AUCUN) return "";
  if (!(MISES_EN_SCENE as readonly string[]).includes(id)) return "";
  const choix = id as ChoixMiseEnScene;
  if ((STYLES_CAMERA as readonly string[]).includes(choix)) return FILMS_STYLE[choix as (typeof STYLES_CAMERA)[number]].slice(0, 3).join(" · ");
  return APERCU_STYLE[choix].rappelle;
}

/** Ce que la carte montre pour un identifiant : « aucun », un choix connu, ou rien (identifiant inconnu). */
export function apercuDe(id: string): ApercuStyle | null {
  if (id === STYLE_AUCUN) return APERCU_AUCUN;
  return (MISES_EN_SCENE as readonly string[]).includes(id) ? APERCU_STYLE[id as ChoixMiseEnScene] : null;
}
