import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { FournisseurCompatibleOpenAI } from "./compatibleOpenAI";
import { configLlm, modelePourSkill, nomVariableModele } from "./config";
import { executerSkill, messageDeRenvoi, versMessages } from "./executer";
import { chargerSkill, listerSkills } from "./skills";
import type { TraceAEnregistrer } from "./traces";
import { ErreurLlm } from "./types";
import { compilerSchema, valider } from "./validation";

// ── faux serveur compatible OpenAI ────────────────────────────────────────────

type Corps = { model: string; messages: { role: string; content: string }[]; stream?: boolean; response_format?: unknown; max_tokens?: number };
type Gestionnaire = (corps: Corps, res: ServerResponse, req: IncomingMessage, numero: number) => void;

const serveurs: Server[] = [];
after(() => serveurs.forEach((s) => s.close()));

async function demarrer(gestionnaire: Gestionnaire): Promise<{ url: string; requetes: Corps[] }> {
  const requetes: Corps[] = [];
  const s = createServer((req, res) => {
    let brut = "";
    req.on("data", (c) => (brut += c));
    req.on("end", () => {
      const corps = JSON.parse(brut) as Corps;
      requetes.push(corps);
      gestionnaire(corps, res, req, requetes.length);
    });
  });
  serveurs.push(s);
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, requetes };
}

const reponseJson = (res: ServerResponse, contenu: string, usage = { prompt_tokens: 10, completion_tokens: 5 }, finish = "stop") => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ model: "faux-modele", choices: [{ message: { role: "assistant", content: contenu }, finish_reason: finish }], usage }));
};

