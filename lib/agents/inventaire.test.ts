import test from "node:test";
import assert from "node:assert/strict";
import { depuisInventaire, ressemblant, type SortieInventaire } from "./inventaire";

const registre = [
  { code: "CHAR_iris", type: "personnage" },
  { code: "DEC_phare", type: "decor" },
  { code: "PROP_lanterne", type: "prop" },
];

const sortie = (assets: SortieInventaire["assets"]): SortieInventaire => ({ assets, notes: "" });
const a = (code: string, type: string, extra: Partial<SortieInventaire["assets"][number]> = {}) => ({ code, type, description: "x", plans: ["Plan 1"], raison: "r", ...extra });

test("depuisInventaire : une création par asset, sans prompt, avec la raison et les plans", () => {
  const r = depuisInventaire(sortie([a("PROP_clef", "prop", { raison: "elle ouvre la porte" })]), registre);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.cibleType, "asset");
  assert.equal(r[0]!.operation, "creer");
  assert.equal(r[0]!.cle, "nouvel-asset-PROP_clef");
  assert.deepEqual(r[0]!.apres, { type: "prop", suffixe: "clef", description: "x", critique: false });
  assert.match(r[0]!.avertissements![0]!.texte, /elle ouvre la porte/);
  assert.match(r[0]!.avertissements![0]!.texte, /Plan 1/);
});

test("depuisInventaire : ce qui existe déjà et les doublons de la sortie sont écartés", () => {
  const r = depuisInventaire(sortie([a("PROP_lanterne", "prop"), a("PROP_clef", "prop"), a("prop_clef", "prop"), a("PROP_", "prop"), a("VOICE_x", "voix")]), registre);
  assert.deepEqual(r.map((c) => c.cle), ["nouvel-asset-PROP_clef"]);
});

test("depuisInventaire : un asset qui ressemble à un existant est signalé, pas refusé", () => {
  const r = depuisInventaire(sortie([a("PROP_lanterne_cassee", "prop")]), registre);
  assert.equal(r.length, 1);
  assert.ok(r[0]!.avertissements!.some((v) => v.type === "alerte_controle" && /PROP_lanterne/.test(v.texte)));
});

test("depuisInventaire : parent du registre ou créé ici ; parent introuvable signalé", () => {
  const r = depuisInventaire(
    sortie([a("DEC_phare_nuit", "decor", { parent: "DEC_phare" }), a("DEC_cave", "decor"), a("DEC_cave_inondee", "decor", { parent: "DEC_cave" }), a("PROP_x", "prop", { parent: "PROP_nulle_part" })]),
    registre,
  );
  const par = (code: string) => r.find((c) => c.cle === `nouvel-asset-${code}`)!;
  assert.equal((par("DEC_phare_nuit").apres as Record<string, unknown>).deriveDeCode, "DEC_phare");
  assert.equal((par("DEC_cave_inondee").apres as Record<string, unknown>).deriveDeCle, "nouvel-asset-DEC_cave");
  assert.ok(par("PROP_x").avertissements!.some((v) => /introuvable/.test(v.texte)));
  // le dérivé d'un asset créé ici vient après lui
  assert.ok(r.findIndex((c) => c.cle === "nouvel-asset-DEC_cave") < r.findIndex((c) => c.cle === "nouvel-asset-DEC_cave_inondee"));
});

test("ressemblant : même type et mots communs seulement", () => {
  assert.equal(ressemblant("prop", "lanterne_cassee", registre), "PROP_lanterne");
  assert.equal(ressemblant("decor", "lanterne", registre), null);
  assert.equal(ressemblant("prop", "clef", registre), null);
});
