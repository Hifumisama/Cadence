import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AJOUTS_CREATIVITE,
  EXEMPLE_CREATIVITE,
  EXEMPLE_STYLE,
  FILMS_STYLE,
  PASTILLES_CREATIVITE,
  QUAND_CREATIVITE,
  QUAND_STYLE,
  SCENE_EXEMPLE,
} from "./examples";
import { AIDE_CREATIVITE, CREATIVITES, MISES_EN_SCENE } from "./settings";
import { STYLES_CAMERA } from "./styles-camera";

test("chaque niveau de créativité a son exemple, son « quand », ses ajouts ; chaque style son exemple, ses films et son « quand »", () => {
  for (const c of CREATIVITES) {
    assert.ok(EXEMPLE_CREATIVITE[c].length > 40, c);
    assert.ok(QUAND_CREATIVITE[c].length > 40, c);
    assert.ok(AIDE_CREATIVITE[c].length > 20, c);
    assert.deepEqual(Object.keys(AJOUTS_CREATIVITE[c]).sort(), PASTILLES_CREATIVITE.map((p) => p.cle).sort(), c);
  }
  // All the choices (directors and custom profiles) have their example and their « quand »; only the directors have films (no title is cited for a custom profile).
  for (const s of MISES_EN_SCENE) {
    assert.ok(EXEMPLE_STYLE[s].length > 60, s);
    assert.ok(QUAND_STYLE[s].length > 40, s);
  }
  for (const s of STYLES_CAMERA) assert.ok(FILMS_STYLE[s].length >= 3, `${s} : au moins 3 films`);
  assert.ok(SCENE_EXEMPLE.length > 0);
});

test("les ajouts de créativité suivent le paquet : sobre n'ajoute rien, équilibrée seulement de la musique, audacieuse et extrême les trois ajouts, seul « extrême » est au maximum", () => {
  const permis = (c: (typeof CREATIVITES)[number]) => PASTILLES_CREATIVITE.filter((p) => AJOUTS_CREATIVITE[c][p.cle]).map((p) => p.cle);
  assert.deepEqual(permis("restrained"), []);
  assert.deepEqual(permis("balanced"), ["musique"]);
  assert.deepEqual(permis("bold"), ["musique", "paroles", "texteEcran", "cameraAppuyee"]);
  assert.deepEqual(permis("extreme"), ["musique", "paroles", "texteEcran", "cameraAppuyee", "maximum"]);
  // Each level allows at least everything the previous one allows.
  for (let i = 1; i < CREATIVITES.length; i++) {
    for (const p of permis(CREATIVITES[i - 1]!)) assert.ok(permis(CREATIVITES[i]!).includes(p), `${CREATIVITES[i]} ⊇ ${CREATIVITES[i - 1]} (${p})`);
  }
});

test("les films d'un style ne se retrouvent pas chez un autre", () => {
  const tous = STYLES_CAMERA.flatMap((s) => FILMS_STYLE[s]);
  assert.equal(new Set(tous).size, tous.length);
});
