// Banc A/B, variante K : J + les ajouts « saisissants » (poids des coups avec arrêt à l'impact, gros plan de réaction,
// respiration avant la finale, décor qui cède, dernière image calme). Un peu plus long que J (environ 8 300 caractères contre 7 300).
//   npx tsx --env-file=.env scripts/ab-combat-k.mts
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { planPromptSections, planRefs, plans, projects } from "../db/schema";

const CLAUSE = "Cinematic anime illustration, refined linework, atmospheric depth.";

const SUBJECT_DEFINITIONS =
  "<Subject 1> is Maya from <Picture 1>; the picture defines her face, hair, body and wardrobe only (its plain background and extra views are ignored): sun-tanned skin, red eyes, a long dark brown ponytail tied with a red band, a deep red wrap top with a gold corset, puffed red sleeves, gold armbands, wide red trousers edged with gold, a blue sash, gold sandals.\n" +
  "<Subject 2> is the Tenancière from <Picture 2>; the picture defines her face, hair, body and midnight-blue silver-patterned gown only (its plain background and extra views are ignored): a tall imposing woman in her fifties with a general's straight bearing and black hair streaked with silver in a low knot.\n" +
  "<Subject 3> is the inn corridor from <Picture 3>; the picture defines its architecture, materials and indigo lighting only, and holds no people: a long carved-timber passage with lattice screens, paper lanterns and polished floorboards.\n" +
  "<Subject 4> is the inn's tiled rooftops and moonlit sky from <Picture 4>, used only in the final aerial shot.\n" +
  "<Subject 5> is the flame effect from <Picture 5>; the picture defines only the colour, texture and motion of the flames (its framing is ignored): they are always something Maya's blade, fists or body do, and later the pillar.\n" +
  "<Subject 6> is Maya's dagger from <Picture 6>; the picture defines only the dagger's appearance: a straight steel blade, small brass guard, hilt wrapped in dark brown leather cord.";

const SUMMARY =
  "[reference generation] The target video shows <Subject 2>, the Tenancière, walking down <Subject 3> toward <Subject 1>, Maya, who charges with <Subject 6> in flames and trades kicks, sweeps and strikes with her; the Tenancière deflects every blow at an even pace, twists the dagger away into a post, then throws the unarmed Maya through a lattice screen with one palm strike that freezes the air for a heartbeat; Maya rises wrapped in flames, the hall holds its breath, her pirouette bursts through the ceiling and a colossal pillar of fire erupts from the roof, wrecking the hall and the rooftops before folding into embers, while the Tenancière walks on.";

const RETENTION =
  "<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 6], [Shot 7], [Shot 9]): fully_preserved - Maya keeps her red-and-gold costume and ponytail throughout.\n" +
  "<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 6], [Shot 7], [Shot 9]): fully_preserved - the Tenancière keeps her midnight-blue gown, relaxed arms and one even walking pace.\n" +
  "<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 6], [Shot 7], [Shot 9]): fully_preserved - the corridor's carved timber, lanterns and floorboards are retained until the shockwave wrecks them.\n" +
  "<Subject 4> (appears in [Shot 8]): fully_preserved - the curved tiled roofs and the moonlit night sky are retained.\n" +
  "<Subject 5> (appears in [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 6], [Shot 7], [Shot 8], [Shot 9]): attribute_transfer - the orange-red colour, texture and motion of the flames pass onto Maya's blade, fists, body and the final pillar.\n" +
  "<Subject 6> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - the dagger's appearance is retained until the Tenancière twists it away.";

