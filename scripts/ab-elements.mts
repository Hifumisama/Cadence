// Banc de chorégraphie, duel des éléments (style Avatar) : feu contre terre, avec les trois effets d'« Avatar, Intro » (flamme bleue,
// tourbillon de roches, rocher soulevé). Deux plans de 15 s :
//   CF = écrit à la main avec les règles du skill après CD et CE (4 plans, caméra mobile dedans, coupes avant ou après un contact,
//        chaque réaction suit le coup, chaque plan reprend la position précédente, effets = ce que fait un personnage) ;
//   EL = plan sans prompt, avec une description narrative, pour l'agent plan-h3.
//   npx tsx --env-file=.env scripts/ab-elements.mts
// Travaille dans le projet « Banc de gestes — feu contre terre » (ab-gestes.mts) et y copie les trois effets depuis « Avatar, Intro ».
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assets, planPromptSections, planRefs, plans, projects, scenes } from "../db/schema";

const NOM_PROJET = "Banc de gestes — feu contre terre";
const NOM_SOURCE = "Avatar, Intro";
const SEED = 424242424242;
// Ordre des <Picture N> de CF.
const ORDRE = ["CHAR_maitre_du_feu", "CHAR_maitre_de_la_terre", "DEC_decor_neutre", "VFX_flamme", "VFX_terre", "VFX_rocher_souleve"];
const NOUVEAUX = ["VFX_flamme", "VFX_terre", "VFX_rocher_souleve"];

const SUBJECT_DEFINITIONS =
  "<Subject 1> is the fire master from <Picture 1> (face, hair, body and wardrobe only; ignore its background and extra views): a young woman with dark brown eyes, long black hair in a high ponytail with a red band, a red wrap tunic with gold trim and dark patterned cuffs, a dark red sash, wide dark red trousers, dark boots.\n" +
  "<Subject 2> is the earth master from <Picture 2> (face, hair, body and clothes only; ignore its background and extra views): a very muscular man with wavy brown hair, a worn brown tunic with a laced collar and rolled sleeves, a leather belt, brown trousers and leather boots.\n" +
  "<Subject 3> is the stone hall from <Picture 3> (architecture, floor and dusk light only; no people): a vaulted hall of warm stone arches and pillars, a floor of cracked, ice-glazed flagstones with drifts of snow.\n" +
  "<Subject 4> is the blue flame from <Picture 4> (colour, texture and motion only; no framing or composition): always something the fire master throws from her fists, feet and palms.\n" +
  "<Subject 5> is the swirl of rocks and earth from <Picture 5> (colour, texture and motion only; no framing or composition): always something the earth master raises from the floor.\n" +
  "<Subject 6> is the boulder from <Picture 6> (appearance only; no framing or composition): the boulder the earth master tears out of the ground.";
const SUMMARY = "[reference generation] The target video shows <Subject 1> and <Subject 2> fighting a duel of elements on <Subject 3>: her <Subject 4> against his <Subject 5> and <Subject 6>, ending with her fist stopped a hand's width from his face.";
const RETENTION =
  "<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - tunic and ponytail kept.\n" +
  "<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - tunic and build kept.\n" +
  "<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - stage kept.\n" +
  "<Subject 4> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): attribute_transfer - the blue colour and flowing motion pass onto her fists, feet and palms; it supplies no framing or composition.\n" +
  "<Subject 5> (appears in [Shot 1], [Shot 3], [Shot 4]): weak_reference - only the colour, texture and swirling motion of the rocks and earth are borrowed; it supplies no framing or composition.\n" +
  "<Subject 6> (appears in [Shot 2]): weak_reference - only the stone surface and the dust it trails are borrowed; it supplies no framing or composition.";
const SOUNDSCAPE = "The roar of flame, stone grinding and cracking, a dull thud of rock on rock, a burst of fire against stone, the whoosh of a hurled boulder, boots on the floor, then a held silence.";
const MUSIC = "Low strings and deep drums, a taiko hit on each clash, a held brass note on the final stop.";

const CF =
  "Cinematic 3D feature-animation look, soft warm dusk light. The fire master is always on the left of the frame facing right, the earth master on the right facing left. " +
  "[Shot 1] A wide side-on shot, the camera slowly pushing in: <Subject 1>, the fire master, stands in a low stance on the left while <Subject 2>, the earth master, stands heavy on the right, on <Subject 3>. She thrusts her fist forward and a jet of <Subject 4> leaves it and crosses the stage as a spear; he stamps his right foot, a slab of floor rises in front of him in a swirl of <Subject 5> and takes the flame, which bursts against the stone in a spray of sparks and chips. The slab crumbles, and she slides back one step while he steps forward. " +
  "[Shot 2] At 00:04.000, the shot cuts to a low-angle two-shot at hip height, both fighters in frame, the camera tracking to the right: he sweeps both arms up and tears <Subject 6> out of the ground, rocks spiralling around it, and hurls it; she drops to a crouch beneath it, the boulder passes over her head trailing dust and lands behind her, cracking the stone, while her rear leg sweeps a ring of <Subject 4> along the floor; he leaps over the ring, which melts the ice where he stood, and lands three steps from her as she rises into her stance. " +
  "[Shot 3] At 00:08.000, the shot cuts to a medium two-shot, both fighters in frame: she spins and drives a crescent kick wrapped in <Subject 4> at his head; he crosses his forearms and <Subject 5> wraps them in a shell of stone, and the kick shatters the shell in a burst of blue sparks and shards, throwing him back two steps, his boots scraping the floor; the camera pushes in on his face as the flame light flickers over it. " +
  "[Shot 4] At 00:11.500, the shot cuts to a wide low-angle shot: he plants both fists and the floor erupts beneath her in a spiral of <Subject 5>; she leaps above it, a burst of <Subject 4> from her palms drives her down and her fist stops one hand's width from his face, the wind of the flame blowing his hair and tunic while the rocks fall around them in a ring of dust. The frame holds. " +
  "Exactly two fighters; no identity drift or left-right reversal; no text.";

