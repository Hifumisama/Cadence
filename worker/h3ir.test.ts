import assert from "node:assert/strict";
import { test } from "node:test";
import type { BriefH3ir, ResultatBrief } from "../lib/h3ir/brief";
import type { LanceurPython, ReponsePython } from "../lib/h3ir/compiler";
import type { executerSkill } from "../lib/llm/execute";
import type { ResultatH3ir } from "../lib/h3ir/result";
import { SKILL_RETOUCHE, type ResultatRetouche, type SortieRetouche } from "../lib/h3ir/retouch";
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
  // Décisions d'« Itérer » (2026-11-09) : références ajoutées / retirées et réglages du plan, gardés seulement quand ils portent quelque chose.
  assert.deepEqual(
    lireEntreeH3ir({ planUuid: "u", references: { ajouter: ["PROP_lampe", 3], retirer: [] }, reglagesPlan: { creativite: "bold", styleCamera: null } }),
    { planUuid: "u", shots: null, director: null, creativity: null, references: { ajouter: ["PROP_lampe"], retirer: [] }, reglagesPlan: { creativite: "bold", styleCamera: null } },
  );
  assert.deepEqual(lireEntreeH3ir({ planUuid: "u", references: { ajouter: [], retirer: [] }, reglagesPlan: {} }), { planUuid: "u", shots: null, director: null, creativity: null });
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
  await executerH3ir({ projectId: 7, entree: { planUuid: "u1", references: { ajouter: ["PROP_lampe"], retirer: ["DEC_x"] }, reglagesPlan: { creativite: "restrained" } } }, OPTIONS(), deps({ charger: async (_p, _u, _o, s) => (vus.push(s), BRIEF_OK) }).d);
  assert.deepEqual(vus, [
    { description: "Mai court.", dureeSecondes: 6 },
    undefined,
    { description: null, dureeSecondes: null, references: { ajouter: ["PROP_lampe"], retirer: ["DEC_x"] }, reglages: { creativite: "restrained", styleCamera: null } },
  ]);
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

  assert.equal((r.json as ResultatH3ir).moteur, "h3ir");
  assert.equal((r.json as ResultatH3ir).intentFrancais, BRIEF.intent);
  assert.equal((r.json as ResultatH3ir).intentAnglais, "Mai enters the room. 'Mood': night");
  assert.deepEqual((r.json as ResultatH3ir).liens, BRIEF_OK.liens);
  assert.deepEqual((r.json as ResultatH3ir).avertissements, ["un avertissement"]);
  assert.equal((r.json as ResultatH3ir).compilation.mode, "ref2va");
  assert.equal((r.json as ResultatH3ir).compilation.promptTokens, 321);
  assert.deepEqual((r.json as ResultatH3ir).compilation.sections, { summary: "s" });
  assert.equal((r.json as ResultatH3ir).compilation.dureeEffectiveSecondes, 8);
  assert.deepEqual((r.json as ResultatH3ir).fichiers, { abc: "/m/mai.png" });
  assert.equal((r.json as ResultatH3ir).seedUtilisee, 50);
  assert.equal(r.modele, "gemma");
  assert.deepEqual(etapes, ["Préparation du brief…", "Traduction de l'intent en anglais…", "Compilation Open H3 IR (essai 1/3)… une à deux minutes par essai."]);
});

