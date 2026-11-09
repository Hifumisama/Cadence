import assert from "node:assert/strict";
import { test } from "node:test";
import { controleurPourSkill } from "../llm/controles";
import { chargerSkill } from "../llm/skills";
import { valider } from "../llm/validation";
import { cocheParDefaut } from "./cochage";
import { evaluerEcrasementFiche, lireApresFiche, verifierFiche, type EtatPlanFiche } from "./fiches";
import {
  appliquerChangements,
  contexteDepuisEntree,
  controlerSortieIterationPlan,
  depuisIterationPlan,
  diagnosticIteration,
  historiqueIteration,
  raisonSansEcriture,
  trouverPassage,
  type PlanPourIteration,
  type SortieIterationPlan,
} from "./iteration-plan";

const UUID = "0b0e5a8e-1c4f-4e7e-9a63-3f1d2c4b5a69";

const DESCRIPTION =
  "Cinematic anime style. [Shot 1] A medium shot of <Subject 1> walking through <Subject 2>, the camera tracking alongside. <Subject 1> says <d>[Français] Pas un bruit.</d> " +
  "[Shot 2] At 00:03.000, Hard cut to a close-up of <Subject 1>'s hand on the railing, the camera locked.";

const plan = (over: Partial<PlanPourIteration> = {}): PlanPourIteration => ({
  uuid: UUID,
  titre: "Le couloir",
  sections: {
    subject_definitions: "<Subject 1> is Maya from <Picture 1>.\n<Subject 2> is the corridor from <Picture 2>.",
    summary: "[reference generation] The target video shows <Subject 1> crossing <Subject 2>.",
    retention_analysis: "<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - identity.",
    detailed_description: DESCRIPTION,
    overall_soundscape: "Footsteps on stone, a door creaks <Audio 2>.",
    non_diegetic_music: "N/A",
  },
  refs: [
    { type: "picture", slot: 1 },
    { type: "picture", slot: 2 },
    { type: "audio", slot: 2 },
    { type: "audio", slot: 1 },
  ],
  dureeGenerationSecondes: 6,
  dureeReelleSecondes: 6.04,
  ...over,
});

const sortie = (over: Partial<SortieIterationPlan> = {}): SortieIterationPlan => ({
  dureeCoherente: true,
  symptome: "À 1 s et 2 s, le décor défile derrière Maya alors que le plan devait rester posé.",
  cause: "Mention de démarche dans un plan serré : le fond défile (lexique §4).",
  categorie: "camera",
  confiance: "moyenne",
  changements: [
    {
      section: "detailed_description",
      avant: "walking through <Subject 2>, the camera tracking alongside.",
      apres: "standing still in <Subject 2>, the camera locked, the background motionless.",
    },
  ],
  verification: "Entre 0 et 3 s, le couloir ne doit plus défiler.",
  abandon: { propose: false, raison: "" },
  reecriture: false,
  nouvelleDescription: "",
  ...over,
});

const erreurs = (s: SortieIterationPlan, p = plan()) => controlerSortieIterationPlan(s, p).filter((x) => x.niveau === "erreur").map((x) => x.regle);

test("le schéma de sortie accepte une correction type", () => {
  const v = valider(chargerSkill("iteration-plan").schema, sortie({ entreeLexique: { symptome: "fond qui défile", cause: "démarche en plan serré", formulationQuiTient: "the camera locked" } }));
  assert.ok(v.ok, v.ok ? "" : v.erreurs.join(" ; "));
});

test("une correction simple : écriture PARTIELLE de la seule section touchée, passages pour la revue", () => {
  const ch = depuisIterationPlan(sortie(), plan());
  assert.equal(ch.length, 1);
  const c = ch[0]!;
  assert.equal(c.cibleType, "fiche");
  assert.equal(c.cibleRef, UUID);
  assert.equal(c.operation, "modifier");
  const a = lireApresFiche(c.apres);
  assert.deepEqual(Object.keys(a.sections!), ["detailed_description"]);
  assert.ok(a.sections!.detailed_description!.includes("standing still in <Subject 2>, the camera locked"));
  assert.ok(a.sections!.detailed_description!.includes("<d>[Français] Pas un bruit.</d>"), "la réplique est intacte");
  assert.equal(a.refs, undefined, "les références ne bougent pas");
  assert.equal(a.dureeGenerationSecondes, undefined, "la durée ne bouge pas");
  assert.equal(a.passages!.length, 1);
  assert.equal(a.passages![0]!.avant, "walking through <Subject 2>, the camera tracking alongside.");
  assert.deepEqual(c.avertissements, []);
  assert.equal(raisonSansEcriture(sortie(), plan()), null);
});

