import { test } from "node:test";
import assert from "node:assert/strict";
import { motsCapitalisesInternes } from "./clause";


const style = {
  nom: "Van Gogh Style",
  descriptor: "A turbulent post-impressionist painting style built on thick impasto. Influenced by: Vincent van Gogh, post-impressionist painting tradition, Studio Ghibli production technique.",
};

test("motsCapitalisesInternes : ignore le premier mot de chaque phrase, garde les noms propres", () => {
  assert.deepEqual(motsCapitalisesInternes(style.descriptor), ["Vincent", "Gogh", "Studio", "Ghibli"]);
  assert.deepEqual(motsCapitalisesInternes("A soft look. Another sentence about Paris."), ["Paris"]);
});
