import assert from "node:assert/strict";
import { test } from "node:test";
import { avecSection, construireSections, diffSections, egal, sortieVersBrief, statutDeSection } from "./brief";
import { cocheParDefaut, compter, ecrasementsAConfirmer, grouper, raisonNonCochable, resumerSelection } from "./cochage";
import { depuisCorrectionPlan, depuisPlanAInserer, depuisPromptAsset, depuisScenarioEpisode, type SortieScenarioEpisode } from "./conversion";
import { verifierPortee, type CibleChangement } from "./portee";
import { planifierInsertion } from "./rangs";
import { squeletteDepuisBrief } from "./squelette";
import type { BriefContenu, VueChangement } from "./types";

// --- verrou de portée -------------------------------------------------------

const c = (o: Partial<CibleChangement> & Pick<CibleChangement, "type" | "operation">): CibleChangement => o;

test("portée projet : tout est autorisé", () => {
  for (const type of ["saison", "episode", "scene", "plan", "asset", "projet"] as const) {
    assert.equal(verifierPortee({ type: "projet", cibleId: null }, c({ type, operation: "creer" })), null, type);
  }
});

test("portée épisode : son plan oui, un plan d'un autre épisode non", () => {
  const scope = { type: "episode" as const, cibleId: 7 };
  assert.equal(verifierPortee(scope, c({ type: "plan", operation: "creer", episodeId: 7 })), null);
  assert.equal(verifierPortee(scope, c({ type: "plan", operation: "modifier", episodeId: 7, planId: 3 })), null);
  assert.match(verifierPortee(scope, c({ type: "plan", operation: "modifier", episodeId: 8, planId: 9 })) ?? "", /Hors portée/);
  assert.match(verifierPortee(scope, c({ type: "episode", operation: "creer", saisonId: 1 })) ?? "", /Hors portée/);
  assert.match(verifierPortee(scope, c({ type: "projet", operation: "modifier" })) ?? "", /Hors portée/);
});

test("portée plan : ce plan seulement ; asset : peut être créé, jamais modifié hors cible", () => {
  const plan = { type: "plan" as const, cibleId: 5 };
  assert.equal(verifierPortee(plan, c({ type: "plan", operation: "modifier", planId: 5 })), null);
  assert.match(verifierPortee(plan, c({ type: "plan", operation: "modifier", planId: 6 })) ?? "", /Hors portée/);
  assert.match(verifierPortee(plan, c({ type: "plan", operation: "creer", episodeId: 1 })) ?? "", /Hors portée/);
  assert.equal(verifierPortee(plan, c({ type: "asset", operation: "creer" })), null, "un asset manquant se propose de partout");
  assert.match(verifierPortee(plan, c({ type: "asset", operation: "modifier", assetId: 1 })) ?? "", /Hors portée/);
  const asset = { type: "asset" as const, cibleId: 4 };
  assert.equal(verifierPortee(asset, c({ type: "asset", operation: "modifier", assetId: 4 })), null);
  assert.match(verifierPortee(asset, c({ type: "asset", operation: "modifier", assetId: 5 })) ?? "", /Hors portée/);
});

test("le brief est autorisé à toute portée ; un enfant d'une création de la même proposition hérite du verdict", () => {
  assert.equal(verifierPortee({ type: "plan", cibleId: 1 }, c({ type: "brief", operation: "modifier" })), null);
  assert.equal(verifierPortee({ type: "saison", cibleId: 1 }, c({ type: "plan", operation: "creer", parentNouveau: true })), null);
});

test("portée saison : ses épisodes oui, une autre saison non", () => {
  const scope = { type: "saison" as const, cibleId: 2 };
  assert.equal(verifierPortee(scope, c({ type: "episode", operation: "creer", saisonId: 2 })), null);
  assert.match(verifierPortee(scope, c({ type: "episode", operation: "creer", saisonId: 3 })) ?? "", /Hors portée/);
  assert.match(verifierPortee(scope, c({ type: "saison", operation: "creer" })) ?? "", /Hors portée/);
});

// --- cochage ----------------------------------------------------------------

const base = { operation: "creer" as const, avertissements: [], ecrase: null, refuseRaison: null };

test("cochage par défaut : créations cochées ; écrasements, suppressions, bloqués, refusés non", () => {
  assert.equal(cocheParDefaut(base), true);
  assert.equal(cocheParDefaut({ ...base, operation: "modifier" }), true, "modifier un non-validé est coché");
  assert.equal(cocheParDefaut({ ...base, operation: "modifier", ecrase: "écrase du validé" }), false);
  assert.equal(cocheParDefaut({ ...base, operation: "supprimer" }), false);
  assert.equal(cocheParDefaut({ ...base, avertissements: [{ type: "bloque_controle", texte: "17 s" }] }), false);
  assert.equal(cocheParDefaut({ ...base, refuseRaison: "hors portée" }), false);
  assert.equal(cocheParDefaut({ ...base, avertissements: [{ type: "invention", texte: "ventilateur" }] }), true, "une invention n'empêche pas le cochage");
});

