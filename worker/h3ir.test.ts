import assert from "node:assert/strict";
import { test } from "node:test";
import type { BriefH3ir, ResultatBrief } from "../lib/h3ir/brief";
import type { LanceurPython, ReponsePython } from "../lib/h3ir/compilateur";
import type { executerSkill } from "../lib/llm/executer";
import { executerH3ir, lireEntreeH3ir, nettoyerIntent, reduireEnveloppe, SKILL_TRADUCTION, type DepsH3ir } from "./h3ir";

const BRIEF: BriefH3ir = {
  intent: "Mai entre dans la salle.\n\nAmbiance : nuit\n\nScène : L'arrivée",
  assets: [{ path: "/m/mai.png", kind: "image", role: "subject" }],
  seconds: 8,
  megapixels: 0.4,
  dialogue: [],
  effort: "standard",
  seed: 50,
};
const BRIEF_OK: ResultatBrief = { brief: BRIEF, refus: null, avertissements: ["un avertissement"], liens: [{ path: "/m/mai.png", code: "CHAR_mai", type: "picture" }] };

const ENV = { H3IR_PYTHON: "py", LLM_LOCAL_URL: "http://llm:8080" };

const bonne = (): ReponsePython => ({
  http: 201,
  fichiers: { abc: "/m/mai.png" },
  enveloppe: {
    status: "ready",
    source: "written",
    ir: {
      mode: "ref2va",
      prompt: "tout le prompt",
      prompt_tokens: 321,
      sections: { summary: "s" },
      manifest: [{ slot: 1, label: "<Picture 1>", kind: "image", sha256: "abc", role: "subject" }],
      diagnostics: [{ rule: "R1", severity: "WARN", message: "m" }],
      target: { effective_seconds: 8 },
    },
  },
});

function deps(surcharge: Partial<DepsH3ir> & { reponses?: ReponsePython[] } = {}) {
  const appels = { traduction: [] as { skill: string; entree: unknown; options: Record<string, unknown> }[], briefs: [] as unknown[], envoyes: [] as BriefH3ir[] };
  const executer = (async (skill: string, entree: unknown, options: Record<string, unknown>) => {
    appels.traduction.push({ skill, entree, options });
    return { json: { intent: 'Mai enters the room. "Mood": night' }, modele: "gemma", usage: { entree: 10, sortie: 5 } };
  }) as unknown as typeof executerSkill;
  const reponses = surcharge.reponses ?? [bonne()];
  const lancer: LanceurPython = async (_p, _s, entree) => {
    appels.envoyes.push((JSON.parse(entree) as { brief: BriefH3ir }).brief);
    return JSON.stringify(reponses.shift()!);
  };
  const d: DepsH3ir = {
    executer,
    lancer,
    env: ENV,
    charger: async (_p, uuid, options) => {
      appels.briefs.push({ uuid, options });
      return BRIEF_OK;
    },
    ...surcharge,
  };
  return { d, appels };
}

const OPTIONS = () => ({ modele: "gemma", signal: new AbortController().signal });

test("lireEntreeH3ir : le plan est obligatoire, shots et style facultatifs", () => {
  assert.deepEqual(lireEntreeH3ir({ planUuid: "u", shots: 3, director: "wong", creativity: "bold" }), { planUuid: "u", shots: 3, director: "wong", creativity: "bold" });
  assert.deepEqual(lireEntreeH3ir({ planUuid: "u" }), { planUuid: "u", shots: null, director: null, creativity: null });
  assert.throws(() => lireEntreeH3ir({}), /sans plan/);
  // Réécriture d'« Itérer » : la nouvelle description (et sa durée) remplacent celles du plan.
  assert.deepEqual(lireEntreeH3ir({ planUuid: "u", description: "Mai court.", dureeSecondes: 6 }), { planUuid: "u", shots: null, director: null, creativity: null, description: "Mai court.", dureeSecondes: 6 });
  assert.deepEqual(lireEntreeH3ir({ planUuid: "u", description: "  ", dureeSecondes: 6.5 }), { planUuid: "u", shots: null, director: null, creativity: null });
});

test("executerH3ir : la description de remplacement va au chargement du brief ; sans elle, rien n'est surchargé", async () => {
  const vus: unknown[] = [];
  const { d } = deps({
    charger: async (_p, _u, _o, surcharge) => {
      vus.push(surcharge);
      return BRIEF_OK;
    },
  });
  await executerH3ir({ projectId: 7, entree: { planUuid: "u1", description: "Mai court.", dureeSecondes: 6 } }, OPTIONS(), d);
  await executerH3ir({ projectId: 7, entree: { planUuid: "u1" } }, OPTIONS(), deps({ charger: async (_p, _u, _o, s) => (vus.push(s), BRIEF_OK) }).d);
  assert.deepEqual(vus, [{ description: "Mai court.", dureeSecondes: 6 }, undefined]);
});

