// Banc A/B « H3 vs Singularity » : un projet dédié, une référence (Maya), trois plans = trois variantes du MÊME contenu.
// Lancer depuis la racine du dépôt : npx tsx --env-file=.env <ce fichier>
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assets, briefs, episodes, planPromptSections, planRefs, plans, projects, scenes, seasons } from "../db/schema";
import { briefVide } from "../lib/agents/brief";
import { synchroniserClauseStyle } from "../lib/agents/brief-db";

const RACINE = "D:/Projets Vidéos/Cadence";
const NOM = "Banc A/B — H3 et Singularity";
const SEED = "314159265358979";
const CLAUSE =
  "Cinematic anime illustration, refined linework, sophisticated cinematic lighting, atmospheric depth, polished digital rendering, in the visual tradition of Makoto Shinkai and Yoshiyuki Sadamoto.";

// ---------------------------------------------------------------- parties communes aux trois variantes
const SUBJECT_DEFINITIONS =
  "<Subject 1> is Maya from <Picture 1>, a young woman with a long dark ponytail tied with a red band, red eyes, gold drop earrings, a red wrap top set with gold jewelry and rubies, loose red sleeves, gold armbands, a gold belt over wide red trousers edged with gold, a blue sash and gold sandals, a faint bruise on her cheek; the dark blue wooden shelving corridor behind her in <Picture 1> is the setting of the video, and her seated pose in <Picture 1> is her starting state, not a still to hold.";

const SUMMARY =
  "[reference generation] The target video shows <Subject 1> sitting wounded on the floor of a dark wooden archive corridor as a chain of towering shelves topples toward her from the far end; she seizes her dagger, rises, sprints ahead of the collapse, and slides to a stop at the corridor's end, breathless and coated in dust, as the wreckage settles behind her.";

const retention = (shots: string) =>
  `<Subject 1> (appears in ${shots}): fully_preserved - her face, ponytail, red-and-gold costume and build are retained in every shot; dust gradually coats her sleeves and armbands as the collapse reaches her.`;

const OUVERTURE = `${CLAUSE} Cold indigo moonlight falls through the slats of a narrow wooden archive corridor and stays constant until the last shot.`;

const SOUNDSCAPE =
  "Deep timber groans swell into a rolling rumble of toppling shelves, with the thud of books and scrolls hitting the planks. The slap of a palm and of gold sandals on wood, quick shallow breathing, then a long hush of settling dust broken by one scroll unrolling across the floor.";

const MUSIC =
  "Sparse low strings sustained at a slow tempo under the first shots. A pulsing low drum enters at the first falling shelf and accelerates through the sprint, then cuts out the instant she stops, leaving one high sustained note that fades.";

// ---------------------------------------------------------------- A : référence = ce que produisent nos règles actuelles
const A_SHOTS =
  `${OUVERTURE} ` +
  "[Shot 1] A wide static shot, the camera locked, looks down a narrow wooden archive corridor lined with towering dark shelves; <Subject 1>, Maya, sits against the right-hand shelving with her legs folded to one side and her head bowed, a dagger lying beside her open hand. A deep wooden crack echoes from the far end of the corridor and she lifts her head toward it, her fingers moving toward the dagger. " +
  "[Shot 2] At 00:02.500, Hard cut to a low-angle shot from floor level looking down the corridor, where the far shelves tip into one another like dominoes, books and scrolls spilling out and dust bursting at each impact, while <Subject 1> grips the dagger, presses her palm to the floor and pushes herself up into a crouch. " +
  "[Shot 3] At 00:04.500, Hard cut to a tracking shot in front of her as she sprints down the corridor toward the camera, the camera moving backward at her speed; her ponytail and sleeves whip behind her while the shelves collapse a few meters behind in a rolling cloud of dust and tumbling books. " +
  "[Shot 4] At 00:06.000, Hard cut to a medium shot at the end of the corridor, where <Subject 1> bursts out of the dust, slides to a stop and turns back toward the wreckage, dagger lowered in her right hand, breathing hard as the dust settles around her.";