test("un plan avec rendu : écrasement à cocher, décoché par défaut (règles de lib/agents/fiches.ts)", () => {
  const a = lireApresFiche(depuisIterationPlan(sortie(), plan())[0]!.apres);
  const etat: EtatPlanFiche = {
    titre: "Le couloir",
    sections: plan().sections,
    refs: [
      { type: "picture", slot: 1, asset: "CHAR_maya" },
      { type: "picture", slot: 2, asset: "DEC_couloir" },
      { type: "audio", slot: 2, asset: "SFX_porte" },
      { type: "audio", slot: 1, asset: "CHAR_maya" },
    ],
    registre: new Map([["CHAR_maya", "personnage"], ["DEC_couloir", "decor"], ["SFX_porte", "sfx"]]),
    aUnRendu: true,
    dureeGenerationSecondes: 6,
  };
  assert.equal(verifierFiche(a, etat), null, "une écriture partielle cohérente est acceptée par l'applicateur");
  const e = evaluerEcrasementFiche(a, etat);
  assert.deepEqual(Object.keys(e.avant.sections!), ["detailed_description"], "l'avant ne porte que la section touchée");
  assert.match(e.ecrase ?? "", /1 section du prompt \(detailed_description\)/);
  assert.ok(e.avertissements.some((x) => x.type === "ecrase_valide"));
  assert.equal(cocheParDefaut({ operation: "modifier", avertissements: e.avertissements, ecrase: e.ecrase, refuseRaison: null }), false);
});

test("aucune modification proposée : rien n'est écrit, la raison est dite", () => {
  const s = sortie({ changements: [] });
  assert.deepEqual(depuisIterationPlan(s, plan()), []);
  assert.match(raisonSansEcriture(s, plan()) ?? "", /aucune modification/);
  assert.deepEqual(erreurs(s), []);
  // Des passages qui ne changent rien
  const identique = sortie({ changements: [{ section: "summary", avant: "crossing", apres: "crossing" }] });
  assert.deepEqual(depuisIterationPlan(identique, plan()), []);
  assert.match(raisonSansEcriture(identique, plan()) ?? "", /ne changent rien/);
});

test("section inconnue : erreur de contrat (renvoi)", () => {
  const s = sortie({ changements: [{ section: "titre", avant: "a", apres: "b" }] });
  assert.deepEqual(erreurs(s), ["section-inconnue"]);
});

test("passage introuvable, ambigu, ou aux blancs près", () => {
  assert.deepEqual(erreurs(sortie({ changements: [{ section: "detailed_description", avant: "running through the market", apres: "x" }] })), ["passage-introuvable"]);
  assert.deepEqual(erreurs(sortie({ changements: [{ section: "detailed_description", avant: "<Subject 1>", apres: "Maya" }] })), ["passage-ambigu"]);
  // Le modèle a recopié avec un retour à la ligne et des espaces doublés : tolérance aux blancs seulement.
  assert.deepEqual(trouverPassage("a b\n  c d", "b c"), { debut: 2, fin: 7 });
  const tolere = sortie({ changements: [{ section: "detailed_description", avant: "walking  through\n<Subject 2>,", apres: "standing in <Subject 2>," }] });
  assert.deepEqual(erreurs(tolere), []);
  assert.ok(lireApresFiche(depuisIterationPlan(tolere, plan())[0]!.apres).sections!.detailed_description!.includes("standing in <Subject 2>, the camera tracking"));
});

test("labels : seuls ceux du plan (références, voix, sujets déjà définis)", () => {
  const avec = (apres: string) => sortie({ changements: [{ section: "detailed_description", avant: "the camera tracking alongside.", apres }] });
  assert.deepEqual(erreurs(avec("the camera locked on <Subject 2> from <Picture 2>.")), []);
  assert.deepEqual(erreurs(avec("the camera locked, <Audio 1> heard.")), [], "la voix (slot d'une réplique) est un label connu");
  assert.deepEqual(erreurs(avec("the camera locked on <Subject 3>.")), ["label-inconnu"]);
  assert.deepEqual(erreurs(avec("a lantern from <Picture 4> glows.")), ["label-inconnu"]);
  assert.deepEqual(erreurs(avec("[[PROP_lanterne]] glows.")), ["marqueur"]);
});

const alertesDe = (s: SortieIterationPlan) => controlerSortieIterationPlan(s, plan()).filter((x) => x.niveau === "alerte").map((x) => x.regle);

test("réplique changée, ajoutée ou retirée : libre, ni alerte ni renvoi (le prompt est la seule source, 2026-10-14)", () => {
  const modifiee = sortie({ changements: [{ section: "detailed_description", avant: "<d>[Français] Pas un bruit.</d>", apres: "<d>[Français] Pas un seul bruit.</d>" }] });
  assert.deepEqual(erreurs(modifiee), []);
  assert.deepEqual(alertesDe(modifiee), []);
  const retiree = sortie({ changements: [{ section: "detailed_description", avant: "<Subject 1> says <d>[Français] Pas un bruit.</d> ", apres: "" }] });
  assert.deepEqual(erreurs(retiree), []);
  assert.deepEqual(alertesDe(retiree), []);
});

test("une erreur qui persiste après le renvoi BLOQUE la fiche (pas d'écriture à moitié)", () => {
  const s = sortie({
    changements: [
      sortie().changements[0]!,
      { section: "summary", avant: "crossing <Subject 2>.", apres: "crossing <Subject 2> past <Subject 5>." },
    ],
  });
  const ch = depuisIterationPlan(s, plan());
  assert.equal(ch.length, 1);
  assert.ok(ch[0]!.avertissements!.some((a) => a.type === "bloque_controle" && /Subject 5/.test(a.texte)));
});

