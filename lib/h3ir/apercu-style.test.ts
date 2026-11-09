import assert from "node:assert/strict";
import { test } from "node:test";
import { APERCU_STYLE, PICTOS, apercuDe, rappelleDe } from "./apercu-style";
import { FILMS_STYLE } from "./exemples";
import { MISES_EN_SCENE, STYLE_AUCUN } from "./reglages";
import { STYLES_CAMERA } from "./styles-camera";

test("chaque mise en scène a un pictogramme connu et trois mots-clés courts, distincts", () => {
  assert.deepEqual(Object.keys(APERCU_STYLE).sort(), [...MISES_EN_SCENE].sort());
  for (const s of MISES_EN_SCENE) {
    const a = APERCU_STYLE[s];
    assert.ok((PICTOS as readonly string[]).includes(a.picto), s);
    assert.equal(new Set(a.mots).size, 3, s);
    for (const m of a.mots) assert.ok(m.length > 2 && m.length <= 22, `${s} : ${m}`);
  }
});

test("« Rappelle » : trois films pour un réalisateur, un genre (sans titre) pour un profil perso, rien pour « aucun » ou un inconnu", () => {
  for (const s of STYLES_CAMERA) assert.equal(rappelleDe(s), FILMS_STYLE[s].slice(0, 3).join(" · "));
  for (const s of MISES_EN_SCENE.filter((m) => !(STYLES_CAMERA as readonly string[]).includes(m))) assert.ok(rappelleDe(s).length > 10, s);
  assert.equal(rappelleDe(STYLE_AUCUN), "");
  assert.equal(rappelleDe("inconnu"), "");
});

test("apercuDe : « aucun » a son aperçu, un inconnu n'en a pas", () => {
  assert.equal(apercuDe(STYLE_AUCUN)?.picto, "aucun");
  assert.equal(apercuDe("cameron")?.picto, "travelling");
  assert.equal(apercuDe("zzz"), null);
});
