// Banc de chorégraphie : le même combat de 15 s (feu contre terre, à mains nues, 4 plans) écrit de deux façons à la main,
// pour savoir si le LIEN DE CAUSE À EFFET entre les coups fait la qualité de la scène, plus un plan-cible à écrire par l'agent.
//   CA = les mêmes coups, décrits mécaniquement, mais sans lien : réaction générique, aucune position d'arrivée.
//   CB = les mêmes coups, chaînés : chaque réaction est la conséquence du coup, chaque plan part de là où le précédent a laissé
//        les deux combattants.
//   AG = plan sans prompt, avec une description narrative, pour l'agent plan-h3 (`npm run plan-h3:essai`, puis ab-poser-agent).
//   npx tsx --env-file=.env scripts/ab-choregraphie.mts
// Travaille dans le projet « Banc de gestes — feu contre terre » (créé par ab-gestes.mts) : mêmes assets, même seed.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assets, briefs, planPromptSections, planRefs, plans, projects, scenes } from "../db/schema";
import { briefVide } from "../lib/agents/brief";

const NOM_PROJET = "Banc de gestes — feu contre terre";
const SEED = 424242424242;
const ASSETS = [["CHAR_maitre_du_feu", 1], ["CHAR_maitre_de_la_terre", 2], ["DEC_decor_neutre", 3]] as const;

const SUBJECT_DEFINITIONS =
  "<Subject 1> is the fire master from <Picture 1> (face, hair, body and wardrobe only; ignore its background and extra views): a young woman with dark brown eyes, long black hair in a high ponytail with a red band, a red wrap tunic with gold trim and dark patterned cuffs, a dark red sash, wide dark red trousers, dark boots.\n" +
  "<Subject 2> is the earth master from <Picture 2> (face, hair, body and clothes only; ignore its background and extra views): a very muscular man with wavy brown hair, a worn brown tunic with a laced collar and rolled sleeves, a leather belt, brown trousers and leather boots.\n" +
  "<Subject 3> is the neutral stage from <Picture 3> (architecture and dusk light only; no people).";
const SUMMARY = "[reference generation] The target video shows <Subject 1> and <Subject 2> fighting bare-handed on <Subject 3>, ending with <Subject 1> throwing <Subject 2> to the ground.";
const RETENTION =
  "<Subject 1> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - tunic and ponytail kept.\n" +
  "<Subject 2> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - tunic and build kept.\n" +
  "<Subject 3> (appears in [Shot 1], [Shot 2], [Shot 3], [Shot 4]): fully_preserved - stage kept.";
const SOUNDSCAPE = "Boots scraping on stone, sharp exhales, heavy thuds on each contact, a crack of stone, a deep thump as he lands.";
const MUSIC = "Low strings, a taiko hit on each exchange, silence on the throw.";
const OUVERTURE =
  "Cinematic 3D feature-animation look, soft warm dusk light. The fire master is always on the left of the frame facing right, the earth master on the right facing left. ";
const FIN = " Exactly two fighters; no identity drift or left-right reversal; no text.";

// CB : chaîné. Chaque réaction suit le coup ; chaque plan reprend là où le précédent a laissé les deux.
const CB =
  OUVERTURE +
  "[Shot 1] A wide side-on shot, the camera locked: <Subject 1>, the fire master, crouches in a low stance on the left while <Subject 2>, the earth master, stands heavy with his arms loose on the right, on <Subject 3>. Her front foot slides forward along the floor, her back leg stretched out behind, and her fist drives straight at his chest; he crosses both forearms and the blow shoves him back one full step, his boots scraping the stone. He answers at once with a flat palm to her shoulder that spins her away two steps to the left, where she lands in a low stance again, facing him. " +
  "[Shot 2] At 00:04.000, the shot cuts to a low-angle two-shot at hip height, the camera tracking slightly to the right: he steps in and swings a hammer fist down at her head; she drops to a crouch beneath it and sweeps her rear leg flat along the floor at his ankles; he lifts his front foot over the sweep, and his fist, finding nothing, slams into the floor where she stood, cracking the stone and throwing up a ring of dust. She rolls away to the left and ends crouched three steps from him. " +
  "[Shot 3] At 00:08.000, the shot cuts to a medium two-shot: from the crouch she springs up and spins fully on her standing foot, her back to him for a beat, her heel sweeping a wide arc into his jaw; his head snaps to the right and he staggers back two steps, one hand brushing the floor, while she lands in a low stance and the dust drifts between them. " +
  "[Shot 4] At 00:12.000, the shot cuts to a wide side-on shot: he lowers his shoulder and charges; she steps inside the charge, turns her back into him, grips his sleeve and bends forward, and he flips over her shoulder and lands flat on his back, the floor shaking in a ring of dust. She straightens over him, breathing hard, and the frame holds." +
  FIN;

