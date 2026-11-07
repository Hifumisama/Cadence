import assert from "node:assert/strict";
import { test } from "node:test";
import { IDS_PROFILS_PERSO } from "../h3ir/profils-perso";
import { bibliothequeStyles } from "./bibliotheque";
import { MISE_EN_SCENE_RECOMMANDEE, miseEnSceneRecommandee } from "./mise-en-scene-recommandee";

test("recommandations : chaque clé est un style de la bibliothèque, chaque valeur un profil perso", () => {
  const styles = new Set(bibliothequeStyles().map((s) => s.id));
  for (const [style, profil] of Object.entries(MISE_EN_SCENE_RECOMMANDEE)) {
    assert.ok(styles.has(style), `style inconnu : ${style}`);
    assert.ok((IDS_PROFILS_PERSO as readonly string[]).includes(profil), `profil inconnu : ${profil}`);
  }
});

test("recommandations : conservatrices (une minorité des styles), et le nom d'un style ne vaut jamais une clé héritée de l'objet", () => {
  assert.ok(Object.keys(MISE_EN_SCENE_RECOMMANDEE).length < bibliothequeStyles().length / 4);
  assert.equal(miseEnSceneRecommandee("claymation"), "claymation");
  assert.equal(miseEnSceneRecommandee("ghibli-style"), "anime-contemplatif");
  assert.equal(miseEnSceneRecommandee("van-gogh-style"), null);
  assert.equal(miseEnSceneRecommandee("toString"), null);
  assert.equal(miseEnSceneRecommandee(null), null);
  assert.equal(miseEnSceneRecommandee(undefined), null);
});
