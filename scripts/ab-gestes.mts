// Banc de gestes : un geste de combat par plan de 5 s, écrit de trois façons, pour savoir quels noms de coups le
// modèle comprend seul (lexique de gestes, comme le lexique de caméra) et lesquels demandent une description.
//   N = le nom du geste dans sa langue d'origine, seul ; E = son nom courant en anglais ; G = le nom + une description
//   du mouvement (appuis, membre, trajectoire). Tout le reste est identique (images, seed, réaction de l'adversaire).
//   npx tsx --env-file=.env scripts/ab-gestes.mts
// Crée son propre projet de test : la maîtresse du feu contre le maître de la terre, décor neutre, avec les trois assets
// d'« Avatar, Intro » (mêmes fichiers d'image, lignes d'asset propres au projet). Aucun effet : on isole le geste.
// Refuse de recréer ce qui existe déjà.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assets, episodes, planPromptSections, planRefs, plans, projects, seasons } from "../db/schema";

const NOM_PROJET = "Banc de gestes — feu contre terre";
const NOM_SOURCE = "Avatar, Intro";
const SEED = 424242424242;
// (code d'asset source, slot) : 1 = combattante, 2 = adversaire, 3 = décor.
const ASSETS_SOURCE = [["CHAR_maitre_du_feu", 1], ["CHAR_maitre_de_la_terre", 2], ["DEC_decor_neutre", 3]] as const;

type Geste = { code: string; nom: string; nomEn: string; description: string };
const GESTES: Geste[] = [
  { code: "G1", nom: "mawashi geri", nomEn: "roundhouse kick", description: "she pivots on her standing foot, her hips turn, and her rear leg whips round in a flat arc to the head" },
  { code: "G2", nom: "ushiro mawashi geri", nomEn: "spinning heel kick", description: "she spins fully on her standing foot, her back to the earth master for a beat, and her heel sweeps in a wide arc to the head" },
  { code: "G3", nom: "oi zuki", nomEn: "lunge punch", description: "her front foot slides forward along the floor, her back leg stretches out behind, and her fist drives straight to the chest in one line" },
  { code: "G4", nom: "ashi barai", nomEn: "low leg sweep", description: "she drops to a crouch and her rear leg sweeps flat along the floor at the ankles" },
  { code: "G5", nom: "shotei", nomEn: "palm-heel strike", description: "she steps in and her open hand drives from the hip, the heel of the palm to the sternum" },
  { code: "G6", nom: "seoi nage", nomEn: "shoulder throw", description: "she turns her back into the earth master, grips his sleeve, bends forward, and he flips over her shoulder" },
];

// Phrase du geste selon la variante. La réaction de l'adversaire est la même partout.
const REACTION = "the earth master takes it on his raised forearm and slides back half a step";
const phrase = (g: Geste, v: "N" | "E" | "G") =>
  v === "N" ? `The fire master attacks with a ${g.nom}; ${REACTION}.`
  : v === "E" ? `The fire master attacks with a ${g.nomEn}; ${REACTION}.`
  : `The fire master attacks with a ${g.nom}: ${g.description}; ${REACTION}.`;

const SUBJECT_DEFINITIONS =
  "<Subject 1> is the fire master from <Picture 1> (face, hair, body and wardrobe only; ignore its background and extra views): a young woman with dark brown eyes, long black hair in a high ponytail with a red band, a red wrap tunic with gold trim and dark patterned cuffs, a dark red sash, wide dark red trousers, dark boots.\n" +
  "<Subject 2> is the earth master from <Picture 2> (face, hair, body and clothes only; ignore its background and extra views): a very muscular man with wavy brown hair, a worn brown tunic with a laced collar and rolled sleeves, a leather belt, brown trousers and leather boots.\n" +
  "<Subject 3> is the neutral stage from <Picture 3> (architecture and dusk light only; no people).";
const SUMMARY = "[reference generation] The target video shows <Subject 1> attacking <Subject 2> with a single martial move on <Subject 3>.";
const RETENTION =
  "<Subject 1> (appears in [Shot 1]): fully_preserved - tunic and ponytail kept.\n" +
  "<Subject 2> (appears in [Shot 1]): fully_preserved - tunic and build kept.\n" +
  "<Subject 3> (appears in [Shot 1]): fully_preserved - stage kept.";
