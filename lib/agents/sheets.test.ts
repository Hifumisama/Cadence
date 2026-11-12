import assert from "node:assert/strict";
import { test } from "node:test";
import { ordonnerParDependances } from "./changes";
import { cocheParDefaut } from "./checking";

import { cleNouvelAsset, cleSousTachePlan, evaluerEcrasementFiche, planUuidDeCle, verifierFiche, type ApresFiche, type EtatPlanFiche } from "./sheets";
import { verifierPortee } from "./scope";



const UUID = "0b0e5a8e-1c4f-4e7e-9a63-3f1d2c4b5a69";

const registre = [
  { code: "CHAR_maya", type: "personnage" },
  { code: "CHAR_tenanciere", type: "personnage" },
  { code: "DEC_couloir", type: "decor" },
  { code: "VOIX_off", type: "voix" },
  { code: "VFX_energie", type: "vfx" },
  { code: "VOICE_maya", type: "voix" },
  ...Array.from({ length: 7 }, (_, i) => ({ code: `PROP_${i}`, type: "prop" })),
];


const etatVide = (o: Partial<EtatPlanFiche> = {}): EtatPlanFiche => ({
  titre: "La fuite",
  sections: {},
  refs: [],
  registre: new Map(registre.map((a) => [a.code, a.type])),
  aUnRendu: false,
  dureeGenerationSecondes: 8,
  ...o,
});


/** Une fiche écrite complète pour un plan vide (comme la compile Open H3 IR) : six sections, deux références image, une durée. */
const complete = (): ApresFiche => ({
  sections: {
    summary: "Maya crosses the corridor.",
    subject_definitions: "<Subject 1> is Maya from <Picture 1>.",
    detailed_description: "[Shot 1] <Subject 1> walks through <Picture 2>.",
  },
  refs: [
    { type: "picture", slot: 1, asset: "CHAR_maya" },
    { type: "picture", slot: 2, asset: "DEC_couloir" },
  ],
  dureeGenerationSecondes: 8,
  moteur: "h3ir",
});

