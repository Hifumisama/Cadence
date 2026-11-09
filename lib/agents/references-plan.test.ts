import assert from "node:assert/strict";
import { test } from "node:test";
import { controleurPourSkill } from "../llm/controles";
import { chargerSkill } from "../llm/skills";
import { estimerContexte } from "../llm/budget-contexte";
import { maxTokensPourSkill } from "../llm/config";
import { valider } from "../llm/validation";
import { choisirReferences, type CandidatReference } from "../h3ir/references-plan";
import {
  construireEntreeReferencesPlan,
  corrigerCodesReferencesPlan,
  MAX_DESCRIPTION_CANDIDAT,
  problemesReferencesPlan,
  SKILL_REFERENCES_PLAN,
  type EntreeSkillReferencesPlan,
  type SortieReferencesPlan,
} from "./references-plan";

const CANDIDATS: CandidatReference[] = [
  { code: "CHAR_lina", type: "personnage", label: "Lina", description: "Jeune femme, cape bleue. ".repeat(20), parent: null, aUneImage: true },
  { code: "CHAR_lina_blessee", type: "personnage", label: null, description: "Lina blessée", parent: "CHAR_lina", aUneImage: false },
  { code: "CHAR_vieil_homme", type: "personnage", label: null, description: "Vieux marin, barbe blanche", parent: null, aUneImage: true },
  { code: "PROP_lampe_huile", type: "prop", label: null, description: "Lampe à huile en cuivre", parent: null, aUneImage: true },
  { code: "DEC_port_de_jour", type: "decor", label: null, description: "Port de pêche en plein jour", parent: null, aUneImage: true },
  { code: "DEC_port_nuit", type: "decor", label: null, description: "Le même port la nuit", parent: "DEC_port_de_jour", aUneImage: true },
  { code: "SFX_ressac", type: "sfx", label: null, description: "Ressac", parent: null, aUneImage: true },
];

const choix = choisirReferences({
  description: "Sur la jetée au crépuscule, Lina tend la lanterne au vieux pêcheur.\nLina : « Tiens. »",
  liaison: "coupe",
  precedent: null,
  candidats: CANDIDATS,
});

const ENTREE: EntreeSkillReferencesPlan = construireEntreeReferencesPlan({
  ...choix,
  dureeSecondes: 8,
  scene: { titre: "Le port", ambiance: "Crépuscule" },
  decorPrecedent: null,
  candidats: CANDIDATS,
  assetsProposesParLeLot: [{ code: "PROP_filet_de_peche", type: "prop" }],
});

const BONNE: SortieReferencesPlan = {
  references: [
    { code: "CHAR_lina", pourquoi: "locutrice" },
    { code: "CHAR_vieil_homme", pourquoi: "le pêcheur" },
    { code: "PROP_lampe_huile", pourquoi: "la lanterne" },
    { code: "DEC_port_nuit", pourquoi: "crépuscule" },
  ],
  manquants: [],
  notes: "",
};

test("le cas qui appelle le skill : le code a des doutes (décor, nom), l'entrée les porte avec la liste déjà choisie", () => {
  assert.equal(choix.suffit, false);
  assert.deepEqual(ENTREE.dejaChoisis.map((r) => r.code), ["CHAR_lina"]);
  assert.ok(ENTREE.doutes.some((d) => d.type === "decor_introuvable"));
  assert.deepEqual(ENTREE.plan.repliques, [{ nom: "Lina" }]);
  assert.equal(ENTREE.plan.intention, "Sur la jetée au crépuscule, Lina tend la lanterne au vieux pêcheur.");
  assert.equal(ENTREE.limiteImages, 6);
  // Ni bruitage dans les candidats, des descriptions coupées, le nom lisible.
  assert.ok(!ENTREE.candidats.some((c) => c.type === "sfx"));
  assert.ok(ENTREE.candidats.every((c) => c.description.length <= MAX_DESCRIPTION_CANDIDAT));
  assert.equal(ENTREE.candidats.find((c) => c.code === "CHAR_vieil_homme")!.nom, "Vieil homme");
  assert.equal(ENTREE.candidats.find((c) => c.code === "DEC_port_nuit")!.parent, "DEC_port_de_jour");
});

test("contrôles : une sortie juste ne déclenche rien ; un code du lot est accepté", () => {
  assert.deepEqual(problemesReferencesPlan(BONNE, ENTREE), []);
  assert.deepEqual(problemesReferencesPlan({ ...BONNE, references: [...BONNE.references, { code: "PROP_filet_de_peche", pourquoi: "" }] }, ENTREE), []);
});