test("durée incohérente : mesurée par le code ou jugée par l'agent, aucune écriture", () => {
  const court = plan({ dureeReelleSecondes: 3.02 });
  assert.deepEqual(depuisIterationPlan(sortie(), court), []);
  assert.match(raisonSansEcriture(sortie(), court) ?? "", /3,02 s.*6 s/);
  assert.ok(controlerSortieIterationPlan(sortie(), court).some((p) => p.regle === "duree" && p.niveau === "alerte"));
  assert.deepEqual(erreurs(sortie(), court), [], "pas de renvoi pour des changements qui seront ignorés");
  const juge = sortie({ dureeCoherente: false });
  assert.deepEqual(depuisIterationPlan(juge, plan()), []);
  assert.match(raisonSansEcriture(juge, plan()) ?? "", /durée/);
  // Tolérance d'une demi-seconde
  assert.equal(depuisIterationPlan(sortie(), plan({ dureeReelleSecondes: 6.4 })).length, 1);
});

test("abandon et cause hors du prompt : information, pas de changement", () => {
  const abandon = sortie({ abandon: { propose: true, raison: "Trois causes tentées (cadence, caméra, négation) : remplacer la course par une marche." } });
  assert.deepEqual(depuisIterationPlan(abandon, plan()), []);
  assert.match(raisonSansEcriture(abandon, plan()) ?? "", /abandonner.*marche/);
  const decoupage = sortie({ categorie: "decoupage-scenario", changements: [] });
  assert.deepEqual(depuisIterationPlan(decoupage, plan()), []);
  assert.match(raisonSansEcriture(decoupage, plan()) ?? "", /découpage/);
  // Étiquette « découpage » mais passages écrits (consigne qui change l'action du plan) : la correction est appliquée.
  const etiquetteSeule = sortie({ categorie: "decoupage-scenario" });
  assert.equal(raisonSansEcriture(etiquetteSeule, plan()), null);
  assert.equal(depuisIterationPlan(etiquetteSeule, plan()).length, 1);
});

test("confiance faible et structure des shots dégradée : alertes, la correction reste proposée", () => {
  const s = sortie({
    confiance: "faible",
    changements: [{ section: "detailed_description", avant: "At 00:03.000, Hard cut", apres: "At 00:05.500, Hard cut" }],
  });
  const ch = depuisIterationPlan(s, plan());
  assert.equal(ch.length, 1);
  const textes = ch[0]!.avertissements!.map((a) => `${a.type}:${a.texte}`);
  assert.ok(textes.some((t) => t.startsWith("alerte_controle:Confiance faible")));
  assert.ok(textes.some((t) => t.startsWith("alerte_controle:Structure des shots") && /dernier shot/.test(t)));
  assert.ok(!ch[0]!.avertissements!.some((a) => a.type === "bloque_controle"));
});

test("le contrôleur du worker ne renvoie que les erreurs, depuis l'entrée textuelle du skill", () => {
  const p = plan();
  const entree = {
    plan: { titre: p.titre, dureeVoulueSecondes: 6 },
    promptActuel: p.sections,
    references: [
      { label: "<Picture 1>", type: "picture", slot: 1, asset: "CHAR_maya" },
      { label: "<Picture 2>", type: "picture", slot: 2, asset: "DEC_couloir" },
      { label: "<Audio 2>", type: "audio", slot: 2, asset: "SFX_porte" },
      { label: "<Audio 1>", type: "audio", slot: 1, asset: "CHAR_maya" },
    ],
    rendu: { dureeReelleSecondes: 6.04 },
  };
  const ctx = contexteDepuisEntree(entree);
  assert.equal(ctx.refs.length, 4);
  assert.equal(ctx.dureeReelleSecondes, 6.04);
  const controler = controleurPourSkill("iteration-plan", entree)!;
  assert.deepEqual(controler(sortie()), []);
  assert.deepEqual(controler(sortie({ confiance: "faible" })), [], "une alerte ne renvoie pas");
  const msgs = controler(sortie({ changements: [{ section: "detailed_description", avant: "the camera tracking alongside.", apres: "<Subject 9> watches." }] }));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0]!, /<Subject 9>/);
});

test("appliquerChangements enchaîne deux passages d'une même section", () => {
  const a = appliquerChangements({ summary: "un deux trois" }, [
    { section: "summary", avant: "deux", apres: "2" },
    { section: "summary", avant: "un 2", apres: "1 2" },
  ]);
  assert.equal(a.sections.summary, "1 2 trois");
  assert.equal(a.passages.length, 2);
});