test("raisonNonCochable : refus d'office et contrôle bloquant", () => {
  assert.equal(raisonNonCochable({ avertissements: [], refuseRaison: null }), null);
  assert.equal(raisonNonCochable({ avertissements: [], refuseRaison: "Hors portée" }), "Hors portée");
  assert.match(raisonNonCochable({ avertissements: [{ type: "bloque_controle", texte: "x" }], refuseRaison: null }) ?? "", /contrôle/);
});

function vue(id: number, o: Partial<VueChangement> = {}): VueChangement {
  return {
    id, ordre: id, sousGroupe: null, groupe: "plans", cle: null, cibleType: "plan", cibleRef: null, libelle: `c${id}`, operation: "creer",
    avant: null, apres: null, position: null, rangsDeplaces: [], avertissements: [], ecrase: null, coche: true, bloque: false,
    refuseRaison: null, appliqueAt: null, ...o,
  };
}

test("compteurs, groupes (écrasements en tête) et résumé de sélection", () => {
  const liste = [
    vue(1),
    vue(2, { coche: false }),
    vue(3, { bloque: true, coche: false, avertissements: [{ type: "bloque_controle", texte: "17 s" }] }),
    vue(4, { refuseRaison: "hors portée", coche: false }),
    vue(5, { operation: "modifier", ecrase: "écrase", coche: true, avertissements: [{ type: "invention", texte: "x" }] }),
    vue(6, { groupe: "brief", cibleType: "brief" }),
  ];
  const n = compter(liste);
  assert.deepEqual(n, { total: 6, selectionnes: 3, ecartes: 1, bloques: 1, refuses: 1, ecrasementsSelectionnes: 1, inventions: 1 });
  const g = grouper(liste);
  assert.deepEqual(g.map((x) => x.id), ["ecrasement", "brief", "plans"]);
  assert.equal(g[0]!.changements[0]!.id, 5);
  assert.equal(g.find((x) => x.id === "plans")!.coches, 1);
  assert.deepEqual(ecrasementsAConfirmer(liste).map((x) => x.changementId), [5]);
  assert.match(resumerSelection(n), /6 changements : 3 retenus, 1 écarté, 1 bloqué, 1 refusé/);
});

// --- rangs d'insertion ------------------------------------------------------

const plansEp = [
  { uuid: "a", titre: "A" },
  { uuid: "b", titre: "B" },
  { uuid: "c", titre: "C" },
];

test("insertion d'un plan : après un plan, début, fin ; les suivants descendent d'un rang", () => {
  const apresA = planifierInsertion(plansEp, { apresPlanUuid: "a" })!;
  assert.equal(apresA.index, 1);
  assert.deepEqual(apresA.deplaces.map((d) => [d.planUuid, d.rangAvant, d.rangApres]), [["b", 2, 3], ["c", 3, 4]]);
  assert.equal(planifierInsertion(plansEp, { debut: true })!.deplaces.length, 3);
  assert.equal(planifierInsertion(plansEp, { fin: true })!.deplaces.length, 0);
  assert.equal(planifierInsertion(plansEp, null)!.index, 3, "sans position : à la fin");
  assert.equal(planifierInsertion(plansEp, { apresPlanUuid: "zzz" }), null);
  assert.equal(planifierInsertion([], { debut: true })!.index, 0);
});

// --- brief ------------------------------------------------------------------

const brief: BriefContenu = {
  titre: "Le Phare de Sel",
  source: "pitch",
  arc: "Iris garde un phare couvert de sel.",
  genreTon: "Mystère calme",
  style: { nom: "Live-action cinématographique", clause: "Cinematic live-action, desaturated blue-grey palette." },
  langueDialogues: "French",
  dureeEpisodeSecondes: 90,
  episodes: [
    { titre: "Le sel", resume: "Le pont est couvert de sel." },
    { titre: "La marée", resume: "Le bateau revient." },
  ],
  personnages: [{ nom: "Iris", role: "gardienne", reconnaissable: "Cheveux gris attachés", statut: "fourni" }],
  lieux: [{ nom: "Le phare", description: "Tour blanche rongée par le sel", statut: "deduit" }],
  continuite: [],
  rimes: [],
  progressions: [],
  pieges: [],
  inventions: ["Le capitaine est une silhouette"],
  questionsOuvertes: [],
};

