import assert from "node:assert/strict";
import { test } from "node:test";
import type { BriefH3ir } from "./brief";
import { compilerAvecRelances, ErreurCompilation, jugerReponse, pythonH3ir, reglagesH3ir, type EnveloppeH3ir, type LanceurPython, type ReponsePython } from "./compiler";

const BRIEF: BriefH3ir = { intent: "A woman rides a bike.", assets: [], seconds: 8, megapixels: 0.4, dialogue: [], effort: "standard", seed: 100 };
const REGLAGES = { python: "py", script: "s.py", delaiMs: 1000, env: { H3IR_LLM_MODEL: "m" } };

const bonne = (): ReponsePython => ({
  http: 201,
  fichiers: { abc: "/m/a.png" },
  enveloppe: { status: "ready", ir: { mode: "ref2va", prompt: "p", sections: {}, manifest: [] } },
});
const reponse = (rep: ReponsePython) => JSON.stringify(rep);

/** A launcher that returns the given replies, in order, and notes the seeds received. */
function lanceur(reponses: (ReponsePython | Error)[]) {
  const seeds: number[] = [];
  const lancer: LanceurPython = async (_py, _script, entree) => {
    seeds.push((JSON.parse(entree) as { brief: BriefH3ir }).brief.seed!);
    const r = reponses.shift()!;
    if (r instanceof Error) throw r;
    return reponse(r);
  };
  return { lancer, seeds };
}

test("jugerReponse : réussite = 201, ready, Ref2VA", () => {
  assert.deepEqual(jugerReponse(bonne()), { ok: true });
});