test("diagnostic et historique : minimal et honnête", () => {
  assert.equal(diagnosticIteration(null), null);
  assert.equal(diagnosticIteration({ foo: 1 }), null);
  const d = diagnosticIteration(sortie({ entreeLexique: { symptome: "s", cause: "c", formulationQuiTient: "f" } }))!;
  assert.equal(d.confiance, "moyenne");
  assert.equal(d.nbPassages, 1);
  assert.equal(d.verification, "Entre 0 et 3 s, le couloir ne doit plus défiler.");
  assert.deepEqual(d.entreeLexique, { symptome: "s", cause: "c", formulationQuiTient: "f" });

  const t = (h: number) => new Date(Date.UTC(2026, 9, 2, h));
  const h = historiqueIteration(
    [
      { createdAt: t(12), appliedAt: null, statut: "rejetee", consigne: "toujours le fond", resultat: sortie(), nbChangements: 1 },
      { createdAt: t(10), appliedAt: t(11), statut: "appliquee", consigne: "le fond défile", resultat: sortie(), nbChangements: 1 },
      { createdAt: t(13), appliedAt: null, statut: "prete", consigne: "durée", resultat: sortie({ dureeCoherente: false, changements: [] }), nbChangements: 0 },
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

// ── références : ajouter / retirer, renumérotation par le code ───────────────────

const planAvecRefs = (over: Partial<PlanPourIteration> = {}): PlanPourIteration =>
  plan({
    refs: [
      { type: "picture", slot: 1, asset: "CHAR_maya", role: "héroïne" },
      { type: "picture", slot: 2, asset: "DEC_couloir", role: "décor" },
      { type: "audio", slot: 2, asset: "SFX_porte", role: null, retention: "reference" },
    ],
    registre: [
      { code: "CHAR_maya", type: "personnage" },
      { code: "DEC_couloir", type: "decor" },
      { code: "PROP_lampe", type: "prop" },
      { code: "SFX_porte", type: "sfx" },
      { code: "VOICE_maya", type: "voix" },
    ],
    ...over,
  });

const ajoutLampe = (extra: Partial<SortieIterationPlan> = {}): SortieIterationPlan =>
  sortie({
    changements: [{ section: "detailed_description", avant: "walking through <Subject 2>, the camera tracking alongside.", apres: "walking through <Subject 2>, holding [[PROP_lampe]], the camera tracking alongside." }],
    references: { ajouter: [{ asset: "PROP_lampe", nom: "the oil lamp", role: "accessoire" }] },
    ...extra,
  });

test("références : ajouter une image du registre — label posé, sections à jour, marqueur résolu, liste complète", () => {
  const p = planAvecRefs();
  assert.deepEqual(controlerSortieIterationPlan(ajoutLampe(), p).filter((x) => x.niveau === "erreur"), []);
  const [ch] = depuisIterationPlan(ajoutLampe(), p);
  const apres = lireApresFiche(ch!.apres);
  assert.match(apres.sections!.detailed_description!, /holding <Subject 3>, the camera/);
  assert.ok(apres.sections!.subject_definitions!.endsWith("<Subject 3> is the oil lamp from <Picture 3>."));
  assert.match(apres.sections!.retention_analysis!, /<Subject 3> \(not cited in a shot\): fully_preserved/);
  assert.deepEqual(
    apres.refs!.map((r) => `${r.type}:${r.slot}:${r.asset}`),
    ["picture:1:CHAR_maya", "picture:2:DEC_couloir", "picture:3:PROP_lampe", "audio:2:SFX_porte"],
  );
  assert.equal(apres.refs!.find((r) => r.asset === "SFX_porte")!.retention, "reference", "le son garde sa rétention");
  assert.ok(ch!.avertissements!.some((a) => a.type === "info" && /PROP_lampe → <Subject 3>/.test(a.texte)));
});

test("références : une écriture de références seule, sans passage, est une vraie écriture", () => {
  const s = sortie({ changements: [], references: { ajouter: [{ asset: "PROP_lampe", nom: "the oil lamp" }] } });
  assert.equal(raisonSansEcriture(s, planAvecRefs()), null);
  const [ch] = depuisIterationPlan(s, planAvecRefs());
  assert.equal(lireApresFiche(ch!.apres).refs!.length, 4);
});

test("références : retirer une image du milieu renumérote les suivantes, sans trou", () => {
  const p = planAvecRefs({
    refs: [
      { type: "picture", slot: 1, asset: "CHAR_maya" },
      { type: "picture", slot: 2, asset: "DEC_couloir" },
      { type: "picture", slot: 3, asset: "PROP_lampe" },
    ],
    sections: {
      subject_definitions: "<Subject 1> is Maya from <Picture 1>.\n<Subject 2> is the corridor from <Picture 2>.\n<Subject 3> is the lamp from <Picture 3>.",
      summary: "[reference generation] <Subject 1> crosses <Subject 2> with <Subject 3>.",
      retention_analysis: "<Subject 1> (appears in [Shot 1]): fully_preserved - a.\n<Subject 2> (appears in [Shot 1]): fully_preserved - b.\n<Subject 3> (not cited in a shot): fully_preserved - c.",
      detailed_description: "[Shot 1] <Subject 1> in <Subject 2> with <Subject 3>.",
      overall_soundscape: "x",
      non_diegetic_music: "N/A",
    },
  });
  const s = sortie({ changements: [], references: { retirer: ["DEC_couloir"] } });
  assert.deepEqual(controlerSortieIterationPlan(s, p).filter((x) => x.niveau === "erreur"), []);
  const apres = lireApresFiche(depuisIterationPlan(s, p)[0]!.apres);
  assert.deepEqual(apres.refs!.map((r) => `${r.slot}:${r.asset}`), ["1:CHAR_maya", "2:PROP_lampe"]);
  assert.equal(apres.sections!.detailed_description, "[Shot 1] <Subject 1> in couloir with <Subject 2>.");
  assert.ok(!/<Subject 3>|<Picture 3>/.test(Object.values(apres.sections!).join("\n")));
  assert.equal(apres.sections!.subject_definitions, "<Subject 1> is Maya from <Picture 1>.\n<Subject 2> is the lamp from <Picture 2>.");
});

test("références : les erreurs de contrat (code inventé, voix, doublon, retrait inconnu, sept images, marqueur étranger)", () => {
  const p = planAvecRefs();
  const erreurs = (s: SortieIterationPlan) => controlerSortieIterationPlan(s, p).filter((x) => x.niveau === "erreur").map((x) => x.regle);
  assert.deepEqual(erreurs(sortie({ changements: [], references: { ajouter: [{ asset: "PROP_inventee", nom: "x" }] } })), ["ajout-inconnu"]);
  assert.deepEqual(erreurs(sortie({ changements: [], references: { ajouter: [{ asset: "VOICE_maya", nom: "x" }] } })), ["ajout-nature"]);
  assert.deepEqual(erreurs(sortie({ changements: [], references: { ajouter: [{ asset: "CHAR_maya", nom: "x" }] } })), ["ajout-doublon"]);
  assert.deepEqual(erreurs(sortie({ changements: [], references: { retirer: ["PROP_lampe"] } })), ["retrait-inconnu"]);
  const pleine = planAvecRefs({ refs: Array.from({ length: 6 }, (_, i) => ({ type: "picture" as const, slot: i + 1, asset: i === 0 ? "CHAR_maya" : "DEC_couloir" })) });
  assert.ok(controlerSortieIterationPlan(sortie({ changements: [], references: { ajouter: [{ asset: "PROP_lampe", nom: "x" }] } }), pleine).some((x) => x.regle === "trop-d-images"));
  // un [[CODE]] qui n'est pas une référence ajoutée reste une erreur
  const etranger = sortie({ changements: [{ section: "summary", avant: "crossing <Subject 2>", apres: "crossing [[DEC_couloir]]" }] });
  assert.ok(erreurs(etranger).includes("marqueur"));
});

test("références : une référence actuelle sans asset bloque la modification des références, signalée", () => {
  const p = planAvecRefs({ refs: [{ type: "picture", slot: 1, asset: null }, { type: "picture", slot: 2, asset: "DEC_couloir" }] });
  const [ch] = depuisIterationPlan(sortie({ changements: [], references: { retirer: ["DEC_couloir"] } }), p);
  assert.ok(ch!.avertissements!.some((a) => /n'est liée à aucun asset/.test(a.texte)));
  assert.equal(lireApresFiche(ch!.apres).refs, undefined);
});

test("références : l'écrasement ne compte que les références qui disparaissent ou changent", () => {
  const etat: EtatPlanFiche = {
    titre: "Le couloir",
    sections: { summary: "x" },
    refs: [{ type: "picture", slot: 1, asset: "CHAR_maya" }, { type: "picture", slot: 2, asset: "DEC_couloir" }],
    registre: new Map([["CHAR_maya", "personnage"], ["DEC_couloir", "decor"], ["PROP_lampe", "prop"]]),
    aUnRendu: false,
    dureeGenerationSecondes: 8,
  };
  const ajout = { refs: [{ type: "picture" as const, slot: 1, asset: "CHAR_maya" }, { type: "picture" as const, slot: 2, asset: "DEC_couloir" }, { type: "picture" as const, slot: 3, asset: "PROP_lampe" }] };
  assert.equal(evaluerEcrasementFiche(ajout, etat).ecrase, null, "ajouter une image n'écrase rien");
  const retrait = { refs: [{ type: "picture" as const, slot: 1, asset: "CHAR_maya" }] };
  assert.match(evaluerEcrasementFiche(retrait, etat).ecrase ?? "", /1 référence/);
  assert.equal(verifierFiche(ajout, etat), null);
});

test("parole entre guillemets hors balise <d> : erreur, renvoi au modèle ; avec <d> : accepté", () => {
  const nue = sortie({ changements: [{ section: "detailed_description", avant: "the camera tracking alongside.", apres: "the camera tracking alongside. <Subject 1> says: 'Grand gardien, je viens'." }] });
  assert.ok(erreurs(nue).includes("parole-sans-balise"));
  const balisee = sortie({ changements: [{ section: "detailed_description", avant: "the camera tracking alongside.", apres: "the camera tracking alongside. <Subject 1> says, <d>[Français] Grand gardien, je viens.</d>" }] });
  assert.ok(!erreurs(balisee).includes("parole-sans-balise"));
});

test("assetsManquants : le schéma l'accepte ; sans modification du prompt, la raison nomme l'asset à créer ; le diagnostic le garde", () => {
  const s = sortie({
    changements: [],
    assetsManquants: [{ code: "CHAR_dragon_ombre", type: "personnage", parent: "CHAR_dragon", description: "Le dragon en ombre incomplète.", raison: "Aucune image de cet état." }],
  });
  const v = valider(chargerSkill("iteration-plan").schema, s);
  assert.ok(v.ok, v.ok ? "" : v.erreurs.join(" ; "));
  assert.match(raisonSansEcriture(s, plan()) ?? "", /suggère de créer CHAR_dragon_ombre/);
  assert.deepEqual(diagnosticIteration(s)!.assetsSuggeres, [{ code: "CHAR_dragon_ombre", type: "personnage", parent: "CHAR_dragon", raison: "Aucune image de cet état." }]);
  assert.deepEqual(diagnosticIteration(sortie())!.assetsSuggeres, []);
});

// --- description du plan : écrite avec la fiche quand la correction la change, réécriture du plan (2026-10-14), plus d'état de fin (2026-11-08) ---

const DESC_AVANT = "Mai attend devant le feu, les mains tendues vers les flammes.\nMai : « Il viendra. »";
const DESC_APRES = "Mai attend devant le feu, les mains tendues vers les flammes, puis se lève et recule d'un pas.\nMai : « Il viendra. »";

// Le plan « Le feu » (projet 236, run 3906) : une description complète, écrite avec l'ancien « État en fin de plan ».
const DESC_FEU =
  "Un feu au centre de la clairière, la forêt autour. Mai, assise à gauche du feu, frotte deux pierres au-dessus d'un tas de brindilles ; une étincelle jaillit, " +
  "les brindilles fument puis s'embrasent. Elle se penche, souffle doucement, et les flammes montent en éclairant son visage. Elle sourit, soulagée, les mains tendues vers la chaleur.\n" +
  "Mai : « Enfin. »\n\n" +
  "État en fin de plan : Mai assise à gauche du feu, tournée vers lui, les mains tendues ; le feu bien pris, haut et clair, éclaire la clairière.";
// Ce que l'agent a rendu (reecriture=false) : SEULEMENT une phrase d'état, 222 caractères.
const FRAGMENT_FEU =
  "État en fin de plan : Mai est assise à gauche du feu, de profil, tournée vers les flammes, les deux mains tendues au-dessus des braises ; le feu brûle haut et clair au centre de la clairière, la forêt sombre autour.";

test("nouvelleDescription : écrite avec la fiche (apres.description), sans note d'état de fin", () => {
  const ch = depuisIterationPlan(sortie({ nouvelleDescription: DESC_APRES }), plan({ description: DESC_AVANT }));
  const a = lireApresFiche(ch[0]!.apres);
  assert.equal(a.description, DESC_APRES);
  assert.ok(!ch[0]!.avertissements!.some((v) => /état de fin/i.test(v.texte)));
});

test("nouvelleDescription : un ancien « État en fin de plan » recopié par le modèle n'est pas réécrit en base", () => {
  const ch = depuisIterationPlan(sortie({ nouvelleDescription: `${DESC_APRES}\n\nÉtat en fin de plan : Mai debout.` }), plan({ description: DESC_AVANT }));
  assert.equal(lireApresFiche(ch[0]!.apres).description, DESC_APRES);
});

test("nouvelleDescription seule (sans passage) est une écriture ; identique à l'actuelle, ce n'est rien", () => {
  const seule = sortie({ changements: [], nouvelleDescription: DESC_APRES });
  assert.equal(raisonSansEcriture(seule, plan({ description: DESC_AVANT })), null);
  assert.equal(depuisIterationPlan(seule, plan({ description: DESC_AVANT })).length, 1);
  assert.match(raisonSansEcriture(sortie({ changements: [], nouvelleDescription: DESC_AVANT }), plan({ description: DESC_AVANT })) ?? "", /aucune modification/i);
  // l'actuelle porte encore l'ancien état de fin : la même description sans lui n'est pas un changement
  assert.match(raisonSansEcriture(sortie({ changements: [], nouvelleDescription: DESC_AVANT }), plan({ description: `${DESC_AVANT}\n\nÉtat en fin de plan : Mai assise.` })) ?? "", /aucune modification/i);
});

test("contrôles : plus d'état de fin exigé ; une réécriture exige une description", () => {
  assert.deepEqual(erreurs(sortie({ nouvelleDescription: DESC_APRES }), plan({ description: DESC_AVANT })), []);
  assert.ok(erreurs(sortie({ reecriture: true, changements: [] }), plan({ description: DESC_AVANT })).includes("reecriture-sans-description"));
});

test("bug du plan « Le feu » : une nouvelleDescription réduite à la phrase d'état n'écrase pas le récit", () => {
  const p = plan({ description: DESC_FEU });
  // contrôle : erreur, donc renvoi au modèle
  assert.ok(erreurs(sortie({ changements: [], nouvelleDescription: FRAGMENT_FEU }), p).includes("description-incomplete"));
  // sans autre changement : rien n'est écrit, la raison le dit
  assert.match(raisonSansEcriture(sortie({ changements: [], nouvelleDescription: FRAGMENT_FEU }), p) ?? "", /incomplète/);
  assert.deepEqual(depuisIterationPlan(sortie({ changements: [], nouvelleDescription: FRAGMENT_FEU }), p), []);
  // avec une retouche du prompt : la retouche passe, la description ne change pas (alerte, pas de blocage)
  const ch = depuisIterationPlan(sortie({ nouvelleDescription: FRAGMENT_FEU }), p);
  assert.equal(ch.length, 1);
  const a = lireApresFiche(ch[0]!.apres);
  assert.equal(a.description, undefined);
  assert.ok(a.sections?.detailed_description);
  assert.ok(ch[0]!.avertissements!.some((v) => v.type === "alerte_controle" && /Nouvelle description ignorée/.test(v.texte)));
  assert.ok(!ch[0]!.avertissements!.some((v) => v.type === "bloque_controle"));
  // un fragment de récit (la seule phrase changée) est refusé de même
  assert.ok(erreurs(sortie({ changements: [], nouvelleDescription: "Mai se retourne vers la forêt." }), p).includes("description-incomplete"));
  // la description complète, retouchée, passe
  const complete = DESC_FEU.replace("Elle sourit, soulagée", "Elle sourit, puis se retourne vers la forêt").replace(/\n\nÉtat en fin de plan[\s\S]*$/, "");
  assert.deepEqual(erreurs(sortie({ changements: [], nouvelleDescription: complete }), p), []);
  assert.equal(lireApresFiche(depuisIterationPlan(sortie({ changements: [], nouvelleDescription: complete }), p)[0]!.apres).description, complete);
});

test("réécriture : une nouvelle description incomplète n'est pas reprise dans le diagnostic (rien n'est réécrit)", () => {
  const s = sortie({ reecriture: true, changements: [], nouvelleDescription: FRAGMENT_FEU });
  assert.match(raisonSansEcriture(s, plan({ description: DESC_FEU })) ?? "", /incomplète/);
  assert.equal(diagnosticIteration(s, { plan: { intention: DESC_FEU } })!.reecriture, null);
});

test("nouvelleDescription : une réplique perdue est une alerte (la consigne peut la retirer), pas un renvoi", () => {
  const p = plan({ description: DESC_AVANT });
  const sansReplique = "Mai attend devant le feu, les mains tendues vers les flammes, puis se lève sans un mot.";
  assert.deepEqual(erreurs(sortie({ nouvelleDescription: sansReplique }), p), []);
  assert.ok(controlerSortieIterationPlan(sortie({ nouvelleDescription: sansReplique }), p).some((x) => x.regle === "description-repliques" && x.niveau === "alerte"));
});

test("réécriture : aucune retouche de passages, le diagnostic porte la nouvelle description, la raison dit qu'elle est réécrite à part", () => {
  const s = sortie({ reecriture: true, nouvelleDescription: DESC_APRES });
  assert.match(raisonSansEcriture(s, plan({ description: DESC_AVANT })) ?? "", /réécrire/i);
  assert.deepEqual(depuisIterationPlan(s, plan({ description: DESC_AVANT })), []);
  assert.deepEqual(diagnosticIteration(s)!.reecriture, { description: DESC_APRES });
  assert.deepEqual(diagnosticIteration(s, { plan: { intention: DESC_AVANT } })!.reecriture, { description: DESC_APRES });
  assert.equal(diagnosticIteration(sortie())!.reecriture, null);
  assert.equal(diagnosticIteration(sortie({ reecriture: true }))!.reecriture, null);
  const v = valider(chargerSkill("iteration-plan").schema, s);
  assert.ok(v.ok, v.ok ? "" : v.erreurs.join(" ; "));
});

test("motsRecopiesDeLaConsigne : un mot français recopié dans le prompt anglais est signalé, pas les mots déjà présents ni ceux des balises <d>", async () => {
  const { motsRecopiesDeLaConsigne } = await import("./iteration-plan");
  const consigne = "On l'entend bruler sagement. Pas un bruit.";
  const apres = ["A tight close-up of the campfire burning sagement and gently.", "Maya says <d>[Français] Pas un bruit sagement.</d> softly."];
  assert.deepEqual(motsRecopiesDeLaConsigne(consigne, apres, "A close-up of the campfire."), ["sagement"]);
  // déjà dans le prompt d'avant : pas signalé
  assert.deepEqual(motsRecopiesDeLaConsigne(consigne, apres, "campfire sagement"), []);
  assert.deepEqual(motsRecopiesDeLaConsigne(undefined, apres, ""), []);
  assert.deepEqual(motsRecopiesDeLaConsigne("   ", apres, ""), []);
});

test("depuisIterationPlan : une info « mots de ta consigne recopiés » accompagne la correction", () => {
  const ch = depuisIterationPlan(
    sortie({ changements: [{ section: "detailed_description", avant: "walking through <Subject 2>, the camera tracking alongside.", apres: "standing still in <Subject 2> sagement, the camera locked." }] }),
    plan({ consigne: "Elle reste sagement immobile." }),
  );
  assert.ok(ch[0]!.avertissements!.some((v) => v.type === "info" && /Mots de ta consigne recopiés.*sagement/.test(v.texte)));
});

test("motsNonTraduits : accents français et mots des consignes absents de la référence, hors <d> et noms propres", async () => {
  const { motsNonTraduits, motsDeReference } = await import("./iteration-plan");
  const reference = motsDeReference("A tight close-up of the campfire burning gently. Mai stands in front of the campfire.");
  const sections = {
    detailed_description: "[Shot 1] A close-up of the campfire burning sagement and gently. <Subject 1> says <d>[Français] Pas un bruit, très calme.</d> Tenancière watches, voilà.",
    overall_soundscape: "The campfire burns sagement. Résumé of the scene, café nearby.",
  };
  // « sagement » : mot de la consigne absent de la référence ; « voilà » : accent ; « Tenancière » (nom propre), « <d> » et « Résumé »/« café » (admis ou majuscule) : écartés
  assert.deepEqual(motsNonTraduits(sections, ["On l'entend bruler sagement."], reference), ["sagement", "voilà"]);
  // sans consigne ni référence : seuls les accents
  assert.deepEqual(motsNonTraduits(sections, undefined, undefined), ["voilà"]);
  // un mot déjà dans la référence n'est pas jugé
  assert.deepEqual(motsNonTraduits({ a: "the campfire burning" }, ["campfire burning"], reference), []);
});

test("contrôle : un mot français laissé dans le prompt (même hors de la zone retouchée) est une ERREUR (renvoi au modèle)", () => {
  const s = sortie();
  const ctx = plan({
    consignes: ["Reste sagement immobile."],
    motsAnglais: ["maya", "walking", "through", "corridor", "camera", "tracking", "alongside", "railing"],
    sections: { ...plan().sections, overall_soundscape: "Footsteps on stone, a door creaks, sagement <Audio 2>." },
  });
  const e = controlerSortieIterationPlan(s, ctx).filter((p) => p.niveau === "erreur");
  assert.ok(e.some((p) => p.regle === "non-traduit" && /sagement/.test(p.message)));
  // sans mot à traduire : pas d'erreur
  assert.ok(!controlerSortieIterationPlan(s, plan({ consignes: ["Reste immobile."], motsAnglais: ["maya"] })).some((p) => p.regle === "non-traduit"));
});

test("durée demandée par la consigne : écrite avec la fiche, une demande seule n'est pas refusée, une valeur hors bornes est ignorée", () => {
  const avecDuree = sortie({ dureeSecondes: 9 });
  const a = lireApresFiche(depuisIterationPlan(avecDuree, plan())[0]!.apres);
  assert.equal(a.dureeGenerationSecondes, 9, "la durée demandée part avec la fiche (rendu et montage la lisent)");
  assert.ok(depuisIterationPlan(avecDuree, plan())[0]!.avertissements!.some((x) => /6 s → 9 s/.test(x.texte ?? "")), "le changement de durée est annoncé");

  const seule = sortie({ dureeSecondes: 10, changements: [], nouvelleDescription: undefined });
  assert.equal(raisonSansEcriture(seule, plan()), null, "une demande de durée seule est une écriture, pas un refus");
  assert.equal(lireApresFiche(depuisIterationPlan(seule, plan())[0]!.apres).dureeGenerationSecondes, 10);

  for (const hors of [20, 12, 3, 7.5]) {
    const s = sortie({ dureeSecondes: hors });
    assert.equal(lireApresFiche(depuisIterationPlan(s, plan())[0]!.apres).dureeGenerationSecondes, undefined, `${hors} s est ignoré`);
  }
  assert.equal(lireApresFiche(depuisIterationPlan(sortie({ dureeSecondes: 6 }), plan())[0]!.apres).dureeGenerationSecondes, undefined, "la même durée ne change rien");
});

test("durée : un rendu de 6 s dure 6,583 s sur la grille d'images, ce qui reste cohérent (sinon toute correction serait refusée)", async () => {
  const { dureesCoherentes } = await import("./iteration-plan");
  assert.equal(dureesCoherentes(6, 6.583), true, "durée effective de 6 s");
  assert.equal(dureesCoherentes(6, 6.04), true, "proche de la nominale");
  assert.equal(dureesCoherentes(8, 8), true);
  assert.equal(dureesCoherentes(10, 10.125), true);
  assert.equal(dureesCoherentes(5, 5.167), true);
  assert.equal(dureesCoherentes(6, 7.4), false, "ni l'une ni l'autre");
  assert.equal(dureesCoherentes(6, 3.02), false);
  const rendu6s = plan({ dureeReelleSecondes: 6.583 });
  assert.equal(raisonSansEcriture(sortie(), rendu6s), null);
});
