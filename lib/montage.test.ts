import test from "node:test";
import assert from "node:assert/strict";
import {
  aimanter,
  argsExport,
  bornes,
  cibleGlisser,
  construireClips,
  debuts,
  deplacer,
  differeDuScenario,
  dureeSegment,
  dureeTotale,
  entreesDecalees,
  familleStatut,
  formatSortie,
  formatTemps,
  indexA,
  indexInsertion,
  inserer,
  plansHorsMontage,
  rangNouveauPlan,
  recaler,
  renduEffectif,
  segmentsExport,
  type EntreeMontage,
  type PlanMontage,
  type RenduMontage,
} from "./montage";

const rendu = (id: number, duree = 10): RenduMontage => ({ id, numeroRendu: id, genre: "aperçu", chemin: `plans/1/r${id}.mp4`, src: `/api/media/plans/1/r${id}.mp4`, dureeSecondes: duree, creeLe: "2026-11-01T10:00:00Z" });
const plan = (id: number, o: Partial<PlanMontage> = {}): PlanMontage => ({
  id, uuid: `u${id}`, titre: `Plan ${id}`, statut: "termine", sceneId: null, position: id, dureePrevue: 6, perime: null, erreur: null, rendus: [], renduParDefautId: null, ...o,
});
const entree = (id: number, planId: number, o: Partial<EntreeMontage> = {}): EntreeMontage => ({ id, planId, renduRetenuId: null, debut: 0, fin: null, ...o });

test("rendu effectif : le choix de l'entrée s'il est lisible, sinon le défaut du plan, sinon le plus récent", () => {
  const p = plan(1, { rendus: [rendu(3), rendu(2), rendu(1)], renduParDefautId: 2 });
  assert.equal(renduEffectif(entree(1, 1, { renduRetenuId: 1 }), p)?.id, 1);
  assert.equal(renduEffectif(entree(1, 1), p)?.id, 2);
  assert.equal(renduEffectif(entree(1, 1, { renduRetenuId: 99 }), p)?.id, 2, "un rendu disparu retombe sur le défaut");
  assert.equal(renduEffectif(entree(1, 1), { ...p, renduParDefautId: null })?.id, 3);
  assert.equal(renduEffectif(entree(1, 1), plan(2)), null);
});

test("bornes : rognage borné par la durée du rendu, fin null = rendu entier, plan sans rendu = durée prévue", () => {
  assert.deepEqual(bornes({ debut: 0, fin: null }, 10, 6), { debut: 0, fin: 10, duree: 10, prevu: false });
  assert.deepEqual(bornes({ debut: 2, fin: 7.5 }, 10, 6), { debut: 2, fin: 7.5, duree: 5.5, prevu: false });
  assert.deepEqual(bornes({ debut: 2, fin: 14 }, 10, 6), { debut: 2, fin: 10, duree: 8, prevu: false }, "un rendu plus court raccourcit la fin");
  assert.equal(bornes({ debut: 9.9, fin: null }, 10, 6).debut, 9.5, "au moins une demi-seconde");
  assert.equal(bornes({ debut: 3, fin: 3.1 }, 10, 6).fin, 3.5);
  assert.deepEqual(bornes({ debut: 2, fin: 4 }, null, 6), { debut: 0, fin: 6, duree: 6, prevu: true });
});

test("clips, débuts, durée totale et clip sous la tête de lecture", () => {
  const plans = [plan(1, { rendus: [rendu(1, 8)], renduParDefautId: 1 }), plan(2, { dureePrevue: 5 })];
  const clips = construireClips([entree(10, 1, { debut: 1, fin: 6 }), entree(11, 2), entree(12, 99)], plans);
  assert.equal(clips.length, 2, "une entrée sans plan est ignorée");
  const durees = clips.map((c) => c.duree);
  assert.deepEqual(durees, [5, 5]);
  assert.deepEqual(debuts(durees), [0, 5]);
  assert.equal(dureeTotale(durees), 10);
  assert.equal(indexA(0, [0, 5]), 0);
  assert.equal(indexA(4.99, [0, 5]), 0);
  assert.equal(indexA(5, [0, 5]), 1);
  assert.equal(indexA(0, []), 0);
});

