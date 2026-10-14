import { test } from "node:test";
import assert from "node:assert/strict";
import { estLiaison, liaisonOuDefaut } from "./plan-liaison";
import { depuisCorrectionPlan, depuisPlanAInserer, depuisScenarioEpisode, type SortieScenarioEpisode } from "./agents/conversion";

test("liaison : deux valeurs, « suite » par défaut pour tout le reste", () => {
  assert.equal(estLiaison("suite"), true);
  assert.equal(estLiaison("coupe"), true);
  assert.equal(estLiaison("raccord"), false);
  assert.equal(estLiaison(undefined), false);
  assert.equal(liaisonOuDefaut("coupe"), "coupe");
  assert.equal(liaisonOuDefaut(null), "suite");
  assert.equal(liaisonOuDefaut("n'importe quoi"), "suite");
});

const sortie = (liaison?: string): SortieScenarioEpisode => ({
  episode: { titre: "Le sel", resume: "r" },
  scenes: [{ titre: "Le pont", fonction: "f", plans: [{ titre: "Arrivée", description: "Iris traverse.", liaison, dureeSecondes: 6 }] }],
  inventions: [],
  notes: "",
});
const ep = { id: 2, titre: "Le sel", resume: "r", scenes: [], plans: [] };

test("scénario → la liaison du plan est écrite à la création, à l'insertion et à la correction ; une valeur absente ou inconnue n'écrit rien", () => {
  const plan = (c: ReturnType<typeof depuisScenarioEpisode>) => c.find((x) => x.cibleType === "plan")!.apres as { liaison?: string };
  assert.equal(plan(depuisScenarioEpisode(sortie("coupe"), ep)).liaison, "coupe");
  assert.equal("liaison" in plan(depuisScenarioEpisode(sortie(undefined), ep)), false, "sans liaison, la base garde sa valeur (« suite » par défaut)");
  assert.equal("liaison" in plan(depuisScenarioEpisode(sortie("bizarre"), ep)), false);
  const [ins] = depuisPlanAInserer(sortie("suite"), { episodeId: 2, position: { fin: true }, sceneId: null });
  assert.equal((ins!.apres as { liaison?: string }).liaison, "suite");
  const [cor] = depuisCorrectionPlan(sortie("coupe"), { uuid: "u", titre: "Arrivée" });
  assert.equal((cor!.apres as { liaison?: string }).liaison, "coupe");
});
