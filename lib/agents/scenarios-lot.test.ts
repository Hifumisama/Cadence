import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_REPLIQUES_PAR_PLAN, depuisPlanAInserer, depuisScenarioEpisode, type SortieScenarioEpisode } from "./conversion";
import { rapprocherLocuteur, texteComparable, type AssetLocuteur } from "./locuteurs";
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

// --- locuteurs -------------------------------------------------------------------

const registre: AssetLocuteur[] = [
  { id: 1, code: "CHAR_maya", type: "personnage" },
  { id: 2, code: "CHAR_iris_mercier", type: "personnage" },
  { id: 3, code: "VOICE_off", type: "voix" },
  { id: 4, code: "CHAR_marc", type: "personnage" },
  { id: 5, code: "CHAR_marie", type: "personnage" },
];

test("locuteur : le registre d'abord (code ou nom), « voix off » ensuite, un inconnu reste libre", () => {
  assert.deepEqual(rapprocherLocuteur("Maya", registre), { locuteurId: 1, voixId: null, locuteurTexte: "", connu: true });
  assert.equal(rapprocherLocuteur("CHAR_maya", registre).locuteurId, 1);
  assert.equal(rapprocherLocuteur("  MAYA  ", registre).locuteurId, 1, "casse et espaces");
  assert.equal(rapprocherLocuteur("Iris Mercier", registre).locuteurId, 2, "le nom complet suit le code");
  assert.equal(rapprocherLocuteur("Maya (au téléphone)", registre).locuteurId, 1, "le premier mot suffit, sans ambiguïté");

  assert.deepEqual(rapprocherLocuteur("voix off", registre), { locuteurId: null, voixId: 3, locuteurTexte: "", connu: true }, "la voix off du registre");
  assert.equal(rapprocherLocuteur("Narrateur", registre).voixId, 3);
  assert.deepEqual(rapprocherLocuteur("Voix-off", [{ id: 1, code: "CHAR_maya", type: "personnage" }]), { locuteurId: null, voixId: null, locuteurTexte: "Voix off", connu: true }, "sans voix off au registre : un locuteur libre, légitime");

  // Le modèle écrit souvent le CODE du registre (essai réel du 2026-10-02 : « VOICE_off »).
  assert.deepEqual(rapprocherLocuteur("VOICE_off", registre), { locuteurId: null, voixId: 3, locuteurTexte: "", connu: true }, "une voix citée par son code");
  assert.equal(rapprocherLocuteur("VOICE_autre", registre).connu, false, "…mais pas n'importe quelle voix");

  const inconnu = rapprocherLocuteur("Le capitaine", registre);
  assert.deepEqual(inconnu, { locuteurId: null, voixId: null, locuteurTexte: "Le capitaine", connu: false }, "jamais d'asset créé : un locuteur libre, signalé");
  assert.equal(rapprocherLocuteur("", registre).connu, false);
  assert.equal(rapprocherLocuteur("x".repeat(300), registre).locuteurTexte.length, 100, "borné comme la colonne");
  // Deux prénoms qui commencent pareil : pas d'amalgame sur le premier mot.
  assert.equal(rapprocherLocuteur("Mar", registre).connu, false);
});

test("texte comparable : insensible à la casse, aux accents et à la ponctuation", () => {
  assert.equal(texteComparable("Encore du sel !"), texteComparable("encore du sel"));
  assert.equal(texteComparable("Où est-elle ?"), texteComparable("ou est elle"));
});

// --- scénario d'un épisode en lot ---------------------------------------------------

const sortie: SortieScenarioEpisode = {
  episode: { titre: "Le sel", resume: "Le pont se couvre de sel." },
  scenes: [
    {
      titre: "Le pont",
      fonction: "Installer le lieu",
      plans: [
        { titre: "Arrivée", description: "Iris traverse le pont.", dureeSecondes: 6, repliques: [{ locuteur: "Iris", texte: "Encore du sel." }, { locuteur: "Voix off", texte: "Il revenait chaque marée." }] },
        { titre: "Regard", description: "Elle observe l'horizon.", dureeSecondes: 5, repliques: [] },
      ],
    },
    { titre: "La lampe", fonction: "Rupture", plans: [{ titre: "Lampe éteinte", description: "La lampe ne brille plus.", dureeSecondes: 8, repliques: [{ locuteur: "Iris", texte: "Elle s'est éteinte." }] }] },
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

test("lot : plans et répliques sont rangés sous leur scène", () => {
  const l = depuisScenarioEpisode(sortie, vide, { prefixeCle: "ep7-", groupe: "ep-7" });
  assert.deepEqual(l.map((x) => `${x.cibleType}:${x.sousGroupe ?? "-"}`), [
    "scene:Le pont", "plan:Le pont", "replique:Le pont", "replique:Le pont", "plan:Le pont",
    "scene:La lampe", "plan:La lampe", "replique:La lampe",
  ]);
  const repliques = l.filter((x) => x.cibleType === "replique");
  assert.equal(repliques.length, 3);
  assert.deepEqual(repliques.map((r) => (r.apres as { planCle: string }).planCle), ["ep7-plan-1-1", "ep7-plan-1-1", "ep7-plan-2-1"]);
  assert.ok(repliques.every((r) => (r.apres as { sceneCle?: string }).sceneCle?.startsWith("ep7-scene-")), "la scène est celle du plan, créée par la même proposition");
  assert.ok(repliques.every((r) => (r.apres as { episodeId: number }).episodeId === 7));
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

test("répliques : trois par plan au plus (références audio), la quatrième est refusée d'office avec la raison", () => {
  const dense: SortieScenarioEpisode = {
    ...sortie,
    scenes: [{ titre: "Dispute", fonction: "f", plans: [{ titre: "Cris", description: "Ils se disputent.", dureeSecondes: 12, repliques: ["a", "b", "c", "d", "e"].map((t) => ({ locuteur: "Iris", texte: `Réplique ${t}` })) }] }],
  };
  const reps = depuisScenarioEpisode(dense, vide).filter((x) => x.cibleType === "replique");
  assert.equal(reps.length, 5);
  assert.deepEqual(reps.map((r) => !!r.refuseRaison), [false, false, false, true, true]);
  assert.equal(MAX_REPLIQUES_PAR_PLAN, 3);
  assert.match(reps[3]!.refuseRaison!, /maximum de références audio/);
});

test("plan à insérer : ses répliques suivent, rattachées au plan inséré", () => {
  const l = depuisPlanAInserer(sortie, { episodeId: 7, position: { apresPlanUuid: "u-a" }, sceneId: 4 });
  assert.deepEqual(l.map((x) => x.cibleType), ["plan", "replique", "replique"]);
  assert.equal((l[1]!.apres as { planCle: string }).planCle, "plan-insere");
  assert.equal((l[1]!.apres as { sceneId: number }).sceneId, 4);
});

test("verrou de portée : une réplique suit la portée de son épisode", () => {
  const cible = { type: "replique" as const, operation: "creer" as const, episodeId: 7, saisonId: 2 };
  assert.equal(verifierPortee({ type: "projet", cibleId: null }, cible), null);
  assert.equal(verifierPortee({ type: "saison", cibleId: 2 }, cible), null);
  assert.equal(verifierPortee({ type: "episode", cibleId: 7 }, cible), null);
  assert.match(verifierPortee({ type: "episode", cibleId: 8 }, cible) ?? "", /réplique n'est pas dans la portée/);
  assert.match(verifierPortee({ type: "saison", cibleId: 3 }, cible) ?? "", /Hors portée/);
});
