import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { controleurPourSkill } from "../llm/checks";
import { chargerSkill } from "../llm/skills";
import { valider } from "../llm/validation";
import { MISES_EN_SCENE, STYLE_AUCUN, CREATIVITES } from "../h3ir/settings";
import {
  contexteDepuisEntree,
  controlerSortieIterationPlan,
  decisionsEffectives,
  diagnosticIteration,
  historiqueIteration,
  notesDecisions,
  raisonSansEcriture,
  type ContexteIteration,
  type DecisionsSortie,
  type SortieIterationPlan,
} from "./iteration-clip";

const DESC_AVANT = "Mai attend devant le feu, les mains tendues vers les flammes.\nMai : « Il viendra. »";
const DESC_APRES = "Mai attend devant le feu, les mains tendues vers les flammes, puis se lève et recule d'un pas.\nMai : « Il viendra. »";

const ctx = (over: Partial<ContexteIteration> = {}): ContexteIteration => ({
  description: DESC_AVANT,
  refs: [
    { type: "picture", slot: 1, asset: "CHAR_mai" },
    { type: "picture", slot: 2, asset: "DEC_clairiere" },
    { type: "audio", slot: 1, asset: "CHAR_mai" },
  ],
  registre: [
    { code: "CHAR_mai", type: "personnage", image: true },
    { code: "DEC_clairiere", type: "decor", image: true },
    { code: "PROP_lampe", type: "prop", image: true },
    { code: "PROP_torche", type: "prop", image: false },
    { code: "VOIX_off", type: "voix" },
    { code: "VOICE_mai", type: "voix" },
  ],
  dureeGenerationSecondes: 6,
  dureeReelleSecondes: null,
  reglages: { creativite: "balanced", styleMiseEnScene: STYLE_AUCUN },
  ...over,
});

const decisions = (over: Partial<DecisionsSortie> = {}): DecisionsSortie => ({
  nouvelleDescription: "",
  dureeSecondes: null,
  references: { ajouter: [], retirer: [] },
  manquants: [],
  reglages: { creativite: null, styleMiseEnScene: null },
  ...over,
});

const sortie = (over: Partial<SortieIterationPlan> = {}, dec: Partial<DecisionsSortie> = {}): SortieIterationPlan => ({
  dureeCoherente: true,
  symptome: "L'utilisateur veut une caméra qui suive Mai.",
  cause: "Créativité équilibrée : la caméra reste posée.",
  categorie: "camera",
  confiance: "moyenne",
  verification: "La caméra accompagne Mai.",
  abandon: { propose: false, raison: "" },
  decisions: decisions({ reglages: { creativite: "bold", styleMiseEnScene: null }, ...dec }),
  ...over,
});

const erreurs = (s: SortieIterationPlan, c = ctx()) => controlerSortieIterationPlan(s, c).filter((x) => x.niveau === "erreur").map((x) => x.regle);
const alertes = (s: SortieIterationPlan, c = ctx()) => controlerSortieIterationPlan(s, c).filter((x) => x.niveau === "alerte").map((x) => x.regle);

test("le schéma de sortie accepte des décisions types (réglage, intent, références, durée, manquants) et refuse l'ancien contrat", () => {
  const schema = chargerSkill("iteration-plan").schema;
  const v = valider(schema, sortie({ entreeLexique: { symptome: "caméra posée", cause: "créativité sobre", formulationQuiTient: "creativity bold" } }));
  assert.ok(v.ok, v.ok ? "" : v.erreurs.join(" ; "));
  const tout = sortie({}, {
    nouvelleDescription: DESC_APRES,
    dureeSecondes: 8,
    references: { ajouter: ["PROP_lampe"], retirer: ["DEC_clairiere"] },
    manquants: [{ code: "DEC_clairiere_nuit", type: "decor", parent: "DEC_clairiere", description: "La clairière de nuit.", raison: "Aucune image de nuit." }],
    reglages: { creativite: "restrained", styleMiseEnScene: "sitcom" },
  });
  const v2 = valider(schema, tout);
  assert.ok(v2.ok, v2.ok ? "" : v2.erreurs.join(" ; "));
  // no more passes: the old contract is refused by the schema
  assert.equal(valider(schema, { ...sortie(), changements: [] }).ok, false);
  // three missing assets: refused (two at most)
  const m = { code: "PROP_x", type: "prop", description: "x", raison: "y" };
  assert.equal(valider(schema, sortie({}, { manquants: [m, m, m] })).ok, false);
  // duration out of bounds: refused
  assert.equal(valider(schema, sortie({}, { dureeSecondes: 12 })).ok, false);
});

