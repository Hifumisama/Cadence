// Banc de gestes : un geste de combat par plan de 5 s, écrit de trois façons, pour savoir quels noms de coups le
// modèle comprend seul (lexique de gestes, comme le lexique de caméra) et lesquels demandent une description.
//   N = le nom du geste dans sa langue d'origine, seul ; E = son nom courant en anglais ; G = le nom + une description
//   du mouvement (appuis, membre, trajectoire). Tout le reste est identique (images, seed, réaction de l'adversaire).
//   npx tsx --env-file=.env scripts/ab-gestes.mts --projet "<nom du projet>" --modele "<titre d'un plan à trois images>"
// Le plan modèle fournit épisode, scène, seed et ses références de slots 1 à 3 : 1 = la combattante, 2 = l'adversaire,
// 3 = le décor (comme dans les plans E à M du banc). Refuse de recréer ce qui existe déjà.
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { planPromptSections, planRefs, plans, projects } from "../db/schema";

const arg = (nom: string) => { const i = process.argv.indexOf(`--${nom}`); return i > 0 ? process.argv[i + 1] : undefined; };
const nomProjet = arg("projet");
const titreModele = arg("modele");
if (!nomProjet || !titreModele) throw new Error('Usage : --projet "<nom>" --modele "<titre du plan modèle>"');

type Geste = { code: string; nom: string; nomEn: string; description: string };
const GESTES: Geste[] = [
  { code: "G1", nom: "mawashi geri", nomEn: "roundhouse kick", description: "she pivots on her standing foot, her hips turn, and her rear leg whips round in a flat arc to the head" },
  { code: "G2", nom: "ushiro mawashi geri", nomEn: "spinning heel kick", description: "she spins fully on her standing foot, her back to the Tenancière for a beat, and her heel sweeps in a wide arc to the head" },
  { code: "G3", nom: "estocade glissée", nomEn: "sliding lunge thrust", description: "her front foot slides forward along the floor, her back leg stretches out behind, and her dagger arm drives straight to the chest in one line" },
  { code: "G4", nom: "ashi barai", nomEn: "low leg sweep", description: "she drops to a crouch and her rear leg sweeps flat along the floor at the ankles" },
  { code: "G5", nom: "shotei", nomEn: "palm-heel strike", description: "she steps in and her open hand drives from the hip, the heel of the palm to the sternum" },
  { code: "G6", nom: "seoi nage", nomEn: "shoulder throw", description: "she turns her back into the Tenancière, grips her sleeve, bends forward, and the Tenancière flips over her shoulder" },
];

// Phrase du geste selon la variante. La réaction de l'adversaire est la même partout.
const REACTION = "the Tenancière takes it on her forearm in a spray of sparks and a ring of dust";
const phrase = (g: Geste, v: "N" | "E" | "G") =>
  v === "N" ? `Maya attacks with a ${g.nom}; ${REACTION}.`
  : v === "E" ? `Maya attacks with a ${g.nomEn}; ${REACTION}.`
  : `Maya attacks with a ${g.nom}: ${g.description}; ${REACTION}.`;

const SUBJECT_DEFINITIONS =
  "<Subject 1> is Maya from <Picture 1> (face, hair, body and wardrobe only; ignore its background and extra views): red eyes, a long dark ponytail with a red band, a red wrap top with a gold corset, puffed red sleeves, gold armbands, wide red trousers, a blue sash.\n" +
  "<Subject 2> is the Tenancière from <Picture 2> (face, hair, body and gown only): a tall imposing woman in a midnight-blue silver-patterned gown, silver-streaked black hair in a low knot.\n" +
  "<Subject 3> is the inn corridor from <Picture 3> (architecture and indigo light only; no people).";