// ---------------------------------------------------------------- B : mêmes 4 plans, descriptions denses (chaîne d'action, retour physique, caméra liée, état final)
const B_SHOTS =
  `${OUVERTURE} ` +
  "[Shot 1] A wide static shot, the camera locked and the corridor steady, looks down the full length of a narrow wooden archive corridor, towering shelves of dark timber crowding both walls and converging toward a black far end, thin pale bars of moonlight falling through the slats across the plank floor. <Subject 1>, Maya, sits against the right-hand shelving in the pose of <Picture 1>, legs folded to one side, shoulders slumped, head bowed so the ponytail hangs forward over her shoulder, her right hand resting open on the planks beside the dagger, her chest rising in slow shallow breaths. A deep wooden crack rolls up from the far end and a thread of dust trickles from the nearest shelf onto her hair. Her eyes open first, then her head lifts and turns toward the sound, her jaw tightening, her lips parting as her breath catches, and her fingers curl slowly toward the dagger's hilt while the creak of loaded timber grows louder. The shot ends with her gaze fixed down the corridor and her fingertips touching the hilt. " +
  "[Shot 2] At 00:02.500, Hard cut to a low-angle shot from floor level, looking along the planks past the dagger toward the far end, where the last shelf lurches off its vertical, its top row of books sliding out, then tips forward into the next shelf, which gives way in turn, and the next, a chain of tall shelves leaning and falling toward the camera one after another, each impact throwing up a burst of dust and splinters while scrolls flutter out of the shelving. In the lower foreground <Subject 1> closes her fingers around the dagger's hilt and drags it toward her, rolls her weight onto her knees, drives her right palm flat against the planks and pushes up into a crouch, her red sleeves swinging forward, the gold armbands flashing as they catch a bar of moonlight, her ponytail whipping over her shoulder as she snaps her head toward the rumble. The camera pulls out at slow speed, keeping her in the lower third of the frame as the collapse widens above her. The shot ends with her rising from the crouch, one foot braced forward, the dagger held low at her hip, dust drifting past her face. " +
  "[Shot 3] At 00:04.500, Hard cut to a tracking shot in front of her at chest height, the camera moving backward at her running speed, framing <Subject 1> in the middle of the corridor as she sprints toward the camera with long uneven strides, her injured side tightening each time her foot lands, the dagger gripped in her right hand, her skirt panels and blue sash whipping behind her, her ponytail streaming. Behind her the shelves collapse in sequence a few meters back, a rolling wall of dust and tumbling books chasing her down the corridor, planks splintering and shards flying past her shoulders. Bars of moonlight strobe across her face as she passes under each slat, her eyes wide, her teeth set, her breath short and visible in the cold air. The shot ends as she reaches one stride from the camera and the dust wall swallows the far end of the corridor behind her. " +
  "[Shot 4] At 00:06.000, Hard cut to a medium shot at floor level at the end of the corridor, where <Subject 1> bursts out of the dust cloud and her sandals skid across the planks, her free hand brushing the floor as she slows, until she stops and turns in place to face the wreckage, the dagger lowered in her right hand. Grey dust coats her red sleeves and gold armbands, a loose strand of hair clings to her cheek, her chest heaves, and her eyes follow the last books tumbling and settling. The dust cloud rolls past her and thins into slow drifting motes in the moonlight; one scroll unrolls across the planks and comes to rest at her feet. The shot ends with her motionless breathing hard, the dagger at her side and the toppled shelves lying still behind her.";