test("statuts du brief : déclarés, sinon déduits du contenu ; une correction à la main = fourni", () => {
  assert.equal(statutDeSection("arc", "x", { arc: "fourni" }), "fourni");
  assert.equal(statutDeSection("arc", "x", { arc: "incertain" }), "a_valider", "« incertain » devient a_valider");
  assert.equal(statutDeSection("inventions", ["a"]), "a_valider");
  assert.equal(statutDeSection("inventions", []), "deduit");
  assert.equal(statutDeSection("personnages", [{ statut: "fourni" }]), "fourni");
  assert.equal(statutDeSection("personnages", [{ statut: "fourni" }, { statut: "incertain" }]), "a_valider");
  assert.equal(statutDeSection("lieux", [{ statut: "deduit" }]), "deduit");
  const { contenu, statuts } = sortieVersBrief({ ...brief, statuts: { arc: "fourni", style: "a_valider" } });
  assert.equal("statuts" in contenu, false, "les statuts ne restent pas dans le contenu");
  assert.equal(statuts.arc, "fourni");
  assert.equal(statuts.style, "a_valider");
  assert.equal(statuts.inventions, "a_valider");
  const sections = construireSections(contenu, statuts);
  assert.equal(sections[0]!.cle, "titre");
  assert.ok(sections.every((s) => ["fourni", "deduit", "a_valider"].includes(s.statut)));
});

