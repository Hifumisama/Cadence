import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REFERENCES_PLAN,
  contexteReferencesDepuisEntree,
  controlerReferences,
  decouperInventaire,
  depuisInventaire,
  estimerInventaire,
  groupeInventaireDeCle,
  cleSousTacheInventaire,
  plansDeLEntree,
  poigneePlan,
  ressemblant,
  type AssetConnu,
  type EntreeInventaire,
  type SortieInventaire,
} from "./inventaire";
import { controleurPourSkill } from "../llm/controles";
import { chargerSkill } from "../llm/skills";

const registre = [
  { code: "CHAR_iris", type: "personnage" },
  { code: "DEC_phare", type: "decor" },
  { code: "PROP_lanterne", type: "prop" },
];

const sortie = (assets: SortieInventaire["assets"]): SortieInventaire => ({ assets, references: [], notes: "" });
const a = (code: string, type: string, extra: Partial<SortieInventaire["assets"][number]> = {}) => ({ code, type, description: "x", plans: ["Plan 1"], raison: "r", ...extra });

test("depuisInventaire : une création par asset, sans prompt, avec la raison et les plans", () => {
  const r = depuisInventaire(sortie([a("PROP_clef", "prop", { raison: "elle ouvre la porte" })]), registre);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.cibleType, "asset");
  assert.equal(r[0]!.operation, "creer");
  assert.equal(r[0]!.cle, "nouvel-asset-PROP_clef");
  assert.deepEqual(r[0]!.apres, { type: "prop", suffixe: "clef", description: "x" });
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

// --- état d'un sujet récurrent : le parent est posé quand le modèle l'oublie (2026-10-13) ---

test("depuisInventaire : un asset du même type qui cite son sujet reçoit ce parent (décor, personnage, prop)", () => {
  const r = depuisInventaire(
    sortie([
      a("DEC_phare_eteint", "decor", { description: "Le même lieu que DEC_phare, feu éteint.", raison: "état différent" }),
      a("CHAR_iris_blessee", "personnage", { description: "Iris blessée.", raison: "CHAR_iris, après le combat" }),
    ]),
    registre,
  );
  const phare = r.find((c) => c.cle === "nouvel-asset-DEC_phare_eteint")!;
  assert.equal((phare.apres as Record<string, unknown>).deriveDeCode, "DEC_phare");
  assert.ok(phare.avertissements!.some((v) => v.type === "info" && /Parent DEC_phare posé/.test(v.texte)));
  const iris = r.find((c) => c.cle === "nouvel-asset-CHAR_iris_blessee")!;
  assert.equal((iris.apres as Record<string, unknown>).deriveDeCode, "CHAR_iris");
});

test("depuisInventaire : parent créé dans la même sortie, et un parent déjà donné n'est pas écrasé", () => {
  const r = depuisInventaire(
    sortie([a("CHAR_golem", "personnage"), a("CHAR_golem_brise", "personnage", { description: "CHAR_golem en morceaux" }), a("DEC_phare_nuit", "decor", { parent: "DEC_phare", raison: "cite PROP_lanterne" })]),
    registre,
  );
  assert.equal((r.find((c) => c.cle === "nouvel-asset-CHAR_golem_brise")!.apres as Record<string, unknown>).deriveDeCle, "nouvel-asset-CHAR_golem");
  assert.equal((r.find((c) => c.cle === "nouvel-asset-DEC_phare_nuit")!.apres as Record<string, unknown>).deriveDeCode, "DEC_phare");
});

test("depuisInventaire : un VFX n'est jamais proposé (l'effet va en texte dans le plan), le reste de la sortie passe", () => {
  const r = depuisInventaire(sortie([a("VFX_energie_doree", "vfx"), a("VFX_iris_emergence", "vfx", { raison: "cite CHAR_iris" }), a("PROP_clef", "prop")]), registre);
  assert.deepEqual(r.map((c) => c.cle), ["nouvel-asset-PROP_clef"]);
});

// --- éléments du brief (entretien du 2026-11-08) ---

const elements = [
  { nom: "Le souffle de vent", nature: "vfx" },
  { nom: "La lanterne de cuivre", nature: "prop" },
];

test("depuisInventaire : un VFX tiré d'un élément vfx du brief est accepté, avec son origine ; un VFX deviné reste écarté", () => {
  const r = depuisInventaire(
    sortie([a("VFX_souffle_vent", "vfx", { element: "le souffle de VENT" }), a("VFX_poussiere", "vfx", { element: null }), a("VFX_faux", "vfx", { element: "Un effet inconnu" })]),
    registre,
    { elements },
  );
  assert.deepEqual(r.map((c) => c.cle), ["nouvel-asset-VFX_souffle_vent"]);
  assert.ok(r[0]!.avertissements!.some((v) => v.type === "info" && /élément du brief « Le souffle de vent »/.test(v.texte)));
});

test("depuisInventaire : un VFX qui cite un élément prop est écarté ; un prop tiré d'un élément est signalé, un type contraire alerte", () => {
  const r = depuisInventaire(
    sortie([a("VFX_lanterne", "vfx", { element: "La lanterne de cuivre" }), a("PROP_lanterne_cuivre", "prop", { element: "La lanterne de cuivre" }), a("PROP_souffle", "prop", { element: "Le souffle de vent" })]),
    [],
    { elements },
  );
  assert.deepEqual(r.map((c) => c.cle), ["nouvel-asset-PROP_lanterne_cuivre", "nouvel-asset-PROP_souffle"]);
  assert.ok(r[0]!.avertissements!.some((v) => /Tiré de l'élément/.test(v.texte)));
  assert.ok(r[1]!.avertissements!.some((v) => v.type === "alerte_controle" && /vfx/.test(v.texte)));
});

test("depuisInventaire : sans éléments du brief (ancien brief), aucun VFX ne passe", () => {
  const r = depuisInventaire(sortie([a("VFX_souffle_vent", "vfx", { element: "Le souffle de vent" })]), registre);
  assert.equal(r.length, 0);
});

test("depuisInventaire : un groupe de scènes ne repropose pas ce qu'un autre groupe crée, et peut en dériver", () => {
  const r = depuisInventaire(sortie([a("PROP_coffre", "prop"), a("PROP_coffre_ouvert", "prop", { parent: "PROP_coffre" }), a("PROP_corde", "prop")]), registre, {
    proposes: [{ code: "PROP_coffre", type: "prop", description: "x" }],
  });
  assert.deepEqual(r.map((c) => c.cle), ["nouvel-asset-PROP_corde", "nouvel-asset-PROP_coffre_ouvert"]);
  assert.equal((r[1]!.apres as Record<string, unknown>).deriveDeCle, "nouvel-asset-PROP_coffre");
});

// --- références de chaque plan (2026-11-09) ---

const connus: AssetConnu[] = [
  { code: "CHAR_heroine", type: "personnage" },
  { code: "CHAR_heroine_agee", type: "personnage", parent: "CHAR_heroine" },
  { code: "CHAR_garde", type: "personnage" },
  { code: "CHAR_marchand", type: "personnage" },
  { code: "CHAR_enfant", type: "personnage" },
  { code: "DEC_port", type: "decor" },
  { code: "DEC_port_nuit", type: "decor", parent: "DEC_port" },
  { code: "PROP_carte", type: "prop" },
  { code: "PROP_boussole", type: "prop" },
  { code: "VFX_brume", type: "vfx" },
  { code: "KEY_depart", type: "keyframe" },
  { code: "SFX_cloche", type: "sfx" },
  { code: "DEC_le_marche_de_la_ville", type: "decor" },
];
const plansRef = [
  { id: "P01", uuid: "u1", intention: "L'héroïne déplie la carte sur le quai." },
  { id: "P02", uuid: "u2", intention: "Le départ du navire, comme sur la pose de départ." },
];
const refs = (references: SortieInventaire["references"]) => controlerReferences({ references }, { plans: plansRef, connus });

test("controlerReferences : ordre personnages, objets, effets, décor en dernier ; aucune erreur pour une sortie propre", () => {
  const r = refs([
    { plan: "P01", codes: ["DEC_port", "VFX_brume", "PROP_carte", "CHAR_heroine"] },
    { plan: "P02", codes: [] },
  ]);
  assert.deepEqual(r.plans.find((p) => p.id === "P01")!.codes, ["CHAR_heroine", "PROP_carte", "VFX_brume", "DEC_port"]);
  assert.equal(r.plans.find((p) => p.id === "P01")!.uuid, "u1");
  assert.deepEqual(r.problemes, []);
});

test("controlerReferences : les locuteurs gardent l'ordre du modèle parmi les personnages", () => {
  const r = refs([{ plan: "P01", codes: ["CHAR_garde", "DEC_port", "CHAR_heroine"] }, { plan: "P02", codes: [] }]);
  assert.deepEqual(r.plans[0]!.codes, ["CHAR_garde", "CHAR_heroine", "DEC_port"]);
});

test("controlerReferences : code inconnu = erreur (renvoi), code à un mot de liaison près corrigé, alias d'un asset proposé", () => {
  const r = controlerReferences(
    { references: [{ plan: "P01", codes: ["CHAR_heroine", "PROP_inexistant", "DEC_le_marche_ville", "PROP_ma_lanterne"] }, { plan: "P02", codes: [] }] },
    { plans: plansRef, connus: [...connus, { code: "PROP_lanterne", type: "prop", aCreer: true }], alias: new Map([["PROP_ma_lanterne", "PROP_lanterne"]]) },
  );
  assert.deepEqual(r.plans[0]!.codes, ["CHAR_heroine", "PROP_lanterne", "DEC_le_marche_de_la_ville"]);
  assert.equal(r.problemes.length, 1);
  assert.equal(r.problemes[0]!.niveau, "erreur");
  assert.match(r.problemes[0]!.message, /PROP_inexistant/);
});

test("controlerReferences : jamais de son ; un seul visage par personnage, un seul décor, keyframe seulement si l'intention la cite", () => {
  const r = refs([
    { plan: "P01", codes: ["CHAR_heroine", "CHAR_heroine_agee", "SFX_cloche", "DEC_port", "DEC_port_nuit", "KEY_depart", "CHAR_heroine"] },
    { plan: "P02", codes: ["KEY_depart", "DEC_port"] },
  ]);
  assert.deepEqual(r.plans[0]!.codes, ["CHAR_heroine", "DEC_port"]);
  assert.deepEqual(r.plans[1]!.codes, ["KEY_depart", "DEC_port"], "« la pose de départ » cite KEY_depart");
  assert.ok(r.problemes.some((p) => p.niveau === "erreur" && /SFX_cloche/.test(p.message)));
  for (const motif of [/CHAR_heroine_agee/, /DEC_port_nuit/, /keyframe KEY_depart/]) assert.ok(r.problemes.some((p) => p.niveau === "alerte" && motif.test(p.message)), String(motif));
});

test("controlerReferences : plus de 6 images = erreur, le code garde les personnages et le décor, les effets partent d'abord", () => {
  const r = refs([
    { plan: "P01", codes: ["VFX_brume", "PROP_carte", "PROP_boussole", "CHAR_heroine", "CHAR_garde", "CHAR_marchand", "CHAR_enfant", "DEC_port"] },
    { plan: "P02", codes: [] },
  ]);
  assert.equal(r.plans[0]!.codes.length, MAX_REFERENCES_PLAN);
  assert.deepEqual(r.plans[0]!.codes, ["CHAR_heroine", "CHAR_garde", "CHAR_marchand", "CHAR_enfant", "PROP_carte", "DEC_port"]);
  assert.ok(r.problemes.some((p) => p.niveau === "erreur" && /6 au plus/.test(p.message)));
});

test("controlerReferences : poignée inconnue et plan oublié = erreurs ; une seconde entrée du même plan est ignorée", () => {
  const r = refs([
    { plan: "P01", codes: ["CHAR_heroine"] },
    { plan: "P01", codes: ["CHAR_garde"] },
    { plan: "P09", codes: ["CHAR_garde"] },
  ]);
  assert.deepEqual(r.plans.map((p) => [p.id, p.codes]), [["P01", ["CHAR_heroine"]]]);
  assert.ok(r.problemes.some((p) => p.niveau === "erreur" && /P09/.test(p.message)));
  assert.ok(r.problemes.some((p) => p.niveau === "erreur" && /P02/.test(p.message)));
  assert.ok(r.problemes.some((p) => p.niveau === "alerte" && /deux entrées/.test(p.message)));
});

// --- entrée, contrôleur de renvoi, découpage ---

const planE = (n: number, intention = "Une action sur le quai.") => ({ id: poigneePlan(n), titre: `Plan ${n}`, intention });
const entreeDe = (episodes: EntreeInventaire["episodes"]): EntreeInventaire => ({
  registre: [{ code: "CHAR_heroine", type: "personnage", description: "Une femme" }, { code: "DEC_port", type: "decor", description: "Un port" }],
  brief: null,
  clauseStyleDuProjet: "",
  episodes,
  consigne: "c",
});

test("contrôleur du skill : une référence à un asset de la réponse passe (code du modèle ou code final), un code inventé fait renvoyer", () => {
  const entree = entreeDe([{ episode: "Épisode 1", resume: null, scenes: [{ titre: "S1", fonction: "", plans: [planE(1), planE(2)] }] }]);
  const controleur = controleurPourSkill("inventaire-assets", entree)!;
  const ok: SortieInventaire = {
    assets: [{ code: "prop_carte", type: "prop", parent: null, element: null, description: "x", plans: ["Plan 1"], raison: "r" }],
    references: [{ plan: "P01", codes: ["CHAR_heroine", "prop_carte", "DEC_port"] }, { plan: "P02", codes: ["PROP_carte", "DEC_port"] }],
    notes: "",
  };
  assert.deepEqual(controleur(ok), []);
  const ko = { ...ok, references: [{ plan: "P01", codes: ["CHAR_inconnu"] }] };
  const erreurs = controleur(ko);
  assert.ok(erreurs.some((m) => /CHAR_inconnu/.test(m)) && erreurs.some((m) => /P02/.test(m)));
  // Les assets déjà proposés par un groupe précédent sont citables.
  const ctx = contexteReferencesDepuisEntree({ ...entree, assetsDejaProposes: [{ code: "PROP_boussole", type: "prop", description: "x" }] }, { assets: [] });
  assert.ok(ctx.connus.some((c) => c.code === "PROP_boussole"));
});

test("decouperInventaire : un film qui tient dans le budget = un seul appel, l'entrée telle quelle", () => {
  const entree = entreeDe([{ episode: "Épisode 1", resume: "r", scenes: [{ titre: "S1", fonction: "", plans: [planE(1), planE(2), planE(3)] }] }]);
  const g = decouperInventaire(entree, { budgetJetons: 32_000, jetonsSkill: 5000 });
  assert.equal(g.length, 1);
  assert.equal(g[0]!.entree, entree);
  assert.deepEqual(g[0]!.planIds, ["P01", "P02", "P03"]);
  assert.equal(g[0]!.entree.partie, undefined);
});

test("decouperInventaire : un long film (40 scènes, 400 plans) est découpé en groupes de scènes consécutives sous le budget, chaque plan une fois", () => {
  const longue = "Elle traverse la place, s'arrête devant l'étal, regarde le ciel qui se couvre et reprend sa marche vers le port. ".repeat(3);
  let n = 0;
  const scenes = Array.from({ length: 40 }, (_, s) => ({ titre: `Scène ${s + 1}`, fonction: "f", plans: Array.from({ length: 10 }, () => planE(++n, longue)) }));
  const entree = entreeDe([{ episode: "Épisode 1", resume: "Un long film.", scenes }]);
  const jetonsSkill = chargerSkill("inventaire-assets").jetonsEstimes;
  const budget = 32_000;
  assert.ok(estimerInventaire(entree, jetonsSkill) > budget, "l'entrée artificielle dépasse bien le budget");
  const g = decouperInventaire(entree, { budgetJetons: budget, jetonsSkill });
  assert.ok(g.length > 1);
  assert.deepEqual(g.flatMap((x) => x.planIds), plansDeLEntree(entree).map((p) => p.id), "tous les plans, dans l'ordre, une seule fois");
  for (const x of g) {
    assert.ok(estimerInventaire(x.entree, jetonsSkill) + 3000 <= budget, `groupe ${x.numero} sous le budget (place gardée pour les assets proposés)`);
    assert.equal(x.entree.partie, `${x.numero}/${g.length}`);
    assert.equal(x.entree.registre, entree.registre, "chaque groupe garde le registre");
    assert.ok(x.entree.episodes[0]!.scenes.every((s) => s.plans.length === 10), "des scènes entières");
  }
});

test("decouperInventaire : une scène trop longue à elle seule est coupée entre ses plans", () => {
  const longue = "x".repeat(400);
  const entree = entreeDe([{ episode: "Épisode 1", resume: null, scenes: [{ titre: "(hors scène)", fonction: "", plans: Array.from({ length: 300 }, (_, i) => planE(i + 1, longue)) }] }]);
  const g = decouperInventaire(entree, { budgetJetons: 20_000, jetonsSkill: 4000 });
  assert.ok(g.length > 1);
  assert.equal(g.flatMap((x) => x.planIds).length, 300);
  assert.match(g[1]!.entree.episodes[0]!.scenes[0]!.titre, /\(suite\)/);
});

test("clés de sous-tâche d'un inventaire découpé", () => {
  assert.equal(cleSousTacheInventaire(2), "inv:2");
  assert.equal(groupeInventaireDeCle("inv:2"), 2);
  assert.equal(groupeInventaireDeCle("ep:2"), null);
});
