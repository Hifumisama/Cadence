import type { ProfilPersoId } from "../h3ir/character-profiles";

/** La façon de filmer RECOMMANDÉE pour un style de la bibliothèque (identifiant du style → profil de mise en scène perso, lib/h3ir/character-profiles.ts). À l'étape « Mise en scène » de la
 * conception, ce profil est proposé en tête (« suggéré par ton style ») et présélectionné tant que l'utilisateur n'a rien choisi à la main ; il garde toujours la liberté de prendre autre chose.
 *
 * Pur, sans accès base : lisible côté client. Volontairement CONSERVATEUR : un style n'a une recommandation que si sa façon de bouger va de soi (matière animée image par image, anime d'action,
 * animation 3D de long métrage…). Un style douteux n'en a pas, et l'écran reste alors celui de toujours. Le style règle l'APPARENCE (par les images de référence) ; le profil, le mouvement. */
export const MISE_EN_SCENE_RECOMMANDEE: Readonly<Record<string, ProfilPersoId>> = {
  claymation: "claymation",
  "ghibli-style": "anime-contemplatif",
  "akira-toriyama-style": "anime-nerveux",
  "one-piece-style": "anime-nerveux",
  "pixar-animation": "3d-cinema",
  "3d-render": "3d-cinema",
  "cinematic-final-fantasy-3d-render": "3d-cinema",
};

/** Le profil recommandé pour un style de la bibliothèque, ou `null` (style libre, inconnu ou sans recommandation). */
export function miseEnSceneRecommandee(styleId: string | null | undefined): ProfilPersoId | null {
  return (styleId && Object.hasOwn(MISE_EN_SCENE_RECOMMANDEE, styleId) ? MISE_EN_SCENE_RECOMMANDEE[styleId] : null) ?? null;
}