test("le schéma liste exactement les valeurs de réglage de lib/h3ir/settings.ts", () => {
  const brut = JSON.parse(readFileSync(join(process.cwd(), "agents/skills/iteration-plan/assets/sortie.schema.json"), "utf-8"));
  const r = brut.properties.decisions.properties.reglages.properties;
  assert.deepEqual(r.creativite.enum.filter((v: unknown) => v !== null), [...CREATIVITES]);
  assert.deepEqual([...r.styleMiseEnScene.enum.filter((v: unknown) => v !== null)].sort(), [STYLE_AUCUN, ...MISES_EN_SCENE].sort());
});

test("le skill est générique (aucun nom de projet) et lit sa propre copie du lexique", () => {
  const s = chargerSkill("iteration-plan");
  assert.ok(s.fichiers.some((f) => f.endsWith("iteration-plan/references/guide-lexique-diagnostic.md")));
  assert.ok(!s.fichiers.some((f) => f.endsWith("h3-lexique-corrections.md")), "iteration-plan lit sa copie du lexique, pas l'original");
  assert.ok(!/avatar|katara|aang/i.test(s.systeme));
});

test("un réglage seul : décision effective, rien d'autre ne bouge ; la même valeur que l'actuelle n'est pas une décision", () => {
  assert.deepEqual(decisionsEffectives(sortie(), ctx()), { reglages: { creativite: "bold" } });
  assert.equal(raisonSansEcriture(sortie(), ctx()), null);
  assert.deepEqual(erreurs(sortie()), []);
  // the current creativity given again: nothing to recompile
  const meme = sortie({}, { reglages: { creativite: "balanced", styleMiseEnScene: STYLE_AUCUN } });
  assert.equal(decisionsEffectives(meme, ctx()), null);
  assert.match(raisonSansEcriture(meme, ctx()) ?? "", /aucune décision/);
  // a style: it REPLACES the clip's one ("aucun" → sitcom; sitcom → aucun)
  assert.deepEqual(decisionsEffectives(sortie({}, { reglages: { creativite: null, styleMiseEnScene: "sitcom" } }), ctx()), { reglages: { styleCamera: "sitcom" } });
  assert.deepEqual(
    decisionsEffectives(sortie({}, { reglages: { creativite: null, styleMiseEnScene: STYLE_AUCUN } }), ctx({ reglages: { creativite: "balanced", styleMiseEnScene: "sitcom" } })),
    { reglages: { styleCamera: STYLE_AUCUN } },
  );
});

test("réglage inconnu : erreur de contrat (renvoi) et jamais retenu", () => {
  const s = sortie({}, { reglages: { creativite: "folle", styleMiseEnScene: "kubrick" } });
  assert.deepEqual(erreurs(s), ["reglage-inconnu", "reglage-inconnu"]);
  assert.equal(decisionsEffectives(s, ctx()), null);
});

test("intent : la nouvelle description COMPLÈTE est retenue, sans ancien état de fin ; identique à l'actuelle, ce n'est rien", () => {
  const s = sortie({}, { nouvelleDescription: DESC_APRES, reglages: { creativite: null, styleMiseEnScene: null } });
  assert.deepEqual(decisionsEffectives(s, ctx()), { description: DESC_APRES });
  assert.deepEqual(erreurs(s), []);
  const avecEtat = sortie({}, { nouvelleDescription: `${DESC_APRES}\n\nÉtat en fin de plan : Mai debout.`, reglages: { creativite: null, styleMiseEnScene: null } });
  assert.equal(decisionsEffectives(avecEtat, ctx())!.description, DESC_APRES);
  const identique = sortie({}, { nouvelleDescription: DESC_AVANT, reglages: { creativite: null, styleMiseEnScene: null } });
  assert.equal(decisionsEffectives(identique, ctx()), null);
  // the current one still carries the old end state: the same without it is not a change
  assert.equal(decisionsEffectives(identique, ctx({ description: `${DESC_AVANT}\n\nÉtat en fin de plan : Mai assise.` })), null);
});

