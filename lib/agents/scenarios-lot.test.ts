import assert from "node:assert/strict";
import { test } from "node:test";
import { depuisPlanAInserer, depuisScenarioEpisode, type SortieScenarioEpisode } from "./conversion";
import {
  comptesLot,
  dernieresSousTaches,
  episodeIdDeCle,
  episodeIdDeGroupe,
  erreurDuLot,
  etatLotPourHeader,
  groupeEpisode,
  rangSousTache,
  resumeAvancement,
  statutPropositionDuLot,
  cleSousTacheEpisode,
  type RunLot,
} from "./lots-pur";
import { verifierPortee } from "./portee";
import { analyserCle, cleLot } from "../taches";

// --- lots : états agrégés ------------------------------------------------------

let n = 0;
const run = (cle: string, statut: RunLot["statut"], o: Partial<RunLot> = {}): RunLot => {
  n += 1;
  return {
    id: n, uuid: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`, cle, libelle: `Épisode ${cle}`, statut,
    progressionJetons: null, erreur: null, createdAt: new Date(2026, 9, 2, 10, 0, n), startedAt: null, finishedAt: null,
    vuAt: null, annulationDemandeeAt: null, ...o,
  };
};

test("clés de sous-tâche et de groupe : aller-retour, jamais un nombre sorti de nulle part", () => {
  assert.equal(cleSousTacheEpisode(12), "ep:12");
  assert.equal(episodeIdDeCle("ep:12"), 12);
  assert.equal(episodeIdDeCle("ep:abc"), null);
  assert.equal(episodeIdDeCle("plan:3"), null);
  assert.equal(episodeIdDeCle(null), null);
  assert.equal(groupeEpisode(12), "ep-12");
  assert.equal(episodeIdDeGroupe("ep-12"), 12);
  assert.equal(episodeIdDeGroupe("plans"), null);
});

test("statut d'un lot : actif tant qu'une tâche l'est, prêt dès qu'un résultat existe, échoué seulement si tout a échoué", () => {
  const comptes = (runs: RunLot[]) => comptesLot(runs);
  assert.equal(statutPropositionDuLot(comptes([run("ep:1", "termine"), run("ep:2", "en_attente")])), "en_generation");
  assert.equal(statutPropositionDuLot(comptes([run("ep:1", "termine"), run("ep:2", "echoue")])), "prete", "un échec isolé ne perd pas le reste");
  assert.equal(statutPropositionDuLot(comptes([run("ep:1", "termine"), run("ep:2", "annulee")])), "prete", "annuler garde ce qui est fini");
  assert.equal(statutPropositionDuLot(comptes([run("ep:1", "echoue"), run("ep:2", "echoue")])), "echouee");
  assert.equal(statutPropositionDuLot(comptes([run("ep:1", "annulee"), run("ep:2", "annulee")])), "rejetee", "tout annulé : rien à relire");
  assert.equal(statutPropositionDuLot(comptes([run("ep:1", "annulee"), run("ep:2", "echoue")])), "echouee");
});

test("une relance remplace la tâche précédente de la même clé, sans changer son rang", () => {
  const vieux = run("ep:1", "echoue", { erreur: "panne" });
  const autre = run("ep:2", "termine");
  const relance = run("ep:1", "en_attente");
  const l = dernieresSousTaches([vieux, autre, relance]);
  assert.deepEqual(l.map((x) => x.run.cle), ["ep:1", "ep:2"], "ordre de première création");
  assert.equal(l[0]!.run.id, relance.id);
  assert.equal(l[0]!.relancee, true);
  assert.equal(l[1]!.relancee, false);
  assert.deepEqual(comptesLot([vieux, autre, relance]), { total: 2, terminees: 1, echecs: 0, annulees: 0, actives: 1 });
  assert.equal(rangSousTache([vieux, autre, relance], "ep:1"), 0);
  assert.equal(rangSousTache([vieux, autre, relance], "ep:2"), 1);
  assert.equal(rangSousTache([vieux, autre, relance], "ep:9"), 2, "une clé inconnue prend le rang suivant");
});

test("messages d'un lot : avancement et erreur", () => {
  assert.equal(resumeAvancement({ total: 12, terminees: 3, echecs: 0, annulees: 0, actives: 9 }), "3/12");
  assert.equal(resumeAvancement({ total: 12, terminees: 8, echecs: 1, annulees: 2, actives: 1 }), "11/12 · 1 échec · 2 annulées");
  assert.match(erreurDuLot([run("ep:1", "echoue", { erreur: "Serveur LLM en panne" })]), /Première erreur : Serveur LLM en panne/);
});

test("header : UNE entrée par lot, « 3/12 », en cours dès qu'une tâche tourne", () => {
  const t = new Date(2026, 9, 2, 10, 0, 0);
  const runs = [
    run("ep:1", "termine", { startedAt: t, finishedAt: new Date(t.getTime() + 60_000) }),
    run("ep:2", "en_cours", { startedAt: new Date(t.getTime() + 61_000), progressionJetons: 420, libelle: "Épisode 2 · La marée" }),
    run("ep:3", "en_attente"),
  ];
  const e = etatLotPourHeader(runs)!;
  assert.equal(e.statut, "en_cours");
  assert.deepEqual(e.progression, { valeur: 1, max: 3, etape: "Épisode 2 · La marée" });
  assert.equal(e.jetons, 420);
  assert.equal(e.detail, "1/3");
  assert.equal(e.finishedAt, null, "pas de fin tant qu'il reste du travail");
  assert.equal(e.vuAt, null);

  const entre = etatLotPourHeader([run("ep:1", "termine"), run("ep:2", "en_attente")])!;
  assert.equal(entre.statut, "en_attente", "entre deux sous-tâches (le GPU fait autre chose) : en attente, avec sa barre");
  assert.equal(entre.progression.valeur, 1);

  const fini = etatLotPourHeader([run("ep:1", "termine", { finishedAt: t, vuAt: t }), run("ep:2", "echoue", { erreur: "x", finishedAt: t, vuAt: t })])!;
  assert.equal(fini.statut, "termine");
  assert.equal(fini.erreur, "1 sous-tâche en échec", "un échec isolé est signalé sans faire échouer le lot");
  assert.ok(fini.vuAt, "vu quand toutes ses tâches le sont");
  const partiel = etatLotPourHeader([run("ep:1", "termine", { vuAt: t, finishedAt: t }), run("ep:2", "termine", { finishedAt: t })])!;
  assert.equal(partiel.vuAt, null);

  assert.equal(etatLotPourHeader([run("ep:1", "annulee"), run("ep:2", "annulee")])!.statut, "annulee");
  assert.equal(etatLotPourHeader([run("ep:1", "echoue", { erreur: "panne" })])!.statut, "echoue");
  assert.equal(etatLotPourHeader([run("ep:1", "en_cours", { annulationDemandeeAt: t })])!.annulationDemandee, true);
  assert.equal(etatLotPourHeader([]), null);
});

test("clé de tâche du header : un lot se désigne par l'uuid de sa proposition, et rien de malformé n'arrive à la base", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  assert.deepEqual(analyserCle(cleLot(uuid)), { genre: "lot", ref: uuid });
  assert.equal(analyserCle("lot:pas-un-uuid"), null);
  assert.equal(analyserCle("lot:"), null);
});

// --- scénario d'un épisode en lot ---------------------------------------------------

const sortie: SortieScenarioEpisode = {
  episode: { titre: "Le sel", resume: "Le pont se couvre de sel." },
  scenes: [
    {
      titre: "Le pont",
      fonction: "Installer le lieu",
      plans: [
        { titre: "Arrivée", description: "Iris traverse le pont.\nIris : « Encore du sel. »\nvoix off : « Il revenait chaque marée. »", dureeSecondes: 6 },
        { titre: "Regard", description: "Elle observe l'horizon.", dureeSecondes: 5 },
      ],
    },
    { titre: "La lampe", fonction: "Rupture", plans: [{ titre: "Lampe éteinte", description: "La lampe ne brille plus.\nIris : « Elle s'est éteinte. »", dureeSecondes: 8 }] },
  ],
  inventions: ["Une mouette"],
  notes: "",
};

const vide = { id: 7, titre: "Le sel", resume: "Le pont se couvre de sel.", scenes: [], plans: [] };

test("lot : les clés symboliques sont préfixées par épisode, le groupe est celui de l'épisode", () => {
  const a = depuisScenarioEpisode(sortie, { ...vide, id: 7 }, { prefixeCle: "ep7-", groupe: groupeEpisode(7), signalerEcrasement: true });
  const b = depuisScenarioEpisode(sortie, { ...vide, id: 8 }, { prefixeCle: "ep8-", groupe: groupeEpisode(8), signalerEcrasement: true });
  const cles = (l: typeof a) => l.map((x) => x.cle).filter(Boolean) as string[];
  assert.ok(cles(a).every((c) => c.startsWith("ep7-")));
  assert.equal(new Set([...cles(a), ...cles(b)]).size, cles(a).length + cles(b).length, "deux épisodes dans une même proposition : aucune clé en commun");
  assert.ok(a.every((x) => x.groupe === "ep-7"), "un groupe par épisode, quel que soit le type de changement");
  assert.ok(cles(a).every((c) => c.length <= 60), "tient dans la colonne `cle`");
});

test("lot : les plans sont rangés sous leur scène, dialogue compris dans la description", () => {
  const l = depuisScenarioEpisode(sortie, vide, { prefixeCle: "ep7-", groupe: "ep-7" });
  assert.deepEqual(l.map((x) => `${x.cibleType}:${x.sousGroupe ?? "-"}`), ["scene:Le pont", "plan:Le pont", "plan:Le pont", "scene:La lampe", "plan:La lampe"]);
});

test("lot : un squelette VIDE n'écrase rien ; un épisode qui a du contenu voit ses modifications signalées", () => {
  const sur_vide = depuisScenarioEpisode({ ...sortie, episode: { titre: "Le sel", resume: "Autre résumé" } }, vide, { signalerEcrasement: true });
  assert.ok(sur_vide.every((x) => !x.ecrase), "rien d'existant : aucun écrasement");

  const rempli = {
    id: 7, titre: "Le sel", resume: "Ancien résumé",
    scenes: [{ id: 3, titre: "Le pont" }],
    plans: [{ uuid: "u-arrivee", titre: "Arrivée", sceneId: 3 }],
  };
  const l = depuisScenarioEpisode(sortie, rempli, { prefixeCle: "ep7-", groupe: "ep-7", signalerEcrasement: true });
  const modifs = l.filter((x) => x.operation === "modifier");
  assert.ok(modifs.length >= 2 && modifs.every((x) => !!x.ecrase), "épisode et plan existants : écrasements nommés");
  assert.match(modifs.find((x) => x.cibleType === "plan")!.ecrase!, /Arrivée/);
  assert.ok(l.filter((x) => x.operation === "creer").every((x) => !x.ecrase), "les créations n'écrasent rien");
  assert.equal(l.some((x) => x.cibleType === "scene" && x.libelle.includes("Le pont")), false, "la scène existante n'est pas recréée");
  const prevenu = l.find((x) => x.cibleType === "plan" && x.operation === "creer");
  assert.ok(prevenu!.avertissements!.some((a) => /déjà 1 plan/.test(a.texte)), "on dit que rien n'est supprimé");

  // Hors lot (un seul épisode) : le comportement d'avant, aucun écrasement signalé d'office.
  assert.ok(depuisScenarioEpisode(sortie, rempli).every((x) => !x.ecrase));
});

test("plan à insérer : un seul changement, le dialogue reste dans la description", () => {
  const l = depuisPlanAInserer(sortie, { episodeId: 7, position: { apresPlanUuid: "u-a" }, sceneId: 4 });
  assert.deepEqual(l.map((x) => x.cibleType), ["plan"]);
  assert.match((l[0]!.apres as { description: string }).description, /Iris : « Encore du sel\. »/);
  assert.equal((l[0]!.apres as { sceneId: number }).sceneId, 4);
});
