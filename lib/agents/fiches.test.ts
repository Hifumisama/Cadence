import assert from "node:assert/strict";
import { test } from "node:test";
import { controlerDialogues, controlerStructure, verifierCoherenceRefs } from "../plan-checks";
import { ordonnerParDependances } from "./changements";
import { cocheParDefaut } from "./cochage";
import { depuisFichePlan, type PlanPourFicheH3 } from "./conversion";
import { cleNouvelAsset, cleSousTachePlan, evaluerEcrasementFiche, lireApresFiche, planUuidDeCle, verifierFiche, type ApresFiche, type EtatPlanFiche } from "./fiches";
import type { SortiePlanH3 } from "./plan-h3-controles";
import { verifierPortee } from "./portee";

const UUID = "0b0e5a8e-1c4f-4e7e-9a63-3f1d2c4b5a69";

const registre = [
  { code: "CHAR_maya", type: "personnage" },
  { code: "CHAR_tenanciere", type: "personnage" },
  { code: "DEC_couloir", type: "decor" },
  { code: "SFX_porte", type: "sfx" },
  { code: "VOICE_maya", type: "voix" },
  ...Array.from({ length: 7 }, (_, i) => ({ code: `PROP_${i}`, type: "prop" })),
];

const plan = (o: Partial<PlanPourFicheH3> = {}): PlanPourFicheH3 => ({ uuid: UUID, titre: "La fuite", slotsAudioPris: [], repliques: [], registre, ...o });

const base: SortiePlanH3 = {
  titre: "La fuite",
  dureeSecondes: 9,
  references: [
    { asset: "CHAR_maya", nature: "image", role: "Maya qui court", nom: "Maya", definition: "running" },
    { asset: "DEC_couloir", nature: "image", role: "Décor", nom: "the corridor", definition: "lit in indigo" },
  ],
  summary: "[[CHAR_maya]] runs through [[DEC_couloir]].",
  ouverture: "Cinematic live-action, indigo light.",
  shots: [
    { debutSecondes: 0, texte: "A wide shot of [[CHAR_maya]] in [[DEC_couloir]]." },
    { debutSecondes: 3, texte: "a low-angle shot of her feet." },
    { debutSecondes: 6, texte: "a close-up of [[CHAR_maya]], breathing hard." },
  ],
  overall_soundscape: "Footsteps on wood.",
  non_diegetic_music: "N/A",
  repliques: [],
  assetsManquants: [],
  notes: "",
};

const fiche = (bruts: ReturnType<typeof depuisFichePlan>) => bruts.find((b) => b.cibleType === "fiche")!;
const apresDe = (bruts: ReturnType<typeof depuisFichePlan>) => lireApresFiche(fiche(bruts).apres);

const etatVide = (o: Partial<EtatPlanFiche> = {}): EtatPlanFiche => ({
  titre: "La fuite",
  sections: {},
  refs: [],
  slotsDialogues: [],
  registre: new Map(registre.map((a) => [a.code, a.type])),
  aUnRendu: false,
  dureeGenerationSecondes: 8,
  ...o,
});

// --- conversion ---------------------------------------------------------------------