test("executerH3ir : brief → traduction (une fois, intent français) → compilation avec l'intent anglais", async () => {
  const { d, appels } = deps();
  const etapes: string[] = [];
  const r = await executerH3ir({ projectId: 7, entree: { planUuid: "u1", shots: 2, director: "wong", creativity: "bold" } }, { ...OPTIONS(), surEtape: (t) => etapes.push(t) }, d);

  assert.deepEqual(appels.briefs, [{ uuid: "u1", options: { shots: 2, director: "wong", creativity: "bold" } }]);
  assert.equal(appels.traduction.length, 1);
  assert.equal(appels.traduction[0]!.skill, SKILL_TRADUCTION);
  assert.equal(appels.traduction[0]!.entree, BRIEF.intent, "la traduction reçoit l'intent français");
  assert.equal(appels.traduction[0]!.options.temperature, 0.1);
  assert.equal(appels.envoyes.length, 1);
  assert.equal(appels.envoyes[0]!.intent, "Mai enters the room. 'Mood': night", "les guillemets droits sont retirés avant l'envoi");
  assert.equal(appels.envoyes[0]!.seed, 50);

  assert.equal(r.json.moteur, "h3ir");
  assert.equal(r.json.intentFrancais, BRIEF.intent);
  assert.equal(r.json.intentAnglais, "Mai enters the room. 'Mood': night");
  assert.deepEqual(r.json.liens, BRIEF_OK.liens);
  assert.deepEqual(r.json.avertissements, ["un avertissement"]);
  assert.equal(r.json.compilation.mode, "ref2va");
  assert.equal(r.json.compilation.promptTokens, 321);
  assert.deepEqual(r.json.compilation.sections, { summary: "s" });
  assert.equal(r.json.compilation.dureeEffectiveSecondes, 8);
  assert.deepEqual(r.json.fichiers, { abc: "/m/mai.png" });
  assert.equal(r.json.seedUtilisee, 50);
  assert.equal(r.modele, "gemma");
  assert.deepEqual(etapes, ["Préparation du brief…", "Traduction de l'intent en anglais…", "Compilation Open H3 IR (essai 1/3)… une à deux minutes par essai."]);
});

test("executerH3ir : une relance ne retraduit pas et change de seed", async () => {
  const degrade: ReponsePython = { http: 201, enveloppe: { status: "degraded", fallback_reason: "prose", ir: { mode: "ref2va", prompt: "p" } } };
  const { d, appels } = deps({ reponses: [degrade, bonne()] });
  const r = await executerH3ir({ projectId: 7, entree: { planUuid: "u1" } }, OPTIONS(), d);
  assert.equal(appels.traduction.length, 1, "traduit une seule fois");
  assert.deepEqual(appels.envoyes.map((b) => b.seed), [50, 51]);
  assert.equal(r.json.seedUtilisee, 51);
  assert.equal(r.json.brief.seed, 51);
  assert.deepEqual(r.json.tentatives.map((t) => t.issue), ["relance", "ok"]);
});

test("executerH3ir : un brief refusé échoue avec la raison, sans traduire ni compiler", async () => {
  const { d, appels } = deps({ charger: async () => ({ brief: null, refus: "Le plan n'a aucune image de référence.", avertissements: [], liens: [] }) });
  await assert.rejects(() => executerH3ir({ projectId: 7, entree: { planUuid: "u1" } }, OPTIONS(), d), /aucune image de référence/);
  assert.equal(appels.traduction.length, 0);
  assert.equal(appels.envoyes.length, 0);
  await assert.rejects(() => executerH3ir({ projectId: 7, entree: { planUuid: "u1" } }, OPTIONS(), { ...d, charger: async () => null }), /Plan introuvable/);
});

test("executerH3ir : Python non configuré → échec AVANT de prendre le LLM", async () => {
  const { d, appels } = deps({ env: {} });
  // Sans H3IR_PYTHON ni venv de labo à cet endroit de test, `pythonH3ir` cherche sur le disque : on force l'absence en pointant un autre dossier de travail.
  const avant = process.cwd();
  process.chdir(process.env.TEMP ?? "/tmp");
  try {
    await assert.rejects(() => executerH3ir({ projectId: 7, entree: { planUuid: "u1" } }, OPTIONS(), d), /renseigne H3IR_PYTHON/);
  } finally {
    process.chdir(avant);
  }
  assert.equal(appels.traduction.length, 0);
});

test("executerH3ir : une traduction vide est refusée ; sans projet, la tâche est refusée", async () => {
  const vide = (async () => ({ json: { intent: "   " }, modele: "g", usage: { entree: 1, sortie: 1 } })) as unknown as typeof executerSkill;
  const { d } = deps({ executer: vide });
  await assert.rejects(() => executerH3ir({ projectId: 7, entree: { planUuid: "u1" } }, OPTIONS(), d), /traduction de l'intent est vide/);
  await assert.rejects(() => executerH3ir({ projectId: null, entree: { planUuid: "u1" } }, OPTIONS(), d), /sans projet/);
});

test("nettoyerIntent / reduireEnveloppe", () => {
  assert.equal(nettoyerIntent(' un "mot" '), "un 'mot'");
  assert.equal(nettoyerIntent(42), "");
  const r = reduireEnveloppe({});
  assert.deepEqual(r, { status: null, source: null, mode: null, promptTokens: null, sections: {}, manifest: [], diagnostics: [], dureeEffectiveSecondes: null });
});
