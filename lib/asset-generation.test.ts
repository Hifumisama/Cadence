import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASPECTS,
  ASPECTS_COMFYUI,
  estAspect,
  formatParDefaut,
  loraParDefaut,
  nomSourceDistante,
  nouvelleSeed,
  raisonDemandeInvalide,
  raisonNonGenerable,
  type DemandeGeneration,
} from "./asset-generation";

test("format par défaut : décor en 16:9, le reste en carré", () => {
  assert.deepEqual(formatParDefaut("decor"), { aspect: "16:9", megapixels: 1.3 });
  assert.deepEqual(formatParDefaut("personnage"), { aspect: "1:1", megapixels: 1 });
  assert.ok(ASPECTS.every((a) => estAspect(a) && ASPECTS_COMFYUI[a].startsWith(a)));
  assert.ok(!estAspect("5:4"));
});

test("LoRA de fiche personnage : personnages seulement", () => {
  assert.equal(loraParDefaut("personnage"), true);
  assert.equal(loraParDefaut("decor"), false);
});

test("génération impossible au niveau asset : la voix seulement", () => {
  const ok = { type: "decor", promptGeneration: "A hall", methodeGeneration: null };
  assert.equal(raisonNonGenerable(ok), null);
  assert.equal(raisonNonGenerable({ type: "decor" }), null);
  // l'édition et le prompt vide ne bloquent plus l'asset : la popup les vérifie
  assert.equal(raisonNonGenerable({ ...ok, methodeGeneration: "edition" }), null);
  assert.equal(raisonNonGenerable({ ...ok, promptGeneration: "  " }), null);
  assert.match(raisonNonGenerable({ ...ok, type: "voix" }) ?? "", /casting vocal/);
});

const demande: DemandeGeneration = {
  mode: "texte",
  prompt: "A hall",
  aspect: "16:9",
  megapixels: 1.3,
  loraPersonnage: false,
  sources: [],
};

test("demande : mode texte", () => {
  assert.equal(raisonDemandeInvalide(demande), null);
  assert.match(raisonDemandeInvalide({ ...demande, prompt: "  " }) ?? "", /prompt/);
  assert.match(raisonDemandeInvalide({ ...demande, aspect: "5:4" as never }) ?? "", /Format/);
  assert.match(raisonDemandeInvalide({ ...demande, megapixels: 9 }) ?? "", /Mégapixels/);
  assert.match(raisonDemandeInvalide({ ...demande, megapixels: Number.NaN }) ?? "", /Mégapixels/);
});

test("demande : mode images, de 1 à 3 sources sans doublon", () => {
  const images = { ...demande, mode: "images" as const, aspect: "nimporte" as never, megapixels: 99 };
  const a = { origine: "asset" as const, assetId: 1 };
  const b = { origine: "asset" as const, assetId: 2 };
  const c = { origine: "import" as const, fichier: "x.png" };
  const d = { origine: "import" as const, fichier: "y.png" };
  // format et mégapixels ne comptent pas en mode images
  assert.equal(raisonDemandeInvalide({ ...images, sources: [a] }), null);
  assert.equal(raisonDemandeInvalide({ ...images, sources: [a, b, c] }), null);
  assert.match(raisonDemandeInvalide({ ...images, sources: [] }) ?? "", /au moins une image/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [a, b, c, d] }) ?? "", /maximum/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [a, a] }) ?? "", /deux fois/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [c, { ...c }] }) ?? "", /deux fois/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [{ origine: "web" } as never] }) ?? "", /inconnue/);
});

test("nom de source côté ComfyUI : unique par génération et par rang", () => {
  assert.equal(nomSourceDistante("abc", 2, ".png"), "cadence_abc_2.png");
  assert.notEqual(nomSourceDistante("abc", 1, ".png"), nomSourceDistante("abc", 2, ".png"));
});

test("seed : entier positif sûr", () => {
  const s = Number(nouvelleSeed());
  assert.ok(Number.isSafeInteger(s) && s >= 0);
});