const reponseFlux = (res: ServerResponse, morceaux: string[], usage?: { prompt_tokens: number; completion_tokens: number }) => {
  res.setHeader("Content-Type", "text/event-stream");
  for (const m of morceaux) res.write(`data: ${JSON.stringify({ model: "faux-modele", choices: [{ delta: { content: m } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
  if (usage) res.write(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
};

const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["titre", "n"],
  properties: { titre: { type: "string", minLength: 1 }, n: { type: "integer", minimum: 1 } },
} as const;

function fournisseur(url: string, extra: Partial<ConstructorParameters<typeof FournisseurCompatibleOpenAI>[0]> = {}) {
  return new FournisseurCompatibleOpenAI({ url, modele: "faux-modele", delaiMs: 5000, flux: false, ...extra });
}

// ── un skill temporaire, indépendant des vrais ────────────────────────────────

const racine = mkdtempSync(join(tmpdir(), "cadence-llm-"));
after(() => rmSync(racine, { recursive: true, force: true }));
{
  const d = join(racine, "agents", "skills", "demo");
  mkdirSync(join(d, "exemples"), { recursive: true });
  writeFileSync(join(d, "regles.md"), "# Règles\nFais ceci.\n");
  writeFileSync(join(d, "guide-b.md"), "GUIDE B");
  writeFileSync(join(d, "guide-a.md"), "GUIDE A");
  writeFileSync(join(d, "autre.md"), "NE DOIT PAS ENTRER");
  writeFileSync(join(d, "exemples", "2-deux.md"), "EXEMPLE 2");
  writeFileSync(join(d, "exemples", "1-un.md"), "EXEMPLE 1");
  writeFileSync(join(d, "sortie.schema.json"), JSON.stringify(SCHEMA));
}

// ── fournisseur ───────────────────────────────────────────────────────────────

test("fournisseur (sans flux) : texte, usage, json, corps envoyé", async () => {
  const s = await demarrer((_c, res) => reponseJson(res, '{"titre":"ok","n":2}', { prompt_tokens: 42, completion_tokens: 7 }));
  const r = await fournisseur(s.url).generer({
    systeme: "SYS",
    messages: [{ role: "user", content: "bonjour" }],
    schemaSortie: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 123,
  });
  assert.equal(r.texte, '{"titre":"ok","n":2}');
  assert.deepEqual(r.json, { titre: "ok", n: 2 });
  assert.deepEqual(r.usage, { entree: 42, sortie: 7 });
  assert.equal(r.modele, "faux-modele");
  assert.equal(r.arret, "stop");
  const c = s.requetes[0]!;
  assert.equal(c.model, "faux-modele");
  assert.deepEqual(c.messages, [{ role: "system", content: "SYS" }, { role: "user", content: "bonjour" }]);
  assert.equal(c.max_tokens, 123);
  assert.equal(c.stream, false);
  assert.deepEqual((c.response_format as { type: string }).type, "json_schema");
});

test("fournisseur (flux SSE) : assemble les morceaux, usage final, progression", async () => {
  const s = await demarrer((_c, res) => reponseFlux(res, ['{"titre":', '"flux"', ',"n":3}'], { prompt_tokens: 20, completion_tokens: 9 }));
  const progres: number[] = [];
  const r = await fournisseur(s.url, { flux: true }).generer({
    systeme: "S",
    messages: [{ role: "user", content: "x" }],
    schemaSortie: SCHEMA as unknown as Record<string, unknown>,
    surProgres: (n) => progres.push(n),
  });
  assert.deepEqual(r.json, { titre: "flux", n: 3 });
  assert.deepEqual(r.usage, { entree: 20, sortie: 9 });
  assert.deepEqual(progres, [1, 2, 3]);
  assert.equal(s.requetes[0]!.stream, true);
});

test("fournisseur : flux sans bloc d'usage → approximation par les morceaux", async () => {
  const s = await demarrer((_c, res) => reponseFlux(res, ["a", "b"]));
  const r = await fournisseur(s.url, { flux: true }).generer({ systeme: "S", messages: [{ role: "user", content: "x" }] });
  assert.equal(r.texte, "ab");
  assert.equal(r.usage.sortie, 2);
  assert.equal(r.json, undefined);
});

test("fournisseur : serveur injoignable → ErreurLlm « injoignable »", async () => {
  const s = await demarrer(() => undefined);
  const url = s.url;
  await new Promise<void>((ok) => serveurs.pop()!.close(() => ok()));
  await assert.rejects(
    fournisseur(url).generer({ systeme: "S", messages: [{ role: "user", content: "x" }] }),
    (e: unknown) => e instanceof ErreurLlm && e.code === "injoignable",
  );
});

test("fournisseur : modèle inconnu → « modele_absent » ; autre statut → « http »", async () => {
  const s = await demarrer((c, res) => {
    res.statusCode = c.model === "inconnu" ? 400 : 500;
    res.end(c.model === "inconnu" ? '{"error":"could not find real modelID for inconnu (unknown model)"}' : "boum");
  });
  await assert.rejects(
    fournisseur(s.url).generer({ systeme: "S", messages: [{ role: "user", content: "x" }], modele: "inconnu" }),
    (e: unknown) => e instanceof ErreurLlm && e.code === "modele_absent",
  );
  await assert.rejects(
    fournisseur(s.url).generer({ systeme: "S", messages: [{ role: "user", content: "x" }] }),
    (e: unknown) => e instanceof ErreurLlm && e.code === "http" && /500/.test(e.message),
  );
});

test("fournisseur : délai dépassé → « delai »", async () => {
  const s = await demarrer(() => undefined); // ne répond jamais
  await assert.rejects(
    fournisseur(s.url, { delaiMs: 150 }).generer({ systeme: "S", messages: [{ role: "user", content: "x" }] }),
    (e: unknown) => e instanceof ErreurLlm && e.code === "delai",
  );
});

test("fournisseur : annulation en cours de flux → « interrompu », et la connexion est coupée", async () => {
  let coupee: () => void;
  const connexionCoupee = new Promise<void>((ok) => (coupee = ok));
  const s = await demarrer((_c, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "début" } }] })}\n\n`);
    res.on("close", () => coupee());
  });
  const ctl = new AbortController();
  const p = fournisseur(s.url, { flux: true }).generer({
    systeme: "S",
    messages: [{ role: "user", content: "x" }],
    signal: ctl.signal,
    surProgres: () => ctl.abort(),
  });
  await assert.rejects(p, (e: unknown) => e instanceof ErreurLlm && e.code === "interrompu");
  await Promise.race([connexionCoupee, new Promise((_, ko) => setTimeout(() => ko(new Error("connexion non coupée")), 2000))]);
});

// ── validation ────────────────────────────────────────────────────────────────

test("validation : erreurs lisibles, schéma mis en cache", () => {
  const schema = SCHEMA as unknown as Record<string, unknown>;
  assert.deepEqual(valider(schema, { titre: "a", n: 1 }), { ok: true });
  const v = valider(schema, { titre: "", extra: 1 });
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.ok(v.erreurs.some((e) => /extra/.test(e)), v.erreurs.join(" | "));
    assert.ok(v.erreurs.some((e) => /n/.test(e)));
  }
  assert.equal(compilerSchema(schema), compilerSchema(schema));
});

// ── chargeur de skills ────────────────────────────────────────────────────────

test("chargeur : ordre règles → guides → exemples → contrat, fichiers étrangers ignorés", () => {
  const s = chargerSkill("demo", racine);
  const ordre = ["# Règles", "GUIDE A", "GUIDE B", "EXEMPLE 1", "EXEMPLE 2", "contrat de sortie"].map((m) => s.systeme.indexOf(m));
  assert.ok(ordre.every((i) => i >= 0), JSON.stringify(ordre));
  assert.deepEqual([...ordre].sort((a, b) => a - b), ordre);
  assert.ok(!s.systeme.includes("NE DOIT PAS ENTRER"));
  assert.ok(s.systeme.includes('"required":["titre","n"]'), "le schéma figure dans le prompt, en JSON compact");
  assert.deepEqual(s.schema, SCHEMA);
  assert.equal(s.fichiers.at(-1), "agents/skills/demo/sortie.schema.json");
});

