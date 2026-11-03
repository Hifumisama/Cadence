import assert from "node:assert/strict";
import { test } from "node:test";
import { creativiteOuNull, estStyleCamera, LIBELLE_STYLE_CAMERA, resoudreReglages, styleCameraOuNull, STYLE_AUCUN } from "./reglages";
import { STYLES_CAMERA } from "./styles-camera";

test("creativiteOuNull / styleCameraOuNull : une valeur connue passe, le reste hérite (null) ; « aucun » est une valeur", () => {
  assert.equal(creativiteOuNull("bold"), "bold");
  assert.equal(creativiteOuNull("extrême"), null);
  assert.equal(creativiteOuNull(""), null);
  assert.equal(creativiteOuNull(undefined), null);
  assert.equal(styleCameraOuNull("villeneuve"), "villeneuve");
  assert.equal(styleCameraOuNull(STYLE_AUCUN), "aucun");
  assert.equal(styleCameraOuNull("kubrick"), null);
  assert.equal(styleCameraOuNull(null), null);
  assert.equal(estStyleCamera("aucun"), false, "« aucun » n'est pas un profil");
});

test("chaque style de caméra a son libellé", () => {
  for (const s of STYLES_CAMERA) assert.ok(LIBELLE_STYLE_CAMERA[s], s);
});

test("resoudreReglages : sans rien de réglé, les défauts (équilibrée, aucun style)", () => {
  assert.deepEqual(resoudreReglages({}), { creativite: "balanced", styleCamera: null, origine: { creativite: "defaut", styleCamera: "defaut" } });
  assert.deepEqual(resoudreReglages({ projet: { creativite: null, styleCamera: null }, scene: null, plan: undefined }).origine, { creativite: "defaut", styleCamera: "defaut" });
});

test("resoudreReglages : le plus précis gagne (plan > scène > projet), valeur par valeur", () => {
  const r = resoudreReglages({
    projet: { creativite: "restrained", styleCamera: "villeneuve" },
    scene: { creativite: "bold", styleCamera: null },
    plan: { creativite: null, styleCamera: "wong" },
  });
  assert.deepEqual(r, { creativite: "bold", styleCamera: "wong", origine: { creativite: "scene", styleCamera: "plan" } });
  const heritage = resoudreReglages({ projet: { creativite: "extreme", styleCamera: "cameron" }, scene: {}, plan: {} });
  assert.deepEqual(heritage, { creativite: "extreme", styleCamera: "cameron", origine: { creativite: "projet", styleCamera: "projet" } });
});

test("resoudreReglages : « aucun » force l'absence de style par-dessus un style plus haut, et n'est pas écrasé par plus haut", () => {
  const scene = resoudreReglages({ projet: { styleCamera: "villeneuve" }, scene: { styleCamera: "aucun" }, plan: { styleCamera: null } });
  assert.deepEqual(scene, { creativite: "balanced", styleCamera: null, origine: { creativite: "defaut", styleCamera: "scene" } });
  const plan = resoudreReglages({ projet: { styleCamera: "villeneuve" }, scene: { styleCamera: "bigelow" }, plan: { styleCamera: "aucun" } });
  assert.equal(plan.styleCamera, null);
  assert.equal(plan.origine.styleCamera, "plan");
  // Un plan peut aussi redonner un style sous une scène « aucun ».
  assert.equal(resoudreReglages({ scene: { styleCamera: "aucun" }, plan: { styleCamera: "wong" } }).styleCamera, "wong");
});

test("resoudreReglages : une valeur invalide stockée est ignorée comme si elle était vide", () => {
  const r = resoudreReglages({ projet: { creativite: "bold", styleCamera: "anderson" }, plan: { creativite: "inconnue", styleCamera: "kubrick" } });
  assert.deepEqual(r, { creativite: "bold", styleCamera: "anderson", origine: { creativite: "projet", styleCamera: "projet" } });
});

test("chaque style de caméra a un résumé court, une phrase de détail et un libellé « résumé — style de Nom »", async () => {
  const { RESUME_STYLE_CAMERA, DETAIL_STYLE_CAMERA, libelleStyleComplet } = await import("./reglages");
  for (const s of STYLES_CAMERA) {
    assert.ok(RESUME_STYLE_CAMERA[s].length > 0 && RESUME_STYLE_CAMERA[s].length <= 40, `${s} : résumé court`);
    assert.ok(DETAIL_STYLE_CAMERA[s].length > 40, `${s} : détail`);
  }
  assert.equal(libelleStyleComplet("villeneuve"), "Immense et silencieux — style de Denis Villeneuve");
  assert.equal(libelleStyleComplet("wong"), "Intime, nocturne, néons — style de Wong Kar-wai");
  // Les résumés se distinguent : deux styles ne partagent pas le même.
  assert.equal(new Set(STYLES_CAMERA.map((s) => RESUME_STYLE_CAMERA[s])).size, STYLES_CAMERA.length);
});
