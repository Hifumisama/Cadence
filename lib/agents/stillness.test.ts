import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "./fixtures/stillness-259.json";
import { controleurPourSkill } from "../llm/checks";
import { constatsImmobilite, finitAuRepos, nomsPersonnagesDeLEntree, phrasesPartagees, planImmobile, planVide, signesImmobilite, gestesRepetes } from "./stillness";

// Project 259 (2026-11-16): a sensual dance that turns into hell. ~50 s out of 100 were a character standing still or an empty set.
const plans = fixture.plans;
const noms = fixture.personnages;
const desc = (handle: string) => plans.find((p) => p.plan === handle)!.description;

test("259: the still plans are flagged, the dance and the explosion are not", () => {
  const immobiles = plans.filter((p) => planImmobile(p.description)).map((p) => p.plan);
  assert.deepEqual(immobiles, ["P03", "P05", "P06", "P07"]);
});

test("259: a brief freeze inside an action is not a still plan (P04: « s'arrête net, son corps se figeant un instant »)", () => {
  assert.equal(planImmobile(desc("P04")), false);
  assert.equal(finitAuRepos(desc("P04")), false);
  assert.deepEqual(signesImmobilite(desc("P04")).signes, []);
});

test("259: the empty plans (ashes and flames fading) are flagged, with or without the character names", () => {
  assert.deepEqual(plans.filter((p) => planVide(p.description, noms)).map((p) => p.plan), ["P10", "P11"]);
  assert.deepEqual(plans.filter((p) => planVide(p.description)).map((p) => p.plan), ["P10", "P11"]);
  // P09: the dancer dissolves in the explosion, she is still acting
  assert.equal(planVide(desc("P09"), noms), false);
});

test("259: P06 and P07 share whole sentences; a recurring set-up (« au centre de la Scène de Danse ») is not a duplicate", () => {
  const paires = phrasesPartagees(plans);
  assert.deepEqual(paires.map((x) => [x.a, x.b]), [["P06", "P07"]]);
  assert.ok(paires[0]!.phrases.some((p) => p.startsWith("La lumière verte et cendrée crée des ombres franches")));
});

test("259: findings per plan, phrased as instructions", () => {
  const c = constatsImmobilite(plans, noms);
  assert.deepEqual(
    c.map((x) => x.plan),
    ["P03", "P05", "P06", "P07", "P10", "P11", "P07"],
  );
  assert.match(c[1]!.message, /^P05 : le personnage reste figé .*action continue/);
  assert.match(c[4]!.message, /^P10 : aucun personnage/);
  assert.match(c[6]!.message, /^P06 et P07 partagent des phrases entières/);
});

test("rest ending: the last narrative sentence, meta comments and author instructions aside", () => {
  assert.equal(finitAuRepos("Elle court vers la porte. Elle s'arrête devant le seuil."), true);
  assert.equal(finitAuRepos("Elle court vers la porte. Elle s'arrête un instant puis l'ouvre d'un coup d'épaule."), false);
  assert.equal(finitAuRepos("Elle tourne sur elle-même. Elle termine dans une position de grâce, une main tendue."), true);
  assert.equal(finitAuRepos("Elle reste immobile. Puis elle bondit vers la fenêtre.\nCe plan est statique.\nConsigne de l'auteur : elle reste immobile."), false);
  // a single holding marker in the last sentence is a rest ending, not a still plan
  assert.equal(planImmobile("Il traverse la rue en courant. Il reste planté devant la vitrine."), false);
  assert.equal(planImmobile("Il reste planté devant la vitrine. Puis il traverse la rue en courant."), true);
});

test("markers: accents, attend, and no match inside other words", () => {
  assert.equal(signesImmobilite("Elle attend sous la pluie. Elle s'attend au pire.").signes.length, 1);
  assert.deepEqual(signesImmobilite("Le marchand vante l'immobilité du lac.").signes, []);
  assert.deepEqual(signesImmobilite("Les figurants se figent.").signes, []);
  // lines of dialogue are not narrative
  assert.deepEqual(signesImmobilite("Il ouvre la porte.\nMarc : « Reste immobile, et attends. »").signes, []);
});

test("the scenario-scene checker re-prompts with the stillness findings (one resend, lib/llm/execute.ts)", () => {
  const controler = controleurPourSkill("scenario-scene", { briefExtrait: { personnages: noms.map((nom) => ({ nom })) } })!;
  const scene3 = plans.filter((p) => p.scene === 3).map(({ titre, description }) => ({ titre, description }));
  const messages = controler({ plans: scene3 });
  assert.equal(messages.length, 2);
  assert.match(messages[0]!, /^Le plan « La cendre qui s'éteint » : aucun personnage/);
  const scene1 = plans.filter((p) => p.scene === 1).map(({ titre, description }) => ({ titre, description }));
  assert.deepEqual(controler({ plans: scene1.slice(0, 2) }), [], "the dance plans pass");
});

test("names of characters from a skill input", () => {
  assert.deepEqual(nomsPersonnagesDeLEntree({ briefExtrait: { personnages: [{ nom: "La Danseuse" }, { nom: 3 }] } }), ["La Danseuse"]);
  assert.deepEqual(nomsPersonnagesDeLEntree({}), []);
  assert.deepEqual(nomsPersonnagesDeLEntree(null), []);
});

test("planVide : un personnage est présent par son prénom, par le premier mot de son nom ou par un pronom (banc du 2026-11-17)", () => {
  const noms = ["Tifa Lockhart", "Soldat de Shinra"];
  assert.equal(planVide("Tifa glisse en diagonale et attrape son poignet.", noms), false);
  assert.equal(planVide("Les deux soldats chargent, boucliers levés.", noms), false);
  assert.equal(planVide("Elle tourne sur elle-même, la tache noire monte sur sa robe.", ["La Danseuse"]), false);
  assert.equal(planVide("La fumée verte retombe sur la scène vide.", ["La Danseuse"]), true);
});

test("gestesRepetes : un plan qui ne fait que reprendre les gestes du précédent", () => {
  const plans = [
    { plan: "P1", description: "Elle ondule des hanches puis tourne sur elle-même au centre de la scène." },
    { plan: "P2", description: "Elle tournoie encore, se balance d'un pied sur l'autre." },
    { plan: "P3", description: "Elle bondit vers les bougies et glisse au sol sur un genou." },
    { plan: "P4", description: "Elle tourne la tête vers la porte." },
  ];
  const r = gestesRepetes(plans);
  assert.deepEqual(r.map((x) => [x.a, x.b]), [["P1", "P2"]]);
  assert.deepEqual(r[0]!.familles.sort(), ["ondulation", "rotation"]);
  assert.match(constatsImmobilite(plans.slice(0, 2), ["Lola"]).map((c) => c.message).join("|"), /reprend les gestes de P1/);
});