test("chargeur : nom invalide, skill absent, fichiers obligatoires", () => {
  assert.throws(() => chargerSkill("../etc", racine), /invalide/);
  assert.throws(() => chargerSkill("absent", racine), /introuvable/);
  mkdirSync(join(racine, "agents", "skills", "sans-schema"), { recursive: true });
  writeFileSync(join(racine, "agents", "skills", "sans-schema", "regles.md"), "x");
  assert.throws(() => chargerSkill("sans-schema", racine), /sortie\.schema\.json manquant/);
});

test("chargeur : les skills réels s'assemblent et leur schéma se compile", () => {
  const noms = listerSkills();
  assert.deepEqual(noms, ["brief-projet", "iteration-plan", "plan-h3", "prompt-asset", "prompt-voix", "scenario-episode"]);
  for (const nom of noms) {
    const s = chargerSkill(nom);
    assert.ok(s.caracteres > 2000, nom);
    assert.ok(s.systeme.includes("=== contrat de sortie"), nom);
    assert.ok(compilerSchema(s.schema), nom);
    assert.equal(s.jetonsEstimes, Math.ceil(s.caracteres / 3.5));
  }
  const h3 = chargerSkill("plan-h3");
  assert.ok(h3.fichiers.some((f) => f.endsWith("h3-lexique-corrections.md")), "le lexique partagé est inclus");
  assert.ok(h3.fichiers.filter((f) => f.includes("/exemples/")).length === 4);
});

// ── configuration ─────────────────────────────────────────────────────────────

test("configuration : défauts, surcharge par skill, fournisseur inconnu refusé", () => {
  const c = configLlm({ LLM_LOCAL_URL: "http://h:1/", LLM_LOCAL_MODELE: "m1", LLM_TIMEOUT_MS: "1234" });
  assert.deepEqual(c, { fournisseur: "local", url: "http://h:1", modeleParDefaut: "m1", delaiMs: 1234, flux: true });
  assert.equal(configLlm({}).modeleParDefaut, "gemma4-26b-A4B");
  assert.equal(configLlm({ LLM_FLUX: "0" }).flux, false);
  assert.equal(nomVariableModele("plan-h3"), "LLM_MODELE_PLAN_H3");
  assert.equal(modelePourSkill("plan-h3", { LLM_MODELE_PLAN_H3: "qwen", LLM_LOCAL_MODELE: "m1" }), "qwen");
  assert.equal(modelePourSkill("brief-projet", { LLM_MODELE_PLAN_H3: "qwen", LLM_LOCAL_MODELE: "m1" }), "m1");
  assert.throws(() => configLlm({ LLM_FOURNISSEUR: "dev" }), /inconnu/);
});

// ── executerSkill ─────────────────────────────────────────────────────────────

const enregistreur = () => {
  const traces: TraceAEnregistrer[] = [];
  return { traces, enregistrer: async (t: TraceAEnregistrer) => void traces.push(t) };
};

test("executerSkill : succès, trace « ok », schéma envoyé au serveur", async () => {
  const s = await demarrer((_c, res) => reponseJson(res, '{"titre":"T","n":4}', { prompt_tokens: 100, completion_tokens: 8 }));
  const { traces, enregistrer } = enregistreur();
  const r = await executerSkill("demo", { pitch: "x" }, { racine, fournisseur: fournisseur(s.url), enregistrer, projectId: 7, env: {} });
  assert.deepEqual(r.json, { titre: "T", n: 4 });
  assert.equal(r.renvois, 0);
  assert.deepEqual(r.usage, { entree: 100, sortie: 8 });
  const c = s.requetes[0]!;
  assert.match(c.messages[0]!.content, /=== demo : règles ===/);
  assert.match(c.messages[1]!.content, /"pitch": "x"/);
  assert.ok(c.response_format);
  assert.equal(traces.length, 1);
  assert.equal(traces[0]!.statut, "ok");
  assert.equal(traces[0]!.projectId, 7);
  assert.deepEqual(traces[0]!.json, { titre: "T", n: 4 });
  assert.match(traces[0]!.systemeEmpreinte, /^[0-9a-f]{64}$/);
});

