// Banc A/B, tour 2 : un plan MULTI-RÉFÉRENCES (duel Maya / la Tenancière) dans le projet « Banc A/B — H3 et Singularity ».
// Crée les assets (à produire, prompts écrits, aucune génération lancée) et le plan. Lancer :
//   npx tsx --env-file=.env scripts/ab-multiref.mts
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assets, episodes, planPromptSections, planRefs, plans, projects, scenes, seasons } from "../db/schema";

const NOM = "Banc A/B — H3 et Singularity";
const SEED = "314159265358979";
const CLAUSE =
  "Cinematic anime illustration, refined linework, sophisticated cinematic lighting, atmospheric depth, polished digital rendering, in the visual tradition of Makoto Shinkai and Yoshiyuki Sadamoto.";
const FICHE = "neutral standing pose, plain light background, character has 4 views : front full-body view, body side view, body back view, detailed single headshot view in foreground.";

// ---------------------------------------------------------------- assets (descriptions FR du registre, prompts EN pour Krea 2)
const ASSETS = [
  {
    code: "CHAR_maya_sheet",
    type: "personnage",
    description:
      "Fiche personnage de Maya, danseuse et espionne : peau hâlée, yeux rouge rubis, longue queue de cheval brune nouée d'un lien rouge, pendants d'oreilles dorés ; corset doré sur haut croisé rouge profond, manches bouffantes rouges, brassards dorés, ceinture dorée sur un pantalon ample rouge bordé d'or, écharpe bleue à la taille, sandales dorées, bijoux de cheville. Mains vides.",
    promptGeneration: `A young woman dancer with sun-tanned skin, ruby-red eyes and a calm, watchful expression, a long dark brown ponytail tied with a red band, gold drop earrings, wearing a deep red wrap top with a gold corset and a jewelled gold collar, loose puffed red sleeves, gold armbands on both forearms, a wide gold belt with a flat leather strap lying across it, wide deep red trousers edged with gold embroidery, a blue sash knotted at the hip, gold sandals and fine gold ankle jewelry, hands empty and relaxed at her sides, ${FICHE}`,
  },
  {
    code: "CHAR_tenanciere",
    type: "personnage",
    description:
      "La Tenancière, patronne de l'auberge : stature imposante, port de général en retraite, la cinquantaine, cheveux noirs striés d'argent tirés en chignon bas, hétérochromie (œil gauche d'un noir insondable, œil droit gris très pâle), robe longue bleu nuit à motifs argentés, col haut. Mains vides.",
    promptGeneration: `A tall, imposing woman in her fifties with the straight bearing of a retired general, broad shoulders, an angular stern face with high cheekbones and a cold, composed expression, black hair streaked with silver pulled back into a low knot, heterochromia with her left eye an abyssal black and her right eye a pale icy grey, wearing a floor-length midnight-blue gown with a high collar, long fitted sleeves and intricate silver patterns of interlaced vines, a heavy silver clasp at the throat, hands empty and relaxed at her sides, ${FICHE}`,
  },
  {
    code: "DEC_couloir_auberge",
    type: "decor",
    description:
      "Le couloir de l'auberge, vide : long passage symétrique en bois sculpté, claustras à treillis, lanternes de papier suspendues à intervalles réguliers, parquet poli, baigné d'une lumière bleu nuit constante, la couleur de la robe de la Tenancière. Personne dans le couloir.",
    promptGeneration:
      "A long empty corridor inside an oriental night inn, seen in one-point perspective from the middle of the floor, symmetrical rows of dark carved timber posts and lattice screens converging on a distant wooden door, paper lanterns hanging at regular intervals along the ceiling beams, glossy polished floorboards holding soft reflections, the whole passage soaked in a deep midnight-indigo light that tints the carved wood, the screens and the floor evenly, calm and still air.",
  },
  {
    code: "VFX_flammes",
    type: "vfx",
    description: "Les flammes de Maya : langues de feu orange-rouge à cœur jaune vif, qui s'enroulent et laissent échapper des braises, sans fumée noire. Matière générique, sans sujet.",
    promptGeneration:
      "Tongues of orange-red fire with bright yellow cores curling and spiralling upward in a loose helix, shedding small glowing embers that drift away, clean luminous flame with crisp edges, centred on a plain dark background.",
  },
] as const;