// --- vérification de l'écriture (applicateur) ----------------------------------------

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
  assert.match(verifierFiche({ refs: [1, 2, 3, 4].map((slot) => ({ type: "audio" as const, slot, asset: "CHAR_maya" })) }, etatVide()) ?? "", /3 au plus/);
  assert.match(verifierFiche({ refs: [{ type: "picture", slot: 1, asset: "PROP_x" }] }, etatVide()) ?? "", /n'existe pas/);
  assert.match(verifierFiche({ refs: [{ type: "picture", slot: 1, asset: "VOIX_off" }] }, etatVide()) ?? "", /pas d'image/);
  assert.match(verifierFiche({ refs: [{ type: "audio", slot: 2, asset: "CHAR_maya" }] }, etatVide()) ?? "", /pas un personnage avec une voix/);
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
  // une référence audio (la voix d'un personnage) rend <Audio 1> légitime
  assert.equal(verifierFiche({ sections: { summary: "with <Audio 1>" } }, etatVide({ refs: [{ type: "audio", slot: 1, asset: "CHAR_maya" }] })), null);
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

test("portée d'une fiche : son plan, son épisode, le projet ; jamais une création", () => {
  const c = { type: "fiche" as const, operation: "modifier" as const, planId: 5, episodeId: 7 };
  assert.equal(verifierPortee({ type: "plan", cibleId: 5 }, c), null);
  assert.equal(verifierPortee({ type: "episode", cibleId: 7 }, c), null);
  assert.equal(verifierPortee({ type: "projet", cibleId: null }, c), null);
  assert.match(verifierPortee({ type: "plan", cibleId: 6 }, c) ?? "", /Hors portée/);
  assert.match(verifierPortee({ type: "episode", cibleId: 8 }, c) ?? "", /Hors portée/);
  assert.match(verifierPortee({ type: "episode", cibleId: 7 }, { ...c, operation: "creer" }) ?? "", /Hors portée/);
});

test("codesEnVoixOff : un personnage dont le brief dit « voix off » ; les autres non", async () => {
  const { codesEnVoixOff } = await import("./conversion");
  const persos = [{ nom: "Mai", voix: "Voix off lors de ses auto-instructions." }, { nom: "Le Garde", voix: "grave, posée" }];
  assert.deepEqual([...codesEnVoixOff(persos, ["CHAR_mai", "CHAR_le_garde", "VOICE_off"])], ["CHAR_mai"]);
});

test("ApresFiche.description : lue, et suffisante pour une écriture (la nouvelle intention du plan)", async () => {
  const { lireApresFiche, verifierFiche } = await import("./sheets");
  assert.equal(lireApresFiche({ description: "  Mai se lève.\n\nÉtat en fin de plan : debout.  " }).description, "Mai se lève.\n\nÉtat en fin de plan : debout.");
  assert.equal(lireApresFiche({ description: "   " }).description, undefined);
  const etat = { titre: "t", sections: {}, refs: [], registre: new Map(), aUnRendu: false, generationEnCours: false, dureeGenerationSecondes: 8 };
  assert.equal(verifierFiche({ description: "Mai se lève." }, etat), null);
  assert.equal(verifierFiche({}, etat), "Rien à écrire dans la fiche.");
});

test("ApresFiche.reglages (« Itérer ») : lus, suffisants pour une écriture, valeurs inconnues refusées", async () => {
  const { lireApresFiche, verifierFiche } = await import("./sheets");
  assert.deepEqual(lireApresFiche({ reglages: { creativite: "bold", styleCamera: 3 } }).reglages, { creativite: "bold" });
  assert.equal(lireApresFiche({ reglages: {} }).reglages, undefined);
  const etat = { titre: "t", sections: {}, refs: [], registre: new Map(), aUnRendu: false, generationEnCours: false, dureeGenerationSecondes: 8 };
  assert.equal(verifierFiche({ reglages: { creativite: "restrained", styleCamera: "aucun" } }, etat), null);
  assert.equal(verifierFiche({ reglages: { styleCamera: "sitcom" } }, etat), null);
  assert.match(verifierFiche({ reglages: { creativite: "folle" } }, etat) ?? "", /Créativité inconnue/);
  assert.match(verifierFiche({ reglages: { styleCamera: "kubrick" } }, etat) ?? "", /Style de mise en scène inconnu/);
});

// --- une incohérence DÉJÀ là (réplique déliée, lignes <Audio 1> restées) ne bloque plus une correction sans rapport (2026-10-14) ---

test("verifierFiche : un label orphelin déjà présent n'empêche pas une écriture qui ne l'aggrave pas ; un nouveau orphelin refuse toujours", async () => {
  const { verifierFiche, labelsOrphelinsActuels, evaluerEcrasementFiche } = await import("./sheets");
  const etat = {
    titre: "Geste préparatoire",
    sections: { subject_definitions: "<Subject 1> is Mai from <Picture 1>.\n<Audio 1> is the voice-timbre reference for <Subject 1>.", detailed_description: "[Shot 1] <Subject 1> raises the wand." },
    refs: [{ type: "picture" as const, slot: 1, asset: "CHAR_mai" }],
    // la voix a été déliée du plan : <Audio 1> n'a plus de référence
    registre: new Map([["CHAR_mai", "personnage"]]),
    aUnRendu: true,
    generationEnCours: false,
    dureeGenerationSecondes: 10,
  };
  assert.deepEqual(labelsOrphelinsActuels(etat), ["Audio:1"]);
  assert.equal(verifierFiche({ sections: { detailed_description: "[Shot 1] <Subject 1> raises the wand, arm already lifted." } }, etat), null);
  assert.match(verifierFiche({ sections: { detailed_description: "[Shot 1] <Subject 1> raises the wand. <Picture 3> appears." } }, etat) ?? "", /sans référence.*Picture 3/);
  const ev = evaluerEcrasementFiche({ sections: { detailed_description: "x" } }, etat);
  assert.ok(ev.avertissements.some((a) => /citait déjà <Audio 1> sans référence/.test(a.texte)));
});

test("fiche qui cite un asset créé par la même proposition : acceptée en aperçu (la clé existe), refusée sans elle", () => {
  const avec = { refs: [{ type: "picture" as const, slot: 1, asset: "DEC_cercle" }], sections: { summary: "[reference generation] <Subject 1>" }, dependDeCles: [cleNouvelAsset("DEC_cercle")] };
  assert.ok(verifierFiche(avec, etatVide())?.includes("DEC_cercle"), "l'état réel ne connaît pas l'asset");
  const etat = etatVide();
  etat.registre.set("DEC_cercle", "oth");
  assert.equal(verifierFiche(avec, etat), null);
});

// --- raccord : l'emplacement de l'image du plan précédent reste libre (2026-10-19) ---------------------------------