const DESCRIPTION_AGENT =
  "Duel des éléments dans le style d'Avatar : le maître du feu lance un jet de flamme bleue que le maître de la terre arrête en soulevant une dalle de sol. Il arrache un rocher du sol et le lui lance, elle l'évite en se baissant et balaie le sol d'un anneau de feu, il le saute. Elle le frappe d'un coup de pied enflammé, il se protège d'une carapace de pierre qui éclate. Il fait jaillir le sol sous elle en tourbillon de roches ; elle saute par-dessus et s'arrête, le poing à un souffle de son visage.";

const [projet] = await db.select().from(projects).where(eq(projects.nom, NOM_PROJET));
if (!projet) throw new Error(`Projet introuvable : ${NOM_PROJET} (lancer d'abord ab-gestes.mts)`);
const [source] = await db.select().from(projects).where(eq(projects.nom, NOM_SOURCE));
if (!source) throw new Error(`Projet source introuvable : ${NOM_SOURCE}`);
const deja = await db.select().from(plans).where(eq(plans.projectId, projet.id));
if (deja.some((p) => /^(CF|EL) /.test(p.titre))) throw new Error("Les plans du duel des éléments existent déjà — rien n'a été écrit.");
const miens = await db.select().from(assets).where(eq(assets.projectId, projet.id));
const siens = await db.select().from(assets).where(eq(assets.projectId, source.id));
const modele = deja.find((p) => p.titre.startsWith("CB "))!;
let ordre = Math.max(...deja.map((p) => p.ordre)) + 1;

const sortie = await db.transaction(async (tx) => {
  for (const code of NOUVEAUX) {
    if (miens.some((a) => a.code === code)) continue;
    const a = siens.find((x) => x.code === code);
    if (!a?.fichier) throw new Error(`Asset source sans image : ${code}`);
    const [n] = await tx.insert(assets).values({ projectId: projet.id, code: a.code, type: a.type, statut: a.statut, description: a.description, promptGeneration: a.promptGeneration, fichier: a.fichier, fichierAt: a.fichierAt }).returning();
    miens.push(n!);
  }
  const idDe = (c: string) => miens.find((a) => a.code === c)!.id;
  const [scene] = await tx.insert(scenes).values({ episodeId: modele.episodeId, ordre: 1, titre: "Le duel des éléments", genre: "action", ambiance: "Crépuscule doux, lumière chaude ; flamme bleue et poussière de roche.", fonction: "Combat de 15 s avec maîtrise des éléments." }).returning();
  const base = { projectId: projet.id, episodeId: modele.episodeId, sceneId: scene!.id, dureeMontageSecondes: 15, dureeGenerationSecondes: 15, fps: 24, seed: SEED, statut: "en_attente" as const };
  const [cf] = await tx.insert(plans).values({ ...base, ordre: ordre++, titre: "CF — Duel des éléments écrit à la main (15 s)", description: "Duel des éléments, écrit à la main avec les règles du skill après CD et CE.", notes: "Duel des éléments : 4 plans, caméra mobile dedans, coupes avant ou après un contact, chaque réaction suit le coup, effets = ce que fait un personnage." }).returning();
  await tx.insert(planRefs).values(ORDRE.map((c, i) => ({ planId: cf!.id, type: "picture" as const, slot: i + 1, assetId: idDe(c) })));
  const contenus = [SUBJECT_DEFINITIONS, SUMMARY, RETENTION, CF, SOUNDSCAPE, MUSIC];
  const noms = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"] as const;
  await tx.insert(planPromptSections).values(contenus.map((contenu, i) => ({ planId: cf!.id, section: noms[i]!, ordre: i + 1, contenu })));
  const [el] = await tx.insert(plans).values({ ...base, ordre: ordre++, titre: "EL — Duel des éléments pour l'agent (15 s)", description: DESCRIPTION_AGENT, notes: "Plan sans prompt, pour l'agent plan-h3." }).returning();
  return { cf: { uuid: cf!.uuid, caracteres: contenus.join("").length }, el: { uuid: el!.uuid } };
});
console.log(JSON.stringify(sortie));
process.exit(0);
