import assert from "node:assert/strict";
import { test } from "node:test";
import { briefDepuisPlan, normaliserReplique, separerDescription, type EntreeBrief, type PersonnageEntree, type ReferenceEntree } from "./brief";

const MAI: PersonnageEntree = { code: "CHAR_mai", label: "Mai", voix: { chemin: "/m/voix/1/mai.wav", sha256: "a".repeat(64), description: "voix grave et posée", repliqueBase: "Bonjour." } };
const GARDE: PersonnageEntree = { code: "CHAR_le_garde", label: null, voix: null };

const ref = (code: string, typeAsset: string, slot: number, chemin: string | null = `/m/${code}.png`, type: ReferenceEntree["type"] = "picture"): ReferenceEntree => ({
  type,
  slot,
  code,
  label: null,
  typeAsset,
  description: `desc ${code}`,
  chemin,
});

const DESCRIPTION = [
  "Mai entre dans la salle et regarde le garde.",
  "",
  "Mai : « Tu es sûr ? »",
  "voix off : « Il revenait chaque marée. »",
  "",
  "Consigne de l'auteur : plan large d'abord.",
  "",
  "État en fin de plan : Mai à gauche de la porte.",
].join("\n");

function entree(surcharge: Partial<EntreeBrief> = {}): EntreeBrief {
  return {
    plan: { description: DESCRIPTION, dureeSecondes: 8, seed: "123456789012345" },
    scene: { titre: "L'arrivée", ambiance: "nuit, pluie fine" },
    langueDialogues: "French",
    codesVoixOff: [],
    personnages: [MAI, GARDE],
    references: [ref("DEC_salle", "decor", 1), ref("CHAR_mai", "personnage", 2), ref("CHAR_le_garde", "personnage", 3)],
    ...surcharge,
  };
}

test("separerDescription : répliques extraites dans l'ordre, « État en fin de plan » retiré, consigne gardée", () => {
  const { narration, repliques } = separerDescription(DESCRIPTION);
  assert.deepEqual(repliques, [{ nom: "Mai", texte: "Tu es sûr ?" }, { nom: "voix off", texte: "Il revenait chaque marée." }]);
  assert.ok(narration.startsWith("Mai entre dans la salle"));
  assert.ok(narration.includes("Consigne de l'auteur : plan large d'abord."));
  assert.ok(!narration.includes("État en fin de plan"));
  assert.ok(!narration.includes("Tu es sûr"));
});

test("separerDescription : un point après le guillemet fermant n'empêche pas la réplique", () => {
  const r = separerDescription("Texte.\nKatara : « l'Air ».");
  assert.deepEqual(r.repliques, [{ nom: "Katara", texte: "l'Air" }]);
  assert.equal(r.narration, "Texte.");
});

test("normaliserReplique : trois points deviennent « … » (le paquet rejetait « harmonie... »)", () => {
  assert.equal(normaliserReplique("Ces 4 peuples vivaient en harmonie... Puis ....."), "Ces 4 peuples vivaient en harmonie… Puis …");
  assert.equal(normaliserReplique("Fin."), "Fin.");
});

test("normaliserReplique : plus d'espace (même insécable) devant ! ? ; :", () => {
  assert.equal(normaliserReplique("Tu es sûr ? Oui ! Voilà : bien ;"), "Tu es sûr? Oui! Voilà: bien;");
});

test("briefDepuisPlan : intent sans répliques, avec l'ambiance mais sans le titre de la scène ; dialogue normalisé avec son locuteur", () => {
  const { brief, refus } = briefDepuisPlan(entree());
  assert.equal(refus, null);
  assert.ok(brief);
  assert.ok(brief.intent.includes("Mai entre dans la salle"));
  assert.ok(!brief.intent.includes("Tu es sûr"));
  assert.ok(brief.intent.endsWith("Ambiance : nuit, pluie fine"));
  assert.ok(!brief.intent.includes("L'arrivée"));
  assert.deepEqual(brief.dialogue, [
    { text: "Tu es sûr?", language: "French", speaker: "Mai", voiceover: false },
    { text: "Il revenait chaque marée.", language: "French", voiceover: true },
  ]);
  assert.equal(brief.seconds, 8);
  assert.equal(brief.megapixels, 0.4);
  assert.equal(brief.effort, "standard");
  assert.equal(brief.seed, 123456789012345);
});

