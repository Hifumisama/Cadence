import assert from "node:assert/strict";
import { test } from "node:test";
import { messagesSansImages, type MessageLlm, type PartieContenu } from "../lib/llm/types";
import { ErreurPlanche, type Planche } from "../lib/planche-vignettes";
import { preparerEntree } from "./agents/preparation";

// La préparation de l'entrée d'iteration-plan À L'EXÉCUTION : la planche est reconstruite depuis le descripteur
// (jamais d'images dans agent_runs.entree), la durée réelle est mesurée, un échec est une erreur claire.

const entreeStockee = {
  plan: { titre: "Le couloir", dureeVoulueSecondes: 6 },
  promptActuel: { summary: "x" },
  references: [],
  retourVisionnage: "le fond défile",
  planche: { jobId: 3, cheminSortie: "plans/9/rendu.mp4", maxVignettes: 15 },
};
const run = (entree: unknown) => ({ skill: "iteration-plan", entree }) as never;

const planche: Planche = {
  dureeSecondes: 6.041,
  largeur: 384,
  vignettes: [0, 1, 2].map((i) => ({ instantSecondes: i, imageBase64: Buffer.from(`jpeg${i}`).toString("base64") })),
};

test("iteration-plan : planche reconstruite, durée mesurée, images hors de l'entrée stockée", async () => {
  let vu: { chemin: string; max: number } | null = null;
  const p = await preparerEntree(run(entreeStockee), {
    planche: async (chemin, max) => {
      vu = { chemin, max };
      return planche;
    },
  });
  assert.ok(vu!.chemin.replace(/\\/g, "/").endsWith("plans/9/rendu.mp4"));
  assert.equal(vu!.max, 15);
  const messages = p.entree as MessageLlm[];
  assert.equal(messages.length, 1);
  const parties = messages[0]!.content as PartieContenu[];
  assert.equal(parties.filter((x) => x.type === "image_url").length, 3);
  const texte = JSON.parse((parties[0] as { text: string }).text);
  assert.equal(texte.planche, undefined, "le descripteur ne part pas au modèle");
  assert.deepEqual(texte.rendu, { dureeVoulueSecondes: 6, dureeReelleSecondes: 6.04, ecartSecondes: 0.04, dureesCoherentes: true, nbVignettes: 3 });
  assert.equal((p.controle as { rendu: { dureeReelleSecondes: number } }).rendu.dureeReelleSecondes, 6.04);
  assert.deepEqual(p.execution, { dureeReelleSecondes: 6.04, nbVignettes: 3 });
  assert.ok(!JSON.stringify(entreeStockee).includes("base64"));
  assert.ok(!JSON.stringify(messagesSansImages(messages)).includes(planche.vignettes[0]!.imageBase64), "la trace ne garde pas les images");
});

test("iteration-plan : rendu disparu, ffmpeg absent, planche vide → erreur claire", async () => {
  await assert.rejects(preparerEntree(run({ ...entreeStockee, planche: { jobId: 1, cheminSortie: "plans/0/nexistepas-e2e.mp4" } })), /introuvable sur le stockage/);
  await assert.rejects(
    preparerEntree(run(entreeStockee), {
      planche: async () => {
        throw new ErreurPlanche("introuvable", "ffmpeg introuvable (« ffmpeg ») : installe-le ou renseigne FFMPEG_PATH.");
      },
    }),
    /Planche de vignettes impossible : ffmpeg introuvable.*FFMPEG_PATH/,
  );
  await assert.rejects(preparerEntree(run(entreeStockee), { planche: async () => ({ ...planche, vignettes: [] }) }), /vide/);
  await assert.rejects(preparerEntree(run({ ...entreeStockee, planche: undefined })), /descripteur/);
});

test("les autres skills : l'entrée stockée part telle quelle", async () => {
  const e = { plan: { titre: "x" } };
  const p = await preparerEntree({ skill: "plan-h3", entree: e } as never);
  assert.equal(p.entree, e);
  assert.equal(p.controle, e);
});

// ── conversation d'entrée : la liste « reste à définir » ───────────────────────────────

import { briefPretApresTour, resteADefinirDe } from "./agents/postTraitement";

test("resteADefinirDe : phrases courtes, sans vide ni doublon, plafonnées", () => {
  assert.deepEqual(resteADefinirDe({ resteADefinir: ["  Choisir le style ", "", "Choisir le style", 3, "Durée"] }), ["Choisir le style", "Durée"]);
  assert.deepEqual(resteADefinirDe({}), []);
  assert.equal(resteADefinirDe({ resteADefinir: Array.from({ length: 30 }, (_, i) => `q${i}`) }).length, 12);
});

test("briefPretApresTour : « prêt » = de quoi écrire une première version, même s'il reste des questions", () => {
  assert.equal(briefPretApresTour({ briefPret: true, resteADefinir: [] }), true);
  assert.equal(briefPretApresTour({ briefPret: true, resteADefinir: ["Le style"] }), true);
  assert.equal(briefPretApresTour({ briefPret: false, resteADefinir: [] }), false);
  assert.equal(briefPretApresTour({ briefPret: true }), true);
});
