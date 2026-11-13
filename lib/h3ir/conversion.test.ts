import assert from "node:assert/strict";
import { test } from "node:test";
import { lireApresFiche, verifierFiche, type ApresFiche, type EtatPlanFiche } from "../agents/sheets";
import { depuisCompilationH3ir } from "./conversion";
import type { ResultatH3ir } from "./result";

const SHA_MAI = "a".repeat(64);
const SHA_DEC = "b".repeat(64);

function resultat(surcharge: Partial<ResultatH3ir> = {}, compilation: Partial<ResultatH3ir["compilation"]> = {}): ResultatH3ir {
  return {
    moteur: "h3ir",
    planUuid: "6f0d3c1e-0000-4000-8000-000000000001",
    brief: { intent: "…", assets: [], seconds: 8, megapixels: 0.4, dialogue: [], effort: "standard", seed: 51 },
    intentFrancais: "…",
    intentAnglais: "…",
    liens: [
      { path: "/m/mai.png", code: "CHAR_mai", type: "picture" },
      { path: "/m/salle.png", code: "DEC_salle", type: "picture" },
    ],
    avertissements: [],
    compilation: {
      status: "ready",
      source: "written",
      mode: "ref2va",
      promptTokens: 400,
      sections: {
        subject_definitions: "<Picture 1> is [[Mai]]. <Picture 2> is the room.",
        summary: "[ref generation] Mai enters the room.",
        retention_analysis: "<Picture 1> (…): fully_preserved - …",
        detailed_description: "[Shot 1] Mai (<Picture 1>) enters <Picture 2>.",
        overall_soundscape: "Rain.",
        non_diegetic_music: "",
      },
      manifest: [
        { slot: 1, label: "<Picture 1>", kind: "image", sha256: SHA_MAI, role: "subject" },
        { slot: 2, label: "<Picture 2>", kind: "image", sha256: SHA_DEC, role: "environment" },
      ],
      diagnostics: [
        { rule: "R15", severity: "WARN", message: "wardrobe not restated" },
        { rule: "I2", severity: "INFO", message: "fyi" },
      ],
      dureeEffectiveSecondes: 8,
      ...compilation,
    },
    fichiers: { [SHA_MAI]: "/m/mai.png", [SHA_DEC]: "/m/salle.png" },
    tentatives: [
      { seed: 50, dureeMs: 1000, issue: "relance", raison: "x" },
      { seed: 51, dureeMs: 1000, issue: "ok" },
    ],
    seedUtilisee: 51,
    modeleTraduction: "gemma",
    ...surcharge,
  };
}

const PLAN = { uuid: "6f0d3c1e-0000-4000-8000-000000000001", titre: "Le départ" };
const fiche = (r: ResultatH3ir = resultat()) => {
  const [c] = depuisCompilationH3ir(r, PLAN);
  return c!;
};
const apresDe = (r?: ResultatH3ir) => fiche(r).apres as ApresFiche;

test("depuisCompilationH3ir : un seul changement `fiche` sur le plan, de moteur h3ir, sans durée ni description", () => {
  const c = fiche();
  assert.equal(c.cibleType, "fiche");
  assert.equal(c.cibleRef, PLAN.uuid);
  assert.equal(c.operation, "modifier");
  assert.equal(c.groupe, "fiches");
  assert.match(c.libelle, /Le départ.*Open H3 IR/);
  const a = apresDe();
  assert.equal(a.moteur, "h3ir");
  assert.equal(a.dureeGenerationSecondes, undefined, "le plan garde sa durée");
  assert.equal(a.description, undefined);
  assert.equal(depuisCompilationH3ir(resultat(), PLAN, { groupe: "ep-1", sousGroupe: "Scène" })[0]!.sousGroupe, "Scène");
});