test("intent : une réplique perdue est une alerte (la consigne peut la retirer), pas un renvoi", () => {
  const sans = sortie({}, { nouvelleDescription: "Mai attend devant le feu, les mains tendues vers les flammes, puis se lève sans un mot.", reglages: { creativite: null, styleMiseEnScene: null } });
  assert.deepEqual(erreurs(sans), []);
  assert.ok(alertes(sans).includes("description-repliques"));
});

// The clip "Le feu" (project 236, run 3906): a complete description, written with the old "État en fin de plan".
const DESC_FEU =
  "Un feu au centre de la clairière, la forêt autour. Mai, assise à gauche du feu, frotte deux pierres au-dessus d'un tas de brindilles ; une étincelle jaillit, " +
  "les brindilles fument puis s'embrasent. Elle se penche, souffle doucement, et les flammes montent en éclairant son visage. Elle sourit, soulagée, les mains tendues vers la chaleur.\n" +
  "Mai : « Enfin. »\n\n" +
  "État en fin de plan : Mai assise à gauche du feu, tournée vers lui, les mains tendues ; le feu bien pris, haut et clair, éclaire la clairière.";
// What the agent returned: ONLY a state sentence, 222 characters.
const FRAGMENT_FEU =
  "État en fin de plan : Mai est assise à gauche du feu, de profil, tournée vers les flammes, les deux mains tendues au-dessus des braises ; le feu brûle haut et clair au centre de la clairière, la forêt sombre autour.";

test("bug du plan « Le feu » : un intent réduit à un fragment est refusé (renvoi), jamais écrit, et ne fait rien recompiler", () => {
  const c = ctx({ description: DESC_FEU });
  const fragment = sortie({}, { nouvelleDescription: FRAGMENT_FEU, reglages: { creativite: null, styleMiseEnScene: null } });
  assert.ok(erreurs(fragment, c).includes("description-incomplete"));
  assert.equal(decisionsEffectives(fragment, c), null);
  assert.match(raisonSansEcriture(fragment, c) ?? "", /incomplète/);
  // the only sentence changed: refused likewise
  assert.ok(erreurs(sortie({}, { nouvelleDescription: "Mai se retourne vers la forêt.", reglages: { creativite: null, styleMiseEnScene: null } }), c).includes("description-incomplete"));
  // a fragment with another lever: the other lever passes, the intent does not change
  const mixte = sortie({}, { nouvelleDescription: FRAGMENT_FEU, dureeSecondes: 8 });
  assert.deepEqual(decisionsEffectives(mixte, c), { dureeSecondes: 8, reglages: { creativite: "bold" } });
  // the complete description, retouched, passes
  const complete = DESC_FEU.replace("Elle sourit, soulagée", "Elle sourit, puis se retourne vers la forêt").replace(/\n\nÉtat en fin de plan[\s\S]*$/, "");
  const bonne = sortie({}, { nouvelleDescription: complete, reglages: { creativite: null, styleMiseEnScene: null } });
  assert.deepEqual(erreurs(bonne, c), []);
  assert.equal(decisionsEffectives(bonne, c)!.description, complete);
  // the diagnosis keeps nothing of it either
  assert.equal(diagnosticIteration(fragment, { plan: { intention: DESC_FEU, dureeVoulueSecondes: 6 } })!.decisions, null);
});

test("durée : 4 à 10 s, différente de l'actuelle ; hors bornes = erreur de contrat", () => {
  assert.equal(decisionsEffectives(sortie({}, { dureeSecondes: 9, reglages: { creativite: null, styleMiseEnScene: null } }), ctx())!.dureeSecondes, 9);
  assert.equal(decisionsEffectives(sortie({}, { dureeSecondes: 6, reglages: { creativite: null, styleMiseEnScene: null } }), ctx()), null, "la même durée ne change rien");
  for (const hors of [3, 12, 7.5]) {
    const s = sortie({}, { dureeSecondes: hors, reglages: { creativite: null, styleMiseEnScene: null } });
    assert.equal(decisionsEffectives(s, ctx()), null, `${hors} s est ignoré`);
    assert.ok(erreurs(s).includes("duree-invalide"));
  }
});