test("briefDepuisPlan : rôles par type, images de celui qui parle en tête, voix en voice_timbre avec sa transcription", () => {
  const { brief } = briefDepuisPlan(entree());
  assert.ok(brief);
  assert.deepEqual(
    brief.assets.map((a) => [a.kind, a.role, a.path]),
    [
      ["image", "subject", "/m/CHAR_mai.png"],
      ["image", "environment", "/m/DEC_salle.png"],
      ["image", "subject", "/m/CHAR_le_garde.png"],
      ["audio", "voice_timbre", "/m/voix/1/mai.wav"],
    ],
  );
  assert.equal(brief.assets[0]!.note, "Mai — desc CHAR_mai");
  assert.equal(brief.assets[3]!.note, "Mai : voix grave et posée");
  assert.deepEqual(brief.transcripts, { ["a".repeat(64)]: "Bonjour." });
});

test("briefDepuisPlan : un keyframe est une storyboard ; un locuteur sans voix fixée donne un avertissement", () => {
  const description = "Le garde ouvre.\nLe garde : « Halte ! »";
  const { brief, avertissements } = briefDepuisPlan(entree({ plan: { description, dureeSecondes: 5, seed: null }, references: [ref("KEY_porte", "keyframe", 1)] }));
  assert.ok(brief);
  assert.equal(brief.assets[0]!.role, "storyboard");
  assert.equal(brief.dialogue[0]!.text, "Halte!");
  assert.ok(avertissements.some((a) => a.includes("Le garde") && a.includes("pas de voix fixée")));
  assert.ok(avertissements.some((a) => a.includes("seed")));
  assert.equal("seed" in brief, false);
});

test("briefDepuisPlan : un personnage en voix off au brief parle en voix off, avec son locuteur", () => {
  const { brief } = briefDepuisPlan(entree({ codesVoixOff: ["CHAR_mai"] }));
  assert.equal(brief!.dialogue[0]!.voiceover, true);
  assert.equal(brief!.dialogue[0]!.speaker, "Mai");
});

test("briefDepuisPlan : langue « Auto » → French avec avertissement ; locuteur inconnu → avertissement", () => {
  const description = "Quelqu'un parle.\nInconnu : « Salut. »";
  const { brief, avertissements } = briefDepuisPlan(entree({ langueDialogues: "Auto", plan: { description, dureeSecondes: 5, seed: "1" } }));
  assert.equal(brief!.dialogue[0]!.language, "French");
  assert.equal(brief!.dialogue[0]!.speaker, "Inconnu");
  assert.ok(avertissements.some((a) => a.includes("Auto")));
  assert.ok(avertissements.some((a) => a.includes("« Inconnu » n'est pas au registre")));
});

test("briefDepuisPlan : guillemets droits remplacés", () => {
  const description = 'Elle lit le mot "danger" sur le mur.';
  const { brief } = briefDepuisPlan(entree({ plan: { description, dureeSecondes: 5, seed: "1" }, references: [ref("CHAR_mai", "personnage", 1)] }));
  assert.ok(brief);
  assert.ok(brief.intent.includes("«danger»"));
  assert.ok(!brief.intent.includes('"'));
});

test("briefDepuisPlan : un effet visuel part en style (référence faible), un prop reste un sujet", () => {
  const { brief } = briefDepuisPlan(entree({ references: [ref("CHAR_mai", "personnage", 1), ref("VFX_feu", "vfx", 2), ref("PROP_lame", "prop", 3)] }));
  assert.ok(brief);
  assert.deepEqual(
    brief.assets.map((a) => [a.path, a.role]),
    [
      ["/m/CHAR_mai.png", "subject"],
      ["/m/VFX_feu.png", "style"],
      ["/m/PROP_lame.png", "subject"],
      ["/m/voix/1/mai.wav", "voice_timbre"],
    ],
  );
});

test("briefDepuisPlan : shots et style de caméra sont facultatifs, bornés et contrôlés", () => {
  assert.equal("shots" in briefDepuisPlan(entree()).brief!, false);
  assert.equal("director" in briefDepuisPlan(entree()).brief!, false);
  const avec = briefDepuisPlan(entree(), { shots: 3, director: "villeneuve" }).brief!;
  assert.equal(avec.shots, 3);
  assert.equal(avec.director, "villeneuve");
  assert.match(briefDepuisPlan(entree(), { shots: 7 }).refus ?? "", /1 à 6/); // 8 s / 1,2 = 6
  assert.match(briefDepuisPlan(entree(), { shots: 0 }).refus ?? "", /entier/);
  assert.match(briefDepuisPlan(entree(), { director: "kubrick" }).refus ?? "", /inconnu/);
});