test("jugerReponse : brouillon de repli et compilation invalide se relancent ; question, mauvais mode, refus et LLM absent non", () => {
  const degrade: ReponsePython = { http: 201, enveloppe: { status: "degraded", fallback_reason: "x", ir: { mode: "ref2va", prompt: "p" } } };
  assert.equal((jugerReponse(degrade) as { relancer: boolean }).relancer, true);
  const invalide: ReponsePython = { http: 422, enveloppe: { status: "invalid", errors: [{ rule: "T6", message: "m" }] } };
  const v = jugerReponse(invalide) as { relancer: boolean; raison: string };
  assert.equal(v.relancer, true);
  assert.match(v.raison, /T6/);
  assert.equal((jugerReponse({ http: 502, enveloppe: { detail: { code: "llm-error", message: "boom" } } }) as { relancer: boolean }).relancer, true);

  const question: ReponsePython = { http: 201, enveloppe: { status: "needs_input", ir: { mode: "ref2va" } } };
  assert.equal((jugerReponse(question) as { relancer: boolean }).relancer, false);
  const mauvaisMode: ReponsePython = { http: 201, enveloppe: { status: "ready", ir: { mode: "t2va", prompt: "p" } } };
  assert.match((jugerReponse(mauvaisMode) as { raison: string }).raison, /Ref2VA/);
  const refus: ReponsePython = { http: 422, enveloppe: { detail: { code: "over-capacity", message: "trop d'images" } } };
  const r = jugerReponse(refus) as { relancer: boolean; raison: string };
  assert.equal(r.relancer, false);
  assert.match(r.raison, /over-capacity : trop d'images/);
  assert.equal((jugerReponse({ http: 503, enveloppe: { detail: { code: "llm-unavailable", message: "x" } } }) as { relancer: boolean }).relancer, false);
  assert.match((jugerReponse({ http: 0, erreur: "ImportError: h3ir" }) as { raison: string }).raison, /ImportError/);
});

test("compilerAvecRelances : réussit du premier coup avec la seed du plan, et rend les fichiers", async () => {
  const { lancer, seeds } = lanceur([bonne()]);
  const r = await compilerAvecRelances(BRIEF, { reglages: REGLAGES, lancer });
  assert.deepEqual(seeds, [100]);
  assert.equal(r.seedUtilisee, 100);
  assert.deepEqual(r.fichiers, { abc: "/m/a.png" });
  assert.deepEqual(r.tentatives.map((t) => t.issue), ["ok"]);
});

test("compilerAvecRelances : un brouillon de repli relance avec seed+1, puis réussit", async () => {
  const degrade: ReponsePython = { http: 201, enveloppe: { status: "degraded", fallback_reason: "prose", ir: { mode: "ref2va", prompt: "p" } } as EnveloppeH3ir };
  const { lancer, seeds } = lanceur([degrade, bonne()]);
  const vues: string[] = [];
  const r = await compilerAvecRelances(BRIEF, { reglages: REGLAGES, lancer, surTentative: (n, sur, seed) => vues.push(`${n}/${sur}:${seed}`) });
  assert.deepEqual(seeds, [100, 101]);
  assert.equal(r.seedUtilisee, 101);
  assert.deepEqual(r.tentatives.map((t) => t.issue), ["relance", "ok"]);
  assert.deepEqual(vues, ["1/3:100", "2/3:101"]);
});

test("compilerAvecRelances : trois échecs → message clair avec les raisons, jamais de repli", async () => {
  const degrade: ReponsePython = { http: 201, enveloppe: { status: "degraded", fallback_reason: "prose", ir: { mode: "ref2va", prompt: "texte rejeté" } } as EnveloppeH3ir };
  const { lancer, seeds } = lanceur([degrade, degrade, degrade]);
  await assert.rejects(
    () => compilerAvecRelances(BRIEF, { reglages: REGLAGES, lancer }),
    (e: unknown) => {
      assert.ok(e instanceof ErreurCompilation);
      assert.match(e.message, /après 3 essais/);
      assert.match(e.message, /Réessaie, ou change la description/);
      assert.ok(!e.message.includes("texte rejeté"), "le texte rejeté n'est jamais proposé");
      assert.deepEqual(e.tentatives.map((t) => t.issue), ["relance", "relance", "echec"]);
      return true;
    },
  );
  assert.deepEqual(seeds, [100, 101, 102]);
});

test("compilerAvecRelances : un refus de la demande s'arrête au premier essai", async () => {
  const refus: ReponsePython = { http: 422, enveloppe: { detail: { code: "intent-empty", message: "vide" } } };
  const { lancer, seeds } = lanceur([refus, bonne()]);
  await assert.rejects(() => compilerAvecRelances(BRIEF, { reglages: REGLAGES, lancer }), /intent-empty : vide/);
  assert.deepEqual(seeds, [100]);
});

test("compilerAvecRelances : annulation avant l'essai, ou lancée par le lanceur, remonte telle quelle", async () => {
  const { lancer, seeds } = lanceur([bonne()]);
  const c = new AbortController();
  c.abort();
  await assert.rejects(() => compilerAvecRelances(BRIEF, { reglages: REGLAGES, lancer, signal: c.signal }), /Annulée/);
  assert.deepEqual(seeds, []);
  const { lancer: l2 } = lanceur([new ErreurCompilation("Annulée.")]);
  await assert.rejects(() => compilerAvecRelances(BRIEF, { reglages: REGLAGES, lancer: l2 }), /Annulée/);
});

test("compilerAvecRelances : une sortie qui n'est pas du JSON est une erreur dite", async () => {
  const lancer: LanceurPython = async () => "pas du json";
  await assert.rejects(() => compilerAvecRelances(BRIEF, { reglages: REGLAGES, lancer }), /Réponse illisible/);
});

test("pythonH3ir / reglagesH3ir : H3IR_PYTHON prime, le venv du labo sert de repli, sinon message qui dit quoi régler", () => {
  assert.equal(pythonH3ir({ H3IR_PYTHON: "/opt/h3ir/bin/python" }, () => false), "/opt/h3ir/bin/python");
  assert.match(pythonH3ir({}, (c) => c.endsWith("python.exe")), /venv-h3ir/);
  assert.throws(() => pythonH3ir({}, () => false), /renseigne H3IR_PYTHON/);

  const r = reglagesH3ir("gemma", { H3IR_PYTHON: "py", LLM_LOCAL_URL: "http://llm:8080/", H3IR_STATE_DIR: "/tmp/h3ir" });
  assert.equal(r.env.H3IR_LLM_URL, "http://llm:8080/v1");
  assert.equal(r.env.H3IR_LLM_MODEL, "gemma");
  assert.equal(r.env.H3IR_GUIDED_DECODING, "1");
  assert.equal(r.env.H3IR_ALLOW_ASSET_PATHS, "1");
  assert.equal(r.env.H3IR_STATE_DIR, "/tmp/h3ir");
  assert.equal(reglagesH3ir("g", { H3IR_PYTHON: "py", H3IR_LLM_URL: "http://autre/v1" }).env.H3IR_LLM_URL, "http://autre/v1");
});