test("références : ajouter / retirer par code du registre ; les erreurs de contrat", () => {
  const s = sortie({}, { references: { ajouter: ["PROP_lampe"], retirer: ["DEC_clairiere"] }, reglages: { creativite: null, styleMiseEnScene: null } });
  assert.deepEqual(erreurs(s), []);
  assert.deepEqual(decisionsEffectives(s, ctx()), { references: { ajouter: ["PROP_lampe"], retirer: ["DEC_clairiere"] } });
  const r = (ajouter: string[], retirer: string[] = []) => erreurs(sortie({}, { references: { ajouter, retirer }, reglages: { creativite: null, styleMiseEnScene: null } }));
  assert.deepEqual(r(["PROP_inventee"]), ["ajout-inconnu"]);
  assert.deepEqual(r(["VOICE_mai"]), ["ajout-nature"]);
  assert.deepEqual(r(["VOIX_off"]), ["ajout-nature"]);
  assert.deepEqual(r(["CHAR_mai"]), ["ajout-doublon"]);
  assert.deepEqual(r(["PROP_lampe", "PROP_lampe"]), ["ajout-doublon"]);
  assert.deepEqual(r([], ["PROP_lampe"]), ["retrait-inconnu"]);
  assert.deepEqual(r([], ["CHAR_mai", "DEC_clairiere"]), ["plus-d-image"]);
  const pleine = ctx({ refs: Array.from({ length: 6 }, (_, i) => ({ type: "picture" as const, slot: i + 1, asset: i === 0 ? "CHAR_mai" : `DEC_${i}` })) });
  assert.ok(erreurs(sortie({}, { references: { ajouter: ["PROP_lampe"], retirer: [] } }), pleine).includes("trop-d-images"));
  // a references block in error is never kept (the other levers, if any)
  assert.deepEqual(decisionsEffectives(sortie({}, { references: { ajouter: ["PROP_inventee"], retirer: [] } }), ctx()), { reglages: { creativite: "bold" } });
  // removing then re-adding the same image: nothing changes
  assert.equal(decisionsEffectives(sortie({}, { references: { ajouter: ["CHAR_mai"], retirer: ["CHAR_mai"] }, reglages: { creativite: null, styleMiseEnScene: null } }), ctx()), null);
});

test("références : une image ajoutée sans fichier est une ALERTE (la recompilation la refusera, « images manquantes »)", () => {
  const s = sortie({}, { references: { ajouter: ["PROP_torche"], retirer: [] }, reglages: { creativite: null, styleMiseEnScene: null } });
  assert.deepEqual(erreurs(s), []);
  assert.ok(alertes(s).includes("ajout-sans-image"));
  assert.deepEqual(decisionsEffectives(s, ctx()), { references: { ajouter: ["PROP_torche"], retirer: [] } });
});

test("manquants : deux au plus, jamais un code du registre ; seuls, ils suffisent à recompiler (créés d'office, vague 4a)", () => {
  const m = (code: string) => ({ code, type: "prop", description: "x", raison: "aucune image" });
  assert.ok(erreurs(sortie({}, { manquants: [m("PROP_a"), m("PROP_b"), m("PROP_c")] })).includes("trop-de-manquants"));
  assert.ok(erreurs(sortie({}, { manquants: [m("PROP_lampe")] })).includes("manquant-existe"));
  const seuls = sortie({}, { manquants: [{ code: "CHAR_mai_blessee", type: "personnage", parent: "CHAR_mai", description: "Mai blessée.", raison: "Aucune image de cet état." }], reglages: { creativite: null, styleMiseEnScene: null } });
  const dec = decisionsEffectives(seuls, ctx());
  assert.deepEqual(dec?.manquants?.map((x) => [x.code, x.type]), [["CHAR_mai_blessee", "personnage"]]);
  assert.equal(raisonSansEcriture(seuls, ctx()), null);
  const d = diagnosticIteration(seuls, { plan: { intention: DESC_AVANT, dureeVoulueSecondes: 6 } })!;
  assert.deepEqual(d.assetsSuggeres, [{ code: "CHAR_mai_blessee", type: "personnage", parent: "CHAR_mai", raison: "Aucune image de cet état." }]);
  assert.equal(d.decisions?.manquants?.[0]?.code, "CHAR_mai_blessee");
  assert.deepEqual(d.affichage!.manquants, [{ code: "CHAR_mai_blessee", raison: "Aucune image de cet état." }]);
  // A missing asset of a type not created outright (an effect) makes no decision: the reason says so.
  const effet = sortie({}, { manquants: [{ code: "VFX_brume", type: "vfx", description: "Brume.", raison: "x" }], reglages: { creativite: null, styleMiseEnScene: null } });
  assert.equal(decisionsEffectives(effet, ctx()), null);
  assert.match(raisonSansEcriture(effet, ctx()) ?? "", /VFX_brume.*pas valides/);
});