test("depuisCompilationH3ir : les six sections du compilateur, dans leurs six noms", () => {
  const a = apresDe();
  assert.deepEqual(Object.keys(a.sections!), ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"]);
  assert.match(a.sections!.detailed_description!, /\[Shot 1\]/);
  assert.equal(a.sections!.non_diegetic_music, "");
});

test("depuisCompilationH3ir : le manifeste devient les références (images par emplacement)", () => {
  const a = apresDe();
  assert.deepEqual(a.refs, [
    { type: "picture", slot: 1, asset: "CHAR_mai", role: "subject", retention: null },
    { type: "picture", slot: 2, asset: "DEC_salle", role: "environment", retention: null },
  ]);
});

test("depuisCompilationH3ir : les avertissements disent le moteur, l'essai, la seed, les diagnostics et ceux du brief", () => {
  const c = fiche(resultat({ avertissements: ["Le plan n'a pas de seed utilisable."] }));
  const textes = c.avertissements!.map((w) => `${w.type}|${w.texte}`);
  assert.ok(textes.some((t) => t.startsWith("info|Compilée par Open H3 IR (written, essai 2, seed 51)")));
  assert.ok(textes.includes("alerte_controle|Le plan n'a pas de seed utilisable."));
  assert.ok(textes.includes("alerte_controle|Open H3 IR · R15 : wardrobe not restated"));
  assert.ok(textes.includes("info|Open H3 IR · I2 : fyi"));
  assert.ok(!c.avertissements!.some((w) => w.type === "bloque_controle"));
});

test("depuisCompilationH3ir : sans résumé ni description détaillée, ou sans image, la fiche est BLOQUÉE", () => {
  const sansResume = fiche(resultat({}, { sections: { detailed_description: "x" } }));
  assert.ok(sansResume.avertissements!.some((w) => w.type === "bloque_controle" && w.texte.includes("summary")));
  const sansImage = fiche(resultat({}, { manifest: [] }));
  assert.ok(sansImage.avertissements!.some((w) => w.type === "bloque_controle" && w.texte.includes("aucune image")));
});

test("depuisCompilationH3ir : une référence inconnue ou une vidéo est signalée et non écrite", () => {
  const inconnue = fiche(resultat({}, { manifest: [{ slot: 1, label: "<Picture 1>", kind: "image", sha256: "z".repeat(64), role: "subject" }] }));
  assert.ok(inconnue.avertissements!.some((w) => w.texte.includes("ne correspond à aucun fichier")));
  assert.deepEqual((inconnue.apres as ApresFiche).refs, []);

  const r = resultat({ liens: [{ path: "/m/clip.mp4", code: "OTH_clip", type: "video" }], fichiers: { v: "/m/clip.mp4" } }, {
    manifest: [{ slot: 1, label: "<Video 1>", kind: "video", sha256: "v", role: "subject" }],
  });
  const video = fiche(r);
  assert.ok(video.avertissements!.some((w) => w.texte.includes("vidéo de référence")));
  assert.deepEqual((video.apres as ApresFiche).refs, []);
});

test("depuisCompilationH3ir : le plus de 20 diagnostics sont résumés", () => {
  const diag = Array.from({ length: 25 }, (_, i) => ({ rule: `R${i}`, severity: "INFO", message: "m" }));
  const c = fiche(resultat({}, { diagnostics: diag }));
  assert.ok(c.avertissements!.some((w) => w.texte.includes("5 autres diagnostics")));
});

test("lireApresFiche garde `moteur: h3ir` ; la fiche produite passe `verifierFiche` (labels et références cohérents)", () => {
  const brut = JSON.parse(JSON.stringify(apresDe()));
  assert.equal(lireApresFiche(brut).moteur, "h3ir");
  assert.equal(lireApresFiche({ ...brut, moteur: "autre" }).moteur, undefined);

  const etat: EtatPlanFiche = {
    titre: "Le départ",
    sections: {},
    refs: [],
    registre: new Map([
      ["CHAR_mai", "personnage"],
      ["DEC_salle", "decor"],
    ]),
    aUnRendu: false,
    dureeGenerationSecondes: 8,
  };
  assert.equal(verifierFiche(lireApresFiche(brut), etat), null);
  // Without its reference, the <Picture 1> label of the prompt would remain orphaned: refused.
  const sansImage = { ...brut, refs: brut.refs.filter((r: { slot: number }) => r.slot !== 1) };
  assert.match(verifierFiche(lireApresFiche(sansImage), etat) ?? "", /sans référence/);
});