test("briefDepuisPlan : refus sans image, avec une référence sans fichier, au-delà de 6 références, sans description", () => {
  assert.match(briefDepuisPlan(entree({ references: [] })).refus ?? "", /aucune image/);
  assert.match(briefDepuisPlan(entree({ references: [ref("CHAR_mai", "personnage", 1, null)] })).refus ?? "", /CHAR_mai/);
  const sept = Array.from({ length: 7 }, (_, i) => ref(`PROP_${i}`, "prop", i + 1));
  assert.match(briefDepuisPlan(entree({ references: sept })).refus ?? "", /7 références visuelles, 6 au plus/);
  const six = sept.slice(0, 6);
  assert.ok(briefDepuisPlan(entree({ references: six })).brief);
  assert.match(briefDepuisPlan(entree({ plan: { description: "Mai : « Oui. »", dureeSecondes: 5, seed: "1" } })).refus ?? "", /pas de description/);
});

test("briefDepuisPlan : aucune clé hors du contrat du service", () => {
  const CLES_BRIEF = new Set(["intent", "assets", "seconds", "aspect", "megapixels", "dialogue", "onscreen_text", "shots", "loras", "silent", "constraints", "creativity", "director", "director_profile", "effort", "seed", "transcripts", "answer"]);
  const CLES_ASSET = new Set(["path", "sha256", "url", "note", "replaces", "kind", "role", "sizing", "seconds", "frames", "paired_video_path", "paired_video_sha256", "provenance"]);
  const CLES_DIALOGUE = new Set(["text", "language", "speaker", "voiceover"]);
  const { brief } = briefDepuisPlan(entree(), { shots: 2, director: "wong" });
  assert.ok(brief);
  for (const k of Object.keys(brief)) assert.ok(CLES_BRIEF.has(k), `clé inconnue du brief : ${k}`);
  for (const a of brief.assets) for (const k of Object.keys(a)) assert.ok(CLES_ASSET.has(k), `clé inconnue d'un asset : ${k}`);
  for (const d of brief.dialogue) for (const k of Object.keys(d)) assert.ok(CLES_DIALOGUE.has(k), `clé inconnue d'un dialogue : ${k}`);
});

test("briefDepuisPlan : créativité (clé omise si « balanced », le défaut du paquet) et style « aucun » = pas de director", () => {
  assert.equal("creativity" in briefDepuisPlan(entree()).brief!, false);
  assert.equal("creativity" in briefDepuisPlan(entree(), { creativity: "balanced" }).brief!, false);
  assert.equal(briefDepuisPlan(entree(), { creativity: "extreme" }).brief!.creativity, "extreme");
  assert.match(briefDepuisPlan(entree(), { creativity: "folle" }).refus ?? "", /Créativité inconnue/);
  // « aucun » et vide ne posent pas de director ; un profil le pose.
  assert.equal("director" in briefDepuisPlan(entree(), { director: "aucun" }).brief!, false);
  assert.equal("director" in briefDepuisPlan(entree(), { director: "" }).brief!, false);
  assert.equal(briefDepuisPlan(entree(), { director: "wong" }).brief!.director, "wong");
});

test("briefDepuisPlan : le plafond de shots suit la durée nominale (le paquet refuse sur elle) et le plancher de 1,2 s", () => {
  // 6 s / 1,2 = 5 shots au plus ; 5 passe, 6 est refusé (même si la durée effective de 6,583 s en permettrait 5).
  assert.equal(briefDepuisPlan(entree({ plan: { description: DESCRIPTION, dureeSecondes: 6, seed: "1" } }), { shots: 5 }).brief!.shots, 5);
  assert.match(briefDepuisPlan(entree({ plan: { description: DESCRIPTION, dureeSecondes: 6, seed: "1" } }), { shots: 6 }).refus ?? "", /1 à 5/);
});

test("briefDepuisPlan : un profil perso part en director_profile (jamais en director), un réalisateur en director, « aucun » rien ; un inconnu est refusé", async () => {
  const { PROFILS_PERSO } = await import("./character-profiles");
  const perso = briefDepuisPlan(entree(), { director: "claymation" });
  assert.equal(perso.refus, null);
  assert.deepEqual(perso.brief?.director_profile, PROFILS_PERSO.claymation);
  assert.equal(perso.brief?.director, undefined);
  const livre = briefDepuisPlan(entree(), { director: "wong" });
  assert.equal(livre.brief?.director, "wong");
  assert.equal(livre.brief?.director_profile, undefined);
  const aucun = briefDepuisPlan(entree(), { director: "aucun" });
  assert.deepEqual([aucun.brief?.director, aucun.brief?.director_profile], [undefined, undefined]);
  assert.match(briefDepuisPlan(entree(), { director: "kubrick" }).refus ?? "", /inconnu/);
});