// CA : les mêmes coups, la même mécanique, sans lien. Réactions génériques, aucune position d'arrivée.
const CA =
  OUVERTURE +
  "[Shot 1] A wide side-on shot, the camera locked: <Subject 1>, the fire master, crouches in a low stance on the left while <Subject 2>, the earth master, stands heavy with his arms loose on the right, on <Subject 3>. Her front foot slides forward along the floor, her back leg stretched out behind, and her fist drives straight at his chest; he blocks it. He strikes back with a flat palm. " +
  "[Shot 2] At 00:04.000, the shot cuts to a low-angle two-shot at hip height, the camera tracking slightly to the right: he swings a hammer fist down; she drops to a crouch and sweeps her rear leg flat along the floor at his ankles; his fist hits the floor with a ring of dust. " +
  "[Shot 3] At 00:08.000, the shot cuts to a medium two-shot: she spins fully on her standing foot, her back to him for a beat, her heel sweeping a wide arc to his jaw; he takes the hit. " +
  "[Shot 4] At 00:12.000, the shot cuts to a wide side-on shot: he charges; she turns her back into him, grips his sleeve and bends forward, and he is thrown to the ground in a ring of dust." +
  FIN;

const DESCRIPTION_AGENT =
  "Le maître du feu et le maître de la terre s'affrontent à mains nues. Elle attaque d'un coup de poing glissé, qu'il encaisse avant de la repousser. Il abat son poing sur elle, elle se baisse et le fauche, il lève le pied et son poing fend le sol. Elle se relève d'un coup de talon retourné à la mâchoire. Il charge, elle le projette par-dessus son épaule.";

const [projet] = await db.select().from(projects).where(eq(projects.nom, NOM_PROJET));
if (!projet) throw new Error(`Projet introuvable : ${NOM_PROJET} (lancer d'abord scripts/ab-gestes.mts)`);
const deja = await db.select({ titre: plans.titre, ordre: plans.ordre, episodeId: plans.episodeId }).from(plans).where(eq(plans.projectId, projet.id));
if (deja.some((p) => /^(CA|CB|AG) /.test(p.titre))) throw new Error("Les plans de chorégraphie existent déjà — rien n'a été écrit.");
const lignes = await db.select().from(assets).where(eq(assets.projectId, projet.id));
const idDe = (c: string) => lignes.find((a) => a.code === c)!.id;
const episodeId = deja[0]!.episodeId;
let ordre = Math.max(0, ...deja.map((p) => p.ordre)) + 1;
const [dejaBrief] = await db.select({ id: briefs.id }).from(briefs).where(eq(briefs.projectId, projet.id));

const sortie = await db.transaction(async (tx) => {
  if (!dejaBrief) await tx.insert(briefs).values({ projectId: projet.id, statut: "partiel", source: "reconstitue", contenu: { ...briefVide(NOM_PROJET), style: { nom: "", clause: projet.clauseStyle } }, statuts: { style: "fourni" } });
  const [scene] = await tx.insert(scenes).values({ episodeId, ordre: 0, titre: "Le duel", genre: "action", ambiance: "Crépuscule doux, lumière chaude et basse, décor neutre.", fonction: "Combat de 15 s à mains nues." }).returning();
  const res: { titre: string; uuid: string; caracteres?: number }[] = [];
  const poser = async (titre: string, description: string, prompt: string | null, notes: string) => {
    const [p] = await tx.insert(plans).values({ projectId: projet.id, episodeId, sceneId: scene!.id, ordre: ordre++, titre, description, dureeMontageSecondes: 15, dureeGenerationSecondes: 15, fps: 24, seed: SEED, statut: "en_attente", notes }).returning();
    if (prompt != null) {
      await tx.insert(planRefs).values(ASSETS.map(([c, slot]) => ({ planId: p!.id, type: "picture" as const, slot, assetId: idDe(c) })));
      const contenus = [SUBJECT_DEFINITIONS, SUMMARY, RETENTION, prompt, SOUNDSCAPE, MUSIC];
      const noms = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"] as const;
      await tx.insert(planPromptSections).values(contenus.map((contenu, i) => ({ planId: p!.id, section: noms[i]!, ordre: i + 1, contenu })));
      res.push({ titre, uuid: p!.uuid, caracteres: contenus.join("").length });
    } else res.push({ titre, uuid: p!.uuid });
  };
  await poser("CA — Combat sans liens (15 s)", "Combat à mains nues, mêmes coups que CB sans lien de cause à effet.", CA, "Chorégraphie, variante A : mêmes coups et même mécanique que CB, mais réactions génériques et aucune position d'arrivée.");
  await poser("CB — Combat chaîné (15 s)", "Combat à mains nues, chaque réaction suit le coup, chaque plan reprend la position précédente.", CB, "Chorégraphie, variante B : chaque réaction est la conséquence du coup, chaque plan part de là où le précédent a laissé les deux combattants.");
  await poser("AG — Combat pour l'agent (15 s)", DESCRIPTION_AGENT, null, "Plan sans prompt, pour l'agent plan-h3.");
  return res;
});
for (const r of sortie) console.log(`${r.titre}${r.caracteres ? ` — ${r.caracteres} caractères` : ""} — ${r.uuid}`);
process.exit(0);
