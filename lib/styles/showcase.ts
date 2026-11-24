/** The showcase of each library style (ticket 06, 2026-11-24): ONE 16:9 image per style, with a subject written for that style (never a
 * character or a scene from the works it is named after) and the style's name painted INTO the image, so the picture makes you want the
 * style rather than compare styles on a common subject. The scene is a SUBJECT-only prompt: the style's descriptor arrives separately,
 * through the « style » node of the image workflow. File without heavy dependencies: the client imports it. */

/** The families the design page groups the styles by, in display order (one scrolling row each). */
export const FAMILLES_STYLES = ["Anime & manga", "Animation", "3D", "Photo réelle", "Illustration"] as const;
export type FamilleStyle = (typeof FAMILLES_STYLES)[number];

export type ApercuStyle = {
  /** Library style id (`styles.id`). */
  id: string;
  famille: FamilleStyle;
  /** The title painted into the image, exactly. */
  titre: string;
  /** The scene, in English, the title included. */
  scene: string;
};

/** How the title is asked for: the same sentence everywhere, so only the lettering's look changes with the scene. */
const titre = (t: string, ou: string, lettrage: string) =>
  `The words "${t}" are written ${ou}, in large ${lettrage} lettering, spelled exactly "${t}", perfectly legible, integrated into the scene like the title of a film poster.`;

