import { test } from "node:test";
import assert from "node:assert/strict";
import {
  controlerDialogues,
  controlerStructure,
  ecartVerbatim,
  extraireBalisesD,
  prochainSlotAudioLibre,
  calculerStatutDuree,
  type RepliqueLiee,
} from "./plan-checks";

const rep = (id: number, texte: string, extra: Partial<RepliqueLiee> = {}): RepliqueLiee => ({
  id,
  texte,
  audioPresent: true,
  priseObsolete: false,
  ...extra,
});

const prompt = (contenu: string) => [{ section: "detailed_description", contenu }];

test("balises <d> : langue, texte et emplacement exact", () => {
  const contenu = "She says, <d>[Français] Magnifique, n'est-ce pas ?</d> and smiles.";
  const [b] = extraireBalisesD(prompt(contenu));
  assert.ok(b);
  assert.equal(b.langue, "Français");
  assert.equal(b.texte, "Magnifique, n'est-ce pas ?");
  assert.equal(contenu.slice(b.debut, b.fin), b.texte);
});

test("balise sans langue, espaces autour du texte ignorés", () => {
  const [b] = extraireBalisesD(prompt("<d>  Bonjour  </d>"));
  assert.equal(b?.langue, null);
  assert.equal(b?.texte, "Bonjour");
});

test("réplique citée mot pour mot : rien à signaler", () => {
  const c = controlerDialogues(prompt("<d>[Français] Je reviens demain.</d>"), [rep(1, "Je reviens demain.")]);
  assert.equal(c.ok, true);
  assert.deepEqual(c.parReplique, { 1: "ok" });
});

test("réplique absente du prompt", () => {
  const c = controlerDialogues(prompt("Aucun dialogue ici."), [rep(1, "Je reviens demain.")]);
  assert.equal(c.ok, false);
  assert.deepEqual(c.problemes.map((p) => p.type), ["absente"]);
  assert.equal(c.parReplique[1], "absente");
});

test("ponctuation différente : « différente » avec écart surligné", () => {
  const c = controlerDialogues(prompt("<d>[Français] Je reviens demain</d>"), [rep(1, "Je reviens demain.")]);
  const p = c.problemes[0];
  assert.equal(p?.type, "differente");
  if (p?.type !== "differente") return;
  assert.equal(p.trouve, "Je reviens demain");
  assert.deepEqual(p.ecart, [
    { type: "=", texte: "Je reviens demain" },
    { type: "-", texte: "." },
  ]);
});

test("mot reformulé : l'écart isole le mot", () => {
  const ecart = ecartVerbatim("Tu ne passeras pas", "Tu ne passeras jamais");
  assert.deepEqual(ecart, [
    { type: "=", texte: "Tu ne passeras " },
    { type: "-", texte: "pas" },
    { type: "+", texte: "jamais" },
  ]);
});

test("balise sans réplique liée : orpheline", () => {
  const c = controlerDialogues(prompt("<d>[Français] Bonjour</d>"), []);
  assert.deepEqual(c.problemes.map((p) => p.type), ["orpheline"]);
});

test("texte sans rapport : absente + orpheline, pas « différente »", () => {
  const c = controlerDialogues(prompt("<d>[Français] Complètement autre chose ici</d>"), [rep(1, "Silence.")]);
  assert.deepEqual(c.problemes.map((p) => p.type).sort(), ["absente", "orpheline"]);
});

test("deux répliques identiques : chacune consomme sa propre balise", () => {
  const un = controlerDialogues(prompt("<d>Oui.</d>"), [rep(1, "Oui."), rep(2, "Oui.")]);
  assert.deepEqual(un.parReplique, { 1: "ok", 2: "absente" });
  const deux = controlerDialogues(prompt("<d>Oui.</d> <d>Oui.</d>"), [rep(1, "Oui."), rep(2, "Oui.")]);
  assert.equal(deux.ok, true);
});

test("plusieurs répliques par plan, dans une autre ordre que le prompt", () => {
  const c = controlerDialogues(prompt("<d>[Français] B.</d> puis <d>[Français] A.</d>"), [rep(1, "A."), rep(2, "B.")]);
  assert.equal(c.ok, true);
});

test("balises réparties sur plusieurs sections", () => {
  const c = controlerDialogues(
    [
      { section: "summary", contenu: "<d>Un.</d>" },
      { section: "detailed_description", contenu: "<d>Deux.</d>" },
    ],
    [rep(1, "Un."), rep(2, "Deux.")],
  );
  assert.equal(c.ok, true);
});

