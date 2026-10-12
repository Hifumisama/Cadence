// Banc de chorégraphie, variante D : la chaîne de cause à effet de CB (chaque réaction suit le coup, chaque plan reprend là où le
// précédent a laissé les deux), découpée en 8 plans de 1,5 à 2 s avec les angles variés de CC (l'agent). Sert à séparer ce qui
// vient du lien logique (CB) de ce qui vient du découpage et des angles (CC).
//   npx tsx --env-file=.env scripts/ab-choregraphie-d.mts
import { eq } from "drizzle-orm";
import { db } from "../db";
import { planPromptSections, planRefs, plans, projects } from "../db/schema";

const NOM_PROJET = "Banc de gestes — feu contre terre";
const TITRE = "CD — Combat chaîné en 8 plans (15 s)";

const DESCRIPTION =
  "Cinematic 3D feature-animation look, soft warm dusk light. The fire master is always on the left of the frame facing right, the earth master on the right facing left. " +
  "[Shot 1] A wide side-on shot, the camera locked: <Subject 1>, the fire master, crouches in a low stance on the left while <Subject 2>, the earth master, stands heavy with his arms loose on the right, on <Subject 3>. Her front foot slides forward along the floor, her back leg stretched out behind, and her fist drives straight at his chest; he crosses both forearms and the blow shoves him back one full step, his boots scraping the stone. " +
  "[Shot 2] At 00:02.000, the shot cuts to a medium two-shot: he answers at once with a flat palm to her shoulder that spins her away two steps to the left, where she lands in a low stance again, facing him; he steps in and raises his fist high. " +
  "[Shot 3] At 00:04.000, the shot cuts to a low-angle shot at hip height, the camera tracking slightly to the right: his fist swings down at her head; she drops to a crouch beneath it and sweeps her rear leg flat along the floor at his ankles; he lifts his front foot over the sweep. " +
  "[Shot 4] At 00:06.000, the shot cuts to an extreme close-up of the floor: his fist, finding nothing, slams into the stone where she stood, cracking it and throwing up a jagged spray of grey dust and stone fragments; she rolls away to the left and ends crouched three steps from him. " +
  "[Shot 5] At 00:08.000, the shot cuts to a low-angle shot: from the crouch she springs up and spins fully on her standing foot, her back to him for a beat, her heel sweeping a wide arc toward his jaw. " +
  "[Shot 6] At 00:10.000, the shot cuts to a medium close-up of his face: her heel connects with his jaw, his head snaps sharply to the right and dust swirls around him as he staggers back two steps, one hand brushing the floor. " +
  "[Shot 7] At 00:11.500, the shot cuts to a wide side-on shot: he lowers his shoulder and charges; she steps inside the charge, turns her back into him, grips his sleeve and bends forward. " +
  "[Shot 8] At 00:13.000, the shot cuts to a low-angle shot: he flips over her shoulder and lands flat on his back, the floor shaking in a ring of dust; she straightens over him, breathing hard, and the frame holds. " +
  "Exactly two fighters; no identity drift or left-right reversal; no text.";

const [projet] = await db.select().from(projects).where(eq(projects.nom, NOM_PROJET));
if (!projet) throw new Error(`Projet introuvable : ${NOM_PROJET}`);
const tous = await db.select().from(plans).where(eq(plans.projectId, projet.id));
if (tous.some((p) => p.titre === TITRE)) throw new Error("CD existe déjà — rien n'a été écrit.");
const cb = tous.find((p) => p.titre.startsWith("CB "));
if (!cb) throw new Error("CB introuvable (lancer d'abord ab-choregraphie.mts)");
const refs = await db.select().from(planRefs).where(eq(planRefs.planId, cb.id));
const sections = await db.select().from(planPromptSections).where(eq(planPromptSections.planId, cb.id));
const tousLesPlans = "[Shot 1], [Shot 2], [Shot 3], [Shot 4], [Shot 5], [Shot 6], [Shot 7], [Shot 8]";
const r = await db.transaction(async (tx) => {
  const [p] = await tx.insert(plans).values({
    projectId: projet.id, episodeId: cb.episodeId, sceneId: cb.sceneId, ordre: Math.max(...tous.map((x) => x.ordre)) + 1, titre: TITRE,
    description: cb.description, dureeMontageSecondes: 15, dureeGenerationSecondes: 15, fps: 24, seed: cb.seed, statut: "en_attente",
    notes: "Chorégraphie, variante D : la chaîne de CB (chaque réaction suit le coup, chaque plan reprend la position précédente) en 8 plans de 1,5 à 2 s, avec des angles variés comme l'agent (CC).",
  }).returning();
  await tx.insert(planRefs).values(refs.map((x) => ({ planId: p!.id, type: x.type, slot: x.slot, assetId: x.assetId, role: x.role, retention: x.retention })));
  await tx.insert(planPromptSections).values(sections.map((s) => ({
    planId: p!.id, section: s.section, ordre: s.ordre,
    contenu: s.section === "detailed_description" ? DESCRIPTION : s.section === "retention_analysis" ? s.contenu.replaceAll("[Shot 1], [Shot 2], [Shot 3], [Shot 4]", tousLesPlans) : s.contenu,
  })));
  return { uuid: p!.uuid, caracteres: sections.map((s) => (s.section === "detailed_description" ? DESCRIPTION : s.contenu)).join("").length };
});
console.log(JSON.stringify(r));
process.exit(0);
