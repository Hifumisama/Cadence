import { test } from "node:test";
import assert from "node:assert/strict";
import { APERCUS_STYLES, FAMILLES_STYLES, familleDuStyle } from "./showcase";

test("aperçus : un par style, le titre écrit dans la scène, chaque famille représentée", () => {
  assert.equal(new Set(APERCUS_STYLES.map((a) => a.id)).size, APERCUS_STYLES.length);
  for (const a of APERCUS_STYLES) assert.ok(a.scene.includes(`"${a.titre}"`), `${a.id} : le titre n'est pas demandé dans la scène`);
  for (const f of FAMILLES_STYLES) assert.ok(APERCUS_STYLES.some((a) => a.famille === f), `famille vide : ${f}`);
  assert.equal(familleDuStyle("ghibli-style"), "Anime & manga");
  assert.equal(familleDuStyle("inconnu"), "Illustration");
});
