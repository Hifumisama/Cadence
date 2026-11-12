import assert from "node:assert/strict";
import { test } from "node:test";
import { blocsDeLecture } from "./intent-reading";

test("blocsDeLecture : des paragraphes d'action et des répliques, dans l'ordre", () => {
  const texte = ["La Tenancière avance sans s'arrêter.", "Maya marche à son côté.", "", "Tenancière : « Tes mouvements sont parfaits, Maya. »", "Maya : « L'argent est dans la salle, Madame. »", "", "Elle se penche."].join("\n");
  assert.deepEqual(blocsDeLecture(texte), [
    { type: "action", texte: "La Tenancière avance sans s'arrêter. Maya marche à son côté." },
    { type: "replique", perso: "Tenancière", texte: "Tes mouvements sont parfaits, Maya." },
    { type: "replique", perso: "Maya", texte: "L'argent est dans la salle, Madame." },
    { type: "action", texte: "Elle se penche." },
  ]);
});

test("blocsDeLecture : une réplique collée à l'action la coupe en deux paragraphes ; texte vide ou null : rien", () => {
  assert.deepEqual(blocsDeLecture("Mai entre.\nMai : « Salut. »\nElle sourit."), [
    { type: "action", texte: "Mai entre." },
    { type: "replique", perso: "Mai", texte: "Salut." },
    { type: "action", texte: "Elle sourit." },
  ]);
  assert.deepEqual(blocsDeLecture(""), []);
  assert.deepEqual(blocsDeLecture(null), []);
  assert.deepEqual(blocsDeLecture("  \n\n "), []);
});

test("blocsDeLecture : une phrase avec deux-points mais sans guillemets reste de l'action ; retours chariot acceptés", () => {
  assert.deepEqual(blocsDeLecture("Ambiance : tendue.\r\nMai : « Oui. »"), [
    { type: "action", texte: "Ambiance : tendue." },
    { type: "replique", perso: "Mai", texte: "Oui." },
  ]);
});