// ---------------------------------------------------------------- C : même contenu que B, regroupé en 2 plans (les actions très rapprochées et très détaillées dans un seul plan)
const C_SHOTS =
  `${OUVERTURE} ` +
  "[Shot 1] A wide low-angle shot from floor level looks down the full length of a narrow wooden archive corridor, towering shelves of dark timber crowding both walls and converging toward a black far end, thin pale bars of moonlight falling through the slats across the plank floor; the camera is locked while <Subject 1>, Maya, sits against the right-hand shelving in the pose of <Picture 1>, legs folded to one side, shoulders slumped, head bowed so the ponytail hangs forward, her right hand open on the planks beside the dagger, her chest rising in slow shallow breaths. A deep wooden crack rolls up from the far end and a thread of dust trickles onto her hair. Her eyes open, her head lifts toward the sound, her jaw tightens, her lips part as her breath catches, and her fingers close around the dagger's hilt just as the last shelf at the far end lurches off its vertical, its top row of books sliding out, and tips into the next shelf, which gives way in turn, and the next, a chain of tall shelves falling toward her one after another, each impact throwing up a burst of dust and splinters while scrolls flutter out. Now the camera pulls out at slow speed as she drags the dagger toward her, rolls her weight onto her knees, drives her right palm flat against the planks and pushes up into a crouch, her red sleeves swinging forward, her gold armbands flashing in a bar of moonlight, her ponytail whipping over her shoulder as she snaps her head toward the rumble, then rises with one foot braced forward and the dagger held low at her hip, dust drifting past her face. " +
  "[Shot 2] At 00:04.500, Hard cut to a tracking shot in front of her at chest height, the camera moving backward at her running speed, as <Subject 1> sprints down the middle of the corridor toward the camera with long uneven strides, her injured side tightening each time her foot lands, the dagger gripped in her right hand, her skirt panels and blue sash whipping behind her, her ponytail streaming. Behind her the shelves collapse in sequence a few meters back, a rolling wall of dust and tumbling books chasing her down the corridor, planks splintering and shards flying past her shoulders, bars of moonlight strobing across her face as she passes under each slat, her eyes wide, her teeth set, her breath short and visible in the cold air. She bursts out of the dust cloud and her sandals skid across the planks, her free hand brushing the floor as she slows, until she stops and turns in place to face the wreckage, the camera easing to a halt in front of her. Grey dust coats her red sleeves and gold armbands, a loose strand of hair clings to her cheek, her chest heaves, and her eyes follow the last books tumbling and settling. The dust cloud thins into slow drifting motes in the moonlight; one scroll unrolls across the planks and comes to rest at her feet. The shot ends with her motionless breathing hard, the dagger lowered at her side and the toppled shelves lying still behind her.";

const VARIANTES = [
  {
    titre: "A — Référence (4 plans, règles actuelles)",
    notes: "Variante A : ce que produisent nos règles actuelles. 4 plans (cuts à 0, 2,5, 4,5 et 6 s), descriptions de densité normale. Sert de base de comparaison.",
    shots: A_SHOTS,
    apparait: "[Shot 1], [Shot 2], [Shot 3], [Shot 4]",
  },
  {
    titre: "B — Optimisé (même découpage)",
    notes: "Variante B : même histoire et mêmes cuts que A, mais chaque plan suit la grille dense (état initial, déclencheur, chaîne d'action, retour physique, caméra liée à l'action, état final, son synchronisé, micro-actions).",
    shots: B_SHOTS,
    apparait: "[Shot 1], [Shot 2], [Shot 3], [Shot 4]",
  },
  {
    titre: "C — Optimisé dense (2 plans)",
    notes: "Variante C : même contenu que B regroupé en 2 plans (cut à 4,5 s). Teste l'hypothèse de Singularity : actions très rapprochées et très détaillées dans un seul plan.",
    shots: C_SHOTS,
    apparait: "[Shot 1], [Shot 2]",
  },
];

// ---------------------------------------------------------------- insertion
const existe = await db.select({ id: projects.id }).from(projects).where(eq(projects.nom, NOM));
if (existe.length) throw new Error(`Le projet « ${NOM} » existe déjà (id ${existe[0]!.id}) — rien n'a été écrit.`);

const source = resolve(RACINE, "data/assets/CHAR_maya.png");
const cible = resolve(RACINE, "data/assets/AB_CHAR_maya.png");
if (!existsSync(source)) throw new Error("data/assets/CHAR_maya.png introuvable");
copyFileSync(source, cible);

