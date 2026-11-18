import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSIGNE_CONTINUITE_MUSIQUE, musiqueDePlan } from "./music";

test("musiqueDePlan : la description du brief, plus la consigne de continuité", () => {
  const m = musiqueDePlan("A joyful orchestral waltz at 160 BPM: pizzicato strings, marimba and warm brass");
  assert.equal(m, `A joyful orchestral waltz at 160 BPM: pizzicato strings, marimba and warm brass. ${CONSIGNE_CONTINUITE_MUSIQUE}`);
});

test("musiqueDePlan : retire les débuts et fins écrits par le modèle", () => {
  const m = musiqueDePlan("Solo piano with low cello, slow tempo. It enters at the beginning. It drops out in the final two seconds.");
  assert.equal(m, `Solo piano with low cello, slow tempo. ${CONSIGNE_CONTINUITE_MUSIQUE}`);
});

test("musiqueDePlan : rien sans description", () => {
  assert.equal(musiqueDePlan(undefined), null);
  assert.equal(musiqueDePlan("   "), null);
  assert.equal(musiqueDePlan("It fades out."), null);
});