test("fiche d'un plan vide : six sections assemblées, références picture 1..n, durée", () => {
  const b = depuisFichePlan(base, plan());
  assert.equal(b.length, 1);
  const f = fiche(b);
  assert.equal(f.cibleType, "fiche");
  assert.equal(f.cibleRef, UUID);
  assert.equal(f.operation, "modifier");
  assert.equal(f.groupe, "fiches");
  const a = apresDe(b);
  assert.deepEqual(Object.keys(a.sections ?? {}), ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"]);
  assert.deepEqual(a.refs?.map((r) => [r.type, r.slot, r.asset, r.role]), [["picture", 1, "CHAR_maya", "Maya qui court"], ["picture", 2, "DEC_couloir", "Décor"]]);
  assert.equal(a.dureeGenerationSecondes, 9);
  assert.match(a.sections!.summary!, /^\[reference generation\] <Subject 1> runs through <Subject 2>\.$/);
  assert.ok(!(f.avertissements ?? []).some((x) => x.type === "bloque_controle"));
});

test("les voix gardent leurs slots : le bruitage prend le premier slot audio libre, jamais une ligne de voix", () => {
  const sortie: SortiePlanH3 = {
    ...base,
    references: [...base.references, { asset: "SFX_porte", nature: "son", role: "Porte", nom: "a door slam", definition: "one hard impact" }],
    overall_soundscape: "Wind, then [[SFX_porte]].",
    shots: [{ debutSecondes: 0, texte: "[[CHAR_maya]] in [[DEC_couloir]] says <d>[Français] Vite.</d>" }],
    repliques: [{ repliqueId: "r1" }, { repliqueId: "r2" }],
  };
  const a = apresDe(depuisFichePlan(sortie, plan({ slotsAudioPris: [1, 2], repliques: [{ uuid: "r1", texte: "Vite." }, { uuid: "r2", texte: "Vite." }] })));
  assert.deepEqual(a.refs?.filter((r) => r.type === "audio").map((r) => [r.slot, r.asset, r.retention]), [[3, "SFX_porte", "reference"]]);
  assert.ok(!a.refs?.some((r) => r.asset.startsWith("VOICE_")), "une voix n'est jamais une référence");
});

test("sons sans slot libre (3 voix) : le son est décrit en prose, aucune référence audio, alerte", () => {
  const sortie: SortiePlanH3 = { ...base, references: [...base.references, { asset: "SFX_porte", nature: "son", role: "Porte", nom: "a door slam", definition: "" }], overall_soundscape: "Then [[SFX_porte]]." };
  const b = depuisFichePlan(sortie, plan({ slotsAudioPris: [1, 2, 3] }));
  const a = apresDe(b);
  assert.equal(a.refs?.filter((r) => r.type === "audio").length, 0);
  assert.equal(a.sections!.overall_soundscape, "Then a door slam.");
  assert.ok((fiche(b).avertissements ?? []).some((x) => x.type === "alerte_controle" && /slot audio/.test(x.texte)));
});

test("7 images : 6 références posées, la 7e en prose, avec une alerte", () => {
  const refs = Array.from({ length: 7 }, (_, i) => ({ asset: `PROP_${i}`, nature: "image" as const, role: "r", nom: `item ${i}`, definition: "" }));
  const sortie: SortiePlanH3 = { ...base, references: refs, summary: "[[PROP_0]] [[PROP_6]]", shots: [{ debutSecondes: 0, texte: refs.map((r) => `[[${r.asset}]]`).join(" ") }] };
  const b = depuisFichePlan(sortie, plan());
  const a = apresDe(b);
  assert.equal(a.refs?.length, 6);
  assert.match(a.sections!.detailed_description!, /item 6/);
  assert.ok((fiche(b).avertissements ?? []).some((x) => /Contrat non tenu.*7 images/.test(x.texte)), "l'erreur de contrat persistante remonte");
  assert.equal(verifierFiche(a, etatVide()), null, "…et la fiche reste écrivable");
});

test("une référence hors registre (ou une voix) est retirée et décrite en prose par son nom", () => {
  const sortie: SortiePlanH3 = {
    ...base,
    references: [...base.references, { asset: "PROP_inconnu", nature: "image", role: "Lettre", nom: "a sealed letter", definition: "" }, { asset: "VOICE_maya", nature: "son", role: "voix", nom: "Maya's voice", definition: "" }],
    shots: [{ debutSecondes: 0, texte: "[[CHAR_maya]] holds [[PROP_inconnu]] in [[DEC_couloir]]." }],
  };
  const b = depuisFichePlan(sortie, plan());
  const a = apresDe(b);
  assert.deepEqual(a.refs?.map((r) => r.asset), ["CHAR_maya", "DEC_couloir"]);
  assert.match(a.sections!.detailed_description!, /holds a sealed letter in <Subject 2>/);
  assert.ok((fiche(b).avertissements ?? []).filter((x) => x.type === "alerte_controle" && /retirée/.test(x.texte)).length === 2);
  assert.ok(!(fiche(b).avertissements ?? []).some((x) => x.type === "bloque_controle"));
});

test("un marqueur que le code ne sait pas résoudre (asset manquant cité) bloque la fiche", () => {
  const sortie: SortiePlanH3 = {
    ...base,
    shots: [{ debutSecondes: 0, texte: "[[CHAR_maya]] picks up [[PROP_lettre]] in [[DEC_couloir]]." }],
    assetsManquants: [{ code: "PROP_lettre", type: "prop", description: "Une lettre", raison: "absente" }],
  };
  const f = fiche(depuisFichePlan(sortie, plan()));
  assert.ok((f.avertissements ?? []).some((x) => x.type === "bloque_controle" && /PROP_lettre/.test(x.texte)));
  assert.equal(cocheParDefaut({ operation: "modifier", avertissements: f.avertissements ?? [], ecrase: null, refuseRaison: null }), false);
});

test("assets manquants : créés dans la même proposition, parent existant (deriveDeCode) ou créé ici (deriveDeCle) ; un existant est ignoré", () => {
  const sortie: SortiePlanH3 = {
    ...base,
    assetsManquants: [
      { code: "PROP_sceau", type: "prop", parent: "PROP_lettre", description: "Le sceau de la lettre", raison: "gros plan" },
      { code: "PROP_lettre", type: "prop", parent: "CHAR_maya", description: "La lettre de Maya", raison: "tenue en main" },
      { code: "DEC_couloir", type: "decor", description: "déjà là", raison: "?" },
      { code: "ACC_bougie", type: "prop", description: "Une bougie", raison: "lumière" },
    ],
  };
  const b = depuisFichePlan(sortie, plan());
  const assets = b.filter((x) => x.cibleType === "asset");
  assert.deepEqual(assets.map((x) => x.cle), [cleNouvelAsset("PROP_lettre"), cleNouvelAsset("PROP_bougie"), cleNouvelAsset("PROP_sceau")], "le dérivé d'un asset créé ici vient après lui");
  const ap = (code: string) => assets.find((x) => x.cle === cleNouvelAsset(code))!.apres as Record<string, unknown>;
  assert.equal(ap("PROP_lettre").deriveDeCode, "CHAR_maya");
  assert.equal(ap("PROP_sceau").deriveDeCle, cleNouvelAsset("PROP_lettre"));
  assert.equal(ap("PROP_bougie").suffixe, "bougie", "le code se reconstruit selon la convention du registre");
  assert.ok(assets.every((x) => x.operation === "creer" && x.groupe === "assets"));
  assert.ok((fiche(b).avertissements ?? []).some((x) => /DEC_couloir est déclaré manquant mais existe/.test(x.texte)));
  assert.ok(!apresDe(b).refs?.some((r) => r.asset.startsWith("PROP_")), "une référence ne vise jamais un asset manquant");
});

test("lot : un asset déjà proposé par un autre plan n'est pas recréé ; groupe et scène imposés", () => {
  const sortie: SortiePlanH3 = {
    ...base,
    assetsManquants: [
      { code: "PROP_lettre", type: "prop", description: "La lettre", raison: "r" },
      { code: "PROP_sceau", type: "prop", parent: "PROP_lettre", description: "Le sceau", raison: "r" },
    ],
  };
  const b = depuisFichePlan(sortie, plan(), { groupe: "ep-4", sousGroupe: "La poursuite", codesDejaProposes: new Set(["PROP_lettre"]) });
  assert.deepEqual(b.filter((x) => x.cibleType === "asset").map((x) => x.cle), [cleNouvelAsset("PROP_sceau")]);
  assert.equal((b.find((x) => x.cle === cleNouvelAsset("PROP_sceau"))!.apres as Record<string, unknown>).deriveDeCle, cleNouvelAsset("PROP_lettre"));
  assert.ok(b.every((x) => x.groupe === "ep-4" && x.sousGroupe === "La poursuite"));
});

test("shot sous 1,5 s : la fiche passe, avec une alerte (pas un blocage)", () => {
  const sortie: SortiePlanH3 = { ...base, shots: [base.shots[0]!, { debutSecondes: 1, texte: "a close-up of [[CHAR_maya]]." }] };
  const f = fiche(depuisFichePlan(sortie, plan()));
  assert.ok((f.avertissements ?? []).some((x) => x.type === "alerte_controle" && /1\.5 s/.test(x.texte)));
  assert.ok(!(f.avertissements ?? []).some((x) => x.type === "bloque_controle"));
});

// --- contrôles de la page du plan sur une fiche écrite par ce chemin ------------------

test("après écriture : cohérence des refs, structure et dialogues s'allument correctement", () => {
  const sortie: SortiePlanH3 = {
    ...base,
    references: [...base.references, { asset: "SFX_porte", nature: "son", role: "Porte", nom: "a door slam", definition: "" }],
    overall_soundscape: "Wind, then [[SFX_porte]].",
    shots: [
      { debutSecondes: 0, texte: "A wide shot of [[CHAR_maya]] in [[DEC_couloir]]. Maya (S1) whispers: <d>[Français] Pas un bruit.</d>" },
      { debutSecondes: 4, texte: "a close-up of [[CHAR_maya]]." },
    ],
    repliques: [{ repliqueId: "r1" }],
  };
  const a = apresDe(depuisFichePlan(sortie, plan({ slotsAudioPris: [1], repliques: [{ uuid: "r1", texte: "Pas un bruit." }] })));
  const sections = Object.entries(a.sections!).map(([section, contenu]) => ({ section, contenu }));
  const refs = a.refs!.map((r) => ({ type: r.type, slot: r.slot }));
  // Réplique SANS prise : pas de label audio déclaré pour la voix (comme la page, getDialoguesPlan).
  assert.deepEqual(verifierCoherenceRefs(sections, refs), { labelsOrphelins: [], refsNonCitees: [] });
  assert.deepEqual(controlerStructure(sections, a.dureeGenerationSecondes!), []);
  const d = controlerDialogues(sections, [{ id: 1, texte: "Pas un bruit.", audioPresent: true, priseObsolete: false }]);
  assert.ok(d.ok, "verbatim : la réplique est retrouvée dans <d>");
  // Réplique AVEC prise : la page déclare <Audio 1> pour la voix comme ref DÉRIVÉE, que le prompt (comme les
  // fiches validées) ne cite pas : plus d'alerte « référence non citée » (point ouvert tranché le 2026-10-02).
  assert.deepEqual(verifierCoherenceRefs(sections, refs, [{ type: "audio", slot: 1 }]), { labelsOrphelins: [], refsNonCitees: [] });
  // Le slot du bruitage n'est pas celui de la voix.
  assert.deepEqual(a.refs!.filter((r) => r.type === "audio").map((r) => r.slot), [2]);
});

test("après écriture : un shot court reste signalé par les contrôles de structure de la page", () => {
  const sortie: SortiePlanH3 = { ...base, shots: [base.shots[0]!, { debutSecondes: 1.2, texte: "a close-up of [[CHAR_maya]]." }] };
  const a = apresDe(depuisFichePlan(sortie, plan()));
  const sections = Object.entries(a.sections!).map(([section, contenu]) => ({ section, contenu }));
  assert.ok(controlerStructure(sections, 9).some((p) => p.type === "shot_trop_court"));
});

// --- vérification de l'écriture (applicateur) ----------------------------------------

const complete = (): ApresFiche => apresDe(depuisFichePlan(base, plan()));

test("verifierFiche : écriture complète sur un plan vide acceptée", () => {
  assert.equal(verifierFiche(complete(), etatVide()), null);
});

test("verifierFiche : refus clairs (rien à écrire, durée, slots, voix, assets, nature)", () => {
  const a = complete();
  assert.match(verifierFiche({}, etatVide()) ?? "", /Rien à écrire/);
  assert.match(verifierFiche({ ...a, dureeGenerationSecondes: 16 }, etatVide()) ?? "", /Durée/);
  assert.match(verifierFiche({ ...a, dureeGenerationSecondes: 7.5 }, etatVide()) ?? "", /Durée/);
  const sept = Array.from({ length: 7 }, (_, i) => ({ type: "picture" as const, slot: i + 1, asset: `PROP_${i}` }));
  assert.match(verifierFiche({ refs: sept }, etatVide()) ?? "", /6 au plus/);
  assert.match(verifierFiche({ refs: [{ type: "picture", slot: 7, asset: "PROP_0" }] }, etatVide()) ?? "", /Slot 7/);
  assert.match(verifierFiche({ refs: [{ type: "audio", slot: 1, asset: "SFX_porte" }] }, etatVide({ slotsDialogues: [1] })) ?? "", /voix prime/);
  assert.match(verifierFiche({ refs: [{ type: "audio", slot: 3, asset: "SFX_porte" }] }, etatVide({ slotsDialogues: [1, 2, 3] })) ?? "", /3 références audio au plus/);
  assert.match(verifierFiche({ refs: [{ type: "picture", slot: 1, asset: "PROP_x" }] }, etatVide()) ?? "", /n'existe pas/);
  assert.match(verifierFiche({ refs: [{ type: "picture", slot: 1, asset: "SFX_porte" }] }, etatVide()) ?? "", /pas d'image/);
  assert.match(verifierFiche({ refs: [{ type: "audio", slot: 2, asset: "CHAR_maya" }] }, etatVide()) ?? "", /pas un bruitage/);
  assert.match(verifierFiche({ sections: { autre: "x" } as never }, etatVide()) ?? "", /Section de prompt inconnue/);
  assert.match(
    verifierFiche({ refs: [{ type: "picture", slot: 1, asset: "CHAR_maya" }, { type: "picture", slot: 1, asset: "DEC_couloir" }] }, etatVide()) ?? "",
    /même slot/,
  );
});

test("verifierFiche : aucune écriture ne laisse un label orphelin (partielle comme complète)", () => {
  const etat = etatVide({
    sections: { subject_definitions: "<Subject 1> is Maya from <Picture 1>.", detailed_description: "[Shot 1] <Subject 1> waits." },
    refs: [{ type: "picture", slot: 1, asset: "CHAR_maya" }],
  });
  // partielle (iteration-plan) : une section réécrite qui cite une référence existante → acceptée
  assert.equal(verifierFiche({ sections: { detailed_description: "[Shot 1] <Subject 1> runs, from <Picture 1>." } }, etat), null);
  // …qui cite <Picture 3>, absente → refusée
  assert.match(verifierFiche({ sections: { detailed_description: "[Shot 1] <Picture 3> appears." } }, etat) ?? "", /sans référence.*Picture 3/);
  // remplacer les références sans réécrire les sections qui citent les anciennes → refusée
  assert.match(verifierFiche({ refs: [] }, etat) ?? "", /Picture 1/);
  // une voix liée rend <Audio 1> légitime
  assert.equal(verifierFiche({ sections: { summary: "with <Audio 1>" } }, etatVide({ slotsDialogues: [1] })), null);
});

// --- écrasement (cochage) -------------------------------------------------------------

test("écrasement : plan vide = création cochée ; plan rempli ou rendu = écrasement décoché", () => {
  const a = complete();
  const vide = evaluerEcrasementFiche(a, etatVide());
  assert.equal(vide.ecrase, null);
  assert.equal(cocheParDefaut({ operation: "modifier", avertissements: vide.avertissements, ecrase: vide.ecrase, refuseRaison: null }), true);
  // sections créées vides (« Développer en fiche de plan ») : rien n'est perdu
  assert.equal(evaluerEcrasementFiche(a, etatVide({ sections: { summary: "  ", detailed_description: "" } })).ecrase, null);

  const rempli = evaluerEcrasementFiche(a, etatVide({ sections: { summary: "ancien", detailed_description: "ancien" }, refs: [{ type: "picture", slot: 1, asset: "DEC_couloir" }] }));
  assert.match(rempli.ecrase ?? "", /2 sections du prompt.*1 référence/);
  assert.deepEqual((rempli.avant.sections as Record<string, string>).summary, "ancien");
  assert.equal(cocheParDefaut({ operation: "modifier", avertissements: rempli.avertissements, ecrase: rempli.ecrase, refuseRaison: null }), false);

  const rendu = evaluerEcrasementFiche(a, etatVide({ aUnRendu: true }));
  assert.match(rendu.ecrase ?? "", /rendu vidéo/);
  assert.ok(rendu.avertissements.some((x) => x.type === "ecrase_valide"));

  // écriture partielle : seules les sections écrites comptent
  const partielle = evaluerEcrasementFiche({ sections: { detailed_description: "neuf" } }, etatVide({ sections: { summary: "garde", detailed_description: "" } }));
  assert.equal(partielle.ecrase, null);
  assert.equal(partielle.avant.refs, undefined);
});

// --- divers ---------------------------------------------------------------------------

test("clé de sous-tâche d'un plan", () => {
  assert.equal(planUuidDeCle(cleSousTachePlan(UUID)), UUID);
  assert.equal(planUuidDeCle("ep:3"), null);
  assert.equal(planUuidDeCle("plan:12"), null, "jamais un id interne ni une position");
});

test("ordre d'application : un dérivé passe après son parent créé plus loin", () => {
  const l = [
    { cle: "a", apres: { deriveDeCle: "nouvel-asset-P" } },
    { cle: "fiche", apres: {} },
    { cle: "nouvel-asset-P", apres: {} },
  ];
  assert.deepEqual(ordonnerParDependances(l).map((x) => x.cle), ["fiche", "nouvel-asset-P", "a"]);
  assert.deepEqual(ordonnerParDependances([{ cle: "x", apres: { deriveDeCle: "absent" } }]).map((x) => x.cle), ["x"], "parent hors proposition : ordre inchangé");
});

test("portée d'une fiche : son plan, son épisode, sa saison, le projet ; jamais une création", () => {
  const c = { type: "fiche" as const, operation: "modifier" as const, planId: 5, episodeId: 7, saisonId: 2 };
  assert.equal(verifierPortee({ type: "plan", cibleId: 5 }, c), null);
  assert.equal(verifierPortee({ type: "episode", cibleId: 7 }, c), null);
  assert.equal(verifierPortee({ type: "saison", cibleId: 2 }, c), null);
  assert.equal(verifierPortee({ type: "projet", cibleId: null }, c), null);
  assert.match(verifierPortee({ type: "plan", cibleId: 6 }, c) ?? "", /Hors portée/);
  assert.match(verifierPortee({ type: "episode", cibleId: 8 }, c) ?? "", /Hors portée/);
  assert.match(verifierPortee({ type: "episode", cibleId: 7 }, { ...c, operation: "creer" }) ?? "", /Hors portée/);
});
