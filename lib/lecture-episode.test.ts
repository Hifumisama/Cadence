import test from "node:test";
import assert from "node:assert/strict";
import { couverture, dureeCarton, dureeTotale, largeurs, minutes, precedent, suivant, type SegmentLu } from "./lecture-episode";

const seg = (position: number, dureeSecondes: number, src: string | null = "/a.mp4"): SegmentLu => ({ uuid: `u${position}`, position, titre: `Plan ${position}`, dureeSecondes, src });

test("durée totale et largeurs proportionnelles (somme 100)", () => {
  const s = [seg(1, 5), seg(2, 10), seg(3, 5)];
  assert.equal(dureeTotale(s), 20);
  assert.deepEqual(largeurs(s), [25, 50, 25]);
  assert.ok(Math.abs(largeurs(s).reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.deepEqual(largeurs([]), []);
});

test("enchaînement : suivant et précédent, bornes comprises", () => {
  const s = [seg(1, 5), seg(2, 5)];
  assert.equal(suivant(s, 0), 1);
  assert.equal(suivant(s, 1), null);
  assert.equal(precedent(1), 0);
  assert.equal(precedent(0), null);
});

test("carton d'un plan sans rendu : sa durée, bornée", () => {
  assert.equal(dureeCarton({ dureeSecondes: 2 }), 2);
  assert.equal(dureeCarton({ dureeSecondes: 15 }), 4);
  assert.equal(dureeCarton({ dureeSecondes: 0 }), 1);
});

test("couverture et affichage des minutes", () => {
  assert.deepEqual(couverture([seg(1, 5), seg(2, 5, null), seg(3, 5)]), { avecRendu: 2, total: 3 });
  assert.equal(minutes(83), "01:23");
  assert.equal(minutes(5), "00:05");
});
