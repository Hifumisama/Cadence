// Banc de chorégraphie, variante E : CB (4 plans, chaîne de cause à effet) avec, à l'intérieur des plans, les mouvements de caméra
// et les détails de matière qui rendaient CC spectaculaire, sans ajouter de coupes. Les coupes tombent avant ou après un contact,
// jamais dessus, et les deux combattants restent dans le cadre. Répond à CD, dont les 7 jonctions ne se raccordaient pas.
//   npx tsx --env-file=.env scripts/ab-choregraphie-e.mts
import { eq } from "drizzle-orm";
import { db } from "../db";
import { planPromptSections, planRefs, plans, projects } from "../db/schema";

const NOM_PROJET = "Banc de gestes — feu contre terre";
const TITRE = "CE — Combat chaîné, caméra mobile dans 4 plans (15 s)";

const DESCRIPTION =
  "Cinematic 3D feature-animation look, soft warm dusk light. The fire master is always on the left of the frame facing right, the earth master on the right facing left. " +
  "[Shot 1] A wide side-on shot, the camera locked: <Subject 1>, the fire master, crouches in a low stance on the left while <Subject 2>, the earth master, stands heavy with his arms loose on the right, on <Subject 3>. Her front foot slides forward along the floor, her back leg stretched out behind, and her fist drives straight at his chest; he crosses both forearms and the blow shoves him back one full step, his boots scraping the stone. He answers at once with a flat palm to her shoulder that spins her away two steps to the left, where she lands in a low stance again, facing him. " +
  "[Shot 2] At 00:04.000, the shot cuts to a low-angle two-shot at hip height, both fighters in frame, the camera tracking slowly to the right: he steps in and swings a hammer fist down at her head; she drops to a crouch beneath it and sweeps her rear leg flat along the floor at his ankles; he lifts his front foot over the sweep, and his fist, finding nothing, slams into the stone where she stood, cracking it and throwing up a jagged spray of grey dust and stone fragments. The camera pushes in on the cracked floor as she rolls away to the left and ends crouched three steps from him. " +
  "[Shot 3] At 00:07.500, the shot cuts to a medium two-shot, both fighters in frame: from the crouch she springs up and spins fully on her standing foot, her back to him for a beat, her heel sweeping a wide arc into his jaw; the camera pushes in on his face as his head snaps sharply to the right, dust swirling around him, and he staggers back two steps, one hand brushing the floor, while she lands in a low stance. " +
  "[Shot 4] At 00:11.000, the shot cuts to a wide side-on shot: he lowers his shoulder and charges; she steps inside the charge, turns her back into him, grips his sleeve and bends forward, and he is lifted off his feet, flips over her shoulder and lands flat on his back, the floor shaking in a ring of dust. The camera drops low as she straightens over him, breathing hard, and the frame holds. " +
  "Exactly two fighters; no identity drift or left-right reversal; no text.";

const [projet] = await db.select().from(projects).where(eq(projects.nom, NOM_PROJET));
if (!projet) throw new Error(`Projet introuvable : ${NOM_PROJET}`);
const tous = await db.select().from(plans).where(eq(plans.projectId, projet.id));
if (tous.some((p) => p.titre === TITRE)) throw new Error("CE existe déjà — rien n'a été écrit.");
const cb = tous.find((p) => p.titre.startsWith("CB "));
if (!cb) throw new Error("CB introuvable (lancer d'abord ab-choregraphie.mts)");
const refs = await db.select().from(planRefs).where(eq(planRefs.planId, cb.id));
const sections = await db.select().from(planPromptSections).where(eq(planPromptSections.planId, cb.id));
const r = await db.transaction(async (tx) => {
  const [p] = await tx.insert(plans).values({
    projectId: projet.id, episodeId: cb.episodeId, sceneId: cb.sceneId, ordre: Math.max(...tous.map((x) => x.ordre)) + 1, titre: TITRE,
    description: cb.description, dureeMontageSecondes: 15, dureeGenerationSecondes: 15, fps: 24, seed: cb.seed, statut: "en_attente",
    notes: "Chorégraphie, variante E : CB avec des mouvements de caméra et des détails de matière à l'intérieur des plans, sans coupe de plus. Les coupes tombent avant ou après un contact, les deux combattants restent dans le cadre.",
  }).returning();
  await tx.insert(planRefs).values(refs.map((x) => ({ planId: p!.id, type: x.type, slot: x.slot, assetId: x.assetId, role: x.role, retention: x.retention })));
  await tx.insert(planPromptSections).values(sections.map((s) => ({ planId: p!.id, section: s.section, ordre: s.ordre, contenu: s.section === "detailed_description" ? DESCRIPTION : s.contenu })));
  return { uuid: p!.uuid, caracteres: sections.map((s) => (s.section === "detailed_description" ? DESCRIPTION : s.contenu)).join("").length };
});
console.log(JSON.stringify(r));
process.exit(0);