test("executerSkill : sortie invalide puis corrigée au renvoi (usage cumulé, erreurs renvoyées)", async () => {
  const s = await demarrer((_c, res, _r, n) =>
    n === 1 ? reponseJson(res, '{"titre":"T"}', { prompt_tokens: 50, completion_tokens: 3 }) : reponseJson(res, '{"titre":"T","n":1}', { prompt_tokens: 70, completion_tokens: 6 }),
  );
  const { traces, enregistrer } = enregistreur();
  const r = await executerSkill("demo", "entrée", { racine, fournisseur: fournisseur(s.url), enregistrer, env: {} });
  assert.deepEqual(r.json, { titre: "T", n: 1 });
  assert.equal(r.renvois, 1);
  assert.deepEqual(r.usage, { entree: 120, sortie: 9 });
  const second = s.requetes[1]!.messages;
  assert.equal(second.at(-2)!.role, "assistant");
  assert.equal(second.at(-2)!.content, '{"titre":"T"}');
  assert.match(second.at(-1)!.content, /ne respecte pas le schéma/);
  assert.match(second.at(-1)!.content, /\bn\b/);
  assert.equal(traces[0]!.statut, "ok");
  assert.equal(traces[0]!.renvois, 1);
});

test("executerSkill : invalide deux fois → échec explicite, rien de « réparé », trace « invalide »", async () => {
  const s = await demarrer((_c, res) => reponseJson(res, '{"titre":"T","n":0}'));
  const { traces, enregistrer } = enregistreur();
  await assert.rejects(
    executerSkill("demo", "e", { racine, fournisseur: fournisseur(s.url), enregistrer, env: {} }),
    (e: unknown) => e instanceof ErreurLlm && e.code === "sortie_invalide" && Array.isArray((e.details as { erreurs: string[] }).erreurs),
  );
  assert.equal(s.requetes.length, 2);
  assert.equal(traces[0]!.statut, "invalide");
  assert.equal(traces[0]!.json, null);
  assert.ok(traces[0]!.erreursValidation!.length > 0);
  assert.equal(traces[0]!.sortieBrute, '{"titre":"T","n":0}');
});

test("executerSkill : JSON illisible, sortie tronquée, maxRenvois = 0", async () => {
  const s = await demarrer((_c, res) => reponseJson(res, '{"titre":"T","n":', undefined, "length"));
  await assert.rejects(
    executerSkill("demo", "e", { racine, fournisseur: fournisseur(s.url), enregistrer: null, maxRenvois: 0, env: {} }),
    (e: unknown) => e instanceof ErreurLlm && e.code === "sortie_invalide" && /tronquée/.test(e.message),
  );
  assert.equal(s.requetes.length, 1);
});

test("executerSkill : serveur injoignable → trace « echoue » ; annulation → « interrompu »", async () => {
  const mort = await demarrer(() => undefined);
  const urlMorte = mort.url;
  await new Promise<void>((ok) => serveurs.pop()!.close(() => ok()));
  const a = enregistreur();
  await assert.rejects(
    executerSkill("demo", "e", { racine, fournisseur: fournisseur(urlMorte), enregistrer: a.enregistrer, env: {} }),
    (e: unknown) => e instanceof ErreurLlm && e.code === "injoignable",
  );
  assert.equal(a.traces[0]!.statut, "echoue");
  assert.match(a.traces[0]!.erreur!, /injoignable/);

  const muet = await demarrer(() => undefined);
  const ctl = new AbortController();
  const b = enregistreur();
  const p = executerSkill("demo", "e", { racine, fournisseur: fournisseur(muet.url), enregistrer: b.enregistrer, signal: ctl.signal, env: {} });
  setTimeout(() => ctl.abort(), 100);
  await assert.rejects(p, (e: unknown) => e instanceof ErreurLlm && e.code === "interrompu");
  assert.equal(b.traces[0]!.statut, "interrompu");
});

test("executerSkill : une trace qui ne s'écrit pas ne masque pas le résultat ; contrainte désactivable", async () => {
  const s = await demarrer((_c, res) => reponseJson(res, '{"titre":"T","n":1}'));
  const r = await executerSkill("demo", "e", {
    racine,
    fournisseur: fournisseur(s.url),
    enregistrer: async () => {
      throw new Error("base éteinte");
    },
    contrainte: false,
    env: {},
  });
  assert.deepEqual(r.json, { titre: "T", n: 1 });
  assert.equal(s.requetes[0]!.response_format, undefined);
});

test("versMessages / messageDeRenvoi", () => {
  assert.deepEqual(versMessages("a"), [{ role: "user", content: "a" }]);
  assert.deepEqual(versMessages([{ role: "user", content: "b" }]), [{ role: "user", content: "b" }]);
  assert.equal(versMessages({ x: 1 })[0]!.content, '{\n  "x": 1\n}');
  assert.match(messageDeRenvoi(["/n : requis"]), /- \/n : requis/);
});