const DESCRIPTION =
  `${CLAUSE} Night, a long carved-timber inn corridor under constant deep indigo light; orange light appears only where flames burn and fades when each gesture ends. A lattice screen on the left wall later breaks open onto a dark adjoining hall. In every side-on, low and two-person view Maya is on the left of the frame facing right and the Tenancière is on the right facing left, so the exchange runs left to right; Maya is thrown toward the left-hand wall. ` +
  "[Shot 1] A wide static shot, the camera locked, looks down the full corridor of <Subject 3> from mid-floor. <Subject 1>, Maya, stands in the near left foreground in a low dancer's stance, her hand on her belt strap, her eyes locked on her target. <Subject 2>, the Tenancière, walks toward her at an even pace, arms relaxed, her heels counting the boards. The shot ends on the first stride of Maya's charge. " +
  "[Shot 2] At 00:01.500, Hard cut to a side-on tracking shot at chest height, continuing the charge mid-stride. Maya draws <Subject 6>, <Subject 5> runs along the blade, and she slashes high; the Tenancière's right forearm sweeps it aside in a spray of sparks. Maya spins into a heel kick; the Tenancière's elbow drops to block with a heavy thud, a ring of dust lifts off the boards, the lanterns rattle, and she slides back one step, her gown rippling. " +
  "[Shot 3] At 00:03.000, Hard cut to a low-angle two-shot at floor level. Maya's low leg sweep; the Tenancière lifts her foot over it. Maya springs off her hands and slashes upward; the Tenancière catches and twists her wrist, the flaming dagger spins out trailing a ribbon of fire, the camera pans right and it buries itself in a carved post with a sharp thunk, the hilt trembling. " +
  "[Shot 4] At 00:04.500, Hard cut to a medium side-on two-shot, the camera shaking slightly. Maya's fists wrapped in flame throw a jab, a hook and a palm strike, each deflected by the Tenancière in a burst of sparks that scorches a lantern, then a back-fist she sways under by a hand's width. The camera pushes in on Maya's face as the Tenancière's right palm lands on her sternum: her red eyes widen. For a heartbeat the frame slows almost to stillness in slow motion, the dust, splinters and embers hanging in the air around Maya's lifted body, the Tenancière's silver-streaked hair frozen mid-lift on her calm face; then time snaps back with a strong camera shake, a shockwave runs along the boards and Maya is hurled toward the left edge. " +
  "[Shot 5] At 00:06.500, Hard cut to a tracking shot ahead of Maya flying backward into the left wall: the lattice screen bursts outward in jagged splinters and fluttering paper and she tumbles into a dark hall, sliding to a stop on her side. In the opening, the Tenancière's silhouette walks toward her at the same pace. " +
  "[Shot 6] At 00:08.000, Hard cut to a low angle in the hall. Maya pushes up, her palm leaving a glowing handprint in the wood; flames climb her legs and sleeves in a helix, her eyes brightening; the Tenancière steps through the broken screen at the same pace; the camera pedestals up. Then the hall holds its breath: every sound drops away, embers rise slowly around Maya's still figure, her red eyes open and fixed, only the Tenancière's heels still counting the boards. " +
  "[Shot 7] At 00:10.000, Hard cut to a dive from above into the hall. Maya's pirouette gathers the flames into a spiral that bursts through the ceiling: beams and planks tear away, tiles blast skyward, lanterns pop one after another, the lattice screens fold outward off their frames in sequence, the floorboards buckle upward in a rolling wave, and the opened sky pours moonlight into the hall, whipping the Tenancière's gown, its silver patterns glowing orange, as she keeps her stride. " +
  "[Shot 8] At 00:11.500, Hard cut to a high aerial swoop over the rooftops of <Subject 4>: a colossal pillar of flame erupts from the roof and widens as it rises, wider than the inn's main wing, the shockwave lifting the tiles in rings and snuffing the eave lanterns; it keeps its full width for a beat, then folds inward into a slow rain of embers. " +
  "[Shot 9] At 00:13.000, Hard cut to a locked low-angle shot inside the wrecked hall under the open sky: Maya kneels in the foreground, head bowed, breathing hard, embers landing on the boards around her; the Tenancière walks past her, her gaze lifting once to the falling embers, her stride unchanged, and leaves the frame, the indigo moonlight settling over the ruins. " +
  "Exactly two fighters throughout; no identity drift, costume swaps or left-right reversal; no black smoke, text or subtitles.";

const SOUNDSCAPE =
  "Heels on timber, the rasp of the blade, a flame that roars with each slash, heavy thuds of blocks, the thunk of the dagger in the post, a muffled hush at the palm strike then a crack as time resumes, splintering wood, a held near-silence broken only by heel clicks, a booming shockwave, then ticking embers.";

const MUSIC =
  "Low strings, a single taiko hit on each of the Tenancière's steps, silence on the palm strike, one low sustained note under the held breath, then a brass crescendo at the burst and a single high note that fades.";

const [projet] = await db.select().from(projects).where(eq(projects.nom, "Banc A/B — H3 et Singularity"));
const [modele] = await db.select().from(plans).where(and(eq(plans.projectId, projet!.id), eq(plans.titre, "E — Combat total (15 s)")));
const refsE = await db.select().from(planRefs).where(eq(planRefs.planId, modele!.id));
const existe = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.projectId, projet!.id), eq(plans.titre, "K — Combat saisissant (compact)")));
if (existe.length) throw new Error("K existe déjà — rien n'a été écrit.");

const r = await db.transaction(async (tx) => {
  const [p] = await tx.insert(plans).values({
    projectId: projet!.id, episodeId: modele!.episodeId, sceneId: modele!.sceneId, ordre: 9, titre: "K — Combat saisissant (compact)",
    description: modele!.description, dureeMontageSecondes: 15, dureeGenerationSecondes: 15, fps: 24, seed: modele!.seed, statut: "en_attente",
    notes: "Variante K : base de J (compact, rôles bornés, négatifs courts) + les ajouts « saisissants » : ralenti à l'impact de la paume avec gros plan sur les yeux de Maya, respiration avant la finale, décor qui cède (poutres, cloisons en cascade, parquet), pilier qui garde sa largeur avant de se replier, dernière image calme sur la Tenancière qui passe sans s'arrêter. Neuf plans à timecodes (0, 1,5, 3, 4,5, 6,5, 8, 10, 11,5 et 13 s). Même longueur que J. Mêmes images et même seed.",
  }).returning();
  await tx.insert(planRefs).values(refsE.map((x) => ({ planId: p!.id, type: x.type, slot: x.slot, assetId: x.assetId, role: x.role, retention: x.retention })));
  await tx.insert(planPromptSections).values([
    { planId: p!.id, section: "subject_definitions", ordre: 1, contenu: SUBJECT_DEFINITIONS },
    { planId: p!.id, section: "summary", ordre: 2, contenu: SUMMARY },
    { planId: p!.id, section: "retention_analysis", ordre: 3, contenu: RETENTION },
    { planId: p!.id, section: "detailed_description", ordre: 4, contenu: DESCRIPTION },
    { planId: p!.id, section: "overall_soundscape", ordre: 5, contenu: SOUNDSCAPE },
    { planId: p!.id, section: "non_diegetic_music", ordre: 6, contenu: MUSIC },
  ]);
  return { planId: p!.id, uuid: p!.uuid, caracteres: [SUBJECT_DEFINITIONS, SUMMARY, RETENTION, DESCRIPTION, SOUNDSCAPE, MUSIC].join("").length };
});
console.log(JSON.stringify(r));
process.exit(0);
