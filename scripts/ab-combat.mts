// Banc A/B, tour 3 : « combat total » de 15 s (Maya / la Tenancière), dix plans, finale spectaculaire, six références.
// Crée deux assets (toits, dague) à produire dans l'appli, la scène et le plan. Aucune génération lancée.
//   npx tsx --env-file=.env scripts/ab-combat.mts
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assets, episodes, planPromptSections, planRefs, plans, projects, scenes, seasons } from "../db/schema";

const NOM = "Banc A/B — H3 et Singularity";
const SEED = "314159265358979";
const CLAUSE =
  "Cinematic anime illustration, refined linework, sophisticated cinematic lighting, atmospheric depth, polished digital rendering, in the visual tradition of Makoto Shinkai and Yoshiyuki Sadamoto.";

const NOUVEAUX = [
  {
    code: "DEC_toits_auberge",
    type: "decor",
    description:
      "Les toits de l'auberge de nuit, vus d'en haut : faîtages courbes aux avant-toits relevés, tuiles gris-bleu sombre, cours intérieures, lanternes de papier le long des gouttières, grand ciel nocturne clair avec une lune brillante, les lumières du bazar au loin. Personne sur les toits.",
    promptGeneration:
      "The tiled rooftops of a large oriental night inn seen from a high aerial viewpoint, sweeping curved roof ridges with upturned eaves and dark grey-blue tiles, stone chimneys and small inner courtyards between the wings, paper lanterns glowing as warm dots along the gutters, a vast clear night sky with a bright full moon and scattered stars above, the distant lights of a crowded bazaar spread across the horizon, a soft indigo moonlight over everything, still air.",
  },
  {
    code: "PROP_dague_maya",
    type: "prop",
    description: "La dague de combat de Maya : courte, utilitaire, lame droite en acier uni, petite garde en laiton, poignée en cordon de cuir brun. Seule, sans main.",
    promptGeneration:
      "A short utilitarian combat dagger lying alone, a straight double-edged steel blade about twenty centimetres long with a plain polished surface, a small brass crossguard, a hilt wrapped in dark brown leather cord and a modest round brass pommel, shown in side view on a plain light background, clean sharp edges.",
  },
] as const;

const SUBJECT_DEFINITIONS =
  "<Subject 1> is Maya from <Picture 1>, the character sheet of a young dancer and spy with sun-tanned skin, red eyes, a long dark brown ponytail tied with a red band, gold drop earrings, a deep red wrap top with a gold corset and jewelled collar, loose puffed red sleeves, gold armbands, a gold belt over wide red trousers edged with gold, a blue sash, gold sandals and ankle jewelry.\n" +
  "<Subject 2> is the Tenancière from <Picture 2>, the character sheet of a tall, imposing woman in her fifties with a general's straight bearing, black hair streaked with silver pulled into a low knot, wearing a floor-length midnight-blue gown with a high collar and intricate silver patterns.\n" +
  "<Subject 3> is the empty inn corridor in <Picture 3>, a long symmetrical passage of dark carved timber and lattice screens with paper lanterns and polished floorboards, soaked in a constant deep indigo light.\n" +
  "<Subject 4> is the night rooftops of the inn in <Picture 4>, curved tiled roof ridges under a moonlit sky, used only for the final shot.\n" +
  "<Subject 5> is the flame effect from <Picture 5>, orange-red tongues of fire with bright yellow cores shedding embers, borrowed here only for its colour, texture and motion.\n" +
  "<Subject 6> is Maya's short combat dagger from <Picture 6>, a straight steel blade with a small brass crossguard and a hilt wrapped in dark brown leather cord.";

const SUMMARY =
  "[reference generation] The target video shows <Subject 1>, Maya, attacking <Subject 2>, the Tenancière, in <Subject 3> with a dagger wrapped in <Subject 5>; the Tenancière absorbs every blow at the same even pace, catches Maya's wrist and sends her through a lattice screen with a single palm strike; Maya rises wrapped in flame, whirls in a pirouette, and a colossal pillar of fire bursts through the roof of the inn, seen from above against the night sky, before collapsing into falling embers.";