const SOUNDSCAPE = "Boots on the ground, a sharp exhale, a heavy thud on contact.";
const MUSIC = "Low strings and one taiko hit on contact.";
const description = (g: Geste, v: "N" | "E" | "G") =>
  "Cinematic 3D feature-animation look, soft warm dusk light. The fire master is always on the left of the frame facing right, the earth master on the right facing left. " +
  `[Shot 1] A medium side-on two-shot, the camera locked: <Subject 1>, the fire master, stands in a low stance on the left while <Subject 2>, the earth master, waits with his arms loose on the right, on <Subject 3>. ${phrase(g, v)} ` +
  "Exactly two fighters; no identity drift or left-right reversal; no text.";

if ((await db.select({ id: projects.id }).from(projects).where(eq(projects.nom, NOM_PROJET))).length) throw new Error("Le projet de gestes existe déjà — rien n'a été écrit.");
const [source] = await db.select().from(projects).where(eq(projects.nom, NOM_SOURCE));
if (!source) throw new Error(`Projet source introuvable : ${NOM_SOURCE}`);
const lignes = await db.select().from(assets).where(eq(assets.projectId, source.id));
const sources = ASSETS_SOURCE.map(([code, slot]) => ({ slot, a: lignes.find((x) => x.code === code) }));
for (const x of sources) if (!x.a?.fichier) throw new Error(`Asset source sans image : ${x.a?.code ?? "introuvable"}`);

const creations: { titre: string; uuid: string; caracteres: number }[] = [];
const projetId = await db.transaction(async (tx) => {
  const [projet] = await tx.insert(projects).values({
    nom: NOM_PROJET, type: "oneshot", clauseStyle: source.clauseStyle, stylePromptImage: source.stylePromptImage,
    notes: "Projet de test : banc de gestes (scripts/ab-gestes.mts). Les images sont celles d'« Avatar, Intro » (mêmes fichiers). À supprimer quand on n'en a plus besoin.",
  }).returning();
  const [saison] = await tx.insert(seasons).values({ projectId: projet!.id, numero: 1, titre: "Banc" }).returning();
  const [episode] = await tx.insert(episodes).values({ seasonId: saison!.id, numero: 1, titre: "Gestes" }).returning();
  const refs: { slot: number; assetId: number }[] = [];
  for (const { slot, a } of sources) {
    const [n] = await tx.insert(assets).values({
      projectId: projet!.id, code: a!.code, type: a!.type, statut: a!.statut, description: a!.description,
      promptGeneration: a!.promptGeneration, fichier: a!.fichier, fichierAt: a!.fichierAt,
    }).returning();
    refs.push({ slot, assetId: n!.id });
  }
  let ordre = 1;
  for (const g of GESTES) for (const v of ["N", "E", "G"] as const) {
    const libelle = v === "N" ? "nom seul" : v === "E" ? "nom anglais" : "nom + description";
    const titre = `${g.code}${v} — ${g.nom} (${libelle})`;
    const [p] = await tx.insert(plans).values({
      projectId: projet!.id, episodeId: episode!.id, ordre: ordre++, titre, description: `Geste : ${g.nom} (${g.nomEn}).`,
      dureeMontageSecondes: 5, dureeGenerationSecondes: 5, fps: 24, seed: SEED, statut: "en_attente",
      notes: `Banc de gestes, ${g.nom} / ${g.nomEn}. Variante ${v} : ${libelle}. Même seed, mêmes images, même réaction de l'adversaire dans les trois variantes.`,
    }).returning();
    await tx.insert(planRefs).values(refs.map((x) => ({ planId: p!.id, type: "picture" as const, slot: x.slot, assetId: x.assetId })));
    const contenus = [SUBJECT_DEFINITIONS, SUMMARY, RETENTION, description(g, v), SOUNDSCAPE, MUSIC];
    const noms = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"] as const;
    await tx.insert(planPromptSections).values(contenus.map((contenu, i) => ({ planId: p!.id, section: noms[i]!, ordre: i + 1, contenu })));
    creations.push({ titre, uuid: p!.uuid, caracteres: contenus.join("").length });
  }
  return projet!.id;
});
for (const c of creations) console.log(`${c.titre} — ${c.caracteres} caractères — ${c.uuid}`);
console.log(`Projet « ${NOM_PROJET} » : id ${projetId}`);
process.exit(0);
