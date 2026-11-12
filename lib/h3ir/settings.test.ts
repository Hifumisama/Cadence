import assert from "node:assert/strict";
import { test } from "node:test";
import { creativiteOuNull, estStyleCamera, LIBELLE_STYLE_CAMERA, resoudreReglages, styleCameraOuNull, STYLE_AUCUN } from "./settings";
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
  // A clip can also give a style back under a « aucun » scene.
  assert.equal(resoudreReglages({ scene: { styleCamera: "aucun" }, plan: { styleCamera: "wong" } }).styleCamera, "wong");
});

test("resoudreReglages : une valeur invalide stockée est ignorée comme si elle était vide", () => {
  const r = resoudreReglages({ projet: { creativite: "bold", styleCamera: "anderson" }, plan: { creativite: "inconnue", styleCamera: "kubrick" } });
  assert.deepEqual(r, { creativite: "bold", styleCamera: "anderson", origine: { creativite: "projet", styleCamera: "projet" } });
});

test("chaque style de caméra a un résumé court, une phrase de détail et un libellé « résumé — style de Nom »", async () => {
  const { RESUME_STYLE_CAMERA, DETAIL_STYLE_CAMERA, libelleStyleComplet } = await import("./settings");
  for (const s of STYLES_CAMERA) {
    assert.ok(RESUME_STYLE_CAMERA[s].length > 0 && RESUME_STYLE_CAMERA[s].length <= 40, `${s} : résumé court`);
    assert.ok(DETAIL_STYLE_CAMERA[s].length > 40, `${s} : détail`);
  }
  assert.equal(libelleStyleComplet("villeneuve"), "Immense et silencieux — style de Denis Villeneuve");
  assert.equal(libelleStyleComplet("wong"), "Intime, nocturne, néons — style de Wong Kar-wai");
  // The summaries are distinct: two styles do not share the same one.
  assert.equal(new Set(STYLES_CAMERA.map((s) => RESUME_STYLE_CAMERA[s])).size, STYLES_CAMERA.length);
});

test("profils perso : ce sont de vrais choix de mise en scène (validation, héritage plan > scène > projet), distincts des 7 réalisateurs, sans nom de réalisateur à montrer", async () => {
  const { IDS_PROFILS_PERSO } = await import("./character-profiles");
  const { MISES_EN_SCENE, RESUME_STYLE_CAMERA, DETAIL_STYLE_CAMERA, estMiseEnScene, estProfilPerso, libelleStyleComplet, signatureChoix, infobulleChoix } = await import("./settings");
  assert.equal(MISES_EN_SCENE.length, STYLES_CAMERA.length + IDS_PROFILS_PERSO.length);
  assert.equal(new Set(MISES_EN_SCENE).size, MISES_EN_SCENE.length, "aucun identifiant en double entre réalisateurs et profils perso");
  for (const id of IDS_PROFILS_PERSO) {
    assert.ok(id.length <= 20, `${id} tient dans style_camera (varchar(20))`);
    assert.equal(styleCameraOuNull(id), id);
    assert.equal(estProfilPerso(id), true);
    assert.equal(estStyleCamera(id), false, "ce n'est pas un des 7 profils `director`");
    assert.equal(signatureChoix(id), "", "pas de nom propre à montrer");
    assert.equal(libelleStyleComplet(id), RESUME_STYLE_CAMERA[id]);
    assert.ok(DETAIL_STYLE_CAMERA[id].length > 30 && infobulleChoix(id).startsWith(RESUME_STYLE_CAMERA[id]), id);
  }
  assert.equal(estMiseEnScene("claymation"), true);
  assert.equal(estMiseEnScene("villeneuve"), true);
  assert.equal(estMiseEnScene("aucun"), false);
  assert.equal(styleCameraOuNull("kubrick"), null);
  assert.equal(signatureChoix("villeneuve"), "style de Denis Villeneuve");
  const r = resoudreReglages({ projet: { styleCamera: "claymation" }, scene: { styleCamera: null }, plan: { styleCamera: null } });
  assert.deepEqual([r.styleCamera, r.origine.styleCamera], ["claymation", "projet"]);
  const p = resoudreReglages({ projet: { styleCamera: "claymation" }, scene: { styleCamera: "horreur" }, plan: { styleCamera: "wong" } });
  assert.deepEqual([p.styleCamera, p.origine.styleCamera], ["wong", "plan"]);
  assert.equal(resoudreReglages({ projet: { styleCamera: "claymation" }, scene: { styleCamera: "aucun" } }).styleCamera, null);
});