test("durée incohérente (mesurée ou jugée) et abandon : aucune décision retenue, alertes sans renvoi", () => {
  const court = ctx({ dureeReelleSecondes: 3.02 });
  assert.match(raisonSansEcriture(sortie(), court) ?? "", /3,02 s.*6 s/);
  assert.ok(alertes(sortie(), court).includes("duree"));
  assert.deepEqual(erreurs(sortie({}, { nouvelleDescription: FRAGMENT_FEU }), court), [], "pas de renvoi pour des décisions ignorées");
  assert.equal(raisonSansEcriture(sortie(), ctx({ dureeReelleSecondes: 6.583 })), null, "la durée effective de 6 s est cohérente");
  const juge = sortie({ dureeCoherente: false });
  assert.match(raisonSansEcriture(juge, ctx()) ?? "", /durée/);
  assert.equal(diagnosticIteration(juge, { plan: { intention: DESC_AVANT, dureeVoulueSecondes: 6 } })!.decisions, null);
  const abandon = sortie({ abandon: { propose: true, raison: "Trois causes tentées : remplacer la course par une marche." } });
  assert.match(raisonSansEcriture(abandon, ctx()) ?? "", /abandonner.*marche/);
  assert.ok(alertes(abandon).includes("ignores"));
  assert.equal(diagnosticIteration(abandon, {})!.decisions, null);
  const decoupage = sortie({ categorie: "decoupage-scenario" }, { reglages: { creativite: null, styleMiseEnScene: null } });
  assert.match(raisonSansEcriture(decoupage, ctx()) ?? "", /découpage/);
});

test("le contrôleur du worker lit l'entrée du skill (références, registre avec images, réglages, durée réelle) et ne renvoie que les erreurs", () => {
  const entree = {
    plan: { titre: "Le feu", intention: DESC_AVANT, dureeVoulueSecondes: 6 },
    references: [
      { label: "<Picture 1>", type: "picture", slot: 1, asset: "CHAR_mai" },
      { label: "<Picture 2>", type: "picture", slot: 2, asset: "DEC_clairiere" },
    ],
    registre: [
      { code: "CHAR_mai", type: "personnage", description: "", image: true },
      { code: "PROP_lampe", type: "prop", description: "", image: false },
    ],
    reglages: { creativite: { actuelle: "bold", regleSur: "ce plan" }, styleMiseEnScene: { actuel: "aucun", regleSur: "le réglage par défaut" } },
    rendu: { dureeReelleSecondes: 6.04 },
  };
  const c = contexteDepuisEntree(entree);
  assert.equal(c.refs.length, 2);
  assert.equal(c.dureeReelleSecondes, 6.04);
  assert.deepEqual(c.reglages, { creativite: "bold", styleMiseEnScene: "aucun" });
  assert.equal(c.registre!.find((a) => a.code === "PROP_lampe")!.image, false);
  const controler = controleurPourSkill("iteration-plan", entree)!;
  assert.deepEqual(controler(sortie({}, { reglages: { creativite: "restrained", styleMiseEnScene: null } })), []);
  assert.deepEqual(controler(sortie({ confiance: "faible" }, { references: { ajouter: ["PROP_lampe"], retirer: [] } })), [], "une alerte ne renvoie pas");
  const msgs = controler(sortie({}, { references: { ajouter: ["PROP_inventee"], retirer: [] } }));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0]!, /PROP_inventee/);
  // creativity already "bold" on the clip: giving it again is not a decision
  assert.equal(decisionsEffectives(sortie(), c), null);
});