// ---------------------------------------------------------------- le plan (même grille dense que la variante B)
const SUBJECT_DEFINITIONS =
  "<Subject 1> is Maya from <Picture 1>, the character sheet of a young dancer and spy with sun-tanned skin, ruby-red eyes, a long dark brown ponytail tied with a red band, gold drop earrings, a deep red wrap top with a gold corset and jewelled collar, loose puffed red sleeves, gold armbands, a gold belt over wide red trousers edged with gold, a blue sash, gold sandals and ankle jewelry.\n" +
  "<Subject 2> is the Tenancière from <Picture 2>, the character sheet of a tall, imposing woman in her fifties with a general's straight bearing, black hair streaked with silver pulled into a low knot, a left eye of abyssal black and a right eye of pale icy grey, wearing a floor-length midnight-blue gown with a high collar and intricate silver patterns.\n" +
  "<Subject 3> is the empty inn corridor in <Picture 3>, a long symmetrical passage of dark carved timber and lattice screens with paper lanterns and polished floorboards, soaked in a constant deep indigo light.\n" +
  "<Subject 4> is the flame effect from <Picture 4>, orange-red tongues of fire with bright yellow cores shedding embers, borrowed here only for its colour, texture and motion.";

const SUMMARY =
  "[reference generation] The target video shows <Subject 2>, the Tenancière, walking at an even pace down <Subject 3> toward <Subject 1>, Maya, who draws a short dagger in a sweeping arc wrapped in <Subject 4>, lunges, and is stopped by the Tenancière's hand on her wrist and one dry slap; the flames die with the stopped gesture, and the Tenancière walks past the kneeling Maya, her head facing straight ahead.";

const RETENTION =
  "<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - Maya's face, ponytail and red-and-gold costume are retained in every shot.\n" +
  "<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - the Tenancière's bearing, midnight-blue gown and two differently coloured eyes are retained.\n" +
  "<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - the corridor's carved timber, lanterns, floorboards and indigo light are retained, and it stays empty of other people.\n" +
  "<Subject 4> (appears in [Shot 2], [Shot 3]): attribute_transfer - the orange-red colour, texture and motion of the flames pass onto Maya's forearm and blade; the reference's own framing is not reproduced.";

const DESCRIPTION =
  `${CLAUSE} A deep midnight-indigo light bathes the whole corridor and holds steady, apart from the warm orange glow of the flames while they burn. ` +
  "[Shot 1] A wide static shot, the camera locked and the corridor steady, looks down the full length of <Subject 3>, rows of carved timber and lattice screens converging on a distant wooden door, the polished floorboards holding faint indigo reflections. <Subject 1>, Maya, stands in the left foreground in a low dancer's stance, her knees softly bent, her weight on the balls of her feet, her red sleeves still, her right hand resting at her belt over the flat leather strap. Far down the corridor <Subject 2>, the Tenancière, walks toward her at a slow even pace, her back straight, her arms hanging at her sides, her midnight-blue gown swaying with each step and its silver patterns catching the indigo light. Her stride keeps the same unhurried rhythm for the whole shot, and her heels count each step on the boards. Maya's head turns slowly toward her, her eyes narrowing, her breath held. The shot ends with the Tenancière a few meters away and Maya's fingers closing around the hidden hilt. " +
  "[Shot 2] At 00:02.500, Hard cut to a low-angle shot from floor level beside Maya's hip, where <Subject 1> draws the short dagger from beneath the leather strap in one sweeping arc, her torso rotating, her red sleeve snapping behind the blade. As the arc passes her forearm <Subject 4> ignites along her forearm and the steel, orange-red flames wrapping the blade in a spiral that follows its path, embers streaming off the edge and landing on the polished floorboards, orange light sliding across the planks and across the hem of <Subject 2>'s gown as she keeps walking in the background at the same even pace. The camera tilts up at slow speed from the glowing blade to Maya's face, lit orange from below, her red eyes fixed on her target, her jaw set. The shot ends with the blade raised, the flames at full height and Maya's weight shifted onto her front foot. " +
  "[Shot 3] At 00:04.500, Hard cut to a tracking shot at chest height along Maya's side, the camera moving sideways at her speed, as <Subject 1> lunges forward in two quick steps and slashes the flaming dagger toward <Subject 2>'s throat. At the same unhurried pace, the Tenancière's left hand rises and closes around Maya's wrist at the instant of contact, stopping the blade just short of her collar, and the flames die with the stopped gesture, shrinking into a few sparks and embers that fall onto the Tenancière's sleeve and the boards. Her right palm swings flat across Maya's cheek in one dry, short strike: Maya's head snaps sideways, her ponytail whips across the frame, a spray of embers scatters from her hair, and the sharp slap echoes down the corridor. The shot ends as the Tenancière releases the wrist, Maya's dagger arm dropping and her knees giving way. " +
  "[Shot 4] At 00:06.000, Hard cut to a medium shot at floor level in front of the two women, the camera locked and the corridor steady. <Subject 1> drops to one knee, her free hand pressed flat on the floorboards, the dagger hanging loosely from her other hand, a red mark spreading across her cheek, her chest heaving, a few embers dying on the planks around her. <Subject 2> walks past her with her head facing straight ahead, her gown brushing Maya's shoulder, her stride at the same even pace, and continues out of the frame to the right until only Maya remains in the indigo light, the last ember fading beside her hand. The shot ends with Maya looking up, her red eyes following the Tenancière out of frame.";

