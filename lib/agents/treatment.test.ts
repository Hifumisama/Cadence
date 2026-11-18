import test from "node:test";
import assert from "node:assert/strict";
import { ajusterDureesScene, controlerTraitement, nombreDeScenesVise, repartirDureesScenes, traitementDeScene } from "./treatment";

const somme = (l: number[]) => l.reduce((a, b) => a + b, 0);

test("scènes : une vingtaine de minutes demande une dizaine de scènes", () => {
  const { min, max } = nombreDeScenesVise(1200);
  assert.ok(min >= 8 && min <= 12, String(min));
  assert.ok(max >= 14 && max <= 20, String(max));
  assert.equal(nombreDeScenesVise(120).min, 3);
});

test("durées des scènes : la somme tombe exactement sur la durée de l'épisode, au prorata des poids", () => {
  const d = repartirDureesScenes([1, 2, 5, 2], 1200);
  assert.equal(somme(d), 1200);
  assert.ok(d[2]! > d[1]! && d[1]! > d[0]!);
  assert.equal(somme(repartirDureesScenes([1, 1, 1], 100)), 100);
});

test("durées des scènes : aucune scène sous un plan minimal, même avec un poids minuscule", () => {
  const d = repartirDureesScenes([1, 5, 5, 5], 40);
  assert.equal(somme(d), 40);
  assert.ok(d.every((x) => x >= 4));
  assert.deepEqual(repartirDureesScenes([], 100), []);
  // An impossible target (3 scenes, 9 s) is raised to the minimum.
  assert.equal(somme(repartirDureesScenes([1, 1, 1], 9)), 12);
});

test("ajustement d'une scène : dans la tolérance, les durées du modèle restent", () => {
  assert.deepEqual(ajusterDureesScene([8, 10, 7], 25), [8, 10, 7]);
  assert.deepEqual(ajusterDureesScene([8, 10, 7], 23), [8, 10, 7]);
});

test("ajustement d'une scène : la cible est un plancher, une scène un peu courte est rallongée", () => {
  const r = ajusterDureesScene([8, 10, 7], 26);
  assert.equal(somme(r), 26);
});

test("ajustement d'une scène : trop long, on ramène à la cible, entiers de 4 à 10", () => {
  const r = ajusterDureesScene([10, 10, 10, 10], 30);
  assert.equal(somme(r), 30);
  assert.ok(r.every((x) => Number.isInteger(x) && x >= 4 && x <= 10));
});

test("ajustement d'une scène : trop court, on allonge sans dépasser 10 s", () => {
  const r = ajusterDureesScene([6, 6, 6], 27);
  assert.equal(somme(r), 27);
  assert.ok(r.every((x) => x <= 10));
  // Target out of reach: we get as close as possible.
  assert.equal(somme(ajusterDureesScene([8, 8], 60)), 20);
});

test("ajustement d'une scène : la forme se conserve, le plus long reste le plus long", () => {
  const r = ajusterDureesScene([10, 6, 6], 30);
  assert.equal(somme(r), 30);
  assert.ok(r[0]! >= r[1]!);
});

test("traitement lu : forme exigée, texte nettoyé, durée entière", () => {
  assert.equal(traitementDeScene(null), null);
  assert.equal(traitementDeScene({ intention: "", dureeCibleSecondes: 60 }), null);
  assert.equal(traitementDeScene({ intention: "x", dureeCibleSecondes: 0 }), null);
  assert.deepEqual(traitementDeScene({ intention: " Elle part. ", etatEntree: "Au camp", etatSortie: "Sur la route", dureeCibleSecondes: 59.6 }), {
    intention: "Elle part.",
    etatEntree: "Au camp",
    etatSortie: "Sur la route",
    dureeCibleSecondes: 60,
    momentsDeLAuteur: "",
    moments: [],
  });
});

test("traitement : les moments du brief se répartissent sur les scènes, et la scène les reçoit", async () => {
  const lu = traitementDeScene({ intention: "x", dureeCibleSecondes: 30, moments: [" La danseuse tourne. ", "", 3, "La tache monte sur sa robe pendant qu'elle danse."] });
  assert.deepEqual(lu?.moments, ["La danseuse tourne.", "La tache monte sur sa robe pendant qu'elle danse."]);
  const vise = { min: 1, max: 4 };
  const scene = { titre: "A", intention: "i", etatEntree: "e", etatSortie: "s" };
  const un = controlerTraitement({ scenes: [{ ...scene, moments: ["m1", "m2"] }] }, vise, 3);
  assert.equal(un.length, 1);
  assert.match(un[0]!, /2 moments sur les 3/);
  assert.deepEqual(controlerTraitement({ scenes: [{ ...scene, moments: ["m1", "m2"] }, { ...scene, titre: "B", moments: ["m3"] }] }, vise, 3), []);
  assert.deepEqual(controlerTraitement({ scenes: [scene] }, vise), [], "un brief sans moments : rien à répartir");
  const { depuisTraitement } = await import("./conversion");
  const ch = depuisTraitement({ scenes: [{ ...scene, fonction: "f", poids: 1, moments: ["m1"] }], inventions: [], notes: "" }, { id: 1, scenes: [] }, { dureeEpisodeSecondes: 30 });
  assert.deepEqual((ch[0]!.apres as { traitement: { moments?: string[] } }).traitement.moments, ["m1"], "les moments de la scène sont stockés avec son traitement");
});

test("entrées en aval : le brief extrait porte les moments (traitement), la scène reçoit les siens (scenario-scene)", async () => {
  const { extraitsBrief, sceneDeScenarioScene } = await import("./context");
  const { briefVide } = await import("./brief");
  const brief = { ...briefVide("T"), moments: ["La danseuse tourne.", "La tache monte pendant qu'elle danse."] };
  const { extrait, contexte } = extraitsBrief(brief);
  assert.deepEqual((extrait as { moments?: string[] }).moments, brief.moments);
  assert.ok(contexte.some((c) => c.libelle === "Brief · 2 moments du film"));
  assert.ok(!("moments" in (extraitsBrief(briefVide("T")).extrait as object)), "un ancien brief sans moments : rien");
  // The treatment's check reads the brief's moments from its input.
  const { controleurPourSkill } = await import("../llm/checks");
  const ctrl = controleurPourSkill("traitement-episode", { nombreDeScenes: { min: 1, max: 3 }, briefExtrait: extrait })!;
  assert.equal(ctrl({ scenes: [{ titre: "A", intention: "i", etatEntree: "e", etatSortie: "s", moments: ["La danseuse tourne."] }] }).length, 1, "un moment oublié : renvoi");
  const t = traitementDeScene({ intention: "Elle danse.", dureeCibleSecondes: 20, moments: brief.moments })!;
  const scene = sceneDeScenarioScene({ titre: "La danse", fonction: null, ambiance: " nuit " }, t, 0, 3);
  assert.deepEqual(scene.moments, brief.moments);
  assert.equal(scene.position, "1 sur 3");
  assert.ok(!("moments" in sceneDeScenarioScene({ titre: "x", fonction: "", ambiance: null }, { ...t, moments: [] }, 1, 3)));
});