const resultat = await db.transaction(async (tx) => {
  const [projet] = await tx.insert(projects).values({ nom: NOM, type: "oneshot" }).returning();
  const [saison] = await tx.insert(seasons).values({ projectId: projet!.id, numero: 1, titre: "Saison 1" }).returning();
  const [episode] = await tx
    .insert(episodes)
    .values({ seasonId: saison!.id, numero: 1, titre: "L'étagère", resume: "Maya, blessée dans un couloir d'archives, fuit l'effondrement en chaîne des étagères. Un seul contenu, trois façons de l'écrire." })
    .returning();
  await tx.insert(briefs).values({
    projectId: projet!.id,
    statut: "partiel",
    source: "reconstitue",
    contenu: { ...briefVide(NOM), style: { nom: "", clause: CLAUSE } },
    statuts: { style: "fourni" },
  });
  const [scene] = await tx
    .insert(scenes)
    .values({ episodeId: episode!.id, ordre: 0, titre: "L'étagère", fonction: "Banc de mesure : même scène, trois écritures.", genre: "action", ambiance: "Nuit, clair de lune indigo filtrant entre les lattes, poussière en suspension, lumière constante." })
    .returning();
  const [maya] = await tx
    .insert(assets)
    .values({
      projectId: projet!.id,
      code: "CHAR_maya",
      type: "personnage",
      statut: "valide",
      fichier: "AB_CHAR_maya.png",
      fichierAt: new Date(),
      description:
        "Jeune femme brune, longue queue de cheval nouée d'un lien rouge, yeux rouges, pendants d'oreilles dorés ; haut croisé rouge orné d'or et de rubis, manches bouffantes rouges, brassards dorés, ceinture dorée sur un pantalon ample rouge bordé d'or, écharpe bleue, sandales dorées ; légère ecchymose sur la joue. Image de référence : assise contre une étagère, dans un couloir de bois bleu nuit, un poignard à côté d'elle.",
    })
    .returning();

  const lesPlans: { id: number; uuid: string; titre: string }[] = [];
  for (const [i, v] of VARIANTES.entries()) {
    const [plan] = await tx
      .insert(plans)
      .values({
        projectId: projet!.id,
        episodeId: episode!.id,
        sceneId: scene!.id,
        ordre: i,
        titre: v.titre,
        description: "Maya, blessée, assise au fond d'un couloir d'archives : une étagère s'effondre sur la suivante, en chaîne, vers elle. Elle saisit son poignard, se relève, court devant l'effondrement et s'arrête au bout du couloir, essoufflée et couverte de poussière.",
        dureeMontageSecondes: 8,
        dureeGenerationSecondes: 8,
        fps: 24,
        seed: SEED,
        statut: "en_attente",
        notes: v.notes,
      })
      .returning();
    await tx.insert(planRefs).values({ planId: plan!.id, type: "picture", slot: 1, assetId: maya!.id, role: "Maya — identité, costume et décor du couloir" });
    await tx.insert(planPromptSections).values([
      { planId: plan!.id, section: "subject_definitions", ordre: 1, contenu: SUBJECT_DEFINITIONS },
      { planId: plan!.id, section: "summary", ordre: 2, contenu: SUMMARY },
      { planId: plan!.id, section: "retention_analysis", ordre: 3, contenu: retention(v.apparait) },
      { planId: plan!.id, section: "detailed_description", ordre: 4, contenu: v.shots },
      { planId: plan!.id, section: "overall_soundscape", ordre: 5, contenu: SOUNDSCAPE },
      { planId: plan!.id, section: "non_diegetic_music", ordre: 6, contenu: MUSIC },
    ]);
    lesPlans.push({ id: plan!.id, uuid: plan!.uuid, titre: v.titre });
  }
  return { projectId: projet!.id, episodeId: episode!.id, plans: lesPlans };
});

await synchroniserClauseStyle(db, resultat.projectId);

const mots = (t: string) => t.split(/\s+/).length;
console.log(JSON.stringify({ ...resultat, motsShots: { A: mots(A_SHOTS), B: mots(B_SHOTS), C: mots(C_SHOTS) } }, null, 2));
process.exit(0);