export const APERCUS_STYLES: readonly ApercuStyle[] = [
  {
    id: "ghibli-style",
    famille: "Anime & manga",
    titre: "GHIBLI",
    scene: `A girl in a yellow raincoat rides an old bicycle down a winding country road between wind-swept green hills, a small red-roofed bakery and a wooden windmill behind her, towering white summer clouds in a deep blue sky, tall grass bending in the breeze. Wide shot. ${titre("GHIBLI", "across the sky among the clouds", "soft hand-painted white")}`,
  },
  {
    id: "akira-toriyama-style",
    famille: "Anime & manga",
    titre: "AKIRA TORIYAMA",
    scene: `A young mechanic girl with goggles and a wrench rides a round hover-scooter across a rocky desert, a friendly baby dinosaur running beside her, a small dome-shaped house and a windmill on a mesa in the distance, bright midday sun. Dynamic low angle. ${titre("AKIRA TORIYAMA", "in the upper sky", "bold chunky cartoon block")}`,
  },
  {
    id: "one-piece-style",
    famille: "Anime & manga",
    titre: "ONE PIECE",
    scene: `A cheerful young navigator with a green bandana and a telescope stands on the bow of a small wooden ship with a patched purple sail, pointing at the horizon, turquoise sea and a tropical island shaped like a sleeping turtle ahead, seagulls overhead. Wide shot from below. ${titre("ONE PIECE", "on a flapping banner tied to the mast", "bold hand-inked adventure")}`,
  },
  {
    id: "analog-photography",
    famille: "Photo réelle",
    titre: "ANALOG",
    scene: `Late afternoon at a small seaside diner: a woman in a denim jacket leans on a vintage convertible parked outside, holding a paper cup of coffee, a neon diner sign above, the ocean behind a low wall, warm low sun and long shadows. Medium wide shot. ${titre("ANALOG", "on the diner's rooftop sign", "retro painted metal sign")}`,
  },
  {
    id: "cinematic-photography",
    famille: "Photo réelle",
    titre: "CINEMATIC",
    scene: `A lone man in a long dark coat stands on a rain-soaked rooftop at blue hour, looking over a vast city skyline, wet reflections on the gravel, distant lights blurred behind him, light mist, shallow depth of field. Wide anamorphic framing. ${titre("CINEMATIC", "in the sky above the skyline", "thin elegant widely spaced sans-serif")}`,
  },
  {
    id: "vintage-children-s-book-drawing",
    famille: "Illustration",
    titre: "CHILDREN'S BOOK",
    scene: `A small fox wearing a knitted scarf and a little boy in short trousers share a picnic under a large oak tree, a basket of apples, a teapot and a kite resting on the grass, a cottage and gentle hills behind them, pale morning light. Wide shot. ${titre("CHILDREN'S BOOK", "in the sky above the oak tree", "hand-drawn storybook")}`,
  },
  {
    id: "arcane-animation-still",
    famille: "Animation",
    titre: "ARCANE",
    scene: `A young inventor with short blue-dyed hair and a mechanical gauntlet stands in a cluttered underground workshop, glowing blue crystals humming in glass tubes, pipes and steam, a grimy industrial city visible through a round window, warm lamp light against cold neon. Medium shot. ${titre("ARCANE", "as a glowing painted neon sign on the workshop wall", "painterly")}`,
  },
  {
    id: "cinematic-final-fantasy-3d-render",
    famille: "3D",
    titre: "FINAL FANTASY",
    scene: `A swordswoman in an ornate silver and midnight-blue coat stands on a crystal bridge above a sea of clouds, holding a long glowing blade, a colossal floating citadel behind her, shafts of golden light breaking through the clouds, her coat and hair moving in the wind. Epic wide shot. ${titre("FINAL FANTASY", "in the clouds above the citadel", "elegant engraved silver")}`,
  },
  {
    id: "3d-render",
    famille: "3D",
    titre: "3D RENDER",
    scene: `A small vintage robot made of polished copper and white ceramic waters a tiny potted plant on a clean studio table, a desk lamp, a stack of books and a glass sphere beside it, soft studio lighting, smooth gradient background. Medium shot. ${titre("3D RENDER", "as large three-dimensional letters standing on the table behind the robot", "glossy extruded 3D")}`,
  },
  {
    id: "pixar-animation",
    famille: "Animation",
    titre: "PIXAR",
    scene: `An elderly clockmaker with a round white mustache and huge glasses kneels in his cozy workshop, gently handing a tiny brass key to a curious little girl, hundreds of clocks on the walls, warm golden sunlight through dusty windows, a cat asleep on a stool. Medium shot. ${titre("PIXAR", "carved on the wooden shop sign hanging above them", "rounded playful")}`,
  },
  {
    id: "claymation",
    famille: "Animation",
    titre: "CLAYMATION",
    scene: `A grandmother in a knitted hat and her pet goose build a homemade rocket out of tin cans and barrels in a cluttered backyard shed at night, a crescent moon and stars outside the open door, balls of yarn and tools scattered on the bench, warm light bulb. Medium wide shot. ${titre("CLAYMATION", "painted on the side of the rocket", "chunky handmade")}`,
  },
  {
    id: "cel-shading",
    famille: "Animation",
    titre: "CEL SHADING",
    scene: `A young courier with a big messenger bag sprints across rooftops of a colorful harbor town, leaping over a gap, a red lighthouse and sailboats below, bright cartoon sky with puffy clouds, seagulls scattering. Dynamic wide shot. ${titre("CEL SHADING", "across the sky", "bold outlined graphic")}`,
  },
  {
    id: "modern-cartoon",
    famille: "Animation",
    titre: "MODERN CARTOON",
    scene: `Three mismatched friends, a tall lanky girl with a backpack, a short boy with a skateboard and a grumpy talking cat, run out of a candy-colored school bus onto a sunny city street full of food trucks and balloons. Wide shot. ${titre("MODERN CARTOON", "on a big banner stretched between two lamp posts", "bouncy rounded")}`,
  },
  {
    id: "classic-disney-feature-animation",
    famille: "Animation",
    titre: "CLASSIC DISNEY",
    scene: `A young lantern-maker in a green cloak hangs glowing paper lanterns along a wooden bridge over a river at dusk, a family of foxes watching from the bank, a misty forest and a village of crooked rooftops behind. Wide shot. ${titre("CLASSIC DISNEY", "in the sky above the castle", "golden storybook script")}`,
  },
  {
    id: "alphonse-mucha-masterwork",
    famille: "Illustration",
    titre: "MUCHA",
    scene: `A woman with long flowing auburn hair crowned with lilies holds a lantern, standing before a large circular halo of ornamental arabesques, stars and moon phases, her draped robe falling in graceful folds, flowers and vines framing the composition, landscape format. ${titre("MUCHA", "in an ornamental cartouche at the top of the composition", "Art Nouveau")}`,
  },
  {
    id: "castlevania-concept-art",
    famille: "Illustration",
    titre: "CASTLEVANIA",
    scene: `A lone alchemist woman in a long weathered crimson coat, holding a lantern and a silver staff, climbs a stone stairway toward an enormous gothic cathedral on a cliff, a huge blood-red moon behind its spires, crows swirling, dead trees and broken statues along the path. Epic wide shot. ${titre("CASTLEVANIA", "in the sky beside the red moon", "ornate gothic blackletter")}`,
  },
  {
    id: "8-bit-style",
    famille: "Illustration",
    titre: "8-BIT",
    scene: `A tiny knight with a sword and a round shield stands at the entrance of a mountain dungeon, green hills, a waterfall, coins floating in the air, a small dragon perched on a rock, bright blue sky with blocky clouds, side view like a classic platform game. ${titre("8-BIT", "at the top of the screen like a game title", "chunky pixel")}`,
  },
];

/** The family of a library style (« Illustration » for a style without showcase entry). */
export const familleDuStyle = (id: string): FamilleStyle => APERCUS_STYLES.find((a) => a.id === id)?.famille ?? "Illustration";