const RETENTION =
  "<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 6], [Shot 7], [Shot 8], [Shot 9]): fully_preserved - Maya's face, ponytail and red-and-gold costume are retained in every shot.\n" +
  "<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 6], [Shot 7], [Shot 9]): fully_preserved - the Tenancière's bearing and midnight-blue gown with silver patterns are retained.\n" +
  "<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 6], [Shot 7], [Shot 8], [Shot 9]): fully_preserved - the corridor's carved timber, lanterns and floorboards are retained until the screens and roof break.\n" +
  "<Subject 4> (appears in [Shot 10]): fully_preserved - the curved tiled roofs and the moonlit night sky are retained.\n" +
  "<Subject 5> (appears in [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 8], [Shot 9], [Shot 10]): attribute_transfer - the orange-red colour, texture and motion of the flames pass onto Maya's blade, limbs and the final pillar; the reference's own framing is not reproduced.\n" +
  "<Subject 6> (appears in [Shot 2], [Shot 3], [Shot 5], [Shot 8]): fully_preserved - the dagger's straight blade, brass guard and leather-wrapped hilt are retained.";

const DESCRIPTION =
  `${CLAUSE} Deep midnight-indigo light soaks the corridor until the flames rise; from then on every orange glow grows and fades with Maya's movement, and the indigo returns the moment each gesture ends. ` +
  "[Shot 1] A wide static shot, the camera locked and the corridor steady, looks down the full length of <Subject 3> from the middle of the floor, carved timber posts and lattice screens converging on the distant double door, paper lanterns swaying faintly, the polished floorboards holding indigo reflections. <Subject 1>, Maya, stands in the left foreground in a low dancer's stance, knees soft, weight on the balls of her feet, her right hand resting on the flat leather strap at her belt, her ponytail hanging still. Far down the corridor <Subject 2>, the Tenancière, walks toward her at a slow, even pace, her back straight, her arms hanging at her sides, her midnight-blue gown swaying with each step, the silver patterns catching the indigo light, her heels counting each step on the boards. The shot ends as the distance between them closes to about ten steps. " +
  "[Shot 2] At 00:02.000, Hard cut to an extreme close-up at floor level between the two women, the camera locked, showing both pairs of feet: Maya's gold sandals pressing into the boards, her toes gripping the wood, and the Tenancière's black heels arriving one after the other at the same even pace, the hem of the midnight-blue gown brushing the planks. Above Maya's sandals her hand slides <Subject 6> out from under the leather strap in one smooth pull, the steel flashing indigo, and a first thread of <Subject 5> ignites along the blade's edge, a flicker that lights the floorboards orange beneath her ankles. The shot ends with the flame tongue steady and the Tenancière's heel landing a few paces from Maya's sandal. " +
  "[Shot 3] At 00:03.500, Hard cut to a tracking shot from the side at chest height, the camera moving sideways at her speed, in profile: <Subject 1> explodes forward from her stance, her torso rotating into a dancer's spinning slash, <Subject 6> trailing a ribbon of <Subject 5> across the frame, her ponytail and red sleeves whipping behind her. <Subject 2> keeps the same even pace; her left forearm rises and meets Maya's wrist in the middle of the frame, and at the instant of contact a dull, heavy thud shakes the corridor: a ring of dust jumps off the floorboards around their feet, a crack runs through the plank under Maya's front sandal, the nearest paper lanterns swing wildly, and the gown's skirt ripples outward in a single wave. The flame ribbon splits into sparks that stream along the Tenancière's sleeve. The shot ends with the two women locked at the wrist, Maya's weight leaning into the blade, the Tenancière's arm holding still. " +
  "[Shot 4] At 00:05.000, Hard cut to a direct overhead shot looking straight down at the floorboards, the camera rolling clockwise at slow speed, with <Subject 2> at the centre like a still pillar, only her head turning to follow, while <Subject 1> breaks the lock and whirls around her in a widening spiral, her arms sweeping, her dagger drawing a burning circle of <Subject 5> across the planks that flares as she passes and fades behind her, leaving a ring of glowing lines scorched into the wood. Her sleeves flare like petals, embers lift from the circle in a slow rising cloud, and the Tenancière's gown turns on the spot with her, its silver patterns catching the orange light. The shot ends with Maya mid-spin on the far side of the ring, the burning circle at its brightest. " +
  "[Shot 5] At 00:06.500, Hard cut to a point-of-view shot from the Tenancière's eyes, the camera shaking slightly, as Maya lunges out of the circle straight at the lens, <Subject 6> arcing toward the viewer wrapped in <Subject 5>, her face lit orange, her red eyes fixed, her mouth set, a trail of flame bending behind the blade. The Tenancière's left hand rises into the frame from the side at its unhurried pace and closes around Maya's wrist an inch from the lens, the flames flaring against her fingers and hissing out into sparks. " +
  "[Shot 6] At 00:07.500, Hard cut to a low-angle close shot from beside the Tenancière's hip, the camera shaking strongly through the blow: her right palm drives flat into Maya's breastbone in one short, dry strike. The impact travels through Maya's body, her red sleeves snapping backward, her gold armbands rattling, her feet leaving the floor, her ponytail lashing upward, a burst of embers exploding from her back, and a shockwave of dust and loose splinters ripples out along the boards from the Tenancière's feet. The Tenancière's face stays calm, a strand of her silver-streaked hair lifting in the pressure wave. The shot ends with Maya airborne, her back arching, her eyes wide. " +
  "[Shot 7] At 00:09.000, Hard cut to a tracking shot behind Maya as she flies backward down the corridor, the camera moving with her at her speed, her silhouette trailing sparks, until her back meets a carved lattice screen and the whole panel bursts open: the wooden latticework explodes into splinters, torn paper flutters, and a shower of shards spins past the lens as she tumbles through the opening into the dark room beyond. The camera whip-pans left at fast speed, the corridor blurring into indigo streaks, and lands on <Subject 2> walking down the corridor toward the broken screen at the same even pace, her gown swaying, a drifting cloud of dust and paper scraps parting around her. " +
  "[Shot 8] At 00:10.500, Hard cut to a low-angle shot from the floor of the dark room, looking up through the shattered screen as <Subject 1> pushes herself off the boards, her palm flat on the planks, and rises, the camera pedestalling up at medium speed to follow her; as her hand lifts away it leaves a glowing handprint of <Subject 5> in the wood. Flames climb from her ankles up her legs and sleeves in a rising helix of orange-red that follows her breathing, her hair lifting in the heat, her red eyes brightening, her sandals scraping the boards as she sets her feet apart, <Subject 6> burning white-gold along its edge in her hand. The shot ends with Maya at full height, the flame reaching her hair, the shattered screen framing her in orange light. " +
  "[Shot 9] At 00:12.000, Hard cut to a dive from above into the corridor: the camera plunges down at fast speed toward the centre of the floor, where <Subject 1> leaps and spins on the ball of her foot in a dancer's pirouette, arms flung wide, the flames gathering into a tightening spiral of <Subject 5> that winds around her body, her sleeves, hair and sash streaming in the rotation. The spiral accelerates upward and bursts through the ceiling beams, roof tiles blasting skyward, the lanterns flaring, and a ring-shaped shockwave of fire and pressure sweeps down the corridor in both directions, blowing the lattice screens outward off their frames, pressing dust flat against the walls and tearing the Tenancière's gown and silver-streaked hair sideways as she keeps walking, her face lit orange and her stride holding its even pace. " +
  "[Shot 10] At 00:13.500, Hard cut to a high aerial wide shot above the roofs of the inn, <Subject 4>, the camera swooping up and away at fast speed as a colossal pillar of <Subject 5> rises out of the broken roof, a column wider than the building, spiralling like a helix and reaching toward the stars, scattering shattered tiles and glowing embers across the surrounding rooftops and lighting the underside of the clouds, the roof ridges glowing orange, the distant bazaar lanterns shrinking to dots. As the swoop settles into a locked wide frame the pillar collapses downward with the end of Maya's gesture, the flames shrinking into a slow rain of embers over the tiles, and the indigo moonlight returns. The shot ends with drifting embers and the broken roof glowing dull red.";