test("déplacer, insérer, point d'insertion et cible d'un glisser", () => {
  assert.deepEqual(deplacer(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.deepEqual(deplacer(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(inserer(["a", "b"], "x", 1), ["a", "x", "b"]);
  assert.deepEqual(inserer(["a", "b"], "x", 9), ["a", "b", "x"]);
  assert.equal(indexInsertion([4, 6], 1), 0);
  assert.equal(indexInsertion([4, 6], 3), 1);
  assert.equal(indexInsertion([4, 6], 8), 2);
  // Clip 0 (4 s) glissé : centre à 9 s parmi [6, 2] → après les deux.
  assert.deepEqual(cibleGlisser([4, 6, 2], 0, 9), { index: 2, debut: 8 });
  assert.deepEqual(cibleGlisser([4, 6, 2], 2, 1), { index: 0, debut: 0 });
});

test("aimantation : demi-seconde, ou la tête de lecture toute proche", () => {
  assert.equal(aimanter(3.3, true), 3.5);
  assert.equal(aimanter(3.2, true), 3);
  assert.equal(aimanter(3.3, false), 3.3);
  assert.equal(aimanter(3.3, true, 3.42), 3.42);
  assert.equal(aimanter(3.3, true, 4), 3.5);
});

test("deux ordres : écart au scénario, entrées décalées (sc. NN), copies ignorées", () => {
  const scenario = [1, 2, 3, 4];
  const dansLOrdre = [entree(1, 1), entree(2, 2), entree(3, 2), entree(4, 4)];
  assert.equal(differeDuScenario(dansLOrdre, scenario), false, "un plan hors montage (3) et une copie (2) ne créent pas d'écart");
  assert.equal(entreesDecalees(dansLOrdre, scenario).size, 0);
  const inverse = [entree(1, 2), entree(2, 1), entree(3, 4)];
  assert.equal(differeDuScenario(inverse, scenario), true);
  assert.deepEqual([...entreesDecalees(inverse, scenario)], [1, 2]);
});

test("recaler sur l'ordre des scènes : tri stable, copies gardées dans leur ordre, plan inconnu à la fin", () => {
  const e = [entree(1, 3, { debut: 2 }), entree(2, 1), entree(3, 3, { renduRetenuId: 7 }), entree(4, 9), entree(5, 2)];
  const r = recaler(e, [1, 2, 3]);
  assert.deepEqual(r.map((x) => x.id), [2, 5, 1, 3, 4]);
  assert.equal(r[2]!.debut, 2, "le rognage suit l'entrée");
  assert.equal(r[3]!.renduRetenuId, 7, "le rendu retenu suit l'entrée");
});

test("hors montage et place d'un plan qui vient de naître", () => {
  const plans = [plan(1), plan(2), plan(3)];
  assert.deepEqual(plansHorsMontage(plans, [entree(1, 1), entree(2, 3)]).map((p) => p.id), [2]);
  const e = [entree(1, 1), entree(2, 3), entree(3, 1)];
  assert.equal(rangNouveauPlan(e, [1, 2, 3], 2), 3, "après la dernière entrée du plan précédent");
  assert.equal(rangNouveauPlan(e, [0, 1, 2, 3], 0), 0, "avant la première entrée du suivant");
  assert.equal(rangNouveauPlan([], [1], 1), 0);
  assert.equal(rangNouveauPlan(e, [1, 3], 7), 3, "inconnu du scénario : à la fin");
});

test("segments d'export : rognage appliqué, entrées sans rendu ignorées", () => {
  const plans = [plan(1, { rendus: [rendu(1, 10)], renduParDefautId: 1 }), plan(2), plan(3, { rendus: [rendu(3, 8)], renduParDefautId: 3 })];
  const clips = construireClips([entree(1, 1, { debut: 1, fin: 4 }), entree(2, 2), entree(3, 3, { debut: 2 })], plans);
  const r = segmentsExport(clips);
  assert.equal(r.ignores, 1);
  assert.deepEqual(r.segments, [
    { chemin: "plans/1/r1.mp4", debut: 1, fin: 4, titre: "Plan 1" },
    { chemin: "plans/1/r3.mp4", debut: 2, fin: null, titre: "Plan 3" },
  ]);
  assert.equal(r.dureeSecondes, 9);
  assert.equal(dureeSegment({ debut: 2, fin: null }, 7.9), 5.9);
  assert.equal(dureeSegment({ debut: 2, fin: 12 }, 7.9), 5.9);
});

test("format de sortie et arguments ffmpeg (silence pour un rendu muet, concat v+a)", () => {
  const f = formatSortie([{ largeur: 640, hauteur: 359, fps: 24, duree: 5, audio: true }, { largeur: 1280, hauteur: 720, fps: 25, duree: 5, audio: false }]);
  assert.deepEqual(f, { largeur: 1280, hauteur: 720, fps: 25 });
  assert.deepEqual(formatSortie([]), { largeur: 1280, hauteur: 720, fps: 24 });
  const args = argsExport([{ chemin: "/a.mp4", debut: 1, duree: 3, audio: true }, { chemin: "/b.mp4", debut: 0, duree: 4.5, audio: false }], f, "/out.mp4");
  assert.deepEqual(args.slice(0, 11), ["-v", "error", "-y", "-ss", "1", "-t", "3", "-i", "/a.mp4", "-ss", "0"]);
  assert.ok(args.includes("anullsrc=r=48000:cl=stereo"));
  const graphe = args[args.indexOf("-filter_complex") + 1]!;
  assert.match(graphe, /\[1:v\]scale=1280:720/);
  assert.match(graphe, /\[2:a\]aresample/, "le silence (3e entrée) remplace le son du rendu muet");
  assert.match(graphe, /\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[v\]\[a\]$/);
  assert.equal(args.at(-1), "/out.mp4");
});

test("affichage : temps et familles de statut", () => {
  assert.equal(formatTemps(0), "0:00.0");
  assert.equal(formatTemps(83.44), "1:23.4");
  assert.equal(formatTemps(-2), "0:00.0");
  assert.equal(familleStatut("previsualise"), "termine");
  assert.equal(familleStatut("rejoue"), "encours");
  assert.equal(familleStatut("brouillon"), "attente");
  assert.equal(familleStatut("echoue"), "echoue");
});