test("diagnostic : décisions effectives et affichage avant → après ; notes de l'essai", () => {
  assert.equal(diagnosticIteration(null), null);
  assert.equal(diagnosticIteration({ foo: 1 }), null);
  const entree = { plan: { intention: DESC_AVANT, dureeVoulueSecondes: 6 }, references: [{ type: "picture", slot: 1, asset: "CHAR_mai" }], registre: [{ code: "CHAR_mai", type: "personnage" }, { code: "PROP_lampe", type: "prop", image: true }], reglages: { creativite: { actuelle: "balanced" }, styleMiseEnScene: { actuel: "aucun" } } };
  const s = sortie({ entreeLexique: { symptome: "s", cause: "c", formulationQuiTient: "f" } }, { nouvelleDescription: DESC_APRES, dureeSecondes: 8, references: { ajouter: ["PROP_lampe"], retirer: [] }, reglages: { creativite: "bold", styleMiseEnScene: "sitcom" } });
  const d = diagnosticIteration(s, entree)!;
  assert.equal(d.confiance, "moyenne");
  assert.deepEqual(d.entreeLexique, { symptome: "s", cause: "c", formulationQuiTient: "f" });
  assert.deepEqual(d.decisions, { description: DESC_APRES, dureeSecondes: 8, references: { ajouter: ["PROP_lampe"], retirer: [] }, reglages: { creativite: "bold", styleCamera: "sitcom" } });
  assert.deepEqual(d.affichage!.intent, { avant: DESC_AVANT, apres: DESC_APRES });
  assert.deepEqual(d.affichage!.duree, { avant: 6, apres: 8 });
  assert.deepEqual(d.affichage!.referencesAjoutees, ["PROP_lampe"]);
  assert.deepEqual(d.affichage!.reglages, [
    { libelle: "Créativité", avant: "Équilibrée", apres: "Audacieuse" },
    { libelle: "Style de mise en scène", avant: "aucun style", apres: "Sitcom" },
  ]);
  const notes = notesDecisions(d.affichage);
  assert.ok(notes.some((n) => /Intent du plan réécrit/.test(n)));
  assert.ok(notes.includes("Durée : 6 s → 8 s."));
  assert.ok(notes.includes("Références : + PROP_lampe."));
  assert.ok(notes.includes("Créativité du plan : Équilibrée → Audacieuse."));
  // a result of the OLD contract (passes changes): a diagnosis, without decisions
  const ancien = diagnosticIteration({ dureeCoherente: true, symptome: "x", cause: "y", confiance: "haute", changements: [{ section: "summary", avant: "a", apres: "b" }], abandon: { propose: false, raison: "" } });
  assert.equal(ancien!.decisions, null);
});

test("historique : minimal et honnête (appliquée, non appliquée, sans écriture)", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 2, h));
  const entree = { plan: { intention: DESC_AVANT, dureeVoulueSecondes: 6 }, reglages: { creativite: { actuelle: "balanced" }, styleMiseEnScene: { actuel: "aucun" } } };
  const h = historiqueIteration(
    [
      { createdAt: t(12), appliedAt: null, statut: "prete", consigne: "toujours le fond", resultat: sortie(), entree, nbChangements: 0 },
      { createdAt: t(10), appliedAt: t(11), statut: "appliquee", consigne: "le fond défile", resultat: sortie(), entree, nbChangements: 0 },
      { createdAt: t(13), appliedAt: null, statut: "prete", consigne: "durée", resultat: sortie({ dureeCoherente: false }), entree, nbChangements: 0 },
      { createdAt: t(14), appliedAt: null, statut: "echouee", consigne: "x", resultat: null, nbChangements: 0 },
    ],
    [t(9), new Date(t(11).getTime() + 30 * 60_000)],
  );
  assert.deepEqual(
    h.map((x) => [x.ceQuiAvaitEteVu, x.issue, x.renduDepuis]),
    [
      ["le fond défile", "appliquee", true],
      ["toujours le fond", "non_appliquee", false],
      ["durée", "sans_ecriture", false],
    ],
  );
});

test("durée : un rendu de 6 s dure 6,583 s sur la grille d'images, ce qui reste cohérent", async () => {
  const { dureesCoherentes } = await import("./iteration-clip");
  assert.equal(dureesCoherentes(6, 6.583), true);
  assert.equal(dureesCoherentes(6, 6.04), true);
  assert.equal(dureesCoherentes(10, 10.125), true);
  assert.equal(dureesCoherentes(6, 7.4), false);
  assert.equal(dureesCoherentes(6, 3.02), false);
});
