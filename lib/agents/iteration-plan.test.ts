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
  ],
  slotsVoix: [1],
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
    ],
    slotsDialogues: [1],
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

test("réplique altérée : erreur (les balises <d> restent verbatim)", () => {
  const modifiee = sortie({ changements: [{ section: "detailed_description", avant: "<d>[Français] Pas un bruit.</d>", apres: "<d>[Français] Pas un seul bruit.</d>" }] });
  assert.deepEqual(erreurs(modifiee), ["replique-modifiee"]);
  const retiree = sortie({ changements: [{ section: "detailed_description", avant: "<Subject 1> says <d>[Français] Pas un bruit.</d> ", apres: "" }] });
  assert.deepEqual(erreurs(retiree), ["replique-modifiee"]);
  // Déplacer une réplique sans la changer reste permis (même multiensemble de <d>).
  const deplacee = sortie({
    changements: [
      { section: "detailed_description", avant: " <Subject 1> says <d>[Français] Pas un bruit.</d> ", apres: " " },
      { section: "detailed_description", avant: "the camera locked.", apres: "the camera locked. <Subject 1> says <d>[Français] Pas un bruit.</d>" },
    ],
  });
  assert.deepEqual(erreurs(deplacee), []);
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
  const decoupage = sortie({ categorie: "decoupage-scenario" });
  assert.deepEqual(depuisIterationPlan(decoupage, plan()), []);
  assert.match(raisonSansEcriture(decoupage, plan()) ?? "", /découpage/);
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
      { label: "<Audio 1>", type: "audio", slot: 1, voix: true, replique: "Pas un bruit." },
    ],
    rendu: { dureeReelleSecondes: 6.04 },
  };
  const ctx = contexteDepuisEntree(entree);
  assert.deepEqual(ctx.slotsVoix, [1]);
  assert.equal(ctx.refs.length, 3);
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
    slotsDialogues: [],
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
