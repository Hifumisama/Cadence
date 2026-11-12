import type { ProfilPersoId } from "../h3ir/character-profiles";

/** The RECOMMENDED way of filming for a library style (style identifier → personal staging profile, lib/h3ir/character-profiles.ts). At the « Mise en scène » (staging) step of the
 * design, this profile is proposed at the top (« suggéré par ton style » (suggested by your style)) and preselected as long as the user has not chosen anything by hand; it always keeps the freedom to pick something else.
 *
 * Pure, no database access: readable on the client side. Deliberately CONSERVATIVE: a style only has a recommendation if its way of moving is self-evident (frame-by-frame animated material, action anime,
 * feature-length 3D animation…). A dubious style has none, and the screen then stays as it always was. The style sets the LOOK (through the reference images); the profile, the movement. */
export const MISE_EN_SCENE_RECOMMANDEE: Readonly<Record<string, ProfilPersoId>> = {
  claymation: "claymation",
  "ghibli-style": "anime-contemplatif",
  "akira-toriyama-style": "anime-nerveux",
  "one-piece-style": "anime-nerveux",
  "pixar-animation": "3d-cinema",
  "3d-render": "3d-cinema",
  "cinematic-final-fantasy-3d-render": "3d-cinema",
};

/** The recommended profile for a library style, or `null` (free style, unknown or without recommendation). */
export function miseEnSceneRecommandee(styleId: string | null | undefined): ProfilPersoId | null {
  return (styleId && Object.hasOwn(MISE_EN_SCENE_RECOMMANDEE, styleId) ? MISE_EN_SCENE_RECOMMANDEE[styleId] : null) ?? null;
}
