import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSIGNE_CONTINUITE_MUSIQUE, CONSIGNE_CONTINUITE_MUSIQUE_PRESENTE, musiqueDePlan, sectionMusique } from "./music";

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

test("sectionMusique : la conception décide (« aucune » = N/A, « discrète » ou « présente » = la musique du brief) ; sans intention, une section vide ou N/A compilée reste", () => {
  const brief = "A playful retro-synth funk at 112 BPM";
  assert.equal(sectionMusique("Orchestra swells.", brief, "aucune"), "N/A");
  assert.equal(sectionMusique("Orchestra swells.", "N/A", undefined), "N/A", "le brief dit N/A : pas de musique");
  // The user wants music: the compiler's N/A or empty section does not decide.
  assert.equal(sectionMusique("N/A", brief, "discrete"), `${brief}. ${CONSIGNE_CONTINUITE_MUSIQUE}`);
  assert.equal(sectionMusique("", brief, "presente"), `${brief}. ${CONSIGNE_CONTINUITE_MUSIQUE_PRESENTE}`);
  assert.equal(sectionMusique("N/A", undefined, "discrete"), "N/A", "pas de description au brief : le texte compilé reste");
  // A project designed before the music intention: the compiled N/A or empty section stays.
  assert.equal(sectionMusique("N/A", brief, undefined), "N/A");
  assert.equal(sectionMusique("", brief, undefined), "");
  assert.equal(sectionMusique("Orchestra swells.", brief, "discrete"), `${brief}. ${CONSIGNE_CONTINUITE_MUSIQUE}`);
  assert.equal(sectionMusique("Orchestra swells.", brief, "presente"), `${brief}. ${CONSIGNE_CONTINUITE_MUSIQUE_PRESENTE}`);
  assert.equal(sectionMusique("Orchestra swells.", undefined, undefined), "Orchestra swells.", "pas de musique au brief : le texte compilé reste");
  assert.equal(musiqueDePlan("N/A"), null);
});