const SOUNDSCAPE =
  "The measured click of heels on timber, the rustle of heavy silk, the rasp of a blade leaving leather, a soft roar of flame that swells with the slash and cuts off at the catch, one dry slap echoing down the corridor, Maya's ragged breathing, then a hush broken by the tick of a last ember.";

const MUSIC =
  "Low sustained bowed strings at a slow tempo with a single deep drum beat on each of the Tenancière's steps, a sharp rising string figure as the dagger is drawn, a hard silence on the slap, then one low sustained note that fades.";

// ---------------------------------------------------------------- insertion
const [projet] = await db.select().from(projects).where(eq(projects.nom, NOM));
if (!projet) throw new Error(`Projet « ${NOM} » introuvable`);
const dejaLa = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projet.id), eq(assets.code, "CHAR_tenanciere")));
if (dejaLa.length) throw new Error("Le test multi-références existe déjà — rien n'a été écrit.");

const [saison] = await db.select().from(seasons).where(eq(seasons.projectId, projet.id));
const [episode] = await db.select().from(episodes).where(eq(episodes.seasonId, saison!.id));
const [mayaScene] = await db.select().from(assets).where(and(eq(assets.projectId, projet.id), eq(assets.code, "CHAR_maya")));

const resultat = await db.transaction(async (tx) => {
  const [scene] = await tx
    .insert(scenes)
    .values({ episodeId: episode!.id, ordre: 1, titre: "Le duel", fonction: "Banc de mesure, tour 2 : quatre références (deux fiches personnage, un décor, un effet).", genre: "action", ambiance: "Nuit, couloir d'auberge baigné d'une lumière bleu nuit constante ; seule la lueur orangée des flammes la change, le temps du geste." })
    .returning();
  const crees: Record<string, number> = {};
  for (const a of ASSETS) {
    const [ligne] = await tx
      .insert(assets)
      .values({
        projectId: projet.id,
        code: a.code,
        type: a.type,
        statut: "a_produire",
        description: a.description,
        promptGeneration: a.promptGeneration,
        methodeGeneration: "generation",
        deriveDeId: a.code === "CHAR_maya_sheet" ? mayaScene!.id : null,
      })
      .returning();
    crees[a.code] = ligne!.id;
  }
  const [plan] = await tx
    .insert(plans)
    .values({
      projectId: projet.id,
      episodeId: episode!.id,
      sceneId: scene!.id,
      ordre: 3,
      titre: "D — Duel (multi-références)",
      description: "La Tenancière avance d'un pas égal dans le couloir. Maya dégaine sa dague, ses flammes la suivent, elle charge ; la Tenancière arrête son poignet, la gifle d'un seul geste sec et passe devant elle sans se retourner.",
      dureeMontageSecondes: 8,
      dureeGenerationSecondes: 8,
      fps: 24,
      seed: SEED,
      statut: "en_attente",
      notes: "Tour 2 du banc : même grille dense que B, quatre références (fiches de Maya et de la Tenancière, décor vide, flammes). Teste la fidélité aux références avec Singularity. Les images sont à produire dans l'appli avant de générer.",
    })
    .returning();
  const roles = [
    ["CHAR_maya_sheet", "Maya — fiche personnage"],
    ["CHAR_tenanciere", "La Tenancière — fiche personnage"],
    ["DEC_couloir_auberge", "Le couloir de l'auberge, vide"],
    ["VFX_flammes", "Flammes de Maya : couleur, texture et mouvement empruntés"],
  ] as const;
  await tx.insert(planRefs).values(roles.map(([code, role], i) => ({ planId: plan!.id, type: "picture" as const, slot: i + 1, assetId: crees[code]!, role })));
  await tx.insert(planPromptSections).values([
    { planId: plan!.id, section: "subject_definitions", ordre: 1, contenu: SUBJECT_DEFINITIONS },
    { planId: plan!.id, section: "summary", ordre: 2, contenu: SUMMARY },
    { planId: plan!.id, section: "retention_analysis", ordre: 3, contenu: RETENTION },
    { planId: plan!.id, section: "detailed_description", ordre: 4, contenu: DESCRIPTION },
    { planId: plan!.id, section: "overall_soundscape", ordre: 5, contenu: SOUNDSCAPE },
    { planId: plan!.id, section: "non_diegetic_music", ordre: 6, contenu: MUSIC },
  ]);
  return { planId: plan!.id, uuid: plan!.uuid, assets: crees, mots: DESCRIPTION.split(/\s+/).length };
});
console.log(JSON.stringify(resultat, null, 2));
process.exit(0);