test("contrôles : code inconnu, bruitage, doublon, deux visages, trop d'images", () => {
  const p = problemesReferencesPlan(
    {
      references: [
        { code: "CHAR_lina", pourquoi: "" },
        { code: "CHAR_lina_blessee", pourquoi: "" },
        { code: "CHAR_lina", pourquoi: "" },
        { code: "SFX_ressac", pourquoi: "" },
        { code: "PROP_lanterne", pourquoi: "" },
        { code: "CHAR_vieil_homme", pourquoi: "" },
        { code: "DEC_port_nuit", pourquoi: "" },
      ],
      manquants: [],
      notes: "",
    },
    ENTREE,
  );
  const tout = p.join("\n");
  assert.match(tout, /same character/);
  assert.match(tout, /appears twice/);
  assert.match(tout, /SFX_ressac is a sound effect/);
  assert.match(tout, /PROP_lanterne is not a candidate code/);
  assert.match(tout, /7 images, 6 at most/);
});

test("contrôles des manquants : 2 au plus, pas de doublon de l'existant, type et préfixe, parent valide", () => {
  const m = (code: string, type: string, parent: string | null = null) => ({ code, type, parent, description: "x", raison: "y" });
  const p = problemesReferencesPlan(
    {
      ...BONNE,
      manquants: [m("PROP_lampe_huile", "prop"), m("PROP_grande_lampe_huile", "prop"), m("DEC_jetee", "decor", "PROP_lampe_huile"), m("VFX_brume", "vfx")],
    },
    ENTREE,
  ).join("\n");
  assert.match(p, /4 missing assets, 2 at most/);
  assert.match(p, /PROP_lampe_huile already exists/);
  assert.match(p, /PROP_grande_lampe_huile looks like PROP_lampe_huile/);
  assert.match(p, /parent PROP_lampe_huile of DEC_jetee is a prop/);
  assert.match(p, /VFX_brume has type « vfx »/);
  assert.match(p, /references \+ manquants: 8 images/);
  assert.match(problemesReferencesPlan({ ...BONNE, manquants: [m("jetee", "decor")] }, ENTREE).join("\n"), /written DEC_jetee/);
  assert.match(problemesReferencesPlan({ ...BONNE, manquants: [m("DEC_jetee", "decor", "DEC_inconnu")] }, ENTREE).join("\n"), /not a candidate code/);
  assert.deepEqual(problemesReferencesPlan({ ...BONNE, manquants: [m("DEC_jetee", "decor", "DEC_port_de_jour")] }, ENTREE), []);
});

test("codes mal recopiés (mot de liaison) rapprochés avant les contrôles, par le contrôleur du registre", () => {
  const sortie: SortieReferencesPlan = { ...BONNE, references: [{ code: "DEC_port_jour", pourquoi: "" }], manquants: [{ code: "DEC_jetee", type: "decor", parent: "DEC_port_jour", description: "x", raison: "y" }] };
  const r = corrigerCodesReferencesPlan(sortie, ENTREE.candidats.map((c) => c.code));
  assert.deepEqual(r.corrections, [{ de: "DEC_port_jour", vers: "DEC_port_de_jour" }]);
  assert.equal(r.sortie.references[0]!.code, "DEC_port_de_jour");
  assert.equal(r.sortie.manquants[0]!.parent, "DEC_port_de_jour");
  const controler = controleurPourSkill(SKILL_REFERENCES_PLAN, ENTREE)!;
  assert.deepEqual(controler(sortie), []);
  assert.match(controler({ ...BONNE, references: [{ code: "CHAR_personne", pourquoi: "" }] }).join("\n"), /not a candidate code/);
});

test("skill : se charge, schéma conforme (6 références, 2 manquants), budget et plafond de sortie déclarés", () => {
  const s = chargerSkill(SKILL_REFERENCES_PLAN);
  assert.ok(s.jetonsEstimes < 3000, `${s.jetonsEstimes} jetons : le skill doit rester petit`);
  assert.deepEqual(valider(s.schema, BONNE), { ok: true });
  assert.equal(valider(s.schema, { ...BONNE, references: Array.from({ length: 7 }, () => ({ code: "CHAR_lina", pourquoi: "" })) }).ok, false);
  const m = { code: "DEC_x", type: "decor", parent: null, description: "x", raison: "y" };
  assert.equal(valider(s.schema, { ...BONNE, manquants: [m, m, m] }).ok, false);
  assert.equal(valider(s.schema, { ...BONNE, manquants: [{ ...m, type: "sfx" }] }).ok, false);
  assert.equal(maxTokensPourSkill(SKILL_REFERENCES_PLAN, {}), 800);
  assert.equal(estimerContexte(SKILL_REFERENCES_PLAN, 0, {}), 401); // 400 de sortie attendue + « {} »
});