const SOUNDSCAPE =
  "Heels counting each step on timber, the rustle of heavy silk, the rasp of a blade leaving leather, a flame that hisses to life and roars with every slash, the dull bass thud of a blocked blow with a plank cracking under it, the dry crack of a palm strike followed by the splintering burst of a lattice screen and fluttering paper, a rising roar of fire and a deep booming shockwave as the roof explodes, roof tiles raining, then a long hush of ticking embers.";

const MUSIC =
  "Low sustained bowed strings at a slow tempo with a single deep taiko hit on each of the Tenancière's steps, a rising ostinato of fast plucked strings and snare rolls through the exchange, a hard silence on the palm strike, then a surging brass and full-orchestra crescendo with pounding taiko through the final spin and burst, cutting off at the collapse and leaving one high sustained note that fades.";

const [projet] = await db.select().from(projects).where(eq(projects.nom, NOM));
if (!projet) throw new Error(`Projet « ${NOM} » introuvable`);
const dejaLa = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projet.id), eq(assets.code, "PROP_dague_maya")));
if (dejaLa.length) throw new Error("Le test « combat total » existe déjà — rien n'a été écrit.");

const [saison] = await db.select().from(seasons).where(eq(seasons.projectId, projet.id));
const [episode] = await db.select().from(episodes).where(eq(episodes.seasonId, saison!.id));
const existants = await db.select().from(assets).where(eq(assets.projectId, projet.id));
const idDe = (code: string) => {
  const a = existants.find((x) => x.code === code);
  if (!a) throw new Error(`Asset ${code} introuvable`);
  return a.id;
};