test("réplique sans prise audio, ou prise obsolète : signalé", () => {
  const c = controlerDialogues(prompt("<d>Un.</d> <d>Deux.</d>"), [
    rep(1, "Un.", { audioPresent: false }),
    rep(2, "Deux.", { priseObsolete: true }),
  ]);
  assert.deepEqual(c.problemes.map((p) => p.type), ["sans_audio", "prise_obsolete"]);
  assert.equal(c.ok, false);
});

test("emplacements audio : plus petit libre, null quand plein", () => {
  assert.equal(prochainSlotAudioLibre([]), 1);
  assert.equal(prochainSlotAudioLibre([1, 3]), 2);
  assert.equal(prochainSlotAudioLibre([1, 2, 3]), null);
});

test("durée voix : non mesurée bloque, mesurée compare au plafond avec marge", () => {
  assert.equal(calculerStatutDuree([{ dureeSecondes: null }], 15, 2).statut, "a_mesurer");
  assert.equal(calculerStatutDuree([{ dureeSecondes: 6.5 }, { dureeSecondes: 6 }], 15, 2).statut, "tient");
  assert.equal(calculerStatutDuree([{ dureeSecondes: 13.5 }], 15, 2).statut, "decoupage_a_envisager");
});

// --- Structure des shots -------------------------------------------------

const desc = (contenu: string) => [{ section: "detailed_description", contenu }];

test("structure : plan bien formé, aucun signalement", () => {
  const p = controlerStructure(
    desc("Cinematic anime style. [Shot 1] A wide shot. [Shot 2] At 00:03.000, Hard cut to a close-up. [Shot 3] At 00:06.500, Hard cut to a low-angle."),
    9,
  );
  assert.deepEqual(p, []);
});

test("structure : durée non entière ou hors 5-15", () => {
  assert.equal(controlerStructure([], 3)[0]?.type, "duree_invalide");
  assert.equal(controlerStructure([], 16)[0]?.type, "duree_invalide");
  assert.equal(controlerStructure([], 7.5)[0]?.type, "duree_invalide");
  assert.deepEqual(controlerStructure([], 12), []);
});

test("structure : shot 1 qui démarre tard, shot suivant sans timecode", () => {
  const p = controlerStructure(desc("[Shot 1, 00:01.000–00:03.000] A wide shot. [Shot 2] A close-up."), 8).map((x) => x.type);
  assert.ok(p.includes("shot1_timecode"));
  assert.ok(p.includes("shot_timecode_manquant"));
});

test("structure : shot sous 1,5 s, timecode hors ordre et hors durée", () => {
  const court = controlerStructure(desc("[Shot 1] A. [Shot 2] At 00:01.000, Hard cut to B."), 8).map((x) => x.type);
  assert.ok(court.includes("shot_trop_court"));
  const ordre = controlerStructure(desc("[Shot 1] A. [Shot 2] At 00:04.000, Hard cut to B. [Shot 3] At 00:03.000, Hard cut to C."), 9).map((x) => x.type);
  assert.ok(ordre.includes("shot_hors_ordre"));
  const hors = controlerStructure(desc("[Shot 1] A. [Shot 2] At 00:10.000, Hard cut to B."), 8).map((x) => x.type);
  assert.ok(hors.includes("shot_hors_duree"));
});

test("structure : dernier shot trop court, aucun shot", () => {
  const dernier = controlerStructure(desc("[Shot 1] A. [Shot 2] At 00:07.000, Hard cut to B."), 8).map((x) => x.type);
  assert.ok(dernier.includes("shot_trop_court"));
  assert.equal(controlerStructure(desc("Just text."), 8)[0]?.type, "aucun_shot");
  assert.deepEqual(controlerStructure([], 8), []);
});

test("structure : la forme à intervalle des plans validés est acceptée", () => {
  const ok = controlerStructure(
    desc("[Shot 1, 00:00.000–00:02.000] A wide. [Shot 2, 00:02.000–00:05.000] A profile. [Shot 3, 00:05.000–00:07.000] A third."),
    7,
  );
  assert.deepEqual(ok, []);
  const court = controlerStructure(desc("[Shot 1, 00:00.000–00:01.000] A. [Shot 2, 00:01.000–00:07.000] B."), 7).map((x) => x.type);
  assert.deepEqual(court, ["shot_trop_court"]);
});