const SUMMARY = "[reference generation] The target video shows <Subject 1> attacking <Subject 2> with a single martial move in <Subject 3>.";
const RETENTION =
  "<Subject 1> (appears in [Shot 1]): fully_preserved - costume and ponytail kept.\n" +
  "<Subject 2> (appears in [Shot 1]): fully_preserved - gown and bearing kept.\n" +
  "<Subject 3> (appears in [Shot 1]): fully_preserved - corridor kept.";
const SOUNDSCAPE = "Heels on timber, a sharp exhale, a heavy thud on contact.";
const MUSIC = "Low strings and one taiko hit on contact.";
const description = (g: Geste, v: "N" | "E" | "G") =>
  "Cinematic anime illustration, atmospheric depth. Night, an inn corridor in constant deep indigo light. Maya is always on the left of the frame facing right, the Tenancière on the right facing left. " +
  `[Shot 1] A medium side-on two-shot, the camera locked: <Subject 1>, Maya, stands in a low stance on the left while <Subject 2>, the Tenancière, waits on the right in <Subject 3>. ${phrase(g, v)} ` +
  "Exactly two fighters; no identity drift or left-right reversal; no text.";

const [projet] = await db.select().from(projects).where(eq(projects.nom, nomProjet));
if (!projet) throw new Error(`Projet introuvable : ${nomProjet}`);
const [modele] = await db.select().from(plans).where(and(eq(plans.projectId, projet.id), eq(plans.titre, titreModele)));
if (!modele) throw new Error(`Plan modèle introuvable : ${titreModele}`);
const refs = (await db.select().from(planRefs).where(eq(planRefs.planId, modele.id))).filter((r) => r.slot != null && r.slot <= 3);
if (refs.length !== 3) throw new Error(`Le plan modèle doit avoir trois références aux slots 1 à 3 (trouvé : ${refs.length}).`);
const existants = await db.select({ titre: plans.titre, ordre: plans.ordre }).from(plans).where(eq(plans.projectId, projet.id));
if (existants.some((p) => /^G[1-6][NEG] /.test(p.titre))) throw new Error("Les plans de gestes existent déjà — rien n'a été écrit.");
let ordre = Math.max(0, ...existants.map((p) => p.ordre)) + 1;

const creations: { titre: string; uuid: string; caracteres: number }[] = [];
await db.transaction(async (tx) => {
  for (const g of GESTES) for (const v of ["N", "E", "G"] as const) {
    const desc = description(g, v);
    const titre = `${g.code}${v} — ${g.nom} (${v === "N" ? "nom seul" : v === "E" ? "nom anglais" : "nom + description"})`;
    const [p] = await tx.insert(plans).values({
      projectId: projet.id, episodeId: modele.episodeId, sceneId: modele.sceneId, ordre: ordre++, titre,
      description: modele.description, dureeMontageSecondes: 5, dureeGenerationSecondes: 5, fps: 24, seed: modele.seed, statut: "en_attente",
      notes: `Banc de gestes, ${g.nom} / ${g.nomEn}. Variante ${v} : ${v === "N" ? "le nom dans sa langue, seul" : v === "E" ? "le nom courant en anglais" : "le nom et la description du mouvement"}. Même seed, mêmes images, même réaction de l'adversaire dans les trois variantes.`,
    }).returning();
    await tx.insert(planRefs).values(refs.map((x) => ({ planId: p!.id, type: x.type, slot: x.slot, assetId: x.assetId, role: x.role, retention: x.retention })));
    const sections = [SUBJECT_DEFINITIONS, SUMMARY, RETENTION, desc, SOUNDSCAPE, MUSIC];
    const noms = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"] as const;
    await tx.insert(planPromptSections).values(sections.map((contenu, i) => ({ planId: p!.id, section: noms[i]!, ordre: i + 1, contenu })));
    creations.push({ titre, uuid: p!.uuid, caracteres: sections.join("").length });
  }
});
for (const c of creations) console.log(`${c.titre} — ${c.caracteres} caractères — ${c.uuid}`);
process.exit(0);