const resultat = await db.transaction(async (tx) => {
  const [scene] = await tx
    .insert(scenes)
    .values({ episodeId: episode!.id, ordre: 2, titre: "Le combat total", fonction: "Banc de mesure, tour 3 : 15 s, dix points de vue, impacts lourds, finale spectaculaire.", genre: "action", ambiance: "Nuit, couloir d'auberge baigné de bleu nuit ; les flammes de Maya n'éclairent en orange que le temps de ses gestes ; finale sur les toits sous la lune." })
    .returning();
  const crees: Record<string, number> = {};
  for (const a of NOUVEAUX) {
    const [ligne] = await tx
      .insert(assets)
      .values({ projectId: projet.id, code: a.code, type: a.type, statut: "a_produire", description: a.description, promptGeneration: a.promptGeneration, methodeGeneration: "generation" })
      .returning();
    crees[a.code] = ligne!.id;
  }
  const [plan] = await tx
    .insert(plans)
    .values({
      projectId: projet.id,
      episodeId: episode!.id,
      sceneId: scene!.id,
      ordre: 4,
      titre: "E — Combat total (15 s)",
      description: "La Tenancière avance d'un pas égal ; Maya l'attaque de toutes ses forces, flammes à la lame ; la Tenancière arrête chaque coup, l'envoie à travers une cloison d'une seule paume. Maya se relève en feu, tourne, et un pilier de flammes perce le toit de l'auberge.",
      dureeMontageSecondes: 15,
      dureeGenerationSecondes: 15,
      fps: 24,
      seed: SEED,
      statut: "en_attente",
      notes: "Tour 3 du banc : durée maximale, dix plans (le plan 5 dure 1 s à dessein : flash de point de vue), six références. Teste aussi les termes de caméra whip-pan, dive et swoop (hors liste officielle) et roll, POV, pedestal, shake. Les images DEC_toits_auberge et PROP_dague_maya sont à produire dans l'appli avant de générer.",
    })
    .returning();
  const refs = [
    [idDe("CHAR_maya_sheet"), "Maya — fiche personnage"],
    [idDe("CHAR_tenanciere"), "La Tenancière — fiche personnage"],
    [idDe("DEC_couloir_auberge"), "Le couloir de l'auberge, vide"],
    [crees["DEC_toits_auberge"]!, "Les toits de l'auberge, pour le dernier plan"],
    [idDe("VFX_flammes"), "Flammes de Maya : couleur, texture et mouvement empruntés"],
    [crees["PROP_dague_maya"]!, "La dague de Maya"],
  ] as const;
  await tx.insert(planRefs).values(refs.map(([assetId, role], i) => ({ planId: plan!.id, type: "picture" as const, slot: i + 1, assetId, role })));
  await tx.insert(planPromptSections).values([
    { planId: plan!.id, section: "subject_definitions", ordre: 1, contenu: SUBJECT_DEFINITIONS },
    { planId: plan!.id, section: "summary", ordre: 2, contenu: SUMMARY },
    { planId: plan!.id, section: "retention_analysis", ordre: 3, contenu: RETENTION },
    { planId: plan!.id, section: "detailed_description", ordre: 4, contenu: DESCRIPTION },
    { planId: plan!.id, section: "overall_soundscape", ordre: 5, contenu: SOUNDSCAPE },
    { planId: plan!.id, section: "non_diegetic_music", ordre: 6, contenu: MUSIC },
  ]);
  return { planId: plan!.id, uuid: plan!.uuid, assets: crees, motsShots: DESCRIPTION.split(/\s+/).length };
});
console.log(JSON.stringify(resultat, null, 2));
process.exit(0);
