import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSequence, formatTime, timeLabel } from "./sequence-display";

const moments = (n: number) => Array.from({ length: n }, (_, i) => `Moment ${i + 1}.`);

test("numérotés dans l'ordre, repères de temps à parts égales de la durée", () => {
  const s = buildSequence({ moments: moments(4), dureeEpisodeSecondes: 40 }, "fourni");
  assert.deepEqual(s.moments.map((m) => [m.number, m.startSeconds, m.endSeconds]), [[1, 0, 10], [2, 10, 20], [3, 20, 30], [4, 30, 40]]);
  assert.equal(timeLabel(s.moments[2]!), "≈ 0:20 – 0:30");
  assert.deepEqual([s.durationSeconds, s.expected, s.missing], [40, 4, 0]);
  assert.deepEqual([s.status, s.statusLabel], ["fourni", "dits par toi"]);
});

test("sans durée connue : pas de repère de temps, rien d'attendu", () => {
  const s = buildSequence({ moments: moments(3) }, "deduit");
  assert.ok(s.moments.every((m) => m.startSeconds === null && m.endSeconds === null && timeLabel(m) === ""));
  assert.deepEqual([s.durationSeconds, s.expected, s.missing], [null, 0, 0]);
  assert.equal(s.statusLabel, "proposés par le scénariste, à valider");
});

test("moins de moments que la durée n'en demande : le manque est compté", () => {
  const s = buildSequence({ moments: moments(5), dureeEpisodeSecondes: 120 }, "delegue");
  assert.deepEqual([s.expected, s.missing, s.statusLabel], [12, 7, "laissés au scénariste"]);
});

test("par actes : trois tiers égaux dès trois moments, rien en dessous", () => {
  assert.deepEqual(buildSequence({ moments: moments(2) }, "fourni").thirds, []);
  const sept = buildSequence({ moments: moments(7) }, "fourni").thirds;
  assert.deepEqual(sept.map((g) => [g.label, g.moments.map((m) => m.number)]), [["Début", [1, 2, 3]], ["Milieu", [4, 5]], ["Fin", [6, 7]]]);
  const douze = buildSequence({ moments: moments(12) }, "fourni").thirds;
  assert.deepEqual(douze.map((g) => g.moments.length), [4, 4, 4]);
  assert.equal(douze.flatMap((g) => g.moments).length, 12, "aucun moment perdu ni doublé");
});

test("vide ou malformé : aucun moment, statut absent", () => {
  for (const v of [undefined, "texte", ["", "  ", 3]]) {
    const s = buildSequence({ moments: v }, "fourni");
    assert.deepEqual([s.moments, s.status, s.statusLabel, s.thirds], [[], "absent", "", []]);
  }
});

test("formatTime : minutes et secondes", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65), "1:05");
  assert.equal(formatTime(599.6), "10:00");
});