test("diff de brief : seules les sections modifiées, insensible à l'ordre des clés", () => {
  assert.equal(egal({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true);
  const modifie = avecSection(brief, "dureeEpisodeSecondes", 120);
  assert.deepEqual(diffSections(brief, modifie).map((d) => [d.cle, d.avant, d.apres]), [["dureeEpisodeSecondes", 90, 120]]);
  assert.equal(diffSections(brief, brief).length, 0);
  assert.ok(diffSections(null, brief).length > 10, "sans brief, toutes les sections diffèrent");
});

// --- squelette --------------------------------------------------------------

const etatVide = { saisons: [], episodes: [], briefValide: null };

test("squelette d'un projet vide : brief (qui porte la clause de style), saison 1, un épisode par entrée du brief", () => {
  const s = squeletteDepuisBrief(brief, { arc: "deduit" }, etatVide);
  assert.deepEqual(s.map((x) => `${x.cibleType}:${x.operation}`), ["brief:creer", "saison:creer", "episode:creer", "episode:creer"]);
  assert.ok(!s.some((x) => x.cibleType === "projet"), "plus de changement « projet » : la clause de style suit le brief");
  assert.equal(s[0]!.cibleRef, "*");
  const ep = s.filter((x) => x.cibleType === "episode");
  assert.deepEqual(ep.map((x) => x.cle), ["episode-1", "episode-2"]);
  assert.equal((ep[0]!.apres as { saisonCle: string }).saisonCle, "saison-1");
  assert.match(ep[1]!.libelle, /Épisode 2/);
});

test("squelette idempotent : saison existante réutilisée, épisode du même titre non recréé, brief valide comparé", () => {
  const etat = {
    saisons: [{ id: 3, numero: 1, titre: "S1" }],
    episodes: [{ id: 9, seasonId: 3, numero: 1, titre: "le sel", resume: "" }],
    briefValide: brief,
  };
  const s = squeletteDepuisBrief(brief, {}, etat);
  assert.deepEqual(s.map((x) => `${x.cibleType}:${x.operation}`), ["episode:creer"], "rien d'autre : tout est déjà là");
  assert.equal((s[0]!.apres as { saisonId: number }).saisonId, 3);
  assert.match(s[0]!.libelle, /Épisode 2/, "la numérotation continue après l'existant");
  const change = squeletteDepuisBrief(avecSection(brief, "dureeEpisodeSecondes", 120), {}, etat);
  assert.ok(change.some((x) => x.cibleType === "brief" && x.cibleRef === "dureeEpisodeSecondes" && x.operation === "modifier"));
});

// --- conversion des sorties de skills ---------------------------------------

test("prompt-asset → un changement d'asset : prompt, méthode si elle diffère, durée pour un son, remarques en info", () => {
  const sortie = { methode: "edition" as const, raisonMethode: "Même sujet, autre cadrage.", promptGeneration: "Crop tighter.", remarques: [{ type: "dependance-parent", message: "Le parent n'a pas d'image." }] };
  const [ch] = depuisPromptAsset(sortie, { id: 4, code: "CHAR_maya_gp", type: "personnage", methodeGeneration: "generation", methodeApplicable: true });
  assert.equal(ch!.cibleType, "asset");
  assert.equal(ch!.cibleRef, "4");
  assert.deepEqual(ch!.apres, { promptGeneration: "Crop tighter.", methodeGeneration: "edition" });
  assert.ok(ch!.avertissements!.some((w) => w.texte.includes("dependance-parent")));
  const [son] = depuisPromptAsset({ ...sortie, methode: "generation", dureeSecondes: 4 }, { id: 5, code: "SFX_porte", type: "sfx", methodeGeneration: null, methodeApplicable: false });
  assert.deepEqual(son!.apres, { promptGeneration: "Crop tighter.", dureeSecondes: 4 }, "pas de méthode d'image pour un son");
});

const scenario: SortieScenarioEpisode = {
  episode: { titre: "Le sel", resume: "Le pont se couvre de sel." },
  scenes: [
    { titre: "Le pont", fonction: "Installer le lieu", plans: [
      { titre: "Arrivée", description: "Iris traverse le pont.", dureeSecondes: 6, repliques: [{ locuteur: "Iris", texte: "Encore du sel." }] },
      { titre: "Regard", description: "Elle observe l'horizon.", dureeSecondes: 5, repliques: [] },
    ] },
  ],
  inventions: ["Une mouette"],
  notes: "",
};

test("scenario-episode → épisode, scènes, plans, répliques : l'existant est modifié, le reste créé", () => {
  const ep = { id: 2, titre: "Le sel", resume: "ancien", scenes: [], plans: [{ uuid: "u-regard", titre: "Regard", sceneId: null }] };
  const s = depuisScenarioEpisode(scenario, ep);
  assert.deepEqual(s.map((x) => `${x.cibleType}:${x.operation}`), ["episode:modifier", "scene:creer", "plan:creer", "replique:creer", "plan:modifier"]);
  const cree = s.find((x) => x.cibleType === "plan" && x.operation === "creer")!;
  assert.deepEqual(cree.position, { fin: true });
  assert.equal((cree.apres as { sceneCle: string }).sceneCle, "scene-1");
  assert.equal(cree.avertissements!.some((w) => w.type === "non_pris_en_charge"), false, "les répliques sont reprises (changement « réplique »), plus signalées non prises en charge");
  const rep = s.find((x) => x.cibleType === "replique")!;
  assert.equal((rep.apres as { planCle: string }).planCle, cree.cle, "la réplique se rattache au plan créé par la même proposition");
  assert.equal(rep.sousGroupe, "Le pont");
  assert.equal(s.find((x) => x.operation === "modifier" && x.cibleType === "plan")!.cibleRef, "u-regard");
  assert.ok(s[0]!.avertissements!.some((w) => w.type === "invention"), "les inventions se posent sur le premier changement");
  const dejaScene = depuisScenarioEpisode(scenario, { ...ep, scenes: [{ id: 11, titre: "le pont" }], plans: [] });
  assert.equal(dejaScene.filter((x) => x.cibleType === "scene").length, 0, "une scène existante n'est pas recréée");
  assert.equal((dejaScene.find((x) => x.cibleType === "plan")!.apres as { sceneId: number }).sceneId, 11);
});

test("plan à insérer et correction d'un plan : un seul changement, à la bonne position / sur le bon plan", () => {
  const [ins] = depuisPlanAInserer(scenario, { episodeId: 2, position: { apresPlanUuid: "u-a" }, sceneId: 8 });
  assert.equal(ins!.operation, "creer");
  assert.deepEqual(ins!.position, { apresPlanUuid: "u-a" });
  assert.equal((ins!.apres as { sceneId: number }).sceneId, 8);
  const [cor] = depuisCorrectionPlan(scenario, { uuid: "u-p", titre: "Arrivée" });
  assert.equal(cor!.cibleRef, "u-p");
  assert.equal(cor!.operation, "modifier");
  assert.deepEqual(depuisPlanAInserer({ ...scenario, scenes: [] }, { episodeId: 1, position: { fin: true }, sceneId: null }), []);
});

test("squelette d'un OneShot : l'épisode technique vide est réutilisé, pas doublé", () => {
  const etat = {
    saisons: [{ id: 1, numero: 1, titre: "OneShot" }],
    episodes: [{ id: 5, seasonId: 1, numero: 1, titre: "Sans titre", resume: "", vide: true }],
    briefValide: null,
  };
  const s = squeletteDepuisBrief({ ...brief, episodes: [brief.episodes[0]!] }, {}, etat);
  const eps = s.filter((x) => x.cibleType === "episode");
  assert.equal(eps.length, 1);
  assert.equal(eps[0]!.operation, "modifier");
  assert.equal(eps[0]!.cibleRef, "5");
  assert.equal(s.some((x) => x.cibleType === "saison"), false, "la saison existante est réutilisée");
  // Deux épisodes au brief : le premier réutilise l'épisode vide, le second est créé.
  const deux = squeletteDepuisBrief(brief, {}, etat).filter((x) => x.cibleType === "episode");
  assert.deepEqual(deux.map((x) => x.operation), ["modifier", "creer"]);
  assert.match(deux[1]!.libelle, /Épisode 2/);
});
