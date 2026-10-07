import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAINE_GENRE, domaineAliberer, domaineDe } from "../lib/gpu";
import { libererAvant, type Liberateurs } from "./gpu";
import { decharger, decoderListeModeles, decoderModelesCharges, listerModeles, llmJoignable, modelesCharges } from "./llamaSwap";

test("domaines : image et vidéo partagent ComfyUI, le LLM a le sien", () => {
  assert.equal(domaineDe("image"), "comfyui");
  assert.equal(domaineDe("video"), "comfyui");
  assert.equal(domaineDe("llm"), "llm");
  assert.deepEqual(Object.keys(DOMAINE_GENRE).sort(), ["image", "llm", "video"]);
});

test("libération : même domaine = rien ; changement = on décharge l'AUTRE côté ; inconnu = par prudence", () => {
  assert.equal(domaineAliberer("comfyui", "comfyui"), null);
  assert.equal(domaineAliberer("llm", "llm"), null);
  assert.equal(domaineAliberer("comfyui", "llm"), "comfyui");
  assert.equal(domaineAliberer("llm", "comfyui"), "llm");
  assert.equal(domaineAliberer(null, "llm"), "comfyui");
  assert.equal(domaineAliberer(null, "comfyui"), "llm");
});

function faux(opts: { comfyui?: () => Promise<boolean>; llm?: () => Promise<{ ok: boolean; detail: string }> } = {}) {
  const appels: string[] = [];
  const lib: Liberateurs = {
    comfyui: opts.comfyui ?? (async () => (appels.push("free"), true)),
    llm: opts.llm ?? (async () => (appels.push("unload"), { ok: true, detail: "200 OK" })),
  };
  return { appels, lib };
}

test("libererAvant : ComfyUI → LLM appelle /free ; LLM → ComfyUI appelle /unload ; même domaine n'appelle rien", async () => {
  const { appels, lib } = faux();
  const journal: string[] = [];
  assert.equal(await libererAvant("comfyui", "llm", lib, (m) => journal.push(m)), "comfyui");
  assert.equal(await libererAvant("llm", "comfyui", lib, (m) => journal.push(m)), "llm");
  assert.equal(await libererAvant("llm", "llm", lib, (m) => journal.push(m)), null);
  assert.deepEqual(appels, ["free", "unload"]);
  assert.equal(journal.length, 2);
});

test("libererAvant : un échec ou une exception est journalisé et ne lève jamais", async () => {
  const journal: string[] = [];
  const refus = faux({ comfyui: async () => false });
  assert.equal(await libererAvant("llm", "llm", refus.lib, (m) => journal.push(m)), null);
  assert.equal(await libererAvant("comfyui", "llm", refus.lib, (m) => journal.push(m)), "comfyui");
  const plante = faux({ llm: async () => { throw new Error("boum"); } });
  assert.equal(await libererAvant("comfyui", "comfyui", plante.lib, (m) => journal.push(m)), null);
  assert.equal(await libererAvant("llm", "comfyui", plante.lib, (m) => journal.push(m)), "llm");
  assert.ok(journal.some((m) => /NON libérée/.test(m)));
  assert.ok(journal.some((m) => /impossible \(boum\)/.test(m)));
});

test("libererAvant : un serveur qui ne répond pas ne bloque pas le worker (délai borné)", async () => {
  const lent = faux({ comfyui: () => new Promise(() => undefined) });
  const journal: string[] = [];
  const debut = Date.now();
  await libererAvant("llm", "llm", lent.lib, (m) => journal.push(m), 50);
  assert.equal(await libererAvant("comfyui", "llm", lent.lib, (m) => journal.push(m), 50), "comfyui");
  assert.ok(Date.now() - debut < 2000);
  assert.ok(journal.some((m) => /délai/.test(m)));
});

test("libererAvant : au démarrage (précédent inconnu) on libère l'autre côté", async () => {
  const { appels, lib } = faux();
  await libererAvant(null, "llm", lib, () => undefined);
  await libererAvant(null, "comfyui", lib, () => undefined);
  assert.deepEqual(appels, ["free", "unload"]);
});

// --- llama-swap : décodage tolérant et appels « au mieux » (fetch injecté)

test("llama-swap : /running décodé avec ou sans enveloppe, null si illisible", () => {
  assert.deepEqual(decoderModelesCharges({ running: [{ model: "gemma4-26b-A4B", state: "ready" }] }), ["gemma4-26b-A4B"]);
  assert.deepEqual(decoderModelesCharges({ running: [] }), []);
  assert.deepEqual(decoderModelesCharges(["a", "b"]), ["a", "b"]);
  assert.equal(decoderModelesCharges({ autre: 1 }), null);
  assert.equal(decoderModelesCharges(null), null);
});

const reponse = (corps: string, status = 200) => async () => new Response(corps, { status });

test("llama-swap : joignable / décharger / modèles chargés, y compris quand le serveur est éteint", async () => {
  assert.equal(await llmJoignable("http://x", reponse("OK")), true);
  assert.equal(await llmJoignable("http://x", reponse("nope", 500)), false);
  assert.equal(await llmJoignable("http://x", async () => { throw new Error("ECONNREFUSED"); }), false);

  assert.deepEqual(await decharger("http://x", reponse("OK")), { ok: true, detail: "200 OK" });
  assert.equal((await decharger("http://x", reponse("erreur", 500))).ok, false);
  const eteint = await decharger("http://x", async () => { throw new Error("ECONNREFUSED"); });
  assert.equal(eteint.ok, false);
  assert.match(eteint.detail, /ECONNREFUSED/);

  assert.deepEqual(await modelesCharges("http://x", reponse(JSON.stringify({ running: [{ model: "m" }] }))), ["m"]);
  assert.equal(await modelesCharges("http://x", reponse("pas du json")), null);
});

test("llama-swap : liste des modèles déclarés (/v1/models), triée, dédoublonnée, tolérante", async () => {
  assert.deepEqual(decoderListeModeles({ object: "list", data: [{ id: "qwen" }, { id: "gemma" }, { id: "qwen" }] }), ["gemma", "qwen"]);
  assert.deepEqual(decoderListeModeles(["b", "a"]), ["a", "b"]);
  assert.deepEqual(decoderListeModeles({ data: [{ id: " " }, { nom: "x" }, null] }), []);
  assert.equal(decoderListeModeles({ erreur: "x" }), null);
  assert.equal(decoderListeModeles(null), null);

  assert.deepEqual(await listerModeles("http://x", reponse(JSON.stringify({ data: [{ id: "m" }] }))), ["m"]);
  assert.equal(await listerModeles("http://x", reponse("pas du json")), null);
  assert.equal(await listerModeles("http://x", reponse("erreur", 500)), null);
  assert.equal(await listerModeles("http://x", async () => { throw new Error("ECONNREFUSED"); }), null);
});
