// Banc A/B, variante M : le combat de L à la norme du guide officiel (description de 350 à 500 mots), 4 plans, mouvements de caméra
// à l'intérieur des plans, coupes écrites « the shot cuts to » (et non « Hard cut to »).
//   npx tsx --env-file=.env scripts/ab-combat-m.mts
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { planPromptSections, planRefs, plans, projects } from "../db/schema";

const SUBJECT_DEFINITIONS =
  "<Subject 1> is Maya from <Picture 1> (face, hair, body and wardrobe only; ignore its background and extra views): red eyes, a long dark ponytail with a red band, a red wrap top with a gold corset, puffed red sleeves, gold armbands, wide red trousers, a blue sash.\n" +
  "<Subject 2> is the Tenancière from <Picture 2> (face, hair, body and gown only): a tall imposing woman in a midnight-blue silver-patterned gown, silver-streaked black hair in a low knot.\n" +
  "<Subject 3> is the inn corridor from <Picture 3> (architecture and indigo light only; no people).\n" +
  "<Subject 4> is the inn rooftops and moonlit sky from <Picture 4>, final shot only.\n" +
  "<Subject 5> is the flame effect from <Picture 5> (colour, texture and motion only): always something Maya's blade, fists or body do, and later the pillar.\n" +
  "<Subject 6> is Maya's dagger from <Picture 6> (appearance only).";

const SUMMARY =
  "[reference generation] The target video shows <Subject 2> walking down <Subject 3> toward <Subject 1>, who charges with <Subject 6> in flames; after a brutal exchange the dagger is twisted away, one palm strike throws Maya through a screen, she rises in flames, and her pirouette sends a pillar of fire through the roof of the inn.";

const RETENTION =
  "<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - costume and ponytail kept.\n" +
  "<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - gown and bearing kept.\n" +
  "<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3]): fully_preserved - corridor kept until the shockwave.\n" +
  "<Subject 4> (appears in [Shot 4]): fully_preserved - roofs and sky kept.\n" +
  "<Subject 5> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): attribute_transfer - colour, texture and motion pass onto Maya and the pillar.\n" +
  "<Subject 6> (appears in [Shot 1]): fully_preserved - appearance kept.";

const DESCRIPTION =
  "Cinematic anime illustration, atmospheric depth. Night, an inn corridor in constant deep indigo light; orange light only where flames burn. Maya is always on the left of the frame facing right, the Tenancière on the right facing left; the fight runs left to right. " +
  "[Shot 1] A wide shot with the camera locked looks down <Subject 3>: <Subject 1>, Maya, stands in the near left foreground in a low stance while <Subject 2>, the Tenancière, walks toward her at an even pace, arms relaxed. When she is six steps away Maya charges and the camera slides sideways with her: she draws <Subject 6>, <Subject 5> runs along the blade, a high slash is swept aside by the Tenancière's forearm in a spray of sparks, a spinning heel kick is blocked by her elbow with a heavy thud and a ring of dust; Maya sweeps low, the Tenancière lifts her foot over it, Maya springs up with an upward slash, her wrist is caught and twisted, and the flaming dagger spins out; the camera pans right and it thunks into a carved post. " +
  "[Shot 2] At 00:04.500, the shot cuts to a medium side-on two-shot, the camera shaking slightly: Maya's flaming fists throw a jab, a hook and a palm, each deflected in sparks, until the Tenancière's right palm lands on her sternum. The camera pushes in on Maya's face, her red eyes widening, and for a heartbeat the frame slows almost to stillness, dust and embers hanging in the air; then time snaps back with a strong camera shake and Maya is hurled left, the camera tracking backward ahead of her as her back bursts a lattice screen into splinters and she tumbles into a dark hall. " +
  "[Shot 3] At 00:08.000, the shot cuts to a low angle in the hall: Maya rises as flames climb her body while the Tenancière steps through the broken screen at the same pace, and the hall holds its breath, embers rising around Maya's still figure. The camera dives from above as her pirouette gathers the flames into a spiral that bursts through the ceiling: beams tear away, lanterns pop, screens fold outward off their frames, floorboards buckle in a wave, moonlight pours in, whipping the Tenancière's gown as she keeps her stride. " +
  "[Shot 4] At 00:11.500, the shot cuts to a high aerial swoop over the rooftops of <Subject 4>: a colossal pillar of flame erupts from the roof, widening as it rises, the shockwave lifting tiles in rings and snuffing the eave lanterns, then it folds into a slow rain of embers as the moonlight returns. " +
  "Exactly two fighters; no identity drift or left-right reversal; no black smoke or text.";

const SOUNDSCAPE = "Heels on timber, the rasp of the blade, flame roaring, heavy thuds, wood splintering, a hush at the palm strike then a crack, a booming shockwave, ticking embers.";
const MUSIC = "Low strings, a taiko hit on each step, silence on the palm strike, a brass crescendo at the burst.";

const [projet] = await db.select().from(projects).where(eq(projects.nom, "Banc A/B — H3 et Singularity"));
const [modele] = await db.select().from(plans).where(and(eq(plans.projectId, projet!.id), eq(plans.titre, "E — Combat total (15 s)")));
const refsE = await db.select().from(planRefs).where(eq(planRefs.planId, modele!.id));
const titre = "M — Combat à la norme officielle (4 plans)";
if ((await db.select({ id: plans.id }).from(plans).where(and(eq(plans.projectId, projet!.id), eq(plans.titre, titre)))).length) throw new Error("M existe déjà — rien n'a été écrit.");

const mots = DESCRIPTION.split(/\s+/).length;
const total = [SUBJECT_DEFINITIONS, SUMMARY, RETENTION, DESCRIPTION, SOUNDSCAPE, MUSIC].join("").length;
const r = await db.transaction(async (tx) => {
  const [p] = await tx.insert(plans).values({
    projectId: projet!.id, episodeId: modele!.episodeId, sceneId: modele!.sceneId, ordre: 11, titre,
    description: modele!.description, dureeMontageSecondes: 15, dureeGenerationSecondes: 15, fps: 24, seed: modele!.seed, statut: "en_attente",
    notes: `Variante M : même combat que L, à la norme du guide officiel (detailed_description de ${mots} mots, prompt de ${total} caractères), 4 plans à timecodes (0, 4,5, 8 et 11,5 s) avec les mouvements de caméra à l'intérieur des plans, et coupes écrites « the shot cuts to » au lieu de « Hard cut to ». Mêmes images et même seed. Sacrifié par rapport à L : le plan de la dague plantée et celui des poings sont fondus dans les plans voisins.`,
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
  return { planId: p!.id, uuid: p!.uuid, mots, caracteres: total };
});
console.log(JSON.stringify(r));
process.exit(0);