test("executerH3ir : une relance ne retraduit pas et change de seed", async () => {
  const degrade: ReponsePython = { http: 201, enveloppe: { status: "degraded", fallback_reason: "prose", ir: { mode: "ref2va", prompt: "p" } } };
  const { d, appels } = deps({ reponses: [degrade, bonne()] });
  const r = await executerH3ir({ projectId: 7, entree: { planUuid: "u1" } }, OPTIONS(), d);
  assert.equal(appels.traduction.length, 1, "traduit une seule fois");
  assert.deepEqual(appels.envoyes.map((b) => b.seed), [50, 51]);
  assert.equal((r.json as ResultatH3ir).seedUtilisee, 51);
  assert.equal((r.json as ResultatH3ir).brief.seed, 51);
  assert.deepEqual((r.json as ResultatH3ir).tentatives.map((t) => t.issue), ["relance", "ok"]);
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

// --- « Partir de cet essai » : retouche du prompt ---

const SECTIONS_ESSAI = {
  subject_definitions: "<Subject 1> is the young woman in <Picture 1>.",
  summary: "<Subject 1> moves.",
  retention_analysis: "<Subject 1> fully_preserved.",
  detailed_description: "[Shot 1] A wide shot of <Subject 1>. [Shot 2] The shot cuts to a close-up of <Subject 1>.",
  overall_soundscape: "Wind.",
  non_diegetic_music: "Orchestra.",
};
const RETOUCHE = { numeroRendu: 7, consigne: "Ajoute la réplique.", sections: SECTIONS_ESSAI, repliques: [{ nom: "Katara", texte: "l'Air" }], descriptionApres: "Elle bouge.\nKatara : « l'Air »" };
const BONNE_RETOUCHE: SortieRetouche = {
  refonte: false,
  raison: "",
  modifications: ["Réplique ajoutée."],
  sections: { ...SECTIONS_ESSAI, detailed_description: `${SECTIONS_ESSAI.detailed_description} Katara's voice is heard, <d>[French] l'Air</d>` },
};

function depsRetouche(sorties: SortieRetouche[]) {
  const appels: { skill: string; entree: string }[] = [];
  const executer = (async (skill: string, entree: string) => {
    appels.push({ skill, entree });
    if (skill === SKILL_RETOUCHE) return { json: sorties.shift()!, modele: "gemma", usage: { entree: 100, sortie: 50 } };
    return { json: { intent: "Mai enters." }, modele: "gemma", usage: { entree: 10, sortie: 5 } };
  }) as unknown as typeof executerSkill;
  return { executer, appels };
}

test("executerH3ir : partir d'un essai retouche son prompt, sans compiler ni traduire", async () => {
  const { d } = deps();
  const { executer, appels } = depsRetouche([BONNE_RETOUCHE]);
  const r = await executerH3ir({ projectId: 7, entree: { planUuid: "u1", retouche: RETOUCHE } }, OPTIONS(), { ...d, executer, lancer: async () => assert.fail("pas de compilation") });
  const json = r.json as ResultatRetouche;
  assert.equal(json.moteur, "retouche");
  assert.equal(json.depuisNumero, 7);
  assert.deepEqual(json.passages.map((p) => p.section), ["detailed_description"]);
  assert.deepEqual(appels.map((a) => a.skill), [SKILL_RETOUCHE]);
  assert.ok(appels[0]!.entree.includes("Katara | l'Air"));
});

test("executerH3ir : une retouche invalide est rejouée une fois avec ses défauts, puis échoue sans recompiler", async () => {
  const { d } = deps();
  const mauvaise: SortieRetouche = { ...BONNE_RETOUCHE, sections: SECTIONS_ESSAI };
  const un = depsRetouche([mauvaise, BONNE_RETOUCHE]);
  const r = await executerH3ir({ projectId: 7, entree: { planUuid: "u1", retouche: RETOUCHE } }, OPTIONS(), { ...d, executer: un.executer, lancer: async () => assert.fail("pas de compilation") });
  assert.equal((r.json as ResultatRetouche).moteur, "retouche");
  assert.equal(un.appels.length, 2);
  assert.ok(un.appels[1]!.entree.includes("PROBLEMS TO FIX"));
  const deux = depsRetouche([mauvaise, mauvaise]);
  await assert.rejects(
    () => executerH3ir({ projectId: 7, entree: { planUuid: "u1", retouche: RETOUCHE } }, OPTIONS(), { ...d, executer: deux.executer, lancer: async () => assert.fail("pas de compilation") }),
    /n'est pas valable.*Rien n'a été écrit/,
  );
});

test("executerH3ir : si le skill répond « refonte », la compilation prend le relais", async () => {
  const { d, appels } = deps();
  const sorties = [{ ...BONNE_RETOUCHE, refonte: true, raison: "nouveau lieu", sections: SECTIONS_ESSAI }];
  const executerMixte = (async (skill: string, entree: unknown, options: Record<string, unknown>) => {
    if (skill === SKILL_RETOUCHE) return { json: sorties.shift()!, modele: "gemma", usage: { entree: 100, sortie: 50 } };
    appels.traduction.push({ skill, entree, options });
    return { json: { intent: "Mai enters." }, modele: "gemma", usage: { entree: 10, sortie: 5 } };
  }) as unknown as typeof executerSkill;
  const etapes: string[] = [];
  const r = await executerH3ir({ projectId: 7, entree: { planUuid: "u1", retouche: RETOUCHE } }, { ...OPTIONS(), surEtape: (t) => etapes.push(t) }, { ...d, executer: executerMixte });
  assert.equal((r.json as ResultatH3ir).moteur, "h3ir");
  assert.ok(etapes.some((e) => e.includes("nouveau lieu")));
  assert.equal(appels.traduction[0]!.skill, SKILL_TRADUCTION);
  assert.equal(r.usage.entree, 110, "l'usage de la retouche est compté avec celui de la traduction");
});

test("lireEntreeH3ir : la retouche est gardée si elle est complète, ignorée sinon", () => {
  const e = lireEntreeH3ir({ planUuid: "u", retouche: RETOUCHE });
  assert.equal(e.retouche?.numeroRendu, 7);
  assert.equal(e.retouche?.repliques.length, 1);
  assert.equal(lireEntreeH3ir({ planUuid: "u", retouche: { numeroRendu: 7 } }).retouche, undefined);
});
